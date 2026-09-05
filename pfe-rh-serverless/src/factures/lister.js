const { ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");

exports.handler = async (event) => {
  try {
    const user   = event.user;
    const params = event.queryStringParameters || {};

    const resultat = await docClient.send(new ScanCommand({
      TableName: process.env.TABLE_FACTURES,
    }));

    let factures = resultat.Items.map(f => {
      const { pdfBase64, ...sansPdf } = f;
      return sansPdf;
    });

    // Employé voit seulement ses factures
    if (user.role === "EMPLOYE") {
      factures = factures.filter(f => f.employeId === user.sub);
    }

    // Filtrer par employé (RH)
    if (params.employeId) {
      factures = factures.filter(f => f.employeId === params.employeId);
    }

    // Filtrer par année
    if (params.annee) {
      factures = factures.filter(f => f.annee === parseInt(params.annee));
    }

    // Trier par date décroissante
    factures.sort((a, b) => new Date(b.genereLe) - new Date(a.genereLe));

    const totalNet = factures.reduce((s, f) => s + (f.salaireNet || 0), 0);

    return succes({
      factures,
      total: factures.length,
      totalNet: totalNet.toFixed(3),
    });

  } catch (e) {
    console.error("Erreur lister factures:", e);
    return erreur("Impossible de recuperer les factures");
  }
};