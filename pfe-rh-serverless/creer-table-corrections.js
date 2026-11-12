// creer-table-corrections.js
//
// Création de la table des demandes de correction de pointage
// (« oubli de pointage ») sur DynamoDB local.
// À placer à la racine de pfe-rh-serverless et lancer une fois :
//
//   node creer-table-corrections.js
//
// Idempotent : relancé, il signale que la table existe et s'arrête
// sans rien casser.

const {
  DynamoDBClient, CreateTableCommand, DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");

const client = new DynamoDBClient({
  region: "eu-west-1",
  endpoint: process.env.DYNAMODB_ENDPOINT || "http://localhost:8000",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

const NOM = process.env.TABLE_CORRECTIONS || "Corrections-local";

(async () => {
  try {
    await client.send(new DescribeTableCommand({ TableName: NOM }));
    console.log(`✔ La table ${NOM} existe déjà, rien à faire.`);
    return;
  } catch (e) {
    if (e.name !== "ResourceNotFoundException") throw e;
  }

  await client.send(new CreateTableCommand({
    TableName: NOM,

    // La clé est l'identifiant de la demande, pas le couple
    // (employé, date) : un salarié peut refaire une demande pour le
    // même jour après un refus, et l'historique des deux doit rester
    // lisible. L'unicité « une seule demande en attente par jour » est
    // une règle métier, vérifiée dans corrections.js — pas une
    // contrainte de clé, qui interdirait aussi la seconde demande
    // légitime.
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],

    AttributeDefinitions: [
      { AttributeName: "id", AttributeType: "S" },
      { AttributeName: "employeId", AttributeType: "S" },
      { AttributeName: "demandeLe", AttributeType: "S" },
      { AttributeName: "statut", AttributeType: "S" },
    ],

    GlobalSecondaryIndexes: [
      {
        // « Mes demandes », de la plus récente à la plus ancienne.
        IndexName: "employe-index",
        KeySchema: [
          { AttributeName: "employeId", KeyType: "HASH" },
          { AttributeName: "demandeLe", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
      {
        // « Les demandes en attente », pour l'écran RH. Trier par date
        // de demande met les plus anciennes en premier : une demande
        // oubliée dans la file se voit.
        IndexName: "statut-index",
        KeySchema: [
          { AttributeName: "statut", KeyType: "HASH" },
          { AttributeName: "demandeLe", KeyType: "RANGE" },
        ],
        Projection: { ProjectionType: "ALL" },
      },
    ],

    BillingMode: "PAY_PER_REQUEST",
  }));

  console.log(`✔ Table ${NOM} créée, avec employe-index et statut-index.`);
})().catch((e) => {
  console.error("✖ Échec :", e.name, "—", e.message);
  console.error("  DynamoDB local est-il démarré sur le port 8000 ?");
  process.exit(1);
});