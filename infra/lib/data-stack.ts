// infra/lib/data-stack.ts
//
// Tables DynamoDB, stockage documentaire et suivi budgétaire.
// Traduction directe de docs/data-design.md — toute divergence entre
// les deux est un défaut.

import {
  Stack, StackProps, Duration, CfnOutput, Tags, RemovalPolicy,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  Table, AttributeType, BillingMode, ProjectionType, TableEncryption,
} from "aws-cdk-lib/aws-dynamodb";
import {
  Bucket, BucketEncryption, BlockPublicAccess, HttpMethods, StorageClass,
} from "aws-cdk-lib/aws-s3";
import { CfnBudget } from "aws-cdk-lib/aws-budgets";
import { ConfigEtape, nommer } from "./config/etapes";

export interface DataStackProps extends StackProps {
  readonly etape: ConfigEtape;
}

interface DefinitionIndex {
  readonly nom: string;
  readonly partition: [string, AttributeType];
  readonly tri?: [string, AttributeType];
}

interface DefinitionTable {
  readonly cle: string;        // clé d'accès depuis les autres stacks
  readonly ressource: string;  // segment du nom AWS
  readonly partition: [string, AttributeType];
  readonly tri?: [string, AttributeType];
  readonly index?: DefinitionIndex[];
  readonly attributTtl?: string;

  // ── Dérogations aux politiques d'étape ──────────────────────────
  //
  // Réservées aux données dont la conservation prolongée n'a pas de
  // base légale. Déclarées dans le schéma pour que la dérogation soit
  // lisible ici, et non dissimulée dans la boucle de construction.
  //
  // Une table qui ne déclare ni l'un ni l'autre garde exactement le
  // comportement de son étape : la dérogation ne peut pas déborder.

  /** Jamais de sauvegarde continue, même en production. */
  readonly jamaisSauvegardee?: boolean;

  /** Toujours détruite avec la pile, même en production. */
  readonly toujoursSupprimee?: boolean;
}

const S = AttributeType.STRING;
const N = AttributeType.NUMBER;

