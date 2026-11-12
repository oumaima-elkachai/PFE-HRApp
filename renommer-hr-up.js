// renommer-hr-up.js
//
// Remplace « TERRA HR » par « HR UP » dans tout le projet.
//
//   node renommer-hr-up.js              essai à blanc, rien n'est écrit
//   node renommer-hr-up.js --appliquer  écrit, après sauvegarde
//   node renommer-hr-up.js --annuler    rétablit depuis les sauvegardes
//
// À poser dans pfe-rh\, le dossier qui contient frontend et
// pfe-rh-serverless. Contrairement à migrer-surfaces.js, celui-ci
// traite les DEUX : le nom apparaît dans les pages, mais aussi dans
// les sujets d'e-mail, les PDF générés, les fichiers de calendrier et
// les descriptions de ressources AWS.
//
// ── Ce qui a été vérifié avant d'écrire ce script ──────────────────
//
// « TERRA-HR » n'apparaît que comme valeur de tag CDK —
// Tags.of(app).add("Application", "TERRA-HR") — et jamais comme nom de
// pile ni identifiant de construct. C'est ce qui rend ce renommage
// sans danger : un identifiant de construct modifié aurait fait
// DÉTRUIRE puis recréer les ressources au prochain déploiement, tables
// DynamoDB comprises. Un tag n'est que de la métadonnée.
//
// Si tu ajoutes des motifs à la table ci-dessous, refais cette
// vérification : la règle est qu'on peut renommer ce qui s'affiche, et
// jamais ce qui identifie.
//
// ── L'ordre des remplacements ──────────────────────────────────────
//
// Du plus spécifique au plus général. « Terra&nbsp;HR » doit passer
// avant « Terra HR », sinon le second laisse un « &nbsp;HR » orphelin
// derrière lui. C'est la raison d'une liste ordonnée plutôt que d'un
// objet.

const fs = require("fs");
const path = require("path");

const APPLIQUER = process.argv.includes("--appliquer");
const ANNULER = process.argv.includes("--annuler");
const SUFFIXE = ".avant-renommage";

const EXTENSIONS = new Set([
  ".tsx", ".ts", ".jsx", ".js", ".html", ".css",
  ".json", ".md", ".yml", ".yaml", ".properties", ".ps1",
]);

const IGNORES = new Set([
  "node_modules", "dist", "build", ".git", "coverage",
  "cdk.out", ".next", ".vite",
]);

// Les fichiers qu'on ne renomme jamais : package-lock décrit des
// dépendances, pas le produit, et le toucher brouille un diff. Le
// script s'exclut lui-même, sinon il se réécrit en cours de route et
// se signale dans son propre relevé.
const FICHIERS_EXCLUS = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  path.basename(__filename),
  "migrer-surfaces.js",
]);

const REMPLACEMENTS = [
  // Les formes composées d'abord.
  ["Terra&nbsp;HR", "HR&nbsp;UP"],
  ["TERRA&nbsp;HR", "HR&nbsp;UP"],

  // Le logo de la page d'accueil, qui coupe le nom en deux pour
  // alléger la seconde moitié. « HR&nbsp;<em>UP</em> » garde l'espace
  // visible tout en laissant « UP » dans sa graisse plus fine.
  ["Terra<em>HR</em>", "HR&nbsp;<em>UP</em>"],

  // Les formes avec espace.
  ["TERRA HR", "HR UP"],
  ["Terra HR", "HR UP"],
  ["terra HR", "HR UP"],

  // Les identifiants : noms de fichiers téléchargés, domaines d'UID
  // iCalendar, valeurs de tag. La casse est conservée.
  ["TERRA-HR", "HR-UP"],
  ["Terra-HR", "HR-UP"],
  ["terra-hr", "hr-up"],
  ["TerraHR", "HRUp"],
  ["terrahr", "hrup"],

  // La clé de stockage du thème. La changer remet à zéro le choix
  // mémorisé des salariés — sans conséquence, le thème repart sur
  // « système » — mais il vaut mieux que le code ne garde pas un nom
  // que le produit n'a plus.
  ["terra-theme", "hrup-theme"],
  ["terra-langue", "hrup-langue"],
];

/** Ce qui reste après coup : un « terra » isolé qu'aucun motif n'a
 *  attrapé. Signalé, jamais remplacé — « Terra » seul peut être un mot
 *  dans une phrase, et deviner le contexte est le bon moyen d'abîmer
 *  une chaîne de caractères. */
