// diagnostic-annuaire.js
//
// À poser à la RACINE de pfe-rh-serverless, puis :
//
//   node diagnostic-annuaire.js
//
// Dit, fiche par fiche, qui figure dans l'annuaire et qui n'y figure
// pas — et pourquoi. Rien n'est créé ni modifié.
//
// Trois causes possibles à un annuaire qui ne montre pas les bonnes
// personnes, et elles se ressemblent toutes vues du navigateur :
//
//   1. la route /annuaire de server.js pointe encore sur l'ancien code ;
//   2. aucun domaine n'est déclaré, donc rien n'est filtré ;
//   3. les fiches ne portent pas toutes le même domaine.

const fs = require("fs");
const path = require("path");

// ── Lire le .env comme le ferait le serveur ────────────────────────

const fichiersEnv = [];
for (const nom of [".env", ".env.local"]) {
  const chemin = path.join(__dirname, nom);
  if (!fs.existsSync(chemin)) continue;
  fichiersEnv.push(nom);
  for (const ligne of fs.readFileSync(chemin, "utf8").split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!m) continue;
    const valeur = m[2].trim().replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
    if (!(m[1] in process.env) && valeur) process.env[m[1]] = valeur;
  }
}

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, ScanCommand } =
  require("@aws-sdk/lib-dynamodb");

const REGION = process.env.AWS_REGION || "eu-west-3";
const TABLE = process.env.TABLE_EMPLOYES || "Employes-local";
const TABLE_ENT = process.env.TABLE_ENTREPRISE || "Entreprise-local";

// ── Quelle base interroger ─────────────────────────────────────────
//
// La première version de ce script n'avait pas de valeur par défaut :
// sans DYNAMODB_ENDPOINT, elle s'adressait à AWS, alors que les
// données de développement sont dans DynamoDB Local. Elle annonçait
// « la table n'existe pas » juste après que creer-table-entreprise.js
// ait confirmé qu'elle existe. Une contradiction entre deux scripts
// fait perdre plus de temps qu'une absence de script.
//
//   node diagnostic-annuaire.js          → DynamoDB Local
//   node diagnostic-annuaire.js --aws    → la vraie base AWS

const versAws = process.argv.includes("--aws");
const POINT = versAws
  ? null
  : (process.env.DYNAMODB_ENDPOINT || "http://localhost:8000");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: REGION,
  ...(POINT ? { endpoint: POINT } : {}),
}));

console.log(
  POINT
    ? `\nBase interrogée : DynamoDB Local (${POINT})`
      + `\n  Pour viser AWS : node diagnostic-annuaire.js --aws`
    : `\nBase interrogée : AWS, région ${REGION}`
);

// Les mêmes règles que src/employes/annuaire.js. Si ce script et le
// module divergeaient, le diagnostic ne vaudrait rien.
const PARTIS = new Set([
  "SORTI", "SORTIE", "ARCHIVE", "ARCHIVÉ", "INACTIF", "DESACTIVE",
  "DEMISSION", "DÉMISSION", "LICENCIE", "LICENCIÉ", "RETRAITE",
  "RETRAITÉ", "FIN_CONTRAT", "SUPPRIME",
]);

