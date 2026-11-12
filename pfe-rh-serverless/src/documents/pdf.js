// src/documents/pdf.js
//
// Génération des attestations aux conventions tunisiennes.
//
// Remplacement direct de la version précédente : mêmes exports, même
// signature, `demandes.js` n'a pas une ligne à changer. Ce qui change
// est le dessin — celui du bulletin de paie — et deux points de fond.
//
// ── Ce qui est repris de la version précédente ─────────────────────
//
// Le montant en toutes lettres : une attestation de salaire qui ne
// porte qu'un chiffre se falsifie d'un trait de stylo. La CIN complète,
// avec sa date et son lieu de délivrance, sans quoi le document est
// refusé au guichet d'une banque. Le signataire, sa qualité, et
// l'emplacement du cachet : un document tunisien non cacheté n'est pas
// accepté.
//
// ── Ce qui change sur le fond ──────────────────────────────────────
//
// 1. Le certificat de travail relevait de « l'article 25 ». C'est
//    l'article 27. L'article 25 traite de la suspension du contrat sur
//    décision administrative ou judiciaire de fermeture. Vérifié sur
//    deux lectures du texte.
//
// 2. L'article 27 énumère LIMITATIVEMENT le contenu du certificat :
//    date d'entrée, date de sortie, nature de l'emploi ou des emplois
//    successifs, périodes correspondantes. Le texte dit « contenant
//    exclusivement ». L'appréciation (« avec sérieux et compétence »)
//    et la formule « libre de tout engagement » sortaient de ce cadre —
//    la première est tolérée par l'article, la seconde vient du droit
//    français et n'a pas d'équivalent ici. Les deux sont retirées par
//    défaut ; `contexte.appreciation` les rétablit si tu y tiens.
//
// L'identité de la société vient des variables d'environnement, avec
// les anciennes valeurs en repli pour que rien ne casse aujourd'hui.
// Les mêmes noms de variables que `src/factures/entreprise.js`, pour
// qu'un seul réglage serve au bulletin et aux attestations.

const PDFDocument = require("pdfkit");

const { C } = require("../factures/bulletin-pdf");

// ── Identité de la société ─────────────────────────────────────────

const SOCIETE = {
  raisonSociale: process.env.ENTREPRISE_NOM || "TERRA SARL",
  formeJuridique: process.env.ENTREPRISE_FORME || "Société à responsabilité limitée",
  capital: process.env.ENTREPRISE_CAPITAL || "100 000 TND",
  adresse: process.env.ENTREPRISE_ADRESSE || "Rue du Lac Léman, Les Berges du Lac",
  ville: process.env.ENTREPRISE_VILLE || "1053 Tunis",
  telephone: process.env.ENTREPRISE_TEL || "+216 71 000 000",
  email: process.env.ENTREPRISE_EMAIL || "contact@terra.tn",
  matriculeFiscal: process.env.ENTREPRISE_MF || "1234567/A/M/000",
  rne: process.env.ENTREPRISE_RNE || "B01234562026",
  affiliationCnss: process.env.ENTREPRISE_CNSS || "12345678-19",
  signataire: process.env.ENTREPRISE_SIGNATAIRE || "Mme Leïla ",
  qualiteSignataire:
    process.env.ENTREPRISE_QUALITE_SIGNATAIRE || "Directrice des ressources humaines",
};

// ── L'identité vient maintenant de la base ─────────────────────────
//
// Les valeurs ci-dessus restent le repli : une base injoignable ou une
// entreprise jamais saisie ne doit pas empêcher d'éditer un document.
// Mais dès que la RH a rempli Réglages › Entreprise, c'est la base qui
// fait foi — sinon la page ne servirait qu'aux bulletins de paie.
//
// La correspondance des noms est explicite parce qu'elle n'est pas
// évidente : `mf` ici s'appelle `matriculeFiscal`, et `nom` s'appelle
// `raisonSociale`.

