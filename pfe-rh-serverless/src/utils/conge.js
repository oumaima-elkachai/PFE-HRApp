// src/utils/conge.js
//
// Une seule question : ce salarié est-il en congé accordé tel jour ?
//
// ── Pourquoi un module à part ───────────────────────────────────────
//
// La réponse sert au pointage, mais elle servira aussi au planning et
// aux relances. Écrite dans arrivee.js, elle aurait été recopiée au
// deuxième appelant, et les deux copies auraient divergé au premier
// correctif — c'est exactement ce qui est arrivé au calcul du retard.
//
// ── Ce qui bloque, et ce qui ne bloque pas ──────────────────────────
//
// Seul un congé APPROUVÉ bloque. Une demande en attente ne vaut pas
// autorisation d'absence : tant que la RH n'a pas tranché, le salarié
// est censé travailler, et l'empêcher de pointer reviendrait à lui
// faire perdre sa journée parce qu'une validation traîne.
//
// Tous les types accordés bloquent, y compris le congé sans solde :
// il ne consomme pas le compteur annuel, mais c'est bien une absence.

const { QueryCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("./dynamodb");

const TABLE_CONGES = process.env.TABLE_CONGES || "Conges-local";

// Index par salarié : clé de partition `employeId`, clé de tri
// `dateDebut`. C'est le même que celui qu'interroge le contrôle de
// chevauchement de conges/demander.js, et la clé de tri est ce qui
// permet de borner la lecture au lieu de relire tout l'historique.
const INDEX_EMPLOYE = process.env.INDEX_CONGES_EMPLOYE || "employe-index";

const APPROUVE = "APPROUVE";

/** « 2026-11-09T00:00:00Z » comme « 2026-11-09 » donnent « 2026-11-09 ». */
const jour = (v) => String(v ?? "").slice(0, 10);

/**
 * Congés accordés d'un salarié couvrant une date.
 *
 * ── Pourquoi la condition est en deux morceaux ──────────────────────
 *
 * Un congé couvre `cible` si `dateDebut <= cible <= dateFin`.
 *
 * La première moitié porte sur la clé de tri de l'index : elle entre
 * donc dans la KeyConditionExpression, et DynamoDB ne lit que les
 * congés commencés avant la date. La seconde porte sur un attribut
 * ordinaire : elle ne peut être qu'un filtre, appliqué après lecture.
 *
 * C'est la différence à connaître : une KeyCondition réduit ce qui est
 * LU — donc le coût ; un Filter réduit seulement ce qui est RENVOYÉ.
 */
async function parIndex(employeId, cible) {
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_CONGES,
    IndexName: INDEX_EMPLOYE,
    KeyConditionExpression: "employeId = :e AND dateDebut <= :cible",
    FilterExpression: "dateFin >= :cible AND #s = :approuve",
    ExpressionAttributeNames: { "#s": "statut" },
    ExpressionAttributeValues: {
      ":e": employeId,
      ":cible": cible,
      ":approuve": APPROUVE,
    },
  }));

  return res.Items ?? [];
}

/**
 * Repli si l'index n'existe pas sous ce nom.
 *
 * Il est présent dans la base locale et sur AWS au moment où ces
 * lignes sont écrites. Le repli reste parce que son absence ne
 * provoquerait aucune erreur visible : la vérification échouerait en
 * silence et des salariés en congé pointeraient sans que personne ne
 * comprenne pourquoi le contrôle « ne marche pas ».
 *
 * Le parcours est paginé. DynamoDB arrête un Scan à un mégaoctet et
 * rend une clé de reprise ; l'ignorer fait disparaître les
 * enregistrements au-delà, sans erreur.
 */
async function parParcours(employeId, cible) {
  const items = [];
  let suite;

  do {
    const res = await docClient.send(new ScanCommand({
      TableName: TABLE_CONGES,
      FilterExpression:
        "employeId = :e AND dateDebut <= :cible AND dateFin >= :cible AND #s = :approuve",
      ExpressionAttributeNames: { "#s": "statut" },
      ExpressionAttributeValues: {
        ":e": employeId,
        ":cible": cible,
        ":approuve": APPROUVE,
      },
      ExclusiveStartKey: suite,
    }));

    items.push(...(res.Items ?? []));
    suite = res.LastEvaluatedKey;
  } while (suite);

  return items;
}

