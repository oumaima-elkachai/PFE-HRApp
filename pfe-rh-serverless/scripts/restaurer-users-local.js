

const fs = require("fs");
const path = require("path");
const {
  DynamoDBClient,
  CreateTableCommand,
  ListTablesCommand,
} = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE = "Users-local";
const ENDPOINT = process.env.DYNAMODB_ENDPOINT || "http://localhost:8000";

const client = new DynamoDBClient({
  region: "eu-west-3",
  endpoint: ENDPOINT,
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

async function principal() {
  console.log(`\n🔧 Cible : DynamoDB Local (${ENDPOINT})\n`);

  const fichier = path.join(process.cwd(), "sauvegarde", "Users.json");
  if (!fs.existsSync(fichier)) {
    console.error(`Sauvegarde introuvable : ${fichier}`);
    process.exit(1);
  }

  const utilisateurs = JSON.parse(fs.readFileSync(fichier, "utf8"));

  const { TableNames } = await client.send(new ListTablesCommand({}));

  if (!TableNames.includes(TABLE)) {
    await client.send(new CreateTableCommand({
      TableName: TABLE,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "email", AttributeType: "S" },
      ],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      GlobalSecondaryIndexes: [{
        IndexName: "email-index",
        KeySchema: [{ AttributeName: "email", KeyType: "HASH" }],
        Projection: { ProjectionType: "ALL" },
      }],
    }));
    console.log(`✅ ${TABLE} recréée`);
    await new Promise((r) => setTimeout(r, 1000));
  } else {
    console.log(`⏭️  ${TABLE} existe déjà`);
  }

  for (let i = 0; i < utilisateurs.length; i += 25) {
    const lot = utilisateurs.slice(i, i + 25);
    await docClient.send(new BatchWriteCommand({
      RequestItems: { [TABLE]: lot.map((Item) => ({ PutRequest: { Item } })) },
    }));
  }

  console.log(`✅ ${utilisateurs.length} compte(s) restauré(s)\n`);
  console.log("   Comptes disponibles :");
  for (const u of utilisateurs) {
    console.log(`     ${String(u.email).padEnd(32)} ${u.role || "?"}`);
  }
  console.log("\n   Les mots de passe d'origine fonctionnent de nouveau.");
  console.log("   Table temporaire, à supprimer après la bascule Cognito.\n");
}

principal().catch((e) => {
  console.error("Erreur :", e.message);
  process.exit(1);
});