// src/pointages/cloture.js
//
// Clôture des journées dont le départ n'a jamais été pointé.
//
// ── Le problème ─────────────────────────────────────────────────────
//
// Un salarié pointe son arrivée et part sans pointer son départ. Le
// segment reste ouvert. Trois conséquences, toutes mauvaises :
//
//   • la page du salarié affiche un compteur qui tourne toute la nuit ;
//   • `recalculer()` laisse `heureDepart` à null et `dureeMinutes` à
//     zéro, puisque seuls les segments FERMÉS alimentent les champs
//     stockés — la journée compte donc zéro heure dans la paie ;
//   • le lendemain, `ouvrir()` refuse le nouveau pointage en 409 :
//     « Une pause est en cours » ou « Vous êtes déjà pointé ».
//
// ── Le circuit de rattrapage ne couvrait pas ce cas ─────────────────
//
// La demande de correction existe déjà, mais elle écrit le pointage
// avec `ConditionExpression: "attribute_not_exists(employeId)"` : elle
// ne sait créer une journée que si elle n'existe pas. Or ici, elle
// existe — c'est justement son départ qui manque. La RH accepte la
// demande, l'écriture échoue.
//
// ── Ce que cette clôture fait, et ce qu'elle ne fait pas ────────────
//
// Elle NE DEVINE PAS l'heure de départ. Personne ne la connaît. Elle
// ferme le segment à l'heure de référence du contrat, marque la
// journée `clotureAutomatique` et `aVerifier`, et laisse la RH
// trancher. Une heure inventée présentée comme un fait serait pire
// qu'un trou visible.
//
// ── Deux façons de la déclencher ────────────────────────────────────
//
//   1. Au prochain pointage du salarié (appel depuis arrivee.js).
//      Aucune infrastructure, fonctionne en local dès aujourd'hui.
//
//   2. Par une tâche planifiée quotidienne (EventBridge → Lambda sur
//      `exports.handler`). C'est la réponse de production : elle
//      n'attend pas que le salarié revienne, donc la paie est juste
//      même s'il est absent une semaine.
//
// Les deux appellent le même code. Mettre les deux est cohérent : la
// tâche planifiée fait le gros du travail, l'appel au pointage rattrape
// le cas où elle n'aurait pas tourné.

const { QueryCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { dateAujourdhui } = require("../utils/contexte");
const employes = require("../utils/employe");
const journee = require("./journee");

// `instant` construit un horodatage ISO à partir d'un jour et d'une
// heure « HH:MM », interprétée dans le fuseau de l'entreprise.
//
// Il vit dans corrections.js, qui l'exporte. Sa place serait dans
// journee.js, avec les autres fonctions pures — à déplacer une fois la
// soutenance passée, pas la veille, parce que journee.js porte les
// tests du calcul des heures.
const { instant } = require("./corrections");

const TABLE_POINTAGES = process.env.TABLE_POINTAGES || "Pointages-local";

const MOTIF = "Départ non pointé : journée close automatiquement";

/**
 * Instant de fermeture d'un segment resté ouvert.
 *
 * ── Travail ──
 * L'heure de départ prévue au contrat ce jour-là. Pas l'heure
 * courante : un oubli du vendredi clos le lundi crédirait soixante-dix
 * heures. Pas le début du segment non plus : cela effacerait une
 * journée réellement travaillée.
 *
 * ── Pause ──
 * Bornée à la durée de pause contractuelle. Une pause déjeuner close à
 * 17 h afficherait « déjeuner 5h00 », ce qui est faux et ridicule. Les
 * pauses ne comptant pas dans les heures dues, ce plafond ne retire
 * aucun temps de travail au salarié.
 *
 * Dans les deux cas, jamais avant le début du segment.
 */
function finProposee(segment, fiche, dateJournee) {
  const debut = new Date(segment.debut);
  const horaire = journee.horaireDe(fiche);
  const type = segment.type ?? journee.TRAVAIL;

  if (type !== journee.TRAVAIL) {
    const minutes = Number.isFinite(horaire.pauseMinutes)
      ? horaire.pauseMinutes
      : 60;
    return new Date(debut.getTime() + minutes * 60000).toISOString();
  }

  const reference = instant(dateJournee, horaire.depart);

  // Un horaire illisible ne doit pas empêcher la clôture : on retombe
  // sur le début du segment, donc une durée nulle, visible et à
  // corriger — plutôt qu'un segment qui reste ouvert pour toujours.
  if (!reference) return segment.debut;

  return new Date(reference) < debut ? segment.debut : reference;
}

/**
 * Clôt une journée en mémoire. Fonction pure : aucun accès à la base,
 * donc vérifiable par un essai sans réseau.
 *
 * @returns { ok, journee } ou { ok: false, motif }
 */
function cloturer(journeeOuverte, fiche) {
  const ouvert = journee.segmentOuvert(journeeOuverte);
  if (!ouvert) return { ok: false, motif: "Aucun segment ouvert" };

  const fin = finProposee(ouvert, fiche, journeeOuverte.date);

  const resultat = journee.fermer(journeeOuverte, {
    fin,
    trace: {
      finMethode: "CLOTURE_AUTO",
      finAVerifier: true,
      finMotifVerification: MOTIF,
    },
  });

  if (!resultat.ok) return resultat;

  return {
    ok: true,
    journee: {
      ...resultat.journee,
      // Deux marqueurs, parce qu'ils répondent à deux questions.
      // `clotureAutomatique` dit comment la journée s'est terminée ;
      // `aVerifier` est le drapeau que la RH filtre déjà dans son
      // suivi, et qui fait remonter la journée sans écran nouveau.
      clotureAutomatique: true,
      aVerifier: true,
      motifVerification: MOTIF,
    },
  };
}

/**
 * Écrit la clôture, sous le même verrou optimiste que les pointages.
 *
 * Si le salarié pointe son départ au moment exact où la tâche tourne,
 * la version a changé et l'écriture échoue : c'est le départ réel qui
 * gagne, ce qui est l'ordre de priorité voulu.
 */
async function ecrire(journeeClose, versionAttendue) {
  await docClient.send(new PutCommand({
    TableName: TABLE_POINTAGES,
    Item: {
      ...journeeClose,
      modifieLe: new Date().toISOString(),
      version: versionAttendue + 1,
    },
    ConditionExpression: "version = :attendue",
    ExpressionAttributeValues: { ":attendue": versionAttendue },
  }));
}

/**
 * Journées encore ouvertes d'un salarié, antérieures à `avant`.
 *
 * La journée du jour est exclue : elle est légitimement ouverte tant
 * que le salarié travaille.
 */
async function journeesOuvertes(employeId, avant) {
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_POINTAGES,
    KeyConditionExpression: "employeId = :e AND #d < :avant",
    ExpressionAttributeNames: { "#d": "date" },
    ExpressionAttributeValues: { ":e": employeId, ":avant": avant },
    ScanIndexForward: false,
    // Une semaine suffit au rattrapage courant ; la tâche planifiée
    // s'occupe du reste, et remonter toute la carrière à chaque
    // pointage coûterait une lecture complète pour rien.
    Limit: 7,
  }));

  return (res.Items ?? []).filter((j) => journee.segmentOuvert(j));
}

