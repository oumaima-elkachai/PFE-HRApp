// src/utils/adresse.js
//
// Fabrication d'une adresse professionnelle à partir d'un nom.
//
// ── Le problème que ça résout ──────────────────────────────────────
//
// Un candidat postule avec `elkachaioumaima@gmail.com`. Il est
// embauché. Son compte HR UP ne peut pas rester sur cette adresse :
//
//   · elle ne dit pas qu'il appartient à l'entreprise ;
//   · elle ne figurera jamais dans l'annuaire, filtré par domaine ;
//   · et le jour où il part, l'entreprise ne contrôle pas la boîte.
//
// Il lui faut `ouma.elkachai@esprit.tn`. Cette adresse, quelqu'un doit
// la fabriquer — et la fabriquer deux fois de la même façon, sinon on
// obtient `o.elkachai` chez l'un et `ouma.e` chez l'autre.
//
// ── Ce que ce module ne fait PAS ───────────────────────────────────
//
// Il ne crée aucune boîte aux lettres. HR UP n'a pas accès au serveur
// de messagerie de l'entreprise. Il fabrique l'IDENTIFIANT de
// connexion, qui a la forme d'une adresse — et c'est pour cette raison
// que le mot de passe provisoire ne doit jamais être envoyé là.

const crypto = require("crypto");

/** Longueur maximale de la partie avant l'arobase (RFC 5321) */
const LOCAL_MAX = 64;

/**
 * Lettres latines que la décomposition NFD ne sait PAS traiter.
 *
 * `é` est un `e` plus un accent : NFD les sépare et on retire
 * l'accent. Mais `ı`, `ø`, `ł`, `đ`, `ß` sont des lettres à part
 * entière, sans forme décomposée. Elles tombaient donc dans le filtre
 * `[^a-z0-9-]` et disparaissaient **sans bruit** : « Çağrı » donnait
 * `cagr`, et personne n'aurait vu que le nom avait perdu une lettre.
 *
 * Une adresse fausse est pire qu'une adresse refusée.
 */
const LETTRES_A_PART = {
  ı: "i", ø: "o", đ: "d", ð: "d", ł: "l", ħ: "h", ŧ: "t",
  æ: "ae", œ: "oe", ß: "ss", þ: "th", ƒ: "f",
};

/**
 * Un morceau de nom, réduit à ce qui est acceptable dans une adresse.
 *
 * Les accents sont décomposés puis leurs signes retirés : « Hédi »
 * devient « hedi » et non « h di ». Les apostrophes disparaissent
 * (« N'Guyen » → « nguyen »), les espaces et tirets deviennent un seul
 * tiret (« Ben Ali » → « ben-ali », « Jean-Pierre » reste
 * « jean-pierre »).
 */
