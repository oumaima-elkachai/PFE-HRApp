// src/situations/lister.js
//
// GET /situations
//
// Le salarié voit ses propres demandes. La RH voit celles de tout le
// monde, filtrables par statut ou par salarié.
//
// Un même point d'entrée pour deux rôles, mais la portée est décidée
// par le JETON et jamais par un paramètre de requête : un salarié qui
// ajoute ?employeId=<autre> à l'adresse ne doit rien obtenir de plus.

const depot = require("./depot");
const { succes, erreur, identite, estRh } = require("./commun");

const STATUTS = new Set(["EN_ATTENTE", "APPROUVE", "REFUSE"]);

async function handler(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);

  const params = event.queryStringParameters || {};

  // ── Salarié : ses demandes, et rien d'autre ──
  if (!estRh(moi)) {
    if (!moi.sub) return erreur("Le jeton ne porte aucun identifiant utilisateur", 401);

    const fiche = await depot.ficheEmploye(moi.sub);
    if (!fiche) {
      return erreur(
        `Aucune fiche employé n'est rattachée au compte ${moi.email || moi.sub}. `
        + `Contactez les ressources humaines.`,
        404
      );
    }

    const demandes = await depot.demandesDeLEmploye(moi.sub);
    return succes({
      demandes,
      // La situation validée, pour que l'écran affiche l'état réel sans
      // un second appel, et sans la reconstruire à partir des demandes.
      situationActuelle: extraireSituation(fiche),
      enAttente: demandes.find((d) => d.statut === "EN_ATTENTE") || null,
    });
  }

  // ── RH : portée large, filtres facultatifs ──
  if (params.employeId) {
    const demandes = await depot.demandesDeLEmploye(params.employeId);
    const fiche = await depot.ficheEmploye(params.employeId);
    return succes({
      demandes,
      situationActuelle: fiche ? extraireSituation(fiche) : null,
      // Dire que la fiche manque, plutôt que de renvoyer une liste vide
      // qui ferait croire à un salarié sans historique.
      avertissement: fiche ? null : `Aucune fiche employé pour l'identifiant ${params.employeId}`,
    });
  }

  const statut = params.statut ? String(params.statut).toUpperCase() : null;
  if (statut && !STATUTS.has(statut)) {
    return erreur(`Statut inconnu : ${statut}. Attendu EN_ATTENTE, APPROUVE ou REFUSE.`, 400);
  }

  const demandes = statut
    ? await depot.demandesParStatut(statut)
    : await depot.toutesLesDemandes();

  return succes({
    demandes,
    total: demandes.length,
    enAttente: demandes.filter((d) => d.statut === "EN_ATTENTE").length,
  });
}

/** Les seuls champs de situation, sans le reste de la fiche employé */
function extraireSituation(fiche = {}) {
  const s = {};
  for (const nom of depot.NOMS_CHAMPS) {
    s[nom] = fiche[nom] ?? (depot.CHAMPS[nom].type === "booleen" ? false : 0);
  }
  return s;
}

module.exports = { handler, extraireSituation };