// rtl-audit.cjs
//
// À poser à la RACINE de `frontend`, puis :
//
//   node rtl-audit.cjs              → liste ce qui cloche, ne touche à rien
//   node rtl-audit.cjs --appliquer  → corrige, en gardant une copie .bak
//
// ── Le problème qu'il règle ────────────────────────────────────────
//
// En arabe, `document.dir` passe à `rtl` et la barre latérale se pose
// à droite. Mais une classe comme `ml-64` dit « marge à GAUCHE », pas
// « marge du côté de la barre ». Le contenu garde donc sa marge à
// gauche et glisse sous la barre, qui est maintenant à droite.
//
// Tailwind fournit des classes logiques, qui suivent la direction du
// document au lieu de la forcer :
//
//     ml-64  →  ms-64     (margin-inline-start)
//     pl-9   →  ps-9      (padding-inline-start)
//     left-3 →  start-3   (inset-inline-start)
//
// ── Ce que ce script NE fait pas ───────────────────────────────────
//
// Il ne touche pas aux flèches. `ChevronRight` reste un chevron vers
// la droite même en arabe, où il devrait pointer vers la gauche. La
// correction est `className="... rtl:rotate-180"`, et elle demande de
// regarder chaque cas : une flèche « suivant » se retourne, une flèche
// qui désigne une courbe montante, non.
//
// Il signale ces cas sans les corriger.

const fs = require("fs");
const path = require("path");

const APPLIQUER = process.argv.includes("--appliquer");
const RACINE = path.join(process.cwd(), "src");

// ── Les substitutions ──────────────────────────────────────────────
//
// L'ordre compte : `border-l` avant `border-left`, et les classes avec
// une valeur avant celles sans.

