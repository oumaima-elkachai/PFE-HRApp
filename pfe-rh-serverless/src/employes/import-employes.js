// src/employes/import-employes.js
//
// L'import d'un tableur de salariés.
//
// ── Le cas que ça couvre ───────────────────────────────────────────
//
// Une PME qui tient ses salariés dans Excel depuis dix ans et qui veut
// passer à HR UP. Lui demander de ressaisir quarante fiches à la main,
// c'est garantir qu'elle ne passera jamais.
//
// ── Pourquoi le serveur ne lit pas le fichier ──────────────────────
//
// Le `.xlsx` est lu dans le navigateur, et le serveur reçoit des
// lignes déjà transformées en JSON. Trois raisons.
//
// Le tableur d'une PME réelle n'a jamais les bonnes colonnes : elles
// s'appellent « Nom et prénom », « Date d'entrée », « Salaire brut »,
// et il y a trois lignes de titre avant les données. La correspondance
// des colonnes se règle à l'écran, en voyant le contenu — pas en
// devinant côté serveur.
//
// Ensuite, un classeur de 2 Mo n'a aucune raison de traverser le
// réseau pour qu'on en garde 40 lignes.
//
// Enfin, le serveur reste simple : il valide et il écrit. Il n'a pas à
// connaître le format d'Excel, ni ses dates en nombre de jours depuis
// 1900.
//
// ── Vérifier d'abord, écrire ensuite ───────────────────────────────
//
// `verifierSeulement: true` renvoie exactement le même rapport sans
// rien écrire. L'écran s'en sert pour montrer ce qui passera et ce qui
// bloquera AVANT que la RH ne valide. Un import à moitié fait sur une
// base de salariés est très pénible à défaire.

