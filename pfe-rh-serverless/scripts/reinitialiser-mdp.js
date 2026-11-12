// scripts/reinitialiser-mdp.js
//
// Impose un mot de passe connu aux comptes de test, sans courriel ni
// étape de changement obligatoire.
//
// Lancer depuis la racine de pfe-rh-serverless :
//
//   node scripts\reinitialiser-mdp.js --liste
//       montre les fiches, qui a un compte Cognito, et ne change rien
//
//   node scripts\reinitialiser-mdp.js --email karim@entreprise.tn
//       un seul compte
//
//   node scripts\reinitialiser-mdp.js --tous
//       tous les salariés de la table, même mot de passe
//
//   node scripts\reinitialiser-mdp.js --tous --mdp Terra2026@
//
// ── Pourquoi --tous doit être demandé explicitement ─────────────────
//
// Imposer un mot de passe efface le précédent sans retour possible.
// Sur un groupe d'utilisateurs de développement c'est sans
// conséquence, mais la même commande lancée par distraction sur le
// groupe de production réinitialiserait les accès de tout le monde.
// D'où le mode par défaut qui se contente de lister.

const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } =
  require("@aws-sdk/lib-dynamodb");

// ── Arguments ───────────────────────────────────────────────────────

function argument(nom, defaut) {
  const i = process.argv.indexOf(`--${nom}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : defaut;
}

const drapeau = (nom) => process.argv.includes(`--${nom}`);

const unSeul = argument("email", null)?.trim().toLowerCase();
const tous = drapeau("tous");
const listeSeule = drapeau("liste") || (!unSeul && !tous);

// Satisfait la politique Cognito par défaut : au moins huit
// caractères, une majuscule, une minuscule, un chiffre, un symbole.
const motDePasse = argument("mdp", "Terra2026@");

// ── Configuration, lue là où elle vit déjà ──────────────────────────

function lireEnv(chemin) {
  if (!existsSync(chemin)) return {};

  const valeurs = {};
  for (const ligne of readFileSync(chemin, "utf8").split(/\r?\n/)) {
    if (ligne.trimStart().startsWith("#")) continue;
    const m = ligne.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) valeurs[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return valeurs;
}

const racine = join(__dirname, "..");
const env = {
  ...lireEnv(join(racine, "..", "frontend", ".env")),
  ...lireEnv(join(racine, "..", "frontend", ".env.local")),
  ...lireEnv(join(racine, ".env")),
  ...process.env,
};

const depuisEnv = (...noms) => noms.map((n) => env[n]).find(Boolean);

const poolId = argument("pool", depuisEnv(
  "VITE_COGNITO_USER_POOL_ID", "VITE_USER_POOL_ID", "VITE_COGNITO_POOL_ID",
  "COGNITO_USER_POOL_ID", "USER_POOL_ID", "COGNITO_POOL_ID",
));

const clientId = argument("client", depuisEnv(
  "VITE_COGNITO_CLIENT_ID", "VITE_COGNITO_APP_CLIENT_ID", "VITE_CLIENT_ID",
  "COGNITO_CLIENT_ID", "COGNITO_APP_CLIENT_ID",
));

// La région est portée en préfixe par l'identifiant du groupe —
// « eu-west-3_aBcDeF ». C'est la source la plus fiable : elle vient du
// groupe lui-même, pas d'une variable qu'on a pu oublier de mettre à
// jour. Un compte créé ou modifié dans la mauvaise région existe sans
// permettre de se connecter.
const region = argument("region",
  (poolId?.includes("_") ? poolId.split("_")[0] : undefined)
  ?? depuisEnv("VITE_COGNITO_REGION", "VITE_AWS_REGION",
               "COGNITO_REGION", "AWS_REGION"));

// ── Salariés ────────────────────────────────────────────────────────

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: env.DYNAMODB_REGION || "eu-west-1",
  endpoint: env.DYNAMODB_ENDPOINT || "http://localhost:8000",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
}));

async function salaries() {
  const res = await docClient.send(new ScanCommand({
    TableName: env.TABLE_EMPLOYES || "Employes-local",
    ProjectionExpression: "id, email, prenom, nom, poste, statut",
  }));

  return (res.Items ?? [])
    .filter((e) => e.email)
    .map((e) => ({ ...e, email: String(e.email).trim().toLowerCase() }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

// ── Cognito ─────────────────────────────────────────────────────────

function clientCognito() {
  const { CognitoIdentityProviderClient } =
    require("@aws-sdk/client-cognito-identity-provider");
  return new CognitoIdentityProviderClient({ region });
}

/** Groupes du compte, ou null s'il n'existe pas dans ce groupe d'utilisateurs. */
async function etatCompte(cognito, email) {
  const { AdminGetUserCommand, AdminListGroupsForUserCommand } =
    require("@aws-sdk/client-cognito-identity-provider");

  try {
    await cognito.send(new AdminGetUserCommand({
      UserPoolId: poolId, Username: email,
    }));
  } catch (e) {
    if (e.name === "UserNotFoundException") return null;
    throw e;
  }

  const g = await cognito.send(new AdminListGroupsForUserCommand({
    UserPoolId: poolId, Username: email,
  }));

  return (g.Groups ?? []).map((x) => x.GroupName);
}

async function imposer(cognito, email) {
  const { AdminSetUserPasswordCommand } =
    require("@aws-sdk/client-cognito-identity-provider");

  // Permanent : sans cela Cognito place le compte en
  // FORCE_CHANGE_PASSWORD et exige un changement à la première
  // connexion, ce qui bloque un compte de test.
  await cognito.send(new AdminSetUserPasswordCommand({
    UserPoolId: poolId,
    Username: email,
    Password: motDePasse,
    Permanent: true,
  }));
}

async function verifier(cognito, email) {
  if (!clientId) return "non vérifié";

  const { InitiateAuthCommand } =
    require("@aws-sdk/client-cognito-identity-provider");

  try {
    const res = await cognito.send(new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: clientId,
      AuthParameters: { USERNAME: email, PASSWORD: motDePasse },
    }));

    return res.AuthenticationResult?.IdToken
      ? "connexion vérifiée"
      : `étape demandée : ${res.ChallengeName}`;
  } catch (e) {
    return `échec ${e.name}`;
  }
}

// ── Exécution ───────────────────────────────────────────────────────

(async () => {
  const liste = await salaries();

  if (liste.length === 0) {
    console.log("Aucun salarié dans la table.");
    return;
  }

  if (!poolId || !region) {
    console.log(
      "✖  Configuration Cognito introuvable."
      + `\n   groupe : ${poolId ?? "absent"} · région : ${region ?? "absente"}`
      + "\n\n   Select-String -Path ..\\frontend\\.env -Pattern \"COGNITO\""
      + "\n   puis --pool eu-west-3_xxxxx\n"
    );
    return;
  }

  const cognito = clientCognito();
  const cibles = unSeul ? liste.filter((e) => e.email === unSeul) : liste;

  if (unSeul && cibles.length === 0) {
    console.log(`Aucune fiche avec le courriel ${unSeul}.`);
    return;
  }

  console.log(`\ngroupe ${poolId} · région ${region}`);
  console.log(listeSeule
    ? "mode liste — aucun mot de passe n'est modifié\n"
    : `mot de passe imposé : ${motDePasse}\n`);

  for (const e of cibles) {
    const groupes = await etatCompte(cognito, e.email).catch(() => "erreur");

    if (groupes === "erreur") {
      console.log(`  ✖  ${e.email.padEnd(32)} lecture impossible`);
      continue;
    }

    if (groupes === null) {
      console.log(`  —  ${e.email.padEnd(32)} aucun compte Cognito`);
      continue;
    }

    const roles = groupes.length ? groupes.join(", ") : "aucun groupe";

    if (listeSeule) {
      console.log(`  •  ${e.email.padEnd(32)} ${roles}`);
      continue;
    }

    await imposer(cognito, e.email);
    const verdict = await verifier(cognito, e.email);
    console.log(`  ✔  ${e.email.padEnd(32)} ${roles} · ${verdict}`);
  }

  if (listeSeule) {
    console.log(
      "\nPour imposer le mot de passe :"
      + "\n  node scripts\\reinitialiser-mdp.js --tous"
      + "\n  node scripts\\reinitialiser-mdp.js --email karim@entreprise.tn\n"
    );
  } else {
    console.log(`\nTous les comptes traités utilisent ${motDePasse}\n`);
  }

  const sansCompte = [];
  for (const e of liste) {
    if ((await etatCompte(cognito, e.email).catch(() => null)) === null) {
      sansCompte.push(e.email);
    }
  }

  if (sansCompte.length) {
    console.log(
      `${sansCompte.length} fiche(s) sans compte de connexion :`
      + `\n  ${sansCompte.join("\n  ")}`
      + "\n\nCrée-les avec creer-employe-test.js, en reprenant le même courriel.\n"
    );
  }
})().catch((e) => {
  console.error(`\n✖  Échec : ${e.name} — ${e.message}`);
  process.exit(1);
});