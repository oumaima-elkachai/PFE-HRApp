// infra/lib/data-stack.ts
//
// Tables DynamoDB, stockage documentaire et suivi budgétaire.
// Traduction directe de docs/data-design.md — toute divergence entre les
// deux est un défaut.

import { Stack, StackProps, Duration, CfnOutput, Tags } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  Table,
  AttributeType,
  BillingMode,
  ProjectionType,
  TableEncryption,
} from "aws-cdk-lib/aws-dynamodb";
import {
  Bucket,
  BucketEncryption,
  BlockPublicAccess,
  HttpMethods,
  StorageClass,
} from "aws-cdk-lib/aws-s3";
import { CfnBudget } from "aws-cdk-lib/aws-budgets";
import { ConfigEtape, nommer } from "./config/etapes";

export interface DataStackProps extends StackProps {
  readonly etape: ConfigEtape;
}

/** Déclaration d'un index secondaire global */
interface DefinitionIndex {
  readonly nom: string;
  readonly partition: [string, AttributeType];
  readonly tri?: [string, AttributeType];
}

/** Déclaration d'une table */
interface DefinitionTable {
  readonly cle: string;        // clé d'accès depuis les autres stacks
  readonly ressource: string;  // segment du nom AWS
  readonly partition: [string, AttributeType];
  readonly tri?: [string, AttributeType];
  readonly index?: DefinitionIndex[];
  readonly attributTtl?: string;
}

const S = AttributeType.STRING;
const N = AttributeType.NUMBER;

// Source unique de vérité du schéma. Ajouter une table ou un index se
// fait ici, jamais en dupliquant du code d'infrastructure.
const TABLES: DefinitionTable[] = [
  {
    cle: "employes",
    ressource: "employes",
    partition: ["id", S],
    index: [{ nom: "email-index", partition: ["email", S] }],
  },
  {
    // Clé composite : rend le doublon quotidien impossible au niveau du
    // moteur, et transforme la requête mensuelle en Query ciblée.
    cle: "pointages",
    ressource: "pointages",
    partition: ["employeId", S],
    tri: ["date", S],
    index: [{ nom: "statut-index", partition: ["statut", S], tri: ["date", S] }],
  },
  {
    cle: "conges",
    ressource: "conges",
    partition: ["id", S],
    index: [
      { nom: "employe-index", partition: ["employeId", S], tri: ["dateDebut", S] },
      { nom: "statut-index", partition: ["statut", S], tri: ["dateDebut", S] },
    ],
  },
  {
    // id déterministe : {employeId}_{AAAA-MM}, écriture conditionnelle
    cle: "factures",
    ressource: "factures",
    partition: ["id", S],
    index: [
      { nom: "employe-periode-index", partition: ["employeId", S], tri: ["periode", S] },
    ],
  },
  {
    cle: "candidatures",
    ressource: "candidatures",
    partition: ["id", S],
    index: [
      { nom: "email-index", partition: ["email", S], tri: ["creeLe", S] },
      { nom: "statut-index", partition: ["statut", S], tri: ["creeLe", S] },
      // Index creux : offreId est omis pour les candidatures spontanées
      { nom: "offre-index", partition: ["offreId", S], tri: ["scoreCV", N] },
    ],
  },
  {
    cle: "offres",
    ressource: "offres",
    partition: ["id", S],
    index: [{ nom: "statut-index", partition: ["statut", S], tri: ["creeLe", S] }],
  },
  {
    cle: "quiz",
    ressource: "quiz",
    partition: ["id", S],
    index: [{ nom: "offre-index", partition: ["offreId", S], tri: ["creeLe", S] }],
  },
  {
    cle: "quizSessions",
    ressource: "quiz-sessions",
    partition: ["id", S],
    index: [
      { nom: "candidature-index", partition: ["candidatureId", S], tri: ["debutLe", S] },
    ],
  },
  {
    cle: "entretiens",
    ressource: "entretiens",
    partition: ["id", S],
    index: [
      { nom: "candidature-index", partition: ["candidatureId", S] },
      { nom: "statut-date-index", partition: ["statut", S], tri: ["dateHeure", S] },
    ],
  },
  {
    cle: "notifications",
    ressource: "notifications",
    partition: ["id", S],
    index: [{ nom: "user-date-index", partition: ["userId", S], tri: ["creeLe", S] }],
    // Purge automatique après 90 jours, sans consommer de capacité d'écriture
    attributTtl: "expireLe",
  },
  {
    cle: "evenements",
    ressource: "evenements",
    partition: ["id", S],
    index: [{ nom: "statut-date-index", partition: ["statut", S], tri: ["dateDebut", S] }],
  },
];

export class DataStack extends Stack {
  public readonly tables: Record<string, Table> = {};
  public readonly compartimentDocuments: Bucket;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { etape } = props;
    const estProd = etape.nom === "prod";

