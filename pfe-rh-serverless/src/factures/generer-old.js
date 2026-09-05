// src/factures/generer.js

const { GetCommand, QueryCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const PDFDocument = require("pdfkit");

// Remplace : const s3 = new S3Client({ region: process.env.AWS_REGION });
const fs   = require("fs/promises");
const path = require("path");
const s3   = process.env.DOCUMENTS_BUCKET ? new S3Client({ region: process.env.AWS_REGION }) : null;

async function stockerPdf(cle, buffer) {
  if (s3) {
    await stockerPdf(pdfKey, pdfBuffer);
    return cle;
  }
  // Mode local : écriture sur disque
  const destination = path.join(process.cwd(), "tmp", cle);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, buffer);
  console.log(`📄 PDF local : ${destination}`);
  return cle;
}
const TABLE_EMPLOYES  = process.env.TABLE_EMPLOYES  || "Employes-local";
const TABLE_POINTAGES = process.env.TABLE_POINTAGES || "Pointages-local";
const TABLE_CONGES    = process.env.TABLE_CONGES    || "Conges-local";
const TABLE_FACTURES  = process.env.TABLE_FACTURES  || "Factures-local";
const BUCKET          = process.env.DOCUMENTS_BUCKET;
const FUSEAU          = process.env.FUSEAU_HORAIRE  || "Africa/Tunis";

const JOURS_FERIES = [
  "2026-01-01", "2026-01-14", "2026-03-20", "2026-04-09",
  "2026-05-01", "2026-07-25", "2026-08-13", "2026-10-15",
];

// Types de congé non rémunérés — tout le reste est considéré comme payé
const TYPES_NON_PAYES = new Set(["sans_solde", "SANS_SOLDE", "non_paye", "NON_PAYE"]);

// Statuts considérés comme validés (tolère les variantes de casse existantes)
const STATUTS_VALIDES = new Set(["approuve", "approuvé", "accepte", "accepté", "valide", "validé"]);

const TAUX = {
  heureSupplementaire: 1.5,
  heureWeekend:        1.75,
  heureJourFerie:      2.0,
  penaliteRetard:      0.2,  // 20% du taux horaire retenu sur le temps de retard
};

const HEURE_ARRIVEE_NORMALE = "08:30";
const TOLERANCE_RETARD_MIN  = 15;

const MOIS_LABELS = ["", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

// ── Utilitaires de date ────────────────────────────────────────────
// Aucun appel à toISOString() sur une date "calendaire" : cela convertit
// en UTC et décale d'un jour en Tunisie (UTC+1).

const pad = (n) => String(n).padStart(2, "0");

function dateEnChaine(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function estWeekend(dateStr) {
  const [a, m, j] = dateStr.split("-").map(Number);
  const jour = new Date(a, m - 1, j).getDay();
  return jour === 0 || jour === 6;
}

function estJourFerie(dateStr) {
  return JOURS_FERIES.includes(dateStr);
}

function estOuvrable(dateStr) {
  return !estWeekend(dateStr) && !estJourFerie(dateStr);
}

// Convertit un instant ISO en composants locaux (fuseau de l'entreprise)
function partiesLocales(iso) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: FUSEAU,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));

  const p = {};
  for (const part of parts) if (part.type !== "literal") p[part.type] = part.value;

  return {
    date:    `${p.year}-${p.month}-${p.day}`,
    heures:  Number(p.hour),
    minutes: Number(p.minute),
    hhmm:    `${p.hour}:${p.minute}`,
  };
}

function joursDuMois(mois, annee) {
  const dernier = new Date(annee, mois, 0).getDate();
  const jours = [];
  for (let j = 1; j <= dernier; j++) jours.push(`${annee}-${pad(mois)}-${pad(j)}`);
  return jours;
}

// ── Calculs métier ─────────────────────────────────────────────────

function heuresTravaillees(pointage) {
  if (!pointage.heureArrivee || !pointage.heureDepart) return 0;
  const ms = new Date(pointage.heureDepart) - new Date(pointage.heureArrivee);
  return ms > 0 ? ms / 3600000 : 0;
}

