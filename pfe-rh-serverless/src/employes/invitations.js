// src/employes/invitations.js
//
// Le compte d'un salarié ne s'inscrit pas : il est invité.
//
// ── Pourquoi pas d'inscription libre pour les salariés ─────────────
//
// `SignUp` laisse n'importe qui créer un compte avec n'importe quelle
// adresse. Pour un candidat c'est le bon comportement — il postule, il
// n'appartient pas encore à l'entreprise. Pour un salarié, non : son
// compte doit naître de la décision de la RH, et porter son identifiant
// de fiche. Sinon rien ne relie le compte Cognito à la personne dont on
// gère les congés et la paie.
//
// ── LE DÉFAUT QUE CETTE VERSION CORRIGE ────────────────────────────
//
// La version précédente faisait :
//
//     DesiredDeliveryMediums: ["EMAIL"]
//
// Cognito envoie alors le mot de passe provisoire **à l'adresse du
// compte**, c'est-à-dire l'adresse professionnelle. Or cette adresse
// est un IDENTIFIANT que HR UP fabrique ; ce n'est pas forcément une
// boîte aux lettres qui existe. Pour une PME qui démarre,
// `nourane.turki@esprit.tn` n'existe nulle part tant que son
// hébergeur de messagerie ne l'a pas créée.
//
// Résultat : le mot de passe partait dans le vide. Cognito répondait
// « envoyé », la RH cochait la case, et le salarié n'a jamais rien
// reçu. Une panne silencieuse, et la pire sorte : tout indiquait que
// ça avait marché.
//
// Désormais :
//
//   1. On fabrique nous-mêmes le mot de passe provisoire, donc on le
//      connaît ;
//   2. `MessageAction: "SUPPRESS"` empêche Cognito d'envoyer quoi que
//      ce soit ;
//   3. les accès partent vers `emailPerso` — l'adresse personnelle,
//      la seule dont on sait qu'elle fonctionne, puisque c'est par
//      elle que la personne a postulé ;
//   4. et ils sont **toujours** rendus à la RH, qui peut les
//      transmettre elle-même. Sans serveur d'envoi configuré, c'est le
//      seul chemin — et il vaut mieux qu'il soit explicite que
//      supposé.
//
// ── Sur le fait de rendre un mot de passe dans une réponse HTTP ────
//
// Ce n'est pas anodin, et c'est assumé. Ce mot de passe est
// provisoire : il expire (`TemporaryPasswordValidityDays`, 7 jours par
// défaut) et doit être changé à la première connexion. Il ne donne
// rien d'autre qu'un premier accès. La réponse ne part que vers la RH,
// qui est précisément la personne qui décide de créer ce compte.
//
// L'alternative — un lien de première connexion à usage unique —
// demande une table, une expiration, une route publique et un envoi
// de courriel qui fonctionne. C'est le bon choix en production ; ça
// n'en est pas un quand l'envoi de courriel est justement ce qui
// manque.

const {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminDisableUserCommand,
  AdminSetUserPasswordCommand,
} = require("@aws-sdk/client-cognito-identity-provider");
const { GetCommand, UpdateCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, corpsDe, estRh } = require("../utils/identite");
const entreprise = require("../factures/entreprise");
const adresse = require("../utils/adresse");

const TABLE_EMPLOYES = process.env.TABLE_EMPLOYES || "Employes-local";
const POOL = process.env.COGNITO_USER_POOL_ID;
const REGION = process.env.AWS_REGION || "eu-west-3";

/** Expéditeur SES. Absent → aucun envoi, les accès sont seulement affichés. */
const SES_EXPEDITEUR = process.env.SES_EXPEDITEUR || "";
/** Où le salarié se connecte, pour l'écrire dans le courriel */
const URL_APP = process.env.URL_APPLICATION || "http://localhost:5173";

const cognito = new CognitoIdentityProviderClient({ region: REGION });

const GROUPES = ["RH", "EMPLOYE"];

/** L'état du compte, tel que l'affiche la page des salariés. */
const ETATS = {
  SANS_COMPTE: "SANS_COMPTE",
  INVITE: "INVITE",       // invitation partie, mot de passe pas encore choisi
  ACTIF: "ACTIF",         // le salarié a choisi son mot de passe
  DESACTIVE: "DESACTIVE",
};

/** Comment les accès ont été transmis */
const ENVOIS = {
  COURRIEL: "COURRIEL",       // partis par SES vers l'adresse personnelle
  A_REMETTRE: "A_REMETTRE",   // la RH doit les transmettre elle-même
};

