// src/messagerie/fils.js
//
// Fil de discussion rattache a une candidature.
//
// Un fil par candidature, et non par personne : le contexte reste
// attache au dossier, et un recruteur qui reprend le suivi retrouve
// l'echange complet.
//
// Les messages sont stockes dans leur propre table avec une cle de
// tri chronologique : la lecture d'un fil est une Query ordonnee,
// sans tri applicatif.

const { GetCommand, PutCommand, QueryCommand, UpdateCommand, ScanCommand } =
  require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, estRole } = require("../utils/contexte");
const { v4: uuidv4 } = require("uuid");

const TABLE_MESSAGES = process.env.TABLE_MESSAGES || "Messages-local";
const TABLE_CANDIDATURES = process.env.TABLE_CANDIDATURES || "Candidatures-local";
const TABLE_NOTIFICATIONS = process.env.TABLE_NOTIFICATIONS || "Notifications-local";

const LONGUEUR_MAX = 2000;

/** Vérifie que la personne a le droit d'accéder à ce fil */
async function autoriserAcces(moi, candidatureId) {
  const res = await docClient.send(new GetCommand({
    TableName: TABLE_CANDIDATURES, Key: { id: candidatureId },
  }));
  if (!res.Item) return { erreur: "Candidature introuvable", code: 404 };

  const candidature = res.Item;

  // La RH accede a tous les fils ; un candidat au sien uniquement.
  if (estRole(moi, "RH")) return { candidature };
  if (candidature.email === moi.email) return { candidature };

  return { erreur: "Accès refusé", code: 403 };
}

async function notifier({ userId, type, titre, message, metadata }) {
  await docClient.send(new PutCommand({
    TableName: TABLE_NOTIFICATIONS,
    Item: {
      id: uuidv4(), userId, type, titre, message,
      lu: false,
      creeLe: new Date().toISOString(),
      expireLe: Math.floor(Date.now() / 1000) + 90 * 86400,
      metadata: metadata || {},
    },
  }));
}

// ── Lecture d'un fil ───────────────────────────────────────────────

exports.lire = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const candidatureId = event.pathParameters?.candidatureId;
    if (!candidatureId) return erreur("candidatureId requis", 400);

    const acces = await autoriserAcces(moi, candidatureId);
    if (acces.erreur) return erreur(acces.erreur, acces.code);

    const res = await docClient.send(new QueryCommand({
      TableName: TABLE_MESSAGES,
      KeyConditionExpression: "candidatureId = :c",
      ExpressionAttributeValues: { ":c": candidatureId },
      // La cle de tri est l'horodatage : l'ordre chronologique est
      // rendu par le moteur, pas par l'application.
      ScanIndexForward: true,
    }));

    const messages = res.Items || [];
    const estRh = estRole(moi, "RH");

    // Marquage en lecture des messages recus. Ecrire a chaque
    // ouverture reste peu couteux au regard du volume d'un fil.
    const nonLus = messages.filter(
      (m) => !m.lu && (estRh ? m.auteurRole === "CANDIDAT" : m.auteurRole === "RH")
    );

    await Promise.all(nonLus.map((m) =>
      docClient.send(new UpdateCommand({
        TableName: TABLE_MESSAGES,
        Key: { candidatureId, envoyeLe: m.envoyeLe },
        UpdateExpression: "SET lu = :v, luLe = :d",
        ExpressionAttributeValues: { ":v": true, ":d": new Date().toISOString() },
      }))
    ));

    return succes({
      messages: messages.map((m) => ({
        ...m,
        lu: m.lu || nonLus.some((n) => n.envoyeLe === m.envoyeLe),
        deMoi: m.auteurId === moi.userId,
      })),
      candidature: {
        id: acces.candidature.id,
        offreTitre: acces.candidature.offreTitre || acces.candidature.posteVise,
        candidatNom: `${acces.candidature.prenom} ${acces.candidature.nom}`,
        statut: acces.candidature.statut,
      },
    });
  } catch (e) {
    console.error("Erreur lecture du fil:", e);
    return erreur("Impossible de charger la conversation");
  }
};

// ── Envoi d'un message ─────────────────────────────────────────────

