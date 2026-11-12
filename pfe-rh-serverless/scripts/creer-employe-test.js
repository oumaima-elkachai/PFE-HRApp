// scripts/creer-employe-test.js
//
// Crée un salarié de test de bout en bout : la fiche dans DynamoDB, le
// compte Cognito, le rattachement au groupe EMPLOYE — puis VÉRIFIE que
// la connexion fonctionne réellement.
//
// Lancer depuis la racine de pfe-rh-serverless :
//
//   node scripts\creer-employe-test.js
//
// Valeurs par défaut : Rayen Ben Salah, ray@entreprise.tn, Ray1234@
//
//   node scripts\creer-employe-test.js --prenom Salma --email salma@entreprise.tn
//
// ── Pourquoi la vérification finale ─────────────────────────────────
//
// Un compte Cognito créé dans la mauvaise région, ou dont le flux
// USER_PASSWORD_AUTH n'est pas activé sur le client applicatif, existe
// sans permettre de se connecter. L'erreur arrive alors dans le
// navigateur sous la forme « Adresse ou mot de passe incorrect », qui
// fait chercher du côté du mot de passe pendant une demi-heure.
//
// Le script tente donc la connexion lui-même et le dit tout de suite.

const { randomUUID } = require("node:crypto");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, ScanCommand } =
  require("@aws-sdk/lib-dynamodb");

// ── Arguments ───────────────────────────────────────────────────────

function argument(nom, defaut) {
  const i = process.argv.indexOf(`--${nom}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : defaut;
}

const prenom = argument("prenom", "Rayen");
const nom = argument("nom", "Ben Salah");

// En minuscules sans condition : Cognito distingue la casse du nom
// d'utilisateur, et le rattachement à la fiche se fait par comparaison
// exacte du courriel. Une majuscule d'un seul côté et la fiche ne se
// rattache jamais, avec une erreur qui ne dit pas pourquoi.
const email = argument("email", "ray@entreprise.tn").trim().toLowerCase();

const motDePasse = argument("mdp", "Ray1234@");
const poste = argument("poste", "Technicien de maintenance");
const departement = argument("departement", "Technique");

// ── Configuration Cognito, lue là où elle vit déjà ──────────────────
//
// Les valeurs sont cherchées dans les fichiers d'environnement du
// projet plutôt que demandées : c'est le frontend qui appelle Cognito,
// donc c'est sa configuration qui fait foi. Les redemander en ligne de
// commande invite à en saisir une autre, et un compte créé dans une
// autre région ne sert à rien.

function lireEnv(chemin) {
  if (!existsSync(chemin)) return {};

  const valeurs = {};
  for (const ligne of readFileSync(chemin, "utf8").split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || ligne.trimStart().startsWith("#")) continue;
    valeurs[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
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

/** Première valeur non vide parmi plusieurs noms possibles. */
function depuisEnv(...noms) {
  for (const n of noms) if (env[n]) return env[n];
  return undefined;
}

const poolId = argument("pool", depuisEnv(
  "VITE_COGNITO_USER_POOL_ID", "VITE_USER_POOL_ID", "VITE_COGNITO_POOL_ID",
  "COGNITO_USER_POOL_ID", "USER_POOL_ID", "COGNITO_POOL_ID",
));

const clientId = argument("client", depuisEnv(
  "VITE_COGNITO_CLIENT_ID", "VITE_COGNITO_APP_CLIENT_ID", "VITE_CLIENT_ID",
  "COGNITO_CLIENT_ID", "COGNITO_APP_CLIENT_ID",
));

// La région se déduit de l'identifiant du groupe, qui la porte en
// préfixe : « eu-west-3_aBcDeF ». C'est la source la plus fiable,
// puisqu'elle vient du groupe lui-même et non d'une variable qu'on a
// pu oublier de mettre à jour.
const region = argument("region",
  (poolId && poolId.includes("_") ? poolId.split("_")[0] : undefined)
  ?? depuisEnv("VITE_COGNITO_REGION", "VITE_AWS_REGION",
               "COGNITO_REGION", "AWS_REGION"));

// ── DynamoDB ────────────────────────────────────────────────────────
//
// La région de l'émulateur local n'a aucune importance — il l'ignore —
// mais elle ne doit pas être confondue avec celle de Cognito, qui est
// déterminante.

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: env.DYNAMODB_REGION || "eu-west-1",
  endpoint: env.DYNAMODB_ENDPOINT || "http://localhost:8000",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
}));

const TABLE_EMPLOYES = env.TABLE_EMPLOYES || "Employes-local";

/** Date d'embauche un an en arrière : l'ancienneté affichée vaut
 *  alors « 1 an », plus crédible en démonstration qu'« arrivé ce
 *  mois-ci ». */
function ilYaUnAn() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

async function creerFiche() {
  // Le doublon de courriel est écarté avant écriture : deux fiches
  // avec la même adresse rendraient le rattachement du compte
  // ambigu, et `employes.courant` en choisirait une au hasard.
  const existant = await docClient.send(new ScanCommand({
    TableName: TABLE_EMPLOYES,
    FilterExpression: "email = :e",
    ExpressionAttributeValues: { ":e": email },
    ProjectionExpression: "id, email",
  }));

  if (existant.Items?.length) {
    console.log(`⚠  Fiche déjà présente pour ${email} — id ${existant.Items[0].id}`);
    return existant.Items[0].id;
  }

  const id = randomUUID();

  await docClient.send(new PutCommand({
    TableName: TABLE_EMPLOYES,
    Item: {
      id,
      email,
      prenom,
      nom,
      poste,
      departement,
      dateEmbauche: ilYaUnAn(),
      typeContrat: "CDI",
      statut: "actif",
      salaireBase: 1200,
      telephone: "+216 20 000 000",
      creeLe: new Date().toISOString(),
    },
  }));

  console.log(`✔  Fiche créée — id ${id}`);
  return id;
}

// ── Cognito ─────────────────────────────────────────────────────────

async function creerCompte() {
  if (!poolId || !region) {
    console.log(
      "\n✖  Compte de connexion non créé : configuration Cognito introuvable."
      + `\n   groupe d'utilisateurs : ${poolId ?? "absent"}`
      + `\n   région                : ${region ?? "absente"}`
      + "\n\n   Elles se lisent dans la configuration du frontend :"
      + "\n     Select-String -Path ..\\frontend\\.env -Pattern \"COGNITO\""
      + "\n\n   Puis relance en les passant :"
      + "\n     node scripts\\creer-employe-test.js --pool eu-west-3_xxxxx"
      + "\n\n   La fiche, elle, est bien créée."
    );
    return false;
  }

  const {
    CognitoIdentityProviderClient,
    AdminCreateUserCommand,
    AdminSetUserPasswordCommand,
    AdminAddUserToGroupCommand,
  } = require("@aws-sdk/client-cognito-identity-provider");

  const cognito = new CognitoIdentityProviderClient({ region });

  try {
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: poolId,
      Username: email,
      // Aucun courriel envoyé : c'est un compte de test, et une
      // invitation partie vers une adresse inventée reste en file
      // d'attente du service d'envoi.
      MessageAction: "SUPPRESS",
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "email_verified", Value: "true" },
        { Name: "given_name", Value: prenom },
        { Name: "family_name", Value: nom },
      ],
    }));
    console.log("✔  Compte Cognito créé");
  } catch (e) {
    if (e.name !== "UsernameExistsException") throw e;
    console.log("⚠  Compte Cognito déjà existant — mot de passe réinitialisé");
  }

  // Permanent : sans cela Cognito exige un changement de mot de passe
  // à la première connexion, et le compte de test est inutilisable.
  await cognito.send(new AdminSetUserPasswordCommand({
    UserPoolId: poolId,
    Username: email,
    Password: motDePasse,
    Permanent: true,
  }));

  // Le rôle vient du groupe, pas d'un champ de la fiche : c'est le
  // jeton d'identité qui porte l'autorisation.
  await cognito.send(new AdminAddUserToGroupCommand({
    UserPoolId: poolId,
    Username: email,
    GroupName: "EMPLOYE",
  }));

  console.log("✔  Rattaché au groupe EMPLOYE");
  return true;
}

