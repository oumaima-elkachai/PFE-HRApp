// src/employes/annuaire.js
//
// GET /annuaire — qui travaille dans l'entreprise.
//
// ── Pourquoi un module à part, et pas lister.js ────────────────────
//
// L'annuaire et la liste des salariés répondent à deux questions
// différentes, pour deux publics différents :
//
//   · `GET /employes` sert la RH. Il rend la fiche complète : salaire,
//     CIN, matricule CNSS, date de naissance.
//   · `GET /annuaire` sert tout le monde. Il ne doit rendre que de quoi
//     joindre un collègue.
//
// Les faire passer par le même handler, c'est exposer la paie de toute
// l'entreprise au premier salarié qui lit l'onglet Réseau de son
// navigateur. La séparation n'est pas une élégance : c'est la mesure
// qui empêche la fuite.
//
// Ici, la liste des champs rendus est écrite une fois, en dur, et
// passée à DynamoDB en `ProjectionExpression`. Un champ ajouté demain
// à la fiche, un salaire ou un numéro de compte, n'apparaîtra pas dans
// l'annuaire parce qu'il n'est pas dans cette liste. C'est l'inverse
// d'une liste de champs à masquer, qu'on oublie toujours de compléter.
//
// ── Qui figure dans l'annuaire ─────────────────────────────────────
//
// Tout le monde, quelle que soit l'adresse.
//
// Une version précédente écartait les fiches dont l'adresse n'était
// pas dans un domaine déclaré. C'était une erreur de conception de ma
// part : un annuaire d'entreprise sert à trouver un collègue, et une
// personne dont l'adresse n'a pas encore été régularisée reste un
// collègue. La faire disparaître de l'annuaire ne corrige rien, ça
// rend seulement l'annuaire faux.
//
// Le domaine sert toujours, mais pour INFORMER et non pour exclure :
// chaque fiche porte `adressePersonnelle`, que la page affiche à la
// RH sous forme de pastille. La personne reste visible de tous.
//
// Les fiches sans adresse figurent aussi : elles ont un nom, un poste
// et souvent un téléphone, ce qui suffit à joindre quelqu'un.
//
// Seules les personnes sorties des effectifs sont écartées. Elles ne
// travaillent plus là, et la RH les retrouve dans sa propre liste.

const { ScanCommand } = require("@aws-sdk/lib-dynamodb");

const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, estRh } = require("../utils/identite");
const entreprise = require("../factures/entreprise");

const TABLE_EMPLOYES = process.env.TABLE_EMPLOYES || "Employes-local";

/**
 * Les seuls champs qui sortent. Rien d'autre ne peut sortir : DynamoDB
 * ne renvoie que ceux-là.
 *
 * `emailPerso` est absent volontairement. L'adresse personnelle sert à
 * remettre ses accès à quelqu'un, pas à le joindre au travail, et elle
 * n'a rien à faire dans un annuaire que lit toute l'entreprise.
 */
const CHAMPS = [
  "id",
  "prenom",
  "nom",
  "email",
  "telephone",
  "poste",
  "departement",
  "dateEmbauche",
  "statut",
];

/**
 * DynamoDB réserve une longue liste de mots (`name`, `status`,
 * `timestamp`…). Plutôt que de vérifier à chaque ajout si le nouveau
 * champ en fait partie, tous passent par un alias : la requête ne peut
 * pas échouer sur un mot réservé.
 */
const NOMS = {};
CHAMPS.forEach((champ, i) => { NOMS[`#c${i}`] = champ; });
const PROJECTION = Object.keys(NOMS).join(", ");

/**
 * Statuts qui sortent quelqu'un de l'annuaire.
 *
 * Volontairement une liste de ce qui exclut, et non de ce qui inclut :
 * un statut inattendu (« TITULAIRE », « STAGIAIRE », une casse
 * différente) laisse la personne visible. Entre afficher un ancien
 * salarié et faire disparaître la moitié de l'entreprise parce qu'un
 * statut n'était pas prévu, le premier se remarque et se corrige ; le
 * second se découvre devant un jury.
 */
const PARTIS = new Set([
  "SORTI", "SORTIE", "ARCHIVE", "ARCHIVÉ", "INACTIF", "DESACTIVE",
  "DEMISSION", "DÉMISSION", "LICENCIE", "LICENCIÉ", "RETRAITE",
  "RETRAITÉ", "FIN_CONTRAT", "SUPPRIME",
]);