/**
 * Le salarié est-il en congé accordé ce jour-là ?
 *
 * @param {string} employeId  identifiant de la FICHE employé
 * @param {string} date       « AAAA-MM-JJ »
 * @returns {Promise<{ enConge: boolean, conge: object|null, indisponible: boolean }>}
 *
 * ── Pourquoi l'échec laisse passer ──────────────────────────────────
 *
 * Si la table est injoignable, le résultat est « pas en congé », avec
 * `indisponible: true`.
 *
 * Le choix inverse — bloquer en cas de doute — paraît plus prudent et
 * ne l'est pas : une table momentanément indisponible empêcherait
 * TOUTE l'entreprise de pointer, le matin, sans que personne comprenne
 * pourquoi. À l'inverse, laisser passer produit au pire un pointage
 * d'un salarié en vacances, que la RH voit dans son suivi et corrige
 * en deux clics.
 *
 * On choisit la panne visible et réparable plutôt que la panne
 * bloquante.
 */
async function enCongeLe(employeId, date) {
  const cible = jour(date);

  if (!employeId || !/^\d{4}-\d{2}-\d{2}$/.test(cible)) {
    return { enConge: false, conge: null, indisponible: false };
  }

  try {
    let couvrants;

    try {
      couvrants = await parIndex(employeId, cible);
    } catch (e) {
      // ValidationException = l'index n'existe pas sous ce nom.
      if (e.name !== "ValidationException" && e.name !== "ResourceNotFoundException") {
        throw e;
      }
      console.warn(
        `Index « ${INDEX_EMPLOYE} » introuvable sur ${TABLE_CONGES} :`
        + " la vérification des congés passe par un parcours de table."
      );
      couvrants = await parParcours(employeId, cible);
    }

    // Les comparaisons se font sur des chaînes AAAA-MM-JJ. C'est exact
    // — l'ordre lexicographique de ce format est l'ordre chronologique
    // — et c'est sans fuseau horaire : un congé se pose en jours, pas
    // en instants, donc le convertir en Date introduirait un décalage
    // là où il n'y en a pas.
    //
    // Ce contrôle répète celui de la requête. Il le double parce qu'un
    // enregistrement sans `dateFin`, ou avec une date tronquée à
    // l'heure, passerait le filtre DynamoDB sans couvrir réellement
    // la date.
    const couvrant = couvrants.find((c) => {
      if (c.statut !== APPROUVE) return false;
      const debut = jour(c.dateDebut);
      const fin = jour(c.dateFin ?? c.dateDebut);
      return debut <= cible && cible <= fin;
    });

    return {
      enConge: Boolean(couvrant),
      conge: couvrant ?? null,
      indisponible: false,
    };
  } catch (e) {
    console.error("Lecture des congés impossible :", e);
    return { enConge: false, conge: null, indisponible: true };
  }
}

/**
 * Congés accordés recouvrant une période.
 *
 * Sert au contrôle inverse : la RH accorde un congé sur des jours déjà
 * pointés. Même requête, bornée par la fin de la période.
 */
async function congesSurPeriode(employeId, debut, fin) {
  const d = jour(debut);
  const f = jour(fin ?? debut);
  if (!employeId || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return [];

  try {
    const res = await docClient.send(new QueryCommand({
      TableName: TABLE_CONGES,
      IndexName: INDEX_EMPLOYE,
      KeyConditionExpression: "employeId = :e AND dateDebut <= :fin",
      FilterExpression: "dateFin >= :debut AND #s = :approuve",
      ExpressionAttributeNames: { "#s": "statut" },
      ExpressionAttributeValues: {
        ":e": employeId,
        ":debut": d,
        ":fin": f,
        ":approuve": APPROUVE,
      },
    }));
    return res.Items ?? [];
  } catch (e) {
    console.error("Lecture des congés sur période impossible :", e);
    return [];
  }
}

/**
 * Phrase destinée au salarié.
 *
 * Elle nomme la période : « vous êtes en congé » sans dates laisse
 * croire à une erreur quand le congé se termine le jour même.
 */
function messageRefus(conge) {
  const debut = jour(conge?.dateDebut);
  const fin = jour(conge?.dateFin ?? conge?.dateDebut);

  const enFrancais = (d) => {
    const [a, m, j] = d.split("-");
    return `${Number(j)}/${m}/${a}`;
  };

  const periode = debut === fin
    ? `le ${enFrancais(debut)}`
    : `du ${enFrancais(debut)} au ${enFrancais(fin)}`;

  return `Vous êtes en congé ${periode}. Le pointage reprend à votre retour.`
    + " Si ce congé a été annulé, contactez les ressources humaines.";
}

module.exports = {
  enCongeLe,
  congesSurPeriode,
  messageRefus,
  TABLE_CONGES,
  INDEX_EMPLOYE,
  APPROUVE,
};