    // ── Tables ────────────────────────────────────────────────────
    for (const definition of TABLES) {
      const table = new Table(this, `Table${majuscule(definition.cle)}`, {
        tableName: nommer(etape.nom, definition.ressource),
        partitionKey: {
          name: definition.partition[0],
          type: definition.partition[1],
        },
        ...(definition.tri
          ? { sortKey: { name: definition.tri[0], type: definition.tri[1] } }
          : {}),

        // Aucun coût à vide, aucune capacité à provisionner
        billingMode: BillingMode.PAY_PER_REQUEST,

        // Clé gérée par AWS : gratuite, contrairement à une clé KMS
        // dédiée facturée au mois
        encryption: TableEncryption.AWS_MANAGED,

        pointInTimeRecoverySpecification: {
          pointInTimeRecoveryEnabled: etape.sauvegardeContinue,
        },

        removalPolicy: etape.politiqueSuppression,

        ...(definition.attributTtl ? { timeToLiveAttribute: definition.attributTtl } : {}),
      });

      for (const index of definition.index ?? []) {
        table.addGlobalSecondaryIndex({
          indexName: index.nom,
          partitionKey: { name: index.partition[0], type: index.partition[1] },
          ...(index.tri
            ? { sortKey: { name: index.tri[0], type: index.tri[1] } }
            : {}),
          projectionType: ProjectionType.ALL,
        });
      }

      Tags.of(table).add("Domain", domaineDe(definition.cle));
      Tags.of(table).add("DataClassification", classificationDe(definition.cle));

      this.tables[definition.cle] = table;
    }

    // ── Compartiment documentaire ─────────────────────────────────
    this.compartimentDocuments = new Bucket(this, "CompartimentDocuments", {
      bucketName: nommer(etape.nom, `documents-${this.account}`),

      // Jamais public : les accès passent par l'API ou par URL pré-signée
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: estProd,
      removalPolicy: etape.politiqueSuppression,
      autoDeleteObjects: !estProd,

      // Nécessaire au téléversement direct depuis le navigateur : le
      // fichier ne transite pas par Lambda, ce qui contourne la limite
      // de 6 Mo en invocation synchrone.
      cors: [
        {
          allowedMethods: [HttpMethods.PUT, HttpMethods.GET, HttpMethods.HEAD],
          allowedOrigins:
            etape.originesAutorisees.length > 0 ? etape.originesAutorisees : ["*"],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
          maxAge: 3000,
        },
      ],

      lifecycleRules: [
        {
          id: "cv-archivage",
          prefix: "cvs/",
          transitions: [
            {
              storageClass: StorageClass.GLACIER_INSTANT_RETRIEVAL,
              transitionAfter: Duration.days(365),
            },
          ],
          expiration: Duration.days(1095), // 3 ans
        },
        {
          id: "bulletins-archivage",
          prefix: "factures/",
          transitions: [
            {
              storageClass: StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(90),
            },
          ],
          // Aucune expiration : conservation légale des bulletins de paie
        },
        {
          id: "nettoyage-multipart",
          abortIncompleteMultipartUploadAfter: Duration.days(7),
        },
      ],
    });

    Tags.of(this.compartimentDocuments).add("Domain", "documents");
    Tags.of(this.compartimentDocuments).add("DataClassification", "Confidential");

    // ── Suivi budgétaire ──────────────────────────────────────────
    // Le budget est déclaré ici au même titre que les tables : une
    // alerte configurée à la main dans la console disparaîtrait au
    // prochain déploiement dans un compte neuf.
    //
    // Le filtre par étiquette Environment est ce qui rend le marquage
    // utile : le coût de dev est suivi séparément de celui de prod.
    new CfnBudget(this, "BudgetMensuel", {
      budget: {
        budgetName: nommer(etape.nom, "budget-mensuel"),
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: etape.budgetMensuelUsd, unit: "USD" },
        costFilters: { TagKeyValue: [`user:Environment$${etape.nom}`] },
      },
      notificationsWithSubscribers: [
        {
          // Dépense constatée : alerte à mi-parcours
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: 50,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [{ subscriptionType: "EMAIL", address: etape.emailAlertes }],
        },
        {
          // Prévision : alerte avant que le dépassement ne survienne,
          // ce qui laisse le temps de réagir
          notification: {
            notificationType: "FORECASTED",
            comparisonOperator: "GREATER_THAN",
            threshold: 100,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [{ subscriptionType: "EMAIL", address: etape.emailAlertes }],
        },
      ],
    });

    // ── Sorties ───────────────────────────────────────────────────
    new CfnOutput(this, "NomCompartimentDocuments", {
      value: this.compartimentDocuments.bucketName,
      exportName: `${etape.nom}-compartiment-documents`,
    });

    for (const definition of TABLES) {
      new CfnOutput(this, `NomTable${majuscule(definition.cle)}`, {
        value: this.tables[definition.cle].tableName,
        exportName: `${etape.nom}-table-${definition.ressource}`,
      });
    }
  }
}

// ── Aides ───────────────────────────────────────────────────────────

function majuscule(mot: string): string {
  return mot.charAt(0).toUpperCase() + mot.slice(1);
}

/** Domaine métier, reporté en étiquette pour la répartition des coûts */
function domaineDe(cle: string): string {
  const correspondance: Record<string, string> = {
    employes: "rh",
    pointages: "temps",
    conges: "temps",
    factures: "paie",
    candidatures: "recrutement",
    offres: "recrutement",
    quiz: "recrutement",
    quizSessions: "recrutement",
    entretiens: "recrutement",
    notifications: "transverse",
    evenements: "transverse",
  };
  return correspondance[cle] ?? "transverse";
}

/** Niveau de sensibilité, reporté en étiquette pour la conformité */
function classificationDe(cle: string): string {
  const confidentielles = [
    "employes", "conges", "factures",
    "candidatures", "quizSessions", "entretiens",
  ];
  if (confidentielles.includes(cle)) return "Confidential";
  if (cle === "offres") return "Public";
  return "Internal";
}