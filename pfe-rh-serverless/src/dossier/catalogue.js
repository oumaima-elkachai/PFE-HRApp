// src/dossier/catalogue.js
//
// Les pièces attendues au dossier, et les documents que la RH délivre.
//
// Le catalogue vit côté serveur et descend dans la réponse : la page ne
// redéclare aucune liste. Deux listes finiraient par diverger, et c'est
// le genre d'écart qu'on ne découvre qu'en démonstration.
//
// ── Sur le champ `nature` ──────────────────────────────────────────
//
// Il n'existe AUCUN texte tunisien dressant la liste des pièces d'un
// dossier du personnel. Pas d'équivalent d'un « article dossier
// salarié ». La plupart des pièces ci-dessous sont donc des exigences
// d'entreprise, et c'est ainsi qu'elles sont déclarées :
//
//   LEGALE   le texte est cité dans `reference`, et il a été lu.
//   USAGE    pratique d'entreprise, aucune obligation légale trouvée.
//   INDIRECTE aucun texte n'impose la pièce, mais un texte impose une
//            donnée qu'elle est le seul moyen d'obtenir.
//
// Afficher « obligation légale » sans texte serait pire que d'afficher
// « exigence de l'entreprise » : un jury peut demander l'article, et la
// collecte de pièces sans fondement expose l'employeur.

const CATALOGUE = {
  CONTRAT_TRAVAIL: {
    libelle: "Contrat de travail signé",
    nature: "LEGALE",
    // Vérifié : art. 6-4 impose l'écrit en DEUX exemplaires pour le CDD,
    // un pour l'employeur, un pour le salarié. Pour le CDI l'écrit n'est
    // pas imposé (art. 6 : la relation de travail se prouve par tous
    // moyens), mais la réforme de 2025 pose une présomption de CDI, ce
    // qui rend l'écrit utile sans le rendre obligatoire.
    reference: "Code du travail, art. 6-4 (CDD : écrit en deux exemplaires)",
    obligatoire: true,
    expire: false,
    multiple: true, // un avenant s'ajoute au contrat initial
  },

  CARTE_CNSS: {
    libelle: "Numéro d'immatriculation CNSS",
    nature: "INDIRECTE",
    // Vérifié : l'art. 143 §3 impose de porter le numéro d'immatriculation
    // du salarié sur chaque bulletin de paie. Aucun texte n'exige « la
    // carte », mais l'employeur doit nécessairement détenir le numéro.
    reference: "Code du travail, art. 143 §3 (mention obligatoire du bulletin de paie)",
    obligatoire: true,
    expire: false,
    multiple: false,
  },

  CERTIFICAT_MEDICAL: {
    libelle: "Fiche d'aptitude au travail",
    nature: "LEGALE",
    // Vérifié : art. 153-2, les services de médecine du travail examinent
    // l'aptitude « aussi bien au moment de l'embauche qu'au cours de
    // l'emploi », et l'art. 152-3 oblige le salarié à s'y soumettre. Le
    // modèle de fiche est fixé par l'arrêté du 21 juillet 2009.
    //
    // Pas de `validiteMois` : le délai et la périodicité sont dans le
    // décret n° 2000-1985, que je n'ai pas pu lire. Un chiffre inventé
    // déclencherait de fausses alertes d'expiration, donc le salarié
    // saisit lui-même la date portée sur sa fiche.
    reference: "Code du travail, art. 152-3 et 153-2 ; arrêté du 21 juillet 2009",
    obligatoire: true,
    expire: true,
    multiple: false,
  },

  CIN: {
    libelle: "Carte d'identité nationale",
    nature: "USAGE",
    reference: "",
    obligatoire: true,
    expire: false,
    multiple: false,
  },

  EXTRAIT_NAISSANCE: {
    libelle: "Extrait de naissance",
    nature: "USAGE",
    reference: "",
    obligatoire: true,
    expire: false,
    multiple: false,
  },

  DIPLOME: {
    libelle: "Diplômes et attestations de travail",
    nature: "USAGE",
    reference: "",
    obligatoire: true,
    expire: false,
    multiple: true,
  },

  RIB: {
    libelle: "Relevé d'identité bancaire",
    nature: "USAGE",
    reference: "",
    obligatoire: true,
    expire: false,
    multiple: false,
  },

  PHOTO_IDENTITE: {
    libelle: "Photo d'identité",
    nature: "USAGE",
    reference: "",
    obligatoire: false,
    expire: false,
    multiple: false,
  },

  CASIER_JUDICIAIRE: {
    libelle: "Bulletin n° 3 du casier judiciaire",
    nature: "SECTORIELLE",
    // Le document existe (Ministère de l'Intérieur, SICAD) et certaines
    // réglementations sectorielles l'exigent — gardiennage, petite
    // enfance. Aucun texte du Code du travail n'en fait une pièce
    // d'embauche de droit commun.
    reference: "Exigé par certaines réglementations sectorielles",
    obligatoire: false,
    expire: true,
    multiple: false,
  },

  JUSTIFICATIF_DOMICILE: {
    libelle: "Justificatif de domicile",
    nature: "USAGE",
    reference: "",
    obligatoire: false,
    expire: false,
    multiple: false,
  },

  CV: {
    libelle: "Curriculum vitæ",
    nature: "USAGE",
    reference: "",
    obligatoire: false,
    expire: false,
    multiple: false,
  },
};

