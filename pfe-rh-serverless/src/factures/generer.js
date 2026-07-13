const { PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur, nonTrouve } = require("../utils/reponse");
const { v4: uuidv4 } = require("uuid");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const os = require("os");                   

exports.handler = async (event) => {
  try {
    const {
      employeId,
      mois,
      annee,
      salaireBase,
      primes,
      deductions,
      heuresSupplementaires,
    } = JSON.parse(event.body || "{}");

    if (!employeId || !mois || !annee || !salaireBase) {
      return erreur("Champs requis : employeId, mois, annee, salaireBase", 400);
    }

    // Récupérer l'employé
    const employeResult = await docClient.send(new ScanCommand({
      TableName: process.env.TABLE_EMPLOYES,
      FilterExpression: "id = :id",
      ExpressionAttributeValues: { ":id": employeId },
    }));

    if (employeResult.Count === 0) return nonTrouve("Employe");
    const employe = employeResult.Items[0];

    // Calculer les montants
    const totalPrimes      = (primes || []).reduce((s, p) => s + p.montant, 0);
    const totalDeductions  = (deductions || []).reduce((s, d) => s + d.montant, 0);
    const heuresSup        = heuresSupplementaires || 0;
    const montantHeuresSup = heuresSup * (salaireBase / 160) * 1.25;
    const salaireNet       = salaireBase + totalPrimes + montantHeuresSup - totalDeductions;

    const moisNoms = ["Janvier","Fevrier","Mars","Avril","Mai","Juin","Juillet","Aout","Septembre","Octobre","Novembre","Decembre"];

    const facture = {
      id:            uuidv4(),
      numero:        `FACT-${annee}-${String(mois).padStart(2,"0")}-${uuidv4().slice(0,6).toUpperCase()}`,
      employeId,
      employeNom:    `${employe.prenom} ${employe.nom}`,
      employePoste:  employe.poste,
      employeDept:   employe.departement,
      mois,
      annee,
      moisLabel:     `${moisNoms[mois - 1]} ${annee}`,
      salaireBase,
      primes:        primes || [],
      deductions:    deductions || [],
      heuresSupplementaires: heuresSup,
      montantHeuresSup,
      totalPrimes,
      totalDeductions,
      salaireNet,
      statut:        "GENERE",
      genereLe:      new Date().toISOString(),
      generePar:     event.user?.email,
    };

    // Générer le PDF
    const os = require("os");
    const pdfPath = path.join(os.tmpdir(), `${facture.numero}.pdf`);
    await genererPDF(facture, pdfPath);

    // Lire le PDF en base64
    const pdfBase64 = fs.readFileSync(pdfPath).toString("base64");

    // Sauvegarder en DynamoDB
    await docClient.send(new PutCommand({
      TableName: process.env.TABLE_FACTURES,
      Item:      { ...facture, pdfBase64 },
    }));

    // Nettoyer le fichier temp
    fs.unlinkSync(pdfPath);

    return succes({
      facture: {
        ...facture,
        pdfBase64,
        message: "Facture generee avec succes",
      },
    }, 201);

  } catch (e) {
    console.error("Erreur generer facture:", e);
    return erreur("Impossible de generer la facture");
  }
};

function genererPDF(facture, outputPath) {
  return new Promise((resolve, reject) => {
    const doc  = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // ── En-tête ──────────────────────────────
    doc.fontSize(20).font("Helvetica-Bold")
       .text("FICHE DE PAIE", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(12).font("Helvetica")
       .text(`Periode : ${facture.moisLabel}`, { align: "center" });
    doc.moveDown(1);

    // Ligne séparatrice
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);

    // ── Informations employé ─────────────────
    doc.fontSize(13).font("Helvetica-Bold").text("Informations Employe");
    doc.moveDown(0.5);
    doc.fontSize(11).font("Helvetica");
    doc.text(`Nom         : ${facture.employeNom}`);
    doc.text(`Poste       : ${facture.employePoste}`);
    doc.text(`Departement : ${facture.employeDept}`);
    doc.text(`Reference   : ${facture.numero}`);
    doc.moveDown(1);

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);

    // ── Détail salaire ───────────────────────
    doc.fontSize(13).font("Helvetica-Bold").text("Detail du Salaire");
    doc.moveDown(0.5);
    doc.fontSize(11).font("Helvetica");

    // Salaire de base
    doc.text(`Salaire de base                : ${facture.salaireBase.toFixed(3)} TND`);

    // Primes
    if (facture.primes.length > 0) {
      doc.moveDown(0.3);
      doc.font("Helvetica-Bold").text("Primes :");
      doc.font("Helvetica");
      facture.primes.forEach(p => {
        doc.text(`  + ${p.libelle.padEnd(25)} : ${p.montant.toFixed(3)} TND`);
      });
    }

    // Heures supplémentaires
    if (facture.heuresSupplementaires > 0) {
      doc.text(`  + Heures sup (${facture.heuresSupplementaires}h)     : ${facture.montantHeuresSup.toFixed(3)} TND`);
    }

    // Déductions
    if (facture.deductions.length > 0) {
      doc.moveDown(0.3);
      doc.font("Helvetica-Bold").text("Deductions :");
      doc.font("Helvetica");
      facture.deductions.forEach(d => {
        doc.text(`  - ${d.libelle.padEnd(25)} : ${d.montant.toFixed(3)} TND`);
      });
    }

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // ── Total net ────────────────────────────
    doc.fontSize(14).font("Helvetica-Bold")
       .text(`SALAIRE NET : ${facture.salaireNet.toFixed(3)} TND`, { align: "right" });

    doc.moveDown(2);

    // ── Pied de page ─────────────────────────
    doc.fontSize(9).font("Helvetica").fillColor("gray")
       .text(`Document genere le ${new Date().toLocaleDateString("fr-TN")}`, { align: "center" });
    doc.text(`Reference : ${facture.numero}`, { align: "center" });

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
  
}