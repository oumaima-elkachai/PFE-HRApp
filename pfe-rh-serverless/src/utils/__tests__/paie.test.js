// src/utils/__tests__/paie.test.js
//
// Tests du moteur de paie.
//
// Le moteur est écrit en fonctions pures : aucune base, aucun réseau,
// aucune horloge. Chaque règle légale est donc vérifiable isolément et
// le résultat est reproductible à l'identique.
//
// Ces tests servent aussi de documentation exécutable du barème : si la
// loi de finances change, un test échoue et désigne la règle concernée.

const {
  BAREME,
  HEURES_MENSUELLES,
  cotisationCnss,
  revenuNetImposableAnnuel,
  irppAnnuel,
  contributionSolidarite,
  calculerBulletin,
} = require("../paie");

// ── CNSS ───────────────────────────────────────────────────────────

describe("Cotisation CNSS salariale", () => {
  test("applique 9,68 % sur un salaire ordinaire", () => {
    expect(cotisationCnss(2000)).toBeCloseTo(193.6, 3);
  });

  test("plafonne la base à 5 000 dinars", () => {
    // Au-delà du plafond, la cotisation n'augmente plus
    const auPlafond = cotisationCnss(5000);
    const auDessus = cotisationCnss(8000);
    expect(auPlafond).toBeCloseTo(484, 3);
    expect(auDessus).toBe(auPlafond);
  });

  test("renvoie zéro pour un brut nul", () => {
    expect(cotisationCnss(0)).toBe(0);
  });
});

// ── Assiette imposable ─────────────────────────────────────────────

describe("Revenu net imposable annuel", () => {
  test("déduit 10 % de frais professionnels", () => {
    const r = revenuNetImposableAnnuel(20000, 1936);
    // 10 % de (20000 - 1936) = 1806,4, sous le plafond
    expect(r.fraisPro).toBeCloseTo(1806.4, 2);
  });

  test("plafonne les frais professionnels à 2 000 dinars", () => {
    // 10 % de 50 000 vaudrait 5 000 : le plafond s'applique
    const r = revenuNetImposableAnnuel(60000, 5808);
    expect(r.fraisPro).toBe(BAREME.fraisProfessionnels.plafondAnnuel);
  });

  test("applique les abattements pour charges de famille", () => {
    const celibataire = revenuNetImposableAnnuel(30000, 2904, {});
    const chefDeFamille = revenuNetImposableAnnuel(30000, 2904, {
      chefDeFamille: true,
      nbEnfants: 2,
    });

    // 300 pour le chef de famille, 100 par enfant
    const ecart = celibataire.revenuNetImposable - chefDeFamille.revenuNetImposable;
    expect(ecart).toBe(500);
  });

  test("limite les abattements à quatre enfants", () => {
    const quatre = revenuNetImposableAnnuel(30000, 2904, { nbEnfants: 4 });
    const six = revenuNetImposableAnnuel(30000, 2904, { nbEnfants: 6 });
    expect(six.revenuNetImposable).toBe(quatre.revenuNetImposable);
  });

  test("ne descend jamais sous zéro", () => {
    const r = revenuNetImposableAnnuel(200, 20, { chefDeFamille: true, nbEnfants: 4 });
    expect(r.revenuNetImposable).toBeGreaterThanOrEqual(0);
  });
});

// ── Barème progressif ──────────────────────────────────────────────