// Ancienne version : getMinutes() - 30, qui renvoyait 0 pour une arrivée à 10h05.
function minutesDeRetard(heureArriveeIso) {
  const { heures, minutes } = partiesLocales(heureArriveeIso);
  const [hSeuil, mSeuil] = HEURE_ARRIVEE_NORMALE.split(":").map(Number);
  const arrivee = heures * 60 + minutes;
  const seuil   = hSeuil * 60 + mSeuil + TOLERANCE_RETARD_MIN;
  return Math.max(0, arrivee - seuil);
}

async function chargerPointages(employeId, periode) {
  // Requiert la table Pointages en clé composite : employeId (PK) + date (SK)
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_POINTAGES,
    KeyConditionExpression: "employeId = :e AND begins_with(#d, :p)",
    ExpressionAttributeNames:  { "#d": "date" },
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

  // Chevauchement avec le mois : les dates sont au format YYYY-MM-DD,
  // la comparaison lexicographique est donc exacte.
  return (res.Items || []).filter((c) => {
    const valide = STATUTS_VALIDES.has(String(c.statut || "").toLowerCase());
    if (!valide) return false;
    return c.dateDebut <= dernierJour && c.dateFin >= premierJour;
  });
}

function calculerJoursConges(conges, premierJour, dernierJour) {
  const payes = new Set();
  const nonPayes = new Set();

  for (const conge of conges) {
    const debut = conge.dateDebut > premierJour ? conge.dateDebut : premierJour;
    const fin   = conge.dateFin   < dernierJour ? conge.dateFin   : dernierJour;

    const [ad, md, jd] = debut.split("-").map(Number);
    const [af, mf, jf] = fin.split("-").map(Number);
    const curseur = new Date(ad, md - 1, jd);
    const borne   = new Date(af, mf - 1, jf);

    while (curseur <= borne) {
      const jour = dateEnChaine(curseur);
      if (estOuvrable(jour) && !payes.has(jour) && !nonPayes.has(jour)) {
        if (TYPES_NON_PAYES.has(conge.type)) nonPayes.add(jour);
        else payes.add(jour);
      }
      curseur.setDate(curseur.getDate() + 1);
    }
  }

  return { joursPayes: payes.size, joursNonPayes: nonPayes.size, joursEnConge: new Set([...payes, ...nonPayes]) };
}

