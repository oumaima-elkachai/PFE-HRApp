// src/auth/middleware.js
//
// Authentification et autorisation, dans les deux modes d'exécution.
//
//   Local : le jeton JWT maison est vérifié ici.
//   AWS   : l'API Gateway HTTP a déjà validé le jeton Cognito avant
//           d'invoquer la fonction. On se contente de lire les
//           revendications — revalider serait redondant et coûteux.

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "pfe-rh-secret-local-2026";

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

/** Construit un utilisateur uniforme à partir des revendications Cognito */
function depuisCognito(claims) {
  const groupes = normaliserGroupes(claims["cognito:groups"]);
  return {
    sub: claims.sub,
    email: claims.email,
    prenom: claims.given_name || "",
    nom: claims.family_name || "",
    role: roleDepuisGroupes(groupes) || "CANDIDAT",
    groupes,
    // Renseigné à la création du compte : relie le compte Cognito à la
    // fiche employé sans lecture supplémentaire en base.
    employeId: claims["custom:employeId"] || null,
  };
}

const authentifier = (req, res, next) => {
  const claims = req.evenementLambda?.requestContext?.authorizer?.jwt?.claims;

  if (claims) {
    req.user = depuisCognito(claims);
    return next();
  }

  const entete = req.headers["authorization"];
  if (!entete || !entete.startsWith("Bearer ")) {
    return res.status(401).json({ succes: false, erreur: "Jeton manquant" });
  }

  try {
    req.user = jwt.verify(entete.split(" ")[1], JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ succes: false, erreur: "Jeton invalide ou expiré" });
  }
};

const autoriser = (...rolesAutorises) => (req, res, next) => {
  if (!req.user || !rolesAutorises.includes(req.user.role)) {
    return res.status(403).json({
      succes: false,
      erreur: `Accès refusé. Rôle requis : ${rolesAutorises.join(" ou ")}`,
    });
  }
  next();
};

module.exports = { authentifier, autoriser, normaliserGroupes, depuisCognito };