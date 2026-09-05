// scripts/create-tables.js
//
// Schéma DynamoDB complet — clés composites et index secondaires.
//
//   node scripts/create-tables.js            crée les tables manquantes
//   node scripts/create-tables.js --recreate  SUPPRIME puis recrée tout
//   node scripts/create-tables.js --lister    affiche l'état actuel
//
// Le module exporte SCHEMA pour être réutilisé par le script de migration
// et, plus tard, par la stack CDK.

const {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  ListTablesCommand,
  DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");

const SUFFIXE = process.env.TABLE_SUFFIX ?? "-local";
const nom = (base) => `${base}${SUFFIXE}`;

// Sécurité : le local est la cible par défaut. Viser AWS demande --aws explicitement.
const CIBLE_AWS = process.argv.includes("--aws");
const ENDPOINT  = CIBLE_AWS ? null : (process.env.DYNAMODB_ENDPOINT || "http://localhost:8000");
const REGION    = process.env.AWS_REGION || "eu-west-3";

console.log(CIBLE_AWS
  ? `☁️  Cible : compte AWS réel (${REGION})`
  : `🔧 Cible : DynamoDB Local (${ENDPOINT})`);

const client = new DynamoDBClient({
  region: REGION,
  ...(ENDPOINT
    ? { endpoint: ENDPOINT, credentials: { accessKeyId: "local", secretAccessKey: "local" } }
    : {}),
});

// ── Aides de déclaration ───────────────────────────────────────────

const S = "S", N = "N";

function table({ base, pk, sk = null, index = [] }) {
  // On collecte tous les attributs utilisés comme clé, sans doublon
  const attributs = new Map();
  attributs.set(pk.nom, pk.type);
  if (sk) attributs.set(sk.nom, sk.type);
  for (const idx of index) {
    attributs.set(idx.pk.nom, idx.pk.type);
    if (idx.sk) attributs.set(idx.sk.nom, idx.sk.type);
  }

  const schemaCle = (p, s) => {
    const cles = [{ AttributeName: p.nom, KeyType: "HASH" }];
    if (s) cles.push({ AttributeName: s.nom, KeyType: "RANGE" });
    return cles;
  };

  return {
    base,
    TableName: nom(base),
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [...attributs].map(([AttributeName, AttributeType]) => ({
      AttributeName,
      AttributeType,
    })),
    KeySchema: schemaCle(pk, sk),
    ...(index.length
      ? {
          GlobalSecondaryIndexes: index.map((idx) => ({
            IndexName: idx.nom,
            KeySchema: schemaCle(idx.pk, idx.sk),
            Projection: { ProjectionType: idx.projection || "ALL" },
          })),
        }
      : {}),
  };
}

const a = (nom, type = S) => ({ nom, type });

// ── Le schéma ──────────────────────────────────────────────────────

const SCHEMA = [
  // Données RH de l'employé. L'id vaut le "sub" Cognito une fois migré.
  table({
    base: "Employes",
    pk: a("id"),
    index: [{ nom: "email-index", pk: a("email") }],
  }),

  // Clé composite : un seul pointage possible par employé et par jour.
  // Remplace la clé "id" seule, qui autorisait les doublons.
  table({
    base: "Pointages",
    pk: a("employeId"),
    sk: a("date"),
    index: [{ nom: "statut-index", pk: a("statut"), sk: a("date") }],
  }),

  table({
    base: "Conges",
    pk: a("id"),
    index: [
      { nom: "employe-index", pk: a("employeId"), sk: a("dateDebut") },
      { nom: "statut-index",  pk: a("statut"),    sk: a("dateDebut") },
    ],
  }),

  // id déterministe : "<employeId>#<AAAA-MM>", periode = "AAAA-MM"
  table({
    base: "Factures",
    pk: a("id"),
    index: [{ nom: "employe-periode-index", pk: a("employeId"), sk: a("periode") }],
  }),

  // Absorbe l'ancienne table Candidats.
  table({
    base: "Candidatures",
    pk: a("id"),
    index: [
      { nom: "email-index",  pk: a("email"),   sk: a("creeLe") },
      { nom: "statut-index", pk: a("statut"),  sk: a("creeLe") },
      { nom: "offre-index",  pk: a("offreId"), sk: a("scoreCV", N) },
    ],
  }),

  table({
    base: "Offres",
    pk: a("id"),
    index: [{ nom: "statut-index", pk: a("statut"), sk: a("creeLe") }],
  }),

  table({
    base: "Quiz",
    pk: a("id"),
    index: [{ nom: "offre-index", pk: a("offreId"), sk: a("creeLe") }],
  }),

  // Sessions de passage : une par tentative, avec les indicateurs anti-triche.
  table({
    base: "QuizSessions",
    pk: a("id"),
    index: [{ nom: "candidature-index", pk: a("candidatureId"), sk: a("debutLe") }],
  }),

  table({
    base: "Entretiens",
    pk: a("id"),
    index: [
      { nom: "candidature-index", pk: a("candidatureId") },
      { nom: "statut-date-index", pk: a("statut"), sk: a("dateHeure") },
    ],
  }),

  // TTL à activer sur l'attribut "expireLe" une fois en production.
  table({
    base: "Notifications",
    pk: a("id"),
    index: [{ nom: "user-date-index", pk: a("userId"), sk: a("creeLe") }],
  }),

  table({
    base: "Evenements",
    pk: a("id"),
    index: [{ nom: "statut-date-index", pk: a("statut"), sk: a("dateDebut") }],
  }),
];

// Tables retirées du schéma :
//   Users    -> remplacée par le pool d'utilisateurs Cognito
//   Candidats -> fusionnée dans Candidatures
const TABLES_OBSOLETES = [nom("Users"), nom("Candidats")];

// ── Exécution ──────────────────────────────────────────────────────

async function tablesExistantes() {
  const { TableNames } = await client.send(new ListTablesCommand({}));
  return TableNames || [];
}

async function attendreSuppression(nomTable) {
  for (let i = 0; i < 30; i++) {
    try {
      await client.send(new DescribeTableCommand({ TableName: nomTable }));
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      return;
    }
  }
}

async function lister() {
  const existantes = await tablesExistantes();
  console.log("\n📋 État des tables\n");
  for (const def of SCHEMA) {
    const presente = existantes.includes(def.TableName);
    const cle = def.KeySchema.map((k) => k.AttributeName).join(" + ");
    const idx = (def.GlobalSecondaryIndexes || []).map((i) => i.IndexName);
    console.log(`  ${presente ? "✅" : "⬜"} ${def.TableName.padEnd(24)} clé: ${cle}`);
    if (idx.length) console.log(`       index: ${idx.join(", ")}`);
  }
  const restantes = TABLES_OBSOLETES.filter((t) => existantes.includes(t));
  if (restantes.length) {
    console.log(`\n⚠️  Tables obsolètes encore présentes : ${restantes.join(", ")}`);
  }
  console.log();
}

async function creer({ recreate = false } = {}) {
  const existantes = await tablesExistantes();

  for (const def of SCHEMA) {
    const { base, ...params } = def;

    if (existantes.includes(params.TableName)) {
      if (!recreate) {
        console.log(`⏭️  ${params.TableName} existe déjà`);
        continue;
      }
      await client.send(new DeleteTableCommand({ TableName: params.TableName }));
      await attendreSuppression(params.TableName);
      console.log(`🗑️  ${params.TableName} supprimée`);
    }

    try {
      await client.send(new CreateTableCommand(params));
      const nbIndex = (params.GlobalSecondaryIndexes || []).length;
      console.log(`✅ ${params.TableName} créée${nbIndex ? ` (${nbIndex} index)` : ""}`);
    } catch (e) {
      console.error(`❌ ${params.TableName} : ${e.message}`);
    }
  }

  console.log("\nTerminé.\n");
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const commande = args.includes("--lister")
    ? lister()
    : creer({ recreate: args.includes("--recreate") });

  commande.catch((e) => {
    console.error("Erreur :", e.message);
    process.exit(1);
  });
}

module.exports = { SCHEMA, TABLES_OBSOLETES, client, nom, SUFFIXE };