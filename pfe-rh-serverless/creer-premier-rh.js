// creer-premier-rh.js
//
// À poser à la RACINE de pfe-rh-serverless, puis :
//   node creer-premier-rh.js rh@terra.tn Nourane Turki
//                            rh@rhup.tn  rh rh 
// ── Pourquoi un script et pas un rôle « super-admin » ──────────────
//
// Il faut bien un premier compte RH, et seule la RH peut inviter : œuf
// et poule. Deux façons d'en sortir.
//
// Un rôle SUPER_ADMIN coûterait un quatrième groupe Cognito, une barre
// latérale, une page d'administration, et un contrôle de permission
// dans chaque module — le tout pour une action qu'on fait UNE fois dans
// la vie de l'installation.
//
// Ce script coûte quarante lignes et se lance au même moment que la
// création des tables. C'est le même raisonnement que `aws configure` :
// l'amorçage se fait avec les droits de l'administrateur de
// l'infrastructure, pas depuis l'application.
//
// Le compte créé reçoit un mot de passe temporaire et un courriel
// d'invitation, exactement comme un salarié : la personne choisit son
// mot de passe à sa première connexion. Le script ne connaît donc
// jamais le mot de passe réel.

const {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
  ListUsersInGroupCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

const POOL = process.env.COGNITO_USER_POOL_ID;
const REGION = process.env.AWS_REGION || "eu-west-3";

const [email, prenom, nom] = process.argv.slice(2);

function sortir(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

if (!POOL) {
  sortir(
    "COGNITO_USER_POOL_ID n'est pas défini.\n"
    + '  PowerShell :  $env:COGNITO_USER_POOL_ID = "eu-west-3_Lll3mXpYr"'
    
  );
}
if (!email || !prenom || !nom) {
  sortir("Usage : node creer-premier-rh.js <email> <prénom> <nom>");
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  sortir(`« ${email} » n'est pas une adresse de courriel.`);
}

const cognito = new CognitoIdentityProviderClient({ region: REGION });

(async () => {
  console.log(`\nPool   : ${POOL}`);
  console.log(`Région : ${REGION}`);
  console.log(`Compte : ${email}\n`);

  // Un garde-fou, pas une interdiction : le script sert à amorcer, et
  // si une RH existe déjà, c'est depuis l'application qu'il faut
  // inviter la suivante — elle y trace qui a invité qui.
  try {
    const { Users } = await cognito.send(new ListUsersInGroupCommand({
      UserPoolId: POOL, GroupName: "RH", Limit: 5,
    }));
    if (Users?.length > 0 && !process.argv.includes("--force")) {
      console.log("Des comptes RH existent déjà :");
      for (const u of Users) console.log(`  · ${u.Username}`);
      sortir(
        "Invitez les RH suivantes depuis l'application : Salariés › "
        + "le salarié › Inviter.\n  Pour passer outre : --force"
      );
    }
  } catch (e) {
    if (e.name === "ResourceNotFoundException") {
      sortir(
        `Le groupe « RH » n'existe pas dans ${POOL}.\n`
        + "  Crée les trois groupes RH, EMPLOYE et CANDIDAT avant ce script."
      );
    }
    throw e;
  }

  let existait = false;
  try {
    await cognito.send(new AdminGetUserCommand({ UserPoolId: POOL, Username: email }));
    existait = true;
    console.log("⚠  Ce compte existe déjà — il sera seulement rattaché au groupe RH.");
  } catch (e) {
    if (e.name !== "UserNotFoundException") throw e;
  }

  if (!existait) {
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: POOL,
      Username: email,
      UserAttributes: [
        { Name: "email", Value: email },
        // Sans cela, Cognito refuse d'envoyer l'invitation.
        { Name: "email_verified", Value: "true" },
        { Name: "given_name", Value: prenom },
        { Name: "family_name", Value: nom },
      ],
      DesiredDeliveryMediums: ["EMAIL"],
    }));
    console.log("✔  Compte créé, invitation envoyée");
  }

  await cognito.send(new AdminAddUserToGroupCommand({
    UserPoolId: POOL, Username: email, GroupName: "RH",
  }));
  console.log("✔  Rattaché au groupe RH");

  console.log(
    `\n✓ ${prenom} ${nom} peut se connecter.`
    + `\n  Un courriel contenant un mot de passe TEMPORAIRE est parti à ${email}.`
    + `\n  À la première connexion, l'application demandera de choisir le vrai`
    + `\n  mot de passe — c'est le défi NEW_PASSWORD_REQUIRED de Cognito.`
    + `\n`
    + `\n  Ensuite : Réglages › Entreprise pour l'identité de la société,`
    + `\n  puis Salariés pour inviter les autres.\n`
  );
})().catch((e) => {
  if (e.name === "AccessDeniedException" || e.name === "NotAuthorizedException") {
    sortir(
      `Droits insuffisants : ${e.message}\n`
      + "  Ton profil AWS doit pouvoir faire AdminCreateUser et\n"
      + "  AdminAddUserToGroup sur ce pool."
    );
  }
  if (e.name === "InvalidParameterException") {
    sortir(
      `Paramètre refusé : ${e.message}\n`
      + "  Vérifie que le pool accepte l'adresse comme nom d'utilisateur."
    );
  }
  sortir(`${e.name} : ${e.message}`);
});