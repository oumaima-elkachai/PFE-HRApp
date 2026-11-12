// src/utils/feries.ts
//
// Jours fériés tunisiens, et décompte des jours ouvrables.
//
// ── Pourquoi un module à part ──────────────────────────────────────
//
// Deux écrans ont besoin de la même liste : l'historique de pointage,
// qui déduit les fériés des jours ouvrables du mois pour ne pas
// compter d'absences fictives, et le formulaire de congés, qui annonce
// au salarié combien de jours sa demande consommera.
//
// Deux copies de la même liste divergent toujours : on en corrige une,
// on oublie l'autre, et l'application affiche deux décomptes
// différents pour le même mois. Une seule source.
//
// ── Ce que ce module ne fait PAS ───────────────────────────────────
//
// Il ne fait pas foi. Le décompte qui compte est celui du serveur,
// seul à connaître l'accord d'entreprise, les reports et les demi-
// journées. Ce module sert à PRÉVENIR le salarié avant qu'il
// n'envoie — pas à décider à la place de la RH.

/** Fériés civils, à date fixe : « MM-JJ ».
 *
 *  Ils tombent au même jour chaque année, donc on les engendre pour
 *  n'importe quelle année demandée. */
export const FERIES_FIXES = [
  '01-01', // Nouvel An
  '01-14', // Fête de la Révolution et de la Jeunesse
  '03-20', // Fête de l'Indépendance
  '04-09', // Jour des Martyrs
  '05-01', // Fête du Travail
  '07-25', // Fête de la République
  '08-13', // Fête de la Femme
  '10-15', // Fête de l'Évacuation
];

/** Fêtes religieuses, en AAAA-MM-JJ.
 *
 *  Elles suivent le calendrier lunaire : leur date se décale d'environ
 *  onze jours chaque année et ne se calcule pas d'une ligne. Cette
 *  table est donc à compléter année par année.
 *
 *  Tant qu'une année n'y figure pas, ses fêtes religieuses comptent
 *  comme des jours ouvrables. C'est une limite connue : mieux vaut la
 *  lire ici que la découvrir dans un décompte faux. */
export const FERIES_MOBILES: Record<number, string[]> = {
  2026: [],
};

/** Les fériés d'une année, en AAAA-MM-JJ. */
export function feriesDe(annee: number): Set<string> {
  return new Set([
    ...FERIES_FIXES.map((md) => `${annee}-${md}`),
    ...(FERIES_MOBILES[annee] ?? []),
  ]);
}

const deuxChiffres = (n: number) => String(n).padStart(2, '0');

/** Date d'un objet Date en AAAA-MM-JJ, dans le fuseau du navigateur.
 *
 *  toISOString() convertirait en UTC et décalerait d'un jour entre
 *  minuit et une heure du matin en Tunisie. */
export function enIso(d: Date): string {
  return `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`;
}

export const estWeekend = (iso: string) =>
  [0, 6].includes(new Date(`${iso}T12:00:00`).getDay());

export const estFerie = (iso: string) =>
  feriesDe(Number(iso.slice(0, 4))).has(iso);

/** Un jour ouvrable : ni weekend, ni férié. */
export const estOuvrable = (iso: string) => !estWeekend(iso) && !estFerie(iso);

/** Jours ouvrables d'un mois, fériés déduits.
 *
 *  « jusquAu » borne le comptage à ce jour du mois. Pour le mois en
 *  cours, on ne compte que les jours écoulés : sans cette borne, les
 *  jours ouvrables à venir apparaissent en absences. */
export function joursOuvrablesDuMois(
  mois: number, annee: number, jusquAu?: number,
): number {
  const feries = feriesDe(annee);
  const dernier = new Date(annee, mois, 0).getDate();
  const borne = Math.min(jusquAu ?? dernier, dernier);

  let n = 0;
  for (let j = 1; j <= borne; j += 1) {
    const d = new Date(annee, mois - 1, j);
    const cle = `${annee}-${deuxChiffres(mois)}-${deuxChiffres(j)}`;
    if (d.getDay() !== 0 && d.getDay() !== 6 && !feries.has(cle)) n += 1;
  }
  return n;
}

/** Jours ouvrables entre deux dates incluses, fériés déduits.
 *
 *  La borne de sécurité arrête la boucle au-delà d'un an : une date de
 *  fin aberrante saisie à la main ne doit pas figer l'interface. */
export function joursOuvrablesEntre(debut: string, fin: string): number {
  if (!debut || !fin || fin < debut) return 0;

  const d = new Date(`${debut}T12:00:00`);
  const f = new Date(`${fin}T12:00:00`);

  // Une demande peut chevaucher le 31 décembre : on charge les fériés
  // des deux années plutôt que de ceux de la seule date de début.
  const feries = new Set([
    ...feriesDe(d.getFullYear()),
    ...feriesDe(f.getFullYear()),
  ]);

  let n = 0;
  let securite = 0;

  while (d <= f && securite < 400) {
    if (![0, 6].includes(d.getDay()) && !feries.has(enIso(d))) n += 1;
    d.setDate(d.getDate() + 1);
    securite += 1;
  }

  return n;
}

/** Lendemain d'une date, au même format. */
export function lendemainDe(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return enIso(d);
}

/** Date du jour en AAAA-MM-JJ. */
export const dateAujourdhui = () => enIso(new Date());