// ── Lecture de la fiche ────────────────────────────────────────────

async function fichePar(id) {
  const { Item } = await docClient.send(new GetCommand({
    TableName: TABLE_EMPLOYES, Key: { id },
  }));
  return Item || null;
}

/**
 * Cette adresse est-elle déjà utilisée ?
 *
 * Les deux côtés sont interrogés. Un compte Cognito peut exister sans
 * fiche — un ancien salarié dont la fiche a été archivée — et une
 * fiche peut exister sans compte. Ne regarder qu'un seul côté produit
 * un `UsernameExistsException` au pire moment, ou deux personnes sur
 * la même adresse.
 */
async function adressePrise(email) {
  try {
    const r = await docClient.send(new QueryCommand({
      TableName: TABLE_EMPLOYES,
      IndexName: "email-index",
      KeyConditionExpression: "email = :e",
      ExpressionAttributeValues: { ":e": email },
      Limit: 1,
    }));
    if ((r.Items ?? []).length > 0) return true;
  } catch (e) {
    // L'index peut manquer en local. On ne bloque pas pour autant :
    // Cognito reste interrogé, et c'est lui qui refuserait le doublon.
    if (e.name !== "ValidationException" && e.name !== "ResourceNotFoundException") throw e;
  }

  if (!POOL) return false;
  try {
    await cognito.send(new AdminGetUserCommand({ UserPoolId: POOL, Username: email }));
    return true;
  } catch (e) {
    if (e.name === "UserNotFoundException") return false;
    throw e;
  }
}

/**
 * L'adresse professionnelle appartient-elle à l'entreprise ?
 *
 * Sans domaine déclaré dans Réglages › Entreprise, rien n'est refusé :
 * l'absence de réglage ne doit pas empêcher d'inviter. Avec un domaine
 * déclaré, une adresse hors domaine est refusée — c'est ce qui attrape
 * le gmail personnel saisi par erreur dans la case professionnelle.
 */
async function verifierDomaine(email) {
  const ent = await entreprise.charger();
  if (entreprise.emailAppartient(email, ent.domaines)) return null;

  const liste = (ent.domaines || []).map((d) => `@${d}`).join(", ");
  return erreur(
    `L'adresse ${email} n'appartient pas à l'entreprise. Les domaines `
    + `déclarés sont ${liste}. Attribuez-lui une adresse professionnelle `
    + `depuis sa fiche, ou ajoutez le domaine dans Réglages › Entreprise.`,
    400
  );
}

// ── État du compte dans Cognito ────────────────────────────────────

async function etatCompte(email) {
  try {
    const u = await cognito.send(new AdminGetUserCommand({
      UserPoolId: POOL, Username: email,
    }));
    if (u.Enabled === false) return ETATS.DESACTIVE;
    // FORCE_CHANGE_PASSWORD : l'invitation est partie, le salarié n'a
    // pas encore choisi son mot de passe.
    return u.UserStatus === "FORCE_CHANGE_PASSWORD" ? ETATS.INVITE : ETATS.ACTIF;
  } catch (e) {
    if (e.name === "UserNotFoundException") return ETATS.SANS_COMPTE;
    throw e;
  }
}

// ── Envoi des accès ────────────────────────────────────────────────

function corpsCourriel({ prenom, identifiant, motDePasse, societe }) {
  const nom = prenom ? ` ${prenom}` : "";
  return {
    sujet: `Vos accès à ${societe}`,
    texte:
      `Bonjour${nom},\n\n`
      + `Votre espace ${societe} est ouvert.\n\n`
      + `Adresse de connexion : ${URL_APP}\n`
      + `Identifiant : ${identifiant}\n`
      + `Mot de passe provisoire : ${motDePasse}\n\n`
      + `À votre première connexion, il vous sera demandé de choisir `
      + `votre propre mot de passe. Ce mot de passe provisoire expire `
      + `sous quelques jours.\n\n`
      + `Attention : votre identifiant est ${identifiant}, et non `
      + `l'adresse à laquelle vous lisez ce message.\n\n`
      + `— ${societe}`,
  };
}

/**
 * Tente l'envoi, et dit honnêtement s'il a eu lieu.
 *
 * Ne lève jamais : un envoi raté ne doit pas annuler la création du
 * compte, qui, elle, a réussi. La RH reçoit alors les accès à l'écran
 * et les transmet — plutôt qu'une erreur qui laisserait un compte créé
 * et une RH persuadée que rien ne s'est passé.
 */
