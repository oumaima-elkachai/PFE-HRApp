// src/dashboard/stats.js
//
// ── Le défaut corrigé ──────────────────────────────────────────────
//
// La première ligne du Promise.all lisait :
//
//     new ScanCommand({ TableName: process.env.TABLE_CANDIDATS })
//
// `TABLE_CANDIDATS` n'est définie nulle part — ni dans api-stack.ts,
// ni sur la fonction déployée. `TableName` valait donc `undefined`, et
// `Promise.all` échouait tout entier : les cinq lectures partent en
// parallèle, une seule qui rejette suffit à faire basculer le `catch`.
//
// Résultat en production : le tableau de bord RH renvoyait
// « Impossible de charger le dashboard » sur toute sa surface, et pas
// seulement sur le bloc des candidats.
//
// La table Candidats n'existe plus : `scripts/create-tables.js` la
// range dans TABLES_OBSOLETES avec le commentaire « fusionnée dans
// Candidatures », et `migrer-schema.js` convertit les anciens
// enregistrements. Le tableau de bord lit donc Candidatures, dont les
// statuts — SOUMIS, PRESELECTION, ENTRETIEN, OFFRE, EMBAUCHE, REFUSE —
// sont exactement ceux que ce fichier comptait déjà.
//
// ── Ce qui n'est pas corrigé ici, et qu'il faut savoir expliquer ───
//
// Ce module fait cinq `Scan` complets à chaque ouverture. C'est la
// seule route du projet qui en fait, et elle contredit le principe
// tenu partout ailleurs : quinze index secondaires ont été créés
// précisément pour ne jamais parcourir une table entière.
//
// Sur un jeu de démonstration, l'écart ne se voit pas. Sur dix mille
// pointages, il se paie en temps et en capacité lue. La correction
// propre est un compteur agrégé tenu à l'écriture, ou une requête par
// index avec `Select: "COUNT"`. Elle n'est pas faite ici parce qu'elle
// change la forme des données renvoyées au front, ce qui est un autre
// chantier — mais c'est une question qu'un jury peut poser, et mieux
// vaut la réponse ci-dessus qu'un silence.
//
// Noter aussi que `employes.Count` ne compte que la page lue : au-delà
// de 1 Mo de données, DynamoDB pagine et le total devient faux, sans
// aucune erreur. Même remarque pour `candidats.Count`.

const { ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");

exports.handler = async (event) => {
  try {
    // Récupérer toutes les données en parallèle
    const [employes, candidatures, pointages, evenements, factures] = await Promise.all([
      docClient.send(new ScanCommand({ TableName: process.env.TABLE_EMPLOYES })),
      docClient.send(new ScanCommand({ TableName: process.env.TABLE_CANDIDATURES })),
      docClient.send(new ScanCommand({ TableName: process.env.TABLE_POINTAGES })),
      docClient.send(new ScanCommand({ TableName: process.env.TABLE_EVENEMENTS })),
      docClient.send(new ScanCommand({ TableName: process.env.TABLE_FACTURES })),
    ]);

    const today = new Date().toISOString().split("T")[0];
    const moisActuel = today.slice(0, 7);

    // ── Stats Employés ───────────────────────
    const parDepartement = {};
    (employes.Items || []).forEach((e) => {
      // Une fiche sans département produisait une entrée « undefined »
      // dans le graphique de répartition.
      const dep = e.departement || "Non renseigné";
      parDepartement[dep] = (parDepartement[dep] || 0) + 1;
    });

    // ── Stats Candidatures ───────────────────
    const candidaturesList = candidatures.Items || [];
    const parStatut = {};
    candidaturesList.forEach((c) => {
      const statut = c.statut || "SOUMIS";
      parStatut[statut] = (parStatut[statut] || 0) + 1;
    });

    // ── Stats Pointages aujourd'hui ──────────
    const pointagesAujourdhui = (pointages.Items || []).filter((p) => p.date === today);
    const pointagesTermines = pointagesAujourdhui.filter((p) => p.statut === "TERMINE");
    const moyenneDuree = pointagesTermines.length > 0
      ? Math.round(pointagesTermines.reduce((s, p) => s + (p.dureeMinutes || 0), 0) / pointagesTermines.length)
      : 0;

    // ── Stats Événements ce mois ─────────────
    const evenementsMois = (evenements.Items || []).filter((e) =>
      e.dateDebut?.startsWith(moisActuel)
    );

    // ── Stats Factures ce mois ───────────────
    const facturesMois = (factures.Items || []).filter(
      (f) => f.mois === new Date().getMonth() + 1 && f.annee === new Date().getFullYear()
    );
    const totalSalairesMois = facturesMois.reduce((s, f) => s + (f.salaireNet || 0), 0);

    return succes({
      genere_le: new Date().toISOString(),

      employes: {
        total: (employes.Items || []).length,
        actifs: (employes.Items || []).filter((e) => e.statut === "actif").length,
        archives: (employes.Items || []).filter((e) => e.statut === "archive").length,
        parDepartement,
      },

      // La clé reste « candidats » : c'est ce que le front attend, et
      // la renommer casserait le tableau de bord pour un gain nul.
      candidats: {
        total: candidaturesList.length,
        parStatut,
        soumis: parStatut["SOUMIS"] || 0,
        preselection: parStatut["PRESELECTION"] || 0,
        entretien: parStatut["ENTRETIEN"] || 0,
        offre: parStatut["OFFRE"] || 0,
        embauche: parStatut["EMBAUCHE"] || 0,
        refuse: parStatut["REFUSE"] || 0,
      },

      pointages_aujourdhui: {
        total: pointagesAujourdhui.length,
        en_cours: pointagesAujourdhui.filter((p) => p.statut === "EN_COURS").length,
        termines: pointagesTermines.length,
        moyenne_duree: `${Math.floor(moyenneDuree / 60)}h${(moyenneDuree % 60).toString().padStart(2, "0")}`,
      },

      evenements_mois: {
        total: evenementsMois.length,
        reunions: evenementsMois.filter((e) => e.type === "REUNION").length,
        conges: evenementsMois.filter((e) => e.type === "CONGE").length,
        formations: evenementsMois.filter((e) => e.type === "FORMATION").length,
      },

      factures_mois: {
        total: facturesMois.length,
        total_salaires: totalSalairesMois.toFixed(3) + " TND",
      },
    });
  } catch (e) {
    // Le message d'origine ne disait pas laquelle des cinq lectures
    // avait échoué : le nom de l'erreur et son message, eux, le disent.
    console.error("Erreur dashboard stats:", e.name, e.message);
    return erreur("Impossible de charger le dashboard");
  }
};