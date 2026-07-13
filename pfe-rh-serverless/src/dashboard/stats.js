const { ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");

exports.handler = async (event) => {
  try {
    // Récupérer toutes les données en parallèle
    const [employes, candidats, pointages, evenements, factures] = await Promise.all([
      docClient.send(new ScanCommand({ TableName: process.env.TABLE_EMPLOYES })),
      docClient.send(new ScanCommand({ TableName: process.env.TABLE_CANDIDATS })),
      docClient.send(new ScanCommand({ TableName: process.env.TABLE_POINTAGES })),
      docClient.send(new ScanCommand({ TableName: process.env.TABLE_EVENEMENTS })),
      docClient.send(new ScanCommand({ TableName: process.env.TABLE_FACTURES })),
    ]);

    const today = new Date().toISOString().split("T")[0];
    const moisActuel = today.slice(0, 7);

    // ── Stats Employés ───────────────────────
    const employesList = employes.Items;
    const parDepartement = {};
    employes.Items.forEach(e => {
      parDepartement[e.departement] = (parDepartement[e.departement] || 0) + 1;
    });

    // ── Stats Candidats ──────────────────────
    const candidatsList = candidats.Items;
    const parStatut = {};
    candidatsList.forEach(c => {
      parStatut[c.statut] = (parStatut[c.statut] || 0) + 1;
    });

    // ── Stats Pointages aujourd'hui ──────────
    const pointagesAujourdhui = pointages.Items.filter(p => p.date === today);
    const pointagesTermines   = pointagesAujourdhui.filter(p => p.statut === "TERMINE");
    const moyenneDuree = pointagesTermines.length > 0
      ? Math.round(pointagesTermines.reduce((s, p) => s + (p.dureeMinutes || 0), 0) / pointagesTermines.length)
      : 0;

    // ── Stats Événements ce mois ─────────────
    const evenementsMois = evenements.Items.filter(e =>
      e.dateDebut?.startsWith(moisActuel)
    );

    // ── Stats Factures ce mois ───────────────
    const facturesMois   = factures.Items.filter(f => f.mois === new Date().getMonth() + 1 && f.annee === new Date().getFullYear());
    const totalSalairesMois = facturesMois.reduce((s, f) => s + (f.salaireNet || 0), 0);

    return succes({
      genere_le: new Date().toISOString(),

      employes: {
        total:        employes.Count,
        actifs:       employes.Items.filter(e => e.statut === "actif").length,
        archives:     employes.Items.filter(e => e.statut === "archive").length,
        parDepartement,
      },

      candidats: {
        total:        candidats.Count,
        parStatut,
        soumis:       parStatut["SOUMIS"]       || 0,
        preselection: parStatut["PRESELECTION"] || 0,
        entretien:    parStatut["ENTRETIEN"]    || 0,
        offre:        parStatut["OFFRE"]        || 0,
        embauche:     parStatut["EMBAUCHE"]     || 0,
        refuse:       parStatut["REFUSE"]       || 0,
      },

      pointages_aujourdhui: {
        total:        pointagesAujourdhui.length,
        en_cours:     pointagesAujourdhui.filter(p => p.statut === "EN_COURS").length,
        termines:     pointagesTermines.length,
        moyenne_duree: `${Math.floor(moyenneDuree / 60)}h${(moyenneDuree % 60).toString().padStart(2, "0")}`,
      },

      evenements_mois: {
        total:      evenementsMois.length,
        reunions:   evenementsMois.filter(e => e.type === "REUNION").length,
        conges:     evenementsMois.filter(e => e.type === "CONGE").length,
        formations: evenementsMois.filter(e => e.type === "FORMATION").length,
      },

      factures_mois: {
        total:         facturesMois.length,
        total_salaires: totalSalairesMois.toFixed(3) + " TND",
      },
    });

  } catch (e) {
    console.error("Erreur dashboard stats:", e);
    return erreur("Impossible de charger le dashboard");
  }
};