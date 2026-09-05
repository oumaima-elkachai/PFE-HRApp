// infra/lib/config/etapes.ts
//
// Configuration par environnement. Tout ce qui diffère entre dev et prod
// est déclaré ici, et nulle part ailleurs. Aucune stack ne doit contenir
// de test « si prod alors ».

import { RemovalPolicy, Duration } from "aws-cdk-lib";
import { RetentionDays } from "aws-cdk-lib/aws-logs";

export type NomEtape = "dev" | "prod";

export interface ConfigEtape {
  /** Identifiant court, utilisé dans le nom de chaque ressource */
  readonly nom: NomEtape;

  /** Compte AWS cible. Les deux étapes partagent le même compte sur ce projet. */
  readonly compte: string;

  /** Région unique du projet */
  readonly region: string;

  /** Région d'appel de Bedrock, potentiellement différente selon la
   *  disponibilité des modèles */
  readonly regionBedrock: string;

  /** Identifiant du modèle Bedrock, ou profil d'inférence régional */
  readonly modeleBedrock: string;

  /** En développement, l'analyse IA renvoie un résultat simulé afin de ne
   *  consommer aucun jeton facturé. Bedrock n'est pas dans l'offre gratuite. */
  readonly bedrockSimule: boolean;

  /** Sauvegarde continue DynamoDB (PITR) */
  readonly sauvegardeContinue: boolean;

  /** Sort des ressources à la suppression de la stack */
  readonly politiqueSuppression: RemovalPolicy;

  /** Durée de conservation des journaux CloudWatch.
   *  Sans limite, les journaux s'accumulent et deviennent le premier poste
   *  de coût d'un projet serverless. */
  readonly retentionJournaux: RetentionDays;

  /** Origines autorisées par CORS, côté API et côté compartiment S3 */
  readonly originesAutorisees: string[];

  /** Adresse destinataire des alertes de supervision et de budget */
  readonly emailAlertes: string;

  /** Seuil mensuel du budget AWS, en dollars */
  readonly budgetMensuelUsd: number;

  /** Durée de validité des URL pré-signées S3 */
  readonly dureeUrlSignee: Duration;
}

const COMPTE = process.env.CDK_COMPTE_AWS ?? "707578706755";
const REGION = "eu-west-3";
const EMAIL_ALERTES = process.env.CDK_EMAIL_ALERTES ?? "oumaima.kachai@esprit.tn";

export const ETAPES: Record<NomEtape, ConfigEtape> = {
  dev: {
    nom: "dev",
    compte: COMPTE,
    region: REGION,
    regionBedrock: "eu-west-3",
    modeleBedrock: "anthropic.claude-3-haiku-20240307-v1:0",
    bedrockSimule: true,
    sauvegardeContinue: false,
    politiqueSuppression: RemovalPolicy.DESTROY,
    retentionJournaux: RetentionDays.ONE_WEEK,
    emailAlertes: EMAIL_ALERTES,
    budgetMensuelUsd: 5,
    dureeUrlSignee: Duration.minutes(15),
            originesAutorisees: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://d2cc1fkfzt3nok.cloudfront.net",
    ],
  },

  prod: {
    nom: "prod",
    compte: COMPTE,
    region: REGION,
    regionBedrock: "eu-west-3",
    modeleBedrock: "anthropic.claude-3-haiku-20240307-v1:0",
    bedrockSimule: false,
    sauvegardeContinue: true,
    politiqueSuppression: RemovalPolicy.RETAIN,
    retentionJournaux: RetentionDays.ONE_MONTH,
    originesAutorisees: [], // complété par la stack frontale (domaine CloudFront)
    emailAlertes: EMAIL_ALERTES,
    budgetMensuelUsd: 20,
    dureeUrlSignee: Duration.minutes(5),
  },
};

/** Nom normalisé d'une ressource : pferh-dev-employes */
export function nommer(etape: NomEtape, ressource: string): string {
  return `pferh-${etape}-${ressource}`;
}

export function obtenirEtape(nom: string | undefined): ConfigEtape {
  if (nom !== "dev" && nom !== "prod") {
    throw new Error(
      `Étape inconnue : "${nom}". Utilisez -c etape=dev ou -c etape=prod.`
    );
  }
  return ETAPES[nom];
}