// src/utils/identite.js
//
// Identité de l'appelant, extraite du jeton quelle que soit sa forme.
//
// Selon que la requête arrive par API Gateway, par un autorisateur JWT
// ou par le serveur Express local, les revendications ne sont pas au
// même endroit. Et le jeton Cognito ne porte pas de champ `role` : le
// rôle y est dans `cognito:groups`, parfois en tableau, parfois en
// chaîne sérialisée « [RH] ».
//
// Plutôt que de parier sur une forme, on les cherche toutes et on
// renvoie null si aucune ne convient. Un null explicite vaut mieux
// qu'un `undefined` qui se propage jusqu'à un « Employé introuvable »
// qui ne dit ni qui, ni pourquoi.

/** @returns {{ sub: string|null, email: string|null, role: string|null }|null} */
function identite(event = {}) {
  const ctx = event.requestContext || {};
  const sources = [
    event.utilisateur,
    event.user,
    event.moi,
    ctx.authorizer?.claims,
    ctx.authorizer?.jwt?.claims,
    ctx.authorizer,
  ];

  for (const s of sources) {
    if (!s || typeof s !== "object") continue;

    const email = s.email || s["cognito:username"] || s.username;
    const sub = s.sub || s.id || s.userId;
    if (!email && !sub) continue;

    const groupes = s["cognito:groups"];
    let role = s.role || s.Role;
    if (!role && groupes) {
      role = Array.isArray(groupes)
        ? groupes[0]
        : String(groupes).replace(/[[\]]/g, "").split(/[\s,]+/)[0];
    }

    return {
      sub: sub || null,
      email: email ? String(email).trim() : null,
      role: role ? String(role).trim().toUpperCase() : null,
    };
  }

  return null;
}

const estRh = (moi) => moi?.role === "RH";

/** Corps JSON d'un événement, quelle que soit sa forme */
function corpsDe(event = {}) {
  if (!event.body) return {};
  if (typeof event.body === "object") return event.body;
  try {
    const texte = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    return JSON.parse(texte) || {};
  } catch {
    return {};
  }
}

module.exports = { identite, estRh, corpsDe };