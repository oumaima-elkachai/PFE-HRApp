// scripts/normaliser-statuts.js
//
// Aligne les valeurs de statut sur les conventions de data-design.md.
// Utile après une migration, ou quand d'anciens écrans ont écrit des
// valeurs en minuscules.
//
//   node scripts/normaliser-statuts.js --analyser    simulation
//   node scripts/normaliser-statuts.js --appliquer   écriture réelle
//   node scripts/normaliser-statuts.js --appliquer --aws
//
// Sécurité : la cible par défaut est DynamoDB Local. Viser AWS demande
// le drapeau --aws explicite.

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

const args = process.argv.slice(2);
const APPLIQUER = args.includes("--appliquer");
const CIBLE_AWS = args.includes("--aws");
const ETAPE = process.env.ETAPE || "dev";

const REGION = process.env.AWS_REGION || "eu-west-3";
const ENDPOINT = CIBLE_AWS ? null : (process.env.DYNAMODB_ENDPOINT || "http://localhost:8000");

console.log(CIBLE_AWS
  ? `\n☁️  Cible : AWS (pferh-${ETAPE}-*) — ${REGION}`
  : `\n🔧 Cible : DynamoDB Local (${ENDPOINT})`);

const client = new DynamoDBClient({
  region: REGION,
  ...(ENDPOINT
    ? { endpoint: ENDPOINT, credentials: { accessKeyId: "local", secretAccessKey: "local" } }
    : {}),
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const nomTable = (base) =>
  CIBLE_AWS ? `pferh-${ETAPE}-${base.toLowerCase()}` : `${base}-local`;

// ── Règles de normalisation ────────────────────────────────────────

const REGLES = {
  Offres: {
    champ: "statut",
    defaut: "ACTIVE",
    correspondance: {
      active: "ACTIVE", ouverte: "ACTIVE", publiee: "ACTIVE", "publiée": "ACTIVE",
      pourvue: "POURVUE", fermee: "POURVUE", "fermée": "POURVUE", close: "POURVUE",
      archivee: "ARCHIVEE", "archivée": "ARCHIVEE", inactive: "ARCHIVEE",
      urgente: "ACTIVE", urgent: "ACTIVE", prioritaire: "ACTIVE",

    },
  },
  Candidatures: {
    champ: "statut",
    defaut: "SOUMIS",
    correspondance: {
      soumis: "SOUMIS", nouveau: "SOUMIS", recu: "SOUMIS", "reçu": "SOUMIS",
      preselection: "PRESELECTION", "présélection": "PRESELECTION",
      quiz_en_attente: "QUIZ_EN_ATTENTE",
      quiz_envoye: "QUIZ_ENVOYE", "quiz_envoyé": "QUIZ_ENVOYE",
      quiz_termine: "QUIZ_TERMINE", "quiz_terminé": "QUIZ_TERMINE",
      entretien: "ENTRETIEN",
      offre: "OFFRE",
      embauche: "EMBAUCHE", "embauché": "EMBAUCHE", accepte: "EMBAUCHE",
      refuse: "REFUSE", "refusé": "REFUSE", rejete: "REFUSE",
    },
  },
  Conges: {
    champ: "statut",
    defaut: "EN_ATTENTE",
    correspondance: {
      attente: "EN_ATTENTE", en_attente: "EN_ATTENTE", "en attente": "EN_ATTENTE",
      approuve: "APPROUVE", "approuvé": "APPROUVE", accepte: "APPROUVE", valide: "APPROUVE",
      refuse: "REFUSE", "refusé": "REFUSE", rejete: "REFUSE",
    },
  },
  Quiz: {
    champ: "statut",
    defaut: "ACTIF",
    correspondance: { actif: "ACTIF", active: "ACTIF", archive: "ARCHIVE", "archivé": "ARCHIVE" },
  },
  Evenements: {
    champ: "statut",
    defaut: "ACTIF",
    correspondance: { actif: "ACTIF", active: "ACTIF", annule: "ANNULE", "annulé": "ANNULE" },
  },
};

// Types de congé : l'ancien front envoyait "paye", absent du domaine
const TYPES_CONGE = {
  champ: "type",
  defaut: "annuel",
  correspondance: {
    paye: "annuel", "payé": "annuel", annuel: "annuel", conge_paye: "annuel",
    maladie: "maladie",
    sans_solde: "sans_solde", non_paye: "sans_solde",
    exceptionnel: "exceptionnel",
  },
};

function normaliser(valeur, regle) {
  if (valeur === undefined || valeur === null || valeur === "") return regle.defaut;
  const brut = String(valeur).trim();
  const cible = regle.correspondance[brut.toLowerCase()];
  if (cible) return cible;
  // Déjà conforme ?
  if (Object.values(regle.correspondance).includes(brut)) return brut;
  return null; // inconnu : signalé, jamais modifié en silence
}

async function scanComplet(table) {
  const items = [];
  let cle;
  do {
    const res = await docClient.send(new ScanCommand({ TableName: table, ExclusiveStartKey: cle }));
    items.push(...(res.Items || []));
    cle = res.LastEvaluatedKey;
  } while (cle);
  return items;
}

async function traiter(base, regles) {
  const table = nomTable(base);
  let items;
  try {
    items = await scanComplet(table);
  } catch (e) {
    console.log(`   ${base.padEnd(14)} table absente`);
    return;
  }

  let modifies = 0;
  const inconnus = new Set();

  for (const item of items) {
    const avant = {};
    const apres = {};
    let changement = false;

    for (const regle of regles) {
      const valeurActuelle = item[regle.champ];
      const valeurCible = normaliser(valeurActuelle, regle);

      if (valeurCible === null) {
        inconnus.add(`${regle.champ}="${valeurActuelle}"`);
        continue;
      }
      if (valeurCible !== valeurActuelle) {
        avant[regle.champ] = valeurActuelle ?? "(absent)";
        apres[regle.champ] = valeurCible;
        item[regle.champ] = valeurCible;
        changement = true;
      }
    }

    if (!changement) continue;
    modifies++;

    const details = Object.keys(apres)
      .map((c) => `${c}: ${avant[c]} → ${apres[c]}`)
      .join(", ");
    console.log(`     ${String(item.titre || item.employeNom || item.nom || item.id).slice(0, 30).padEnd(32)} ${details}`);

    if (APPLIQUER) {
      await docClient.send(new PutCommand({ TableName: table, Item: item }));
    }
  }

  console.log(`   ${base.padEnd(14)} ${items.length} élément(s), ${modifies} à corriger`);
  if (inconnus.size) {
    console.log(`     ⚠️  valeurs inconnues, laissées telles quelles : ${[...inconnus].join(", ")}`);
  }
}

async function principal() {
  console.log(APPLIQUER ? "   Mode écriture\n" : "   Simulation — aucune écriture\n");

  await traiter("Offres", [REGLES.Offres]);
  await traiter("Candidatures", [REGLES.Candidatures]);
  await traiter("Conges", [REGLES.Conges, TYPES_CONGE]);
  await traiter("Quiz", [REGLES.Quiz]);
  await traiter("Evenements", [REGLES.Evenements]);

  console.log(
    APPLIQUER
      ? "\n✅ Normalisation appliquée.\n"
      : "\nRelance avec --appliquer pour écrire les corrections.\n"
  );
}

principal().catch((e) => {
  console.error("Erreur :", e.message);
  process.exit(1);
});
