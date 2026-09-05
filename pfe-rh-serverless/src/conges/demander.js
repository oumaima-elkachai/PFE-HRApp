// src/conges/demander.js
// POST /conges

const { PutCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, estRole } = require("../utils/contexte");
const employes = require("../utils/employe");
const { v4: uuidv4 } = require("uuid");

const TABLE_CONGES = process.env.TABLE_CONGES || "Conges-local";

const JOURS_FERIES = [
  "2026-01-01", "2026-01-14", "2026-03-20", "2026-04-09",
  "2026-05-01", "2026-07-25", "2026-08-13", "2026-10-15",
];

const TYPES_VALIDES = ["annuel", "maladie", "sans_solde", "exceptionnel"];

const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Les dates calendaires ne passent jamais par toISOString(), qui
// convertit en UTC et décale d'un jour en Tunisie.
const enChaine = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const depuisChaine = (s) => {
  const [a, m, j] = s.split("-").map(Number);
  return new Date(a, m - 1, j);
};

function estWeekend(dateStr) {
  const jour = depuisChaine(dateStr).getDay();
  return jour === 0 || jour === 6;
}

function nbJoursOuvrables(dateDebut, dateFin) {
  let total = 0;
  const curseur = depuisChaine(dateDebut);
  const fin = depuisChaine(dateFin);
  while (curseur <= fin) {
    const jour = enChaine(curseur);
    if (!estWeekend(jour) && !JOURS_FERIES.includes(jour)) total++;
    curseur.setDate(curseur.getDate() + 1);
  }
  return total;
}

/** Refuse une demande qui recouvre une période déjà demandée ou accordée */
async function chevauchement(employeId, dateDebut, dateFin) {
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_CONGES,
    IndexName: "employe-index",
    KeyConditionExpression: "employeId = :e AND dateDebut <= :fin",
    FilterExpression: "dateFin >= :debut AND #s IN (:attente, :approuve)",
    ExpressionAttributeNames: { "#s": "statut" },
    ExpressionAttributeValues: {
      ":e": employeId,
      ":fin": dateFin,
      ":debut": dateDebut,
      ":attente": "EN_ATTENTE",
      ":approuve": "APPROUVE",
    },
  }));
  return (res.Items || [])[0] || null;
}

exports.handler = async (event) => {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || {});
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const { type, dateDebut, dateFin, motif, employeId: employeIdDemande } = body;

    if (!type || !dateDebut || !dateFin) {
      return erreur("type, dateDebut et dateFin sont requis", 400);
    }
    if (!TYPES_VALIDES.includes(type)) {
      return erreur(`type doit valoir : ${TYPES_VALIDES.join(", ")}`, 400);
    }
    if (!FORMAT_DATE.test(dateDebut) || !FORMAT_DATE.test(dateFin)) {
      return erreur("Les dates doivent être au format AAAA-MM-JJ", 400);
    }
    // Comparaison lexicographique : exacte sur ce format, sans objet Date
    if (dateFin < dateDebut) {
      return erreur("dateFin doit être postérieure à dateDebut", 400);
    }

    // La RH peut déposer une demande pour un tiers ; un employé, jamais.
    let fiche;
    if (employeIdDemande && estRole(moi, "RH")) {
      fiche = await employes.parId(employeIdDemande);
    } else {
      fiche = await employes.courant(moi);
    }
    if (!fiche) return erreur("Employé introuvable", 404);

    const conflit = await chevauchement(fiche.id, dateDebut, dateFin);
    if (conflit) {
      return erreur(
        `Une demande existe déjà sur cette période (du ${conflit.dateDebut} au ${conflit.dateFin}, statut ${conflit.statut})`,
        409
      );
    }

    const nbJours = nbJoursOuvrables(dateDebut, dateFin);
    if (nbJours === 0) {
      return erreur("La période ne contient aucun jour ouvrable", 400);
    }

    const conge = {
      id: uuidv4(),
      employeId: fiche.id,
      employeNom: `${fiche.prenom} ${fiche.nom}`,
      type,
      dateDebut,
      dateFin,
      nbJours,
      motif: motif || "",
      // Statut en majuscules, aligné sur le reste de l'application
      statut: "EN_ATTENTE",
      demandeLe: new Date().toISOString(),
      demandeParId: moi.userId,
    };

    await docClient.send(new PutCommand({ TableName: TABLE_CONGES, Item: conge }));

    return succes({
      conge,
      message: `Demande envoyée : ${nbJours} jour(s) ouvrable(s)`,
    }, 201);

  } catch (e) {
    console.error("Erreur demande congé:", e);
    return erreur("Erreur lors de la demande de congé : " + e.message);
  }
};