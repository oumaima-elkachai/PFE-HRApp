// creer-table-biometrie.js
//
// Création de la table des gabarits faciaux sur DynamoDB local.
// À placer à la racine de pfe-rh-serverless et lancer une seule fois :
//
//   node creer-table-biometrie.js
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

const NOM = process.env.TABLE_BIOMETRIE || "Biometrie-local";

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

    // Un gabarit par salarié : la clé de partition seule suffit, et
    // rend le doublon impossible au niveau du moteur.
    KeySchema: [{ AttributeName: "employeId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "employeId", AttributeType: "S" }],

    // Aucun index secondaire, volontairement. On ne cherche jamais
    // « quel salarié ressemble à ce visage », seulement « quel est le
    // gabarit de ce salarié ». Un index rendrait possible une
    // recherche que le dispositif ne doit pas permettre.
    BillingMode: "PAY_PER_REQUEST",
  }));

  console.log(`✔ Table ${NOM} créée.`);
})().catch((e) => {
  console.error("✖ Échec :", e.name, "—", e.message);
  console.error("  DynamoDB local est-il démarré sur le port 8000 ?");
  process.exit(1);
});