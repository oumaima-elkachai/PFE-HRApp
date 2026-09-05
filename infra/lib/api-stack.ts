// infra/lib/api-stack.ts
//
// Exposition de l'application sur Internet.
//
//   API Gateway HTTP  — reçoit les requêtes, valide les jetons Cognito,
//                       applique le CORS et la limitation de débit
//   Lambda            — exécute l'application Express à la demande
//
// Choix assumé : une fonction unique embarquant l'application complète,
// plutôt qu'une fonction par domaine. Voir AD-06 dans data-design.md.

import { Stack, StackProps, Duration, CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";
import { Function as LambdaFunction, Runtime, Code, Architecture, Tracing } from "aws-cdk-lib/aws-lambda";
import { HttpApi, CorsHttpMethod, HttpMethod, HttpNoneAuthorizer } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import { ConfigEtape, nommer } from "./config/etapes";

export interface ApiStackProps extends StackProps {
  readonly etape: ConfigEtape;
  readonly tables: Record<string, Table>;
  readonly compartimentDocuments: Bucket;
  readonly pool: UserPool;
  readonly clientWeb: UserPoolClient;
}

export class ApiStack extends Stack {
  public readonly api: HttpApi;
  public readonly fonction: LambdaFunction;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { etape, tables, compartimentDocuments, pool, clientWeb } = props;

    // ── Fonction ──────────────────────────────────────────────────
    const journal = new LogGroup(this, "JournalApi", {
      logGroupName: `/aws/lambda/${nommer(etape.nom, "api")}`,
      retention: etape.retentionJournaux,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.fonction = new LambdaFunction(this, "FonctionApi", {
      functionName: nommer(etape.nom, "api"),
      runtime: Runtime.NODEJS_22_X,

      // Graviton : environ 20 % moins cher à performance égale
      architecture: Architecture.ARM_64,

      handler: "lambda.handler",

      // Le code est envoyé tel quel, sans regroupement par esbuild :
      // pdfkit embarque des fichiers de police qu'un bundler omettrait,
      // ce qui casserait la génération des bulletins.
      code: Code.fromAsset(path.join(__dirname, "../../pfe-rh-serverless"), {
        exclude: [
          "sauvegarde", "sauvegarde-aws", "tmp", "scripts",
          "tests", "__tests__", "src/tests", "events",
          ".aws-sam", ".git", "*.md", "template.yaml", "samconfig.toml",
          "node_modules/.cache", "node_modules/.bin",
          "**/*.test.js", "server-old.js", "generer-old.js",
          "node_modules/.cache", "node_modules/.bin",
          "node_modules/@napi-rs",
        ],
      }),

      // La génération PDF est le traitement le plus lourd. Plus de
      // mémoire signifie aussi plus de CPU alloué, donc une exécution
      // plus courte — souvent moins chère au total qu'un réglage bas.
      memorySize: 512,
      timeout: Duration.seconds(30),

      logGroup: journal,
      tracing: etape.nom === "prod" ? Tracing.ACTIVE : Tracing.DISABLED,

      environment: {
        // Vide : signale au client DynamoDB qu'il vise le service réel
        DYNAMODB_ENDPOINT: "",
        FUSEAU_HORAIRE: "Africa/Tunis",
        ETAPE: etape.nom,

        TABLE_EMPLOYES: tables.employes.tableName,
        TABLE_POINTAGES: tables.pointages.tableName,
        TABLE_CONGES: tables.conges.tableName,
        TABLE_FACTURES: tables.factures.tableName,
        TABLE_CANDIDATURES: tables.candidatures.tableName,
        TABLE_OFFRES: tables.offres.tableName,
        TABLE_QUIZ: tables.quiz.tableName,
        TABLE_QUIZ_SESSIONS: tables.quizSessions.tableName,
        TABLE_ENTRETIENS: tables.entretiens.tableName,
        TABLE_NOTIFICATIONS: tables.notifications.tableName,
        TABLE_EVENEMENTS: tables.evenements.tableName,

        DOCUMENTS_BUCKET: compartimentDocuments.bucketName,

        COGNITO_POOL_ID: pool.userPoolId,
        COGNITO_CLIENT_ID: clientWeb.userPoolClientId,

        REGION_BEDROCK: etape.regionBedrock,
        MODELE_BEDROCK: etape.modeleBedrock,
        // En développement, l'analyse renvoie un résultat simulé :
        // Bedrock est facturé au jeton et hors offre gratuite.
        BEDROCK_SIMULE: String(etape.bedrockSimule),

        NODE_OPTIONS: "--enable-source-maps",
      },
    });

    // ── Permissions, au plus juste ────────────────────────────────
    for (const table of Object.values(tables)) {
      table.grantReadWriteData(this.fonction);
    }
    compartimentDocuments.grantReadWrite(this.fonction);

    // Analyse des CV et génération des quiz
    this.fonction.addToRolePolicy(new PolicyStatement({
      actions: ["bedrock:InvokeModel"],
      resources: [`arn:aws:bedrock:${etape.regionBedrock}::foundation-model/*`],
    }));

    // Administration des comptes depuis l'application
    this.fonction.addToRolePolicy(new PolicyStatement({
      actions: [
        "cognito-idp:AdminGetUser",
        "cognito-idp:AdminCreateUser",
        "cognito-idp:AdminAddUserToGroup",
        "cognito-idp:AdminUpdateUserAttributes",
        "cognito-idp:ListUsers",
      ],
      resources: [pool.userPoolArn],
    }));

    // ── API HTTP ──────────────────────────────────────────────────
    // Trois fois moins chère que l'API REST, et l'autorisation JWT y
    // est native : aucune fonction d'autorisation à écrire ni à payer.
    this.api = new HttpApi(this, "ApiHttp", {
      apiName: nommer(etape.nom, "api"),
      description: `TERRA HR — API applicative (${etape.nom})`,
      corsPreflight: {
        allowOrigins: etape.originesAutorisees.length > 0
          ? etape.originesAutorisees
          : ["*"],
        allowMethods: [
          CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.PUT,
          CorsHttpMethod.PATCH, CorsHttpMethod.DELETE, CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ["Content-Type", "Authorization"],
        allowCredentials: false,
        maxAge: Duration.days(1),
      },
    });

    const integration = new HttpLambdaIntegration("IntegrationApi", this.fonction);

    const autorisation = new HttpJwtAuthorizer(
      "AutorisationCognito",
      `https://cognito-idp.${this.region}.amazonaws.com/${pool.userPoolId}`,
      {
        authorizerName: nommer(etape.nom, "autorisation-jwt"),
        jwtAudience: [clientWeb.userPoolClientId],
        identitySource: ["$request.header.Authorization"],
      }
    );

    // Routes publiques : site carrière et connexion. Déclarées
    // explicitement, elles priment sur la route par défaut.
    const routesPubliques: { chemin: string; methodes: HttpMethod[] }[] = [
      { chemin: "/offres", methodes: [HttpMethod.GET] },
      { chemin: "/candidatures", methodes: [HttpMethod.POST] },
      { chemin: "/auth/connexion", methodes: [HttpMethod.POST] },
      { chemin: "/auth/inscription", methodes: [HttpMethod.POST] },
    ];

    for (const route of routesPubliques) {
      this.api.addRoutes({
        path: route.chemin,
        methods: route.methodes,
        integration,
        authorizer: new HttpNoneAuthorizer(),
      });
    }

    // Tout le reste exige un jeton Cognito valide. La passerelle rejette
    // les requêtes non authentifiées avant même d'invoquer la fonction :
    // aucune facturation sur le trafic illégitime.
    this.api.addRoutes({
      path: "/{proxy+}",
      methods: [
        HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT,
        HttpMethod.PATCH, HttpMethod.DELETE,
      ],
      integration,
      authorizer: autorisation,
    });

    // ── Sorties ───────────────────────────────────────────────────
    new CfnOutput(this, "UrlApi", {
      value: this.api.apiEndpoint,
      exportName: `${etape.nom}-url-api`,
      description: "URL de base de l'API, à reporter dans le front",
    });

    new CfnOutput(this, "NomFonction", {
      value: this.fonction.functionName,
      description: "Pour consulter les journaux : aws logs tail",
    });
  }
}