/**
 * Rattrapage au pointage : clôt les journées oubliées d'un salarié.
 *
 * N'échoue jamais. Appelée au début d'une arrivée, une exception ici
 * empêcherait le pointage du jour — on refuserait au salarié de
 * pointer parce qu'il a oublié hier, ce qui est l'inverse du but.
 *
 * @returns {Promise<number>} nombre de journées closes
 */
async function rattraper(employeId, fiche, aujourdhui = dateAujourdhui()) {
  try {
    const ouvertes = await journeesOuvertes(employeId, aujourdhui);
    let closes = 0;

    for (const j of ouvertes) {
      const resultat = cloturer(j, fiche);
      if (!resultat.ok) continue;

      try {
        await ecrire({ ...j, ...resultat.journee }, j.version ?? 0);
        closes += 1;
      } catch (e) {
        // Conflit de version : quelqu'un a écrit entre-temps. Ce n'est
        // pas une erreur, c'est le verrou qui fait son travail.
        if (e.name !== "ConditionalCheckFailedException") throw e;
      }
    }

    return closes;
  } catch (e) {
    console.error("Rattrapage des journées ouvertes impossible :", e);
    return 0;
  }
}

/**
 * Tâche planifiée — une exécution par jour, après l'heure de départ.
 *
 * Parcourt l'index des journées EN_COURS plutôt que la table entière :
 * l'index ne contient que les journées ouvertes, donc la lecture est
 * proportionnelle au nombre d'oublis, pas au nombre de pointages.
 *
 * Déclenchement sur AWS, dans serverless.yml :
 *
 *     clotureJournees:
 *       handler: src/pointages/cloture.handler
 *       events:
 *         - schedule: cron(0 21 * * ? *)   # 21:00 UTC, soit 22:00 à Tunis
 */
exports.handler = async () => {
  const aujourdhui = dateAujourdhui();
  const bilan = { examinees: 0, closes: 0, erreurs: 0 };

  try {
    let suite;

    do {
      const res = await docClient.send(new QueryCommand({
        TableName: TABLE_POINTAGES,
        IndexName: "statut-index",
        KeyConditionExpression: "#s = :s AND #d < :avant",
        ExpressionAttributeNames: { "#s": "statut", "#d": "date" },
        ExpressionAttributeValues: { ":s": "EN_COURS", ":avant": aujourdhui },
        ExclusiveStartKey: suite,
      }));

      for (const j of res.Items ?? []) {
        bilan.examinees += 1;

        try {
          // L'horaire de référence vit sur la fiche : sans elle, la
          // clôture tomberait sur l'horaire par défaut, qui peut ne pas
          // être celui de ce salarié.
          const fiche = await employes.parId?.(j.employeId) ?? null;

          const resultat = cloturer(j, fiche);
          if (!resultat.ok) continue;

          await ecrire({ ...j, ...resultat.journee }, j.version ?? 0);
          bilan.closes += 1;
        } catch (e) {
          if (e.name === "ConditionalCheckFailedException") continue;
          bilan.erreurs += 1;
          console.error(`Clôture impossible — ${j.employeId} ${j.date} :`, e);
        }
      }

      suite = res.LastEvaluatedKey;
    } while (suite);

    console.log("Clôture automatique :", bilan);
    return bilan;
  } catch (e) {
    console.error("Clôture automatique interrompue :", e);
    return { ...bilan, interrompue: true };
  }
};

module.exports.cloturer = cloturer;
module.exports.finProposee = finProposee;
module.exports.rattraper = rattraper;
module.exports.journeesOuvertes = journeesOuvertes;
module.exports.MOTIF = MOTIF;