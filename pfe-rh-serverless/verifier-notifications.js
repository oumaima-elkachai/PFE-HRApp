// verifier-notifications.js
//
// À lancer depuis la racine du projet :
//
//     node verifier-notifications.js
//
// ── Ce que ce script cherche ────────────────────────────────────────
//
// Une notification est écrite avec un champ `userId`. La page des
// notifications en lit avec un `userId` elle aussi. Si les deux ne
// désignent pas le même identifiant, la table se remplit et l'écran
// reste vide — sans aucune erreur, ni côté serveur ni côté navigateur.
//
// Trois identifiants circulent dans l'application, et ils ne sont
// reliés que par l'adresse e-mail :
//
//     Cognito          sub        créé à l'inscription
//     Users-local      id         créé par l'application
//     Employes-local   id         créé par la RH
//
// Le script lit les trois tables et dit à quel espace appartiennent
// les `userId` des notifications. C'est la réponse qu'on ne peut pas
// obtenir en relisant le code : il faut regarder les données.

process.env.DYNAMODB_ENDPOINT =
  process.env.DYNAMODB_ENDPOINT || "http://localhost:8000";

const { ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("./src/utils/dynamodb");

const TABLE_NOTIFICATIONS = process.env.TABLE_NOTIFICATIONS || "Notifications-local";
const TABLE_USERS = process.env.TABLE_USERS || "Users-local";
const TABLE_EMPLOYES = process.env.TABLE_EMPLOYES || "Employes-local";

/**
 * Parcours complet et paginé.
 *
 * DynamoDB arrête un Scan à un mégaoctet et rend une clé de reprise.
 * L'ignorer ferait disparaître les enregistrements au-delà, sans
 * erreur — et un diagnostic qui ne voit qu'une partie des données
 * donne une réponse fausse avec aplomb.
 */
async function lireTout(table) {
  const items = [];
  let suite;

  do {
    const res = await docClient.send(new ScanCommand({
      TableName: table,
      ExclusiveStartKey: suite,
    }));
    items.push(...(res.Items ?? []));
    suite = res.LastEvaluatedKey;
  } while (suite);

  return items;
}

/**
 * Analyse pure : aucune entrée-sortie, donc vérifiable sans base.
 *
 * @returns un verdict lisible, et les chiffres qui le fondent
 */
function analyser(notifications, users, employes) {
  const idsUsers = new Set(users.map((u) => u.id).filter(Boolean));
  const idsEmployes = new Set(employes.map((e) => e.id).filter(Boolean));

  const compte = {
    total: notifications.length,
    sansUserId: 0,
    versUsers: 0,
    versEmployes: 0,
    versLesDeux: 0,
    orphelines: 0,
  };

  const orphelines = [];

  for (const n of notifications) {
    const cible = n.userId;

    if (!cible) { compte.sansUserId += 1; continue; }

    const dansUsers = idsUsers.has(cible);
    const dansEmployes = idsEmployes.has(cible);

    if (dansUsers && dansEmployes) compte.versLesDeux += 1;
    else if (dansUsers) compte.versUsers += 1;
    else if (dansEmployes) compte.versEmployes += 1;
    else {
      compte.orphelines += 1;
      orphelines.push(n);
    }
  }

  // Le verdict porte sur l'espace majoritaire : c'est lui qui dit à
  // quoi les écritures font référence aujourd'hui.
  let verdict;

  if (compte.total === 0) {
    verdict = "VIDE";
  } else if (compte.orphelines === compte.total) {
    verdict = "ORPHELINES";
  } else if (compte.versEmployes > compte.versUsers) {
    verdict = "FICHES_EMPLOYES";
  } else if (compte.versUsers > compte.versEmployes) {
    verdict = "COMPTES_USERS";
  } else {
    verdict = "MELANGE";
  }

  return { compte, orphelines, verdict };
}

const EXPLICATIONS = {
  VIDE:
    "La table ne contient aucune notification. Le problème est à "
    + "l'écriture, pas à la lecture : rien n'est jamais enregistré.",

  ORPHELINES:
    "Aucun userId ne correspond à un compte ni à une fiche. Les "
    + "notifications sont écrites avec un identifiant d'un troisième "
    + "espace — probablement le sub Cognito.",

  FICHES_EMPLOYES:
    "Les notifications sont adressées à des identifiants de FICHE "
    + "EMPLOYÉ (Employes-local.id).\n"
    + "   Si la page les lit avec l'identifiant du COMPTE, elle ne "
    + "trouvera jamais rien.",

  COMPTES_USERS:
    "Les notifications sont adressées à des identifiants de COMPTE "
    + "(Users-local.id).\n"
    + "   Si la page les lit avec l'identifiant de la FICHE, elle ne "
    + "trouvera jamais rien.",

  MELANGE:
    "Les notifications mélangent les deux espaces. Certaines "
    + "s'afficheront, d'autres jamais, selon qui les a écrites.",
};

async function principal() {
  console.log("\n╭──────────────────────────────────────────────────╮");
  console.log("│  Diagnostic des notifications                    │");
  console.log("╰──────────────────────────────────────────────────╯\n");

  let notifications;
  let users;
  let employes;

  try {
    [notifications, users, employes] = await Promise.all([
      lireTout(TABLE_NOTIFICATIONS),
      lireTout(TABLE_USERS),
      lireTout(TABLE_EMPLOYES),
    ]);
  } catch (e) {
    console.error("Lecture impossible :", e.message);
    console.error(
      "\nVérifiez que DynamoDB Local tourne, et que les tables "
      + `« ${TABLE_NOTIFICATIONS} », « ${TABLE_USERS} » et `
      + `« ${TABLE_EMPLOYES} » existent.\n`
    );
    process.exit(1);
  }

  console.log(`Notifications : ${notifications.length}`);
  console.log(`Comptes       : ${users.length}`);
  console.log(`Fiches        : ${employes.length}\n`);

  const { compte, orphelines, verdict } = analyser(notifications, users, employes);

  console.log("── Répartition des destinataires ──\n");
  console.log(`  vers un compte (Users)        ${compte.versUsers}`);
  console.log(`  vers une fiche (Employes)     ${compte.versEmployes}`);
  console.log(`  vers les deux à la fois       ${compte.versLesDeux}`);
  console.log(`  vers rien de connu            ${compte.orphelines}`);
  console.log(`  sans destinataire             ${compte.sansUserId}\n`);

  console.log("── Verdict ──\n");
  console.log(`   ${EXPLICATIONS[verdict]}\n`);

  // ── Les plus récentes ──
  //
  // Une notification ancienne peut venir d'une version précédente du
  // code. Ce sont les dernières qui disent ce que l'application écrit
  // aujourd'hui.
  const recentes = [...notifications]
    .sort((a, b) => String(b.creeLe ?? "").localeCompare(String(a.creeLe ?? "")))
    .slice(0, 5);

  if (recentes.length > 0) {
    console.log("── Les cinq plus récentes ──\n");

    for (const n of recentes) {
      const cible = n.userId ?? "(aucun)";
      const connu = users.some((u) => u.id === cible) ? "compte"
        : employes.some((e) => e.id === cible) ? "fiche"
        : "INCONNU";

      console.log(`  ${String(n.creeLe ?? "?").slice(0, 16)}  ${n.type ?? "?"}`);
      console.log(`     destinataire : ${cible}  → ${connu}`);
      console.log(`     titre        : ${n.titre ?? "(sans titre)"}`);
      console.log(`     lu           : ${n.lu === true ? "oui" : "non"}\n`);
    }
  }

  if (orphelines.length > 0) {
    console.log("── Destinataires inconnus ──\n");
    const distincts = [...new Set(orphelines.map((n) => n.userId))].slice(0, 10);
    for (const id of distincts) console.log(`  ${id}`);
    console.log();
  }

  // ── Expiration ──
  //
  // Les notifications portent un champ `expireLe` en secondes. Si la
  // table a le TTL activé sur ce champ, DynamoDB les efface tout seul
  // à l'échéance. Une notification disparue n'est alors pas un bogue.
  const maintenant = Math.floor(Date.now() / 1000);
  const expirees = notifications.filter(
    (n) => Number.isFinite(n.expireLe) && n.expireLe < maintenant
  );

  if (expirees.length > 0) {
    console.log(
      `── ${expirees.length} notification(s) ont dépassé leur date `
      + "d'expiration et sont encore là.\n"
      + "   Le TTL n'est donc pas activé sur la table, ou pas sur le "
      + "champ « expireLe ».\n"
    );
  }

  console.log("── Et maintenant ──\n");
  console.log("  Ouvre le fichier qui LIT les notifications");
  console.log("  (src/notifications/lister.js, ou l'équivalent chez toi)");
  console.log("  et regarde quel identifiant il utilise dans sa requête.");
  console.log("  Il doit être du même espace que celui affiché ci-dessus.\n");
}

// Exporté pour les essais : l'analyse se vérifie sans base de données.
module.exports = { analyser, EXPLICATIONS };

if (require.main === module) {
  principal().catch((e) => {
    console.error("Diagnostic interrompu :", e);
    process.exit(1);
  });
}