// infra/lib/auth-stack.ts
//
// Identité et autorisation. Remplace l'authentification maison
// (bcrypt + JWT signé à la main) par un pool d'utilisateurs Cognito.

import { Stack, StackProps, Duration, CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import {
  UserPool,
  UserPoolClient,
  UserPoolDomain,
  CfnUserPoolGroup,
  AccountRecovery,
  StringAttribute,
  FeaturePlan,
  OAuthScope,
  Mfa,
} from "aws-cdk-lib/aws-cognito";
import { Function as LambdaFunction, Runtime, Code } from "aws-cdk-lib/aws-lambda";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { ConfigEtape, nommer } from "./config/etapes";

export interface AuthStackProps extends StackProps {
  readonly etape: ConfigEtape;
}

export class AuthStack extends Stack {
  public readonly pool: UserPool;
  public readonly clientWeb: UserPoolClient;
  public readonly domaine: UserPoolDomain;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { etape } = props;
    const estProd = etape.nom === "prod";

    // ── Déclencheur d'après-confirmation ──────────────────────────
    // Toute inscription libre place l'utilisateur dans le groupe CANDIDAT.
    // Les comptes RH et EMPLOYE sont créés par l'administration, jamais
    // par inscription publique.
    const rattachementGroupe = new LambdaFunction(this, "RattachementGroupe", {
      functionName: nommer(etape.nom, "auth-rattachement-groupe"),
      runtime: Runtime.NODEJS_22_X,
      handler: "index.handler",
      timeout: Duration.seconds(10),
      memorySize: 128,
            logGroup: new LogGroup(this, "JournalRattachementGroupe", {
        logGroupName: `/aws/lambda/${nommer(etape.nom, "auth-rattachement-groupe")}`,
        retention: etape.retentionJournaux,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      code: Code.fromInline(`
const { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } =
  require("@aws-sdk/client-cognito-identity-provider");

const cognito = new CognitoIdentityProviderClient({});

exports.handler = async (event) => {
  // Ne s'applique qu'aux inscriptions libres. Les comptes créés par
  // l'administration reçoivent leur groupe au moment de la création.
  if (event.triggerSource !== "PostConfirmation_ConfirmSignUp") return event;

  await cognito.send(new AdminAddUserToGroupCommand({
    UserPoolId: event.userPoolId,
    Username: event.userName,
    GroupName: "CANDIDAT",
  }));

  console.log("Rattachement au groupe CANDIDAT :", event.userName);
  return event;
};
      `),
    });

    // ── Pool d'utilisateurs ───────────────────────────────────────
    this.pool = new UserPool(this, "PoolUtilisateurs", {
      userPoolName: nommer(etape.nom, "users"),

      // Essentials : même offre gratuite que Lite (10 000 utilisateurs
      // actifs mensuels, sans expiration), mais ajoute la page de
      // connexion personnalisable et la rotation des jetons de
      // rafraîchissement.
      featurePlan: FeaturePlan.ESSENTIALS,

      // Ouvert : un candidat crée son compte depuis le site carrière
      selfSignUpEnabled: true,

      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },

      standardAttributes: {
        email: { required: true, mutable: true },
        givenName: { required: true, mutable: true },
        familyName: { required: true, mutable: true },
        phoneNumber: { required: false, mutable: true },
      },

      // Relie le compte Cognito à la fiche employé existante.
      // Évite de remapper les identifiants déjà référencés par les
      // pointages, les congés et les bulletins de paie.
      customAttributes: {
        employeId: new StringAttribute({ mutable: true }),
        departement: new StringAttribute({ mutable: true }),
      },

      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(7),
      },

      mfa: Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },

      accountRecovery: AccountRecovery.EMAIL_ONLY,

      userVerification: {
        emailSubject: "TERRA HR — confirmez votre adresse",
        emailBody:
          "Bienvenue sur TERRA HR.\n\nVotre code de confirmation : {####}",
      },

      lambdaTriggers: { postConfirmation: rattachementGroupe },

      deletionProtection: estProd,
      removalPolicy: estProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

        // L'ARN est construit littéralement plutôt que référencé : une
    // référence à this.pool créerait une dépendance circulaire, puisque
    // le pool dépend déjà de cette fonction via son déclencheur.
    rattachementGroupe.addToRolePolicy(
      new PolicyStatement({
        actions: ["cognito-idp:AdminAddUserToGroup"],
        resources: [
          `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`,
        ],
      })
    );

    // ── Groupes ───────────────────────────────────────────────────
    // Reportés dans la revendication cognito:groups du jeton, ce qui
    // permet à chaque fonction de vérifier le rôle sans lecture en base.
    const groupes: Array<[string, string, number]> = [
      ["RH", "Ressources humaines — accès complet", 1],
      ["EMPLOYE", "Employé — accès à ses propres données", 2],
      ["CANDIDAT", "Candidat — accès à ses candidatures", 3],
    ];

    for (const [nom, description, precedence] of groupes) {
      new CfnUserPoolGroup(this, `Groupe${nom}`, {
        userPoolId: this.pool.userPoolId,
        groupName: nom,
        description,
        precedence,
      });
    }

    // ── Domaine de connexion ──────────────────────────────────────
    // Page de connexion hébergée par AWS, personnalisable aux couleurs
    // de TERRA HR. Le préfixe doit être unique au niveau mondial.
    this.domaine = this.pool.addDomain("DomaineConnexion", {
      cognitoDomain: { domainPrefix: `pferh-${etape.nom}-${this.account}` },
    });

    // ── Client applicatif ─────────────────────────────────────────
    this.clientWeb = this.pool.addClient("ClientWeb", {
      userPoolClientName: nommer(etape.nom, "client-web"),

      // Aucun secret : une application monopage ne peut rien garder secret
      generateSecret: false,

      authFlows: {
        userSrp: true, // le mot de passe ne transite jamais en clair
        userPassword: !estProd, // simplifie les tests, désactivé en production
      },

      // Jeton court, rafraîchissement long : limite l'impact d'un vol de jeton
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),

      // Ne révèle pas si une adresse est enregistrée
      preventUserExistenceErrors: true,

      enableTokenRevocation: true,

      oAuth: {
        flows: { authorizationCodeGrant: true, implicitCodeGrant: false },
        scopes: [OAuthScope.EMAIL, OAuthScope.OPENID, OAuthScope.PROFILE],
        callbackUrls:
          etape.originesAutorisees.length > 0
            ? etape.originesAutorisees.map((o) => `${o}/callback`)
            : ["http://localhost:5173/callback"],
        logoutUrls:
          etape.originesAutorisees.length > 0
            ? [...etape.originesAutorisees]
            : ["http://localhost:5173"],
      },

      readAttributes: undefined,
      writeAttributes: undefined,
    });

    // ── Sorties ───────────────────────────────────────────────────
    new CfnOutput(this, "IdPool", {
      value: this.pool.userPoolId,
      exportName: `${etape.nom}-cognito-pool-id`,
      description: "Identifiant du pool, à reporter dans le front",
    });

    new CfnOutput(this, "IdClient", {
      value: this.clientWeb.userPoolClientId,
      exportName: `${etape.nom}-cognito-client-id`,
      description: "Identifiant du client web",
    });

    new CfnOutput(this, "UrlConnexion", {
      value: `https://${this.domaine.domainName}.auth.${this.region}.amazoncognito.com`,
      description: "Page de connexion hébergée",
    });

    new CfnOutput(this, "UrlEmetteur", {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${this.pool.userPoolId}`,
      exportName: `${etape.nom}-cognito-issuer`,
      description: "Émetteur JWT, utilisé par l'autorisation de l'API",
    });
  }
}