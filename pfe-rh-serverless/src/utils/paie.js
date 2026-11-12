// src/utils/paie.js
//
// Moteur de calcul de paie — règles tunisiennes.
//
// Fonctions pures, sans accès base ni entrées/sorties : chaque règle
// est testable isolément, et le calcul est reproductible à l'identique.
//
// Sources : Code de l'IRPP (loi n°89-114), barème de la loi de finances
// 2025 (loi n°48-2024, art. 36) applicable aux revenus depuis le
// 1er janvier 2025, décret n°74-499 pour les taux CNSS.
// Les taux sont regroupés dans BAREME afin qu'une évolution
// législative se traduise par une seule modification.

// ── Paramètres légaux ──────────────────────────────────────────────

const BAREME = {
  // Cotisation salariale, régime général RSNA
  cnss: {
    taux: 0.0968,          // 9,18 % de base + 0,50 % perte d'emploi
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
    conjoint: 100,
    parEnfant: 100,
    nbEnfantsMax: 4,
    // Dix fois l'abattement d'un enfant ordinaire, sans limite de rang
    // ni d'âge. C'est l'abattement de l'enfant handicapé, et non celui
    // du salarié lui-même : ce dernier n'est pas implémenté faute de
    // texte vérifié.
    enfantHandicape: 1000,
    // Enseignement supérieur sans bourse
    enfantEtudiant: 1000,
    nbEtudiantsMax: 2,
  },

  // Barème progressif annuel, huit tranches
  irpp: [
    { plafond: 5000,     taux: 0.00 },
    { plafond: 10000,    taux: 0.15 },
    { plafond: 20000,    taux: 0.25 },
    { plafond: 30000,    taux: 0.30 },
    { plafond: 40000,    taux: 0.33 },
    { plafond: 50000,    taux: 0.36 },
    { plafond: 70000,    taux: 0.38 },
    { plafond: Infinity, taux: 0.40 },
  ],

  // Contribution sociale de solidarité : même base que l'IRPP,
  // les revenus relevant de la tranche à 0 % en sont exonérés.
  //
  // ⚠ À TRANCHER SUR LE TEXTE OFFICIEL. Les sources divergent sur deux
  // points à la fois : certaines annoncent 1 % du revenu net imposable
  // (ce que retient ce fichier), d'autres 0,5 % du brut. Les deux
  // lectures ne donnent pas le même montant. Avant la soutenance,
  // remonte à la loi de finances et à la note commune de la DGI, puis
  // fixe la valeur ici — le reste du code et l'affichage la suivront,
  // puisque le barème est désormais renvoyé avec le bulletin.
  css: {
    taux: 0.01,
    seuilExoneration: 5000,
    assiette: 'revenuNetImposable', // ou 'brut' selon la lecture retenue
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

/**
 * Réglages d'entreprise, par défaut.
 *
 * Tout ce qui n'est pas imposé par la loi vit ici : primes, bons,
 * pondérations. Une PME qui adopte l'application remplace cet objet
 * par son propre item de la table ParametresPaie, sans toucher au code.
 *
 * Les paliers d'ancienneté ci-dessous sont des VALEURS D'EXEMPLE : la
 * convention collective de branche fait foi.
 */
const REGLAGES_DEFAUT = {
  anciennete: {
    actif: false,
    paliers: [
      { ansMin: 3,  taux: 0.03 },
      { ansMin: 5,  taux: 0.06 },
      { ansMin: 10, taux: 0.10 },
      { ansMin: 15, taux: 0.15 },
    ],
  },

  ponctualite: {
    actif: false,
    minutesTolerees: 60,     // cumulées sur le mois
    penaliteParAbsence: 25,  // points de note, par absence injustifiée
  },

  rendement: {
    actif: false,
    periodicite: 'trimestrielle',
  },

  // Prime issue de la note. Sans seuil, une note de 12 donnerait encore
  // 1,2 % du salaire, ce qui vide la prime de son sens.
  prime: {
    tauxMax: 0.10,
    seuilNote: 50,
    poids: { ponctualite: 0.5, rendement: 0.5 },
  },

  // horsAssiette : le bon s'ajoute après les cotisations, comme un
  // remboursement de frais. Sinon il entre dans le brut et devient
  // cotisé et imposé, comme un avantage en nature ordinaire.
  //
  // Le ticket restaurant de panier dispose d'une base d'exonération.
  // Les bons carburant n'en ont pas de confirmée : par défaut ils
  // entrent dans l'assiette, et c'est à l'entreprise d'assumer le
  // contraire si elle a un texte.
  bons: {
    alimentaire: { montant: 0, horsAssiette: true,  actif: false },
    carburant:   { montant: 0, horsAssiette: false, actif: false },
    transport:   { montant: 0, horsAssiette: false, actif: false },
  },

  // Primes familiales versées par l'entreprise. À ne pas confondre avec
  // les abattements fiscaux de BAREME.famille : celles-ci sont du
  // salaire, donc cotisées et imposées, et coûtent à l'employeur.
  primesFamiliales: {
    actif: false,
    handicapSalarie: 0,
    chefDeFamille: 0,
    parEnfant: 0,
  },
};

const arrondi = (v, n = 3) => Math.round(v * 10 ** n) / 10 ** n;

/** Fusion peu profonde d'un réglage d'entreprise sur les valeurs par défaut */
function fusionnerReglages(perso = {}) {
  const r = { ...REGLAGES_DEFAUT };
  for (const cle of Object.keys(REGLAGES_DEFAUT)) {
    r[cle] = { ...REGLAGES_DEFAUT[cle], ...(perso[cle] || {}) };
  }
  if (perso.prime?.poids) {
    r.prime.poids = { ...REGLAGES_DEFAUT.prime.poids, ...perso.prime.poids };
  }
  if (perso.bons) {
    r.bons = {};
    for (const nom of new Set([...Object.keys(REGLAGES_DEFAUT.bons), ...Object.keys(perso.bons)])) {
      r.bons[nom] = { ...(REGLAGES_DEFAUT.bons[nom] || {}), ...(perso.bons[nom] || {}) };
    }
  }
  return r;
}

// ── Cotisations ────────────────────────────────────────────────────

/**
 * Cotisation CNSS salariale.
 *
 * ⚠ Le plafond mensuel de 5 000 DT est à vérifier : contrairement au
 * régime français, le RSNA tunisien est généralement présenté comme
 * déplafonné. Si c'est le cas, ce plafond sous-déduit les hauts
 * salaires. Confirme-le avant la soutenance, puis mets le plafond à
 * Infinity ou garde-le avec sa source en commentaire.
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
 *
 * Les plafonds de nombre d'enfants sont appliqués ICI et non à la
 * saisie : un salarié peut réellement avoir six enfants, sa fiche doit
 * le dire, c'est l'abattement qui s'arrête à quatre.
 */
function revenuNetImposableAnnuel(brutAnnuel, cnssAnnuelle, situation = {}) {
  const apresCnss = Math.max(0, brutAnnuel - cnssAnnuelle);

  const fraisPro = Math.min(
    apresCnss * BAREME.fraisProfessionnels.taux,
    BAREME.fraisProfessionnels.plafondAnnuel
  );

  const f = BAREME.famille;

  const nbEnfants = Math.min(situation.nbEnfants || 0, f.nbEnfantsMax);
  const nbEtudiants = Math.min(situation.nbEnfantsEtudiants || 0, f.nbEtudiantsMax);
  const nbHandicapes = situation.nbEnfantsHandicapes || 0;

  // Détaillé poste par poste : un abattement global est impossible à
  // justifier auprès d'un salarié qui conteste son impôt.
  const detailAbattements = {
    chefDeFamille: situation.chefDeFamille ? f.chefDeFamille : 0,
    conjoint: situation.conjointACharge ? f.conjoint : 0,
    enfants: nbEnfants * f.parEnfant,
    enfantsHandicapes: nbHandicapes * f.enfantHandicape,
    enfantsEtudiants: nbEtudiants * f.enfantEtudiant,
  };

  const abattements = Object.values(detailAbattements).reduce((s, v) => s + v, 0);

  return {
    apresCnss,
    fraisPro: arrondi(fraisPro),
    abattements,
    detailAbattements,
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

// ── Primes ─────────────────────────────────────────────────────────

/**
 * Années d'ancienneté révolues entre deux dates.
 * 31 557 600 000 ms = 365,25 jours, ce qui absorbe les bissextiles.
 */
function anneesAnciennete(dateEmbauche, dateReference = new Date()) {
  if (!dateEmbauche) return 0;
  const debut = new Date(dateEmbauche).getTime();
  const fin = new Date(dateReference).getTime();
  if (!Number.isFinite(debut) || !Number.isFinite(fin) || fin < debut) return 0;
  return (fin - debut) / 31557600000;
}

/**
 * Taux d'ancienneté, par paliers.
 *
 * L'ancienneté donne un TAUX appliqué au salaire de base, pas une note
 * sur cent : c'est la pratique de paie, et le salarié peut la
 * recalculer lui-même, ce qui évite les litiges.
 */
function tauxAnciennete(annees, paliers = REGLAGES_DEFAUT.anciennete.paliers) {
  const atteints = paliers
    .filter((p) => annees >= p.ansMin)
    .sort((a, b) => a.ansMin - b.ansMin);
  return atteints.length ? atteints[atteints.length - 1].taux : 0;
}

/**
 * Note de ponctualité sur cent.
 *
 * PIÈGE À ÉVITER : ne pas utiliser le nombre total de jours d'absence.
 * Il englobe les congés validés, et un salarié en congé annuel approuvé
 * verrait sa note s'effondrer — à juste titre contestable. Seules les
 * absences INJUSTIFIÉES comptent, les mêmes que celles qui alimentent
 * la retenue sur le brut.
 *
 * La pénalité de retard est rapportée aux jours réellement ouvrables du
 * mois : un mois à dix jours travaillés ne se juge pas comme un mois
 * à vingt-deux.
 */
function notePonctualite(
  { minutesRetard = 0, joursAbsenceNonJustifiee = 0, nbJoursOuvrables = 22 },
  reglage = REGLAGES_DEFAUT.ponctualite
) {
  const toleranceProrata = Math.max(
    1,
    reglage.minutesTolerees * (nbJoursOuvrables / 22)
  );
  const retardExcedentaire = Math.max(0, minutesRetard - toleranceProrata);

  const penaliteRetard = Math.min(50, (retardExcedentaire / toleranceProrata) * 50);
  const penaliteAbsence = joursAbsenceNonJustifiee * reglage.penaliteParAbsence;

  return arrondi(Math.max(0, Math.min(100, 100 - penaliteRetard - penaliteAbsence)), 1);
}

/**
 * Prime de performance, issue de la note pondérée.
 *
 * `noteRendement` doit venir d'une évaluation humaine enregistrée. Si
 * elle vaut null, le terme est EXCLU et les poids sont renormalisés sur
 * les seuls critères disponibles. On ne lui substitue aucune valeur par
 * défaut : un chiffre inventé qui ressemble à une mesure est pire
 * qu'une absence, parce que personne ne sait qu'il est faux.
 */
function primePerformance({ notePonctualite: np, noteRendement }, salaireBase, reglage) {
  const r = { ...REGLAGES_DEFAUT.prime, ...(reglage || {}) };
  const poids = { ...REGLAGES_DEFAUT.prime.poids, ...(reglage?.poids || {}) };

  const termes = [];
  if (typeof np === 'number') termes.push([poids.ponctualite, np]);
  if (typeof noteRendement === 'number') termes.push([poids.rendement, noteRendement]);

  const sommePoids = termes.reduce((s, [p]) => s + p, 0);
  if (!termes.length || sommePoids <= 0) {
    return { note: null, montant: 0 };
  }

  const note = arrondi(termes.reduce((s, [p, v]) => s + p * v, 0) / sommePoids, 1);
  if (note < r.seuilNote) return { note, montant: 0 };

  return { note, montant: arrondi(salaireBase * r.tauxMax * (note / 100)) };
}

// ── Bons et avantages ──────────────────────────────────────────────

/**
 * Répartit les bons actifs selon leur traitement d'assiette.
 * Ceux qui sont dans l'assiette rejoignent le brut imposable ; les
 * autres s'ajoutent au net, comme un remboursement de frais.
 */
function repartirBons(reglageBons = {}) {
  const dansAssiette = {};
  const horsAssiette = {};

  for (const [nom, b] of Object.entries(reglageBons)) {
    if (!b || !b.actif) continue;
    const montant = arrondi(Math.max(0, b.montant || 0));
    if (montant <= 0) continue;
    (b.horsAssiette ? horsAssiette : dansAssiette)[nom] = montant;
  }

  const total = (o) => Object.values(o).reduce((s, v) => s + v, 0);
  return {
    dansAssiette,
    horsAssiette,
    totalDansAssiette: arrondi(total(dansAssiette)),
    totalHorsAssiette: arrondi(total(horsAssiette)),
  };
}

// ── Bulletin complet ───────────────────────────────────────────────

/**
 * @param {object} p
 * @param {number} p.salaireBrutMensuel   rémunération contractuelle fixe
 * @param {number} [p.heuresMensuelles]   horaire conventionnel (défaut 208)
 * @param {number} [p.heuresSupplementaires]
 * @param {number} [p.heuresWeekend]
 * @param {number} [p.heuresFeries]
 * @param {number} [p.primes]             primes imposables saisies à la main
 * @param {number} [p.remboursementsFrais] notes de frais validées
 * @param {number} [p.joursAbsenceNonJustifiee]
 * @param {number} [p.nbJoursOuvrables]   du mois considéré
 * @param {number} [p.minutesRetard]      comptabilisées, non déduites par défaut
 * @param {boolean} [p.deduireRetards]
 * @param {object} [p.situationFamiliale] { chefDeFamille, conjointACharge,
 *                                          nbEnfants, nbEnfantsHandicapes,
 *                                          nbEnfantsEtudiants }
 * @param {string} [p.dateEmbauche]       pour la prime d'ancienneté
 * @param {string} [p.dateReference]      fin du mois de paie (défaut : maintenant)
 * @param {number|null} [p.noteRendement] évaluation humaine, ou null si absente
 * @param {object} [p.reglages]           item ParametresPaie de l'entreprise
 */
function calculerBulletin(p) {
  const reglages = fusionnerReglages(p.reglages);

  const heuresMensuelles = p.heuresMensuelles || HEURES_MENSUELLES.r48;
  const nbJoursOuvrables = p.nbJoursOuvrables || 22;

  const salaireBase = p.salaireBrutMensuel;

  // Taux horaire déduit du salaire contractuel, et non l'inverse :
  // c'est le salaire mensuel qui fait foi.
  const tauxHoraire = salaireBase / heuresMensuelles;
  const salaireJournalier = salaireBase / nbJoursOuvrables;

  const situation = p.situationFamiliale || {};
  const bons = repartirBons(reglages.bons);

  // ── Primes calculées ──
  const annees = anneesAnciennete(p.dateEmbauche, p.dateReference);
  const primeAnciennete = reglages.anciennete.actif
    ? arrondi(salaireBase * tauxAnciennete(annees, reglages.anciennete.paliers))
    : 0;

  const np = reglages.ponctualite.actif
    ? notePonctualite(
      {
        minutesRetard: p.minutesRetard || 0,
        joursAbsenceNonJustifiee: p.joursAbsenceNonJustifiee || 0,
        nbJoursOuvrables,
      },
      reglages.ponctualite
    )
    : null;

  const nr = reglages.rendement.actif && typeof p.noteRendement === 'number'
    ? p.noteRendement
    : null;

  const perf = primePerformance(
    { notePonctualite: np, noteRendement: nr },
    salaireBase,
    reglages.prime
  );

  // Les primes familiales sont du SALAIRE : cotisées et imposées, à ne
  // pas confondre avec les abattements fiscaux de BAREME.famille.
  //
  // Trois lignes distinctes et non un total : le salarié doit pouvoir
  // voir laquelle lui est versée. Un poste « prime familiale » agrégé
  // ne se vérifie pas.
  const pf = reglages.primesFamiliales;
  const primesFamiliales = {
    primeHandicap: pf.actif && situation.handicapSalarie
      ? arrondi(pf.handicapSalarie) : 0,
    primeChefFamille: pf.actif && situation.chefDeFamille
      ? arrondi(pf.chefDeFamille) : 0,
    primeEnfants: pf.actif
      ? arrondi(Math.min(situation.nbEnfants || 0, BAREME.famille.nbEnfantsMax) * pf.parEnfant)
      : 0,
  };

  // ── Éléments variables imposables ──
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
    primeAnciennete,
    primePonctualite: 0,  // renseigné plus bas si la prime n'est pas fusionnée
    primeRendement: perf.montant,
    ...primesFamiliales,
    ...bons.dansAssiette,
  };

  // La prime de performance est unique : elle est portée par
  // primeRendement, qui agrège ponctualité et rendement selon les
  // poids. La ligne primePonctualite reste à zéro pour ne pas compter
  // deux fois la même somme ; elle existe si un jour tu sépares les deux.
  const totalGains = Object.values(gains).reduce((s, v) => s + v, 0);

  // ── Retenues sur le brut ──
  // Les congés payés et les jours fériés ne se déduisent pas : ils
  // sont rémunérés. Seule l'absence non justifiée entraîne une retenue.
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

  const totalRetenues = Object.values(retenues).reduce((s, v) => s + v, 0);

  const brut = arrondi(Math.max(0, salaireBase + totalGains - totalRetenues));

  // ── Cotisations et impôts ──
  const cnss = cotisationCnss(brut);

  // Le barème étant annuel, on annualise le brut du mois. C'est la
  // méthode de retenue à la source usuelle ; une régularisation
  // annuelle corrige l'écart si la rémunération varie fortement.
  const brutAnnualise = brut * 12;
  const cnssAnnualisee = cnss * 12;

  const assiette = revenuNetImposableAnnuel(brutAnnualise, cnssAnnualisee, situation);

  const { impot: irppAn, detail: tranches } = irppAnnuel(assiette.revenuNetImposable);
  const cssAn = contributionSolidarite(assiette.revenuNetImposable);

  const irpp = arrondi(irppAn / 12);
  const css = arrondi(cssAn / 12);

  // ── Éléments hors assiette ──
  // Un remboursement de frais professionnels n'est pas un élément de
  // rémunération : il n'entre ni dans l'assiette CNSS ni dans le
  // revenu imposable, contrairement à une prime. Il s'ajoute donc au
  // net après cotisations. Les bons marqués horsAssiette suivent la
  // même règle.
  const remboursements = arrondi(Math.max(0, p.remboursementsFrais || 0));

  const netImposable = arrondi(Math.max(0, brut - cnss - irpp - css));
  const net = arrondi(netImposable + remboursements + bons.totalHorsAssiette);

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

    // Distinction explicite : le net imposable sert aux déclarations,
    // le net à payer est ce que reçoit effectivement le salarié.
    netImposable,
    remboursements,
    bons: bons.horsAssiette,
    net,

    // Notes affichées sur le bulletin : une prime dont le salarié ne
    // voit pas le calcul se transforme en litige.
    notes: {
      anneesAnciennete: arrondi(annees, 2),
      tauxAnciennete: reglages.anciennete.actif
        ? tauxAnciennete(annees, reglages.anciennete.paliers)
        : null,
      ponctualite: np,
      rendement: nr,
      performance: perf.note,
    },

    // Détail fiscal : indispensable pour justifier le montant retenu
    fiscal: {
      brutAnnualise: arrondi(brutAnnualise),
      cnssAnnualisee: arrondi(cnssAnnualisee),
      fraisProfessionnels: assiette.fraisPro,
      abattementsFamiliaux: assiette.abattements,
      detailAbattements: assiette.detailAbattements,
      revenuNetImposable: arrondi(assiette.revenuNetImposable),
      irppAnnuel: irppAn,
      cssAnnuelle: cssAn,
      tranches,
      tauxMoyen: brut > 0 ? arrondi(((cnss + irpp + css) / brut) * 100, 2) : 0,
    },

    // Le barème AVEC LEQUEL ce bulletin a été produit.
    //
    // Deux raisons de le stocker. D'abord l'affichage : la page n'a plus
    // à écrire « CNSS 9,68 % » en dur, donc elle ne peut plus mentir le
    // jour où le taux change. Ensuite l'auditabilité : un bulletin de
    // 2026 doit rester recalculable en 2029, quand les taux auront
    // bougé. Sans cette copie, il devient indéfendable.
    bareme: {
      cnss: BAREME.cnss,
      fraisProfessionnels: BAREME.fraisProfessionnels,
      famille: BAREME.famille,
      css: BAREME.css,
      irpp: BAREME.irpp.map((t) => ({
        plafond: t.plafond === Infinity ? null : t.plafond,
        taux: t.taux,
      })),
      source: 'LF 2025, art. 36 — loi n° 48-2024',
      enVigueurDepuis: '2025-01-01',
    },
  };
}

/**
 * Vérifie que le bulletin se recalcule à partir de ses propres postes.
 *
 * À appeler avant d'enregistrer : un bulletin incohérent stocké est un
 * bulletin qu'il faudra expliquer plus tard, sans savoir où chercher.
 * La tolérance est le millime, unité de la paie tunisienne.
 */
function verifierCoherence(b, tolerance = 0.001) {
  const sommeGains = Object.values(b.gains).reduce((s, v) => s + v, 0);
  const sommeRetenues = Object.values(b.retenues).reduce((s, v) => s + v, 0);
  const sommeBons = Object.values(b.bons || {}).reduce((s, v) => s + v, 0);
  const { cnss, irpp, css, total } = b.cotisations;

  const ecarts = {
    brut: arrondi(b.salaireBase + sommeGains - sommeRetenues - b.brut),
    cotisations: arrondi(cnss + irpp + css - total),
    netImposable: arrondi(b.brut - total - b.netImposable),
    net: arrondi(b.netImposable + b.remboursements + sommeBons - b.net),
  };

  const fautifs = Object.entries(ecarts).filter(([, v]) => Math.abs(v) > tolerance);

  return {
    coherent: fautifs.length === 0,
    ecarts,
    message: fautifs.length
      ? `Bulletin incohérent : ${fautifs.map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ')}`
      : null,
  };
}

module.exports = {
  BAREME,
  MAJORATIONS,
  HEURES_MENSUELLES,
  REGLAGES_DEFAUT,
  fusionnerReglages,
  cotisationCnss,
  revenuNetImposableAnnuel,
  irppAnnuel,
  contributionSolidarite,
  anneesAnciennete,
  tauxAnciennete,
  notePonctualite,
  primePerformance,
  repartirBons,
  calculerBulletin,
  verifierCoherence,
  arrondi,
};