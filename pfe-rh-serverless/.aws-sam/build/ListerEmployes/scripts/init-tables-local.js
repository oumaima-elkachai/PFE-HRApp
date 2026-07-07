const { DynamoDBClient, CreateTableCommand, ListTablesCommand } = require("@aws-sdk/client-dynamodb");

const client = new DynamoDBClient({
  region: "us-east-1",
  endpoint: "http://localhost:8000",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

const tables = [
  {
    TableName: "Employes-local",
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
  },
  {
    TableName: "Candidats-local",
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
  },
  {
    TableName: "Evenements-local",
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
  },
  {
    TableName: "Factures-local",
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
  },
  {
    TableName: "Pointages-local",
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
  },
];

async function init() {
  console.log("Initialisation des tables DynamoDB Local...\n");

  let existantes;
  try {
    existantes = await client.send(new ListTablesCommand({}));
  } catch (e) {
    console.error("Impossible de contacter DynamoDB Local.");
    console.error("Verifie que DynamoDB Local tourne sur le port 8000");
    console.error("Commande : java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb -port 8000");
    process.exit(1);
  }

  for (const table of tables) {
    if (existantes.TableNames.includes(table.TableName)) {
      console.log("Table deja existante : " + table.TableName);
      continue;
    }
    try {
      await client.send(new CreateTableCommand(table));
      console.log("Table creee : " + table.TableName);
    } catch (e) {
      console.error("Erreur creation " + table.TableName + " : " + e.message);
    }
  }

  console.log("\nDynamoDB Local pret !");
  console.log("Lance l API avec : sam local start-api --env-vars env.local.json");
}

init();
