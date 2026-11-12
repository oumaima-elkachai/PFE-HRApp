// diagnostic-invitation.js
//
// À poser à la RACINE de pfe-rh-serverless, puis :
//
//   node diagnostic-invitation.js
//   node diagnostic-invitation.js 16ae03a8-1b26-4666-b18b-78d5b6d6ab87
//
// Rejoue, une par une, les conditions que `invitations.js` vérifie
// avant d'inviter — et dit laquelle échoue. Rien n'est créé ni modifié.
//
// Le 503 a trois causes possibles, et elles se ressemblent toutes vues
// du navigateur. Ce script les sépare.

const fs = require("fs");
const path = require("path");

// ── Lire le .env, comme le ferait le serveur ───────────────────────

const fichiersEnv = [];
for (const nom of [".env", ".env.local"]) {
  const chemin = path.join(__dirname, nom);
  if (!fs.existsSync(chemin)) continue;
  fichiersEnv.push(nom);
  for (const ligne of fs.readFileSync(chemin, "utf8").split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!m) continue;
    const valeur = m[2].trim().replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
    if (!(m[1] in process.env) && valeur) process.env[m[1]] = valeur;
  }
}

const {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  ListUsersInGroupCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, ScanCommand } =
  require("@aws-sdk/lib-dynamodb");

const POOL = process.env.COGNITO_USER_POOL_ID;
const REGION = process.env.AWS_REGION || "eu-west-3";
const TABLE = process.env.TABLE_EMPLOYES || "Employes-local";
const TABLE_ENT = process.env.TABLE_ENTREPRISE || "Entreprise-local";
const POINT = process.env.DYNAMODB_ENDPOINT || "http://localhost:8000";

const employeId = process.argv[2] || null;

let bloquant = 0;
const ok = (m) => console.log(`  ✔ ${m}`);
const ko = (m) => { bloquant++; console.log(`  ✗ ${m}`); };
const info = (m) => console.log(`    ${m}`);