const REGLES = [
  // Marges et espacements internes
  [/\bml-(\[[^\]]+\]|[\w.]+)/g, "ms-$1", "marge gauche"],
  [/\bmr-(\[[^\]]+\]|[\w.]+)/g, "me-$1", "marge droite"],
  [/\bpl-(\[[^\]]+\]|[\w.]+)/g, "ps-$1", "espacement gauche"],
  [/\bpr-(\[[^\]]+\]|[\w.]+)/g, "pe-$1", "espacement droite"],

  // Positionnement
  [/\bleft-(\[[^\]]+\]|[\w.]+)/g, "start-$1", "position gauche"],
  [/\bright-(\[[^\]]+\]|[\w.]+)/g, "end-$1", "position droite"],

  // Bordures
  [/\bborder-l(?=\s|"|'|`|$)/g, "border-s", "bordure gauche"],
  [/\bborder-r(?=\s|"|'|`|$)/g, "border-e", "bordure droite"],
  [/\bborder-l-(\[[^\]]+\]|[\w.]+)/g, "border-s-$1", "bordure gauche"],
  [/\bborder-r-(\[[^\]]+\]|[\w.]+)/g, "border-e-$1", "bordure droite"],

  // Coins arrondis
  [/\brounded-l-(\[[^\]]+\]|[\w.]+)/g, "rounded-s-$1", "coins gauche"],
  [/\brounded-r-(\[[^\]]+\]|[\w.]+)/g, "rounded-e-$1", "coins droite"],
  [/\brounded-l(?=\s|"|'|`|$)/g, "rounded-s", "coins gauche"],
  [/\brounded-r(?=\s|"|'|`|$)/g, "rounded-e", "coins droite"],

  // Alignement du texte
  [/\btext-left\b/g, "text-start", "texte à gauche"],
  [/\btext-right\b/g, "text-end", "texte à droite"],
];

// Ce qu'on signale sans corriger : il faut un œil humain.
const A_REGARDER = [
  [/\bChevron(Right|Left)\b/g, "flèche : ajouter rtl:rotate-180 si elle indique une suite"],
  [/\bArrow(Right|Left)\b/g, "flèche : ajouter rtl:rotate-180 si elle indique une suite"],
  [/\b(translate-x|-translate-x)-/g, "déplacement horizontal : vérifier le sens en RTL"],
  [/\bfloat-(left|right)\b/g, "float : pas d'équivalent logique en Tailwind"],
];

function fichiers(dossier, trouves = []) {
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) {
      if (["node_modules", "dist", ".git"].includes(entree.name)) continue;
      fichiers(chemin, trouves);
    } else if (/\.(tsx|jsx|ts|js)$/.test(entree.name)) {
      // Pas de .css : `src/index.css` est le fichier ENGENDRÉ par
      // Tailwind. Le corriger ne sert à rien, il est réécrit à chaque
      // construction — et le corriger pourrait casser la feuille.
      trouves.push(chemin);
    }
  }
  return trouves;
}

if (!fs.existsSync(RACINE)) {
  console.error(`\n✗ Aucun dossier src/ ici. Lance ce script depuis `
    + `le dossier frontend.\n  Dossier courant : ${process.cwd()}\n`);
  process.exit(1);
}

let totalCorrige = 0;
let totalSignale = 0;
const parFichier = [];

for (const chemin of fichiers(RACINE)) {
  const avant = fs.readFileSync(chemin, "utf8");
  let apres = avant;
  const changements = [];

  for (const [motif, remplacement, libelle] of REGLES) {
    const trouves = avant.match(motif);
    if (!trouves) continue;
    // Compter par occurrence exacte, pour un rapport lisible.
    const comptes = {};
    for (const t of trouves) comptes[t] = (comptes[t] ?? 0) + 1;
    for (const [classe, n] of Object.entries(comptes)) {
      // La même règle appliquée à la seule classe trouvée : c'est
      // exactement ce que la substitution globale va produire.
      const vers = classe.replace(new RegExp(motif.source), remplacement);
      changements.push({ classe, vers, n, libelle });
    }
    apres = apres.replace(motif, remplacement);
  }

  const signales = [];
  for (const [motif, note] of A_REGARDER) {
    const trouves = avant.match(motif);
    if (trouves) signales.push({ note, n: trouves.length });
  }

  if (changements.length || signales.length) {
    const relatif = path.relative(process.cwd(), chemin);
    parFichier.push({ relatif, chemin, avant, apres, changements, signales });
    totalCorrige += changements.reduce((s, c) => s + c.n, 0);
    totalSignale += signales.reduce((s, c) => s + c.n, 0);
  }
}

console.log(
  APPLIQUER
    ? "\n═══ Correction des classes directionnelles ═══\n"
    : "\n═══ Classes directionnelles trouvées (rien n'est modifié) ═══\n"
);

for (const f of parFichier) {
  if (!f.changements.length && !f.signales.length) continue;
  console.log(`  ${f.relatif}`);
  for (const c of f.changements) {
    console.log(`      ${c.classe.padEnd(16)} → ${c.vers.padEnd(16)} ×${c.n}`);
  }
  for (const s of f.signales) {
    console.log(`      ⚠ ${s.note} (×${s.n})`);
  }
  if (APPLIQUER && f.avant !== f.apres) {
    fs.writeFileSync(`${f.chemin}.bak`, f.avant);
    fs.writeFileSync(f.chemin, f.apres);
  }
  console.log("");
}

console.log(`  ${totalCorrige} classe(s) à rendre logiques, `
  + `${totalSignale} point(s) à regarder à la main.\n`);

if (APPLIQUER) {
  console.log("  Les fichiers sont corrigés. Une copie .bak est posée à côté");
  console.log("  de chacun. Pour tout annuler :");
  console.log("    Get-ChildItem -Recurse -Filter *.bak | ForEach-Object {");
  console.log("      Move-Item $_.FullName ($_.FullName -replace '\\.bak$','') -Force }");
  console.log("");
  console.log("  Pour les retirer une fois la vérification faite :");
  console.log("    Get-ChildItem -Recurse -Filter *.bak | Remove-Item\n");
} else {
  console.log("  Pour corriger : node rtl-audit.cjs --appliquer\n");
}
