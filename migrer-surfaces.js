// migrer-surfaces.js
//
// Prépare le frontend pour le mode sombre, en deux passes :
//
//   1. « bg-white » devient « bg-surface », pour que les surfaces
//      basculent.
//   2. Les couleurs littérales — bg-[#4a7c59], border-[#e5e0d8] —
//      deviennent des classes de palette, pour qu'elles basculent
//      aussi.
//
//   node migrer-surfaces.js              essai à blanc, rien n'est écrit
//   node migrer-surfaces.js --appliquer  écrit, après sauvegarde
//   node migrer-surfaces.js --annuler    rétablit depuis les sauvegardes
//
// ── Où poser ce fichier ────────────────────────────────────────────
//
// Dans pfe-rh\, le dossier qui contient frontend et pfe-rh-serverless.
// Le script trouve « frontend/src » tout seul : à côté de lui, puis
// dans les dossiers parents. Il ne touche que des fichiers du
// frontend — à ne pas confondre avec creer-table-corrections.js, qui
// parle à DynamoDB et vit dans pfe-rh-serverless.
//
// ── Pourquoi un script et pas une recherche-remplacement ───────────
//
// Pour la première passe : « bg-white » doit changer et « text-white »
// ne doit pas. Remplacer « white » par « surface » dans l'éditeur
// casserait les libellés de boutons en texte sombre sur fond coloré.
//
// Pour la seconde, c'est plus net encore. Le même vert #4a7c59 devient
// « bg-brand-500 » quand il est un fond et « text-brand-texte » quand
// il est un texte, parce qu'un fond rempli porte du blanc — donc il
// doit rester foncé en mode sombre — alors qu'un texte vert posé sur
// du sombre doit s'éclaircir. Un seul remplacement littéral ne peut
// pas faire cette distinction ; le préfixe de la propriété, oui.
//
// ── Ce que le script ne touche pas ─────────────────────────────────
//
// Les couleurs écrites dans un attribut style — style={{ backgroundColor:
// '#dc2626' }}. Elles sont listées à la fin : une substitution
// automatique dans du code JavaScript est trop risquée, et il y en a
// peu. La correction tient en une ligne : remplacer '#dc2626' par
// 'var(--color-red-500)', qui suit le thème.

const fs = require("fs");
const path = require("path");

const APPLIQUER = process.argv.includes("--appliquer");
const ANNULER = process.argv.includes("--annuler");
const TOUT = process.argv.includes("--tout");
const SUFFIXE = ".avant-surface";

const EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".js", ".html"]);
const IGNORES = new Set(["node_modules", "dist", "build", ".git", "coverage"]);

// ── La table de correspondance ──────────────────────────────────────
//
// Trois colonnes, parce que la même couleur ne joue pas le même rôle
// selon la propriété qui la porte. « fond » couvre bg, from, to, via,
// fill ; « texte » couvre text, placeholder, stroke, caret ;
// « bordure » couvre border, divide, outline, ring.

