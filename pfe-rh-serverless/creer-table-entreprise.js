// creer-table-entreprise.js
//
// À poser à la RACINE de pfe-rh-serverless, puis :
//   node creer-table-entreprise.js
//
// Même convention que creer-table-pieces-dossier.js : le script
// réutilise ton client `src/utils/dynamodb` et se donne l'adresse
// locale que `server.js` se donne, faute de quoi il partirait sur AWS
// et renverrait un ECONNRESET trompeur.
//
// La table ne contient qu'une seule ligne, d'identifiant « ENTREPRISE ».
// Une table pour une ligne peut surprendre : c'est la forme la plus
// simple qui laisse la porte ouverte au multi-entreprise, puisqu'il
// suffira d'y écrire d'autres identifiants.

if (!process.env.DYNAMODB_ENDPOINT && !process.argv.includes("--aws")) {
  process.env.DYNAMODB_ENDPOINT = "http://localhost:8000";
}
if (process.argv.includes("--aws")) delete process.env.DYNAMODB_ENDPOINT;

const {
  CreateTableCommand, DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");

const { docClient } = require("./src/utils/dynamodb");

const TABLE = process.env.TABLE_ENTREPRISE || "Entreprise-local";

const definition = {
  TableName: TABLE,
  BillingMode: "PAY_PER_REQUEST",
  KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
  AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
};

async function attendreActive(nom, essais = 30) {
  for (let i = 0; i < essais; i++) {
    try {
      const { Table } = await docClient.send(
        new DescribeTableCommand({ TableName: nom })
      );
      if (Table?.TableStatus === "ACTIVE") return Table;
    } catch (e) {
      if (e.name !== "ResourceNotFoundException") throw e;
    }
    await new Promise((r) => setTimeout(r, 500));
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
    console.log("La table existe déjà.");
  }

  const table = await attendreActive(TABLE);
  if (!table) {
    console.error(`\n✗ ${TABLE} n'est pas devenue active dans le temps imparti.`);
    process.exit(1);
  }

  console.log(`\nTable  : ${TABLE} — ${table.TableStatus}`);
  console.log(
    `\n✓ ${existait ? "Tout était déjà en place." : "Table créée."}`
    + `\n  Ouvre Réglages › Entreprise et renseigne la raison sociale,`
    + `\n  l'adresse, la ville, le matricule fiscal et l'affiliation CNSS.`
    + `\n  Tant que ce n'est pas fait, les attestations portent des « — ».`
  );
})().catch((e) => { console.error(`\n✗ ${e.name} : ${e.message}`); process.exit(1); });