const { randomUUID } = require("node:crypto");
const { ScanCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");

const { docClient } = require("../utils/dynamodb");
const { succes, erreur } = require("../utils/reponse");
const { identite, corpsDe, estRh } = require("../utils/identite");
const entreprise = require("../factures/entreprise");

const TABLE_EMPLOYES = process.env.TABLE_EMPLOYES || "Employes-local";

/** Au-delà, c'est qu'on a envoyé le classeur entier, en-têtes compris. */
const LIGNES_MAX = 500;

/** DynamoDB n'accepte pas plus de 25 écritures par lot. */
const LOT = 25;

// ── Les colonnes ───────────────────────────────────────────────────
//
// `obligatoire` vaut pour la création d'une fiche exploitable : sans
// nom ni adresse, le salarié ne peut ni être désigné ni être invité.
// Le reste se complète plus tard dans l'application.

const COLONNES = {
  prenom:        { libelle: "Prénom",            obligatoire: true,  max: 60 },
  nom:           { libelle: "Nom",               obligatoire: true,  max: 60 },
  email:         { libelle: "Adresse pro",       obligatoire: true,  max: 120 },
  poste:         { libelle: "Poste",             max: 80 },
  departement:   { libelle: "Département",       max: 60 },
  dateEmbauche:  { libelle: "Date d'embauche",   type: "date" },
  typeContrat:   { libelle: "Type de contrat",   type: "contrat" },
  // `salaireBrutMensuel` et non `salaireBase` : c'est le nom que
  // porte `FicheSalarie` dans `services/employes.ts`, et celui que
  // `pdf.js` lit pour l'attestation de salaire. `creer-employe-test.js`
  // écrit `salaireBase`, ce qui est un troisième nom pour la même
  // donnée — à corriger de ton côté, sinon les salariés de test
  // sortent avec un salaire vide sur leurs attestations.
  salaireBrutMensuel: { libelle: "Salaire brut mensuel", type: "nombre" },
  telephone:     { libelle: "Téléphone",         max: 40 },
  matriculeCnss: { libelle: "Matricule CNSS",    max: 40 },
};

const CONTRATS = ["CDI", "CDD", "STAGE", "ALTERNANCE", "INTERIM"];

// ── Mise en forme ──────────────────────────────────────────────────

const texte = (v, max) =>
  String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Une date, dans les formes qu'un tableur produit.
 *
 * Excel stocke une date comme un nombre de jours depuis le 1ᵉʳ janvier
 * 1900 — avec un décalage de deux jours, parce qu'il croit que 1900
 * était bissextile. La page convertit déjà ; ce filet n'est là que
 * pour les lignes saisies à la main.
 */
function dateDe(valeur) {
  if (valeur === null || valeur === undefined || valeur === "") return null;

  const brut = String(valeur).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(brut)) return brut;

  // 15/03/2024 ou 15-03-2024
  const fr = brut.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (fr) {
    const [, j, m, a] = fr;
    return `${a}-${m.padStart(2, "0")}-${j.padStart(2, "0")}`;
  }

  // Un numéro de série Excel resté tel quel.
  if (/^\d{4,6}$/.test(brut)) {
    const jours = Number(brut);
    const d = new Date(Date.UTC(1899, 11, 30) + jours * 86400000);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  const d = new Date(brut);
  return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function nombreDe(valeur) {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  // « 1 200,500 » et « 1,200.50 » arrivent tous les deux d'un tableur.
  const net = String(valeur)
    .replace(/[^\d,.-]/g, "")
    .replace(/\s/g, "");

  // Sans ce test, « à négocier » devient la chaîne vide, que `Number`
  // convertit en 0 — et le salarié entre dans la base avec un salaire
  // de zéro sans que personne ne soit prévenu.
  if (!/\d/.test(net)) return undefined;

  const avecPoint = net.lastIndexOf(",") > net.lastIndexOf(".")
    ? net.replace(/\./g, "").replace(",", ".")
    : net.replace(/,/g, "");
  const n = Number(avecPoint);
  return isNaN(n) ? undefined : n;
}

// ── Validation d'une ligne ─────────────────────────────────────────

/**
 * @returns {{fiche?: object, erreurs: string[], avertissements: string[]}}
 */
function verifierLigne(brut, domaines) {
  const erreurs = [];
  const avertissements = [];
  const fiche = {};

  for (const [cle, def] of Object.entries(COLONNES)) {
    const valeur = brut[cle];

    if (def.type === "date") {
      const d = dateDe(valeur);
      if (d === undefined) {
        erreurs.push(`${def.libelle} : « ${valeur} » n'est pas une date`);
      } else if (d) {
        if (d > new Date().toISOString().slice(0, 10)) {
          // Pas une erreur : une embauche peut être future.
          avertissements.push(`${def.libelle} est dans le futur`);
        }
        fiche[cle] = d;
      }
      continue;
    }

    if (def.type === "nombre") {
      const n = nombreDe(valeur);
      if (n === undefined) {
        erreurs.push(`${def.libelle} : « ${valeur} » n'est pas un nombre`);
      } else if (n !== null) {
        if (n < 0) erreurs.push(`${def.libelle} ne peut pas être négatif`);
        else fiche[cle] = n;
      }
      continue;
    }

    if (def.type === "contrat") {
      const c = texte(valeur, 20).toUpperCase();
      if (!c) continue;
      if (!CONTRATS.includes(c)) {
        avertissements.push(
          `${def.libelle} : « ${c} » inconnu, remplacé par CDI`);
        fiche[cle] = "CDI";
      } else {
        fiche[cle] = c;
      }
      continue;
    }

    const t = texte(valeur, def.max);
    if (!t && def.obligatoire) {
      erreurs.push(`${def.libelle} est obligatoire`);
    } else if (t) {
      fiche[cle] = t;
    }
  }

  // L'adresse : le reste en dépend.
  if (fiche.email) {
    // Minuscules sans condition : Cognito distingue la casse, et le
    // rattachement fiche ↔ compte se fait par comparaison exacte.
    fiche.email = fiche.email.toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fiche.email)) {
      erreurs.push(`« ${fiche.email} » n'est pas une adresse de courriel`);
    } else if (!entreprise.emailAppartient(fiche.email, domaines)) {
      const liste = domaines.map((d) => `@${d}`).join(", ");
      erreurs.push(
        `${fiche.email} n'appartient pas à l'entreprise (${liste})`);
    }
  }

  if (erreurs.length > 0) return { erreurs, avertissements };

  fiche.id = randomUUID();
  fiche.statut = "actif";
  fiche.creeLe = new Date().toISOString();

  return { fiche, erreurs, avertissements };
}

// ── Les adresses déjà connues ──────────────────────────────────────

