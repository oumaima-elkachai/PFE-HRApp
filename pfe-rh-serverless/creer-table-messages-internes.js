// creer-table-messages-internes.js
//
// À poser à la RACINE de pfe-rh-serverless, à côté de server.js,
// puis :  node creer-table-messages-internes.js
//
// Le script réutilise ton propre client `src/utils/dynamodb` plutôt que
// d'en créer un. C'est volontaire : ton serveur tourne sur DynamoDB
// Local, et un client construit ici avec les seuls réglages par défaut
// aurait créé la table sur AWS. En passant par le tien, la table naît
// forcément là où le serveur ira la chercher.

try {
  // Si le projet utilise dotenv, les variables doivent être chargées
  // avant le require suivant, qui lit process.env.
  require("dotenv").config();
} catch {
  // dotenv absent : les variables viennent de l'environnement du shell.
}

const {
  CreateTableCommand, DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");

const { docClient } = require("./src/utils/dynamodb");

const TABLE = process.env.TABLE_MESSAGES_INTERNES || "MessagesInternes";

const definition = {
  TableName: TABLE,
  BillingMode: "PAY_PER_REQUEST",

  // La clé de tri porte l'horodatage ET l'identifiant du message.
  // Deux envois dans la même milliseconde auraient sinon la même clé
  // complète, et DynamoDB remplace sans prévenir.
  KeySchema: [
    { AttributeName: "filId", KeyType: "HASH" },
    { AttributeName: "cleTri", KeyType: "RANGE" },
  ],

  AttributeDefinitions: [
    { AttributeName: "filId", AttributeType: "S" },
    { AttributeName: "cleTri", AttributeType: "S" },
    { AttributeName: "expediteurId", AttributeType: "S" },
    { AttributeName: "destinataireId", AttributeType: "S" },
    { AttributeName: "envoyeLe", AttributeType: "S" },
  ],

  // Deux index, et non un seul : un index secondaire ne porte qu'une
  // clé scalaire, on ne peut donc pas indexer « participe à ce fil ».
  // Il en faut un par rôle, et la liste des conversations interroge
  // les deux puis regroupe.
  GlobalSecondaryIndexes: [
    {
      IndexName: "expediteur-index",
      KeySchema: [
        { AttributeName: "expediteurId", KeyType: "HASH" },
        { AttributeName: "envoyeLe", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    },
    {
      IndexName: "destinataire-index",
      KeySchema: [
        { AttributeName: "destinataireId", KeyType: "HASH" },
        { AttributeName: "envoyeLe", KeyType: "RANGE" },
      ],
      Projection: { ProjectionType: "ALL" },
    },
  ],
};

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Attend que la table et ses index soient utilisables */
async function attendreActive(nom, essais = 20) {
  for (let i = 0; i < essais; i++) {
    const { Table } = await docClient.send(new DescribeTableCommand({ TableName: nom }));
    const indexPrets = (Table.GlobalSecondaryIndexes || [])
      .every((g) => g.IndexStatus === "ACTIVE");

    if (Table.TableStatus === "ACTIVE" && indexPrets) return Table;

    process.stdout.write(".");
    await pause(1000);
  }
  return null;
}

(async () => {
  console.log(`Table visée : ${TABLE}`);

  let existait = false;
  try {
    await docClient.send(new CreateTableCommand(definition));
    console.log("Création lancée.");
  } catch (e) {
    if (e.name !== "ResourceInUseException") {
      console.error(`\nÉchec : ${e.name} — ${e.message}`);
      if (e.name === "UnrecognizedClientException" || /credential/i.test(e.message)) {
        console.error(
          "Ce message vient d'AWS, pas de DynamoDB Local : vérifiez que\n"
          + "src/utils/dynamodb.js pointe bien sur http://localhost:8000."
        );
      }
      process.exit(1);
    }
    existait = true;
    console.log("La table existe déjà — vérification de ses index.");
  }

  const table = await attendreActive(TABLE);
  if (!table) {
    console.error("\nLa table n'est pas devenue active dans le temps imparti.");
    process.exit(1);
  }

  const index = (table.GlobalSecondaryIndexes || []).map((g) => g.IndexName);
  const attendus = ["expediteur-index", "destinataire-index"];
  const manquants = attendus.filter((n) => !index.includes(n));

  console.log(`\nTable ${TABLE} : ${table.TableStatus}`);
  console.log(`Index présents : ${index.join(", ") || "aucun"}`);

  if (manquants.length > 0) {
    // Le cas qui coûte le plus cher à diagnostiquer : la table répond,
    // les index non, et la liste des conversations revient vide sans
    // la moindre erreur.
    console.error(
      `\nINDEX MANQUANTS : ${manquants.join(", ")}.\n`
      + `La table existait déjà sans eux. La messagerie répondra 503 tant\n`
      + `qu'ils ne sont pas là. Supprimez la table et relancez ce script,\n`
      + `ou ajoutez les index à la main.`
    );
    process.exit(1);
  }

  console.log(existait
    ? "Rien à faire : la table et ses index étaient déjà en place."
    : "Terminé. La messagerie interne peut fonctionner.");
})();