describe("IRPP, barème progressif", () => {
  test("exonère la première tranche", () => {
    expect(irppAnnuel(5000).impot).toBe(0);
    expect(irppAnnuel(4999).impot).toBe(0);
  });

  test("n'impose que la fraction dépassant le seuil", () => {
    // 6 000 : les 5 000 premiers à 0 %, les 1 000 suivants à 15 %
    expect(irppAnnuel(6000).impot).toBeCloseTo(150, 3);
  });

  test("cumule les tranches successives", () => {
    // 19 676,80 =
    //     5 000 à  0 %  →      0
    //     5 000 à 15 %  →    750
    //   9 676,80 à 25 % → 2 419,20
    expect(irppAnnuel(19676.8).impot).toBeCloseTo(3169.2, 2);
  });

  test("atteint la tranche supérieure au-delà de 70 000", () => {
    const detail = irppAnnuel(80000).detail;
    const derniere = detail[detail.length - 1];
    expect(derniere.taux).toBe(0.4);
    // Seuls 10 000 dinars relèvent de cette tranche, pas la totalité
    expect(derniere.base).toBeCloseTo(10000, 2);
  });

  test("reste progressif : le taux moyen croît avec le revenu", () => {
    const tauxMoyen = (r) => irppAnnuel(r).impot / r;
    expect(tauxMoyen(15000)).toBeLessThan(tauxMoyen(40000));
    expect(tauxMoyen(40000)).toBeLessThan(tauxMoyen(90000));
  });
});

// ── Contribution sociale de solidarité ─────────────────────────────

describe("Contribution sociale de solidarité", () => {
  test("exonère les revenus de la tranche à 0 %", () => {
    expect(contributionSolidarite(5000)).toBe(0);
    expect(contributionSolidarite(3000)).toBe(0);
  });

  test("applique 1 % au-delà du seuil", () => {
    expect(contributionSolidarite(20000)).toBeCloseTo(200, 3);
  });
});

// ── Bulletin complet ───────────────────────────────────────────────