function morceau(valeur) {
  return String(valeur ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // les signes diacritiques
    .toLowerCase()
    .replace(/[ıøđðłħŧæœßþƒ]/g, (c) => LETTRES_A_PART[c] ?? c)
    .replace(/['’`]/g, "")             // apostrophes : collées
    .replace(/[\s_.]+/g, "-")          // espaces, points, soulignés
    .replace(/[^a-z0-9-]/g, "")        // tout le reste disparaît
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * La base d'une adresse : `prenom.nom`.
 *
 * @returns {string|null} null si rien d'utilisable ne reste — un nom
 *   entièrement en arabe, par exemple. Dans ce cas la RH saisit
 *   l'adresse elle-même : une translittération automatique produirait
 *   des identifiants que personne ne reconnaît.
 */
function baseDe(prenom, nom) {
  const p = morceau(prenom);
  const n = morceau(nom);

  const base = [p, n].filter(Boolean).join(".");
  if (!base) return null;

  return base.slice(0, LOCAL_MAX - 3);   // on garde la place d'un « 99 »
}

/**
 * L'adresse professionnelle, unique.
 *
 * `estPrise` est une fonction asynchrone : il faut interroger la base
 * ET Cognito, parce qu'un compte peut exister sans fiche (un ancien
 * salarié dont la fiche a été archivée) et l'inverse.
 *
 * @param {object} p
 * @param {string} p.prenom
 * @param {string} p.nom
 * @param {string} p.domaine        ex. « esprit.tn »
 * @param {(email: string) => Promise<boolean>} p.estPrise
 * @param {number} [p.essaisMax]
 * @returns {Promise<{email: string} | {erreur: string}>}
 */
async function fabriquer({ prenom, nom, domaine, estPrise, essaisMax = 30 }) {
  const dom = String(domaine ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!dom || !dom.includes(".")) {
    return {
      erreur:
        "Aucun domaine d'entreprise n'est déclaré. Renseignez-le dans "
        + "Réglages › Entreprise avant d'attribuer des adresses "
        + "professionnelles.",
    };
  }

  const base = baseDe(prenom, nom);
  if (!base) {
    return {
      erreur:
        `Impossible de fabriquer une adresse à partir de « ${prenom ?? ""} `
        + `${nom ?? ""} ». Saisissez l'adresse professionnelle à la main `
        + `sur la fiche.`,
    };
  }

  // Le premier essai est l'adresse nue. Les suivants ajoutent un
  // chiffre : `mohamed.ali`, puis `mohamed.ali2`. Pas de `.1` — une
  // personne seule ne doit pas porter un numéro.
  for (let i = 1; i <= essaisMax; i += 1) {
    const candidate = i === 1 ? `${base}@${dom}` : `${base}${i}@${dom}`;
    // eslint-disable-next-line no-await-in-loop
    if (!(await estPrise(candidate))) return { email: candidate };
  }

  return {
    erreur:
      `Plus de ${essaisMax} adresses commençant par « ${base} » existent `
      + `déjà. Saisissez l'adresse à la main.`,
  };
}

// ── Le mot de passe provisoire ─────────────────────────────────────
//
// Fabriqué ici et non par Cognito, parce qu'on doit le CONNAÎTRE pour
// le transmettre. Avec `MessageAction: "SUPPRESS"`, Cognito n'envoie
// rien et ne nous dit rien ; sans mot de passe fourni, personne ne
// pourrait se connecter.
//
// L'alphabet évite les caractères qu'on confond en les lisant ou en les
// recopiant : O et 0, l et 1, I. La RH lit souvent ce mot de passe à
// voix haute, ou le recopie dans un message.

const MINUS = "abcdefghijkmnopqrstuvwxyz";   // sans l
const MAJUS = "ABCDEFGHJKLMNPQRSTUVWXYZ";    // sans I ni O
const CHIFFRES = "23456789";                 // sans 0 ni 1
const SIGNES = "!#$%&*+-=?@";

/**
 * Un mot de passe provisoire conforme à la politique par défaut d'un
 * pool Cognito : au moins une minuscule, une majuscule, un chiffre et
 * un symbole.
 *
 * Garanti par construction, et non par un tirage qu'on espère bon :
 * un caractère de chaque classe est placé d'abord, puis le reste est
 * tiré, puis l'ensemble est mélangé. Un tirage purement aléatoire de
 * 12 caractères échoue environ une fois sur cinquante — et cet échec
 * arriverait chez la RH, pas ici.
 */
function motDePasseProvisoire(longueur = 14) {
  const taille = Math.max(12, Math.min(32, longueur));
  const tout = MINUS + MAJUS + CHIFFRES + SIGNES;

  const tirer = (alphabet) => alphabet[crypto.randomInt(alphabet.length)];

  const lettres = [tirer(MINUS), tirer(MAJUS), tirer(CHIFFRES), tirer(SIGNES)];
  while (lettres.length < taille) lettres.push(tirer(tout));

  // Mélange de Fisher-Yates, avec une source cryptographique : sans
  // lui, les quatre premiers caractères seraient toujours dans le même
  // ordre de classes.
  for (let i = lettres.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [lettres[i], lettres[j]] = [lettres[j], lettres[i]];
  }

  return lettres.join("");
}

/**
 * Une adresse est-elle « personnelle » ?
 *
 * C'est-à-dire : hors des domaines de l'entreprise. On ne juge pas sur
 * une liste de fournisseurs (gmail, yahoo…) — elle serait toujours
 * incomplète, et une entreprise peut parfaitement utiliser un domaine
 * qui n'y figure pas.
 */
function estPersonnelle(email, domaines = []) {
  const apres = String(email ?? "").trim().toLowerCase().split("@")[1];
  if (!apres) return false;
  const liste = (domaines ?? []).map((d) => String(d).toLowerCase());
  if (liste.length === 0) return false;   // sans domaine déclaré, on ne juge pas
  return !liste.some((d) => apres === d || apres.endsWith(`.${d}`));
}

module.exports = {
  morceau,
  baseDe,
  fabriquer,
  motDePasseProvisoire,
  estPersonnelle,
  LOCAL_MAX,
};