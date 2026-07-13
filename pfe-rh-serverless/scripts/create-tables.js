const { DynamoDBClient, CreateTableCommand, ListTablesCommand } = require("@aws-sdk/client-dynamodb");

const client = new DynamoDBClient({
  region: "us-east-1",
  endpoint: "http://localhost:8000",
  credentials: {
    accessKeyId: "local",
    secretAccessKey: "local",
  },
});

const tables = [
  "Users-local",
  "Employes-local",
  "Candidats-local",
  "Pointages-local",
  "Evenements-local",
  "Factures-local",
];

async function createTables() {
  // Vérifier les tables existantes
  const { TableNames } = await client.send(new ListTablesCommand({}));
  console.log("📋 Tables existantes:", TableNames);

  for (const tableName of tables) {
    if (TableNames.includes(tableName)) {
      console.log(`✅ Table déjà existante: ${tableName}`);
      continue;
    }

    try {
      await client.send(
        new CreateTableCommand({
          TableName: tableName,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        })
      );
      console.log(`✅ Table créée: ${tableName}`);
    } catch (err) {
      console.error(`❌ Erreur création ${tableName}:`, err.message);
    }
  }
}

createTables();