// ── Vérification de la connexion ────────────────────────────────────

async function verifierConnexion() {
  if (!clientId) {
    console.log(
      "\nℹ  Connexion non vérifiée : identifiant du client applicatif"
      + " introuvable (VITE_COGNITO_CLIENT_ID)."
    );
    return;
  }

  const { CognitoIdentityProviderClient, InitiateAuthCommand } =
    require("@aws-sdk/client-cognito-identity-provider");

  const cognito = new CognitoIdentityProviderClient({ region });

  try {
    const res = await cognito.send(new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: clientId,
      AuthParameters: { USERNAME: email, PASSWORD: motDePasse },
    }));

    if (res.AuthenticationResult?.IdToken) {
      console.log("✔  Connexion vérifiée — le compte fonctionne");
    } else {
      console.log(
        `⚠  Cognito répond « ${res.ChallengeName} » au lieu d'un jeton :`
        + " le compte existe mais une étape supplémentaire est demandée."
      );
    }
  } catch (e) {
    console.log(`\n✖  La connexion échoue : ${e.name}`);

    if (e.name === "NotAuthorizedException") {
      console.log(
        "   Le compte existe dans un autre groupe d'utilisateurs, ou le\n"
        + "   mot de passe n'a pas été appliqué. Vérifie que le groupe\n"
        + `   utilisé ici (${poolId}) est bien celui du frontend.`
      );
    } else if (e.name === "InvalidParameterException") {
      console.log(
        "   Le flux USER_PASSWORD_AUTH n'est probablement pas activé sur\n"
        + "   le client applicatif. Ce n'est pas bloquant si ton frontend\n"
        + "   utilise un autre flux : essaie la connexion dans le navigateur."
      );
    }
  }
}

// ── Exécution ───────────────────────────────────────────────────────

(async () => {
  console.log(`\nSalarié de test · ${prenom} ${nom}`);
  if (poolId) console.log(`groupe ${poolId} · région ${region}\n`);

  const id = await creerFiche();
  const avecCompte = await creerCompte();
  if (avecCompte) await verifierConnexion();

  console.log("\n─────────────────────────────────────────");
  console.log(`  ${prenom} ${nom}`);
  console.log(`  fiche         ${id}`);
  console.log(`  courriel      ${email}`);
  console.log(`  mot de passe  ${motDePasse}`);
  console.log(`  poste         ${poste} · ${departement}`);
  console.log("─────────────────────────────────────────\n");
})().catch((e) => {
  console.error(`\n✖  Échec : ${e.name} — ${e.message}`);
  process.exit(1);
});