// ── Handler ────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || {});
    const user = event.user;

    const {
      employeId,
      mois,
      annee,
      tauxHoraire   = 15,
      heuresContrat = 8,
      regenerer     = false,
    } = body;

    if (!employeId || !mois || !annee) {
      return erreur("employeId, mois et annee sont requis", 400);
    }

    const moisNum  = parseInt(mois, 10);
    const anneeNum = parseInt(annee, 10);
    if (moisNum < 1 || moisNum > 12) return erreur("mois doit être entre 1 et 12", 400);

    const periode     = `${anneeNum}-${pad(moisNum)}`;
    const tousLesJours = joursDuMois(moisNum, anneeNum);
    const premierJour = tousLesJours[0];
    const dernierJour = tousLesJours[tousLesJours.length - 1];

    // 1. Employé
    const empRes = await docClient.send(new GetCommand({
      TableName: TABLE_EMPLOYES,
      Key: { id: employeId },
    }));
    if (!empRes.Item) return erreur("Employé introuvable", 404);
    const employe = empRes.Item;

    // 2. Pointages et congés
    const [pointages, conges] = await Promise.all([
      chargerPointages(employeId, periode),
      chargerConges(employeId, premierJour, dernierJour),
    ]);

    const { joursPayes, joursNonPayes, joursEnConge } = calculerJoursConges(conges, premierJour, dernierJour);

    // 3. Ventilation des heures
    let heuresNormales = 0, heuresSupp = 0, heuresWeekend = 0, heuresFeries = 0;
    let totalMinutesRetard = 0;
    const joursPresents = new Set();
    const lignes = [];

    for (const pointage of pointages) {
      const arrivee = partiesLocales(pointage.heureArrivee);
      const jour    = pointage.date || arrivee.date;
      const heures  = heuresTravaillees(pointage);
      if (heures === 0) continue;

      joursPresents.add(jour);

      const ferie   = estJourFerie(jour);
      const weekend = estWeekend(jour);
      const retard  = ferie || weekend ? 0 : minutesDeRetard(pointage.heureArrivee);
      totalMinutesRetard += retard;

      if (ferie)        heuresFeries  += heures;
      else if (weekend) heuresWeekend += heures;
      else {
        heuresNormales += Math.min(heures, heuresContrat);
        heuresSupp     += Math.max(0, heures - heuresContrat);
      }

      lignes.push({
        date:    jour,
        arrivee: arrivee.hhmm,
        depart:  pointage.heureDepart ? partiesLocales(pointage.heureDepart).hhmm : "--:--",
        heures:  heures.toFixed(2),
        type:    ferie ? "Jour férié" : weekend ? "Weekend" : retard > 0 ? "Retard" : "Normal",
        retard:  retard > 0 ? `${retard} min` : "—",
      });
    }

    lignes.sort((a, b) => a.date.localeCompare(b.date));

    // 4. Présences et absences
    const joursOuvrables = tousLesJours.filter(estOuvrable);
    const nbJoursOuvrables = joursOuvrables.length;

    const joursAbsents = joursOuvrables.filter(
      (j) => !joursPresents.has(j) && !joursEnConge.has(j)
    ).length;

    // 5. Salaire
    // Le salaire de base rémunère l'intégralité des heures contractuelles
    // du mois. Les heures normales ne sont donc PAS ajoutées en plus,
    // sinon elles seraient comptées deux fois.
    const salaireBase = tauxHoraire * heuresContrat * nbJoursOuvrables;

    const gains = {
      heuresSupp:    heuresSupp    * tauxHoraire * TAUX.heureSupplementaire,
      heuresWeekend: heuresWeekend * tauxHoraire * TAUX.heureWeekend,
      heuresFeries:  heuresFeries  * tauxHoraire * TAUX.heureJourFerie,
    };
    const totalGains = Object.values(gains).reduce((s, v) => s + v, 0);

    const retenueRetards  = (totalMinutesRetard / 60) * tauxHoraire * TAUX.penaliteRetard;
    const retenueAbsences = (joursAbsents + joursNonPayes) * heuresContrat * tauxHoraire;

    const totalBrut = Math.max(0, salaireBase + totalGains - retenueRetards - retenueAbsences);

    const cnss = totalBrut * 0.0918;
    const irpp = (totalBrut - cnss) * 0.045;

    const deductions = {
      retards:  retenueRetards,
      absences: retenueAbsences,
      cnss,
      irpp,
    };

    const salaireNet = Math.max(0, totalBrut - cnss - irpp);

    // 6. Identifiant déterministe : un seul bulletin par employé et par mois
    const id     = `${employeId}#${periode}`;
    const numero = `FACT-${periode}-${employeId.slice(0, 6).toUpperCase()}`;

    // 7. PDF sur S3
    const pdfBuffer = await genererPDF({
      employe, mois: moisNum, annee: anneeNum, numero,
      tauxHoraire, heuresContrat, nbJoursOuvrables,
      joursPresents: joursPresents.size, joursAbsents,
      joursCongesPayes: joursPayes, joursCongesNonPayes: joursNonPayes,
      heuresNormales, heuresSupp, heuresWeekend, heuresFeries,
      totalMinutesRetard, salaireBase, gains, deductions, totalBrut, salaireNet,
      lignes,
    });

    const pdfKey = `factures/${anneeNum}/${employeId}_${periode}.pdf`;
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: pdfKey,
      Body: pdfBuffer,
      ContentType: "application/pdf",
      ServerSideEncryption: "AES256",
      Metadata: { employeid: employeId, periode },
    }));

    // 8. Enregistrement
    const arrondi = (v) => Math.round(v * 1000) / 1000;

    const facture = {
      id,
      numero,
      employeId,
      periode,
      employeNom:     `${employe.prenom} ${employe.nom}`,
      employePoste:   employe.poste || "",
      mois:           moisNum,
      annee:          anneeNum,
      moisLabel:      `${MOIS_LABELS[moisNum]} ${anneeNum}`,
      tauxHoraire,
      heuresContrat,
      nbJoursOuvrables,
      joursPresents:  joursPresents.size,
      joursAbsents,
      congesPayes:    joursPayes,
      congesNonPayes: joursNonPayes,
      heuresNormales: arrondi(heuresNormales),
      heuresSupp:     arrondi(heuresSupp),
      heuresWeekend:  arrondi(heuresWeekend),
      heuresFeries:   arrondi(heuresFeries),
      minutesRetard:  totalMinutesRetard,
      gains:          Object.fromEntries(Object.entries(gains).map(([k, v]) => [k, arrondi(v)])),
      deductions:     Object.fromEntries(Object.entries(deductions).map(([k, v]) => [k, arrondi(v)])),
      salaireBase:    arrondi(salaireBase),
      totalBrut:      arrondi(totalBrut),
      salaireNet:     arrondi(salaireNet),
      pdfKey,
      statut:         "genere",
      genereLe:       new Date().toISOString(),
      genereParId:    user?.sub || user?.id || "system",
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
      message: `Fiche de paie générée : ${salaireNet.toFixed(3)} TND net`,
    }, 201);

  } catch (e) {
    console.error("Erreur génération facture:", e);
    return erreur("Erreur lors de la génération : " + e.message);
  }
};