async function envoyerAcces({ destinataire, prenom, identifiant, motDePasse, societe }) {
  if (!SES_EXPEDITEUR || !destinataire) {
    return { envoi: ENVOIS.A_REMETTRE, raison: !destinataire
      ? "aucune adresse personnelle sur la fiche"
      : "aucun expéditeur configuré (SES_EXPEDITEUR)" };
  }

  try {
    // Chargé ici et non en haut du fichier : `@aws-sdk/client-ses`
    // n'est pas forcément installé, et son absence ne doit pas
    // empêcher le module entier de se charger.
    // eslint-disable-next-line global-require
    const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
    const ses = new SESClient({ region: REGION });
    const { sujet, texte } = corpsCourriel({ prenom, identifiant, motDePasse, societe });

    await ses.send(new SendEmailCommand({
      Source: SES_EXPEDITEUR,
      Destination: { ToAddresses: [destinataire] },
      Message: {
        Subject: { Data: sujet, Charset: "UTF-8" },
        Body: { Text: { Data: texte, Charset: "UTF-8" } },
      },
    }));

    return { envoi: ENVOIS.COURRIEL, destinataire };
  } catch (e) {
    console.error(`[invitations] Envoi SES impossible (${e.name}) : ${e.message}`);
    return {
      envoi: ENVOIS.A_REMETTRE,
      raison: e.name === "MessageRejected" || e.name === "MessageRejectedException"
        ? `SES a refusé l'envoi vers ${destinataire} (adresse non vérifiée ?)`
        : `l'envoi a échoué (${e.name})`,
    };
  }
}

// ── POST /employes/:id/invitation ──────────────────────────────────