const TABLE = {
  // Le vert de la marque. #4a7c59 est le ton principal, #2d6a4f et
  // #3d6749 ses variantes foncées.
  "#4a7c59": { fond: "brand-500", texte: "brand-texte", bordure: "brand-500" },
  "#2d6a4f": { fond: "brand-600", texte: "brand-texte", bordure: "brand-600" },
  "#3d6749": { fond: "brand-600", texte: "brand-texte", bordure: "brand-600" },
  "#52796f": { fond: "brand-400", texte: "brand-texte", bordure: "brand-400" },

  // Les crèmes : fonds de page, survols, bordures.
  "#f5f0e8": { fond: "stone-100", texte: "stone-100", bordure: "stone-200" },
  "#f0ebe0": { fond: "stone-100", texte: "stone-100", bordure: "stone-200" },
  "#faf8f3": { fond: "stone-50", texte: "stone-50", bordure: "stone-100" },
  "#e5e0d8": { fond: "stone-200", texte: "stone-300", bordure: "stone-200" },
  "#d1caba": { fond: "stone-300", texte: "stone-400", bordure: "stone-300" },
  "#ede8df": { fond: "stone-200", texte: "stone-300", bordure: "stone-200" },
  "#f8f6f2": { fond: "stone-50", texte: "stone-50", bordure: "stone-100" },
  "#faf9f7": { fond: "stone-50", texte: "stone-50", bordure: "stone-100" },
  "#f5f2ec": { fond: "stone-100", texte: "stone-100", bordure: "stone-200" },
  "#8b7355": { fond: "stone-600", texte: "stone-600", bordure: "stone-600" },
  "#fafaf8": { fond: "stone-50", texte: "stone-50", bordure: "stone-100" },
  "#faf6f0": { fond: "stone-50", texte: "stone-50", bordure: "stone-100" },
  "#fbfdfb": { fond: "stone-50", texte: "stone-50", bordure: "stone-100" },
  "#f7f5f1": { fond: "stone-50", texte: "stone-50", bordure: "stone-100" },
  "#e5e5e5": { fond: "stone-200", texte: "stone-300", bordure: "stone-200" },
  "#d6d3d1": { fond: "stone-300", texte: "stone-400", bordure: "stone-300" },
  "#a8a29e": { fond: "stone-400", texte: "stone-400", bordure: "stone-400" },
  "#4a5568": { fond: "stone-700", texte: "stone-700", bordure: "stone-700" },

  // Les verts secondaires qui traînaient dans l'application : un vert
  // vif de réussite, deux verts très clairs de pastille, un vert très
  // foncé. Ramenés sur la rampe de la marque, puisque la marque est
  // verte — deux verts distincts pour « c'est validé » et « c'est
  // nous » se lisent comme une étourderie de palette.
  "#16a34a": { fond: "brand-500", texte: "brand-texte", bordure: "brand-500" },
  "#1b4332": { fond: "brand-800", texte: "brand-texte", bordure: "brand-800" },
  "#dcfce7": { fond: "brand-100", texte: "brand-100", bordure: "brand-200" },
  "#d8f3dc": { fond: "brand-100", texte: "brand-100", bordure: "brand-200" },

  // Les gris. Les tiens sont bleutés ; la palette les remplace par
  // leurs équivalents chauds, accordés au crème.
  "#1a1a1a": { fond: "stone-900", texte: "stone-900", bordure: "stone-900" },
  "#374151": { fond: "stone-700", texte: "stone-700", bordure: "stone-700" },
  "#4b5563": { fond: "stone-600", texte: "stone-600", bordure: "stone-600" },
  "#6b7280": { fond: "stone-500", texte: "stone-500", bordure: "stone-500" },
  "#9ca3af": { fond: "stone-400", texte: "stone-400", bordure: "stone-400" },
  "#d1d5db": { fond: "stone-300", texte: "stone-400", bordure: "stone-300" },
  "#e5e7eb": { fond: "stone-200", texte: "stone-300", bordure: "stone-200" },
  "#f3f4f6": { fond: "stone-100", texte: "stone-100", bordure: "stone-200" },
  "#f9fafb": { fond: "stone-50", texte: "stone-50", bordure: "stone-100" },

  // Alerte.
  "#dc2626": { fond: "red-500", texte: "red-600", bordure: "red-500" },
  "#ef4444": { fond: "red-500", texte: "red-600", bordure: "red-500" },
  "#b91c1c": { fond: "red-600", texte: "red-700", bordure: "red-600" },
  "#fee2e2": { fond: "red-100", texte: "red-100", bordure: "red-100" },
  "#fef2f2": { fond: "red-50", texte: "red-50", bordure: "red-100" },

  // Attente.
  "#d97706": { fond: "amber-600", texte: "amber-600", bordure: "amber-600" },
  "#f59e0b": { fond: "amber-500", texte: "amber-600", bordure: "amber-500" },
  "#ca8a04": { fond: "amber-600", texte: "amber-600", bordure: "amber-600" },
  "#fef9c3": { fond: "amber-100", texte: "amber-100", bordure: "amber-100" },
  "#fef3c7": { fond: "amber-100", texte: "amber-100", bordure: "amber-100" },
  "#fffbeb": { fond: "amber-50", texte: "amber-50", bordure: "amber-100" },

  // Information.
  "#2563eb": { fond: "blue-500", texte: "blue-600", bordure: "blue-500" },
  "#3b82f6": { fond: "blue-500", texte: "blue-600", bordure: "blue-500" },
  "#8b5cf6": { fond: "indigo-500", texte: "indigo-600", bordure: "indigo-500" },
  "#ede9fe": { fond: "indigo-100", texte: "indigo-100", bordure: "indigo-100" },
  "#1d4ed8": { fond: "blue-600", texte: "blue-700", bordure: "blue-600" },
  "#dbeafe": { fond: "blue-100", texte: "blue-100", bordure: "blue-100" },
  "#eff6ff": { fond: "blue-50", texte: "blue-50", bordure: "blue-100" },
};

