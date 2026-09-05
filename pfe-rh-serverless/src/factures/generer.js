// src/factures/generer.js
// POST /factures — génération d'un bulletin de paie

const { GetCommand, QueryCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs/promises");
const path = require("path");
const PDFDocument = require("pdfkit");

const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { partiesLocales } = require("../utils/contexte");
const { calculerBulletin, HEURES_MENSUELLES } = require("../utils/paie");

const TABLE_EMPLOYES  = process.env.TABLE_EMPLOYES  || "Employes-local";
const TABLE_POINTAGES = process.env.TABLE_POINTAGES || "Pointages-local";
const TABLE_CONGES    = process.env.TABLE_CONGES    || "Conges-local";
const TABLE_FACTURES  = process.env.TABLE_FACTURES  || "Factures-local";
const BUCKET          = process.env.DOCUMENTS_BUCKET;

const s3 = BUCKET ? new S3Client({ region: process.env.AWS_REGION }) : null;

const JOURS_FERIES = [
  "2026-01-01", "2026-01-14", "2026-03-20", "2026-04-09",
  "2026-05-01", "2026-07-25", "2026-08-13", "2026-10-15",
];

const TYPES_CONGE_NON_PAYES = new Set(["sans_solde"]);
const STATUT_CONGE_VALIDE = "APPROUVE";

const HEURE_ARRIVEE_NORMALE = "08:30";
const TOLERANCE_RETARD_MIN = 15;

const MOIS_LABELS = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

// ── Dates ──────────────────────────────────────────────────────────
// Aucune conversion UTC sur les dates calendaires : toISOString()
// décalerait d'un jour dans le fuseau tunisien.

const pad = (n) => String(n).padStart(2, "0");

const enChaine = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function estWeekend(jour) {
  const [a, m, j] = jour.split("-").map(Number);
  const n = new Date(a, m - 1, j).getDay();
  return n === 0 || n === 6;
}

const estFerie = (jour) => JOURS_FERIES.includes(jour);
const estOuvrable = (jour) => !estWeekend(jour) && !estFerie(jour);

function joursDuMois(mois, annee) {
  const dernier = new Date(annee, mois, 0).getDate();
  return Array.from({ length: dernier }, (_, i) => `${annee}-${pad(mois)}-${pad(i + 1)}`);
}

function minutesDeRetard(heureArriveeIso) {
  const { heures, minutes } = partiesLocales(heureArriveeIso);
  const [hs, ms] = HEURE_ARRIVEE_NORMALE.split(":").map(Number);
  return Math.max(0, (heures * 60 + minutes) - (hs * 60 + ms) - TOLERANCE_RETARD_MIN);
}

// ── Lectures ───────────────────────────────────────────────────────

async function chargerPointages(employeId, periode) {
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_POINTAGES,
    KeyConditionExpression: "employeId = :e AND begins_with(#d, :p)",
    ExpressionAttributeNames: { "#d": "date" },
    ExpressionAttributeValues: { ":e": employeId, ":p": periode },
  }));
  return (res.Items || []).filter((p) => p.statut === "TERMINE");
}

async function chargerConges(employeId, premierJour, dernierJour) {
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_CONGES,
    IndexName: "employe-index",
    KeyConditionExpression: "employeId = :e",
    ExpressionAttributeValues: { ":e": employeId },
  }));

  return (res.Items || []).filter(
    (c) => c.statut === STATUT_CONGE_VALIDE &&
           c.dateDebut <= dernierJour &&
           c.dateFin >= premierJour
  );
}

function joursDeConge(conges, premierJour, dernierJour) {
  const payes = new Set();
  const nonPayes = new Set();

  for (const conge of conges) {
    const debut = conge.dateDebut > premierJour ? conge.dateDebut : premierJour;
    const fin = conge.dateFin < dernierJour ? conge.dateFin : dernierJour;

    const [ad, md, jd] = debut.split("-").map(Number);
    const [af, mf, jf] = fin.split("-").map(Number);
    const curseur = new Date(ad, md - 1, jd);
    const borne = new Date(af, mf - 1, jf);

    while (curseur <= borne) {
      const jour = enChaine(curseur);
      if (estOuvrable(jour) && !payes.has(jour) && !nonPayes.has(jour)) {
        if (TYPES_CONGE_NON_PAYES.has(conge.type)) nonPayes.add(jour);
        else payes.add(jour);
      }
      curseur.setDate(curseur.getDate() + 1);
    }
  }

  return { payes, nonPayes };
}

