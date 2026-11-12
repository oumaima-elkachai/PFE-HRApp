// src/types/domaine.ts
//
// Source unique de vérité pour les valeurs énumérées du domaine.
// Doit rester aligné sur docs/data-design.md — toute divergence entre les
// deux est un défaut.
//
// Pourquoi « as const » plutôt que « enum » :
//   - un enum produit du code à l'exécution ; cet objet disparaît à la
//     compilation, sauf pour les libellés que l'on veut réellement afficher
//   - compatible avec verbatimModuleSyntax et erasableSyntaxOnly
//   - les valeurs restent des chaînes brutes, identiques à celles que
//     l'API émet et attend, sans conversion

// ── Congés ─────────────────────────────────────────────────────────

export const STATUTS_CONGE = ['EN_ATTENTE', 'APPROUVE', 'REFUSE'] as const;
export type StatutConge = (typeof STATUTS_CONGE)[number];

// Les sept types que le SERVEUR accepte — voir TYPES_VALIDES dans
// src/conges/demander.js, qui rejette tout le reste en 400.
//
// Cette liste n'en comptait que quatre : maternité, paternité et décès
// étaient donc impossibles à demander depuis l'application, alors que
// le serveur les traite. Les deux listes doivent rester identiques.
export const TYPES_CONGE = [
  'annuel', 'maladie', 'maternite', 'paternite',
  'deces', 'sans_solde', 'exceptionnel',
] as const;
export type TypeConge = (typeof TYPES_CONGE)[number];

export const LIBELLES_STATUT_CONGE: Record<StatutConge, string> = {
  EN_ATTENTE: 'En attente',
  APPROUVE: 'Approuvé',
  REFUSE: 'Refusé',
};

export const LIBELLES_TYPE_CONGE: Record<TypeConge, string> = {
  annuel: 'Congé annuel',
  maladie: 'Congé maladie',
  maternite: 'Congé maternité',
  paternite: 'Congé paternité',
  deces: 'Congé pour décès',
  sans_solde: 'Sans solde',
  exceptionnel: 'Congé exceptionnel',
};

/** Types pour lesquels le serveur EXIGE une pièce jointe.
 *
 *  Miroir de JUSTIFICATIF_REQUIS dans src/conges/demander.js, qui
 *  répond 400 sans elle. L'interface applique la même règle : laisser
 *  envoyer une demande que le serveur refusera fait perdre la saisie
 *  pour rien. */
export const TYPES_JUSTIFICATIF_REQUIS: readonly TypeConge[] = [
  'maladie', 'maternite', 'paternite', 'deces',
];

/** Seuls ces types sont décomptés du solde annuel */
export const TYPES_CONGE_DECOMPTES: readonly TypeConge[] = ['annuel', 'exceptionnel'];

// ── Pointages ──────────────────────────────────────────────────────

export const STATUTS_POINTAGE = ['EN_COURS', 'TERMINE'] as const;
export type StatutPointage = (typeof STATUTS_POINTAGE)[number];

export const LIBELLES_STATUT_POINTAGE: Record<StatutPointage, string> = {
  EN_COURS: 'En cours',
  TERMINE: 'Terminé',
};

// ── Candidatures ───────────────────────────────────────────────────

export const STATUTS_CANDIDATURE = [
  'SOUMIS',
  'PRESELECTION',
  'QUIZ_EN_ATTENTE',
  'QUIZ_ENVOYE',
  'QUIZ_TERMINE',
  'ENTRETIEN',
  'OFFRE',
  'EMBAUCHE',
  'REFUSE',
] as const;
export type StatutCandidature = (typeof STATUTS_CANDIDATURE)[number];

export const LIBELLES_STATUT_CANDIDATURE: Record<StatutCandidature, string> = {
  SOUMIS: 'Reçue',
  PRESELECTION: 'Présélection',
  QUIZ_EN_ATTENTE: 'Quiz à envoyer',
  QUIZ_ENVOYE: 'Quiz envoyé',
  QUIZ_TERMINE: 'Quiz terminé',
  ENTRETIEN: 'Entretien',
  OFFRE: 'Offre émise',
  EMBAUCHE: 'Embauché',
  REFUSE: 'Refusée',
};

/** Ordre du pipeline de recrutement, hors refus */
export const PIPELINE_RECRUTEMENT: readonly StatutCandidature[] = [
  'SOUMIS', 'PRESELECTION', 'QUIZ_ENVOYE', 'QUIZ_TERMINE', 'ENTRETIEN', 'OFFRE', 'EMBAUCHE',
];

