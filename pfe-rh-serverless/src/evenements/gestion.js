// src/evenements/gestion.js
//
// Evenements de l'entreprise : formations, journees portes ouvertes,
// seminaires, festivals.
//
// Deux publics cohabitent. Les evenements internes s'adressent aux
// salaries, les evenements publics aux candidats et au grand public.
// Un meme evenement peut viser les deux, typiquement un salon ou un
// webinaire metier.
//
// Les inscriptions sont stockees dans l'evenement lui-meme plutot que
// dans une table dediee : le volume reste de l'ordre de quelques
// dizaines par evenement, et cela evite une jointure a chaque lecture.

const { GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand, ScanCommand } =
  require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, estRole } = require("../utils/contexte");
const employes = require("../utils/employe");
const { v4: uuidv4 } = require("uuid");

const TABLE_EVENEMENTS = process.env.TABLE_EVENEMENTS || "Evenements-local";
const TABLE_NOTIFICATIONS = process.env.TABLE_NOTIFICATIONS || "Notifications-local";

const TYPES = {
  FORMATION: { libelle: "Formation", audienceParDefaut: "INTERNE" },
  SEMINAIRE: { libelle: "Séminaire", audienceParDefaut: "INTERNE" },
  TEAM_BUILDING: { libelle: "Cohésion d'équipe", audienceParDefaut: "INTERNE" },
  REUNION: { libelle: "Réunion", audienceParDefaut: "INTERNE" },
  FESTIVAL: { libelle: "Événement festif", audienceParDefaut: "INTERNE" },
  PORTES_OUVERTES: { libelle: "Journée portes ouvertes", audienceParDefaut: "PUBLIC" },
  SALON: { libelle: "Salon de recrutement", audienceParDefaut: "PUBLIC" },
  WEBINAIRE: { libelle: "Webinaire", audienceParDefaut: "MIXTE" },
};

const AUDIENCES = ["INTERNE", "PUBLIC", "MIXTE"];
const STATUTS = ["ACTIF", "ANNULE", "TERMINE"];

/** Un candidat ne voit jamais un evenement purement interne */
function audiencesVisibles(moi) {
  if (!moi) return ["PUBLIC"];
  if (estRole(moi, "RH") || estRole(moi, "EMPLOYE")) return ["INTERNE", "MIXTE", "PUBLIC"];
  return ["PUBLIC", "MIXTE"];
}

function participantsRestants(evenement) {
  if (!evenement.capaciteMax) return null;
  return Math.max(0, evenement.capaciteMax - (evenement.participants || []).length);
}

/**
 * Vue destinee au participant. La liste nominative des inscrits reste
 * reservee a la RH : un salarie n'a pas a savoir qui assiste a quoi.
 */
function pourParticipant(evenement, moi) {
  const participants = evenement.participants || [];
  const inscrit = !!moi && participants.some((p) => p.userId === moi.userId);

  const { participants: _, ...visible } = evenement;

  return {
    ...visible,
    nbParticipants: participants.length,
    placesRestantes: participantsRestants(evenement),
    inscrit,
    complet: participantsRestants(evenement) === 0,
    inscriptionsFermees:
      !!evenement.dateLimiteInscription &&
      evenement.dateLimiteInscription < new Date().toISOString(),
  };
}

async function notifier({ userId, type, titre, message, metadata }) {
  await docClient.send(new PutCommand({
    TableName: TABLE_NOTIFICATIONS,
    Item: {
      id: uuidv4(),
      userId,
      type,
      titre,
      message,
      lu: false,
      creeLe: new Date().toISOString(),
      expireLe: Math.floor(Date.now() / 1000) + 60 * 86400,
      metadata: metadata || {},
    },
  }));
}

// ── Consultation ───────────────────────────────────────────────────

exports.lister = async (event) => {
  try {
    const moi = identite(event);
    const params = event.queryStringParameters || {};
    const visibles = audiencesVisibles(moi);

    // L'index par statut et date rend la requete ciblee : seuls les
    // evenements actifs sont parcourus, dans l'ordre chronologique.
    const res = await docClient.send(new QueryCommand({
      TableName: TABLE_EVENEMENTS,
      IndexName: "statut-date-index",
      KeyConditionExpression: "#s = :s",
      ExpressionAttributeNames: { "#s": "statut" },
      ExpressionAttributeValues: { ":s": params.statut || "ACTIF" },
    }));

    let evenements = (res.Items || []).filter((e) => visibles.includes(e.audience));

    if (params.type) {
      evenements = evenements.filter((e) => e.type === params.type);
    }

    const maintenant = new Date().toISOString();
    const aVenir = evenements.filter((e) => e.dateDebut >= maintenant);
    const passes = evenements
      .filter((e) => e.dateDebut < maintenant)
      .sort((a, b) => b.dateDebut.localeCompare(a.dateDebut));

    return succes({
      evenements: aVenir.map((e) => pourParticipant(e, moi)),
      passes: passes.slice(0, 10).map((e) => pourParticipant(e, moi)),
      types: TYPES,
    });
  } catch (e) {
    console.error("Erreur liste des événements:", e);
    return erreur("Impossible de charger les événements");
  }
};