async function stockerPdf(cle, buffer) {
  if (s3) {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: cle,
      Body: buffer,
      ContentType: "application/pdf",
      ServerSideEncryption: "AES256",
    }));
    return cle;
  }
  const destination = path.join(process.cwd(), "tmp", cle);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, buffer);
  console.log(`PDF local : ${destination}`);
  return cle;
}

// ── Handler ────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || {});
    const user = event.user;

    const { employeId, mois, annee, regenerer = false, deduireRetards = false } = body;

    if (!employeId || !mois || !annee) {
      return erreur("employeId, mois et annee sont requis", 400);
    }

    const moisNum = parseInt(mois, 10);
    const anneeNum = parseInt(annee, 10);
    if (moisNum < 1 || moisNum > 12) return erreur("mois doit être compris entre 1 et 12", 400);

    const periode = `${anneeNum}-${pad(moisNum)}`;
    const jours = joursDuMois(moisNum, anneeNum);
    const premierJour = jours[0];
    const dernierJour = jours[jours.length - 1];
    const joursOuvrables = jours.filter(estOuvrable);

    // 1. Employé
    const empRes = await docClient.send(new GetCommand({
      TableName: TABLE_EMPLOYES, Key: { id: employeId },
    }));
    if (!empRes.Item) return erreur("Employé introuvable", 404);
    const employe = empRes.Item;

    // La rémunération contractuelle est mensuelle et fixe. Elle ne dépend
    // pas du nombre de jours ouvrables du mois — c'est le nombre d'heures
    // travaillées qui varie, pas le salaire de base.
    const salaireBrutMensuel =
      body.salaireBrutMensuel ?? employe.salaireBrutMensuel ?? employe.salaireBase;

    if (!salaireBrutMensuel || salaireBrutMensuel <= 0) {
      return erreur(
        `Aucun salaire mensuel défini pour ${employe.prenom} ${employe.nom}. ` +
        `Renseignez salaireBrutMensuel sur sa fiche.`,
        400
      );
    }

    const heuresContratJour = employe.heuresContrat || 8;
    const heuresMensuelles = employe.heuresMensuelles || HEURES_MENSUELLES.r48;

    // 2. Temps de travail et absences
    const [pointages, conges] = await Promise.all([
      chargerPointages(employeId, periode),
      chargerConges(employeId, premierJour, dernierJour),
    ]);

    const { payes: congesPayes, nonPayes: congesNonPayes } =
      joursDeConge(conges, premierJour, dernierJour);

    let heuresSupplementaires = 0, heuresWeekend = 0, heuresFeries = 0;
    let minutesRetard = 0;
    const joursPresents = new Set();
    const lignes = [];

    for (const p of pointages) {
      const jour = p.date;
      const heures = p.dureeMinutes
        ? p.dureeMinutes / 60
        : (new Date(p.heureDepart) - new Date(p.heureArrivee)) / 3600000;
      if (!(heures > 0)) continue;

      joursPresents.add(jour);

      const ferie = estFerie(jour);
      const weekend = estWeekend(jour);
      const retard = ferie || weekend ? 0 : minutesDeRetard(p.heureArrivee);
      minutesRetard += retard;

      if (ferie) heuresFeries += heures;
      else if (weekend) heuresWeekend += heures;
      else heuresSupplementaires += Math.max(0, heures - heuresContratJour);

      const arrivee = partiesLocales(p.heureArrivee);
      lignes.push({
        date: jour,
        arrivee: arrivee.hhmm,
        depart: p.heureDepart ? partiesLocales(p.heureDepart).hhmm : "—",
        heures: heures.toFixed(2),
        type: ferie ? "Férié" : weekend ? "Weekend" : retard > 0 ? "Retard" : "Normal",
        retard: retard > 0 ? `${retard} min` : "—",
      });
    }

    lignes.sort((a, b) => a.date.localeCompare(b.date));

    // Une absence non justifiée est un jour ouvrable sans pointage et
    // sans congé accordé. Les congés payés et les jours fériés sont
    // rémunérés : ils ne se déduisent jamais.
    const joursAbsenceNonJustifiee = joursOuvrables.filter(
      (j) => !joursPresents.has(j) && !congesPayes.has(j) && !congesNonPayes.has(j)
    ).length;

    // 3. Calcul
    const bulletin = calculerBulletin({
      salaireBrutMensuel,
      heuresMensuelles,
      nbJoursOuvrables: joursOuvrables.length,
      heuresSupplementaires,
      heuresWeekend,
      heuresFeries,
      primes: body.primes || 0,
      // Le congé sans solde se retient comme une absence
      joursAbsenceNonJustifiee: joursAbsenceNonJustifiee + congesNonPayes.size,
      minutesRetard,
      deduireRetards,
      situationFamiliale: {
        chefDeFamille: employe.chefDeFamille ?? false,
        nbEnfants: employe.nbEnfants ?? 0,
      },
    });

    // 4. Enregistrement — identifiant déterministe, un bulletin par mois
    const id = `${employeId}_${periode}`;
    const numero = `BP-${periode}-${employeId.slice(0, 6).toUpperCase()}`;

    const donneesPdf = {
      employe, mois: moisNum, annee: anneeNum, numero, bulletin,
      nbJoursOuvrables: joursOuvrables.length,
      joursPresents: joursPresents.size,
      joursAbsenceNonJustifiee,
      congesPayes: congesPayes.size,
      congesNonPayes: congesNonPayes.size,
      heuresSupplementaires, heuresWeekend, heuresFeries, minutesRetard,
      lignes,
    };

    const pdfKey = `factures/${anneeNum}/${employeId}_${periode}.pdf`;
    await stockerPdf(pdfKey, await genererPDF(donneesPdf));

    const facture = {
      id, numero, employeId, periode,
      employeNom: `${employe.prenom} ${employe.nom}`,
      employePoste: employe.poste || "",
      mois: moisNum, annee: anneeNum,
      moisLabel: `${MOIS_LABELS[moisNum]} ${anneeNum}`,

      nbJoursOuvrables: joursOuvrables.length,
      joursPresents: joursPresents.size,
      joursAbsents: joursAbsenceNonJustifiee,
      congesPayes: congesPayes.size,
      congesNonPayes: congesNonPayes.size,
      heuresSupplementaires: Math.round(heuresSupplementaires * 100) / 100,
      heuresWeekend: Math.round(heuresWeekend * 100) / 100,
      heuresFeries: Math.round(heuresFeries * 100) / 100,
      minutesRetard,

      salaireBase: bulletin.salaireBase,
      tauxHoraire: bulletin.tauxHoraire,
      gains: bulletin.gains,
      retenues: bulletin.retenues,
      totalBrut: bulletin.brut,
      cotisations: bulletin.cotisations,
      salaireNet: bulletin.net,
      fiscal: bulletin.fiscal,

      pdfKey,
      statut: "GENERE",
      genereLe: new Date().toISOString(),
      genereParId: user?.sub || user?.id || "system",
    };

    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_FACTURES,
        Item: facture,
        ...(regenerer ? {} : { ConditionExpression: "attribute_not_exists(id)" }),
      }));
    } catch (e) {
      if (e.name === "ConditionalCheckFailedException") {
        return erreur(
          `Un bulletin existe déjà pour ${MOIS_LABELS[moisNum]} ${anneeNum}. ` +
          `Envoyez regenerer: true pour le remplacer.`,
          409
        );
      }
      throw e;
    }

    return succes({
      facture,
      message: `Bulletin généré : ${bulletin.net.toFixed(3)} TND net`,
    }, 201);

  } catch (e) {
    console.error("Erreur génération bulletin:", e);
    return erreur("Erreur lors de la génération : " + e.message);
  }
};