async function emailsExistants() {
  const vus = new Map();
  let suite;

  do {
    const r = await docClient.send(new ScanCommand({
      TableName: TABLE_EMPLOYES,
      // Seules deux colonnes : une fiche complète par salarié ferait
      // transiter les salaires de toute l'entreprise pour rien.
      ProjectionExpression: "id, email",
      ExclusiveStartKey: suite,
    }));
    for (const e of r.Items ?? []) {
      if (e.email) vus.set(String(e.email).toLowerCase(), e.id);
    }
    suite = r.LastEvaluatedKey;
  } while (suite);

  return vus;
}

// ── POST /employes/import ──────────────────────────────────────────

async function handlerImporter(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);
  if (!estRh(moi)) return erreur("Accès réservé aux ressources humaines", 403);

  const corps = corpsDe(event);
  const lignes = Array.isArray(corps.lignes) ? corps.lignes : null;

  if (!lignes) return erreur("Aucune ligne à importer", 400);
  if (lignes.length === 0) return erreur("Le fichier ne contient aucune ligne", 400);
  if (lignes.length > LIGNES_MAX) {
    return erreur(
      `${lignes.length} lignes reçues, ${LIGNES_MAX} au maximum. `
      + `Si le fichier en contient moins, c'est que les lignes de titre `
      + `sont comptées : règle la première ligne de données à l'écran.`,
      400
    );
  }

  const ent = await entreprise.charger();
  const domaines = ent.domaines ?? [];
  const connus = await emailsExistants();

  const rapport = [];
  const aEcrire = [];
  const vusDansLeFichier = new Map();

  lignes.forEach((brut, i) => {
    // +2 : la ligne 1 d'un tableur est l'en-tête, et les humains
    // comptent à partir de 1. Le numéro affiché doit être celui
    // qu'on lit dans Excel, sinon il ne sert à rien.
    const numero = Number(brut.__ligne) || i + 2;

    const { fiche, erreurs, avertissements } = verifierLigne(brut, domaines);

    if (fiche?.email) {
      const dejaDansLeFichier = vusDansLeFichier.get(fiche.email);
      if (dejaDansLeFichier) {
        erreurs.push(`Adresse en double dans le fichier (ligne ${dejaDansLeFichier})`);
      } else if (connus.has(fiche.email)) {
        erreurs.push("Un salarié porte déjà cette adresse");
      } else {
        vusDansLeFichier.set(fiche.email, numero);
      }
    }

    const etat = erreurs.length > 0 ? "REFUSEE" : "PRETE";

    rapport.push({
      ligne: numero,
      nom: [brut.prenom, brut.nom].filter(Boolean).join(" ") || "—",
      email: fiche?.email ?? texte(brut.email, 120).toLowerCase() ?? null,
      etat,
      erreurs,
      avertissements,
    });

    if (etat === "PRETE") aEcrire.push(fiche);
  });

  const pretes = rapport.filter((l) => l.etat === "PRETE").length;
  const refusees = rapport.length - pretes;

  // ── Mode vérification : rien n'est écrit ──
  if (corps.verifierSeulement) {
    return succes({
      verification: true,
      total: rapport.length, pretes, refusees,
      lignes: rapport,
      domaines,
      message: refusees === 0
        ? `${pretes} salarié${pretes > 1 ? "s" : ""} prêt${pretes > 1 ? "s" : ""} à être importé${pretes > 1 ? "s" : ""}.`
        : `${pretes} ligne${pretes > 1 ? "s" : ""} sur ${rapport.length} peu${pretes > 1 ? "vent" : "t"} être importée${pretes > 1 ? "s" : ""}.`,
    });
  }

  if (aEcrire.length === 0) {
    return erreur(
      "Aucune ligne ne peut être importée. Corrigez le fichier et "
      + "recommencez.",
      400
    );
  }

  // ── L'écriture ──
  //
  // Par lots de 25, et on repasse sur les items non traités :
  // DynamoDB peut en refuser une partie sans que l'appel échoue.
  const ecrits = [];
  const echoues = [];

  for (let i = 0; i < aEcrire.length; i += LOT) {
    const lot = aEcrire.slice(i, i + LOT);
    let demandes = lot.map((Item) => ({ PutRequest: { Item } }));

    for (let essai = 0; essai < 3 && demandes.length > 0; essai++) {
      try {
        const r = await docClient.send(new BatchWriteCommand({
          RequestItems: { [TABLE_EMPLOYES]: demandes },
        }));
        const restes = r.UnprocessedItems?.[TABLE_EMPLOYES] ?? [];
        const traites = demandes.length - restes.length;
        ecrits.push(...demandes.slice(0, traites).map((d) => d.PutRequest.Item));
        demandes = restes;

        if (demandes.length > 0) {
          // Attente croissante : DynamoDB refuse quand le débit
          // dépasse la capacité, et réessayer aussitôt ne fait
          // qu'aggraver.
          await new Promise((r2) => setTimeout(r2, 200 * (essai + 1)));
        }
      } catch (e) {
        console.error(`[import] Lot refusé : ${e.name} — ${e.message}`);
        echoues.push(...demandes.map((d) => d.PutRequest.Item));
        demandes = [];
      }
    }
    echoues.push(...demandes.map((d) => d.PutRequest.Item));
  }

  return succes({
    verification: false,
    total: rapport.length,
    importes: ecrits.length,
    refusees,
    echoues: echoues.length,
    // De quoi enchaîner sur les invitations sans redemander la liste.
    crees: ecrits.map((e) => ({
      id: e.id, nom: `${e.prenom} ${e.nom}`, email: e.email,
    })),
    lignes: rapport,
    message: echoues.length > 0
      ? `${ecrits.length} salarié(s) importé(s), ${echoues.length} écriture(s) ont échoué.`
      : `${ecrits.length} salarié${ecrits.length > 1 ? "s" : ""} importé${ecrits.length > 1 ? "s" : ""}.`
        + (refusees > 0 ? ` ${refusees} ligne(s) refusée(s).` : ""),
  });
}

