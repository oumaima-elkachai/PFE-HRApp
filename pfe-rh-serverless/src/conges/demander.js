// src/conges/demander.js
// POST /conges

const { PutCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, estRole } = require("../utils/contexte");
const employes = require("../utils/employe");
const documents = require("../services/documents");
const { v4: uuidv4 } = require("uuid");

const TABLE_CONGES = process.env.TABLE_CONGES || "Conges-local";

const JOURS_FERIES = [
  "2026-01-01", "2026-01-14", "2026-03-20", "2026-04-09",
  "2026-05-01", "2026-07-25", "2026-08-13", "2026-10-15",
];

const TYPES_VALIDES = ["annuel","maladie","maternite","paternite","deces","sans_solde","exceptionnel"];
const JUSTIFICATIF_REQUIS = ["maladie","maternite","paternite","deces"];


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

/**
 * @param event    requête API Gateway, ou Express adaptée
 * @param fichier  pièce jointe multipart, posée par le routeur
 */
exports.handler = async (event, fichier) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    // En multipart, multer a déjà peuplé event.body avec les champs
    // texte : il n'y a plus de JSON à parser.
    const body = typeof event.body === "string"
      ? JSON.parse(event.body)
      : (event.body || {});

      //test 
    console.log("── POST /conges");
    console.log("   content-type :", event.headers?.["content-type"]);
    console.log("   corps :", body);
    console.log("   fichier :", fichier?.originalname ?? "aucun");

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

    const avecPiece = Boolean(fichier?.buffer?.length);

    if (JUSTIFICATIF_REQUIS.includes(type) && !avecPiece) {
      return erreur(
        "Ce type de congé demande un justificatif. Joignez-le à votre demande.",
        400
      );
    }

    // La RH peut déposer une demande pour un tiers ; un employé, jamais.
    let fiche;
    if (employeIdDemande && estRole(moi, "RH")) {
      fiche = await employes.parId(employeIdDemande);
    } else {
      fiche = await employes.courant(moi);
    }
   
    if (!fiche) {
  // Nommer l'adresse cherchée : « Employé introuvable » ne dit ni
  // qui, ni pourquoi, et envoie chercher le défaut dans le routeur.
  return erreur(
    `Aucune fiche employé n'est rattachée au compte ${moi.email}. `
    + `Contactez les ressources humaines.`,
    404,
  );
}
    
        const conflit = await chevauchement(fiche.id, dateDebut, dateFin);
    if (conflit) {
      const jour = (iso) =>
        new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", {
          day: "numeric", month: "long",
        });

      const etat = conflit.statut === "APPROUVE"
        ? "déjà accordée"
        : "en attente de réponse";

      // Les dates ISO et le statut en majuscules ne parlent pas à un
      // salarié : sans dates lisibles, il tâtonne.
      return erreur(
        `Vous avez déjà une demande ${etat} du ${jour(conflit.dateDebut)} `
        + `au ${jour(conflit.dateFin)}. Choisissez une période en dehors de celle-ci.`,
        409
      );
    }

    const nbJours = nbJoursOuvrables(dateDebut, dateFin);
    if (nbJours === 0) {
      return erreur("La période ne contient aucun jour ouvrable", 400);
    }

    // La pièce est écrite avant la demande : un fichier orphelin se
    // nettoie, une demande privée de sa pièce ne se répare pas.
    let justificatifKey = null;
    let justificatifNom = null;
    if (avecPiece) {
      justificatifKey = await documents.stockerCv(fichier, "conges");
      justificatifNom = fichier.originalname;
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
      justificatifKey,
      justificatifNom,
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

module.exports.JUSTIFICATIF_REQUIS = JUSTIFICATIF_REQUIS;
module.exports.TYPES_VALIDES = TYPES_VALIDES;