exports.detail = async (event) => {
  try {
    const moi = identite(event);
    const id = event.pathParameters?.id;

    const res = await docClient.send(new GetCommand({
      TableName: TABLE_EVENEMENTS, Key: { id },
    }));
    if (!res.Item) return erreur("Événement introuvable", 404);

    const evenement = res.Item;
    if (!audiencesVisibles(moi).includes(evenement.audience)) {
      return erreur("Événement non accessible", 403);
    }

    // La RH obtient la liste nominative, indispensable pour organiser
    if (estRole(moi, "RH")) {
      return succes({ evenement: { ...evenement, placesRestantes: participantsRestants(evenement) } });
    }

    return succes({ evenement: pourParticipant(evenement, moi) });
  } catch (e) {
    console.error("Erreur détail événement:", e);
    return erreur("Impossible de charger l'événement");
  }
};

/** Événements auxquels la personne connectée est inscrite */
exports.mesEvenements = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    // Aucun index ne porte sur les participants : le volume
    // d'evenements reste de l'ordre de la dizaine, un parcours filtre
    // est ici moins couteux qu'une table d'inscriptions dediee.
    const res = await docClient.send(new ScanCommand({
      TableName: TABLE_EVENEMENTS,
      FilterExpression: "#s = :s",
      ExpressionAttributeNames: { "#s": "statut" },
      ExpressionAttributeValues: { ":s": "ACTIF" },
    }));

    const miens = (res.Items || [])
      .filter((e) => (e.participants || []).some((p) => p.userId === moi.userId))
      .sort((a, b) => String(a.dateDebut).localeCompare(String(b.dateDebut)));

    const maintenant = new Date().toISOString();

    return succes({
      aVenir: miens.filter((e) => e.dateDebut >= maintenant).map((e) => pourParticipant(e, moi)),
      passes: miens.filter((e) => e.dateDebut < maintenant).map((e) => pourParticipant(e, moi)),
    });
  } catch (e) {
    console.error("Erreur mes événements:", e);
    return erreur("Impossible de charger vos inscriptions");
  }
};

// ── Inscription ────────────────────────────────────────────────────

exports.sInscrire = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const id = event.pathParameters?.id;
    const res = await docClient.send(new GetCommand({
      TableName: TABLE_EVENEMENTS, Key: { id },
    }));
    if (!res.Item) return erreur("Événement introuvable", 404);

    const evenement = res.Item;

    if (evenement.statut !== "ACTIF") return erreur("Cet événement n'est plus ouvert", 410);
    if (!audiencesVisibles(moi).includes(evenement.audience)) {
      return erreur("Événement non accessible", 403);
    }
    if (evenement.dateDebut < new Date().toISOString()) {
      return erreur("Cet événement a déjà eu lieu", 410);
    }
    if (evenement.dateLimiteInscription && evenement.dateLimiteInscription < new Date().toISOString()) {
      return erreur("Les inscriptions sont closes", 410);
    }

    const participants = evenement.participants || [];

    if (participants.some((p) => p.userId === moi.userId)) {
      return erreur("Vous êtes déjà inscrit", 409);
    }
    if (evenement.capaciteMax && participants.length >= evenement.capaciteMax) {
      return erreur("Cet événement est complet", 409);
    }

    const fiche = estRole(moi, "EMPLOYE") ? await employes.courant(moi) : null;

    const participant = {
      userId: moi.userId,
      email: moi.email,
      nom: `${moi.prenom} ${moi.nom}`.trim() || moi.email,
      role: moi.role,
      departement: fiche?.departement || null,
      inscritLe: new Date().toISOString(),
    };

    // L'ecriture conditionnelle empeche deux inscriptions simultanees
    // de depasser la capacite : sans elle, deux requetes concurrentes
    // liraient la meme liste et l'ecriraient chacune de leur cote.
    try {
      await docClient.send(new UpdateCommand({
        TableName: TABLE_EVENEMENTS,
        Key: { id },
        UpdateExpression: "SET participants = list_append(if_not_exists(participants, :vide), :p)",
        ConditionExpression: evenement.capaciteMax
          ? "attribute_not_exists(participants) OR size(participants) < :max"
          : "attribute_exists(id)",
        ExpressionAttributeValues: {
          ":p": [participant],
          ":vide": [],
          ...(evenement.capaciteMax ? { ":max": evenement.capaciteMax } : {}),
        },
      }));
    } catch (e) {
      if (e.name === "ConditionalCheckFailedException") {
        return erreur("Cet événement vient d'atteindre sa capacité", 409);
      }
      throw e;
    }

    return succes({
      message: `Inscription confirmée pour « ${evenement.titre} »`,
      inscrit: true,
    });
  } catch (e) {
    console.error("Erreur inscription:", e);
    return erreur("Impossible de vous inscrire");
  }
};