const estParti = (statut) =>
  PARTIS.has(String(statut ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_"));

const domaineDe = (email) =>
  String(email ?? "").trim().toLowerCase().split("@")[1] || null;

const appartient = (email, domaines) => {
  if (!domaines.length) return true;        // rien de déclaré, rien de filtré
  const apres = domaineDe(email);
  return !!apres && domaines.some((d) => apres === d || apres.endsWith(`.${d}`));
};

let bloquant = 0;
const ok = (m) => console.log(`  ✔ ${m}`);
const ko = (m) => { bloquant += 1; console.log(`  ✗ ${m}`); };
const info = (m) => console.log(`    ${m}`);

(async () => {

  // ══ 1. La route ══

  console.log("\n═══ 1. La route /annuaire de server.js ═══\n");

  const serveur = path.join(__dirname, "server.js");
  if (!fs.existsSync(serveur)) {
    info("server.js introuvable à la racine : contrôle sauté.");
  } else {
    const code = fs.readFileSync(serveur, "utf8");
    const utiliseModule = /require\(["']\.\/src\/employes\/annuaire["']\)/.test(code);
    const scanEnDur = /app\.get\(\s*["']\/annuaire["'][\s\S]{0,600}?ScanCommand/.test(code);

    if (utiliseModule && !scanEnDur) {
      ok("la route appelle bien src/employes/annuaire");
    } else if (scanEnDur) {
      ko("la route /annuaire contient ENCORE un ScanCommand écrit sur place");
      info("C'est l'ancienne version : elle ne filtre par aucun domaine.");
      info("Remplace tout ce bloc par :");
      info("");
      info('  const annuaire = require("./src/employes/annuaire");');
      info("");
      info('  app.get("/annuaire", authentifier, autoriser("RH", "EMPLOYE"),');
      info("    async (req, res) => {");
      info("      try {");
      info("        envoyer(res, await annuaire.handler(toEvent(req)));");
      info("      } catch (e) {");
      info('        console.error("[annuaire]", e);');
      info("        res.status(500).json({ erreur: e.message });");
      info("      }");
      info("    });");
    } else if (!/\/annuaire/.test(code)) {
      ko("aucune route /annuaire dans server.js");
    } else {
      ko("la route /annuaire existe mais n'appelle pas le module");
      info("Vérifie qu'elle fait bien : annuaire.handler(toEvent(req))");
    }
  }

  const module = path.join(__dirname, "src", "employes", "annuaire.js");
  if (fs.existsSync(module)) ok("src/employes/annuaire.js est en place");
  else ko("src/employes/annuaire.js est ABSENT");

  // ══ 2. Les domaines déclarés ══

  console.log("\n═══ 2. Les domaines de l'entreprise ═══\n");

  let domaines = [];
  let nomEntreprise = null;
  try {
    const { Item } = await docClient.send(new GetCommand({
      TableName: TABLE_ENT, Key: { id: "ENTREPRISE" },
    }));
    if (!Item) {
      ko(`aucun enregistrement ENTREPRISE dans ${TABLE_ENT}`);
      info("Ouvre Réglages › Entreprise et enregistre la fiche une fois.");
    } else {
      nomEntreprise = Item.nom ?? null;
      domaines = (Item.domaines ?? []).map((d) => String(d).toLowerCase());
      ok(`entreprise : ${nomEntreprise ?? "(sans nom)"}`);
      if (domaines.length === 0) {
        ko("AUCUN domaine déclaré");
        info("Sans domaine, l'annuaire ne filtre rien : il affiche toutes");
        info("les fiches de la table, y compris les anciennes données de");
        info("test. C'est très probablement ce que tu vois.");
        info("");
        info("Va dans Réglages › Entreprise et renseigne le domaine, par");
        info("exemple : esprit.tn");
      } else {
        ok(`domaines déclarés : ${domaines.map((d) => `@${d}`).join(", ")}`);
      }
    }
  } catch (e) {
    if (e.name === "ResourceNotFoundException") {
      ko(`la table ${TABLE_ENT} n'existe pas ${POINT ? "en local" : "sur AWS"}`);
      if (POINT) {
        info("Lance : node creer-table-entreprise.js");
      } else {
        info("Si tes données sont en local, relance SANS --aws.");
      }
    } else {
      ko(`${e.name} : ${e.message}`);
    }
  }

  // ══ 3. Les fiches ══

  console.log("\n═══ 3. Les fiches, une par une ═══\n");

  let fiches = [];
  let depart;
  do {
    const r = await docClient.send(new ScanCommand({
      TableName: TABLE,
      ProjectionExpression: "#a, #b, #c, #d, #e",
      ExpressionAttributeNames: {
        "#a": "id", "#b": "prenom", "#c": "nom", "#d": "email", "#e": "statut",
      },
      ...(depart ? { ExclusiveStartKey: depart } : {}),
    }));
    fiches.push(...(r.Items ?? []));
    depart = r.LastEvaluatedKey;
  } while (depart);

  const dedans = [];
  const exclus = { partis: [], sansAdresse: [], horsDomaine: [] };

  for (const f of fiches) {
    const nom = `${f.prenom ?? "?"} ${f.nom ?? "?"}`.trim();
    if (estParti(f.statut)) { exclus.partis.push({ nom, f }); continue; }
    const email = String(f.email ?? "").trim().toLowerCase();
    if (!email) { exclus.sansAdresse.push({ nom, f }); continue; }
    if (!appartient(email, domaines)) { exclus.horsDomaine.push({ nom, email, f }); continue; }
    dedans.push({ nom, email });
  }

  console.log(`  ${fiches.length} fiche(s) dans ${TABLE}\n`);

  // Les domaines réellement présents, qui disent tout de suite si les
  // fiches sont homogènes ou non.
  const parDomaine = new Map();
  for (const f of fiches) {
    const d = domaineDe(f.email) ?? "(sans adresse)";
    parDomaine.set(d, (parDomaine.get(d) ?? 0) + 1);
  }
  console.log("  Domaines présents dans les fiches :");
  for (const [d, n] of [...parDomaine].sort((a, b) => b[1] - a[1])) {
    const marque = d === "(sans adresse)" ? " "
      : appartient(`x@${d}`, domaines) ? "✔" : "✗";
    console.log(`    ${marque} @${d.padEnd(28)} ${n} fiche(s)`);
  }

  console.log(`\n  DANS l'annuaire : ${dedans.length}`);
  for (const c of dedans.slice(0, 40)) {
    console.log(`      ${c.nom.padEnd(28)} ${c.email}`);
  }
  if (dedans.length > 40) console.log(`      … et ${dedans.length - 40} autre(s)`);

  const hors = exclus.partis.length + exclus.sansAdresse.length + exclus.horsDomaine.length;
  console.log(`\n  HORS annuaire : ${hors}`);
  if (exclus.horsDomaine.length) {
    console.log(`    · ${exclus.horsDomaine.length} hors domaine :`);
    for (const c of exclus.horsDomaine.slice(0, 20)) {
      console.log(`        ${c.nom.padEnd(28)} ${c.email}`);
    }
  }
  if (exclus.sansAdresse.length) {
    console.log(`    · ${exclus.sansAdresse.length} sans adresse :`);
    for (const c of exclus.sansAdresse.slice(0, 20)) {
      console.log(`        ${c.nom}`);
    }
  }
  if (exclus.partis.length) {
    console.log(`    · ${exclus.partis.length} sorti(e)s des effectifs :`);
    for (const c of exclus.partis.slice(0, 20)) {
      console.log(`        ${c.nom.padEnd(28)} statut « ${c.f.statut} »`);
    }
  }

  // ══ 4. Conclusion ══

  console.log("\n═══ 4. Conclusion ═══\n");

  if (bloquant > 0) {
    console.log(`  ${bloquant} point(s) à corriger, listés plus haut dans l'ordre.\n`);
    process.exit(1);
  }

  if (domaines.length === 0) {
    console.log("  Aucun domaine déclaré : l'annuaire affiche TOUTES les fiches");
    console.log("  de la table. Si tu y vois des personnes qui ne devraient");
    console.log("  plus y être, ce sont d'anciennes données de test.\n");
    console.log("  Deux façons de régler ça :");
    console.log("    · déclarer le domaine dans Réglages › Entreprise ;");
    console.log("    · ou passer les anciennes fiches en statut « inactif ».\n");
    process.exit(0);
  }

  if (exclus.horsDomaine.length > 0) {
    console.log(`  ${exclus.horsDomaine.length} fiche(s) ne figurent pas dans l'annuaire parce que`);
    console.log("  leur adresse n'est pas dans un domaine déclaré. Depuis la page");
    console.log("  Salariés, le bouton « Attribuer une adresse pro » leur en donne");
    console.log("  une, et conserve l'ancienne comme adresse personnelle.\n");
  } else {
    console.log("  Toutes les fiches en poste figurent dans l'annuaire.");
    console.log("  Si l'écran montre autre chose, c'est le navigateur qui garde");
    console.log("  une ancienne réponse : recharge avec Ctrl+F5.\n");
  }
  process.exit(0);

})().catch((e) => {
  console.error(`\n✗ ${e.name} : ${e.message}`);
  if (/ECONNREFUSED/.test(e.message)) {
    console.error(`  DynamoDB Local ne répond pas sur ${POINT}.`);
    console.error("  Lance-le, ou vise AWS : node diagnostic-annuaire.js --aws");
  }
  if (/credential|UnrecognizedClient|security token/i.test(e.name + e.message)) {
    console.error("  Identifiants AWS absents ou expirés : aws configure");
  }
  process.exit(1);
});