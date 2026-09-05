// scripts/migrer-schema.js
//
// Migration des données existantes vers le nouveau schéma.
//
//   node scripts/migrer-schema.js --sauvegarder   étape 1 : export JSON
//   node scripts/migrer-schema.js --analyser      étape 2 : simulation, rien n'est écrit
//   node scripts/migrer-schema.js --restaurer     étape 3 : réimport transformé
//
// Déroulé recommandé :
//   1. --sauvegarder
//   2. --analyser            (vérifier les avertissements)
//   3. node scripts/create-tables.js --recreate
//   4. --restaurer

const fs = require("fs");
const path = require("path");
const { ScanCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { client, nom } = require("./create-tables");

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// Correspondance explicite entre nom logique et nom physique sur AWS.
// Une transformation automatique échouerait sur QuizSessions, dont la
// table s'appelle "quiz-sessions" et non "quizsessions".
const TABLES_AWS = {
  Employes: "employes",
  Pointages: "pointages",
  Conges: "conges",
  Factures: "factures",
  Candidatures: "candidatures",
  Offres: "offres",
  Quiz: "quiz",
  QuizSessions: "quiz-sessions",
  Entretiens: "entretiens",
  Notifications: "notifications",
  Evenements: "evenements",
};

const CIBLE_AWS = process.argv.includes("--aws");
const ETAPE = process.env.ETAPE || "dev";

const nomCible = (base) =>
  CIBLE_AWS ? `pferh-${ETAPE}-${TABLES_AWS[base] ?? base.toLowerCase()}` : nom(base);
const DOSSIER = path.join(process.cwd(), "sauvegarde");

// Tables lues à la sauvegarde (y compris celles qui vont disparaître)
const A_SAUVEGARDER = [
  "Users", "Employes", "Candidats", "Candidatures", "Pointages",
  "Conges", "Factures", "Offres", "Quiz", "Notifications", "Evenements",
];

const avertissements = [];
const avertir = (msg) => {
  avertissements.push(msg);
  console.log(`   ⚠️  ${msg}`);
};

// ── Étape 1 : sauvegarde ───────────────────────────────────────────

async function scanComplet(nomTable) {
  const items = [];
  let cle;
  do {
    const res = await docClient.send(new ScanCommand({
      TableName: nomTable,
      ExclusiveStartKey: cle,
    }));
    items.push(...(res.Items || []));
    cle = res.LastEvaluatedKey;
  } while (cle);
  return items;
}

async function sauvegarder() {
  fs.mkdirSync(DOSSIER, { recursive: true });
  console.log(`\n💾 Sauvegarde vers ${DOSSIER}\n`);

  for (const base of A_SAUVEGARDER) {
    const nomTable = nom(base);
    try {
      const items = await scanComplet(nomTable);
      fs.writeFileSync(
        path.join(DOSSIER, `${base}.json`),
        JSON.stringify(items, null, 2)
      );
      console.log(`   ${base.padEnd(16)} ${String(items.length).padStart(4)} éléments`);
    } catch (e) {
      console.log(`   ${base.padEnd(16)} absente (${e.name})`);
    }
  }
  console.log("\n✅ Sauvegarde terminée.\n");
}

function lire(base) {
  const fichier = path.join(DOSSIER, `${base}.json`);
  if (!fs.existsSync(fichier)) return [];
  return JSON.parse(fs.readFileSync(fichier, "utf8"));
}

// ── Transformations ────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, "0");
const maintenant = () => new Date().toISOString();

// Pointages : ancienne clé "id" -> nouvelle clé employeId + date.
// Les doublons sur un même jour sont fusionnés.
function transformerPointages(anciens) {
  const parCle = new Map();

  for (const p of anciens) {
    if (!p.employeId) {
      avertir(`Pointage ${p.id} ignoré : employeId absent`);
      continue;
    }
    const date = p.date || (p.heureArrivee || "").split("T")[0];
    if (!date) {
      avertir(`Pointage ${p.id} ignoré : date introuvable`);
      continue;
    }

    const cle = `${p.employeId}|${date}`;
    const existant = parCle.get(cle);

    if (!existant) {
      parCle.set(cle, { ...p, date, ancienId: p.id });
      delete parCle.get(cle).id;
      continue;
    }

    // Doublon : on garde l'arrivée la plus tôt et le départ le plus tard
    avertir(`Doublon fusionné : employé ${p.employeId} le ${date}`);
    if (p.heureArrivee < existant.heureArrivee) existant.heureArrivee = p.heureArrivee;
    if (p.heureDepart && (!existant.heureDepart || p.heureDepart > existant.heureDepart)) {
      existant.heureDepart = p.heureDepart;
      existant.statut = "TERMINE";
    }
    if (existant.heureArrivee && existant.heureDepart) {
      existant.dureeMinutes = Math.round(
        (new Date(existant.heureDepart) - new Date(existant.heureArrivee)) / 60000
      );
    }
  }

  return [...parCle.values()];
}

// Candidats (ancien système) -> Candidatures (nouveau)
function transformerCandidats(candidats, candidaturesExistantes) {
  const emailsConnus = new Set(
    candidaturesExistantes.map((c) => `${c.email}|${c.offreId || ""}`)
  );

  const convertis = [];
  for (const c of candidats) {
    const empreinte = `${c.email}|${c.offreId || ""}`;
    if (emailsConnus.has(empreinte)) {
      avertir(`Candidat ${c.email} déjà présent dans Candidatures, ignoré`);
      continue;
    }
    convertis.push({
      id: c.id,
      offreId: c.offreId || null,
      offreTitre: c.posteVise || "Candidature spontanée",
      nom: c.nom,
      prenom: c.prenom,
      email: c.email,
      telephone: c.telephone || "",
      lettreMotivation: c.lettreMotivation || "",
      competences: c.competences || [],
      niveauEtude: c.niveauEtude || null,
      experience: c.experience || null,
      posteVise: c.posteVise || "Candidature spontanée",
      scoreCV: typeof c.scoreCV === "number" ? c.scoreCV : 0,
      scoreQuiz: c.scoreQuiz ?? null,
      scoreTotal: typeof c.scoreTotal === "number" ? c.scoreTotal : (c.scoreCV || 0),
      statut: (c.statut || "SOUMIS").toUpperCase(),
      quizId: c.quizId || null,
      quizStatus: c.quizStatus || "NON_ENVOYE",
      historiqueStatuts: c.historiqueStatuts || [],
      source: "migration_candidats",
      creeLe: c.soumisLe || c.creeLe || maintenant(),
      misAJourLe: c.misAJourLe || maintenant(),
    });
  }
  return convertis;
}

// Candidatures : normalisation des attributs devenus clés d'index
function transformerCandidatures(items) {
  return items.map((c) => ({
    ...c,
    statut: (c.statut || "SOUMIS").toUpperCase(),
    creeLe: c.creeLe || c.soumisLe || maintenant(),
    // scoreCV sert de clé de tri sur offre-index : doit être numérique
    scoreCV: typeof c.scoreCV === "number" ? c.scoreCV : 0,
  }));
}

// Congés : statuts uniformisés en majuscules
const CORRESPONDANCE_STATUT_CONGE = {
  attente: "EN_ATTENTE", "en attente": "EN_ATTENTE", en_attente: "EN_ATTENTE",
  approuve: "APPROUVE", "approuvé": "APPROUVE", accepte: "APPROUVE", "accepté": "APPROUVE",
  valide: "APPROUVE", "validé": "APPROUVE",
  refuse: "REFUSE", "refusé": "REFUSE", rejete: "REFUSE", "rejeté": "REFUSE",
};

function transformerConges(items) {
  return items.map((c) => {
    const brut = String(c.statut || "attente").toLowerCase();
    const statut = CORRESPONDANCE_STATUT_CONGE[brut];
    if (!statut) avertir(`Statut de congé inconnu : "${c.statut}" (congé ${c.id}) -> EN_ATTENTE`);
    return {
      ...c,
      statut: statut || "EN_ATTENTE",
      dateDebut: c.dateDebut,
      dateFin: c.dateFin,
    };
  }).filter((c) => {
    if (!c.employeId || !c.dateDebut) {
      avertir(`Congé ${c.id} ignoré : employeId ou dateDebut absent`);
      return false;
    }
    return true;
  });
}

// Congés stockés par erreur dans Evenements (type = CONGE)
function recupererCongesDepuisEvenements(evenements) {
  const recuperes = [];
  for (const e of evenements) {
    if (e.type !== "CONGE") continue;
    const participants = Array.isArray(e.participants) ? e.participants : [];
    if (!participants.length) {
      avertir(`Événement congé ${e.id} sans participant, ignoré`);
      continue;
    }
    for (const employeId of participants) {
      recuperes.push({
        id: `${e.id}-${employeId}`,
        employeId,
        employeNom: e.employeNom || "",
        type: e.paye === false ? "sans_solde" : "annuel",
        dateDebut: (e.dateDebut || "").split("T")[0],
        dateFin: (e.dateFin || "").split("T")[0],
        motif: e.description || e.titre || "",
        statut: e.statut === "ACTIF" ? "APPROUVE" : "EN_ATTENTE",
        demandeLe: e.creeLe || maintenant(),
        source: "migration_evenements",
      });
    }
  }
  if (recuperes.length) {
    console.log(`   ↩️  ${recuperes.length} congé(s) récupéré(s) depuis Evenements`);
  }
  return recuperes;
}

// Factures : id déterministe, PDF extrait sur disque
function transformerFactures(items) {
  const dossierPdf = path.join(DOSSIER, "pdf");
  const parCle = new Map();

  for (const f of items) {
    if (!f.employeId || !f.mois || !f.annee) {
      avertir(`Facture ${f.id} ignorée : employeId, mois ou annee absent`);
      continue;
    }

    const periode = `${f.annee}-${pad(f.mois)}`;
    const nouvelId = `${f.employeId}#${periode}`;

    if (parCle.has(nouvelId)) {
      avertir(`Facture en double pour ${periode} (employé ${f.employeId}), la plus récente est conservée`);
      const gardee = parCle.get(nouvelId);
      if ((f.genereLe || "") <= (gardee.genereLe || "")) continue;
    }

    const { pdfBase64, ...reste } = f;
    let pdfKey = f.pdfKey || null;

    if (pdfBase64) {
      fs.mkdirSync(dossierPdf, { recursive: true });
      pdfKey = `factures/${f.annee}/${f.employeId}_${periode}.pdf`;
      fs.writeFileSync(
        path.join(dossierPdf, `${f.employeId}_${periode}.pdf`),
        Buffer.from(pdfBase64, "base64")
      );
    }

    parCle.set(nouvelId, {
      ...reste,
      id: nouvelId,
      ancienId: f.id,
      periode,
      pdfKey,
      // Les anciens totaux sont faux (heures normales comptées deux fois)
      recalculRequis: true,
    });
  }

  const resultat = [...parCle.values()];
  if (resultat.length) {
    console.log(`   📄 ${resultat.length} PDF extrait(s) vers ${dossierPdf}`);
    avertir(`${resultat.length} facture(s) marquée(s) "recalculRequis" : régénère-les pour corriger les montants`);
  }
  return resultat;
}

function transformerNotifications(items) {
  const expiration = Math.floor(Date.now() / 1000) + 90 * 24 * 3600;
  return items
    .filter((n) => {
      if (!n.userId) { avertir(`Notification ${n.id} ignorée : userId absent`); return false; }
      return true;
    })
    .map((n) => ({ ...n, creeLe: n.creeLe || maintenant(), expireLe: n.expireLe || expiration }));
}

function transformerOffres(items) {
  return items.map((o) => ({
    ...o,
    statut: (o.statut || "ACTIVE").toUpperCase(),
    creeLe: o.creeLe || maintenant(),
  }));
}

function transformerQuiz(items) {
  return items.map((q) => ({
    ...q,
    offreId: q.offreId || "SANS_OFFRE",
    creeLe: q.creeLe || maintenant(),
  }));
}

const CLES_INDEX = {
  Employes:      ["email"],
  Pointages:     ["statut"],
  Conges:        ["employeId", "dateDebut", "statut"],
  Factures:      ["employeId", "periode"],
  Candidatures:  ["email", "statut", "creeLe", "offreId", "scoreCV"],
  Offres:        ["statut", "creeLe"],
  Quiz:          ["offreId", "creeLe"],
  Notifications: ["userId", "creeLe"],
  Evenements:    ["statut", "dateDebut"],
};

function nettoyerClesIndex(base, items) {
  return items.map((item) => {
    const copie = { ...item };
    for (const cle of CLES_INDEX[base] || []) {
      const v = copie[cle];
      if (v === null || v === undefined || v === "") delete copie[cle];
    }
    return copie;
  });
}

// ── Assemblage ─────────────────────────────────────────────────────

function construirePlan() {
  const candidaturesBrutes = lire("Candidatures");
  const candidatures = [
    ...transformerCandidatures(candidaturesBrutes),
    ...transformerCandidats(lire("Candidats"), candidaturesBrutes),
  ];

  const conges = [
    ...transformerConges(lire("Conges")),
    ...transformerConges(recupererCongesDepuisEvenements(lire("Evenements"))),
  ];

    const plan = {
    Employes:      lire("Employes"),
    Pointages:     transformerPointages(lire("Pointages")),
    Conges:        conges,
    Factures:      transformerFactures(lire("Factures")),
    Candidatures:  candidatures,
    Offres:        transformerOffres(lire("Offres")),
    Quiz:          transformerQuiz(lire("Quiz")),
    Notifications: transformerNotifications(lire("Notifications")),
    Evenements:    lire("Evenements").filter((e) => e.type !== "CONGE"),
  };

  for (const base of Object.keys(plan)) plan[base] = nettoyerClesIndex(base, plan[base]);
  return plan;

}

async function analyser() {
  console.log("\n🔍 Simulation — aucune écriture\n");
  const plan = construirePlan();

  console.log("\n   Résultat attendu :\n");
  for (const [base, items] of Object.entries(plan)) {
    console.log(`   ${base.padEnd(16)} ${String(items.length).padStart(4)} éléments`);
  }

  const utilisateurs = lire("Users");
  if (utilisateurs.length) {
    console.log(`\n   👤 ${utilisateurs.length} compte(s) dans Users : à recréer dans Cognito.`);
    console.log("      Les mots de passe hachés ne sont pas transférables.");
  }

  console.log(
    avertissements.length
      ? `\n⚠️  ${avertissements.length} avertissement(s) ci-dessus.\n`
      : "\n✅ Aucun problème détecté.\n"
  );
}

async function ecrireParLots(nomTable, items) {
  for (let i = 0; i < items.length; i += 25) {
    const lot = items.slice(i, i + 25);
    await docClient.send(new BatchWriteCommand({
      RequestItems: { [nomTable]: lot.map((Item) => ({ PutRequest: { Item } })) },
    }));
  }
}

async function restaurer() {
  console.log("\n📥 Réimport\n");
  const plan = construirePlan();

  for (const [base, items] of Object.entries(plan)) {
    if (!items.length) { console.log(`   ${base.padEnd(16)} vide`); continue; }
    try {
      await ecrireParLots(nomCible(base), items);
      console.log(`   ✅ ${base.padEnd(16)} ${items.length} → ${nomCible(base)}`);
      
    } catch (e) {
      console.error(`   ❌ ${base.padEnd(16)} ${nomCible(base)} : ${e.message}`);
    }
  }
  console.log("\nTerminé.\n");
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const action = args.includes("--sauvegarder") ? sauvegarder
               : args.includes("--restaurer")   ? restaurer
               : args.includes("--analyser")    ? analyser
               : null;

  if (!action) {
    console.log("Usage : --sauvegarder | --analyser | --restaurer");
    process.exit(1);
  }

  action().catch((e) => {
    console.error("Erreur :", e);
    process.exit(1);
  });
}