const entreprise = require("../factures/entreprise");

const CORRESPONDANCE = {
  raisonSociale: "nom",
  formeJuridique: "formeJuridique",
  capital: "capital",
  adresse: "adresse",
  ville: "ville",
  telephone: "telephone",
  email: "email",
  matriculeFiscal: "mf",
  rne: "rne",
  affiliationCnss: "cnss",
  signataire: "signataire",
  qualiteSignataire: "qualiteSignataire",
};

/**
 * Recopie l'identité enregistrée dans SOCIETE.
 *
 * On écrase champ par champ et seulement si la valeur est renseignée :
 * une entreprise saisie sans téléphone garde celui du repli plutôt que
 * d'imprimer un blanc.
 */
async function chargerSociete() {
  const e = await entreprise.charger();

  for (const [ici, laBas] of Object.entries(CORRESPONDANCE)) {
    const valeur = String(e?.[laBas] ?? "").trim();
    if (valeur) SOCIETE[ici] = valeur;
  }
  // Le cachet n'a pas de repli : il est là ou il n'est pas.
  SOCIETE.cachet = e?.cachet ?? null;

  return SOCIETE;
}

// ── Mise en page, en points PostScript (72 pt = 1 pouce) ───────────

const PAGE = { l: 595.28, h: 841.89 };
const M = 48;
const L = PAGE.l - 2 * M;

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// pdfkit écrit en WinAnsi : l'espace fine insécable que produit
// toLocaleString('fr-FR'), le signe moins et le tiret insécable n'y sont
// pas encodables et sortent en « / », « " » et rien du tout. Le défaut
// ne se voit qu'en ouvrant le fichier, jamais dans les journaux.
const ascii = (s) =>
  String(s)
    .replace(/[   ]/g, " ")
    .replace(/[−–‐‑]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...");

/** 15 mars 2026 — la forme attendue sur un document administratif */
function dateLongue(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

const dateCourte = (iso) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fr-FR");
};

const tnd = (v) =>
  ascii(`${(Number(v) || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 3, maximumFractionDigits: 3,
  })} TND`);

/**
 * Montant en toutes lettres.
 *
 * Repris tel quel de la version précédente : c'est la protection la plus
 * efficace contre une retouche au stylo, et elle n'avait aucun défaut.
 */
function enLettres(n) {
  const unites = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six",
    "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze",
    "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
  const dizaines = ["", "", "vingt", "trente", "quarante", "cinquante",
    "soixante", "soixante", "quatre-vingt", "quatre-vingt"];

  const sousCent = (x) => {
    if (x < 20) return unites[x];
    const d = Math.floor(x / 10);
    const u = x % 10;
    if (d === 7 || d === 9) return `${dizaines[d]}-${unites[10 + u]}`;
    if (u === 0) return dizaines[d] + (d === 8 ? "s" : "");
    if (u === 1 && d < 8) return `${dizaines[d]}-et-un`;
    return `${dizaines[d]}-${unites[u]}`;
  };

  const sousMille = (x) => {
    if (x < 100) return sousCent(x);
    const c = Math.floor(x / 100);
    const r = x % 100;
    const tete = c === 1 ? "cent" : `${unites[c]} cent`;
    if (r === 0) return c === 1 ? "cent" : `${tete}s`;
    return `${tete} ${sousCent(r)}`;
  };

  const entier = Math.floor(n);
  const millimes = Math.round((n - entier) * 1000);

  let texte;
  if (entier === 0) texte = "zéro";
  else if (entier < 1000) texte = sousMille(entier);
  else {
    const milliers = Math.floor(entier / 1000);
    const reste = entier % 1000;
    const tete = milliers === 1 ? "mille" : `${sousMille(milliers)} mille`;
    texte = reste === 0 ? tete : `${tete} ${sousMille(reste)}`;
  }

  texte += " dinars";
  if (millimes > 0) texte += ` et ${sousMille(millimes)} millimes`;

  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

const e_ = (employe) => (employe?.genre === "F" ? "e" : "");

const reference = (type, employeId) => {
  const d = new Date();
  const horodatage = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`
    + `${String(d.getDate()).padStart(2, "0")}`;
  const court = type.split("_").map((m) => m[0]).join("");
  return `${court}-${horodatage}-${String(employeId).slice(0, 6).toUpperCase()}`;
};

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
  return yTrait + 8;
}

function paragraphe(doc, texte, y, options = {}) {
  doc.font(options.gras ? "Helvetica-Bold" : "Helvetica")
    .fontSize(options.taille ?? 10)
    .fillColor(C.encre)
    .text(texte, M, y, {
      width: L,
      align: options.align ?? "justify",
      lineGap: options.interligne ?? 4.5,
    });
  return doc.y + (options.espace ?? 12);
}

/**
 * Réserve de la place, et change de page si elle manque.
 *
 * pdfkit ouvre une page dès qu'un texte dépasse la marge basse. Comme
 * cette mise en page pose les ordonnées à la main, la marge basse est
 * mise à zéro et c'est cette fonction qui décide seule des sauts.
 */
function garde(doc, y, besoin = 24) {
  const plancher = PAGE.h - M - 52;
  if (y + besoin <= plancher) return y;
  doc.addPage();
  return M;
}

// ── En-tête ────────────────────────────────────────────────────────

function enTete(doc, titreDocument) {
  cartouche(doc, 0, 0, PAGE.l, 96, C.marque, 0);

  doc.font("Helvetica-Bold").fontSize(15).fillColor("#FFFFFF")
    .text(SOCIETE.raisonSociale, M, 20, { width: L * 0.6 });

  doc.font("Helvetica").fontSize(7.5).fillColor("#D7E0E6")
    .text(`${SOCIETE.formeJuridique} au capital de ${SOCIETE.capital}`, M, 41, { width: L * 0.6 })
    .text(`${SOCIETE.adresse} — ${SOCIETE.ville}`, M, 53, { width: L * 0.6 })
    .text(`Tél. ${SOCIETE.telephone} — ${SOCIETE.email}`, M, 65, { width: L * 0.6 });

  // Les identifiants légaux : obligatoires sur tout document émis par
  // une société tunisienne.
  const xD = M + L * 0.62;
  const wD = L * 0.38;
  const lignes = [
    ["MATRICULE FISCAL", SOCIETE.matriculeFiscal],
    ["RNE", SOCIETE.rne],
    ["AFFILIATION CNSS", SOCIETE.affiliationCnss],
  ];
  lignes.forEach(([lib, val], i) => {
    const y = 22 + i * 22;
    doc.font("Helvetica").fontSize(6.5).fillColor("#A9BAC4")
      .text(lib, xD, y, { width: wD, align: "right", characterSpacing: 0.5 });
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#FFFFFF")
      .text(val || "—", xD, y + 8.5, { width: wD, align: "right" });
  });

  // Le titre, en bandeau clair sous l'en-tête
  cartouche(doc, 0, 96, PAGE.l, 34, C.marqueClair, 0);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(C.marque)
    .text(titreDocument.toUpperCase(), M, 107, {
      width: L, align: "center", characterSpacing: 1.4,
    });

  return 150;
}

// ── Identité civile du salarié ─────────────────────────────────────

function identiteCivile(doc, employe, y) {
  const hauteur = employe.matriculeCnss ? 82 : 70;
  cartouche(doc, M, y, L, hauteur, C.marqueClair);
  doc.save().rect(M, y, 3, hauteur).fill(C.accent).restore();

  const nom = `${employe.prenom ?? ""} ${employe.nom ?? ""}`.trim().toUpperCase();

  doc.font("Helvetica-Bold").fontSize(11).fillColor(C.encre)
    .text(nom || "—", M + 16, y + 12, { width: L - 32 });

  doc.font("Helvetica").fontSize(8.5).fillColor(C.encreDouce)
    .text(
      `Titulaire de la carte d'identité nationale n° ${employe.cin ?? "—"}`,
      M + 16, y + 30, { width: L - 32 }
    )
    .text(
      `délivrée le ${dateLongue(employe.cinDelivreLe)} à ${employe.cinDelivreA ?? "—"}`,
      M + 16, y + 43, { width: L - 32 }
    );

  if (employe.matriculeCnss) {
    doc.text(
      `Numéro d'affiliation CNSS : ${employe.matriculeCnss}`,
      M + 16, y + 56, { width: L - 32 }
    );
  }

  return y + hauteur + 18;
}

// ── Signature, cachet, pied de page ────────────────────────────────

function signature(doc, y) {
  const HAUTEUR = 134;
  let yy = garde(doc, y + 8, HAUTEUR);

  // Quand le document tient en quelques lignes, le bloc descend au bas
  // de la page : un cachet flottant au milieu d'une page vide fait
  // brouillon, et le bas de page est l'endroit où on l'appose.
  const basDePage = PAGE.h - M - 56 - HAUTEUR;
  if (basDePage > yy) yy = basDePage;

  const xS = M + L * 0.52;
  const wS = L * 0.48;

  doc.font("Helvetica").fontSize(10).fillColor(C.encre)
    .text(
      `Fait à ${SOCIETE.ville.replace(/^\d+\s*/, "")}, le ${dateLongue(new Date().toISOString())}.`,
      xS, yy, { width: wS, align: "right" }
    );

  doc.font("Helvetica-Bold").fontSize(10).fillColor(C.encre)
    .text(SOCIETE.signataire, xS, yy + 24, { width: wS, align: "right" });
  doc.font("Helvetica").fontSize(8).fillColor(C.encreDouce)
    .text(SOCIETE.qualiteSignataire, xS, yy + 38, { width: wS, align: "right" });

  // Le cachet déposé dans Réglages › Entreprise s'imprime dans le
  // cadre. Sans cachet, le cadre en pointillés reste : il veut dire
  // « à tamponner à la main », et c'est ce qu'il faudra faire.
  const cadreVide = () => {
    doc.save().roundedRect(xS, yy + 56, wS, 62, 4)
      .lineWidth(0.6).dash(3, { space: 2 }).strokeColor(C.trait).stroke().restore();
    doc.font("Helvetica").fontSize(7.5).fillColor(C.encreDouce)
      .text("Cachet de la société", xS, yy + 82, { width: wS, align: "center" });
  };

  if (SOCIETE.cachet) {
    try {
      // Quatre points de marge : un cachet collé au bord du cadre
      // donne l'impression d'un collage, pas d'une apposition.
      doc.image(Buffer.from(SOCIETE.cachet, "base64"), xS + 4, yy + 58, {
        fit: [wS - 8, 58], align: "center", valign: "center",
      });
    } catch (e) {
      // Une image illisible ne doit pas faire échouer une attestation :
      // on retombe sur le cadre, que la RH tamponnera.
      console.error(`[pdf] Cachet illisible (${e.message}) — cadre vide.`);
      cadreVide();
    }
  } else {
    cadreVide();
  }

  return yy + HAUTEUR;
}

/**
 * Le pied de page sur CHAQUE page, et la pagination.
 *
 * `bufferPages` garde les pages en mémoire : le total n'est connu qu'à
 * la fin, et « page 1 / 2 » ne peut pas s'écrire avant.
 */
function finaliserPages(doc, ref) {
  const plage = doc.bufferedPageRange();

  for (let i = 0; i < plage.count; i++) {
    doc.switchToPage(plage.start + i);

    const yTrait = PAGE.h - M - 42;
    doc.save().moveTo(M, yTrait).lineTo(M + L, yTrait)
      .lineWidth(0.6).strokeColor(C.trait).stroke().restore();

    doc.font("Helvetica").fontSize(6.5).fillColor(C.encreDouce)
      .text(`Référence : ${ref}`, M, yTrait + 9, { width: L * 0.7 })
      .text(
        `page ${i + 1} / ${plage.count}`,
        M + L * 0.7, yTrait + 9, { width: L * 0.3, align: "right" }
      )
      .text(
        "Document généré électroniquement — toute rature l'annule",
        M, yTrait + 20, { width: L * 0.7 }
      );
  }
}

// ── Attestation de travail ─────────────────────────────────────────

function attestationTravail(doc, { employe, destinataire }) {
  let y = enTete(doc, "Attestation de travail");

  y = paragraphe(doc,
    `Je soussignée ${SOCIETE.signataire}, agissant en qualité de `
    + `${SOCIETE.qualiteSignataire.toLowerCase()} de la société ${SOCIETE.raisonSociale}, `
    + `atteste par la présente que :`,
    y);

  y = identiteCivile(doc, employe, y);

  const contrat = employe.typeContrat ?? "contrat à durée indéterminée";

  y = paragraphe(doc,
    `est employé${e_(employe)} au sein de notre société depuis le `
    + `${dateLongue(employe.dateEmbauche)}, en qualité de ${employe.poste ?? "—"}`
    + `${employe.departement ? `, au sein du département ${employe.departement}` : ""}, `
    + `sous ${contrat}.`,
    y);

  y = paragraphe(doc,
    `À ce jour, l'intéressé${e_(employe)} fait toujours partie de nos effectifs `
    + `et exerce ses fonctions à temps plein.`,
    y);

  y = paragraphe(doc,
    destinataire
      ? `La présente attestation est délivrée à l'intéressé${e_(employe)} à sa demande, `
        + `pour être remise à ${destinataire}.`
      : `La présente attestation est délivrée à l'intéressé${e_(employe)} à sa demande, `
        + `pour servir et valoir ce que de droit.`,
    y);

  return signature(doc, y);
}

// ── Attestation de salaire ─────────────────────────────────────────

function attestationSalaire(doc, { employe, destinataire, bulletins = [] }) {
  let y = enTete(doc, "Attestation de salaire");

  y = paragraphe(doc,
    `Je soussignée ${SOCIETE.signataire}, agissant en qualité de `
    + `${SOCIETE.qualiteSignataire.toLowerCase()} de la société ${SOCIETE.raisonSociale}, `
    + `atteste par la présente que :`,
    y);

  y = identiteCivile(doc, employe, y);

  y = paragraphe(doc,
    `est employé${e_(employe)} au sein de notre société depuis le `
    + `${dateLongue(employe.dateEmbauche)} en qualité de ${employe.poste ?? "—"}, `
    + `et perçoit à ce titre les rémunérations suivantes :`,
    y);

  // Les trois derniers bulletins : une banque exige une moyenne, pas un
  // mois isolé qui pourrait être exceptionnel.
  const troisDerniers = [...bulletins]
    .sort((a, b) => String(b.periode).localeCompare(String(a.periode)))
    .slice(0, 3);

  if (troisDerniers.length > 0) {
    y = garde(doc, y, 40 + troisDerniers.length * 20);
    y = titreSection(doc, "Les trois derniers bulletins", y);

    const cols = [
      { x: M, w: L * 0.3, align: "left" },
      { x: M + L * 0.3, w: L * 0.22, align: "right" },
      { x: M + L * 0.52, w: L * 0.22, align: "right" },
      { x: M + L * 0.74, w: L * 0.26, align: "right" },
    ];
    const entetes = ["PÉRIODE", "BRUT", "RETENUES", "NET PERÇU"];

    doc.font("Helvetica").fontSize(6.5).fillColor(C.encreDouce);
    entetes.forEach((e, i) =>
      doc.text(e, cols[i].x, y, { width: cols[i].w, align: cols[i].align, characterSpacing: 0.5 }));
    y += 13;

    for (const b of troisDerniers) {
      y = garde(doc, y, 20);
      doc.font("Helvetica").fontSize(9).fillColor(C.encre)
        .text(b.moisLabel ?? b.periode ?? "—", cols[0].x, y, { width: cols[0].w })
        .text(tnd(b.totalBrut), cols[1].x, y, { width: cols[1].w, align: "right" });
      doc.fillColor(C.retenue)
        .text(`-${tnd(b.cotisations?.total)}`, cols[2].x, y, { width: cols[2].w, align: "right" });
      doc.font("Helvetica-Bold").fillColor(C.encre)
        .text(tnd(b.salaireNet), cols[3].x, y, { width: cols[3].w, align: "right" });

      y += 17;
      doc.save().moveTo(M, y - 3).lineTo(M + L, y - 3)
        .lineWidth(0.4).strokeColor(C.trait).stroke().restore();
    }

    const moyenne = troisDerniers.reduce((s, b) => s + (b.salaireNet ?? 0), 0)
      / troisDerniers.length;

    y += 4;
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(C.accent)
      .text("Moyenne mensuelle nette", cols[0].x, y, { width: L * 0.74 })
      .text(tnd(moyenne), cols[3].x, y, { width: cols[3].w, align: "right" });
    y += 22;

    y = paragraphe(doc,
      `Soit une moyenne mensuelle nette de ${enLettres(moyenne).toLowerCase()}, `
      + `calculée sur les ${troisDerniers.length} derniers bulletins de paie.`,
      garde(doc, y, 40));
  } else {
    // Sans bulletin émis, seul le salaire contractuel peut être attesté :
    // le dire plutôt que de laisser un blanc.
    y = paragraphe(doc,
      `Salaire brut mensuel contractuel : ${tnd(employe.salaireBrutMensuel)}, `
      + `soit ${enLettres(employe.salaireBrutMensuel ?? 0).toLowerCase()}.`,
      y);
    y = paragraphe(doc,
      `Aucun bulletin de paie n'ayant encore été émis, la présente attestation porte `
      + `sur la rémunération prévue au contrat de travail.`,
      y);
  }

  y = paragraphe(doc,
    `Les cotisations sociales sont retenues au taux de 9,68 % au titre du régime `
    + `général de la Caisse nationale de sécurité sociale, et l'impôt sur le revenu `
    + `est prélevé à la source selon le barème progressif en vigueur.`,
    garde(doc, y, 50), { taille: 9 });

  y = paragraphe(doc,
    destinataire
      ? `La présente attestation est délivrée à l'intéressé${e_(employe)} à sa demande, `
        + `pour être remise à ${destinataire}.`
      : `La présente attestation est délivrée à l'intéressé${e_(employe)} à sa demande, `
        + `pour servir et valoir ce que de droit.`,
    y);

  return signature(doc, y);
}

// ── Attestation de congés ──────────────────────────────────────────

function attestationConges(doc, { employe, destinataire, soldeConges = {} }) {
  let y = enTete(doc, "Attestation de congés payés");

  y = paragraphe(doc,
    `Je soussignée ${SOCIETE.signataire}, agissant en qualité de `
    + `${SOCIETE.qualiteSignataire.toLowerCase()} de la société ${SOCIETE.raisonSociale}, `
    + `atteste par la présente que :`,
    y);

  y = identiteCivile(doc, employe, y);

  const acquis = soldeConges.acquis ?? 0;
  const pris = soldeConges.pris ?? 0;
  const restant = acquis - pris;
  const annee = new Date().getFullYear();

  y = paragraphe(doc,
    `employé${e_(employe)} au sein de notre société depuis le `
    + `${dateLongue(employe.dateEmbauche)} en qualité de ${employe.poste ?? "—"}, `
    + `dispose au titre de l'exercice ${annee} du solde de congés payés suivant :`,
    y);

  y = garde(doc, y, 72);
  const w = (L - 20) / 3;
  const cases = [
    ["Jours acquis", acquis, C.encre, C.marqueClair],
    ["Jours pris", pris, C.encre, C.marqueClair],
    ["Solde restant", restant, restant < 0 ? C.retenue : C.accent, "#E8F6F4"],
  ];

  cases.forEach(([libelle, valeur, couleur, fond], i) => {
    const x = M + i * (w + 10);
    cartouche(doc, x, y, w, 58, fond);
    doc.font("Helvetica-Bold").fontSize(20).fillColor(couleur)
      .text(String(valeur), x, y + 12, { width: w, align: "center" });
    doc.font("Helvetica").fontSize(8).fillColor(C.encreDouce)
      .text(libelle, x, y + 38, { width: w, align: "center" });
  });
  y += 72;

  y = paragraphe(doc,
    `Conformément à l'article 113 du Code du travail tunisien, le droit à congé `
    + `annuel payé est acquis à raison d'un jour ouvrable par mois de travail effectif, `
    + `sans que la durée totale puisse excéder quinze jours ouvrables, dont douze jours `
    + `ouvrables consécutifs.`,
    garde(doc, y, 50), { taille: 9 });

  if (restant < 0) {
    y = paragraphe(doc,
      `Le solde présente un dépassement de ${Math.abs(restant)} jour(s), `
      + `imputable sur l'exercice suivant.`,
      y);
  }

  y = paragraphe(doc,
    destinataire
      ? `La présente attestation est délivrée à l'intéressé${e_(employe)} à sa demande, `
        + `pour être remise à ${destinataire}.`
      : `La présente attestation est délivrée à l'intéressé${e_(employe)} à sa demande, `
        + `pour servir et valoir ce que de droit.`,
    y);

  return signature(doc, y);
}

// ── Certificat de travail ──────────────────────────────────────────

function certificatTravail(doc, { employe, emplois, appreciation }) {
  let y = enTete(doc, "Certificat de travail");

  y = paragraphe(doc,
    `Je soussignée ${SOCIETE.signataire}, agissant en qualité de `
    + `${SOCIETE.qualiteSignataire.toLowerCase()} de la société ${SOCIETE.raisonSociale}, `
    + `certifie que :`,
    y);

  y = identiteCivile(doc, employe, y);

  const sortie = employe.sortieLe ?? employe.dateSortie ?? new Date().toISOString();

  y = paragraphe(doc,
    `a fait partie du personnel de notre société du ${dateLongue(employe.dateEmbauche)} `
    + `au ${dateLongue(sortie)}.`,
    y);

  // L'article 27 exige nommément les emplois SUCCESSIFS et leurs
  // périodes : une entreprise où le salarié a changé de poste ne peut
  // pas s'en tenir au dernier.
  const liste = Array.isArray(emplois) && emplois.length
    ? emplois
    : [{ poste: employe.poste, du: employe.dateEmbauche, au: sortie }];

  y = garde(doc, y + 6, 40 + liste.length * 20);
  y = titreSection(doc, liste.length > 1 ? "Les emplois successifs" : "L'emploi occupé", y);

  const wPoste = L * 0.52;
  const wDate = L * 0.24;

  doc.font("Helvetica").fontSize(6.5).fillColor(C.encreDouce)
    .text("NATURE DE L'EMPLOI", M, y, { width: wPoste, characterSpacing: 0.5 })
    .text("DU", M + wPoste, y, { width: wDate, align: "right", characterSpacing: 0.5 })
    .text("AU", M + wPoste + wDate, y, { width: wDate, align: "right", characterSpacing: 0.5 });
  y += 13;

  for (const emploi of liste) {
    y = garde(doc, y, 20);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(C.encre)
      .text(emploi.poste || "—", M, y, { width: wPoste });
    doc.font("Helvetica").fillColor(C.encre)
      .text(dateCourte(emploi.du), M + wPoste, y, { width: wDate, align: "right" })
      .text(emploi.au ? dateCourte(emploi.au) : "—", M + wPoste + wDate, y,
        { width: wDate, align: "right" });
    y += 17;
    doc.save().moveTo(M, y - 3).lineTo(M + L, y - 3)
      .lineWidth(0.4).strokeColor(C.trait).stroke().restore();
  }

  y += 8;

  // Par défaut, rien de plus : l'article 27 dit « contenant
  // exclusivement ». L'appréciation reste possible — l'article la
  // tolère sans perte de l'exemption de timbre — mais elle est un choix,
  // pas un automatisme.
  if (appreciation) {
    y = paragraphe(doc, String(appreciation), garde(doc, y, 40));
  }

  y = paragraphe(doc,
    `Le présent certificat est délivré à l'intéressé${e_(employe)} à l'expiration de `
    + `son contrat de travail, conformément à l'article 27 du Code du travail. `
    + `Il est exempt de droit de timbre et d'enregistrement.`,
    garde(doc, y, 50), { taille: 9 });

  return signature(doc, y);
}

// ── Point d'entrée ─────────────────────────────────────────────────

const GENERATEURS = {
  ATTESTATION_TRAVAIL: attestationTravail,
  ATTESTATION_SALAIRE: attestationSalaire,
  ATTESTATION_CONGES: attestationConges,
  CERTIFICAT_TRAVAIL: certificatTravail,
};

/**
 * Produit le PDF d'un document administratif.
 *
 * @param {string} type       une clé de GENERATEURS
 * @param {object} contexte   { employe, destinataire, bulletins, soldeConges,
 *                              emplois?, appreciation? }
 * @returns {Promise<Buffer>}
 */
async function genererDocument(type, contexte) {
  const generateur = GENERATEURS[type];
  if (!generateur) {
    throw new Error(
      `Type de document inconnu : ${type}. `
      + `Types générables : ${Object.keys(GENERATEURS).join(", ")}.`
    );
  }

  const { employe } = contexte;

  // Avant tout dessin : sans cela, un document édité juste après une
  // correction dans Réglages › Entreprise porterait encore l'ancienne
  // adresse.
  await chargerSociete();

  // Le contrôle vit ici plutôt que dans la route : quel que soit
  // l'appelant, un document sans CIN complète n'est pas produit.
  if (!employe?.cin || !employe?.cinDelivreLe || !employe?.cinDelivreA) {
    throw new Error(
      "Le numéro de CIN, sa date et son lieu de délivrance sont requis "
      + "pour générer une attestation."
    );
  }

  return new Promise((resoudre, rejeter) => {
    const doc = new PDFDocument({
      size: "A4",
      bufferPages: true,
      margins: { top: M, bottom: M, left: M, right: M },
      info: {
        Title: type.replace(/_/g, " ").toLowerCase(),
        Author: SOCIETE.raisonSociale,
        // Pas de nom de salarié dans les métadonnées : elles voyagent
        // avec le fichier et restent lisibles par qui le reçoit.
        Subject: "Document administratif",
      },
    });

    // Tout texte passe par `ascii`, y compris celui qui vient de la base :
    // un nom d'entreprise avec une apostrophe typographique produirait le
    // même glyphe parasite qu'un séparateur de milliers.
    const texteBrut = doc.text.bind(doc);
    doc.text = (s, ...reste) => texteBrut(ascii(s ?? ""), ...reste);

    const sansMargeBasse = () => { doc.page.margins.bottom = 0; };
    sansMargeBasse();
    doc.on("pageAdded", sansMargeBasse);

    const morceaux = [];
    doc.on("data", (m) => morceaux.push(m));
    doc.on("end", () => resoudre(Buffer.concat(morceaux)));
    doc.on("error", rejeter);

    try {
      generateur(doc, contexte);
      finaliserPages(doc, reference(type, employe.id));
      doc.end();
    } catch (e) {
      rejeter(e);
    }
  });
}

module.exports = { genererDocument, SOCIETE, enLettres, chargerSociete };