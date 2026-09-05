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

export const TYPES_CONGE = ['annuel', 'maladie', 'sans_solde', 'exceptionnel'] as const;
export type TypeConge = (typeof TYPES_CONGE)[number];

export const LIBELLES_STATUT_CONGE: Record<StatutConge, string> = {
  EN_ATTENTE: 'En attente',
  APPROUVE: 'Approuvé',
  REFUSE: 'Refusé',
};

export const LIBELLES_TYPE_CONGE: Record<TypeConge, string> = {
  annuel: 'Congé annuel',
  maladie: 'Congé maladie',
  sans_solde: 'Sans solde',
  exceptionnel: 'Congé exceptionnel',
};

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