const estParti = (statut) =>
  PARTIS.has(String(statut ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_"));

/**
 * Un candidat n'a pas à consulter la composition des équipes : il
 * postule, il ne travaille pas là.
 *
 * Le test est volontairement étroit — il faut être identifié COMME
 * candidat pour être refusé. Un jeton dont les groupes sont illisibles
 * passe : si la lecture des groupes se casse un jour, l'annuaire
 * continue de fonctionner au lieu de se fermer à tout le monde. Ce
 * n'est acceptable que parce que le contenu rendu ici est un annuaire
 * de contacts, et non la paie.
 */
function estCandidat(moi) {
  const groupes = []
    .concat(moi.groupes ?? [], moi.groups ?? [], moi["cognito:groups"] ?? [])
    .map((g) => String(g).toUpperCase());

  if (groupes.length > 0) {
    return groupes.includes("CANDIDAT")
      && !groupes.includes("RH")
      && !groupes.includes("EMPLOYE");
  }

  return String(moi.role ?? "").toUpperCase() === "CANDIDAT";
}

/**
 * Toutes les fiches, projetées.
 *
 * Un `Scan` rend au plus 1 Mo par appel, puis un `LastEvaluatedKey`.
 * Sans cette boucle, une entreprise un peu grosse verrait son annuaire
 * s'arrêter au milieu de l'alphabet — sans erreur, ce qui est le pire
 * des cas. La borne évite qu'une table anormale fasse tourner la
 * fonction jusqu'au délai d'expiration.
 */
async function lireToutesLesFiches({ plafond = 20000 } = {}) {
  const fiches = [];
  let depart;
  let tours = 0;

  do {
    const r = await docClient.send(new ScanCommand({
      TableName: TABLE_EMPLOYES,
      ProjectionExpression: PROJECTION,
      ExpressionAttributeNames: NOMS,
      ...(depart ? { ExclusiveStartKey: depart } : {}),
    }));

    fiches.push(...(r.Items ?? []));
    depart = r.LastEvaluatedKey;
    tours += 1;
  } while (depart && fiches.length < plafond && tours < 100);

  return fiches;
}

/**
 * Le tri du serveur, pour que deux appels rendent le même ordre.
 * La page retrie selon la langue affichée ; ce tri-ci n'existe que
 * pour la stabilité.
 */
const parNom = (a, b) =>
  `${a.nom ?? ""} ${a.prenom ?? ""}`.localeCompare(`${b.nom ?? ""} ${b.prenom ?? ""}`, "fr");

async function handlerAnnuaire(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);

  if (estCandidat(moi)) {
    return erreur(
      "L'annuaire est réservé aux personnes qui travaillent dans "
      + "l'entreprise.",
      403
    );
  }

  const ent = await entreprise.charger();
  const domaines = entreprise.domainesDe(ent.domaines);

  const fiches = await lireToutesLesFiches();

  const exclus = { partis: 0, sansAdresse: 0, horsDomaine: 0 };
  const collegues = [];
  const aRegulariser = [];

  for (const f of fiches) {
    // Le seul motif d'exclusion : la personne ne travaille plus ici.
    if (estParti(f.statut)) { exclus.partis += 1; continue; }

    const email = String(f.email ?? "").trim().toLowerCase();

    // Deux comptages, qui ne retirent personne de la liste. Ils
    // servent à la RH pour savoir ce qu'il reste à mettre en ordre.
    if (!email) exclus.sansAdresse += 1;

    const personnelle = !!email && !entreprise.emailAppartient(email, domaines);
    if (personnelle) {
      exclus.horsDomaine += 1;
      if (aRegulariser.length < 50) {
        aRegulariser.push({
          id: f.id,
          prenom: f.prenom ?? "",
          nom: f.nom ?? "",
          email,
        });
      }
    }

    collegues.push({
      ...f,
      email,
      // Lu par la page pour poser une pastille, jamais pour masquer.
      // Toujours false quand aucun domaine n'est déclaré : sans
      // référence, on ne juge pas.
      adressePersonnelle: personnelle,
    });
  }

  collegues.sort(parNom);

  const rh = estRh(moi);

  return succes({
    collegues,
    total: collegues.length,
    // Ce que la page affiche en en-tête : « esprit.tn · 24 collaborateurs ».
    domaines,
    entreprise: ent.nom ?? null,
    // Les comptes d'exclusion et les fiches à régulariser ne servent
    // qu'à la RH, et une adresse personnelle n'est pas une donnée à
    // diffuser dans l'entreprise.
    ...(rh
      ? { exclus, aRegulariser }
      : {}),
  });
}

module.exports = {
  handler: handlerAnnuaire,
  handlerAnnuaire,
  // Exportés pour les tests et pour la page Salariés, qui affiche la
  // même pastille « adresse personnelle » sur les fiches concernées.
  CHAMPS,
  estParti,
  estCandidat,
};