// src/candidat/profil.js
//
// Profil d'un candidat.
//
// Un candidat n'est pas salarie : il n'a aucune fiche dans Employes.
// PUT /auth/profil cherchait pourtant la-bas, echouait en silence, et
// l'ecran se rechargeait avec les valeurs du jeton — d'ou l'impression
// que les modifications s'effacaient aussitot.
//
// Le profil est donc stocke a part, dans sa propre table, indexe par
// le sub Cognito.

const { GetCommand, PutCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite } = require("../utils/contexte");
const documents = require("../services/documents");

const TABLE_PROFILS = process.env.TABLE_PROFILS_CANDIDATS || "ProfilsCandidats-local";
const TABLE_CANDIDATURES = process.env.TABLE_CANDIDATURES || "Candidatures-local";

/**
 * Profil par defaut, construit a partir du jeton et de la derniere
 * candidature. Un candidat qui n'a jamais ouvert son profil voit ainsi
 * des champs deja renseignes plutot qu'un formulaire vide.
 */
async function profilParDefaut(moi) {
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_CANDIDATURES,
    IndexName: "email-index",
    KeyConditionExpression: "email = :e",
    ExpressionAttributeValues: { ":e": moi.email },
    ScanIndexForward: false,
    Limit: 1,
  }));

  const derniere = (res.Items || [])[0];

  return {
    id: moi.userId,
    email: moi.email,
    prenom: moi.prenom,
    nom: moi.nom,
    telephone: derniere?.telephone || "",
    posteVise: derniere?.posteVise || "",
    niveauEtude: derniere?.niveauEtude || "",
    experience: derniere?.experience || "",
    competences: derniere?.competences || [],
    linkedin: derniere?.linkedin || "",
    cvKey: derniere?.cvKey || null,
    cvFileName: derniere?.cvFileName || null,
    creeLe: null,
  };
}

// ── GET /candidat/profil ───────────────────────────────────────────

exports.lire = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const res = await docClient.send(new GetCommand({
      TableName: TABLE_PROFILS, Key: { id: moi.userId },
    }));

    const profil = res.Item ?? (await profilParDefaut(moi));

    // L'identite vient toujours du jeton, jamais du profil stocke :
    // un candidat ne doit pas pouvoir se renommer dans le systeme.
    return succes({
      profil: {
        ...profil,
        email: moi.email,
        prenom: moi.prenom,
        nom: moi.nom,
        existant: !!res.Item,
      },
    });
  } catch (e) {
    console.error("Erreur lecture profil candidat:", e);
    return erreur("Impossible de charger le profil");
  }
};

// ── PUT /candidat/profil ───────────────────────────────────────────

exports.modifier = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || {});

    const existant = await docClient.send(new GetCommand({
      TableName: TABLE_PROFILS, Key: { id: moi.userId },
    }));

    const base = existant.Item ?? (await profilParDefaut(moi));
    const maintenant = new Date().toISOString();

    // Les competences arrivent en chaine depuis le formulaire
    const competences = Array.isArray(body.competences)
      ? body.competences
      : String(body.competences || "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);

    const profil = {
      ...base,
      id: moi.userId,
      email: moi.email,
      prenom: moi.prenom,
      nom: moi.nom,
      telephone: (body.telephone ?? base.telephone ?? "").trim(),
      posteVise: (body.posteVise ?? base.posteVise ?? "").trim(),
      niveauEtude: (body.niveauEtude ?? base.niveauEtude ?? "").trim(),
      experience: (body.experience ?? base.experience ?? "").trim(),
      linkedin: (body.linkedin ?? base.linkedin ?? "").trim(),
      competences,
      creeLe: base.creeLe || maintenant,
      misAJourLe: maintenant,
    };

    await docClient.send(new PutCommand({ TableName: TABLE_PROFILS, Item: profil }));

    return succes({ profil, message: "Profil enregistré" });
  } catch (e) {
    console.error("Erreur modification profil candidat:", e);
    return erreur("Impossible d'enregistrer le profil");
  }
};

// ── POST /candidat/profil/cv ───────────────────────────────────────

exports.televerserCv = async (event, fichier) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);
    if (!fichier?.buffer?.length) return erreur("Aucun fichier reçu", 400);

    const existant = await docClient.send(new GetCommand({
      TableName: TABLE_PROFILS, Key: { id: moi.userId },
    }));
    const base = existant.Item ?? (await profilParDefaut(moi));

    const nouvelleCle = await documents.stockerCv(fichier);

    // L'ancien fichier est supprime apres l'ecriture du nouveau : en
    // cas d'echec, le candidat conserve son CV precedent.
    if (base.cvKey && base.cvKey !== nouvelleCle) {
      await documents.supprimerDocument(base.cvKey).catch(() => {});
    }

    const profil = {
      ...base,
      id: moi.userId,
      email: moi.email,
      prenom: moi.prenom,
      nom: moi.nom,
      cvKey: nouvelleCle,
      cvFileName: fichier.originalname,
      cvTailleOctets: fichier.size ?? fichier.buffer.length,
      cvDeposeLe: new Date().toISOString(),
      creeLe: base.creeLe || new Date().toISOString(),
      misAJourLe: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({ TableName: TABLE_PROFILS, Item: profil }));

    return succes({ profil, message: "CV enregistré" }, 201);
  } catch (e) {
    console.error("Erreur téléversement CV:", e);
    return erreur("Impossible d'enregistrer le CV");
  }
};

// ── DELETE /candidat/profil/cv ─────────────────────────────────────

exports.supprimerCv = async (event) => {
  try {
    const moi = identite(event);
    if (!moi) return erreur("Non identifié", 401);

    const res = await docClient.send(new GetCommand({
      TableName: TABLE_PROFILS, Key: { id: moi.userId },
    }));
    if (!res.Item?.cvKey) return erreur("Aucun CV à supprimer", 404);

    await documents.supprimerDocument(res.Item.cvKey).catch(() => {});

    const profil = { ...res.Item, misAJourLe: new Date().toISOString() };
    delete profil.cvKey;
    delete profil.cvFileName;
    delete profil.cvTailleOctets;
    delete profil.cvDeposeLe;

    await docClient.send(new PutCommand({ TableName: TABLE_PROFILS, Item: profil }));

    return succes({ profil, message: "CV supprimé" });
  } catch (e) {
    console.error("Erreur suppression CV:", e);
    return erreur("Impossible de supprimer le CV");
  }
};