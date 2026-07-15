const { ScanCommand, PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const PDFDocument = require("pdfkit");
const { v4: uuidv4 } = require("uuid");

// Jours fériés Tunisie 2026
const JOURS_FERIES_2026 = [
  "2026-01-01", // Nouvel An
  "2026-03-20", // Fête de l'Indépendance
  "2026-04-09", // Martyr Day
  "2026-05-01", // Fête du Travail
  "2026-06-01", // Ramadan
  "2026-07-25", // Fête de la République
  "2026-08-13", // Fête de la Femme
  "2026-10-15", // Fête de l'Évacuation
];

// Taux par défaut
const TAUX = {
  heureNormale:       1.0,   // 100% du taux horaire
  heureSupplementaire:1.5,   // 150%
  heureWeekend:       1.75,  // 175%
  heureJourFerie:     2.0,   // 200%
  heureRetard:        0.8,   // 80% (retard > 15 min)
};

function estWeekend(dateStr) {
  const jour = new Date(dateStr).getDay();
  return jour === 0 || jour === 6;
}

function estJourFerie(dateStr) {
  return JOURS_FERIES_2026.includes(dateStr.split("T")[0]);
}

function estRetard(heureArrivee, heureNormale = "08:30") {
  const [hA, mA] = new Date(heureArrivee).toTimeString().split(":").map(Number);
  const [hN, mN] = heureNormale.split(":").map(Number);
  const minutesArrivee = hA * 60 + mA;
  const minutesNormale = hN * 60 + mN;
  return minutesArrivee > minutesNormale + 15; // tolérance 15 min
}

function calculerHeuresJour(pointage) {
  if (!pointage.heureDepart || !pointage.heureArrivee) return 0;
  const diff = new Date(pointage.heureDepart) - new Date(pointage.heureArrivee);
  return diff / (1000 * 60 * 60); // en heures
}

exports.handler = async (event) => {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {};
    const user = event.user;

    const {
      employeId,
      mois,
      annee,
      tauxHoraire = 15, // TND/heure par défaut
      heuresContrat = 8, // heures/jour contrat
    } = body;

    if (!employeId || !mois || !annee) {
      return erreur("employeId, mois et annee sont requis", 400);
    }

    // 1. Récupérer l'employé
    const empRes = await docClient.send(new GetCommand({
      TableName: process.env.TABLE_EMPLOYES,
      Key: { id: employeId },
    }));
    if (!empRes.Item) return erreur("Employé introuvable", 404);
    const employe = empRes.Item;

    // 2. Récupérer les pointages du mois
    const scanRes = await docClient.send(new ScanCommand({
      TableName: process.env.TABLE_POINTAGES || "Pointages-local",
      FilterExpression: "employeId = :eid",
      ExpressionAttributeValues: { ":eid": employeId },
    }));

    const tousPointages = scanRes.Items || [];
    const pointagesMois = tousPointages.filter(p => {
      const d = new Date(p.date || p.heureArrivee);
      return d.getMonth() + 1 === parseInt(mois) && d.getFullYear() === parseInt(annee);
    });

    // 3. Calculer les heures par type
    let heuresNormales      = 0;
    let heuresSupp          = 0;
    let heuresWeekend       = 0;
    let heuresFeries        = 0;
    let minutesRetard       = 0;
    let joursPresents       = 0;
    let joursAbsents        = 0;
    const lignesPointage    = [];

    for (const p of pointagesMois) {
      if (p.statut !== "TERMINE") continue;

      const dateStr  = (p.date || p.heureArrivee || "").split("T")[0];
      const heures   = calculerHeuresJour(p);
      const retard   = estRetard(p.heureArrivee);
      const weekend  = estWeekend(dateStr);
      const ferie    = estJourFerie(dateStr);

      joursPresents++;

      // Heures supplémentaires = au-delà de heuresContrat
      const heuresNorm  = Math.min(heures, heuresContrat);
      const heuresSup   = Math.max(0, heures - heuresContrat);

      if (ferie) {
        heuresFeries += heures;
      } else if (weekend) {
        heuresWeekend += heures;
      } else {
        heuresNormales += heuresNorm;
        heuresSupp     += heuresSup;
      }

      if (retard) {
        const minRet = Math.max(0, (new Date(p.heureArrivee).getMinutes()) - 30);
        minutesRetard += minRet;
      }

      lignesPointage.push({
        date:       dateStr,
        arrivee:    new Date(p.heureArrivee).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        depart:     p.heureDepart ? new Date(p.heureDepart).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "--:--",
        heures:     heures.toFixed(2),
        type:       ferie ? "Jour Férié" : weekend ? "Weekend" : retard ? "Retard" : "Normal",
        retard:     retard ? "Oui" : "Non",
      });
    }

    // Jours ouvrables du mois
    const nbJoursOuvrables = getNbJoursOuvrables(mois, annee);
    joursAbsents = Math.max(0, nbJoursOuvrables - joursPresents);

    // 4. Calcul salaire
    const salaireBase = tauxHoraire * heuresContrat * nbJoursOuvrables;

    const gains = {
      heuresNormales:      heuresNormales  * tauxHoraire * TAUX.heureNormale,
      heuresSupp:          heuresSupp      * tauxHoraire * TAUX.heureSupplementaire,
      heuresWeekend:       heuresWeekend   * tauxHoraire * TAUX.heureWeekend,
      heuresFeries:        heuresFeries    * tauxHoraire * TAUX.heureJourFerie,
    };

    const deductions = {
      retards:   (minutesRetard / 60) * tauxHoraire * (1 - TAUX.heureRetard),
      absences:  joursAbsents * heuresContrat * tauxHoraire,
      cnss:      0, // calculé après
      irpp:      0,
    };

    const totalBrut = Object.values(gains).reduce((s, v) => s + v, 0);
    deductions.cnss = totalBrut * 0.0918;
    deductions.irpp = totalBrut * 0.045;
    const totalDeductions = Object.values(deductions).reduce((s, v) => s + v, 0);
    const salaireNet = Math.max(0, totalBrut - totalDeductions);

    // 5. Générer le PDF
    const pdfBase64 = await genererPDF({
      employe, mois, annee, tauxHoraire, heuresContrat,
      gains, deductions, salaireBase, totalBrut, salaireNet,
      lignesPointage, joursPresents, joursAbsents,
      heuresNormales, heuresSupp, heuresWeekend, heuresFeries,
      minutesRetard, nbJoursOuvrables,
    });

    // 6. Sauvegarder la facture
    const moisLabels = ["","Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
    const numero = `FACT-${annee}-${String(mois).padStart(2,"0")}-${uuidv4().slice(0,6).toUpperCase()}`;

    const facture = {
      id:              uuidv4(),
      numero,
      employeId,
      employeNom:      `${employe.prenom} ${employe.nom}`,
      employePoste:    employe.poste || "",
      mois:            parseInt(mois),
      annee:           parseInt(annee),
      moisLabel:       `${moisLabels[parseInt(mois)]} ${annee}`,
      tauxHoraire,
      heuresContrat,
      nbJoursOuvrables,
      joursPresents,
      joursAbsents,
      heuresNormales:   Math.round(heuresNormales  * 100) / 100,
      heuresSupp:       Math.round(heuresSupp       * 100) / 100,
      heuresWeekend:    Math.round(heuresWeekend    * 100) / 100,
      heuresFeries:     Math.round(heuresFeries     * 100) / 100,
      minutesRetard,
      gains,
      deductions,
      salaireBase:      Math.round(salaireBase      * 1000) / 1000,
      totalBrut:        Math.round(totalBrut        * 1000) / 1000,
      salaireNet:       Math.round(salaireNet        * 1000) / 1000,
      statut:           "genere",
      pdfBase64,
      genereLe:         new Date().toISOString(),
      genereParId:      user?.sub || user?.id || "system",
    };

    await docClient.send(new PutCommand({
      TableName: process.env.TABLE_FACTURES,
      Item: facture,
    }));

    return succes({
      facture: { ...facture, pdfBase64: undefined },
      message: `Fiche de paie générée: ${salaireNet.toFixed(3)} TND net`,
    }, 201);

  } catch (e) {
    console.error("Erreur génération facture:", e);
    return erreur("Erreur lors de la génération: " + e.message);
  }
};

function getNbJoursOuvrables(mois, annee) {
  const date = new Date(annee, mois - 1, 1);
  let count = 0;
  while (date.getMonth() === mois - 1) {
    const jour = date.getDay();
    const dateStr = date.toISOString().split("T")[0];
    if (jour !== 0 && jour !== 6 && !JOURS_FERIES_2026.includes(dateStr)) {
      count++;
    }
    date.setDate(date.getDate() + 1);
  }
  return count;
}

async function genererPDF(data) {
  const {
    employe, mois, annee, tauxHoraire, heuresContrat,
    gains, deductions, salaireBase, totalBrut, salaireNet,
    lignesPointage, joursPresents, joursAbsents,
    heuresNormales, heuresSupp, heuresWeekend, heuresFeries,
    minutesRetard, nbJoursOuvrables,
  } = data;

  const moisLabels = ["","Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 40, size: "A4" });
    const chunks = [];
    doc.on("data",  c  => chunks.push(c));
    doc.on("end",   () => resolve(Buffer.concat(chunks).toString("base64")));
    doc.on("error", reject);

    const VERT    = "#2d6a4f";
    const BEIGE   = "#f5f0e8";
    const GRIS    = "#6b7280";
    const NOIR    = "#1a1a1a";
    const W       = 515;

    // ── En-tête ──────────────────────────────────
    doc.rect(40, 40, W, 80).fill(VERT);
    doc.fillColor("white").fontSize(20).font("Helvetica-Bold")
       .text("TERRA HR", 55, 55);
    doc.fontSize(10).font("Helvetica")
       .text("Bulletin de Salaire", 55, 80);
    doc.fontSize(10)
       .text(`${moisLabels[mois]} ${annee}`, 400, 55, { align: "right", width: 150 })
       .text(`N° FACT-${annee}-${String(mois).padStart(2,"0")}`, 400, 72, { align: "right", width: 150 });

    // ── Infos employé ─────────────────────────────
    doc.rect(40, 135, W, 70).fill(BEIGE);
    doc.fillColor(NOIR).fontSize(11).font("Helvetica-Bold")
       .text(`${employe.prenom} ${employe.nom}`, 55, 148);
    doc.fontSize(9).font("Helvetica").fillColor(GRIS)
       .text(`${employe.poste || ""}  ·  ${employe.departement || ""}`, 55, 163)
       .text(`Email: ${employe.email}`, 55, 177);
    doc.fillColor(GRIS).fontSize(9)
       .text(`Taux horaire: ${tauxHoraire} TND/h`, 380, 148, { align: "right", width: 170 })
       .text(`Heures contrat: ${heuresContrat}h/jour`, 380, 163, { align: "right", width: 170 })
       .text(`Jours ouvrables: ${nbJoursOuvrables}`, 380, 177, { align: "right", width: 170 });

    // ── Résumé présences ──────────────────────────
    doc.fillColor(VERT).fontSize(10).font("Helvetica-Bold")
       .text("RÉSUMÉ DES PRÉSENCES", 40, 222);
    doc.moveTo(40, 234).lineTo(555, 234).strokeColor(VERT).stroke();

    const presences = [
      ["Jours présents",      joursPresents,                "jours"],
      ["Jours absents",       joursAbsents,                 "jours"],
      ["Heures normales",     heuresNormales.toFixed(1),    "h"],
      ["Heures supp (×1.5)", heuresSupp.toFixed(1),        "h"],
      ["Heures weekend (×1.75)", heuresWeekend.toFixed(1), "h"],
      ["Heures fériées (×2)", heuresFeries.toFixed(1),     "h"],
      ["Minutes de retard",   minutesRetard,                "min"],
    ];

    let y = 242;
    presences.forEach(([label, val, unit], i) => {
      if (i % 2 === 0) doc.rect(40, y, W, 16).fill("#f9f7f4");
      doc.fillColor(NOIR).fontSize(9).font("Helvetica")
         .text(label,           55, y + 4)
         .text(`${val} ${unit}`, 450, y + 4, { align: "right", width: 100 });
      y += 16;
    });

    // ── Bulletin de paie ──────────────────────────
    y += 12;
    doc.fillColor(VERT).fontSize(10).font("Helvetica-Bold")
       .text("DÉTAIL DU SALAIRE", 40, y);
    y += 12;
    doc.moveTo(40, y).lineTo(555, y).strokeColor(VERT).stroke();
    y += 8;

    // Gains
    doc.fillColor(GRIS).fontSize(8).font("Helvetica-Bold")
       .text("GAINS", 55, y);
    y += 12;

    const gainsList = [
      ["Heures normales",     gains.heuresNormales],
      ["Heures supplémentaires (×1.5)", gains.heuresSupp],
      ["Heures weekend (×1.75)",       gains.heuresWeekend],
      ["Heures jours fériés (×2)",     gains.heuresFeries],
    ];
    gainsList.forEach(([label, val]) => {
      if (val > 0) {
        doc.fillColor(NOIR).fontSize(9).font("Helvetica")
           .text(label,                  65, y)
           .text(`${val.toFixed(3)} TND`, 450, y, { align: "right", width: 100 });
        y += 14;
      }
    });

    doc.moveTo(300, y).lineTo(555, y).strokeColor("#e5e0d8").stroke();
    doc.fillColor(NOIR).fontSize(9).font("Helvetica-Bold")
       .text("Total Brut",               55, y + 4)
       .text(`${totalBrut.toFixed(3)} TND`, 450, y + 4, { align: "right", width: 100 });
    y += 20;

    // Déductions
    doc.fillColor(GRIS).fontSize(8).font("Helvetica-Bold")
       .text("DÉDUCTIONS", 55, y);
    y += 12;

    const deductionsList = [
      ["Retards",      deductions.retards],
      ["Absences",     deductions.absences],
      ["CNSS (9.18%)", deductions.cnss],
      ["IRPP (4.5%)",  deductions.irpp],
    ];
    deductionsList.forEach(([label, val]) => {
      if (val > 0) {
        doc.fillColor("#dc2626").fontSize(9).font("Helvetica")
           .text(label,                     65, y)
           .text(`-${val.toFixed(3)} TND`,  450, y, { align: "right", width: 100 });
        y += 14;
      }
    });

    // Net à payer
    y += 8;
    doc.rect(40, y, W, 28).fill(VERT);
    doc.fillColor("white").fontSize(12).font("Helvetica-Bold")
       .text("NET À PAYER",               55, y + 8)
       .text(`${salaireNet.toFixed(3)} TND`, 350, y + 8, { align: "right", width: 200 });
    y += 40;

    // ── Historique pointages ──────────────────────
    if (lignesPointage.length > 0) {
      doc.addPage();
      doc.rect(40, 40, W, 40).fill(VERT);
      doc.fillColor("white").fontSize(14).font("Helvetica-Bold")
         .text("HISTORIQUE DES POINTAGES", 55, 52);

      y = 100;
      // En-tête tableau
      const cols = [40, 120, 200, 280, 340, 410];
      const headers = ["Date","Arrivée","Départ","Durée","Type","Retard"];
      doc.rect(40, y, W, 18).fill(BEIGE);
      headers.forEach((h, i) => {
        doc.fillColor(NOIR).fontSize(8).font("Helvetica-Bold")
           .text(h, cols[i] + 5, y + 5);
      });
      y += 18;

      lignesPointage.forEach((p, idx) => {
        if (idx % 2 === 0) doc.rect(40, y, W, 16).fill("#f9f7f4");
        doc.fillColor(NOIR).fontSize(8).font("Helvetica")
           .text(p.date,    cols[0] + 5, y + 4)
           .text(p.arrivee, cols[1] + 5, y + 4)
           .text(p.depart,  cols[2] + 5, y + 4)
           .text(`${p.heures}h`, cols[3] + 5, y + 4);
        const typeColor = p.type === "Jour Férié" ? "#dc2626"
                        : p.type === "Weekend"    ? "#8b5cf6"
                        : p.type === "Retard"     ? "#f59e0b"
                        : VERT;
        doc.fillColor(typeColor)
           .text(p.type,    cols[4] + 5, y + 4);
        doc.fillColor(p.retard === "Oui" ? "#dc2626" : GRIS)
           .text(p.retard,  cols[5] + 5, y + 4);
        y += 16;
        if (y > 750) { doc.addPage(); y = 60; }
      });
    }

    doc.end();
  });
}