exports.envoyer = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const candidatureId = event.pathParameters?.candidatureId;
    const body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || {});
    const contenu = String(body.contenu || "").trim();

    if (!contenu) return erreur("Le message est vide", 400);
    if (contenu.length > LONGUEUR_MAX) {
      return erreur(`Le message dépasse ${LONGUEUR_MAX} caractères`, 400);
    }

    const acces = await autoriserAcces(moi, candidatureId);
    if (acces.erreur) return erreur(acces.erreur, acces.code);

    const candidature = acces.candidature;
    const estRh = estRole(moi, "RH");

    // Une candidature close n'accepte plus de message : le fil reste
    // consultable, mais la discussion est terminee.
    if (["EMBAUCHE", "REFUSE"].includes(candidature.statut) && !estRh) {
      return erreur("Cette candidature est clôturée", 410);
    }

    const maintenant = new Date().toISOString();

    const message = {
      candidatureId,
      envoyeLe: maintenant,
      id: uuidv4(),
      auteurId: moi.userId,
      auteurNom: `${moi.prenom} ${moi.nom}`.trim() || moi.email,
      auteurRole: estRh ? "RH" : "CANDIDAT",
      contenu,
      lu: false,
    };

    await docClient.send(new PutCommand({ TableName: TABLE_MESSAGES, Item: message }));

    // Le destinataire depend de l'emetteur : la RH ecrit au candidat,
    // le candidat ecrit a la RH.
    const extrait = contenu.length > 80 ? `${contenu.slice(0, 80)}…` : contenu;

    await notifier({
      userId: estRh ? candidature.email : "RH",
      type: "MESSAGE",
      titre: estRh ? "Message du recruteur" : `Message de ${candidature.prenom} ${candidature.nom}`,
      message: extrait,
      metadata: { candidatureId, offreTitre: candidature.offreTitre },
    }).catch(() => {});

    return succes({ message, envoye: true }, 201);
  } catch (e) {
    console.error("Erreur envoi du message:", e);
    return erreur("Impossible d'envoyer le message");
  }
};

// ── Fils de la personne connectée ──────────────────────────────────

exports.mesConversations = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const estRh = estRole(moi, "RH");

    let candidatures;

    if (estRh) {
      // Un recruteur n'a aucune candidature a son nom : chercher par
      // son email renverrait toujours une liste vide. Il accede a
      // tous les dossiers, et seuls ceux portant un message sont
      // retenus plus bas.
      const r = await docClient.send(new ScanCommand({
        TableName: TABLE_CANDIDATURES,
        ProjectionExpression: "id, prenom, nom, email, offreTitre, posteVise, statut",
      }));
      candidatures = r.Items || [];
    } else {
      const r = await docClient.send(new QueryCommand({
        TableName: TABLE_CANDIDATURES,
        IndexName: "email-index",
        KeyConditionExpression: "email = :e",
        ExpressionAttributeValues: { ":e": moi.email },
      }));
      candidatures = r.Items || [];
    }

    // Chacun compte les messages qu'il n'a pas ecrits : la RH ceux du
    // candidat, le candidat ceux de la RH.
    const roleOppose = estRh ? "CANDIDAT" : "RH";

    const conversations = [];

    for (const c of candidatures) {
      const msgRes = await docClient.send(new QueryCommand({
        TableName: TABLE_MESSAGES,
        KeyConditionExpression: "candidatureId = :c",
        ExpressionAttributeValues: { ":c": c.id },
        ScanIndexForward: false,
        Limit: 1,
      }));

      const dernier = (msgRes.Items || [])[0];
      if (!dernier) continue;

      // Le comptage des non-lus impose une seconde lecture : le fil
      // reste court, et l'information est attendue sur cet ecran.
      const tousRes = await docClient.send(new QueryCommand({
        TableName: TABLE_MESSAGES,
        KeyConditionExpression: "candidatureId = :c",
        FilterExpression: "lu = :faux AND auteurRole = :r",
        ExpressionAttributeValues: { ":c": c.id, ":faux": false, ":r": roleOppose },
        Select: "COUNT",
      }));

      conversations.push({
        candidatureId: c.id,
        // Le recruteur veut le nom du candidat ; le candidat veut
        // savoir qu'il ecrit au service recrutement.
        interlocuteur: estRh
          ? `${c.prenom ?? ""} ${c.nom ?? ""}`.trim() || c.email
          : "Service recrutement",
        offreTitre: c.offreTitre || c.posteVise || "Candidature spontanée",
        statut: c.statut,
        dernierMessage: {
          contenu: dernier.contenu.length > 100
            ? `${dernier.contenu.slice(0, 100)}…`
            : dernier.contenu,
          auteurRole: dernier.auteurRole,
          envoyeLe: dernier.envoyeLe,
        },
        nonLus: tousRes.Count || 0,
      });
    }

    conversations.sort((a, b) =>
      b.dernierMessage.envoyeLe.localeCompare(a.dernierMessage.envoyeLe)
    );

    return succes({
      conversations,
      totalNonLus: conversations.reduce((s, c) => s + c.nonLus, 0),
    });
  } catch (e) {
    console.error("Erreur liste des conversations:", e);
    return erreur("Impossible de charger vos conversations");
  }
};