exports.seDesinscrire = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const id = event.pathParameters?.id;
    const res = await docClient.send(new GetCommand({
      TableName: TABLE_EVENEMENTS, Key: { id },
    }));
    if (!res.Item) return erreur("Événement introuvable", 404);

    const evenement = res.Item;

    if (evenement.obligatoire) {
      return erreur("Cet événement est obligatoire, la désinscription n'est pas possible", 403);
    }

    const participants = (evenement.participants || []).filter((p) => p.userId !== moi.userId);

    await docClient.send(new UpdateCommand({
      TableName: TABLE_EVENEMENTS,
      Key: { id },
      UpdateExpression: "SET participants = :p",
      ExpressionAttributeValues: { ":p": participants },
    }));

    return succes({ message: "Désinscription enregistrée", inscrit: false });
  } catch (e) {
    console.error("Erreur désinscription:", e);
    return erreur("Impossible de vous désinscrire");
  }
};

// ── Administration ─────────────────────────────────────────────────

exports.creer = async (event) => {
  try {
    const moi = identite(event);
    if (!moi || !estRole(moi, "RH")) return erreur("Réservé aux ressources humaines", 403);

    const body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || {});
    const {
      titre, description, type, audience, dateDebut, dateFin,
      lieu, adresse, lienVisio, capaciteMax, dateLimiteInscription,
      organisateur, departement, obligatoire, inscriptionRequise,
    } = body;

    if (!titre || !dateDebut) return erreur("titre et dateDebut sont requis", 400);
    if (!TYPES[type]) {
      return erreur(`Type invalide. Valeurs : ${Object.keys(TYPES).join(", ")}`, 400);
    }

    const audienceRetenue = audience || TYPES[type].audienceParDefaut;
    if (!AUDIENCES.includes(audienceRetenue)) {
      return erreur(`Audience invalide. Valeurs : ${AUDIENCES.join(", ")}`, 400);
    }

    const maintenant = new Date().toISOString();

    const evenement = {
      id: uuidv4(),
      titre,
      description: description || "",
      type,
      typeLibelle: TYPES[type].libelle,
      audience: audienceRetenue,
      dateDebut,
      dateFin: dateFin || dateDebut,
      lieu: lieu || null,
      adresse: adresse || null,
      lienVisio: lienVisio || null,
      capaciteMax: capaciteMax ? Number(capaciteMax) : null,
      dateLimiteInscription: dateLimiteInscription || null,
      inscriptionRequise: inscriptionRequise !== false,
      // Une formation obligatoire ne se refuse pas : la desinscription
      // est alors bloquee cote serveur.
      obligatoire: obligatoire === true,
      organisateur: organisateur || `${moi.prenom} ${moi.nom}`.trim() || moi.email,
      departement: departement || null,
      participants: [],
      statut: "ACTIF",
      creeLe: maintenant,
      creeParId: moi.userId,
      misAJourLe: maintenant,
    };

    await docClient.send(new PutCommand({ TableName: TABLE_EVENEMENTS, Item: evenement }));

    return succes({ evenement, message: "Événement publié" }, 201);
  } catch (e) {
    console.error("Erreur création événement:", e);
    return erreur("Impossible de créer l'événement");
  }
};