// ── Les documents que la RH délivre ────────────────────────────────
//
// Même règle : la référence n'est citée que si le texte a été lu.

const CATALOGUE_DELIVRES = {
  ATTESTATION_TRAVAIL: {
    libelle: "Attestation de travail",
    nature: "USAGE",
    reference: "",
    delaiHeures: 24,
  },

  ATTESTATION_SALAIRE: {
    libelle: "Attestation de salaire",
    nature: "USAGE",
    reference: "",
    delaiHeures: 48,
  },

  CERTIFICAT_TRAVAIL: {
    libelle: "Certificat de travail",
    nature: "LEGALE",
    // Vérifié : c'est l'article 27, et non l'article 25 — l'article 25
    // traite de la suspension du contrat sur décision administrative ou
    // judiciaire de fermeture. L'art. 27 énumère LIMITATIVEMENT les
    // mentions : date d'entrée, date de sortie, nature de l'emploi ou des
    // emplois successifs, et les périodes correspondantes. Il est exempt
    // de droit de timbre et d'enregistrement.
    reference: "Code du travail, art. 27",
    mentions: [
      "Date d'entrée",
      "Date de sortie",
      "Nature de l'emploi, ou des emplois successifs occupés",
      "Périodes pendant lesquelles chaque emploi a été tenu",
    ],
    delaiHeures: 48,
  },

  ATTESTATION_CONGES: {
    libelle: "Attestation de congés",
    nature: "USAGE",
    reference: "",
    delaiHeures: 24,
  },

  COPIE_CONTRAT: {
    libelle: "Copie du contrat de travail",
    nature: "LEGALE",
    reference: "Code du travail, art. 6-4 (CDD : un exemplaire pour le salarié)",
    delaiHeures: 48,
  },

  DUPLICATA_BULLETIN: {
    libelle: "Duplicata de bulletin de paie",
    nature: "LEGALE",
    // Vérifié : art. 143, modifié par la loi n° 96-62 du 15 juillet 1996.
    // Neuf mentions obligatoires. L'art. 145 précise qu'accepter un
    // bulletin sans réserve ne vaut pas renonciation aux sommes dues :
    // un accusé de réception n'est donc jamais un solde de tout compte.
    reference: "Code du travail, art. 143 (loi n° 96-62 du 15 juillet 1996)",
    delaiHeures: 24,
  },
};

// Les états d'une pièce. `MANQUANTE` et `EXPIREE` ne sont jamais stockés :
// l'un est l'absence de ligne, l'autre se déduit de la date du jour. Les
// calculer au lieu de les écrire évite une tâche de fond qui ferait
// vieillir les pièces, et donc un état faux les jours où elle ne tourne pas.
const STATUTS = ["MANQUANTE", "EN_ATTENTE", "VALIDEE", "REFUSEE", "EXPIREE"];

const typeConnu = (t) => Object.prototype.hasOwnProperty.call(CATALOGUE, t);
const exigeEcheance = (t) => !!CATALOGUE[t]?.expire;

const obligatoires = () =>
  Object.entries(CATALOGUE).filter(([, d]) => d.obligatoire).map(([t]) => t);

module.exports = {
  CATALOGUE, CATALOGUE_DELIVRES, STATUTS,
  typeConnu, exigeEcheance, obligatoires,
};