// Source unique de vérité du schéma. Ajouter une table ou un index se
// fait ici, jamais en dupliquant du code d'infrastructure.
const TABLES: DefinitionTable[] = [

  // ── Ressources humaines ─────────────────────────────────────────
  {
    cle: "employes",
    ressource: "employes",
    partition: ["id", S],
    index: [{ nom: "email-index", partition: ["email", S] }],
  },
  {
    // Clé composite : rend le doublon quotidien impossible au niveau
    // du moteur, et transforme la requête mensuelle en Query ciblée.
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

  // ── Recrutement ─────────────────────────────────────────────────
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
    // Un candidat n'a pas de fiche Employes : son profil vit à part,
    // indexé par le sub Cognito.
    cle: "profilsCandidats",
    ressource: "profils-candidats",
    partition: ["id", S],
    index: [{ nom: "email-index", partition: ["email", S] }],
  },
  {
    // Préférences d'alerte, une entrée par compte candidat
    cle: "alertesOffres",
    ressource: "alertes-offres",
    partition: ["id", S],
  },
  {
    // Clé composite chronologique : la lecture d'un fil est une Query
    // ordonnée, sans tri applicatif.
    cle: "messages",
    ressource: "messages",
    partition: ["candidatureId", S],
    tri: ["envoyeLe", S],
  },

  {
    // Recommandation d'un candidat par un salarié. Deux accès réels :
    // « mes recommandations » pour le parrain, « celles à traiter »
    // pour la RH — d'où deux index et aucune lecture par clé primaire.
    cle: "cooptations",
    ressource: "cooptations",
    partition: ["id", S],
    index: [
      // La restriction de visibilité est portée par cette clé de
      // partition : aucun chemin de code ne renvoie celles d'un autre.
      { nom: "parrain-index", partition: ["parrainId", S], tri: ["creeLe", S] },
      { nom: "statut-index", partition: ["statut", S], tri: ["creeLe", S] },
    ],
  },

  // ── Administratif ───────────────────────────────────────────────
  {
    // Une seule ligne, d'identifiant « ENTREPRISE » : raison sociale,
    // matricule fiscal, affiliation CNSS, signataire, cachet. C'est
    // elle que lit `src/documents/pdf.js` — sans elle, les attestations
    // et les bulletins portent les valeurs de repli, « TERRA SARL »
    // comprise.
    //
    // Une table pour une ligne surprend, mais c'est la forme qui laisse
    // la porte ouverte au multi-entreprise : il suffira d'y écrire
    // d'autres identifiants.
    cle: "entreprise",
    ressource: "entreprise",
    partition: ["id", S],
  },
  {
    // Clé composite : toutes les pièces d'un salarié se lisent en une
    // requête, et la clé de tri porte le type ET l'identifiant, ce qui
    // autorise plusieurs fichiers d'un même type — plusieurs diplômes,
    // un contrat et son avenant.
    cle: "piecesDossier",
    ressource: "pieces-dossier",
    partition: ["employeId", S],
    tri: ["cleTri", S],
    index: [
      // L'écran RH a besoin de « tout ce qui attend une validation »,
      // tous salariés confondus.
      { nom: "statut-index", partition: ["statut", S], tri: ["deposeLe", S] },
    ],
  },
  {
    // Changements de situation familiale déclarés par le salarié, en
    // attente de contrôle. Table distincte d'Employes à dessein : la
    // fiche porte l'état VALIDÉ, celui que paie.js utilise pour
    // calculer l'impôt ; celle-ci porte ce que le salarié AFFIRME.
    // Sans ce cloisonnement, n'importe qui se déclarerait chef de
    // famille de quatre enfants handicapés sur un simple formulaire.
    //
    // Les deux index portent `creeLe` en clé de tri : `depot.js` trie
    // aujourd'hui en mémoire, le tri devient donc gratuit. Toute
    // demande créée par `creerDemande` porte cet attribut — un élément
    // qui en serait dépourvu n'apparaîtrait pas dans l'index.
    cle: "demandesSituation",
    ressource: "demandes-situation",
    partition: ["id", S],
    index: [
      { nom: "employe-index", partition: ["employeId", S], tri: ["creeLe", S] },
      { nom: "statut-index", partition: ["statut", S], tri: ["creeLe", S] },
    ],
  },
  {
    cle: "demandesDocuments",
    ressource: "demandes-documents",
    partition: ["id", S],
    index: [
      { nom: "employe-index", partition: ["employeId", S], tri: ["demandeLe", S] },
      { nom: "statut-index", partition: ["statut", S], tri: ["demandeLe", S] },
    ],
  },
  {
    cle: "notesFrais",
    ressource: "notes-frais",
    partition: ["id", S],
    index: [
      { nom: "employe-index", partition: ["employeId", S], tri: ["creeLe", S] },
      { nom: "statut-index", partition: ["statut", S], tri: ["creeLe", S] },
    ],
  },

  // ── Transverse ──────────────────────────────────────────────────
  {
    cle: "notifications",
    ressource: "notifications",
    partition: ["id", S],
    index: [{ nom: "user-date-index", partition: ["userId", S], tri: ["creeLe", S] }],
    // Purge automatique après 90 jours, sans consommer de capacité
    // d'écriture — contrairement à une tâche de nettoyage.
    attributTtl: "expireLe",
  },
  {
    cle: "evenements",
    ressource: "evenements",
    partition: ["id", S],
    index: [{ nom: "statut-date-index", partition: ["statut", S], tri: ["dateDebut", S] }],
  },
  {
    // Messagerie entre salariés. La clé de tri porte l'horodatage ET
    // l'identifiant du message : deux envois dans la même milliseconde
    // auraient sinon la même clé complète, et DynamoDB remplace sans
    // prévenir.
    cle: "messagesInternes",
    ressource: "messages-internes",
    partition: ["filId", S],
    tri: ["cleTri", S],
    index: [
      // Deux index et non un seul : un index secondaire ne porte qu'une
      // clé scalaire, on ne peut donc pas indexer « participe à ce
      // fil ». Il en faut un par rôle, et la liste des conversations
      // interroge les deux puis regroupe.
      { nom: "expediteur-index", partition: ["expediteurId", S], tri: ["envoyeLe", S] },
      { nom: "destinataire-index", partition: ["destinataireId", S], tri: ["envoyeLe", S] },
    ],
  },
  {
    // Sites de travail et leurs coordonnées, pour la vérification de
    // position au pointage. Lue par code, jamais parcourue.
    cle: "sites",
    ressource: "sites",
    partition: ["code", S],
  },
  {
    // Demandes de correction de pointage (« oubli de pointage »).
    //
    // La clé est l'identifiant de la demande, pas le couple (employé,
    // date) : un salarié peut refaire une demande pour le même jour
    // après un refus, et l'historique des deux doit rester lisible.
    // L'unicité « une seule demande en attente par jour » est une règle
    // métier, vérifiée dans corrections.js — pas une contrainte de clé,
    // qui interdirait aussi la seconde demande légitime.
    cle: "corrections",
    ressource: "corrections",
    partition: ["id", S],
    index: [
      { nom: "employe-index", partition: ["employeId", S], tri: ["demandeLe", S] },
      // Trier par date de demande met les plus anciennes en premier :
      // une demande oubliée dans la file se voit.
      { nom: "statut-index", partition: ["statut", S], tri: ["demandeLe", S] },
    ],
  },

  // ── Biométrie ───────────────────────────────────────────────────
  //
  // Gabarits faciaux pour le pointage. Seule table du schéma à
  // déroger aux politiques d'étape, et elle y déroge toujours dans le
  // sens d'une conservation moindre.
  {
    // Un gabarit par salarié : la clé de partition seule suffit, et
    // rend le doublon impossible au niveau du moteur.
    cle: "biometrie",
    ressource: "biometrie",
    partition: ["employeId", S],

    // Aucun index, volontairement. On ne cherche jamais « quel
    // salarié ressemble à ce visage », seulement « quel est le
    // gabarit de ce salarié ». Un index secondaire rendrait possible
    // une recherche que le dispositif ne doit pas permettre.

    // Une sauvegarde continue ressusciterait des gabarits révoqués et
    // viderait la révocation de son sens.
    jamaisSauvegardee: true,

    // RETAIN laisserait derrière lui un stock de données biométriques
    // orphelines, sans responsable et sans finalité.
    toujoursSupprimee: true,
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
          pointInTimeRecoveryEnabled: definition.jamaisSauvegardee
            ? false
            : etape.sauvegardeContinue,
        },

        removalPolicy: definition.toujoursSupprimee
          ? RemovalPolicy.DESTROY
          : etape.politiqueSuppression,

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
          // Aucune expiration : conservation légale des bulletins
        },
        {
          // Attestations et certificats : même exigence de conservation
          id: "documents-archivage",
          prefix: "documents/",
          transitions: [
            {
              storageClass: StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(180),
            },
          ],
        },
        {
          // Justificatifs de frais : durée de prescription comptable
          id: "justificatifs-frais",
          prefix: "frais/",
          transitions: [
            {
              storageClass: StorageClass.GLACIER_INSTANT_RETRIEVAL,
              transitionAfter: Duration.days(365),
            },
          ],
          expiration: Duration.days(3650), // 10 ans
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
    new CfnBudget(this, "BudgetMensuel", {
      budget: {
        budgetName: nommer(etape.nom, "budget-mensuel"),
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: etape.budgetMensuelUsd, unit: "USD" },
        // Le filtre par étiquette est ce qui rend le marquage utile :
        // le coût de dev est suivi séparément de celui de prod.
        costFilters: { TagKeyValue: [`user:Environment$${etape.nom}`] },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: 50,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [{ subscriptionType: "EMAIL", address: etape.emailAlertes }],
        },
        {
          // Prévision : alerte avant que le dépassement survienne
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

    new CfnOutput(this, "NombreTables", {
      value: String(TABLES.length),
      description: "Nombre de tables déployées",
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
    // Rattachée au temps de travail : le gabarit n'existe que pour
    // attester un pointage, son coût doit apparaître avec lui.
    biometrie: "temps",
    factures: "paie",
    notesFrais: "paie",
    candidatures: "recrutement",
    offres: "recrutement",
    quiz: "recrutement",
    quizSessions: "recrutement",
    entretiens: "recrutement",
    profilsCandidats: "recrutement",
    alertesOffres: "recrutement",
    messages: "recrutement",
    demandesDocuments: "administratif",
    entreprise: "administratif",
    piecesDossier: "administratif",
    // Rattachée à la paie : la situation familiale validée est ce qui
    // détermine les abattements d'impôt.
    demandesSituation: "paie",
    cooptations: "recrutement",
    // Rattachées au temps de travail : une correction porte sur un
    // pointage, un site sert à en vérifier la position.
    corrections: "temps",
    sites: "temps",
    notifications: "transverse",
    evenements: "transverse",
    messagesInternes: "transverse",
  };
  return correspondance[cle] ?? "transverse";
}

/** Niveau de sensibilité, reporté en étiquette pour la conformité */
function classificationDe(cle: string): string {
  // Catégorie particulière, au-dessus de « Confidential » : une
  // donnée biométrique ne se range pas avec un bulletin de paie.
  // L'étiquette distincte permet de retrouver en une requête toutes
  // les ressources soumises au régime renforcé.
  if (cle === "biometrie") return "Biometric";

  const confidentielles = [
    "employes", "conges", "factures", "notesFrais",
    "candidatures", "quizSessions", "entretiens",
    "profilsCandidats", "demandesDocuments", "messages",
    // Pièces d'identité et diplômes, échanges nominatifs entre
    // salariés, candidats recommandés, demandes de correction : toutes
    // portent des données personnelles identifiantes.
    "piecesDossier", "messagesInternes", "cooptations", "corrections",
    // Situation familiale déclarée : porte le handicap du salarié et
    // celui de ses enfants. À traiter avec le même soin que les
    // gabarits biométriques, même si l'étiquette reste « Confidential ».
    "demandesSituation",
  ];
  if (confidentielles.includes(cle)) return "Confidential";
  if (cle === "offres") return "Public";
  return "Internal";
}