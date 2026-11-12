// src/factures/bulletin-pdf.js
//
// Génération du bulletin de paie en PDF.
//
// Principe directeur : chaque ligne doit être RECALCULABLE par le
// salarié. D'où les colonnes Base et Taux à côté de chaque montant —
// un bulletin qui n'affiche que des résultats ne se vérifie pas, et
// c'est ce qui crée les litiges.
//
// pdfkit plutôt qu'un rendu HTML : pas de Chromium à embarquer dans la
// fonction Lambda, démarrage à froid court, et aucune dépendance
// binaire. La contrepartie est qu'il faut poser les coordonnées à la
// main, d'où les constantes de mise en page ci-dessous.

const PDFDocument = require("pdfkit");

// ── Palette ────────────────────────────────────────────────────────
// ⚠ UN SEUL ENDROIT À CHANGER : remplace ces valeurs par celles de ta
// palette (les variables --color-brand-* de theme.css).
const C = {
  marque: "#2F4858",        // bandeau et titres
  marqueClair: "#F2F5F7",   // fonds de section
  accent: "#1B998B",        // net à payer
  encre: "#1A1D24",         // texte principal
  encreDouce: "#6B7280",    // libellés
  trait: "#DDE3E8",         // filets
  gain: "#166534",
  retenue: "#B42318",
};

// ── Mise en page, en points PostScript (72 pt = 1 pouce) ───────────
const PAGE = { l: 595.28, h: 841.89 };
const M = 40;                       // marge
const L = PAGE.l - 2 * M;           // largeur utile : 515,28

// Colonnes du tableau principal
const COL = {
  designation: { x: M,       w: 205, align: "left" },
  base:        { x: M + 205, w: 78,  align: "right" },
  taux:        { x: M + 283, w: 58,  align: "right" },
  gain:        { x: M + 341, w: 86,  align: "right" },
  retenue:     { x: M + 427, w: 88,  align: "right" },
};

const MOIS_FR = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

// ── Formatage ──────────────────────────────────────────────────────

/**
 * Remplace les caractères que les polices intégrées ne savent pas coder.
 *
 * Sans cela, « 2 400,000 » s'imprimait « 2 /400,000 » : le séparateur de
 * milliers français est une ESPACE FINE INSÉCABLE (U+202F), absente de
 * l'encodage WinAnsi d'Helvetica, et pdfkit la remplace par un glyphe
 * arbitraire. Même chose pour le vrai signe moins (U+2212), qui sortait
 * en guillemet. Le défaut ne se voit sur aucun test automatique : il
 * faut ouvrir le PDF et regarder.
 */
const ascii = (s) =>
  String(s)
    .replace(/[   ]/g, " ")  // espaces fines et insécables
    .replace(/[−–]/g, "-")        // signe moins, demi-cadratin
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');

const nb = (v, d = 3) =>
  ascii((Number(v) || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  }));

const dinars = (v) => nb(v, 3);
const pourcent = (v) =>
  ascii(`${(Number(v) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`);

const dateFr = (iso) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR");
};

const somme = (o) => Object.values(o || {}).reduce((s, v) => s + (Number(v) || 0), 0);

// ── Primitives de dessin ───────────────────────────────────────────

function cartouche(doc, x, y, w, h, fond, rayon = 4) {
  doc.save().roundedRect(x, y, w, h, rayon).fill(fond).restore();
}

function titreSection(doc, texte, y) {
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.encreDouce)
    .text(texte.toUpperCase(), M, y, { characterSpacing: 1.1, width: L });
  const yTrait = y + 12;
  doc.save().moveTo(M, yTrait).lineTo(M + L, yTrait)
    .lineWidth(0.6).strokeColor(C.trait).stroke().restore();
  return yTrait + 6;
}

/** Paire libellé / valeur, empilée verticalement */
function champ(doc, libelle, valeur, x, y, w) {
  doc.font("Helvetica").fontSize(6.5).fillColor(C.encreDouce)
    .text(libelle.toUpperCase(), x, y, { width: w, characterSpacing: 0.6 });
  doc.font("Helvetica-Bold").fontSize(9).fillColor(C.encre)
    .text(valeur || "—", x, y + 9, { width: w, lineBreak: false, ellipsis: true });
  return y + 22;
}

