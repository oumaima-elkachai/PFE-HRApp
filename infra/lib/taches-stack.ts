// infra/lib/taches-stack.ts
//
// Traitements declenches par le temps.
//
// Jusqu'ici, tout le code du projet s'executait en reponse a une
// requete HTTP. Cette pile introduit le premier traitement planifie :
// une fonction invoquee chaque matin par EventBridge Scheduler, sans
// qu'aucune ressource ne tourne entre deux executions.

import { Stack, StackProps, Duration, CfnOutput, RemovalPolicy, TimeZone } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as path from "path";
import {
  Function as LambdaFunction, Runtime, Code, Architecture,
} from "aws-cdk-lib/aws-lambda";
import { Schedule, ScheduleExpression } from "aws-cdk-lib/aws-scheduler";
import { LambdaInvoke } from "aws-cdk-lib/aws-scheduler-targets";
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { ConfigEtape, nommer } from "./config/etapes";

export interface TachesStackProps extends StackProps {
  readonly etape: ConfigEtape;
  readonly tables: Record<string, Table>;
  /** Adresse expeditrice, verifiee dans SES */
  readonly expediteur: string;
  readonly urlApplication: string;
}

export class TachesStack extends Stack {
  public readonly fonctionRappels: LambdaFunction;

  constructor(scope: Construct, id: string, props: TachesStackProps) {
    super(scope, id, props);

    const { etape, tables, expediteur, urlApplication } = props;

    const journal = new LogGroup(this, "JournalRappels", {
      logGroupName: `/aws/lambda/${nommer(etape.nom, "rappels")}`,
      retention: etape.retentionJournaux,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.fonctionRappels = new LambdaFunction(this, "FonctionRappels", {
      functionName: nommer(etape.nom, "rappels"),
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      handler: "src/taches/rappels.handler",

      code: Code.fromAsset(path.join(__dirname, "../../pfe-rh-serverless"), {
        exclude: [
          "sauvegarde", "sauvegarde-aws", "tmp", "scripts",
          "tests", "__tests__", "src/tests", "events",
          ".aws-sam", ".git", "*.md", "template.yaml", "samconfig.toml",
          "node_modules/.cache", "node_modules/.bin", "node_modules/@napi-rs",
          "**/*.test.js", "server-old.js", "generer-old.js",
        ],
      }),

      // Traitement court et sequentiel : peu de memoire suffit.
      memorySize: 512,
      timeout: Duration.minutes(5),
      logGroup: journal,

      environment: {
        DYNAMODB_ENDPOINT: "",
        FUSEAU_HORAIRE: "Africa/Tunis",
        ETAPE: etape.nom,

        TABLE_ENTRETIENS: tables.entretiens.tableName,
        TABLE_CANDIDATURES: tables.candidatures.tableName,
        TABLE_NOTIFICATIONS: tables.notifications.tableName,

        COURRIEL_EXPEDITEUR: expediteur,
        REGION_SES: etape.region,
        URL_APPLICATION: urlApplication,
        // En developpement, les messages sont journalises plutot
        // qu'envoyes : le bac a sable SES refuserait de toute facon
        // les adresses non verifiees.
        COURRIEL_SIMULE: String(etape.nom !== "prod"),
      },
    });

    // ── Permissions ───────────────────────────────────────────────
    tables.entretiens.grantReadWriteData(this.fonctionRappels);
    tables.candidatures.grantReadWriteData(this.fonctionRappels);
    tables.notifications.grantWriteData(this.fonctionRappels);

    // SES ne permet pas de restreindre par destinataire : la
    // limitation porte sur l'adresse expeditrice, seule identite que
    // la fonction est autorisee a utiliser.
    this.fonctionRappels.addToRolePolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["ses:SendEmail", "ses:SendRawEmail"],
      resources: [
        `arn:aws:ses:${this.region}:${this.account}:identity/${expediteur}`,
      ],
    }));

    // ── Planification ─────────────────────────────────────────────
    // EventBridge Scheduler plutot qu'une regle EventBridge classique :
    // il gere nativement les fuseaux horaires, ce qui evite de calculer
    // le decalage saisonnier a la main.
    new Schedule(this, "PlanificationRappels", {
      scheduleName: nommer(etape.nom, "rappels-quotidiens"),
      description: "Rappels d'entretiens et d'échéances de quiz",
      schedule: ScheduleExpression.cron({
        minute: "0",
        hour: "8",
        timeZone: TimeZone.of("Africa/Tunis"), 
      }),
      target: new LambdaInvoke(this.fonctionRappels, {
        retryAttempts: 2,
      }),
      enabled: true,
    });

    new CfnOutput(this, "NomFonctionRappels", {
      value: this.fonctionRappels.functionName,
      description: "Invocation manuelle : aws lambda invoke --function-name …",
    });

    new CfnOutput(this, "AdresseExpeditrice", {
      value: expediteur,
      description: "À vérifier dans SES avant tout envoi",
    });
  }
}