// ── Rendu PDF ──────────────────────────────────────────────────────

function genererPDF(d) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const VERT = "#2d6a4f", BEIGE = "#f5f0e8", GRIS = "#6b7280", NOIR = "#1a1a1a", W = 515;

    doc.rect(40, 40, W, 80).fill(VERT);
    doc.fillColor("white").fontSize(20).font("Helvetica-Bold").text("TERRA HR", 55, 55);
    doc.fontSize(10).font("Helvetica").text("Bulletin de salaire", 55, 80);
    doc.fontSize(10)
      .text(`${MOIS_LABELS[d.mois]} ${d.annee}`, 400, 55, { align: "right", width: 150 })
      .text(`N° ${d.numero}`, 400, 72, { align: "right", width: 150 });

    doc.rect(40, 135, W, 70).fill(BEIGE);
    doc.fillColor(NOIR).fontSize(11).font("Helvetica-Bold")
      .text(`${d.employe.prenom} ${d.employe.nom}`, 55, 148);
    doc.fontSize(9).font("Helvetica").fillColor(GRIS)
      .text(`${d.employe.poste || ""}  ·  ${d.employe.departement || ""}`, 55, 163)
      .text(`Email : ${d.employe.email}`, 55, 177);
    doc.fontSize(9)
      .text(`Taux horaire : ${d.tauxHoraire} TND/h`, 380, 148, { align: "right", width: 170 })
      .text(`Contrat : ${d.heuresContrat} h/jour`, 380, 163, { align: "right", width: 170 })
      .text(`Jours ouvrables : ${d.nbJoursOuvrables}`, 380, 177, { align: "right", width: 170 });

    doc.fillColor(VERT).fontSize(10).font("Helvetica-Bold").text("RÉSUMÉ DES PRÉSENCES", 40, 222);
    doc.moveTo(40, 234).lineTo(555, 234).strokeColor(VERT).stroke();

    const presences = [
      ["Jours présents",            d.joursPresents,             "jours"],
      ["Jours absents",             d.joursAbsents,              "jours"],
      ["Congés payés",              d.joursCongesPayes,          "jours"],
      ["Congés non payés",          d.joursCongesNonPayes,       "jours"],
      ["Heures normales",           d.heuresNormales.toFixed(1), "h"],
      ["Heures supplémentaires",    d.heuresSupp.toFixed(1),     "h"],
      ["Heures weekend",            d.heuresWeekend.toFixed(1),  "h"],
      ["Heures jours fériés",       d.heuresFeries.toFixed(1),   "h"],
      ["Retard cumulé",             d.totalMinutesRetard,        "min"],
    ];

    let y = 242;
    presences.forEach(([label, val, unite], i) => {
      if (i % 2 === 0) doc.rect(40, y, W, 16).fill("#f9f7f4");
      doc.fillColor(NOIR).fontSize(9).font("Helvetica")
        .text(label, 55, y + 4)
        .text(`${val} ${unite}`, 450, y + 4, { align: "right", width: 100 });
      y += 16;
    });

    y += 12;
    doc.fillColor(VERT).fontSize(10).font("Helvetica-Bold").text("DÉTAIL DU SALAIRE", 40, y);
    y += 12;
    doc.moveTo(40, y).lineTo(555, y).strokeColor(VERT).stroke();
    y += 8;

    doc.fillColor(GRIS).fontSize(8).font("Helvetica-Bold").text("GAINS", 55, y);
    y += 12;

    const gainsListe = [
      ["Salaire de base",                     d.salaireBase],
      ["Heures supplémentaires (×1,5)",       d.gains.heuresSupp],
      ["Heures weekend (×1,75)",              d.gains.heuresWeekend],
      ["Heures jours fériés (×2)",            d.gains.heuresFeries],
    ];
    gainsListe.forEach(([label, val]) => {
      if (val > 0) {
        doc.fillColor(NOIR).fontSize(9).font("Helvetica")
          .text(label, 65, y)
          .text(`${val.toFixed(3)} TND`, 450, y, { align: "right", width: 100 });
        y += 14;
      }
    });

    doc.moveTo(300, y).lineTo(555, y).strokeColor("#e5e0d8").stroke();
    doc.fillColor(NOIR).fontSize(9).font("Helvetica-Bold")
      .text("Total brut", 55, y + 4)
      .text(`${d.totalBrut.toFixed(3)} TND`, 450, y + 4, { align: "right", width: 100 });
    y += 22;

    doc.fillColor(GRIS).fontSize(8).font("Helvetica-Bold").text("DÉDUCTIONS", 55, y);
    y += 12;

    const deductionsListe = [
      ["Retards",                       d.deductions.retards],
      ["Absences et congés non payés",  d.deductions.absences],
      ["CNSS (9,18 %)",                 d.deductions.cnss],
      ["IRPP (4,5 %)",                  d.deductions.irpp],
    ];
    deductionsListe.forEach(([label, val]) => {
      if (val > 0) {
        doc.fillColor("#dc2626").fontSize(9).font("Helvetica")
          .text(label, 65, y)
          .text(`-${val.toFixed(3)} TND`, 450, y, { align: "right", width: 100 });
        y += 14;
      }
    });

    y += 8;
    doc.rect(40, y, W, 28).fill(VERT);
    doc.fillColor("white").fontSize(12).font("Helvetica-Bold")
      .text("NET À PAYER", 55, y + 8)
      .text(`${d.salaireNet.toFixed(3)} TND`, 350, y + 8, { align: "right", width: 200 });

    if (d.lignes.length > 0) {
      doc.addPage();
      doc.rect(40, 40, W, 40).fill(VERT);
      doc.fillColor("white").fontSize(14).font("Helvetica-Bold")
        .text("HISTORIQUE DES POINTAGES", 55, 52);

      y = 100;
      const cols = [40, 130, 210, 290, 360, 450];
      const entetes = ["Date", "Arrivée", "Départ", "Durée", "Type", "Retard"];
      doc.rect(40, y, W, 18).fill(BEIGE);
      entetes.forEach((h, i) => {
        doc.fillColor(NOIR).fontSize(8).font("Helvetica-Bold").text(h, cols[i] + 5, y + 5);
      });
      y += 18;

      d.lignes.forEach((l, i) => {
        if (y > 750) { doc.addPage(); y = 60; }
        if (i % 2 === 0) doc.rect(40, y, W, 16).fill("#f9f7f4");
        doc.fillColor(NOIR).fontSize(8).font("Helvetica")
          .text(l.date,    cols[0] + 5, y + 4)
          .text(l.arrivee, cols[1] + 5, y + 4)
          .text(l.depart,  cols[2] + 5, y + 4)
          .text(`${l.heures} h`, cols[3] + 5, y + 4);

        const couleur = l.type === "Jour férié" ? "#dc2626"
                      : l.type === "Weekend"    ? "#8b5cf6"
                      : l.type === "Retard"     ? "#f59e0b"
                      : VERT;
        doc.fillColor(couleur).text(l.type, cols[4] + 5, y + 4);
        doc.fillColor(l.retard === "—" ? GRIS : "#dc2626").text(l.retard, cols[5] + 5, y + 4);
        y += 16;
      });
    }

    doc.end();
  });
}