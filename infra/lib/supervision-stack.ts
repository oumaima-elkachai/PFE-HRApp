// infra/lib/supervision-stack.ts
//
// Observabilité : tableau de bord, alarmes et notifications.
//
// Sans supervision, une panne se découvre par la plainte d'un
// utilisateur. Les alarmes déclenchent un courriel avant cela.
//
// Le dimensionnement respecte l'offre gratuite CloudWatch :
// 10 alarmes, 3 tableaux de bord et 5 Go de journaux par mois.

import { Stack, StackProps, Duration, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  Dashboard,
  GraphWidget,
  SingleValueWidget,
  TextWidget,
  Metric,
  Alarm,
  ComparisonOperator,
  TreatMissingData,
  MathExpression,
  Statistic,
  LegendPosition,
} from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import { Topic } from "aws-cdk-lib/aws-sns";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { IFunction } from "aws-cdk-lib/aws-lambda";
import { HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { ConfigEtape, nommer } from "./config/etapes";

export interface SupervisionStackProps extends StackProps {
  readonly etape: ConfigEtape;
  readonly fonction: IFunction;
  readonly api: HttpApi;
  readonly tables: Record<string, Table>;
}

export class SupervisionStack extends Stack {
  public readonly sujetAlertes: Topic;
  public readonly tableauDeBord: Dashboard;

  constructor(scope: Construct, id: string, props: SupervisionStackProps) {
    super(scope, id, props);

    const { etape, fonction, api, tables } = props;
    const periode = Duration.minutes(5);

    // ── Canal de notification ─────────────────────────────────────
    // L'abonnement doit être confirmé : un courriel part à la création
    // de la pile, il faut cliquer sur le lien qu'il contient.
    this.sujetAlertes = new Topic(this, "SujetAlertes", {
      topicName: nommer(etape.nom, "alertes"),
      displayName: `TERRA HR — alertes (${etape.nom})`,
    });

    this.sujetAlertes.addSubscription(new EmailSubscription(etape.emailAlertes));

        const notifier = (alarme: Alarm) => {
      alarme.addAlarmAction(new SnsAction(this.sujetAlertes));
      // Le retour à la normale n'est notifié qu'en production : en
      // développement, il produirait un courriel à chaque déploiement.
      if (etape.nom === "prod") {
        alarme.addOkAction(new SnsAction(this.sujetAlertes));
      }
      return alarme;
    };

    // ── Métriques ─────────────────────────────────────────────────

    const invocations = fonction.metricInvocations({ period: periode });
    const erreurs = fonction.metricErrors({ period: periode });
    const duree = fonction.metricDuration({ period: periode, statistic: "p95" });
    const limitations = fonction.metricThrottles({ period: periode });

    const metriqueApi = (nom: string, statistique = "Sum") =>
      new Metric({
        namespace: "AWS/ApiGateway",
        metricName: nom,
        dimensionsMap: { ApiId: api.apiId },
        period: periode,
        statistic: statistique,
      });

    const erreursServeur = metriqueApi("5xx");
    const erreursClient = metriqueApi("4xx");
    const requetes = metriqueApi("Count");
    const latence = metriqueApi("Latency", "p95");

    const tauxErreur = new MathExpression({
      expression: "100 * FILL(erreurs, 0) / (FILL(invocations, 0) + 1)",
      usingMetrics: { erreurs, invocations },
      label: "Taux d'erreur (%)",
      period: periode,
    });

    // ── Alarmes ───────────────────────────────────────────────────
    // Six alarmes, sous le seuil de dix de l'offre gratuite.

    notifier(new Alarm(this, "AlarmeErreursFonction", {
      alarmName: nommer(etape.nom, "fonction-erreurs"),
      alarmDescription:
        "La fonction échoue de façon répétée. Consulter les journaux : " +
        `aws logs tail /aws/lambda/${nommer(etape.nom, "api")} --since 15m`,
      metric: erreurs,
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      // Absence de données signifie absence de trafic, pas une panne
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }));

    notifier(new Alarm(this, "AlarmeTauxErreur", {
      alarmName: nommer(etape.nom, "taux-erreur"),
      alarmDescription: "Plus de 5 % des invocations échouent",
      metric: tauxErreur,
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }));

    notifier(new Alarm(this, "AlarmeDuree", {
      alarmName: nommer(etape.nom, "fonction-lenteur"),
      alarmDescription:
        "Le 95e centile dépasse 10 secondes : la génération des bulletins " +
        "ou l'analyse des CV ralentit anormalement",
      metric: duree,
      threshold: 10_000, // millisecondes
      evaluationPeriods: 3,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }));

    notifier(new Alarm(this, "AlarmeLimitations", {
      alarmName: nommer(etape.nom, "fonction-limitations"),
      alarmDescription:
        "Lambda refuse des invocations : la concurrence réservée du compte " +
        "est atteinte",
      metric: limitations,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }));

    notifier(new Alarm(this, "AlarmeErreursApi", {
      alarmName: nommer(etape.nom, "api-erreurs-serveur"),
      alarmDescription: "L'API renvoie des erreurs 5xx",
      metric: erreursServeur,
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }));

    notifier(new Alarm(this, "AlarmeLatenceApi", {
      alarmName: nommer(etape.nom, "api-latence"),
      alarmDescription: "Le 95e centile de latence dépasse 5 secondes",
      metric: latence,
      threshold: 5000,
      evaluationPeriods: 3,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }));

    // ── Tableau de bord ───────────────────────────────────────────

    this.tableauDeBord = new Dashboard(this, "TableauDeBord", {
      dashboardName: nommer(etape.nom, "supervision"),
      defaultInterval: Duration.hours(3),
    });

    this.tableauDeBord.addWidgets(
      new TextWidget({
        markdown: [
          `# TERRA HR — supervision (${etape.nom})`,
          "",
          "Application RH serverless. Aucune ressource ne tourne en continu :",
          "les graphiques restent plats en l'absence de trafic, ce qui est le",
          "comportement attendu.",
        ].join("\n"),
        width: 24,
        height: 3,
      })
    );

    this.tableauDeBord.addWidgets(
      new SingleValueWidget({
        title: "Requêtes",
        metrics: [requetes],
        width: 6,
        height: 5,
        sparkline: true,
      }),
      new SingleValueWidget({
        title: "Erreurs de la fonction",
        metrics: [erreurs],
        width: 6,
        height: 5,
        sparkline: true,
      }),
      new SingleValueWidget({
        title: "Latence (p95)",
        metrics: [latence],
        width: 6,
        height: 5,
        sparkline: true,
      }),
      new SingleValueWidget({
        title: "Durée d'exécution (p95)",
        metrics: [duree],
        width: 6,
        height: 5,
        sparkline: true,
      })
    );

    this.tableauDeBord.addWidgets(
      new GraphWidget({
        title: "Trafic de l'API",
        left: [requetes],
        right: [erreursClient, erreursServeur],
        width: 12,
        height: 6,
        legendPosition: LegendPosition.BOTTOM,
      }),
      new GraphWidget({
        title: "Fonction applicative",
        left: [invocations, erreurs],
        right: [duree],
        width: 12,
        height: 6,
        legendPosition: LegendPosition.BOTTOM,
      })
    );

    // Capacité consommée par les tables les plus sollicitées.
    // En mode à la demande, ces courbes montrent le coût réel : elles
    // devraient rester basses grâce aux index qui remplacent les Scan.
    const tablesSuivies = ["employes", "pointages", "conges", "factures", "candidatures"];

    this.tableauDeBord.addWidgets(
      new GraphWidget({
        title: "DynamoDB — capacité de lecture consommée",
        left: tablesSuivies
          .filter((cle) => tables[cle])
          .map((cle) =>
            tables[cle].metricConsumedReadCapacityUnits({
              period: periode,
              label: cle,
            })
          ),
        width: 12,
        height: 6,
        legendPosition: LegendPosition.BOTTOM,
      }),
      new GraphWidget({
        title: "DynamoDB — capacité d'écriture consommée",
        left: tablesSuivies
          .filter((cle) => tables[cle])
          .map((cle) =>
            tables[cle].metricConsumedWriteCapacityUnits({
              period: periode,
              label: cle,
            })
          ),
        width: 12,
        height: 6,
        legendPosition: LegendPosition.BOTTOM,
      })
    );

    this.tableauDeBord.addWidgets(
      new GraphWidget({
        title: "Taux d'erreur (%)",
        left: [tauxErreur],
        width: 12,
        height: 6,
        leftYAxis: { min: 0, max: 100 },
      }),
      new GraphWidget({
        title: "Invocations limitées",
        left: [limitations],
        width: 12,
        height: 6,
      })
    );

    // ── Sorties ───────────────────────────────────────────────────
    new CfnOutput(this, "UrlTableauDeBord", {
      value:
        `https://${this.region}.console.aws.amazon.com/cloudwatch/home` +
        `?region=${this.region}#dashboards:name=${this.tableauDeBord.dashboardName}`,
      description: "Tableau de bord de supervision",
    });

    new CfnOutput(this, "ArnSujetAlertes", {
      value: this.sujetAlertes.topicArn,
      description: "Confirmer l'abonnement par courriel avant toute alerte",
    });
  }
}

// Statistic est importé pour la lisibilité des typages ; il n'est pas
// utilisé directement, les statistiques étant passées en chaîne.
void Statistic;