async function handlerInviter(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);
  if (!estRh(moi)) return erreur("Accès réservé aux ressources humaines", 403);
  if (!POOL) return erreur("COGNITO_USER_POOL_ID n'est pas configuré", 503);

  const id = event.pathParameters?.id;
  if (!id) return erreur("Identifiant de salarié manquant", 400);

  const fiche = await fichePar(id);
  if (!fiche) return erreur(`Aucun salarié ${id}`, 404);

  const email = String(fiche.email ?? "").trim().toLowerCase();
  if (!email) {
    return erreur(
      "Ce salarié n'a pas d'adresse professionnelle sur sa fiche. "
      + "Attribuez-lui-en une avant de l'inviter : c'est elle qui lui "
      + "servira d'identifiant.",
      400
    );
  }

  const refus = await verifierDomaine(email);
  if (refus) return refus;

  const corps = corpsDe(event);
  const groupe = GROUPES.includes(corps.groupe) ? corps.groupe : "EMPLOYE";

  const etat = await etatCompte(email);

  // Un compte déjà actif ne se réinvite pas : ce serait remettre un mot
  // de passe temporaire sur un compte dont le salarié se sert. S'il l'a
  // perdu, c'est « mot de passe oublié » qu'il lui faut.
  if (etat === ETATS.ACTIF) {
    return erreur(
      `${email} a déjà un compte actif. Pour l'aider à retrouver son `
      + `accès, utilisez « mot de passe oublié » depuis l'écran de `
      + `connexion : cela ne réinitialise rien tant qu'il n'a pas suivi `
      + `le lien.`,
      409
    );
  }

  if (etat === ETATS.DESACTIVE) {
    return erreur(
      `Le compte de ${email} a été désactivé. Réactivez-le avant de `
      + `renvoyer une invitation.`,
      409
    );
  }

  const motDePasse = adresse.motDePasseProvisoire();

  const attributs = [
    { Name: "email", Value: email },
    // Vérifiée d'office : c'est la RH qui l'a saisie. Sans ça, « mot de
    // passe oublié » refuserait de fonctionner plus tard.
    { Name: "email_verified", Value: "true" },
    { Name: "given_name", Value: String(fiche.prenom ?? "").slice(0, 60) || "—" },
    { Name: "family_name", Value: String(fiche.nom ?? "").slice(0, 60) || "—" },
    // Le lien entre le compte et la fiche. C'est lui qui permet à
    // l'API de savoir de quel salarié parle un jeton.
    { Name: "custom:employeId", Value: String(fiche.id) },
  ];
  if (fiche.departement) {
    attributs.push({ Name: "custom:departement", Value: String(fiche.departement).slice(0, 60) });
  }

  try {
    if (etat === ETATS.INVITE) {
      // Le compte attend encore. `RESEND` était l'ancien chemin, mais
      // il RENVOIE un courriel — vers l'adresse professionnelle, donc
      // vers le vide. On repose simplement un nouveau mot de passe
      // provisoire : le compte reste en FORCE_CHANGE_PASSWORD.
      await cognito.send(new AdminSetUserPasswordCommand({
        UserPoolId: POOL, Username: email,
        Password: motDePasse, Permanent: false,
      }));
      // L'attribut peut manquer sur un compte créé avant cette règle.
      await cognito.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: POOL, Username: email,
        UserAttributes: [{ Name: "custom:employeId", Value: String(fiche.id) }],
      }));
    } else {
      await cognito.send(new AdminCreateUserCommand({
        UserPoolId: POOL,
        Username: email,
        UserAttributes: attributs,
        TemporaryPassword: motDePasse,
        // Le cœur du correctif : Cognito n'envoie rien. C'est nous qui
        // transmettons, vers une adresse dont on sait qu'elle existe.
        MessageAction: "SUPPRESS",
      }));
    }
  } catch (e) {
    if (e.name === "UsernameExistsException") {
      return erreur(`Un compte existe déjà pour ${email}`, 409);
    }
    if (e.name === "InvalidPasswordException") {
      // Le pool exige une politique plus stricte que celle qu'on vise.
      return erreur(
        "Le mot de passe provisoire engendré ne satisfait pas la "
        + "politique du pool Cognito. Assouplissez-la, ou prévenez-moi "
        + `pour que je l'adapte : ${e.message}`,
        500
      );
    }
    if (e.name === "InvalidParameterException") {
      return erreur(`Adresse refusée par le service d'authentification : ${e.message}`, 400);
    }
    if (e.name === "LimitExceededException") {
      return erreur("Trop d'invitations envoyées. Réessayez dans quelques minutes.", 429);
    }
    throw e;
  }

  // Le groupe porte l'autorisation : c'est le jeton d'identité qui dit
  // le rôle, pas un champ de la fiche. Hors du try : si le compte
  // existait déjà en INVITE, son groupe peut manquer.
  await cognito.send(new AdminAddUserToGroupCommand({
    UserPoolId: POOL, Username: email, GroupName: groupe,
  }));

  const ent = await entreprise.charger();
  const emailPerso = String(fiche.emailPerso ?? "").trim().toLowerCase() || null;

  const resultat = await envoyerAcces({
    destinataire: emailPerso,
    prenom: fiche.prenom,
    identifiant: email,
    motDePasse,
    societe: ent.nom || "votre entreprise",
  });

  // Tracé sur la fiche : la RH doit voir d'un coup d'œil qui a été
  // invité et quand, sans interroger Cognito salarié par salarié.
  //
  // Le mot de passe n'y est PAS écrit. Il vit le temps de cette
  // réponse, et pas une ligne de plus.
  await docClient.send(new UpdateCommand({
    TableName: TABLE_EMPLOYES,
    Key: { id },
    UpdateExpression:
      "SET compteEtat = :e, compteInviteLe = :q, compteInvitePar = :p, "
      + "compteGroupe = :g, compteAccesEnvoiA = :d",
    ExpressionAttributeValues: {
      ":e": ETATS.INVITE,
      ":q": new Date().toISOString(),
      ":p": moi.email ?? "RH",
      ":g": groupe,
      ":d": resultat.envoi === ENVOIS.COURRIEL ? emailPerso : null,
    },
    ConditionExpression: "attribute_exists(id)",
  }));

  const parCourriel = resultat.envoi === ENVOIS.COURRIEL;

  return succes({
    message: parCourriel
      ? `Accès envoyés à ${emailPerso}. L'identifiant de connexion reste ${email}.`
      : `Compte créé. Les accès sont à remettre à ${fiche.prenom ?? "la personne"} `
        + `— ${resultat.raison}.`,
    etat: ETATS.INVITE,
    groupe,

    // Ce que la RH doit pouvoir lire et recopier.
    identifiant: email,
    motDePasseProvisoire: motDePasse,
    envoi: resultat.envoi,
    envoyeA: parCourriel ? emailPerso : null,
    raison: parCourriel ? null : resultat.raison,
    urlConnexion: URL_APP,
  });
}

// ── POST /employes/:id/adresse-professionnelle ─────────────────────
//
// La régularisation d'une fiche encore sur une adresse personnelle.
// C'est l'action vers laquelle mène le bandeau de l'annuaire.
//
// L'ancienne adresse n'est pas jetée : elle devient `emailPerso`,
// c'est-à-dire le seul endroit où l'on saura joindre la personne pour
// lui remettre ses accès.

