// scripts/migrate-aws.js
const {
  DynamoDBClient,
  CreateTableCommand,
  ListTablesCommand,
  DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");

const {
  DynamoDBDocumentClient,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");

const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

// ✅ Client AWS Paris
const client = new DynamoDBClient({
  region: "eu-west-3",
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// ── Tables à créer ────────────────────────────
const TABLES = [
  "Users",
  "Employes",
  "Candidats",
  "Offres",
  "Pointages",
  "Evenements",
  "Factures",
  "Conges",
];

// ── Attendre que la table soit ACTIVE ─────────
async function waitForTable(tableName) {
  process.stdout.write(`   ⏳ Activation de ${tableName}...`);
  while (true) {
    try {
      const res = await client.send(
        new DescribeTableCommand({ TableName: tableName })
      );
      if (res.Table.TableStatus === "ACTIVE") {
        console.log(" ✅");
        break;
      }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// ── Créer toutes les tables ───────────────────
async function createTables() {
  console.log("\n📋 ÉTAPE 1 : Création des tables DynamoDB AWS\n");

  const { TableNames } = await client.send(new ListTablesCommand({}));

  for (const tableName of TABLES) {
    if (TableNames.includes(tableName)) {
      console.log(`⏭️  Existe déjà : ${tableName}`);
      continue;
    }

    try {
      await client.send(
        new CreateTableCommand({
          TableName:            tableName,
          BillingMode:          "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "id", AttributeType: "S" },
          ],
          KeySchema: [
            { AttributeName: "id", KeyType: "HASH" },
          ],
        })
      );
      await waitForTable(tableName);
    } catch (err) {
      console.error(`❌ Erreur ${tableName} :`, err.message);
    }
  }

  console.log("\n✅ Toutes les tables sont prêtes !\n");
}

// ── Seeder les données ────────────────────────
async function seedData() {
  console.log("📋 ÉTAPE 2 : Insertion des données initiales\n");

  // ── 1. Users ──────────────────────────────
  const users = [
    {
      nom:         "Admin",
      prenom:      "RH",
      email:       "rh@entreprise.tn",
      motDePasse:  "admin123",
      role:        "RH",
      departement: "Ressources Humaines",
      poste:       "Directeur RH",
    },
    {
      nom:         "Ben Ali",
      prenom:      "Karim",
      email:       "karim@entreprise.tn",
      motDePasse:  "karim123",
      role:        "EMPLOYE",
      departement: "IT",
      poste:       "Développeur Full Stack",
    },
    {
      nom:         "Trabelsi",
      prenom:      "Amina",
      email:       "amina@entreprise.tn",
      motDePasse:  "amina123",
      role:        "EMPLOYE",
      departement: "Marketing",
      poste:       "Chef de projet",
    },
    {
      nom:         "Mansour",
      prenom:      "Sami",
      email:       "sami@entreprise.tn",
      motDePasse:  "sami123",
      role:        "EMPLOYE",
      departement: "Finance",
      poste:       "Comptable",
    },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.motDePasse, 10);
    await docClient.send(
      new PutCommand({
        TableName: "Users",
        Item: {
          id:          uuidv4(),
          nom:         u.nom,
          prenom:      u.prenom,
          email:       u.email,
          motDePasse:  hash,
          role:        u.role,
          departement: u.departement,
          poste:       u.poste,
          statut:      "actif",
          creeLe:      new Date().toISOString(),
        },
      })
    );
    console.log(`✅ User : ${u.email} (${u.role})`);
  }

  // ── 2. Employés ───────────────────────────
  const employes = [
    {
      nom:         "Ben Ali",
      prenom:      "Karim",
      email:       "karim@entreprise.tn",
      poste:       "Développeur Full Stack",
      departement: "IT",
      salaire:     3200,
      telephone:   "+216 20 123 456",
      soldeConges: 21,
    },
    {
      nom:         "Trabelsi",
      prenom:      "Amina",
      email:       "amina@entreprise.tn",
      poste:       "Chef de projet Marketing",
      departement: "Marketing",
      salaire:     2800,
      telephone:   "+216 20 789 012",
      soldeConges: 21,
    },
    {
      nom:         "Mansour",
      prenom:      "Sami",
      email:       "sami@entreprise.tn",
      poste:       "Comptable",
      departement: "Finance",
      salaire:     2500,
      telephone:   "+216 20 345 678",
      soldeConges: 21,
    },
    {
      nom:         "Chabbi",
      prenom:      "Leila",
      email:       "leila@entreprise.tn",
      poste:       "Responsable RH",
      departement: "RH",
      salaire:     3000,
      telephone:   "+216 20 901 234",
      soldeConges: 21,
    },
  ];

  for (const emp of employes) {
    await docClient.send(
      new PutCommand({
        TableName: "Employes",
        Item: {
          id:          uuidv4(),
          ...emp,
          statut:      "actif",
          creeLe:      new Date().toISOString(),
          misAJourLe:  new Date().toISOString(),
        },
      })
    );
    console.log(`✅ Employé : ${emp.prenom} ${emp.nom}`);
  }

  // ── 3. Offres ─────────────────────────────
  const offres = [
    {
      titre:       "Cloud Engineer",
      departement: "IT",
      type:        "CDI",
      modeTravail: "Hybrid",
      statut:      "active",
      description: "Nous recherchons un Cloud Engineer passionné pour rejoindre notre équipe. Missions : déploiement AWS, Docker, Kubernetes, Terraform, CI/CD. Profil : Bac+3 minimum, expérience DevOps appréciée.",
    },
    {
      titre:       "Développeur Full Stack",
      departement: "IT",
      type:        "CDI",
      modeTravail: "Remote",
      statut:      "active",
      description: "Développeur Full Stack React/Node.js pour renforcer notre équipe technique. Stack : React, TypeScript, Node.js, DynamoDB, AWS.",
    },
    {
      titre:       "Chargé(e) RH",
      departement: "RH",
      type:        "CDD",
      modeTravail: "On-site",
      statut:      "urgente",
      description: "Chargé(e) RH pour renforcer notre équipe. Missions : recrutement, paie, administration du personnel. Profil : Bac+3 RH.",
    },
    {
      titre:       "Data Analyst",
      departement: "IT",
      type:        "CDI",
      modeTravail: "Hybrid",
      statut:      "active",
      description: "Data Analyst pour analyser nos données métier. Compétences : Python, SQL, Power BI, AWS Athena.",
    },
  ];

  for (const offre of offres) {
    await docClient.send(
      new PutCommand({
        TableName: "Offres",
        Item: {
          id:                 uuidv4(),
          ...offre,
          nombreCandidatures: 0,
          datePublication:    new Date().toISOString(),
          creeLe:             new Date().toISOString(),
          misAJourLe:         new Date().toISOString(),
        },
      })
    );
    console.log(`✅ Offre : ${offre.titre}`);
  }

  // ── 4. Événements ─────────────────────────
  const now = Date.now();
  const evenements = [
    {
      titre:       "Réunion équipe IT",
      description: "Point hebdomadaire équipe IT",
      type:        "REUNION",
      dateDebut:   new Date(now + 86400000).toISOString(),
      dateFin:     new Date(now + 90000000).toISOString(),
      lieu:        "Salle A",
    },
    {
      titre:       "Formation AWS Cloud",
      description: "Formation cloud AWS pour l'équipe technique",
      type:        "FORMATION",
      dateDebut:   new Date(now + 172800000).toISOString(),
      dateFin:     new Date(now + 194400000).toISOString(),
      lieu:        "En ligne",
    },
    {
      titre:       "Revue mensuelle RH",
      description: "Bilan mensuel des ressources humaines",
      type:        "REUNION",
      dateDebut:   new Date(now + 259200000).toISOString(),
      dateFin:     new Date(now + 266400000).toISOString(),
      lieu:        "Salle de conférence",
    },
  ];

  for (const ev of evenements) {
    await docClient.send(
      new PutCommand({
        TableName: "Evenements",
        Item: {
          id:           uuidv4(),
          ...ev,
          participants: [],
          statut:       "ACTIF",
          creePar:      "rh@entreprise.tn",
          creeLe:       new Date().toISOString(),
        },
      })
    );
    console.log(`✅ Événement : ${ev.titre}`);
  }

  console.log("\n🎉 Données initiales insérées !\n");
}

// ── Main ──────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   MIGRATION PFE-RH → AWS DynamoDB       ║");
  console.log("║   Région : eu-west-3 (Paris)            ║");
  console.log("╚══════════════════════════════════════════╝");

  try {
    // Test connexion AWS
    console.log("\n🔌 Test connexion AWS...");
    const { TableNames } = await client.send(new ListTablesCommand({}));
    console.log(`✅ Connecté à AWS Paris ! (${TableNames.length} tables existantes)\n`);

    await createTables();
    await seedData();

    console.log("╔══════════════════════════════════════════╗");
    console.log("║   ✅ MIGRATION TERMINÉE AVEC SUCCÈS !   ║");
    console.log("║                                          ║");
    console.log("║   Comptes de test :                     ║");
    console.log("║   👑 rh@entreprise.tn / admin123        ║");
    console.log("║   👤 karim@entreprise.tn / karim123     ║");
    console.log("║   👤 amina@entreprise.tn / amina123     ║");
    console.log("║   👤 sami@entreprise.tn / sami123       ║");
    console.log("╚══════════════════════════════════════════╝");

  } catch (err) {
    console.error("\n❌ ERREUR DE MIGRATION :", err.message);

    if (err.message.includes("credentials")) {
      console.error("\n💡 Solution : Lance 'aws configure' et rentre tes clés AWS");
    }
    if (err.message.includes("region")) {
      console.error("\n💡 Solution : Lance 'aws configure set region eu-west-3'");
    }

    process.exit(1);
  }
}

main();