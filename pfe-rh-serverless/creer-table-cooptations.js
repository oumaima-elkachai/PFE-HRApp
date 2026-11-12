// creer-table-cooptations.js
//
// À lancer une fois, depuis la racine du projet :
//
//     node creer-table-cooptations.js
//
// Crée la table des cooptations dans DynamoDB Local, avec ses deux
// index. Relancer le script ne casse rien : il détecte une table
// existante et s'arrête.

process.env.DYNAMODB_ENDPOINT =
  process.env.DYNAMODB_ENDPOINT || "http://localhost:8000";

const {
  DynamoDBClient, CreateTableCommand, DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");

const TABLE = process.env.TABLE_COOPTATIONS || "Cooptations-local";

const client = new DynamoDBClient({
  endpoint: process.env.DYNAMODB_ENDPOINT,
  region: process.env.AWS_REGION || "us-east-1",
  // Mêmes identifiants factices que src/utils/dynamodb.js. DynamoDB
  // Local cloisonne les données par clé d'accès quand il ne tourne pas
  // en -sharedDb : des identifiants différents créeraient la table
  // dans un espace que l'application ne verrait jamais.
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

const definition = {
  TableName: TABLE,

  // Clé primaire : l'identifiant de la recommandation. Les deux accès
  // réels — « mes recommandations » et « celles à traiter » — passent
  // par les index ci-dessous.
  KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],

  AttributeDefinitions: [
    { AttributeName: "id", AttributeType: "S" },
    { AttributeName: "parrainId", AttributeType: "S" },
    { AttributeName: "statut", AttributeType: "S" },
    { AttributeName: "creeLe", AttributeType: "S" },
  ],

  GlobalSecondaryIndexes: [
    {
      // « Mes recommandations », pour le salarié. La restriction de
      // visibilité est portée par cette clé de partition : il n'existe
      // aucun chemin de code renvoyant celles d'un autre.
      IndexName: "parrain-index",
      KeySchema: [
        { AttributeName: "parrainId", KeyType: "HASH" },
        { AttributeName: "creeLe", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    },
    {
      // « Celles à traiter », pour la RH. La clé de tri sur la date
      // rend le classement du plus récent au plus ancien gratuit :
      // ScanIndexForward: false suffit, aucun tri en mémoire.
      IndexName: "statut-index",
      KeySchema: [
        { AttributeName: "statut", KeyType: "HASH" },
        { AttributeName: "creeLe", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    },
  ],

  ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
};

async function existe() {
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE }));
    return true;
  } catch (e) {
    if (e.name === "ResourceNotFoundException") return false;
    throw e;
  }
}

(async () => {
  try {
    if (await existe()) {
      console.log(`\nLa table « ${TABLE} » existe déjà. Rien à faire.\n`);
      return;
    }

    await client.send(new CreateTableCommand(definition));

    console.log(`\n  Table « ${TABLE} » créée.`);
    console.log("  Index : parrain-index, statut-index\n");
    console.log("  Ajoute la ligne suivante dans server.js, avec les");
    console.log("  autres noms de tables :\n");
    console.log(`      process.env.TABLE_COOPTATIONS = "${TABLE}";\n`);

  } catch (e) {
    console.error("\nCréation impossible :", e.message);
    console.error(
      "\nVérifie que DynamoDB Local tourne sur "
      + `${process.env.DYNAMODB_ENDPOINT}\n`
    );
    process.exit(1);
  }
})();