async function handlerAdressePro(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);
  if (!estRh(moi)) return erreur("Accès réservé aux ressources humaines", 403);

  const id = event.pathParameters?.id;
  if (!id) return erreur("Identifiant de salarié manquant", 400);

  const fiche = await fichePar(id);
  if (!fiche) return erreur(`Aucun salarié ${id}`, 404);

  const ancienne = String(fiche.email ?? "").trim().toLowerCase();
  const ent = await entreprise.charger();
  const domaines = entreprise.domainesDe(ent.domaines);

  const corps = corpsDe(event);
  const imposee = String(corps.email ?? "").trim().toLowerCase();

  let nouvelle;
  if (imposee) {
    // La RH a saisi l'adresse elle-même : on la vérifie, on ne la
    // fabrique pas.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(imposee)) {
      return erreur(`« ${imposee} » n'est pas une adresse de courriel.`, 400);
    }
    if (!entreprise.emailAppartient(imposee, domaines)) {
      return erreur(
        `${imposee} n'appartient pas à l'entreprise `
        + `(${domaines.map((d) => `@${d}`).join(", ")}).`,
        400
      );
    }
    if (imposee !== ancienne && await adressePrise(imposee)) {
      return erreur(`${imposee} est déjà utilisée par quelqu'un d'autre.`, 409);
    }
    nouvelle = imposee;
  } else {
    const r = await adresse.fabriquer({
      prenom: fiche.prenom,
      nom: fiche.nom,
      domaine: domaines[0],
      // Sa PROPRE adresse ne compte pas comme prise. Sans cette garde,
      // relancer la régularisation sur une fiche déjà en règle
      // trouvait son adresse occupée — par elle-même — et proposait
      // `ouma.elkachai2@esprit.tn`. On veut au contraire retomber sur
      // la même adresse, et répondre « c'est déjà la sienne ».
      estPrise: async (e) => e !== ancienne && adressePrise(e),
    });
    if (r.erreur) return erreur(r.erreur, 400);
    nouvelle = r.email;
  }

  if (nouvelle === ancienne) {
    return erreur(`${ancienne} est déjà l'adresse professionnelle de cette fiche.`, 409);
  }

  // Un compte existe peut-être déjà sur l'ancienne adresse. On ne le
  // renomme pas : Cognito ne sait pas changer un `Username`. La RH
  // invitera sur la nouvelle, et l'ancien compte sera désactivé.
  const ancienCompte = POOL && ancienne ? await etatCompte(ancienne) : ETATS.SANS_COMPTE;

  // L'ancienne adresse devient l'adresse personnelle — sauf si elle
  // appartenait déjà à l'entreprise : on ne range pas une adresse
  // professionnelle dans la case « personnelle ».
  const emailPerso = ancienne && adresse.estPersonnelle(ancienne, domaines)
    ? ancienne
    : (fiche.emailPerso ?? null);

  await docClient.send(new UpdateCommand({
    TableName: TABLE_EMPLOYES,
    Key: { id },
    UpdateExpression: "SET email = :n, emailPerso = :p, emailModifieLe = :q",
    ExpressionAttributeValues: {
      ":n": nouvelle,
      ":p": emailPerso,
      ":q": new Date().toISOString(),
    },
    ConditionExpression: "attribute_exists(id)",
  }));

  return succes({
    message: emailPerso
      ? `Adresse professionnelle ${nouvelle}. L'ancienne (${emailPerso}) est `
        + `conservée comme adresse personnelle : c'est là que partiront ses accès.`
      : `Adresse professionnelle ${nouvelle}.`,
    email: nouvelle,
    emailPerso,
    // Prévenir plutôt que laisser découvrir : la RH doit savoir qu'un
    // compte existe encore sur l'ancienne adresse.
    ancienCompte: ancienCompte === ETATS.SANS_COMPTE ? null : {
      email: ancienne,
      etat: ancienCompte,
      avertissement:
        `Un compte existe toujours sur ${ancienne}. Après avoir invité `
        + `la personne sur sa nouvelle adresse, désactivez l'ancien.`,
    },
  });
}

// ── GET /employes/:id/compte ───────────────────────────────────────

