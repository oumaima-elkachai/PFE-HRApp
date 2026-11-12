// src/situations/traiter.js
//
// PUT /situations/:id        → la RH approuve ou refuse une demande
// PUT /employes/:id/situation → la RH saisit directement
//
// L'approbation est le SEUL chemin par lequel une déclaration de salarié
// atteint la table Employes, et donc le calcul de paie.

const depot = require("./depot");
const { succes, erreur, identite, estRh, corpsDe } = require("./commun");

// ── Validation d'une demande ───────────────────────────────────────

async function handler(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);
  if (!estRh(moi)) {
    return erreur("Seules les ressources humaines peuvent traiter une demande", 403);
  }

  const id = event.pathParameters?.id || corpsDe(event).id;
  if (!id) return erreur("Identifiant de demande manquant", 400);

  const corps = corpsDe(event);
  const decision = String(corps.decision || "").toUpperCase();
  if (!["APPROUVE", "REFUSE"].includes(decision)) {
    return erreur("La décision doit être APPROUVE ou REFUSE", 400);
  }

  // Un refus sans motif est une impasse pour le salarié : il ne sait ni
  // quoi corriger, ni quelle pièce fournir.
  if (decision === "REFUSE" && !String(corps.commentaire || "").trim()) {
    return erreur("Un refus doit être motivé : le salarié doit savoir quoi corriger", 400);
  }

  const demande = await depot.demandeParId(id);
  if (!demande) return erreur(`Aucune demande ne porte l'identifiant ${id}`, 404);

  if (demande.statut !== "EN_ATTENTE") {
    return erreur(
      `Cette demande a déjà été traitée le `
      + `${new Date(demande.traiteLe).toLocaleDateString("fr-FR")} `
      + `(${demande.statut === "APPROUVE" ? "approuvée" : "refusée"}).`,
      409
    );
  }

  if (decision === "REFUSE") {
    const traitee = await depot.marquerTraitee(id, {
      statut: "REFUSE",
      traiteParId: moi.sub,
      commentaireRh: corps.commentaire,
    });
    return succes({ demande: traitee, message: "Demande refusée, le salarié est informé." });
  }

  // ── Approbation ──
  try {
    await depot.approuverEtAppliquer(demande, {
      traiteParId: moi.sub,
      commentaireRh: corps.commentaire,
    });
  } catch (e) {
    // La transaction échoue en bloc : soit la fiche a disparu, soit une
    // autre personne a traité la demande entre-temps. Distinguer les
    // deux évite d'envoyer la RH chercher au mauvais endroit.
    if (e.name === "TransactionCanceledException") {
      const fiche = await depot.ficheEmploye(demande.employeId);
      if (!fiche) {
        return erreur(
          `La fiche employé ${demande.employeId} n'existe plus : la demande ne peut pas `
          + `être appliquée. Vérifiez si le salarié a été supprimé.`,
          409
        );
      }
      return erreur(
        "Cette demande vient d'être traitée par quelqu'un d'autre. Rechargez la liste.",
        409
      );
    }
    throw e;
  }

  const apres = await depot.demandeParId(id);
  return succes({
    demande: apres,
    message:
      `Situation appliquée à la fiche. Elle sera prise en compte sur le prochain `
      + `bulletin — les bulletins déjà émis ne sont pas recalculés.`,
  });
}

// ── Saisie directe par la RH ───────────────────────────────────────

/**
 * La RH modifie la situation d'un salarié sans passer par une demande :
 * c'est le cas d'un dossier reçu sur papier, ou d'une correction.
 *
 * Aucune pièce jointe n'est exigée ici, parce que la RH est elle-même
 * l'autorité de contrôle — mais l'auteur et la date sont enregistrés sur
 * la fiche, pour que la modification reste traçable.
 */
async function handlerSaisieRh(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);
  if (!estRh(moi)) {
    return erreur("Seules les ressources humaines peuvent saisir une situation", 403);
  }

  const employeId = event.pathParameters?.id;
  if (!employeId) return erreur("Identifiant du salarié manquant", 400);

  const corps = corpsDe(event);
  const { situation, soucis } = depot.validerSituation(corps.situation ?? corps);
  if (soucis.length) return erreur(soucis.join(" · "), 400);

  const fiche = await depot.ficheEmploye(employeId);
  if (!fiche) return erreur(`Aucune fiche employé pour l'identifiant ${employeId}`, 404);

  const changements = depot.comparer(fiche, situation);
  if (changements.length === 0) {
    return erreur("La situation saisie est identique à celle déjà enregistrée", 409);
  }

  try {
    await depot.appliquerALaFiche(employeId, situation);
  } catch (e) {
    if (e.name === "ConditionalCheckFailedException") {
      return erreur(`La fiche employé ${employeId} n'existe plus`, 409);
    }
    throw e;
  }

  return succes({
    employeId,
    changements,
    message:
      `${changements.length} champ${changements.length > 1 ? "s" : ""} modifié`
      + `${changements.length > 1 ? "s" : ""}. Prise en compte sur le prochain bulletin.`,
  });
}

module.exports = { handler, handlerSaisieRh };