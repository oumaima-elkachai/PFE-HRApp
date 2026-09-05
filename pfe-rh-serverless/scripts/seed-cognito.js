// scripts/seed-cognito.js
//
// Recrée les comptes utilisateurs dans le pool Cognito.
//
// Les mots de passe hachés par bcrypt ne sont pas transférables vers
// Cognito. Les comptes sont donc recréés, et un mot de passe commun est
// posé pour la démonstration.
//
//   node scripts/seed-cognito.js --pool eu-west-3_XXXXXXX --mdp "Terra#2026!"
//   node scripts/seed-cognito.js --pool ... --simuler      (aucune écriture)
//
// Source : sauvegarde/Users.json et sauvegarde/Employes.json, produits par
// migrer-schema.js --sauvegarder

const fs = require("fs");
const path = require("path");
const {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
  ListUsersCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

// ── Arguments ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
const valeur = (nom) => {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const POOL_ID = valeur("pool") || process.env.COGNITO_POOL_ID;
const MOT_DE_PASSE = valeur("mdp") || process.env.COGNITO_MDP_INITIAL;
const REGION = valeur("region") || process.env.AWS_REGION || "eu-west-3";
const SIMULER = args.includes("--simuler");

if (!POOL_ID) {
  console.error("Argument --pool manquant (identifiant du pool Cognito).");
  process.exit(1);
}
if (!MOT_DE_PASSE && !SIMULER && !args.includes("--inventaire")) {
  console.error("Argument --mdp manquant (mot de passe initial commun).");
  console.error("Doit contenir 8 caractères, majuscule, minuscule, chiffre et symbole.");
  process.exit(1);
}

const cognito = new CognitoIdentityProviderClient({ region: REGION });
const DOSSIER = path.join(process.cwd(), "sauvegarde");

// ── Lecture des sources ────────────────────────────────────────────

function lire(nom) {
  const fichier = path.join(DOSSIER, `${nom}.json`);
  if (!fs.existsSync(fichier)) {
    console.error(`Fichier introuvable : ${fichier}`);
    console.error("Lance d'abord : node scripts/migrer-schema.js --sauvegarder");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(fichier, "utf8"));
}

const GROUPES_VALIDES = new Set(["RH", "EMPLOYE", "CANDIDAT"]);

function normaliserRole(role) {
  const majuscule = String(role || "EMPLOYE").toUpperCase();
  return GROUPES_VALIDES.has(majuscule) ? majuscule : "EMPLOYE";
}

/**
 * Construit la liste des comptes à créer.
 * Un compte peut venir de Users (ancienne table d'authentification) ou
 * directement d'Employes si aucun compte ne lui correspondait.
 */
function construireComptes() {
  const utilisateurs = lire("Users");
  const employes = lire("Employes");

  // Index des employés par adresse, pour rattacher custom:employeId
  const employeParEmail = new Map();
  for (const employe of employes) {
    if (employe.email) employeParEmail.set(employe.email.toLowerCase(), employe);
  }

  const comptes = new Map();

  for (const utilisateur of utilisateurs) {
    if (!utilisateur.email) continue;
    const email = utilisateur.email.toLowerCase();
    const employe = employeParEmail.get(email);

    comptes.set(email, {
      email,
      prenom: utilisateur.prenom || employe?.prenom || "",
      nom: utilisateur.nom || employe?.nom || "",
      role: normaliserRole(utilisateur.role),
      employeId: employe?.id || null,
      departement: utilisateur.departement || employe?.departement || "",
      origine: "Users",
    });
  }

  // Employés sans compte d'authentification : on leur en crée un
  for (const [email, employe] of employeParEmail) {
    if (comptes.has(email)) continue;
    comptes.set(email, {
      email,
      prenom: employe.prenom || "",
      nom: employe.nom || "",
      role: "EMPLOYE",
      employeId: employe.id,
      departement: employe.departement || "",
      origine: "Employes",
    });
  }

  return [...comptes.values()];
}

// ── Création ───────────────────────────────────────────────────────

async function existeDeja(email) {
  try {
    await cognito.send(new AdminGetUserCommand({ UserPoolId: POOL_ID, Username: email }));
    return true;
  } catch (e) {
    if (e.name === "UserNotFoundException") return false;
    throw e;
  }
}

async function creerCompte(compte) {
  const attributs = [
    { Name: "email", Value: compte.email },
    { Name: "email_verified", Value: "true" },
    { Name: "given_name", Value: compte.prenom },
    { Name: "family_name", Value: compte.nom },
  ];

  if (compte.employeId) {
    attributs.push({ Name: "custom:employeId", Value: compte.employeId });
  }
  if (compte.departement) {
    attributs.push({ Name: "custom:departement", Value: compte.departement });
  }

  await cognito.send(new AdminCreateUserCommand({
    UserPoolId: POOL_ID,
    Username: compte.email,
    UserAttributes: attributs,
    // Aucun email envoyé : les comptes sont recréés, pas invités
    MessageAction: "SUPPRESS",
  }));

  // Mot de passe définitif : évite l'état FORCE_CHANGE_PASSWORD qui
  // bloquerait une démonstration
  await cognito.send(new AdminSetUserPasswordCommand({
    UserPoolId: POOL_ID,
    Username: compte.email,
    Password: MOT_DE_PASSE,
    Permanent: true,
  }));

  await cognito.send(new AdminAddUserToGroupCommand({
    UserPoolId: POOL_ID,
    Username: compte.email,
    GroupName: compte.role,
  }));
}

async function principal() {
  const comptes = construireComptes();

  console.log(`\n🔐 Pool : ${POOL_ID}  (${REGION})`);
  console.log(`   ${comptes.length} compte(s) à traiter`);
  if (SIMULER) console.log("   Mode simulation — aucune écriture\n");
  else console.log();

  const parRole = comptes.reduce((acc, c) => {
    acc[c.role] = (acc[c.role] || 0) + 1;
    return acc;
  }, {});
  console.log("   Répartition :", parRole, "\n");

  let crees = 0, ignores = 0, echecs = 0;
  const sansEmployeId = [];

  for (const compte of comptes) {
    const etiquette = `${compte.email.padEnd(32)} ${compte.role.padEnd(9)}`;

    if (!compte.employeId && compte.role !== "CANDIDAT") {
      sansEmployeId.push(compte.email);
    }

    if (SIMULER) {
      console.log(`   ○ ${etiquette} ${compte.employeId ? "lié" : "sans employeId"}`);
      continue;
    }

    try {
      if (await existeDeja(compte.email)) {
        console.log(`   ⏭️  ${etiquette} existe déjà`);
        ignores++;
        continue;
      }
      await creerCompte(compte);
      console.log(`   ✅ ${etiquette} créé`);
      crees++;
    } catch (e) {
      console.log(`   ❌ ${etiquette} ${e.name}: ${e.message}`);
      echecs++;
    }
  }

  if (sansEmployeId.length) {
    console.log(`\n⚠️  ${sansEmployeId.length} compte(s) sans fiche employé correspondante :`);
    for (const email of sansEmployeId) console.log(`      ${email}`);
    console.log("   Ces comptes n'auront pas de custom:employeId dans leur jeton.");
  }

  if (!SIMULER) {
    console.log(`\n   Créés : ${crees}   Ignorés : ${ignores}   Échecs : ${echecs}`);
    console.log(`\n   Mot de passe commun : ${MOT_DE_PASSE}`);
    console.log("   À changer avant toute mise en production.\n");
  } else {
    console.log("\n   Relance sans --simuler pour créer réellement les comptes.\n");
  }
}

/** Liste les comptes existants du pool — utile pour vérifier après coup */
async function inventaire() {
  let jeton;
  const utilisateurs = [];
  do {
    const res = await cognito.send(new ListUsersCommand({
      UserPoolId: POOL_ID,
      PaginationToken: jeton,
    }));
    utilisateurs.push(...(res.Users || []));
    jeton = res.PaginationToken;
  } while (jeton);

  console.log(`\n👥 ${utilisateurs.length} compte(s) dans le pool\n`);
  for (const u of utilisateurs) {
    const email = u.Attributes.find((a) => a.Name === "email")?.Value;
    const employeId = u.Attributes.find((a) => a.Name === "custom:employeId")?.Value;
    console.log(`   ${String(email).padEnd(32)} ${u.UserStatus.padEnd(10)} ${employeId || "—"}`);
  }
  console.log();
}

const action = args.includes("--inventaire") ? inventaire() : principal();
action.catch((e) => {
  console.error("\nErreur :", e.message);
  process.exit(1);
});