async function handlerEtatCompte(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);
  if (!estRh(moi)) return erreur("Accès réservé aux ressources humaines", 403);
  if (!POOL) return erreur("COGNITO_USER_POOL_ID n'est pas configuré", 503);

  const id = event.pathParameters?.id;
  const fiche = await fichePar(id);
  if (!fiche) return erreur(`Aucun salarié ${id}`, 404);

  const email = String(fiche.email ?? "").trim().toLowerCase();
  const ent = await entreprise.charger();
  const domaines = entreprise.domainesDe(ent.domaines);

  if (!email) {
    return succes({
      etat: ETATS.SANS_COMPTE, email: null,
      emailPerso: fiche.emailPerso ?? null,
      adressePersonnelle: false,
    });
  }

  const etat = await etatCompte(email);

  return succes({
    etat,
    email,
    emailPerso: fiche.emailPerso ?? null,
    // Ce que la page Salariés affiche en pastille « à régulariser ».
    adressePersonnelle: adresse.estPersonnelle(email, domaines),
    inviteLe: fiche.compteInviteLe ?? null,
    invitePar: fiche.compteInvitePar ?? null,
    accesEnvoiA: fiche.compteAccesEnvoiA ?? null,
    groupe: fiche.compteGroupe ?? null,
  });
}

// ── DELETE /employes/:id/compte ────────────────────────────────────
//
// Désactiver et non supprimer : un départ n'efface pas l'historique.
// Le compte ne peut plus se connecter, et ses bulletins, ses congés et
// ses pièces restent attachés à son identifiant.

async function handlerDesactiver(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);
  if (!estRh(moi)) return erreur("Accès réservé aux ressources humaines", 403);
  if (!POOL) return erreur("COGNITO_USER_POOL_ID n'est pas configuré", 503);

  const id = event.pathParameters?.id;
  const fiche = await fichePar(id);
  if (!fiche) return erreur(`Aucun salarié ${id}`, 404);

  const corps = corpsDe(event);
  // Permet de fermer un ancien compte resté sur l'adresse d'avant la
  // régularisation, qui n'est plus celle de la fiche.
  const email = String(corps.email ?? fiche.email ?? "").trim().toLowerCase();
  if (!email) return erreur("Ce salarié n'a pas de compte", 400);

  if (moi.email && moi.email.toLowerCase() === email) {
    // Sans cette garde, la dernière RH de l'entreprise peut se fermer
    // la porte, et plus personne ne peut rouvrir.
    return erreur("Vous ne pouvez pas désactiver votre propre compte.", 400);
  }

  try {
    await cognito.send(new AdminDisableUserCommand({
      UserPoolId: POOL, Username: email,
    }));
  } catch (e) {
    if (e.name === "UserNotFoundException") {
      return erreur(`Aucun compte pour ${email}`, 404);
    }
    throw e;
  }

  // On ne marque la fiche que si c'est bien SON compte qu'on ferme.
  if (email === String(fiche.email ?? "").trim().toLowerCase()) {
    await docClient.send(new UpdateCommand({
      TableName: TABLE_EMPLOYES,
      Key: { id },
      UpdateExpression: "SET compteEtat = :e",
      ExpressionAttributeValues: { ":e": ETATS.DESACTIVE },
      ConditionExpression: "attribute_exists(id)",
    }));
  }

  return succes({
    message: `Le compte de ${email} ne peut plus se connecter. Ses données restent intactes.`,
    etat: ETATS.DESACTIVE,
  });
}

// ── Pannes prévisibles ─────────────────────────────────────────────

function protege(handler) {
  return async (event) => {
    try {
      return await handler(event);
    } catch (e) {
      if (e.name === "NotAuthorizedException" || e.name === "AccessDeniedException") {
        console.error(`[invitations] Droits IAM insuffisants : ${e.message}`);
        return erreur(
          "La fonction n'a pas le droit d'administrer les comptes. "
          + "Ajoutez cognito-idp:AdminCreateUser, AdminAddUserToGroup, "
          + "AdminGetUser, AdminUpdateUserAttributes, AdminSetUserPassword "
          + "et AdminDisableUser à son rôle.",
          503
        );
      }
      if (e.name === "ResourceNotFoundException") {
        return erreur("Le pool Cognito configuré n'existe pas.", 503);
      }
      throw e;
    }
  };
}

module.exports = {
  handlerInviter: protege(handlerInviter),
  handlerAdressePro: protege(handlerAdressePro),
  handlerEtatCompte: protege(handlerEtatCompte),
  handlerDesactiver: protege(handlerDesactiver),
  etatCompte,
  verifierDomaine,
  adressePrise,
  ETATS,
  ENVOIS,
  GROUPES,
};