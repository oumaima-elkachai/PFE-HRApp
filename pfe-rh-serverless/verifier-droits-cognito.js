// verifier-droits-cognito.js
//
// À poser à la RACINE de pfe-rh-serverless, puis :
//   node verifier-droits-cognito.js
//
// Il essaie les cinq opérations, une par une, et dit lesquelles
// passent. Rien n'est créé ni modifié : chaque appel porte sur un
// utilisateur qui n'existe pas, et `UserNotFoundException` suffit à
// prouver qu'on avait le droit de demander.
//
// Pourquoi ce script : « ça marche en local mais pas déployé » est le
// symptôme le plus courant, et il n'a rien à voir avec le code. En
// local, le SDK emprunte TES identifiants AWS, qui sont souvent ceux
// d'un administrateur. Déployée, la Lambda emprunte son rôle
// d'exécution, qui ne contient que ce qu'on y a mis.

const {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  AdminUpdateUserAttributesCommand,
  AdminDisableUserCommand,
  ListUsersInGroupCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

// ── Lire le .env tout seul ─────────────────────────────────────────
//
// Sans ça, il faut poser COGNITO_USER_POOL_ID dans le terminal avant
// chaque lancement, et `$env:` disparaît à la fermeture de la fenêtre.
// Dix lignes ici évitent une étape qu'on oublie une fois sur deux.
//
// Les variables déjà présentes dans l'environnement l'emportent : une
// valeur posée à la main doit pouvoir forcer celle du fichier.

const fs = require("fs");
const path = require("path");

for (const nom of [".env", ".env.local", path.join("..", ".env")]) {
  const chemin = path.join(__dirname, nom);
  if (!fs.existsSync(chemin)) continue;
  for (const ligne of fs.readFileSync(chemin, "utf8").split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!m) continue;
    const cle = m[1];
    // Guillemets droits ou doubles retirés, commentaire de fin ignoré.
    const valeur = m[2].trim()
      .replace(/\s+#.*$/, "")
      .replace(/^["']|["']$/g, "");
    if (!(cle in process.env) && valeur) process.env[cle] = valeur;
  }
}

const POOL = process.env.COGNITO_USER_POOL_ID;
const REGION = process.env.AWS_REGION || "eu-west-3";

if (!POOL) {
  console.error(
    "\n✗ COGNITO_USER_POOL_ID n'est pas défini."
    + "\n\n  Ajoute cette ligne au `.env` posé à côté de ce script :"
    + "\n    COGNITO_USER_POOL_ID=eu-west-3_xxxxxxxxx"
    + "\n\n  Ou, pour cette fenêtre seulement :"
    + '\n    $env:COGNITO_USER_POOL_ID = "eu-west-3_xxxxxxxxx"\n'
  );
  process.exit(1);
}

const cognito = new CognitoIdentityProviderClient({ region: REGION });

// Une adresse qui n'existera jamais : les commandes échouent toutes en
// UserNotFoundException, ce qui prouve le droit sans rien toucher.
const FANTOME = "verification-des-droits-ne-pas-creer@exemple.invalid";

const essais = [
  ["AdminGetUser", () => new AdminGetUserCommand({
    UserPoolId: POOL, Username: FANTOME })],
  ["AdminAddUserToGroup", () => new AdminAddUserToGroupCommand({
    UserPoolId: POOL, Username: FANTOME, GroupName: "EMPLOYE" })],
  ["AdminUpdateUserAttributes", () => new AdminUpdateUserAttributesCommand({
    UserPoolId: POOL, Username: FANTOME,
    UserAttributes: [{ Name: "custom:employeId", Value: "x" }] })],
  ["AdminDisableUser", () => new AdminDisableUserCommand({
    UserPoolId: POOL, Username: FANTOME })],
  // Celle-ci n'a pas de version inoffensive : créer un utilisateur
  // crée vraiment. On la teste avec un nom d'utilisateur refusé par
  // Cognito : l'erreur distingue « pas le droit » de « mauvais
  // paramètre », et c'est tout ce qu'on cherche à savoir.
  ["AdminCreateUser", () => new AdminCreateUserCommand({
    UserPoolId: POOL, Username: " ", MessageAction: "SUPPRESS" })],
  // Nécessaire depuis que l'invitation fabrique elle-même le mot de
  // passe provisoire. Elle ne sert qu'à la RÉinvitation : une première
  // invitation marche sans ce droit.
  ["AdminSetUserPassword", () => new AdminSetUserPasswordCommand({
    UserPoolId: POOL, Username: FANTOME,
    Password: "Verification#2026", Permanent: false })],
];

(async () => {
  console.log(`\nPool   : ${POOL}`);
  console.log(`Région : ${REGION}\n`);

  // D'abord : le pool existe-t-il, et les trois groupes ?
  const groupes = [];
  for (const g of ["RH", "EMPLOYE", "CANDIDAT"]) {
    try {
      await cognito.send(new ListUsersInGroupCommand({
        UserPoolId: POOL, GroupName: g, Limit: 1,
      }));
      groupes.push(`  ✔ ${g}`);
    } catch (e) {
      if (e.name === "ResourceNotFoundException") {
        groupes.push(`  ✗ ${g} — absent du pool`);
      } else if (/AccessDenied|NotAuthorized/.test(e.name)) {
        groupes.push(`  ? ${g} — droit ListUsersInGroup manquant`);
      } else {
        groupes.push(`  ✗ ${g} — ${e.name}`);
      }
    }
  }
  console.log("Groupes :");
  console.log(groupes.join("\n"));

  console.log("\nDroits :");
  const manquants = [];

  for (const [nom, faire] of essais) {
    try {
      await cognito.send(faire());
      console.log(`  ✔ ${nom}`);
    } catch (e) {
      // Ces erreurs prouvent qu'on avait le droit de demander : la
      // requête est arrivée jusqu'à la logique de Cognito.
      if (["UserNotFoundException", "InvalidParameterException",
           "UserNotFoundException", "ResourceNotFoundException"].includes(e.name)) {
        console.log(`  ✔ ${nom}`);
      } else if (/AccessDenied|NotAuthorized/.test(e.name)) {
        console.log(`  ✗ ${nom} — refusé`);
        manquants.push(nom);
      } else {
        console.log(`  ? ${nom} — ${e.name} : ${e.message}`);
      }
    }
  }

  if (manquants.length === 0) {
    console.log(
      "\n✓ Toutes les opérations passent."
      + "\n  Attention : ceci teste TES identifiants, pas ceux de la Lambda."
      + "\n  En local, le serveur Express emprunte les mêmes que ce script,"
      + "\n  donc les invitations marcheront. Une fois déployé, c'est le rôle"
      + "\n  d'exécution de la Lambda qui compte.\n"
    );
    return;
  }

  console.log(
    `\n✗ ${manquants.length} opération(s) refusée(s) : ${manquants.join(", ")}`
  );

  if (manquants.length === 1 && manquants[0] === "AdminSetUserPassword") {
    console.log(
      "\n  Ce droit ne sert QU'À LA RÉINVITATION (reposer un mot de passe"
      + "\n  sur un compte qui attend encore). Une première invitation"
      + "\n  fonctionne sans lui — tu peux continuer et l'ajouter plus tard."
    );
  }

  console.log(
    "\n  OÙ L'AJOUTER, pas à pas :"
    + "\n"
    + "\n   1. Ouvre https://console.aws.amazon.com/iam/home#/users"
    + "\n   2. Clique sur ton utilisateur — celui de `aws configure`,"
    + "\n      probablement pfe-rh-dev."
    + "\n   3. Onglet « Autorisations ». Tu vois une ou plusieurs lignes"
    + "\n      de politiques. Clique sur celle qui parle de Cognito."
    + "\n      · Si elle est marquée « En ligne » (inline) : bouton"
    + "\n        « Modifier », puis onglet « JSON »."
    + "\n      · Si elle est « Gérée par le client » : clique son nom,"
    + "\n        puis « Modifier » en haut à droite, onglet « JSON »."
    + "\n      · Si elle est « Gérée par AWS » (icône orange), tu ne peux"
    + "\n        pas la modifier : reviens à l'utilisateur, « Ajouter des"
    + "\n        autorisations » › « Intégrer une politique en ligne »,"
    + "\n        onglet JSON, et colle le bloc ci-dessous entier."
    + "\n   4. Remplace le contenu par le JSON ci-dessous."
    + "\n   5. « Suivant » puis « Enregistrer les modifications »."
    + "\n      C'est immédiat : rien à redémarrer, ni ici ni sur AWS."
    + "\n   6. Relance ce script pour confirmer."
    + "\n"
    + "\n  Le JSON à coller :\n"
  );
  console.log(JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Action: [
        "cognito-idp:AdminCreateUser",
        "cognito-idp:AdminAddUserToGroup",
        "cognito-idp:AdminGetUser",
        "cognito-idp:AdminUpdateUserAttributes",
        "cognito-idp:AdminDisableUser",
        "cognito-idp:AdminSetUserPassword",
        "cognito-idp:ListUsersInGroup",
      ],
      Resource: `arn:aws:cognito-idp:${REGION}:*:userpool/${POOL}`,
    }],
  }, null, 2));
  console.log();
  process.exit(1);
})().catch((e) => {
  console.error(`\n✗ ${e.name} : ${e.message}`);
  if (/credential|UnrecognizedClient|security token/i.test(e.name + e.message)) {
    console.error(
      "  Tes identifiants AWS ne sont pas configurés ou ont expiré."
      + "\n  Lance : aws configure"
    );
  }
  process.exit(1);
});