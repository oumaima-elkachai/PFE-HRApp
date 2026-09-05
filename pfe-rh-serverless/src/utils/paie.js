// src/utils/paie.js
//
// Moteur de calcul de paie — règles tunisiennes.
//
// Fonctions pures, sans accès base ni entrées/sorties : chaque règle est
// testable isolément, et le calcul est reproductible à l'identique.
//
// Sources : Code de l'IRPP (loi n°89-114), barème de la loi de finances
// 2025 applicable en 2026, décret n°74-499 pour les taux CNSS.
// Les taux sont regroupés dans BAREME afin qu'une évolution législative
// se traduise par une seule modification.

// ── Paramètres légaux ──────────────────────────────────────────────

const BAREME = {
  // Cotisation salariale, régime général RSNA
  cnss: {
    taux: 0.0968,          // 9,18 % de base + 0,50 %
    plafondMensuel: 5000,  // au-delà, la cotisation n'augmente plus
  },

  // Déduction forfaitaire pour frais professionnels (art. 26 du Code IRPP)
  fraisProfessionnels: {
    taux: 0.10,
    plafondAnnuel: 2000,
  },

  // Abattements pour charges de famille, en dinars par an.
  // Note : la doctrine diverge sur le point d'application — la plupart
  // des sources les traitent comme une réduction du revenu imposable,
  // ce que retient cette implémentation.
  famille: {
    chefDeFamille: 300,
    parEnfant: 100,
    nbEnfantsMax: 4,
  },

  // Barème progressif annuel, huit tranches
  irpp: [
    { plafond: 5000,      taux: 0.00 },
    { plafond: 10000,     taux: 0.15 },
    { plafond: 20000,     taux: 0.25 },
    { plafond: 30000,     taux: 0.30 },
    { plafond: 40000,     taux: 0.33 },
    { plafond: 50000,     taux: 0.36 },
    { plafond: 70000,     taux: 0.38 },
    { plafond: Infinity,  taux: 0.40 },
  ],

  // Contribution sociale de solidarité : même base que l'IRPP,
  // les revenus relevant de la tranche à 0 % en sont exonérés.
  css: {
    taux: 0.01,
    seuilExoneration: 5000, // revenu net imposable annuel
  },
};

// Majorations pour heures exceptionnelles.
// À ajuster selon la convention collective applicable : le Code du
// travail fixe des planchers, les conventions de branche peuvent
// prévoir mieux.
const MAJORATIONS = {
  heuresSupplementaires: 0.75, // régime 48 h/semaine
  weekend: 1.00,               // jour de repos hebdomadaire
  jourFerie: 1.00,             // jour férié chômé et payé
};

// Heures mensuelles conventionnelles, régimes 48 h et 40 h par semaine
const HEURES_MENSUELLES = { r48: 208, r40: 173.33 };

const arrondi = (v, n = 3) => Math.round(v * 10 ** n) / 10 ** n;

// ── Cotisations ────────────────────────────────────────────────────

/**
 * Cotisation CNSS salariale.
 * La base est plafonnée : au-delà de 5 000 DT de brut, la cotisation
 * reste constante.
 */
function cotisationCnss(brutMensuel) {
  const base = Math.min(brutMensuel, BAREME.cnss.plafondMensuel);
  return arrondi(base * BAREME.cnss.taux);
}

/**
 * Revenu net imposable annuel.
 *
 * Brut annuel
 *   − CNSS salariale
 *   − frais professionnels (10 %, plafonnés)
 *   − abattements familiaux
 */
function revenuNetImposableAnnuel(brutAnnuel, cnssAnnuelle, situation = {}) {
  const apresCnss = Math.max(0, brutAnnuel - cnssAnnuelle);

  const fraisPro = Math.min(
    apresCnss * BAREME.fraisProfessionnels.taux,
    BAREME.fraisProfessionnels.plafondAnnuel
  );

  const nbEnfants = Math.min(
    situation.nbEnfants || 0,
    BAREME.famille.nbEnfantsMax
  );

  const abattements =
    (situation.chefDeFamille ? BAREME.famille.chefDeFamille : 0) +
    nbEnfants * BAREME.famille.parEnfant;

  return {
    apresCnss,
    fraisPro: arrondi(fraisPro),
    abattements,
    revenuNetImposable: Math.max(0, apresCnss - fraisPro - abattements),
  };
}

/**
 * IRPP annuel, calculé tranche par tranche.
 * Le taux de la dernière tranche atteinte ne s'applique qu'à la
 * fraction du revenu qui s'y trouve, jamais à la totalité.
 */
function irppAnnuel(revenuNetImposable) {
  let impot = 0;
  let plancher = 0;
  const detail = [];

  for (const tranche of BAREME.irpp) {
    if (revenuNetImposable <= plancher) break;

    const partImposable = Math.min(revenuNetImposable, tranche.plafond) - plancher;
    const montant = partImposable * tranche.taux;
    impot += montant;

    if (partImposable > 0) {
      detail.push({
        de: plancher,
        a: tranche.plafond === Infinity ? null : tranche.plafond,
        taux: tranche.taux,
        base: arrondi(partImposable),
        montant: arrondi(montant),
      });
    }
    plancher = tranche.plafond;
  }

  return { impot: arrondi(impot), detail };
}