// ── Offres ─────────────────────────────────────────────────────────

export const STATUTS_OFFRE = ['ACTIVE', 'POURVUE', 'ARCHIVEE'] as const;
export type StatutOffre = (typeof STATUTS_OFFRE)[number];

export const TYPES_CONTRAT = ['CDI', 'CDD', 'STAGE', 'ALTERNANCE'] as const;
export type TypeContrat = (typeof TYPES_CONTRAT)[number];

export const MODES_TRAVAIL = ['PRESENTIEL', 'HYBRIDE', 'DISTANCIEL'] as const;
export type ModeTravail = (typeof MODES_TRAVAIL)[number];

export const LIBELLES_STATUT_OFFRE: Record<StatutOffre, string> = {
  ACTIVE: 'Publiée',
  POURVUE: 'Pourvue',
  ARCHIVEE: 'Archivée',
};

export const LIBELLES_MODE_TRAVAIL: Record<ModeTravail, string> = {
  PRESENTIEL: 'Sur site',
  HYBRIDE: 'Hybride',
  DISTANCIEL: 'À distance',
};

// ── Entretiens ─────────────────────────────────────────────────────

export const TYPES_ENTRETIEN = ['TELEPHONE', 'VIDEO', 'SUR_SITE'] as const;
export type TypeEntretien = (typeof TYPES_ENTRETIEN)[number];

export const STATUTS_ENTRETIEN = ['PLANIFIE', 'TERMINE', 'ANNULE'] as const;
export type StatutEntretien = (typeof STATUTS_ENTRETIEN)[number];

export const LIBELLES_TYPE_ENTRETIEN: Record<TypeEntretien, string> = {
  TELEPHONE: 'Téléphonique',
  VIDEO: 'Visioconférence',
  SUR_SITE: 'Sur site',
};

// ── Rôles ──────────────────────────────────────────────────────────
// Correspondent aux groupes Cognito, reportés dans la revendication
// cognito:groups du jeton.

export const ROLES = ['RH', 'EMPLOYE', 'CANDIDAT'] as const;
export type Role = (typeof ROLES)[number];

// ═══════════════════════════════════════════════════════════════════
//  À AJOUTER DANS src/types/domaine.ts
//
//  Place ce bloc après la section « Rôles » et avant la section
//  « Aides » — les fonctions `libelle` et les gardes de type sont en
//  fin de fichier, et les deux gardes ci-dessous les rejoignent.
//
//  Les noms de champs sont ceux que paie.js lit dans
//  `situationFamiliale`, et ceux que src/situations/depot.js écrit dans
//  Employes. Les trois listes doivent rester identiques : une
//  divergence produirait un abattement accepté par l'interface et
//  silencieusement ignoré par le calcul.
// ═══════════════════════════════════════════════════════════════════

// ── Situation familiale et ses demandes de modification ────────────

export const STATUTS_DEMANDE_SITUATION = ['EN_ATTENTE', 'APPROUVE', 'REFUSE'] as const;
export type StatutDemandeSituation = (typeof STATUTS_DEMANDE_SITUATION)[number];

/** Miroir de CHAMPS dans src/situations/depot.js */
export const CHAMPS_SITUATION = [
  'chefDeFamille',
  'conjointACharge',
  'handicapSalarie',
  'nbEnfants',
  'nbEnfantsHandicapes',
  'nbEnfantsEtudiants',
] as const;
export type ChampSituation = (typeof CHAMPS_SITUATION)[number];

/** Champs booléens, par opposition aux compteurs */
export const CHAMPS_SITUATION_BOOLEENS: readonly ChampSituation[] = [
  'chefDeFamille', 'conjointACharge', 'handicapSalarie',
];

export const LIBELLES_STATUT_DEMANDE_SITUATION: Record<StatutDemandeSituation, string> = {
  EN_ATTENTE: 'En attente de validation',
  APPROUVE: 'Validée',
  REFUSE: 'Refusée',
};

export const LIBELLES_CHAMP_SITUATION: Record<ChampSituation, string> = {
  chefDeFamille: 'Chef de famille',
  conjointACharge: 'Conjoint à charge',
  handicapSalarie: 'Situation de handicap',
  nbEnfants: 'Enfants à charge',
  nbEnfantsHandicapes: 'Enfants handicapés',
  nbEnfantsEtudiants: 'Enfants étudiants non boursiers',
};