describe("Calcul d'un bulletin", () => {
  const base = {
    salaireBrutMensuel: 2000,
    heuresMensuelles: HEURES_MENSUELLES.r48,
    nbJoursOuvrables: 22,
  };

  test("produit un net cohérent pour un mois ordinaire", () => {
    const b = calculerBulletin(base);

    expect(b.brut).toBeCloseTo(2000, 3);
    expect(b.cotisations.cnss).toBeCloseTo(193.6, 3);
    expect(b.cotisations.irpp).toBeCloseTo(264.1, 2);
    expect(b.net).toBeLessThan(b.brut);
    expect(b.net).toBeCloseTo(1525.903, 2);
  });

  test("le salaire de base ne dépend pas du nombre de jours ouvrables", () => {
    // Défaut corrigé : l'ancienne formule multipliait le taux horaire par
    // les jours du mois, ce qui faisait varier la rémunération de base
    // de plus de 10 % entre janvier et mai.
    const janvier = calculerBulletin({ ...base, nbJoursOuvrables: 23 });
    const mai = calculerBulletin({ ...base, nbJoursOuvrables: 20 });
    expect(janvier.salaireBase).toBe(mai.salaireBase);
  });

  test("déduit le taux horaire du salaire mensuel", () => {
    const b = calculerBulletin(base);
    expect(b.tauxHoraire).toBeCloseTo(2000 / 208, 3);
  });

  test("majore les heures supplémentaires de 75 %", () => {
    const sans = calculerBulletin(base);
    const avec = calculerBulletin({ ...base, heuresSupplementaires: 10 });

    const attendu = 10 * (2000 / 208) * 1.75;
    expect(avec.gains.heuresSupplementaires).toBeCloseTo(attendu, 2);
    expect(avec.brut).toBeGreaterThan(sans.brut);
  });

  test("majore le weekend et les jours fériés de 100 %", () => {
    const b = calculerBulletin({ ...base, heuresWeekend: 8, heuresFeries: 8 });
    const attendu = 8 * (2000 / 208) * 2;
    expect(b.gains.heuresWeekend).toBeCloseTo(attendu, 2);
    expect(b.gains.heuresFeries).toBeCloseTo(attendu, 2);
  });

  test("retient les absences non justifiées", () => {
    const b = calculerBulletin({ ...base, joursAbsenceNonJustifiee: 3 });
    const journalier = 2000 / 22;
    expect(b.retenues.absences).toBeCloseTo(3 * journalier, 2);
    expect(b.brut).toBeLessThan(2000);
  });

  test("comptabilise les retards sans les retenir par défaut", () => {
    // Une retenue pour retard n'est pas automatique en droit tunisien :
    // elle relève du règlement intérieur, donc d'un choix explicite.
    const b = calculerBulletin({ ...base, minutesRetard: 120 });
    expect(b.retenues.retards).toBe(0);
    expect(b.brut).toBeCloseTo(2000, 3);
  });

  test("retient les retards lorsque la retenue est activée", () => {
    const b = calculerBulletin({ ...base, minutesRetard: 120, deduireRetards: true });
    expect(b.retenues.retards).toBeCloseTo(2 * (2000 / 208), 2);
  });

  test("un chef de famille paie moins d'impôt à salaire égal", () => {
    const celibataire = calculerBulletin(base);
    const charge = calculerBulletin({
      ...base,
      situationFamiliale: { chefDeFamille: true, nbEnfants: 3 },
    });

    expect(charge.cotisations.irpp).toBeLessThan(celibataire.cotisations.irpp);
    expect(charge.net).toBeGreaterThan(celibataire.net);
  });

  test("le net reste positif même en cas d'absences massives", () => {
    const b = calculerBulletin({ ...base, joursAbsenceNonJustifiee: 40 });
    expect(b.net).toBeGreaterThanOrEqual(0);
    expect(b.brut).toBeGreaterThanOrEqual(0);
  });

  test("expose le détail fiscal justifiant la retenue", () => {
    const b = calculerBulletin(base);

    expect(b.fiscal.brutAnnualise).toBeCloseTo(24000, 2);
    expect(b.fiscal.revenuNetImposable).toBeGreaterThan(0);
    expect(b.fiscal.tranches.length).toBeGreaterThan(0);
    expect(b.fiscal.tauxMoyen).toBeGreaterThan(0);
    expect(b.fiscal.tauxMoyen).toBeLessThan(50);
  });

  test("un haut salaire subit un taux de prélèvement plus élevé", () => {
    const modeste = calculerBulletin({ ...base, salaireBrutMensuel: 1200 });
    const eleve = calculerBulletin({ ...base, salaireBrutMensuel: 6000 });
    expect(eleve.fiscal.tauxMoyen).toBeGreaterThan(modeste.fiscal.tauxMoyen);
  });

  test("le plafond CNSS s'applique aux hauts salaires", () => {
    const b = calculerBulletin({ ...base, salaireBrutMensuel: 9000 });
    expect(b.cotisations.cnss).toBeCloseTo(484, 3);
  });

  test("les primes entrent dans l'assiette imposable", () => {
    const sans = calculerBulletin(base);
    const avec = calculerBulletin({ ...base, primes: 500 });

    expect(avec.brut).toBeCloseTo(2500, 3);
    expect(avec.cotisations.cnss).toBeGreaterThan(sans.cotisations.cnss);
    expect(avec.cotisations.irpp).toBeGreaterThan(sans.cotisations.irpp);
  });
});

// ── Cohérence d'ensemble ───────────────────────────────────────────

describe("Invariants", () => {
  const salaires = [800, 1200, 2000, 3500, 5000, 8000, 15000];

  test.each(salaires)("net inférieur au brut pour %i dinars", (salaire) => {
    const b = calculerBulletin({ salaireBrutMensuel: salaire, nbJoursOuvrables: 22 });
    expect(b.net).toBeLessThanOrEqual(b.brut);
    expect(b.net).toBeGreaterThan(0);
  });

  test.each(salaires)("brut = net + cotisations pour %i dinars", (salaire) => {
    const b = calculerBulletin({ salaireBrutMensuel: salaire, nbJoursOuvrables: 22 });
    expect(b.net + b.cotisations.total).toBeCloseTo(b.brut, 2);
  });

  test("le taux de prélèvement reste dans une plage plausible", () => {
    for (const salaire of salaires) {
      const b = calculerBulletin({ salaireBrutMensuel: salaire, nbJoursOuvrables: 22 });
      expect(b.fiscal.tauxMoyen).toBeGreaterThanOrEqual(0);
      expect(b.fiscal.tauxMoyen).toBeLessThan(45);
    }
  });
});