/** À quelle colonne de la table appartient une propriété Tailwind. */
const ROLES = {
  texte: new Set(["text", "placeholder", "stroke", "caret", "decoration", "accent"]),
  bordure: new Set(["border", "divide", "outline", "ring"]),
  fond: new Set(["bg", "from", "to", "via", "fill", "shadow"]),
};

function roleDe(propriete) {
  for (const [role, membres] of Object.entries(ROLES)) {
    if (membres.has(propriete)) return role;
  }
  return null;
}

/** Les fichiers du projet, en profondeur. */
function fichiers(dossier, acc = []) {
  let entrees;
  try {
    entrees = fs.readdirSync(dossier, { withFileTypes: true });
  } catch {
    return acc;
  }

  for (const e of entrees) {
    const complet = path.join(dossier, e.name);
    if (e.isDirectory()) {
      if (!IGNORES.has(e.name)) fichiers(complet, acc);
    } else if (EXTENSIONS.has(path.extname(e.name))) {
      acc.push(complet);
    }
  }
  return acc;
}

/** Trouve le dossier des sources du frontend, en partant du dossier du
 *  script puis du dossier courant, et en remontant. Un script qu'il
 *  faut lancer depuis le bon répertoire fait perdre plus de temps que
 *  les dix lignes qui lui permettent de se situer. */
function trouverSources() {
  const explicite = process.argv.find((a) => a.startsWith("--racine="));
  if (explicite) return explicite.slice("--racine=".length);

  const candidats = [
    path.join("frontend", "src"),
    "src",
    path.join("..", "frontend", "src"),
  ];

  for (const depart of [__dirname, process.cwd()]) {
    let base = depart;
    for (let niveau = 0; niveau < 4; niveau++) {
      for (const c of candidats) {
        const essai = path.resolve(base, c);
        // La présence d'un dossier ne suffit pas : « src » existe aussi
        // dans le backend. On exige un fichier de composant.
        if (fs.existsSync(essai) && fs.statSync(essai).isDirectory()
          && fichiers(essai).some((f) => f.endsWith(".tsx"))) {
          return path.relative(process.cwd(), essai) || essai;
        }
      }
      const parent = path.dirname(base);
      if (parent === base) break;
      base = parent;
    }
  }
  return null;
}

// ── Passe 1 : les surfaces ──────────────────────────────────────────