exports.modifier = async (event) => {
  try {
    const moi = identite(event);
    if (!moi || !estRole(moi, "RH")) return erreur("Réservé aux ressources humaines", 403);

    const id = event.pathParameters?.id;
    const body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || {});

    const res = await docClient.send(new GetCommand({
      TableName: TABLE_EVENEMENTS, Key: { id },
    }));
    if (!res.Item) return erreur("Événement introuvable", 404);

    const existant = res.Item;

    // La liste des inscrits n'est jamais ecrasee par une modification :
    // elle vit independamment du contenu de l'evenement.
    const modifiable = [
      "titre", "description", "dateDebut", "dateFin", "lieu", "adresse",
      "lienVisio", "capaciteMax", "dateLimiteInscription", "organisateur",
      "departement", "obligatoire", "inscriptionRequise", "audience", "type",
    ];

    const evenement = { ...existant, misAJourLe: new Date().toISOString() };
    for (const champ of modifiable) {
      if (body[champ] !== undefined) evenement[champ] = body[champ];
    }
    if (body.type && TYPES[body.type]) evenement.typeLibelle = TYPES[body.type].libelle;

    await docClient.send(new PutCommand({ TableName: TABLE_EVENEMENTS, Item: evenement }));

    // Un changement de date ou de lieu doit etre signale : un inscrit
    // qui l'apprend le jour meme n'a pas pu s'organiser.
    const dateChangee = body.dateDebut && body.dateDebut !== existant.dateDebut;
    const lieuChange = body.lieu && body.lieu !== existant.lieu;

    if (dateChangee || lieuChange) {
      for (const p of existant.participants || []) {
        await notifier({
          userId: p.email,
          type: "EVENEMENT_MODIFIE",
          titre: "Événement modifié",
          message: `« ${evenement.titre} » a changé : `
            + [dateChangee ? "nouvelle date" : null, lieuChange ? "nouveau lieu" : null]
              .filter(Boolean).join(" et "),
          metadata: { evenementId: id },
        }).catch(() => {});
      }
    }

    return succes({ evenement, message: "Événement mis à jour" });
  } catch (e) {
    console.error("Erreur modification événement:", e);
    return erreur("Impossible de modifier l'événement");
  }
};

exports.annuler = async (event) => {
  try {
    const moi = identite(event);
    if (!moi || !estRole(moi, "RH")) return erreur("Réservé aux ressources humaines", 403);

    const id = event.pathParameters?.id;
    const body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || {});

    const res = await docClient.send(new GetCommand({
      TableName: TABLE_EVENEMENTS, Key: { id },
    }));
    if (!res.Item) return erreur("Événement introuvable", 404);

    const evenement = res.Item;

    await docClient.send(new UpdateCommand({
      TableName: TABLE_EVENEMENTS,
      Key: { id },
      UpdateExpression: "SET #s = :s, motifAnnulation = :m, annuleLe = :d",
      ExpressionAttributeNames: { "#s": "statut" },
      ExpressionAttributeValues: {
        ":s": "ANNULE",
        ":m": body.motif || "",
        ":d": new Date().toISOString(),
      },
    }));

    for (const p of evenement.participants || []) {
      await notifier({
        userId: p.email,
        type: "EVENEMENT_ANNULE",
        titre: "Événement annulé",
        message: `« ${evenement.titre} » a été annulé.`
          + (body.motif ? ` Motif : ${body.motif}` : ""),
        metadata: { evenementId: id },
      }).catch(() => {});
    }

    return succes({
      message: `Événement annulé, ${(evenement.participants || []).length} participant(s) prévenu(s)`,
    });
  } catch (e) {
    console.error("Erreur annulation événement:", e);
    return erreur("Impossible d'annuler l'événement");
  }
};

exports.supprimer = async (event) => {
  try {
    const moi = identite(event);
    if (!moi || !estRole(moi, "RH")) return erreur("Réservé aux ressources humaines", 403);

    const id = event.pathParameters?.id;
    const res = await docClient.send(new GetCommand({
      TableName: TABLE_EVENEMENTS, Key: { id },
    }));
    if (!res.Item) return erreur("Événement introuvable", 404);

    // Un evenement avec des inscrits s'annule, il ne se supprime pas :
    // la suppression ferait disparaitre l'information sans prevenir
    // personne.
    if ((res.Item.participants || []).length > 0) {
      return erreur(
        "Cet événement compte des inscrits. Annulez-le plutôt que de le supprimer.",
        409
      );
    }

    await docClient.send(new DeleteCommand({ TableName: TABLE_EVENEMENTS, Key: { id } }));

    return succes({ message: "Événement supprimé" });
  } catch (e) {
    console.error("Erreur suppression événement:", e);
    return erreur("Impossible de supprimer l'événement");
  }
};

module.exports.TYPES = TYPES;
module.exports.AUDIENCES = AUDIENCES;
module.exports.STATUTS = STATUTS;