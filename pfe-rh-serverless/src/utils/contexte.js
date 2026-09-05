// src/utils/contexte.js
//
// Extraction de l'identité et gestion du fuseau horaire.
//
// Deux modes d'exécution coexistent pendant la bascule :
//   - local  : server.js injecte event.user à partir du JWT maison
//   - AWS    : l'API HTTP place les revendications Cognito dans
//              event.requestContext.authorizer.jwt.claims
//
// Les handlers ne doivent jamais lire l'un ou l'autre directement.

const FUSEAU = process.env.FUSEAU_HORAIRE || "Africa/Tunis";

/**
 * Les groupes Cognito arrivent soit en tableau, soit en chaîne
 * « [RH EMPLOYE] » selon la configuration de la passerelle.
 */
function normaliserGroupes(brut) {
  if (!brut) return [];
  if (Array.isArray(brut)) return brut;
  return String(brut).replace(/[[\]]/g, "").split(/[\s,]+/).filter(Boolean);
}

function roleDepuisGroupes(groupes) {
  if (groupes.includes("RH")) return "RH";
  if (groupes.includes("EMPLOYE")) return "EMPLOYE";
  if (groupes.includes("CANDIDAT")) return "CANDIDAT";
  return null;
}

/**
 * @returns {{userId, email, nom, prenom, role, groupes, employeId}|null}
 */
function identite(event) {
  // ── Mode local ────────────────────────────────────────────────
  if (event.user) {
    const u = event.user;
    return {
      userId: u.sub || u.id,
      email: u.email,
      nom: u.nom || "",
      prenom: u.prenom || "",
      role: u.role || "EMPLOYE",
      groupes: [u.role || "EMPLOYE"],
      // En local, aucun lien vers la fiche employé : les handlers
      // le résolvent par email via l'index dédié.
      employeId: u.employeId || null,
    };
  }

  // ── Mode AWS ──────────────────────────────────────────────────
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims) return null;

  const groupes = normaliserGroupes(claims["cognito:groups"]);

  return {
    userId: claims.sub,
    email: claims.email,
    nom: claims.family_name || "",
    prenom: claims.given_name || "",
    role: roleDepuisGroupes(groupes) || "CANDIDAT",
    groupes,
    // Renseigné à la création du compte : évite toute recherche en base
    employeId: claims["custom:employeId"] || null,
  };
}

function estRole(id, ...roles) {
  return !!id && roles.includes(id.role);
}

// ── Dates dans le fuseau de l'entreprise ───────────────────────────
// Lambda s'exécute en UTC. Sans conversion explicite, un pointage
// effectué à 00h30 à Tunis serait daté de la veille.

function partiesLocales(instant = new Date()) {
  const date = instant instanceof Date ? instant : new Date(instant);
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: FUSEAU,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);

  const p = {};
  for (const part of parts) if (part.type !== "literal") p[part.type] = part.value;

  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hhmm: `${p.hour}:${p.minute}`,
    heures: Number(p.hour),
    minutes: Number(p.minute),
  };
}

/** Date du jour au format AAAA-MM-JJ, dans le fuseau de l'entreprise */
const dateAujourdhui = () => partiesLocales().date;

/** Heure locale d'un instant ISO, au format hh:mm */
const heureLocale = (iso) => partiesLocales(iso).hhmm;

module.exports = {
  FUSEAU,
  identite,
  estRole,
  partiesLocales,
  dateAujourdhui,
  heureLocale,
};