// bg-white, éventuellement préfixé (hover:, sm:, focus:, group-hover:…)
// et éventuellement suivi d'une opacité.
const SURFACE = /(^|[\s"'`{:])((?:[a-z-]+:)*)bg-white(\/\d{1,3})?\b/g;

/** Signale un bg-white qui a l'air d'être une puce ou une piste posée
 *  sur un fond coloré plutôt qu'une surface. */
function douteux(ligne) {
  if (!/rounded-full/.test(ligne)) return false;
  // Un élément de 1 à 3 unités Tailwind — 4 à 12 pixels — n'est pas
  // une carte.
  if (!/\b[wh]-[1-3](\.5)?\b/.test(ligne)) return false;
  // Une vraie petite surface aurait une bordure ou une ombre.
  return !/\b(border|shadow)/.test(ligne);
}

// ── Passe 2 : les couleurs littérales ───────────────────────────────

// text-[#4a7c59], hover:bg-[#f5f0e8], border-[#e5e0d8]/50…
const LITTERALE =
  /(^|[\s"'`{:])((?:[a-z-]+:)*)([a-z]+)-\[(#[0-9a-fA-F]{3,8})\]((?:\/\d{1,3})?)/g;

// Les couleurs posées dans un attribut style : signalées, pas touchées.
const STYLE_EN_DUR = /style=\{\{[^}]*?(#[0-9a-fA-F]{6})/g;

// ── Passe 3 : les couleurs vivant dans le code JavaScript ───────────
//
// const ACCENT = '#4a7c59', les tableaux PALETTE, les couleurs passées
// à Recharts, les règles du <style> intégré. Ces chaînes ne sont pas
// des classes : ni la palette ni les deux premières passes ne les
// atteignent.
//
// Elles sont remplacées par les hexadécimaux de la nouvelle palette,
// et NON par var(--color-…). La raison est précise : Recharts pose ces
// valeurs comme attributs de présentation SVG — stroke="…", fill="…" —
// et un var() n'y est pas résolu. Le trait deviendrait noir.
//
// Conséquence à connaître : ces couleurs-là ne basculeront pas en mode
// sombre. Elles seront simplement de la bonne teinte. Les rendre
// thématiques demande de passer par une classe, donc de réécrire
// l'appel — un travail page par page qui n'a pas sa place dans un
// script.

const LITTERAUX_JS = {
  // L'ancien vert, sous toutes ses formes
  "#4a7c59": "#4F46E5", "#3d6749": "#4338CA", "#2d6a4f": "#4338CA",
  "#1b4332": "#312E81", "#16a34a": "#10B981", "#c7d8cc": "#C3C7FA",
  "#d8f3dc": "#E0E3FD",
  // Les crèmes
  "#faf6f0": "#F5F6FC", "#f5f0e8": "#EDEFF8", "#f0ebe0": "#EDEFF8",
  "#faf9f7": "#F5F6FC", "#fbfdfb": "#F5F6FC", "#f5f2ec": "#EDEFF8",
  "#f8f6f2": "#F5F6FC", "#fafaf8": "#F5F6FC", "#f7f5f1": "#F5F6FC",
  // Les bordures et les gris
  "#e5e0d8": "#DFE3F0", "#e7e5e4": "#DFE3F0", "#ede8df": "#DFE3F0",
  "#f5f5f4": "#EDEFF8", "#e5e5e5": "#DFE3F0", "#d6d3d1": "#C6CCDF",
  "#d1d5db": "#C6CCDF", "#a8a29e": "#9298B0", "#9ca3af": "#9298B0",
  "#6b7280": "#656C86", "#4b5563": "#4C5370", "#374151": "#373D56",
  "#1a1a1a": "#131729", "#8b7355": "#656C86", "#4a5568": "#373D56", "#78716c": "#656C86",
  // L'alerte
  "#ef4444": "#F43F5E", "#dc2626": "#D4193C", "#b91c1c": "#B91334",
  // Le violet et l'ambre de l'ancienne palette rejoignent ceux du
  // système, qui en sont très proches.
  "#8b5cf6": "#8B5CF6", "#f59e0b": "#F59E0B",
  "#0891b2": "#22A6BF", "#b45309": "#B45309",
  // #3b82f6 est volontairement absent : il sert dans les tableaux
  // PALETTE à distinguer des avatars, et le rapprocher de l'indigo
  // de la marque rendrait deux initiales sur six indiscernables.
};

// Une chaîne entre guillemets — '#4a7c59' ou "#4a7c59" — ou une valeur
// de propriété CSS dans un <style> intégré. Le # d'une classe Tailwind
// est précédé d'un crochet, jamais d'un guillemet : la distinction est
// sûre.
const DEJA_CONVERTIES = new Set(
  Object.values(LITTERAUX_JS).map((v) => v.toLowerCase()));

const JS_CITE = /(['"])(#[0-9a-fA-F]{6})\1/g;
const CSS_VALEUR = /(:\s*)(#[0-9a-fA-F]{6})(\s*[;}])/g;

/** Le fond de page écrit en dur dans chaque page admin.
 *
 *  « const FOND = '#faf6f0' » sert à envelopper <Layout> dans un div
 *  coloré. Or Layout pose déjà son propre fond, qui suit le thème :
 *  l'enveloppe le recouvre et le fige en clair.
 *
 *  On passe la constante à « transparent » plutôt que de supprimer
 *  l'enveloppe. Retirer le div demanderait une chirurgie du JSX, et
 *  supprimer la constante laisserait une variable inutilisée — donc
 *  une erreur de compilation si noUnusedLocals est actif. Changer sa
 *  valeur règle les deux. */
const FOND_EN_DUR = /(const\s+FOND\s*=\s*)['"]#[0-9a-fA-F]{6}['"]/g;

function main() {
  const RACINE = trouverSources();

  if (!RACINE || !fs.existsSync(RACINE)) {
    console.error("✖ Les sources du frontend n'ont pas été trouvées.");
    console.error("");
    console.error("  Le script a cherché un dossier contenant des .tsx, à");
    console.error("  côté de lui et dans les dossiers parents. Ton projet");
    console.error("  ressemble à ceci :");
    console.error("");
    console.error("    pfe-rh\\");
    console.error("      frontend\\src\\      ← les fichiers à modifier");
    console.error("      pfe-rh-serverless\\  ← le backend, non concerné");
    console.error("      migrer-surfaces.js  ← pose-le ici");
    console.error("");
    console.error("  Ou indique le chemin directement :");
    console.error("    node migrer-surfaces.js --racine=frontend\\src");
    process.exit(1);
  }

  const liste = fichiers(RACINE);

  // ── Annulation ──
  if (ANNULER) {
    let rendus = 0;
    for (const f of liste) {
      const sauvegarde = f + SUFFIXE;
      if (fs.existsSync(sauvegarde)) {
        fs.copyFileSync(sauvegarde, f);
        fs.unlinkSync(sauvegarde);
        rendus++;
      }
    }
    console.log(rendus
      ? `✔ ${rendus} fichier(s) rétabli(s), sauvegardes supprimées.`
      : "Aucune sauvegarde trouvée — rien à annuler.");
    return;
  }

  console.log(`Sources : ${RACINE}`);
  console.log("");

  const rapport = [];
  const reservees = [];
  const inconnues = new Map();   // couleur littérale absente de la table
  const enDur = [];              // couleurs dans un attribut style
  const horsTable = new Map();
  let totalSurfaces = 0;
  let totalLitterales = 0;
  let totalJs = 0;

  for (const f of liste) {
    const avant = fs.readFileSync(f, "utf8");
    if (!/bg-white|-\[#[0-9a-fA-F]{3,8}\]|style=\{\{/.test(avant)) continue;

    let nS = 0;
    let nL = 0;
    let nJ = 0;

    // Ligne par ligne, et non sur le fichier entier : c'est la ligne
    // qui porte les indices — taille, forme, bordure — qui disent si
    // un bg-white est une surface ou une puce sur fond coloré.
    const apres = avant.split("\n").map((ligne, i) => {
      let sortie = ligne;

      // Passe 1
      if (/bg-white/.test(sortie)) {
        if (!TOUT && douteux(sortie)) {
          reservees.push({ ou: `${f}:${i + 1}`, ligne: sortie.trim() });
        } else {
          sortie = sortie.replace(SURFACE, (_, tete, prefixes, opacite) => {
            nS++;
            return `${tete}${prefixes}bg-surface${opacite || ""}`;
          });
        }
      }

      // Passe 2
      sortie = sortie.replace(LITTERALE,
        (entier, tete, prefixes, propriete, couleur, opacite) => {
          const role = roleDe(propriete);
          const corr = TABLE[couleur.toLowerCase()];

          // Une couleur hors table, ou une propriété dont on ne sait
          // pas le rôle, est laissée telle quelle et signalée. Deviner
          // la ferait disparaître dans un ton approchant, ce qui est
          // pire qu'un îlot clair : on ne s'en apercevrait pas.
          if (!corr || !role) {
            if (!corr) {
              const c = couleur.toLowerCase();
              inconnues.set(c, (inconnues.get(c) || 0) + 1);
            }
            return entier;
          }

          nL++;
          return `${tete}${prefixes}${propriete}-${corr[role]}${opacite}`;
        });

      // Passe 3
      sortie = sortie.replace(FOND_EN_DUR, (_, tete) => { nJ++; return `${tete}'transparent'`; });

      const remplacerHex = (hex) => {
        const bas = hex.toLowerCase();
        const neuf = LITTERAUX_JS[bas];
        if (!neuf) {
          // Une couleur que le script a lui-même écrite n'est pas une
          // couleur inconnue : sans ce test, un second passage
          // signalerait son propre travail comme un reste à traiter.
          if (!DEJA_CONVERTIES.has(bas)) {
            horsTable.set(bas, (horsTable.get(bas) || 0) + 1);
          }
          return null;
        }
        // Une correspondance qui ne change que la casse n'est pas une
        // conversion. La compter ferait croire, au second passage,
        // qu'il reste du travail là où tout est déjà fait.
        if (neuf.toLowerCase() !== bas) nJ++;
        return neuf;
      };

      sortie = sortie.replace(JS_CITE, (entier, q, hex) => {
        const neuf = remplacerHex(hex);
        return neuf ? `${q}${neuf}${q}` : entier;
      });

      sortie = sortie.replace(CSS_VALEUR, (entier, tete, hex, queue) => {
        const neuf = remplacerHex(hex);
        return neuf ? `${tete}${neuf}${queue}` : entier;
      });

      return sortie;
    }).join("\n");

    if (nS === 0 && nL === 0 && nJ === 0) continue;

    totalSurfaces += nS;
    totalLitterales += nL;
    totalJs += nJ;
    rapport.push({ f, nS, nL, nJ });

    if (APPLIQUER) {
      const sauvegarde = f + SUFFIXE;
      // On n'écrase jamais une sauvegarde existante : relancé deux
      // fois, le script garderait l'état intermédiaire comme
      // « original » et l'annulation ne ramènerait plus rien.
      if (!fs.existsSync(sauvegarde)) fs.copyFileSync(f, sauvegarde);
      fs.writeFileSync(f, apres, "utf8");
    }
  }

  rapport.sort((a, b) => (b.nS + b.nL + b.nJ) - (a.nS + a.nL + a.nJ));
  console.log("surf.  litt.    js  fichier");
  for (const { f, nS, nL, nJ } of rapport) {
    console.log(`${String(nS).padStart(5)}  ${String(nL).padStart(5)}  ${String(nJ).padStart(4)}  ${f}`);
  }

  console.log("");
  console.log(`${totalSurfaces} surface(s), ${totalLitterales} classe(s) littérale(s) `
    + `et ${totalJs} couleur(s) dans le code, sur ${rapport.length} fichier(s).`);

  if (reservees.length) {
    console.log("");
    console.log(`${reservees.length} ligne(s) laissée(s) en blanc : élément `
      + "petit et rond, sans bordure ni ombre —");
    console.log("probablement posé SUR une couleur, donc blanc à juste titre.");
    for (const { ou, ligne } of reservees) {
      console.log(`  ${ou}`);
      console.log(`      ${ligne.slice(0, 100)}`);
    }
    console.log("  Si l'une d'elles est bien une surface : --tout, ou à la main.");
  }

  if (inconnues.size) {
    const triees = [...inconnues.entries()].sort((a, b) => b[1] - a[1]);
    console.log("");
    console.log(`${triees.length} couleur(s) littérale(s) absente(s) de la `
      + "table, laissée(s) intacte(s) :");
    for (const [c, n] of triees.slice(0, 20)) {
      console.log(`  ${c}  ×${n}`);
    }
    if (triees.length > 20) console.log(`  … et ${triees.length - 20} autre(s)`);
    console.log("  Ces endroits resteront clairs en mode sombre. Si l'un");
    console.log("  d'eux est visible, ajoute la couleur à TABLE en haut du");
    console.log("  script et relance.");
  }

  if (horsTable.size) {
    const triees = [...horsTable.entries()].sort((a, b) => b[1] - a[1]);
    console.log("");
    console.log(`${triees.length} couleur(s) du code absente(s) de LITTERAUX_JS, `
      + "laissée(s) intacte(s) :");
    for (const [c, n] of triees.slice(0, 15)) console.log(`  ${c}  ×${n}`);
    if (triees.length > 15) console.log(`  … et ${triees.length - 15} autre(s)`);
  }

  if (enDur.length) {
    const parCouleur = new Map();
    for (const { couleur, ou } of enDur) {
      if (!parCouleur.has(couleur)) parCouleur.set(couleur, []);
      parCouleur.get(couleur).push(ou);
    }
    console.log("");
    console.log(`${enDur.length} couleur(s) dans un attribut style, non `
      + "modifiée(s) :");
    for (const [c, ou] of parCouleur) {
      const corr = TABLE[c];
      const suggestion = corr
        ? `  →  'var(--color-${corr.fond})'`
        : "  →  pas dans la table";
      console.log(`  ${c}${suggestion}`);
      for (const o of ou.slice(0, 4)) console.log(`      ${o}`);
      if (ou.length > 4) console.log(`      … et ${ou.length - 4} autre(s)`);
    }
  }

  console.log("");
  if (APPLIQUER) {
    console.log("✔ Écrit. Sauvegardes en *" + SUFFIXE + ".");
    console.log("  Pour revenir : node migrer-surfaces.js --annuler");
    console.log("  Quand tout est vérifié, supprime les sauvegardes :");
    console.log(`  Get-ChildItem -Recurse -Filter *${SUFFIXE} | Remove-Item`);
  } else {
    console.log("Essai à blanc — rien n'a été écrit.");
    console.log("Pour appliquer : node migrer-surfaces.js --appliquer");
  }
}

main();