const RESTANT = /terra/gi;

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
    } else if (EXTENSIONS.has(path.extname(e.name))
      && !FICHIERS_EXCLUS.has(e.name)
      && !e.name.endsWith(SUFFIXE)) {
      acc.push(complet);
    }
  }
  return acc;
}

function main() {
  const liste = fichiers(process.cwd());

  if (liste.length === 0) {
    console.error("✖ Aucun fichier trouvé.");
    console.error("  Lance ce script depuis pfe-rh\\, le dossier qui contient");
    console.error("  frontend et pfe-rh-serverless.");
    process.exit(1);
  }

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

  console.log(`${liste.length} fichier(s) examiné(s) sous ${process.cwd()}`);
  console.log("");

  const rapport = [];
  const parMotif = new Map();
  const restants = [];
  let total = 0;

  for (const f of liste) {
    const avant = fs.readFileSync(f, "utf8");
    if (!/terra/i.test(avant)) continue;

    let apres = avant;
    let n = 0;

    for (const [de, vers] of REMPLACEMENTS) {
      // split/join plutôt qu'une expression régulière : le motif
      // contient des caractères qui auraient une signification en
      // regex, et l'échapper pour rien complique sans rien apporter.
      const morceaux = apres.split(de);
      if (morceaux.length > 1) {
        const combien = morceaux.length - 1;
        n += combien;
        parMotif.set(de, (parMotif.get(de) || 0) + combien);
        apres = morceaux.join(vers);
      }
    }

    // Ce qui échappe encore aux motifs, ligne par ligne, pour pouvoir
    // aller voir.
    apres.split("\n").forEach((ligne, i) => {
      if (RESTANT.test(ligne)) {
        restants.push({ ou: `${f}:${i + 1}`, ligne: ligne.trim().slice(0, 90) });
      }
      RESTANT.lastIndex = 0;
    });

    if (n === 0) continue;

    total += n;
    rapport.push({ f, n });

    if (APPLIQUER) {
      const sauvegarde = f + SUFFIXE;
      if (!fs.existsSync(sauvegarde)) fs.copyFileSync(f, sauvegarde);
      fs.writeFileSync(f, apres, "utf8");
    }
  }

  rapport.sort((a, b) => b.n - a.n);
  for (const { f, n } of rapport) {
    console.log(`  ${String(n).padStart(4)}  ${f}`);
  }

  console.log("");
  console.log("Par motif :");
  for (const [de, n] of [...parMotif.entries()].sort((a, b) => b[1] - a[1])) {
    const vers = REMPLACEMENTS.find(([d]) => d === de)[1];
    console.log(`  ${String(n).padStart(4)}  « ${de} »  →  « ${vers} »`);
  }

  console.log("");
  console.log(`${total} remplacement(s) dans ${rapport.length} fichier(s).`);

  if (restants.length) {
    console.log("");
    console.log(`${restants.length} mention(s) de « terra » qu'aucun motif `
      + "n'attrape, laissée(s) intacte(s) :");
    for (const { ou, ligne } of restants.slice(0, 25)) {
      console.log(`  ${ou}`);
      console.log(`      ${ligne}`);
    }
    if (restants.length > 25) {
      console.log(`  … et ${restants.length - 25} autre(s)`);
    }
    console.log("  À regarder à la main : « Terra » isolé peut être un mot");
    console.log("  dans une phrase, et deviner le contexte abîmerait le texte.");
  }

  console.log("");
  if (APPLIQUER) {
    console.log("✔ Écrit. Sauvegardes en *" + SUFFIXE + ".");
    console.log("  Pour revenir : node renommer-hr-up.js --annuler");
    console.log("");
    console.log("  Il reste deux choses à faire à la main :");
    console.log("   · le logo, s'il contient le nom en image (SVG ou PNG)");
    console.log("   · le nom de domaine, s'il est déjà réservé");
    console.log("");
    console.log("  Quand tout est vérifié, supprime les sauvegardes :");
    console.log(`  Get-ChildItem -Recurse -Filter *${SUFFIXE} | Remove-Item`);
  } else {
    console.log("Essai à blanc — rien n'a été écrit.");
    console.log("Pour appliquer : node renommer-hr-up.js --appliquer");
  }
}

main();