// ── GET /employes/import/modele ────────────────────────────────────
//
// Les colonnes attendues, pour que la page fabrique un classeur
// d'exemple. C'est le serveur qui les déclare, afin qu'une colonne
// ajoutée ici apparaisse dans le modèle sans toucher à la page.

async function handlerModele(event = {}) {
  const moi = identite(event);
  if (!moi) return erreur("Jeton manquant ou illisible", 401);

  const ent = await entreprise.charger();
  const domaine = (ent.domaines ?? [])[0] ?? "entreprise.tn";

  return succes({
    colonnes: Object.entries(COLONNES).map(([cle, def]) => ({
      cle, libelle: def.libelle,
      obligatoire: !!def.obligatoire,
      type: def.type ?? "texte",
    })),
    contrats: CONTRATS,
    lignesMax: LIGNES_MAX,
    exemple: [
      {
        prenom: "Karim", nom: "Ben Ali", email: `karim.benali@${domaine}`,
        poste: "Développeur", departement: "Informatique",
        dateEmbauche: "2024-09-01", typeContrat: "CDI",
        salaireBrutMensuel: 2400, telephone: "+216 20 000 000",
        matriculeCnss: "12345678-01",
      },
      {
        prenom: "Sarra", nom: "Hamdi", email: `sarra.hamdi@${domaine}`,
        poste: "Comptable", departement: "Finance",
        dateEmbauche: "2023-02-15", typeContrat: "CDI",
        salaireBrutMensuel: 1800, telephone: "+216 20 000 001",
        matriculeCnss: "12345678-02",
      },
    ],
  });
}

// ── Pannes prévisibles ─────────────────────────────────────────────

function protege(handler) {
  return async (event) => {
    try {
      return await handler(event);
    } catch (e) {
      if (e.name === "ResourceNotFoundException") {
        return erreur(`La table ${TABLE_EMPLOYES} n'existe pas.`, 503);
      }
      if (e.name === "ProvisionedThroughputExceededException") {
        return erreur(
          "La base refuse ce débit. Réessayez avec un fichier plus court.",
          429
        );
      }
      if (e.name === "ValidationException") {
        return erreur(`Donnée refusée par la base : ${e.message}`, 400);
      }
      throw e;
    }
  };
}

module.exports = {
  handlerImporter: protege(handlerImporter),
  handlerModele: protege(handlerModele),
  verifierLigne,
  dateDe,
  nombreDe,
  COLONNES,
  CONTRATS,
  LIGNES_MAX,
};