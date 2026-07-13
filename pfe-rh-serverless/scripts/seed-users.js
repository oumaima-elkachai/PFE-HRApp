const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

const client = new DynamoDBClient({
  region: "us-east-1",
  endpoint: "http://localhost:8000",
  credentials: {
    accessKeyId: "local",
    secretAccessKey: "local",
  },
});

const docClient = DynamoDBDocumentClient.from(client);

const users = [
  {
    nom: "Admin",
    prenom: "RH",
    email: "rh@entreprise.tn",
    motDePasse: "admin123",
    role: "RH",
    departement: "Ressources Humaines",
    poste: "Directeur RH",
  },
  {
    nom: "Ben Ali",
    prenom: "Karim",
    email: "karim@entreprise.tn",
    motDePasse: "karim123",
    role: "EMPLOYE",
    departement: "IT",
    poste: "Développeur",
  },
  {
    nom: "Trabelsi",
    prenom: "Amina",
    email: "amina@entreprise.tn",
    motDePasse: "amina123",
    role: "EMPLOYE",
    departement: "Marketing",
    poste: "Chef de projet",
  },
];

async function seed() {
  for (const user of users) {
    const hash = await bcrypt.hash(user.motDePasse, 10);

    const item = {
      id: uuidv4(),
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      motDePasse: hash,
      role: user.role,
      departement: user.departement,
      poste: user.poste,
      statut: "actif",
      creeLe: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: "Users-local",
        Item: item,
      })
    );

    console.log(`✅ Créé: ${user.email} (${user.role})`);
  }

  console.log("\n🎉 Base de données peuplée avec succès !");
}

seed().catch(console.error);