(async () => {
  console.log("\n═══ 1. La configuration lue par le serveur ═══\n");

  console.log(`  .env trouvé(s) : ${fichiersEnv.length ? fichiersEnv.join(", ") : "AUCUN"}`);

  if (!POOL) {
    ko("COGNITO_USER_POOL_ID est ABSENT");
    info("C'est la cause numéro un du 503.");
    info("");
    info("  1. Ajoute cette ligne au .env de pfe-rh-serverless :");
    info("       COGNITO_USER_POOL_ID=eu-west-3_xxxxxxxxx");
    info("  2. ARRÊTE le serveur (Ctrl+C) et relance-le.");
    info("");
    info("  Le module lit la variable au chargement : une fois Node");
    info("  démarré, modifier le .env ne change plus rien.");
    info("");
    info("  Si ton serveur ne lit PAS le .env (pas de dotenv), pose-la");
    info("  dans la fenêtre où tu lances le serveur, juste avant :");
    info('       $env:COGNITO_USER_POOL_ID = "eu-west-3_xxxxxxxxx"');
    info("       node server.js");
  } else {
    ok(`COGNITO_USER_POOL_ID = ${POOL}`);
    if (!/^[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]{9}$/.test(POOL)) {
      ko("…mais ce format est inhabituel. Attendu : eu-west-3_xxxxxxxxx");
    }
  }
  console.log(`  AWS_REGION = ${REGION}`);
  console.log(`  TABLE_EMPLOYES = ${TABLE}`);

  // ── Le serveur lit-il bien ce .env ? ──
  //
  // Si DYNAMODB_ENDPOINT est là, c'est que le .env est chargé par ce
  // script. Ça ne prouve pas que server.js le charge aussi.
  if (fichiersEnv.length === 0) {
    info("");
    info("  Aucun .env à côté de ce script. Les variables doivent donc");
    info("  venir du terminal — et elles ne survivent pas à sa fermeture.");
  }

  if (!POOL) {
    console.log(`\n→ ${bloquant} problème bloquant. Corrige-le d'abord.\n`);
    process.exit(1);
  }

  // ── 2. Cognito ──

  console.log("\n═══ 2. Cognito ═══\n");

  const cognito = new CognitoIdentityProviderClient({ region: REGION });

  try {
    await cognito.send(new ListUsersInGroupCommand({
      UserPoolId: POOL, GroupName: "EMPLOYE", Limit: 1,
    }));
    ok("le pool existe et le groupe EMPLOYE est là");
  } catch (e) {
    if (e.name === "ResourceNotFoundException") {
      ko(`le pool ${POOL} ou le groupe EMPLOYE n'existe pas`);
      info("Vérifie l'identifiant, et la région : un pool n'existe que");
      info("dans la sienne.");
    } else if (/AccessDenied|NotAuthorized/.test(e.name)) {
      ko("droits Cognito refusés pour CE processus");
      info("Tes droits sont peut-être bons dans ton terminal mais pas");
      info("pour le serveur : vérifie qu'ils tournent sous le même");
      info("profil AWS (variable AWS_PROFILE).");
    } else {
      ko(`${e.name} : ${e.message}`);
    }
  }

  try {
    await cognito.send(new AdminGetUserCommand({
      UserPoolId: POOL, Username: "fantome-de-diagnostic@exemple.invalid",
    }));
  } catch (e) {
    if (e.name === "UserNotFoundException") {
      ok("AdminGetUser répond — les droits d'administration sont là");
    } else if (/AccessDenied|NotAuthorized/.test(e.name)) {
      ko("AdminGetUser refusé : il manque cognito-idp:AdminGetUser");
    } else {
      ko(`${e.name} : ${e.message}`);
    }
  }

  // ── 3. Le salarié ──

  console.log("\n═══ 3. Le salarié et son adresse ═══\n");

  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: REGION,
    ...(POINT ? { endpoint: POINT } : {}),
  }));

  let domaines = [];
  try {
    const { Item } = await docClient.send(new GetCommand({
      TableName: TABLE_ENT, Key: { id: "ENTREPRISE" },
    }));
    domaines = Item?.domaines ?? [];
    if (domaines.length === 0) {
      ok("aucun domaine déclaré dans Réglages › Entreprise — rien n'est refusé");
    } else {
      ok(`domaines déclarés : ${domaines.map((d) => `@${d}`).join(", ")}`);
    }
  } catch (e) {
    if (e.name === "ResourceNotFoundException") {
      ok(`table ${TABLE_ENT} absente — aucun domaine, rien n'est refusé`);
    } else {
      info(`(lecture de l'entreprise impossible : ${e.name})`);
    }
  }

  const appartient = (email) => {
    if (domaines.length === 0) return true;
    const apres = String(email).toLowerCase().split("@")[1];
    return !!apres && domaines.some((d) => apres === d || apres.endsWith(`.${d}`));
  };

  if (employeId) {
    const { Item } = await docClient.send(new GetCommand({
      TableName: TABLE, Key: { id: employeId },
    }));
    if (!Item) {
      ko(`aucun salarié ${employeId} dans ${TABLE}`);
    } else {
      ok(`${Item.prenom ?? "?"} ${Item.nom ?? "?"} trouvé`);
      if (!Item.email) ko("sa fiche n'a PAS d'adresse — rien à inviter");
      else if (!appartient(Item.email)) {
        ko(`${Item.email} hors des domaines déclarés`);
      } else ok(`adresse ${Item.email} acceptée`);
    }
  } else {
    const { Items } = await docClient.send(new ScanCommand({
      TableName: TABLE, ProjectionExpression: "id, email, prenom, nom", Limit: 10,
    }));
    const sans = (Items ?? []).filter((e) => !e.email);
    const hors = (Items ?? []).filter((e) => e.email && !appartient(e.email));
    ok(`${Items?.length ?? 0} salarié(s) lus`);
    if (sans.length) ko(`${sans.length} sans adresse`);
    if (hors.length) {
      ko(`${hors.length} avec une adresse hors domaine : `
        + hors.slice(0, 3).map((e) => e.email).join(", "));
    }
    info("Pour en examiner un : node diagnostic-invitation.js <son-id>");
  }

  console.log(
    bloquant === 0
      ? "\n✓ Tout est en place. Si le 503 persiste, c'est que le SERVEUR"
        + "\n  ne voit pas la même configuration que ce script : relance-le"
        + "\n  depuis le même dossier, après avoir mis la variable dans"
        + "\n  son .env.\n"
      : `\n→ ${bloquant} problème(s). Corrige-les dans l'ordre affiché.\n`
  );
  process.exit(bloquant === 0 ? 0 : 1);
})().catch((e) => {
  console.error(`\n✗ ${e.name} : ${e.message}`);
  if (/ECONNREFUSED/.test(e.message)) {
    console.error(`  DynamoDB Local ne répond pas sur ${POINT}.`);
    console.error("  Lance-le avant ce script.");
  }
  if (/credential|UnrecognizedClient|security token/i.test(e.name + e.message)) {
    console.error("  Identifiants AWS absents ou expirés : aws configure");
  }
  process.exit(1);
});