/**
 * Une ligne du tableau principal.
 * `genre` décide du style : 'normal', 'sousTotal', 'total'.
 */
function ligne(doc, y, cells, genre = "normal") {
  const hauteur = genre === "normal" ? 14 : 18;

  if (genre === "sousTotal") {
    doc.save().rect(M, y - 2, L, hauteur).fill(C.marqueClair).restore();
  }

  const gras = genre !== "normal";
  const taille = genre === "total" ? 9.5 : genre === "sousTotal" ? 8.5 : 8;
  const yTexte = y + (hauteur - taille) / 2 - 1.5;

  for (const [nom, valeur] of Object.entries(cells)) {
    if (valeur === undefined || valeur === null || valeur === "") continue;
    const c = COL[nom];
    if (!c) continue;

    const couleur = nom === "gain" ? (gras ? C.encre : C.gain)
      : nom === "retenue" ? C.retenue
        : nom === "designation" ? C.encre : C.encreDouce;

    doc.font(gras ? "Helvetica-Bold" : "Helvetica").fontSize(taille)
      .fillColor(couleur)
      .text(String(valeur), c.x, yTexte, {
        width: c.w, align: c.align, lineBreak: false, ellipsis: true,
      });
  }

  if (genre === "normal") {
    doc.save().moveTo(M, y + hauteur - 2).lineTo(M + L, y + hauteur - 2)
      .lineWidth(0.3).strokeColor(C.trait).stroke().restore();
  }

  return y + hauteur;
}

// ── Libellés des postes ────────────────────────────────────────────

const LIB_GAIN = {
  heuresSupplementaires: "Heures supplémentaires",
  heuresWeekend: "Heures de repos hebdomadaire",
  heuresFeries: "Heures de jour férié",
  primes: "Primes diverses",
  primeAnciennete: "Prime d'ancienneté",
  primePonctualite: "Prime de ponctualité",
  primeRendement: "Prime de performance",
  primeHandicap: "Prime handicap",
  primeChefFamille: "Prime chef de famille",
  primeEnfants: "Prime enfants à charge",
  carburant: "Bon carburant",
  alimentaire: "Bon alimentaire",
  transport: "Bon de transport",
};

const LIB_RETENUE = {
  absences: "Absences non justifiées",
  retards: "Retenue pour retard",
  avances: "Avance sur salaire",
};

const LIB_BON = {
  carburant: "Bon carburant",
  alimentaire: "Bon alimentaire",
  transport: "Bon de transport",
};

/**
 * Base et taux d'un poste de gain, quand ils ont un sens.
 *
 * C'est ce qui rend la ligne vérifiable : « 12 h × 7,212 = 86,538 » se
 * recalcule, « 86,538 » ne se recalcule pas.
 */
function baseEtTaux(cle, b) {
  const th = b.tauxHoraire;
  const maj = b.majorations || { heuresSupplementaires: 0.75, weekend: 1, jourFerie: 1 };

  switch (cle) {
    case "heuresSupplementaires":
      return b.heuresSupplementaires
        ? { base: `${nb(b.heuresSupplementaires, 2)} h`, taux: nb(th * (1 + maj.heuresSupplementaires), 3) }
        : {};
    case "heuresWeekend":
      return b.heuresWeekend
        ? { base: `${nb(b.heuresWeekend, 2)} h`, taux: nb(th * (1 + maj.weekend), 3) }
        : {};
    case "heuresFeries":
      return b.heuresFeries
        ? { base: `${nb(b.heuresFeries, 2)} h`, taux: nb(th * (1 + maj.jourFerie), 3) }
        : {};
    case "primeAnciennete":
      return b.notes?.tauxAnciennete
        ? { base: dinars(b.salaireBase), taux: pourcent(b.notes.tauxAnciennete) }
        : {};
    case "primeRendement":
      // Le taux réel, et non la note : la colonne s'appelle « Taux », et
      // 2 400 × 6,19 % = 148,560 se recalcule, « 61,9/100 » non. Les
      // notes qui ont produit ce taux figurent dans l'encadré du bas.
      return b.salaireBase
        ? { base: dinars(b.salaireBase), taux: pourcent(b.gains.primeRendement / b.salaireBase) }
        : {};
    default:
      return {};
  }
}

