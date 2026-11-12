// creer-table-pieces-dossier.js
//
// À poser à la RACINE de pfe-rh-serverless, puis :
//   node creer-table-pieces-dossier.js
//
// Le script réutilise ton client `src/utils/dynamodb`, et se donne
// l'adresse locale que `server.js` se donne en tête de fichier : sans
// elle, un script lancé à part partirait sur AWS et renverrait un
// ECONNRESET trompeur.

if (!process.env.DYNAMODB_ENDPOINT && !process.argv.includes("--aws")) {
  process.env.DYNAMODB_ENDPOINT = "http://localhost:8000";
}
if (process.argv.includes("--aws")) delete process.env.DYNAMODB_ENDPOINT;

const {
  CreateTableCommand, DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");

const { docClient } = require("./src/utils/dynamodb");

const TABLE = process.env.TABLE_PIECES_DOSSIER || "PiecesDossier-local";
const INDEX = "statut-index";

const definition = {
  TableName: TABLE,
  BillingMode: "PAY_PER_REQUEST",

  // Clé composite : toutes les pièces d'un salarié se lisent en une
  // requête, et la clé de tri porte le type ET l'identifiant, ce qui
  // autorise plusieurs fichiers d'un même type — plusieurs diplômes, un
  // contrat et son avenant.
  KeySchema: [
    { AttributeName: "employeId", KeyType: "HASH" },
    { AttributeName: "cleTri", KeyType: "RANGE" },
  ],

  AttributeDefinitions: [
    { AttributeName: "employeId", AttributeType: "S" },
    { AttributeName: "cleTri", AttributeType: "S" },
    { AttributeName: "statut", AttributeType: "S" },
    { AttributeName: "deposeLe", AttributeType: "S" },
  ],

  // L'écran RH a besoin de « tout ce qui attend une validation », tous
  // salariés confondus. Sans index, il faudrait parcourir la table
  // entière à chaque ouverture.
  GlobalSecondaryIndexes: [{
    IndexName: INDEX,
    KeySchema: [
      { AttributeName: "statut", KeyType: "HASH" },
      { AttributeName: "deposeLe", KeyType: "RANGE" },
    ],
    Projection: { ProjectionType: "ALL" },
  }],
};

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function attendreActive(nom, essais = 20) {
  for (let i = 0; i < essais; i++) {
    try {
      const { Table } = await docClient.send(new DescribeTableCommand({ TableName: nom }));
      const pretes = (Table.GlobalSecondaryIndexes || []).every((g) => g.IndexStatus === "ACTIVE");
      if (Table.TableStatus === "ACTIVE" && pretes) return Table;
    } catch (e) {
      if (e.name !== "ResourceNotFoundException") throw e;
    }
    process.stdout.write(".");
    await pause(1000);
  }
  return null;
}

(async () => {
  console.log(`\nTable visée : ${TABLE}`);

  let existait = false;
  try {
    await docClient.send(new CreateTableCommand(definition));
    console.log("Création lancée.");
  } catch (e) {
    if (e.name !== "ResourceInUseException") {
      console.error(`\n✗ ${e.name} : ${e.message}`);
      if (/credential|UnrecognizedClient/i.test(e.name + e.message)) {
        console.error("  Ce message vient d'AWS, pas de DynamoDB Local.");
      }
      process.exit(1);
    }
    existait = true;
    console.log("La table existe déjà — vérification de son index.");
  }

  const table = await attendreActive(TABLE);
  if (!table) {
    console.error(`\n✗ ${TABLE} n'est pas devenue active dans le temps imparti.`);
    process.exit(1);
  }

  const index = (table.GlobalSecondaryIndexes || []).map((g) => g.IndexName);
  console.log(`\nTable  : ${TABLE} — ${table.TableStatus}`);
  console.log(`Index  : ${index.join(", ") || "aucun"}`);

  if (!index.includes(INDEX)) {
    // Le cas le plus coûteux à diagnostiquer : la table répond, l'index
    // non, et l'écran RH des validations revient vide sans erreur.
    console.error(
      `\n✗ INDEX MANQUANT : ${INDEX}.`
      + `\n  L'écran RH des pièces à valider reviendra vide sans erreur.`
      + `\n  Supprimez la table et relancez ce script.`
    );
    process.exit(1);
  }

  console.log(`\n✓ ${existait ? "Tout était déjà en place." : "Table créée."} Le dossier du personnel peut fonctionner.`);
})().catch((e) => { console.error(`\n✗ ${e.name} : ${e.message}`); process.exit(1); });