// ── Rendu PDF ──────────────────────────────────────────────────────

function genererPDF(d) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const morceaux = [];
    doc.on("data", (c) => morceaux.push(c));
    doc.on("end", () => resolve(Buffer.concat(morceaux)));
    doc.on("error", reject);

    const VERT = "#2d6a4f", BEIGE = "#f5f0e8", GRIS = "#6b7280", NOIR = "#1a1a1a", W = 515;
    const { bulletin: b } = d;
    const tnd = (v) => `${v.toFixed(3)} TND`;

    // En-tête
    doc.rect(40, 40, W, 80).fill(VERT);
    doc.fillColor("white").fontSize(20).font("Helvetica-Bold").text("TERRA HR", 55, 55);
    doc.fontSize(10).font("Helvetica").text("Bulletin de paie", 55, 80);
    doc.fontSize(10)
      .text(`${MOIS_LABELS[d.mois]} ${d.annee}`, 400, 55, { align: "right", width: 150 })
      .text(d.numero, 400, 72, { align: "right", width: 150 });

    // Employé
    doc.rect(40, 135, W, 70).fill(BEIGE);
    doc.fillColor(NOIR).fontSize(11).font("Helvetica-Bold")
      .text(`${d.employe.prenom} ${d.employe.nom}`, 55, 148);
    doc.fontSize(9).font("Helvetica").fillColor(GRIS)
      .text(`${d.employe.poste || ""}  ·  ${d.employe.departement || ""}`, 55, 163)
      .text(d.employe.email, 55, 177);
    doc.fontSize(9)
      .text(`Horaire mensuel : ${b.heuresMensuelles} h`, 380, 148, { align: "right", width: 170 })
      .text(`Taux horaire : ${b.tauxHoraire.toFixed(3)} TND`, 380, 163, { align: "right", width: 170 })
      .text(`Jours ouvrables : ${d.nbJoursOuvrables}`, 380, 177, { align: "right", width: 170 });

    // Présences
    doc.fillColor(VERT).fontSize(10).font("Helvetica-Bold").text("TEMPS DE TRAVAIL", 40, 222);
    doc.moveTo(40, 234).lineTo(555, 234).strokeColor(VERT).stroke();

    const presences = [
      ["Jours travaillés",           d.joursPresents,                    "j"],
      ["Absences non justifiées",    d.joursAbsenceNonJustifiee,         "j"],
      ["Congés payés",               d.congesPayes,                      "j"],
      ["Congés sans solde",          d.congesNonPayes,                   "j"],
      ["Heures supplémentaires",     d.heuresSupplementaires.toFixed(1), "h"],
      ["Heures de weekend",          d.heuresWeekend.toFixed(1),         "h"],
      ["Heures de jours fériés",     d.heuresFeries.toFixed(1),          "h"],
      ["Retard cumulé",              d.minutesRetard,                    "min"],
    ];

    let y = 242;
    presences.forEach(([label, val, unite], i) => {
      if (i % 2 === 0) doc.rect(40, y, W, 16).fill("#f9f7f4");
      doc.fillColor(NOIR).fontSize(9).font("Helvetica")
        .text(label, 55, y + 4)
        .text(`${val} ${unite}`, 450, y + 4, { align: "right", width: 100 });
      y += 16;
    });

    // Rémunération
    y += 12;
    doc.fillColor(VERT).fontSize(10).font("Helvetica-Bold").text("RÉMUNÉRATION", 40, y);
    y += 12;
    doc.moveTo(40, y).lineTo(555, y).strokeColor(VERT).stroke();
    y += 8;

    const ligne = (label, montant, couleur = NOIR, gras = false, indent = 65) => {
      doc.fillColor(couleur).fontSize(9).font(gras ? "Helvetica-Bold" : "Helvetica")
        .text(label, indent, y)
        .text(montant, 450, y, { align: "right", width: 100 });
      y += 14;
    };

    doc.fillColor(GRIS).fontSize(8).font("Helvetica-Bold").text("GAINS", 55, y);
    y += 12;

    ligne("Salaire de base", tnd(b.salaireBase));
    if (b.gains.heuresSupplementaires > 0) ligne("Heures supplémentaires (+75 %)", tnd(b.gains.heuresSupplementaires));
    if (b.gains.heuresWeekend > 0)         ligne("Heures de weekend (+100 %)", tnd(b.gains.heuresWeekend));
    if (b.gains.heuresFeries > 0)          ligne("Heures de jours fériés (+100 %)", tnd(b.gains.heuresFeries));
    if (b.gains.primes > 0)                ligne("Primes", tnd(b.gains.primes));
    if (b.retenues.absences > 0)           ligne("Retenue pour absence", `-${tnd(b.retenues.absences)}`, "#dc2626");
    if (b.retenues.retards > 0)            ligne("Retenue pour retard", `-${tnd(b.retenues.retards)}`, "#dc2626");

    doc.moveTo(300, y).lineTo(555, y).strokeColor("#e5e0d8").stroke();
    y += 4;
    ligne("Salaire brut", tnd(b.brut), NOIR, true, 55);
    y += 8;

    doc.fillColor(GRIS).fontSize(8).font("Helvetica-Bold").text("COTISATIONS ET IMPÔTS", 55, y);
    y += 12;

    ligne("CNSS salariale (9,68 %)", `-${tnd(b.cotisations.cnss)}`, "#dc2626");
    ligne("IRPP (barème progressif)", `-${tnd(b.cotisations.irpp)}`, "#dc2626");
    if (b.cotisations.css > 0) ligne("Contribution sociale de solidarité", `-${tnd(b.cotisations.css)}`, "#dc2626");

    y += 8;
    doc.rect(40, y, W, 28).fill(VERT);
    doc.fillColor("white").fontSize(12).font("Helvetica-Bold")
      .text("NET À PAYER", 55, y + 8)
      .text(tnd(b.net), 350, y + 8, { align: "right", width: 200 });
    y += 40;

    // Détail fiscal — justifie le montant retenu
    doc.fillColor(VERT).fontSize(9).font("Helvetica-Bold").text("BASE DE CALCUL DE L'IMPÔT", 40, y);
    y += 14;
    doc.fillColor(GRIS).fontSize(8).font("Helvetica");

    const f = b.fiscal;
    [
      ["Brut annualisé", tnd(f.brutAnnualise)],
      ["CNSS annualisée", `-${tnd(f.cnssAnnualisee)}`],
      ["Frais professionnels (10 %, plafond 2 000)", `-${tnd(f.fraisProfessionnels)}`],
      ["Abattements pour charges de famille", `-${f.abattementsFamiliaux.toFixed(3)} TND`],
      ["Revenu net imposable annuel", tnd(f.revenuNetImposable)],
      ["Taux de prélèvement global", `${f.tauxMoyen} %`],
    ].forEach(([label, val]) => {
      doc.text(label, 55, y).text(val, 400, y, { align: "right", width: 150 });
      y += 12;
    });

    // Historique des pointages
    if (d.lignes.length > 0) {
      doc.addPage();
      doc.rect(40, 40, W, 40).fill(VERT);
      doc.fillColor("white").fontSize(14).font("Helvetica-Bold")
        .text("DÉTAIL DES POINTAGES", 55, 52);

      y = 100;
      const cols = [40, 130, 210, 290, 360, 450];
      doc.rect(40, y, W, 18).fill(BEIGE);
      ["Date", "Arrivée", "Départ", "Durée", "Type", "Retard"].forEach((h, i) => {
        doc.fillColor(NOIR).fontSize(8).font("Helvetica-Bold").text(h, cols[i] + 5, y + 5);
      });
      y += 18;

      d.lignes.forEach((l, i) => {
        if (y > 750) { doc.addPage(); y = 60; }
        if (i % 2 === 0) doc.rect(40, y, W, 16).fill("#f9f7f4");
        doc.fillColor(NOIR).fontSize(8).font("Helvetica")
          .text(l.date, cols[0] + 5, y + 4)
          .text(l.arrivee, cols[1] + 5, y + 4)
          .text(l.depart, cols[2] + 5, y + 4)
          .text(`${l.heures} h`, cols[3] + 5, y + 4);

        const couleur = l.type === "Férié" ? "#dc2626"
                      : l.type === "Weekend" ? "#8b5cf6"
                      : l.type === "Retard" ? "#f59e0b" : VERT;
        doc.fillColor(couleur).text(l.type, cols[4] + 5, y + 4);
        doc.fillColor(l.retard === "—" ? GRIS : "#dc2626").text(l.retard, cols[5] + 5, y + 4);
        y += 16;
      });
    }

    doc.end();
  });
}