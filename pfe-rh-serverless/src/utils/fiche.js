// src/utils/fiche.js
//
// La jointure compte → fiche employé, en un seul endroit.
//
// Trois espaces d'identifiants coexistent dans l'application :
//   • le `sub` Cognito, porté par le jeton ;
//   • `Users-local.id`, l'identifiant du compte applicatif ;
//   • `Employes-local.id`, l'identifiant de FICHE, celui que manipulent
//     l'annuaire, les congés, les bulletins et les pointages.
//
// Rien ne les relie sauf l'e-mail. Tout module où un salarié agit en son
// propre nom doit donc traduire son jeton en identifiant de fiche, et
// c'est ici que cette traduction vit — pas recopiée dans chaque module.

const { ScanCommand } = require("@aws-sdk/lib-dynamodb");

const { docClient } = require("./dynamodb");
const { erreur } = require("./reponse");

const TABLE_EMPLOYES = process.env.TABLE_EMPLOYES || "Employes-local";

const norm = (e) => String(e || "").trim().toLowerCase();

/**
 * Toutes les fiches portant cet e-mail.
 *
 * Faute d'index sur l'e-mail, on parcourt la table — et on la parcourt
 * ENTIÈREMENT : un Scan s'arrête à 1 Mo, et sans la boucle une fiche
 * située au-delà passerait pour absente. La comparaison ignore la casse
 * et les espaces : une fiche saisie « Karim@Entreprise.tn » doit
 * répondre à un jeton en minuscules.
 */
async function fichesParEmail(email) {
  const cible = norm(email);
  if (!cible) return [];

  const trouvees = [];
  let depart;
  do {
    const page = await docClient.send(new ScanCommand({
      TableName: TABLE_EMPLOYES,
      ProjectionExpression:
        "id, email, nom, prenom, poste, departement, statut, dateEmbauche, cin",
      ExclusiveStartKey: depart,
    }));
    for (const f of page.Items || []) {
      if (norm(f.email) === cible) trouvees.push(f);
    }
    depart = page.LastEvaluatedKey;
  } while (depart);

  return trouvees;
}

// Le même compte interroge plusieurs fois par affichage de page. Un cache
// très court évite d'autant de parcours de table, sans masquer longtemps
// une fiche qui vient d'être créée.
const CACHE_MS = 30_000;
const cache = new Map();

/** Vide le cache. Appelé après la création d'une fiche. */
function oublier(email) {
  if (email) cache.delete(norm(email));
  else cache.clear();
}

/**
 * Traduit l'identité du jeton en fiche employé.
 *
 * @returns {{ fiche: object }|{ erreur: object }}
 */
async function identiteFiche(moi) {
  const cle = norm(moi?.email);

  if (!cle) {
    return { erreur: erreur(
      "Le jeton ne porte pas d'adresse e-mail, seule information qui relie "
      + "un compte à sa fiche employé. Reconnectez-vous ; si le problème "
      + "persiste, l'attribut e-mail manque dans le groupe Cognito.",
      401
    ) };
  }

  const enCache = cache.get(cle);
  if (enCache && Date.now() - enCache.a < CACHE_MS) return { fiche: enCache.fiche };

  const fiches = await fichesParEmail(cle);

  if (fiches.length === 0) {
    // Cas typique : un compte créé sans fiche employé. Le message dit
    // quoi faire plutôt que de constater l'absence — c'est la même fiche
    // manquante qui bloque aussi ses congés et ses bulletins.
    return { erreur: erreur(
      `Aucune fiche employé n'est rattachée au compte ${cle}. `
      + `Créez-lui une fiche dans l'espace Employés : c'est elle qui ouvre `
      + `le dossier du personnel, la messagerie interne, les congés et les `
      + `bulletins.`,
      404
    ) };
  }

  let retenues = fiches;
  if (retenues.length > 1) {
    // Un doublon de saisie est fréquent en base de démonstration. On
    // écarte les fiches inactives, qui sont presque toujours l'ancienne.
    const actives = retenues.filter((f) => (f.statut ?? "actif") === "actif");
    if (actives.length >= 1) retenues = actives;
  }

  if (retenues.length > 1) {
    // Choisir en silence rattacherait les pièces à la mauvaise personne.
    // Mieux vaut nommer le doublon : il se corrige en une minute.
    return { erreur: erreur(
      `${retenues.length} fiches employé portent l'adresse ${cle} `
      + `(${retenues.map((f) => f.id).join(", ")}). `
      + `Supprimez les doublons dans l'espace Employés : tant qu'il y en a `
      + `plusieurs, impossible de savoir à qui rattacher les documents.`,
      409
    ) };
  }

  cache.set(cle, { fiche: retenues[0], a: Date.now() });
  return { fiche: retenues[0] };
}

module.exports = { fichesParEmail, identiteFiche, oublier, TABLE_EMPLOYES };