function baseEtTauxRetenue(cle, b) {
  if (cle === "absences" && b.joursAbsenceNonJustifiee) {
    return {
      base: `${b.joursAbsenceNonJustifiee} j`,
      taux: dinars(b.salaireJournalier),
    };
  }
  if (cle === "retards" && b.minutesRetard) {
    return { base: `${b.minutesRetard} min`, taux: dinars(b.tauxHoraire) };
  }
  return {};
}

// ── Document ───────────────────────────────────────────────────────

/**
 * @param {object} p
 * @param {object} p.bulletin    sortie de calculerBulletin, fusionnée avec
 *                               les champs stockés (mois, annee, numero…)
 * @param {object} p.employe     { nom, prenom, matricule, cin, poste,
 *                                 departement, dateEmbauche, typeContrat,
 *                                 rib, cnss }
 * @param {object} p.entreprise  { nom, adresse, matriculeFiscal, cnss }
 * @param {object} [p.cumuls]    { brut, net, cotisations, mois } facultatif
 * @returns {Promise<Buffer>}
 */
function genererBulletinPdf({ bulletin, employe = {}, entreprise = {}, cumuls }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      // Les pages sont gardées en mémoire pour pouvoir y revenir et
      // inscrire « page 1 / 2 » une fois le total connu.
      bufferPages: true,
      margins: { top: M, bottom: M, left: M, right: M },
      info: {
        Title: `Bulletin de paie ${bulletin.numero || ""}`,
        Author: entreprise.nom || "",
        // Pas de nom de salarié dans les métadonnées : elles voyagent
        // avec le fichier et restent lisibles par qui le reçoit.
        Subject: "Bulletin de paie",
      },
    });

    // Tout texte passe par `ascii`, y compris celui qui vient de la base.
    // Un nom d'entreprise contenant une apostrophe typographique, ou un
    // intitulé de poste collé depuis un traitement de texte, produirait
    // sinon le même glyphe parasite que le séparateur de milliers.
    const texteBrut = doc.text.bind(doc);
    doc.text = (s, ...reste) => texteBrut(ascii(s ?? ""), ...reste);

    // pdfkit ouvre une page dès qu'un texte dépasse la marge basse. Or
    // cette mise en page pose les ordonnées à la main : chaque appel
    // situé trop bas ajoutait alors sa propre page, et un bulletin
    // chargé en produisait neuf. Marge basse à zéro, et c'est `garde()`
    // qui décide seul des sauts de page.
    const sansMargeBasse = () => { doc.page.margins.bottom = 0; };
    sansMargeBasse();
    doc.on("pageAdded", sansMargeBasse);

    const morceaux = [];
    doc.on("data", (d) => morceaux.push(d));
    doc.on("end", () => resolve(Buffer.concat(morceaux)));
    doc.on("error", reject);

    try {
      dessiner(doc, { bulletin, employe, entreprise, cumuls });
      finaliserPages(doc, bulletin);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function dessiner(doc, { bulletin: b, employe: e, entreprise: ent, cumuls }) {
  const periode = b.moisLabel || `${MOIS_FR[b.mois] || ""} ${b.annee || ""}`.trim();

  // ── Bandeau ──
  doc.save().rect(0, 0, PAGE.l, 92).fill(C.marque).restore();

  doc.font("Helvetica-Bold").fontSize(14).fillColor("#FFFFFF")
    .text(ent.nom || "—", M, 24, { width: L * 0.55, lineBreak: false, ellipsis: true });
  doc.font("Helvetica").fontSize(7).fillColor("#FFFFFFB0")
    .text(ent.adresse || "", M, 42, { width: L * 0.55, lineBreak: false, ellipsis: true });
  if (ent.matriculeFiscal || ent.cnss) {
    doc.fontSize(6.5).fillColor("#FFFFFF90").text(
      [ent.matriculeFiscal && `MF ${ent.matriculeFiscal}`,
        ent.cnss && `CNSS ${ent.cnss}`].filter(Boolean).join("   ·   "),
      M, 53, { width: L * 0.55, lineBreak: false }
    );
  }

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF")
    .text("BULLETIN DE PAIE", M + L * 0.55, 26,
      { width: L * 0.45, align: "right", characterSpacing: 1.4 });
  doc.font("Helvetica").fontSize(16).fillColor("#FFFFFF")
    .text(periode, M + L * 0.55, 40, { width: L * 0.45, align: "right" });
  doc.fontSize(7).fillColor("#FFFFFFB0")
    .text(b.numero || "", M + L * 0.55, 62, { width: L * 0.45, align: "right" });

  // ── Identité ──
  let y = 108;
  const demi = (L - 14) / 2;
  const hIdentite = 94;

  cartouche(doc, M, y, demi, hIdentite, C.marqueClair);
  cartouche(doc, M + demi + 14, y, demi, hIdentite, C.marqueClair);

  const panneau = (x, titre, rangs) => {
    doc.font("Helvetica-Bold").fontSize(7).fillColor(C.marque)
      .text(titre, x, y + 10, { characterSpacing: 1 });
    let yy = y + 25;
    for (const rang of rangs) {
      if (rang.length === 1) {
        champ(doc, rang[0][0], rang[0][1], x, yy, demi - 24);
      } else {
        const largeur = (demi - 24) / 2 - 6;
        champ(doc, rang[0][0], rang[0][1], x, yy, largeur);
        champ(doc, rang[1][0], rang[1][1], x + largeur + 12, yy, largeur);
      }
      yy += 22;
    }
  };

  panneau(M + 12, "SALARIÉ", [
    [["Nom et prénom", `${e.nom || ""} ${e.prenom || ""}`.trim()]],
    [["Matricule", e.matricule], ["CIN", e.cin]],
    [["N° CNSS", e.cnss], ["Contrat", e.typeContrat]],
  ]);

  panneau(M + demi + 26, "EMPLOI", [
    [["Poste", e.poste]],
    [["Département", e.departement]],
    [["Embauche", e.dateEmbauche ? dateFr(e.dateEmbauche) : null],
      ["Ancienneté", b.notes?.anneesAnciennete
        ? `${nb(b.notes.anneesAnciennete, 1)} ans` : null]],
  ]);

  y += hIdentite + 14;

  // ── Tableau principal ──
  y = titreSection(doc, "Détail de la rémunération", y);

  // En-têtes
  doc.font("Helvetica-Bold").fontSize(6.5).fillColor(C.encreDouce);
  for (const [nom, libelle] of Object.entries({
    designation: "DÉSIGNATION", base: "BASE", taux: "TAUX",
    gain: "GAIN", retenue: "RETENUE",
  })) {
    const c = COL[nom];
    doc.text(libelle, c.x, y, { width: c.w, align: c.align, characterSpacing: 0.6 });
  }
  y += 11;
  doc.save().moveTo(M, y).lineTo(M + L, y).lineWidth(0.6).strokeColor(C.trait).stroke().restore();
  y += 5;

  // Salaire de base : les heures contractuelles rendent le taux horaire
  // lisible, et donc toutes les lignes d'heures vérifiables.
  y = ligne(doc, y, {
    designation: "Salaire de base",
    base: b.heuresMensuelles ? `${nb(b.heuresMensuelles, 2)} h` : "",
    taux: b.tauxHoraire ? nb(b.tauxHoraire, 3) : "",
    gain: dinars(b.salaireBase),
  });

  for (const [cle, montant] of Object.entries(b.gains || {})) {
    if (!(Number(montant) > 0)) continue;
    y = ligne(doc, garde(doc, y), {
      designation: LIB_GAIN[cle] || cle,
      ...baseEtTaux(cle, b),
      gain: dinars(montant),
    });
  }

  for (const [cle, montant] of Object.entries(b.retenues || {})) {
    if (!(Number(montant) > 0)) continue;
    y = ligne(doc, garde(doc, y), {
      designation: LIB_RETENUE[cle] || cle,
      ...baseEtTauxRetenue(cle, b),
      retenue: dinars(montant),
    });
  }

  y = ligne(doc, y, {
    designation: "Salaire brut",
    gain: dinars(b.brut),
  }, "sousTotal");
  y += 4;

  // ── Cotisations ──
  const bar = b.bareme || {};
  const rniMensuel = (b.fiscal?.revenuNetImposable || 0) / 12;
  const c = b.cotisations || {};

  y = ligne(doc, y, {
    designation: "CNSS — part salariale",
    base: dinars(Math.min(b.brut, bar.cnss?.plafondMensuel ?? Infinity)),
    taux: bar.cnss?.taux ? pourcent(bar.cnss.taux) : "",
    retenue: dinars(c.cnss),
  });

  if (Number(c.css) > 0) {
    y = ligne(doc, y, {
      designation: "Contribution sociale de solidarité",
      base: dinars(rniMensuel),
      taux: bar.css?.taux ? pourcent(bar.css.taux) : "",
      retenue: dinars(c.css),
    });
  }

  y = ligne(doc, y, {
    designation: "IRPP — retenue à la source",
    base: dinars(rniMensuel),
    taux: b.fiscal?.tauxMoyen ? "barème" : "",
    retenue: dinars(c.irpp),
  });

  y = ligne(doc, y, {
    designation: "Net imposable",
    gain: dinars(b.netImposable),
  }, "sousTotal");
  y += 4;

  // ── Hors assiette ──
  const horsAssiette = (Number(b.remboursements) || 0) + somme(b.bons);
  if (horsAssiette > 0) {
    if (Number(b.remboursements) > 0) {
      // Le détail des notes quand il est fourni : un remboursement
      // global ne se rapproche d'aucune dépense, et c'est la première
      // chose qu'un salarié vient vérifier.
      const notes = (b.notesFrais || []).filter((f) => (f.montantAccorde ?? f.montant) > 0);

      if (notes.length > 0 && notes.length <= 8) {
        for (const note of notes) {
          const montant = note.montantAccorde ?? note.montant;
          const quand = note.dateDepense ? ` du ${dateFr(note.dateDepense)}` : "";
          y = ligne(doc, garde(doc, y), {
            designation: `${note.categorieLibelle || "Frais"}${quand}`,
            gain: dinars(montant),
          });
        }
      } else {
        y = ligne(doc, y, {
          designation: notes.length > 8
            ? `Remboursement de frais — ${notes.length} notes`
            : "Remboursement de frais professionnels",
          gain: dinars(b.remboursements),
        });
      }
    }
    for (const [cle, montant] of Object.entries(b.bons || {})) {
      if (!(Number(montant) > 0)) continue;
      y = ligne(doc, y, { designation: LIB_BON[cle] || cle, gain: dinars(montant) });
    }
    doc.font("Helvetica-Oblique").fontSize(6.5).fillColor(C.encreDouce)
      .text("Montants hors assiette : ni cotisés, ni imposés.", M, y + 1, { width: L });
    y += 13;
  }

  // ── Net à payer ──
  y = garde(doc, y + 4, 46);
  cartouche(doc, M, y, L, 40, C.accent, 6);
  doc.font("Helvetica").fontSize(7.5).fillColor("#FFFFFFC0")
    .text("NET À PAYER", M + 16, y + 9, { characterSpacing: 1.2 });
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#FFFFFF")
    .text(`${dinars(b.net)} TND`, M + 16, y + 18, { width: L - 32, lineBreak: false });
  if (e.rib) {
    doc.font("Helvetica").fontSize(7).fillColor("#FFFFFFC0")
      .text(`Virement — RIB ${e.rib}`, M + 16, y + 20,
        { width: L - 32, align: "right" });
  }
  y += 50;

  // ── Deux encadrés : temps de travail et détail fiscal ──
  const yBoites = y;
  const temps = [
    ["Jours ouvrables du mois", b.nbJoursOuvrables ?? "—"],
    ["Jours travaillés", b.joursPresents ?? "—"],
    ["Absences non justifiées", b.joursAbsenceNonJustifiee ?? b.joursAbsents ?? 0],
  ];

  // Les congés ne sont montrés que s'il y en a : une ligne « 0 j » dans
  // un mois sans congé n'apprend rien et pousse l'encadré vers le bas.
  // Les distinguer importe : le congé payé est rémunéré, le sans solde
  // se retient comme une absence.
  if (b.congesPayes > 0) temps.push(["Congés payés", `${b.congesPayes} j`]);
  if (b.congesNonPayes > 0) temps.push(["Congés sans solde", `${b.congesNonPayes} j`]);

  // Les heures supplémentaires, de weekend et de jour férié ne sont PAS
  // reprises ici : elles figurent déjà dans le tableau, avec leur base
  // horaire et leur taux majoré. Les répéter allongeait l'encadré de
  // trois lignes et le faisait basculer sur une page suivante, pour une
  // information déjà lisible dix centimètres plus haut.
  temps.push(["Retard cumulé", `${b.minutesRetard || 0} min`]);

  // Les notes qui ont produit la prime. Une prime dont le salarié ne
  // voit pas le calcul se transforme en litige ; et une note absente
  // n'est pas affichée à zéro, ce qui se lirait comme une mauvaise
  // évaluation au lieu d'une évaluation manquante.
  const n = b.notes || {};
  if (typeof n.ponctualite === "number") temps.push(["Note de ponctualité", `${nb(n.ponctualite, 1)} / 100`]);
  if (typeof n.rendement === "number") temps.push(["Note de rendement", `${nb(n.rendement, 1)} / 100`]);

  const f = b.fiscal || {};
  // « - 0,000 » se lit comme une soustraction qui n'a pas eu lieu, ce
  // qui fait douter du reste. Un tiret dit la même chose sans bruit.
  const retranche = (v) => (Number(v) > 0 ? `- ${dinars(v)}` : "—");
  const fisc = [
    ["Brut annualisé", dinars(f.brutAnnualise)],
    ["CNSS annuelle", retranche(f.cnssAnnualisee)],
    ["Frais professionnels", retranche(f.fraisProfessionnels)],
    ["Abattements familiaux", retranche(f.abattementsFamiliaux)],
    ["Revenu net imposable", dinars(f.revenuNetImposable)],
  ];

  // Hauteur commune, calculée sur la liste la plus longue : les deux
  // encadrés doivent s'aligner, et le nombre de lignes varie selon les
  // primes actives.
  const hBoite = 22 + Math.max(temps.length, fisc.length) * 13 + 6;

  // Les deux encadrés ne se coupent pas en deux : ils passent entiers
  // sur la page suivante si la place manque.
  const yReel = garde(doc, yBoites, hBoite + 6);
  if (yReel !== yBoites) y = yReel;
  const yB = yReel;

  cartouche(doc, M, yB, demi, hBoite, C.marqueClair);
  cartouche(doc, M + demi + 14, yB, demi, hBoite, C.marqueClair);

  let yt = titrePetit(doc, "Temps de travail", M + 12, yB + 10);
  for (const [l, v] of temps) yt = paire(doc, l, v, M + 12, yt, demi - 24);

  let yf = titrePetit(doc, "Base imposable annuelle", M + demi + 26, yB + 10);
  for (const [l, v] of fisc) {
    yf = paire(doc, l, v, M + demi + 26, yf, demi - 24, l === "Revenu net imposable");
  }

  y = yB + hBoite + 14;

  // ── Cumuls annuels ──
  // Les cumuls tiennent sur une seule ligne. En bloc de quatre colonnes
  // avec son titre, ils faisaient 50 pt et basculaient seuls sur une
  // page suivante dès que le bulletin était un peu chargé — une page
  // entière pour quatre nombres de référence.
  if (cumuls) {
    y = garde(doc, y, 20);
    const parts = [
      `Brut ${dinars(cumuls.brut)}`,
      `Cotisations et impôt ${dinars(cumuls.cotisations)}`,
      `Net perçu ${dinars(cumuls.net)}`,
      cumuls.mois ? `${cumuls.mois} bulletins` : null,
    ].filter(Boolean);

    doc.font("Helvetica-Bold").fontSize(7).fillColor(C.encreDouce)
      .text(`CUMULS ${b.annee || ""}`.trim(), M, y, { width: 80, characterSpacing: 0.8 });
    doc.font("Helvetica").fontSize(7.5).fillColor(C.encre)
      .text(parts.join("   ·   "), M + 84, y - 1, { width: L - 84, lineBreak: false });
    y += 18;
  }

  // ── Annexe : le détail des pointages ──
  // Dessinée après le pied de page pour que la mention légale reste sur
  // la page du bulletin lui-même.
  if (Array.isArray(b.lignes) && b.lignes.length > 0) {
    pagePointages(doc, b, periode);
  }
}

/**
 * Journal des pointages du mois, en annexe.
 *
 * C'est la pièce qui justifie les absences, les retards et les heures
 * supplémentaires portées au recto. Sans elle, un salarié qui conteste
 * une retenue n'a rien à opposer, et la RH non plus.
 */
function pagePointages(doc, b, periode) {
  doc.addPage();

  doc.save().rect(0, 0, PAGE.l, 56).fill(C.marque).restore();
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#FFFFFF")
    .text("DÉTAIL DES POINTAGES", M, 21, { characterSpacing: 1.2, width: L * 0.6 });
  doc.font("Helvetica").fontSize(9).fillColor("#FFFFFFB0")
    .text(periode, M + L * 0.6, 22, { width: L * 0.4, align: "right" });

  const col = [
    { t: "DATE", x: M, w: 92, a: "left" },
    { t: "ARRIVÉE", x: M + 92, w: 66, a: "right" },
    { t: "DÉPART", x: M + 158, w: 66, a: "right" },
    { t: "DURÉE", x: M + 224, w: 66, a: "right" },
    { t: "TYPE", x: M + 300, w: 96, a: "left" },
    { t: "RETARD", x: M + 396, w: 119, a: "right" },
  ];

  const COULEUR_TYPE = {
    "Férié": "#B42318",
    "Weekend": "#6941C6",
    "Retard": "#B54708",
    "Normal": C.encreDouce,
  };

  let y = 78;
  const enTetes = () => {
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor(C.encreDouce);
    for (const c of col) doc.text(c.t, c.x, y, { width: c.w, align: c.a, characterSpacing: 0.6 });
    y += 11;
    doc.save().moveTo(M, y).lineTo(M + L, y).lineWidth(0.6).strokeColor(C.trait).stroke().restore();
    y += 5;
  };
  enTetes();

  for (const l of b.lignes) {
    if (y + 14 > PAGE.h - M - 30) {
      doc.addPage();
      y = M + 6;
      enTetes();
    }

    const valeurs = [
      dateFr(l.date), l.arrivee, l.depart,
      // `heures` arrive de toFixed(2), donc avec un point decimal :
      // « 8.00 h » au milieu de « 2 400,000 TND » jure sur la meme page.
      l.heures ? `${nb(Number(l.heures), 2)} h` : "—", l.type, l.retard,
    ];

    valeurs.forEach((v, i) => {
      const c = col[i];
      const couleur = i === 4 ? (COULEUR_TYPE[l.type] || C.encre)
        : i === 5 && l.retard && l.retard !== "—" ? C.retenue
          : C.encre;
      doc.font(i === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(7.5)
        .fillColor(couleur)
        .text(String(v ?? "—"), c.x, y, { width: c.w, align: c.a, lineBreak: false });
    });

    doc.save().moveTo(M, y + 11).lineTo(M + L, y + 11)
      .lineWidth(0.3).strokeColor(C.trait).stroke().restore();
    y += 14;
  }

  doc.font("Helvetica-Oblique").fontSize(6.5).fillColor(C.encreDouce)
    .text(
      `${b.lignes.length} journée${b.lignes.length > 1 ? "s" : ""} pointée${b.lignes.length > 1 ? "s" : ""}. `
      + "Les jours ouvrables sans pointage ni congé accordé sont comptés comme absences non justifiées.",
      M, y + 6, { width: L }
    );
}

/**
 * Ouvre une page si la place manque sous le point courant.
 *
 * Un bulletin ordinaire tient sur une page, mais un mois chargé — toutes
 * les primes actives, plusieurs bons, des retenues multiples — peut
 * dépasser. Sans cette garde, les dernières lignes s'imprimaient par
 * dessus le pied de page.
 */
function garde(doc, y, besoin = 22) {
  // Le filet du pied de page est à PAGE.h - M - 46. Réserver 76 en plus
  // de `besoin` comptait deux fois la même place : une ligne de cumuls
  // de 18 pt basculait seule sur une page suivante alors qu'il restait
  // 40 pt. 58 laisse 12 pt d'air au-dessus du filet.
  if (y + besoin < PAGE.h - M - 52) return y;
  doc.addPage();
  return M + 6;
}

/**
 * Pose le pied de page sur CHAQUE page, puis la pagination.
 *
 * Dessiné à la fin plutôt qu'au fil de l'eau : la mention légale doit
 * figurer sur toutes les feuilles, y compris l'annexe des pointages, et
 * le total de pages n'est connu qu'une fois tout tracé. Auparavant le
 * pied partait sur la page suivante dès que le bulletin débordait, ce
 * qui laissait la première page sans mention légale.
 */
function finaliserPages(doc, b) {
  const { start, count } = doc.bufferedPageRange();
  const bar = b.bareme || {};
  const reference = [b.numero, b.moisLabel].filter(Boolean).join(" — ");
  const yPied = PAGE.h - M - 46;

  for (let i = 0; i < count; i++) {
    doc.switchToPage(start + i);

    doc.save().moveTo(M, yPied).lineTo(M + L, yPied)
      .lineWidth(0.6).strokeColor(C.trait).stroke().restore();

    doc.font("Helvetica-Bold").fontSize(6.5).fillColor(C.encre)
      .text("À conserver sans limitation de durée.", M, yPied + 8, { width: L * 0.62 });

    doc.font("Helvetica").fontSize(6).fillColor(C.encreDouce)
      .text(
        (bar.source
          ? `Barème appliqué : ${bar.source}`
          : "Barème de la loi de finances en vigueur")
        + (bar.enVigueurDepuis ? `, en vigueur depuis le ${dateFr(bar.enVigueurDepuis)}` : "")
        + ". Une erreur se signale aux ressources humaines, qui peuvent "
        + "régénérer le bulletin à partir des pointages.",
        M, yPied + 19, { width: L * 0.62 }
      );

    doc.font("Helvetica").fontSize(6).fillColor(C.encreDouce)
      .text(`Émis le ${dateFr(b.genereLe || new Date().toISOString())}`,
        M + L * 0.64, yPied + 8, { width: L * 0.36, align: "right" });

    // La référence sur chaque feuille : une page détachée reste
    // rattachable à son bulletin.
    doc.font("Helvetica").fontSize(6).fillColor(C.encreDouce)
      .text(
        count > 1
          ? `${reference}${reference ? "  ·  " : ""}page ${i + 1} / ${count}`
          : "Document généré automatiquement",
        M + L * 0.64, yPied + 18, { width: L * 0.36, align: "right" }
      );
  }
}

function titrePetit(doc, texte, x, y) {
  doc.font("Helvetica-Bold").fontSize(7).fillColor(C.marque)
    .text(texte.toUpperCase(), x, y, { characterSpacing: 1 });
  return y + 15;
}

function paire(doc, libelle, valeur, x, y, w, fort = false) {
  doc.font(fort ? "Helvetica-Bold" : "Helvetica").fontSize(7.5)
    .fillColor(fort ? C.encre : C.encreDouce)
    .text(libelle, x, y, { width: w * 0.6, lineBreak: false, ellipsis: true });
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.encre)
    .text(String(valeur), x + w * 0.6, y, { width: w * 0.4, align: "right", lineBreak: false });
  return y + 13;
}

module.exports = { genererBulletinPdf, C };