/** Contribution sociale de solidarité */
function contributionSolidarite(revenuNetImposable) {
  if (revenuNetImposable <= BAREME.css.seuilExoneration) return 0;
  return arrondi(revenuNetImposable * BAREME.css.taux);
}

// ── Bulletin complet ───────────────────────────────────────────────

/**
 * @param {object} p
 * @param {number} p.salaireBrutMensuel   rémunération contractuelle fixe
 * @param {number} [p.heuresMensuelles]   horaire conventionnel (défaut 208)
 * @param {number} [p.heuresSupplementaires]
 * @param {number} [p.heuresWeekend]
 * @param {number} [p.heuresFeries]
 * @param {number} [p.primes]             primes imposables
 * @param {number} [p.joursAbsenceNonJustifiee]
 * @param {number} [p.nbJoursOuvrables]   du mois considéré
 * @param {number} [p.minutesRetard]      comptabilisées, non déduites par défaut
 * @param {boolean} [p.deduireRetards]
 * @param {object} [p.situationFamiliale] { chefDeFamille, nbEnfants }
 */
function calculerBulletin(p) {
  const heuresMensuelles = p.heuresMensuelles || HEURES_MENSUELLES.r48;
  const nbJoursOuvrables = p.nbJoursOuvrables || 22;

  const salaireBase = p.salaireBrutMensuel;

  // Taux horaire déduit du salaire contractuel, et non l'inverse :
  // c'est le salaire mensuel qui fait foi.
  const tauxHoraire = salaireBase / heuresMensuelles;
  const salaireJournalier = salaireBase / nbJoursOuvrables;

  // ── Éléments variables ──
  const gains = {
    heuresSupplementaires: arrondi(
      (p.heuresSupplementaires || 0) * tauxHoraire * (1 + MAJORATIONS.heuresSupplementaires)
    ),
    heuresWeekend: arrondi(
      (p.heuresWeekend || 0) * tauxHoraire * (1 + MAJORATIONS.weekend)
    ),
    heuresFeries: arrondi(
      (p.heuresFeries || 0) * tauxHoraire * (1 + MAJORATIONS.jourFerie)
    ),
    primes: arrondi(p.primes || 0),
  };

  // ── Retenues sur le brut ──
  // Les congés payés et les jours fériés ne se déduisent pas : ils sont
  // rémunérés. Seule l'absence non justifiée entraîne une retenue.
  const retenues = {
    absences: arrondi((p.joursAbsenceNonJustifiee || 0) * salaireJournalier),
    retards: 0,
  };

  // Une retenue pour retard n'est pas automatique en droit tunisien :
  // le retard relève du pouvoir disciplinaire. Elle reste optionnelle
  // et doit s'appuyer sur le règlement intérieur.
  if (p.deduireRetards && p.minutesRetard) {
    retenues.retards = arrondi((p.minutesRetard / 60) * tauxHoraire);
  }

  const totalGains = Object.values(gains).reduce((s, v) => s + v, 0);
  const totalRetenues = Object.values(retenues).reduce((s, v) => s + v, 0);

  const brut = arrondi(Math.max(0, salaireBase + totalGains - totalRetenues));

  // ── Cotisations et impôts ──
  const cnss = cotisationCnss(brut);

  // Le barème étant annuel, on annualise le brut du mois. C'est la
  // méthode de retenue à la source usuelle ; une régularisation annuelle
  // corrige l'écart si la rémunération varie fortement d'un mois à l'autre.
  const brutAnnualise = brut * 12;
  const cnssAnnualisee = cnss * 12;

  const assiette = revenuNetImposableAnnuel(
    brutAnnualise, cnssAnnualisee, p.situationFamiliale || {}
  );

  const { impot: irppAn, detail: tranches } = irppAnnuel(assiette.revenuNetImposable);
  const cssAn = contributionSolidarite(assiette.revenuNetImposable);

  const irpp = arrondi(irppAn / 12);
  const css = arrondi(cssAn / 12);

  const net = arrondi(Math.max(0, brut - cnss - irpp - css));

  return {
    // Éléments de calcul, conservés pour l'audit et l'affichage
    tauxHoraire: arrondi(tauxHoraire),
    salaireJournalier: arrondi(salaireJournalier),
    heuresMensuelles,

    salaireBase: arrondi(salaireBase),
    gains,
    totalGains: arrondi(totalGains),
    retenues,
    totalRetenues: arrondi(totalRetenues),

    brut,

    cotisations: {
      cnss,
      irpp,
      css,
      total: arrondi(cnss + irpp + css),
    },

    net,

    // Détail fiscal : indispensable pour justifier le montant retenu
    fiscal: {
      brutAnnualise: arrondi(brutAnnualise),
      cnssAnnualisee: arrondi(cnssAnnualisee),
      fraisProfessionnels: assiette.fraisPro,
      abattementsFamiliaux: assiette.abattements,
      revenuNetImposable: arrondi(assiette.revenuNetImposable),
      irppAnnuel: irppAn,
      cssAnnuelle: cssAn,
      tranches,
      tauxMoyen: brut > 0 ? arrondi(((cnss + irpp + css) / brut) * 100, 2) : 0,
    },
  };
}

module.exports = {
  BAREME,
  MAJORATIONS,
  HEURES_MENSUELLES,
  cotisationCnss,
  revenuNetImposableAnnuel,
  irppAnnuel,
  contributionSolidarite,
  calculerBulletin,
  arrondi,
};