/**
 * Pièce attendue selon le champ déclaré.
 *
 * Affiché à la saisie : un salarié qui ignore quelle pièce fournir
 * envoie n'importe quoi, et la RH refuse, et il recommence. Le dire
 * avant évite deux allers-retours.
 */
export const JUSTIFICATIF_ATTENDU: Record<ChampSituation, string> = {
  chefDeFamille: 'Fiche d’état civil ou acte de mariage',
  conjointACharge: 'Attestation de non-revenu du conjoint',
  handicapSalarie: 'Carte d’invalidité ou certificat médical',
  nbEnfants: 'Acte de naissance ou fiche familiale d’état civil',
  nbEnfantsHandicapes: 'Carte d’invalidité de l’enfant',
  nbEnfantsEtudiants: 'Certificat de scolarité et attestation de non-bourse',
};

/**
 * Plafonds d'ABATTEMENT, pour information à l'écran seulement.
 *
 * Ce ne sont pas des bornes de saisie : un salarié peut avoir six
 * enfants et sa fiche doit le dire. Le plafonnement s'applique au
 * calcul, dans paie.js. L'interface s'en sert uniquement pour prévenir
 * — « au-delà de quatre, l'abattement n'augmente plus » — et jamais
 * pour refuser une valeur exacte.
 */
export const PLAFONDS_ABATTEMENT: Partial<Record<ChampSituation, number>> = {
  nbEnfants: 4,
  nbEnfantsEtudiants: 2,
};

export interface SituationFamiliale {
  chefDeFamille?: boolean;
  conjointACharge?: boolean;
  handicapSalarie?: boolean;
  nbEnfants?: number;
  nbEnfantsHandicapes?: number;
  nbEnfantsEtudiants?: number;
}

export interface ChangementSituation {
  champ: ChampSituation;
  avant: boolean | number;
  apres: boolean | number;
}

export interface DemandeSituation {
  id: string;
  employeId: string;
  email?: string | null;
  situation: SituationFamiliale;
  changements: ChangementSituation[];
  motif?: string | null;
  justificatifKey?: string | null;
  justificatifNom?: string | null;
  statut: StatutDemandeSituation;
  creeLe: string;
  traiteLe?: string | null;
  traiteParId?: string | null;
  commentaireRh?: string | null;
}

/** Garde de type, utile pour valider une saisie utilisateur */
export function estChampSituation(v: unknown): v is ChampSituation {
  return typeof v === 'string' && (CHAMPS_SITUATION as readonly string[]).includes(v);
}

export function estStatutDemandeSituation(v: unknown): v is StatutDemandeSituation {
  return typeof v === 'string'
    && (STATUTS_DEMANDE_SITUATION as readonly string[]).includes(v);
}

/**
 * Formate un changement pour l'affichage : « Enfants à charge : 2 → 3 ».
 * Les booléens se lisent mal en « false → true ».
 */
export function decrireChangement(c: ChangementSituation): string {
  const valeur = (v: boolean | number) =>
    typeof v === 'boolean' ? (v ? 'oui' : 'non') : String(v);
  return `${LIBELLES_CHAMP_SITUATION[c.champ]} : ${valeur(c.avant)} → ${valeur(c.apres)}`;
}

/** Une demande qui ne fait que réduire les droits est dispensée de pièce */
export function dispenseDeJustificatif(changements: ChangementSituation[]): boolean {
  if (changements.length === 0) return false;
  return changements.every((c) => Number(c.apres) < Number(c.avant));
}

// ── Aides ──────────────────────────────────────────────────────────

/**
 * Libellé d'une valeur, avec repli sur la valeur brute.
 *
 * Une valeur inattendue venue du serveur ne doit jamais faire tomber un
 * écran : c'est précisément ce qui s'est produit lors du passage des
 * statuts en majuscules.
 */
export function libelle<T extends string>(
  table: Record<string, string>,
  valeur: T | string | undefined | null,
  defaut = 'Inconnu'
): string {
  if (!valeur) return defaut;
  return table[valeur] ?? valeur;
}

/** Garde de type, utile pour valider une saisie utilisateur */
export function estStatutConge(v: unknown): v is StatutConge {
  return typeof v === 'string' && (STATUTS_CONGE as readonly string[]).includes(v);
}

export function estTypeConge(v: unknown): v is TypeConge {
  return typeof v === 'string' && (TYPES_CONGE as readonly string[]).includes(v);
}