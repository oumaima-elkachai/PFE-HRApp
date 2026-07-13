const { DynamoDBClient, UpdateItemCommand, PutItemCommand, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { v4: uuidv4 } = require("uuid");

const client = new DynamoDBClient({
  region: "us-east-1",
  endpoint: "http://localhost:8000",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

async function fix() {
  console.log("Fixing DynamoDB...\n");

  // 1. Réactiver Ahmed
  try {
    await client.send(new UpdateItemCommand({
      TableName: "Employes-local",
      Key: { id: { S: "c276e393-6749-4e85-ac24-a100dd1bc7d2" } },
      UpdateExpression: "SET statut = :s",
      ExpressionAttributeValues: { ":s": { S: "actif" } },
    }));
    console.log("Ahmed reactivé !");
  } catch(e) { console.error("Ahmed:", e.message); }

  // 2. Ajouter Amina dans Employes
  try {
    // Vérifier si Amina existe déjà
    const scan = await client.send(new ScanCommand({
      TableName: "Employes-local",
      FilterExpression: "email = :e",
      ExpressionAttributeValues: { ":e": { S: "amina@entreprise.tn" } },
    }));

    if (scan.Count === 0) {
      await client.send(new PutItemCommand({
        TableName: "Employes-local",
        Item: {
          id:          { S: uuidv4() },
          nom:         { S: "Ben Salem" },
          prenom:      { S: "Amina" },
          email:       { S: "amina@entreprise.tn" },
          poste:       { S: "Designer" },
          departement: { S: "Marketing" },
          statut:      { S: "actif" },
          creeLe:      { S: new Date().toISOString() },
        },
      }));
      console.log("Amina ajoutee dans Employes !");
    } else {
      console.log("Amina existe deja dans Employes");
    }
  } catch(e) { console.error("Amina:", e.message); }

  // 3. Vérifier le résultat
  const result = await client.send(new ScanCommand({ TableName: "Employes-local" }));
  console.log("\nEmployes actifs:");
  result.Items.forEach(item => {
    console.log(` - ${item.prenom.S} ${item.nom.S} → ${item.statut.S}`);
  });

  console.log("\nDone !");
}

fix().catch(console.error);