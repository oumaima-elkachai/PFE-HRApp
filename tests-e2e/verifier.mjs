#!/usr/bin/env node
// Vérification de bout en bout de HR UP, sur l'API réellement déployée.
//
//   node verifier.mjs                 tous les cas actifs
//   node verifier.mjs --filtre SEC    seulement ceux dont l'id contient SEC
//   node verifier.mjs --tout          y compris les cas marqués inactifs
//   node verifier.mjs --bavard        affiche le corps des réponses
//
// Sort en code 1 si un cas échoue : utilisable dans le pipeline.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { cas } from "./cas.mjs";

const ICI = dirname(fileURLToPath(import.meta.url));

// ── Configuration ───────────────────────────────────────────────

function chargerEnv() {
  try {
    for (const ligne of readFileSync(join(ICI, ".env"), "utf8").split("\n")) {
      const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* pas de fichier .env : on se rabat sur l'environnement */
  }
}
chargerEnv();

const CFG = {
  api: (process.env.URL_API || "").replace(/\/+$/, ""),
  region: process.env.AWS_REGION || "eu-west-3",
  clientId: process.env.COGNITO_CLIENT_ID || "",
  // L'autorisateur d'API Gateway valide en général le jeton d'identité.
  // Bascule sur "access" si ton autorisateur attend le jeton d'accès.
  typeJeton: process.env.TYPE_JETON || "id",
  comptes: {
    rh: [process.env.RH_UTILISATEUR, process.env.RH_MOTDEPASSE],
    salarie: [process.env.SALARIE_UTILISATEUR, process.env.SALARIE_MOTDEPASSE],
    candidat: [process.env.CANDIDAT_UTILISATEUR, process.env.CANDIDAT_MOTDEPASSE],
  },
};

const args = process.argv.slice(2);
const opt = {
  filtre: args.includes("--filtre") ? args[args.indexOf("--filtre") + 1] : null,
  tout: args.includes("--tout"),
  bavard: args.includes("--bavard"),
};

// ── Affichage ───────────────────────────────────────────────────

const C = {
  vert: (s) => `\x1b[32m${s}\x1b[0m`,
  rouge: (s) => `\x1b[31m${s}\x1b[0m`,
  jaune: (s) => `\x1b[33m${s}\x1b[0m`,
  gris: (s) => `\x1b[90m${s}\x1b[0m`,
  gras: (s) => `\x1b[1m${s}\x1b[0m`,
};

function titre(t) {
  console.log("\n" + C.gras(t));
  console.log(C.gris("─".repeat(Math.max(t.length, 60))));
}

// ── Authentification ────────────────────────────────────────────

const cognito = new CognitoIdentityProviderClient({ region: CFG.region });
const jetons = {};

async function obtenirJeton(role) {
  if (jetons[role] !== undefined) return jetons[role];

  const [utilisateur, motdepasse] = CFG.comptes[role] || [];
  if (!utilisateur || !motdepasse) {
    jetons[role] = null;
    return null;
  }

  try {
    const r = await cognito.send(
      new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: CFG.clientId,
        AuthParameters: { USERNAME: utilisateur, PASSWORD: motdepasse },
      }));
    const res = r.AuthenticationResult;
    if (!res) {
      console.log(C.jaune(`  ⚠ ${role} : Cognito demande une étape supplémentaire ` +
        `(${r.ChallengeName}). Change le mot de passe une fois dans l'application.`));
      jetons[role] = null;
      return null;
    }
    jetons[role] = CFG.typeJeton === "access" ? res.AccessToken : res.IdToken;
    return jetons[role];
  } catch (e) {
    console.log(C.jaune(`  ⚠ ${role} : connexion impossible — ${e.name}: ${e.message}`));
    jetons[role] = null;
    return null;
  }
}

// ── Exécution d'un cas ──────────────────────────────────────────

function altere(jeton) {
  // change un caractère de la signature, sans toucher à la structure
  const p = jeton.split(".");
  if (p.length !== 3) return jeton + "x";
  const s = p[2];
  p[2] = (s[0] === "A" ? "B" : "A") + s.slice(1);
  return p.join(".");
}

async function executer(c) {
  const attendus = Array.isArray(c.attendu) ? c.attendu : [c.attendu];
  const entetes = { Accept: "application/json" };

  if (c.jetonBrut) {
    entetes.Authorization = `Bearer ${c.jetonBrut}`;
  } else if (c.role) {
    const j = await obtenirJeton(c.role);
    if (!j) return { etat: "ignore", detail: `pas de jeton ${c.role}` };
    entetes.Authorization = `Bearer ${c.altererJeton ? altere(j) : j}`;
  }

  let reponse, texte;
  const debut = Date.now();
  try {
    const options = { method: c.methode || "GET", headers: entetes };
    if (c.corps !== undefined) {
      options.body = JSON.stringify(c.corps);
      entetes["Content-Type"] = "application/json";
    }
    reponse = await fetch(CFG.api + c.route, options);
    texte = await reponse.text();
  } catch (e) {
    return { etat: "echec", detail: `requête impossible — ${e.message}` };
  }
  const duree = Date.now() - debut;

  if (!attendus.includes(reponse.status)) {
    return {
      etat: "echec", duree,
      detail: `attendu ${attendus.join(" ou ")}, obtenu ${reponse.status}` +
        (texte ? ` — ${texte.slice(0, 120)}` : ""),
    };
  }

  if (c.vide) {
    const suspect = /"(employes|matricule|salaire|cin|bulletins)"/i.test(texte);
    if (suspect) {
      return { etat: "echec", duree,
        detail: "le refus renvoie des données métier — " + texte.slice(0, 120) };
    }
  }

  if (c.verifier) {
    let donnees = null;
    try { donnees = JSON.parse(texte); } catch { /* réponse non JSON */ }
    const probleme = c.verifier(donnees, texte);
    if (probleme) return { etat: "echec", duree, detail: probleme };
  }

  if (opt.bavard && texte) {
    console.log(C.gris("      " + texte.slice(0, 300)));
  }
  return { etat: "succes", duree };
}

// ── Programme principal ─────────────────────────────────────────

async function principal() {
  console.log(C.gras("\n  HR UP — vérification de bout en bout"));
  console.log(C.gris(`  API : ${CFG.api || "(non configurée)"}`));
  console.log(C.gris(`  Région : ${CFG.region} · jeton : ${CFG.typeJeton}`));

  if (!CFG.api) {
    console.error(C.rouge("\n  URL_API n'est pas définie. Copie .env.exemple vers .env."));
    process.exit(2);
  }

  let aJouer = cas.filter((c) => opt.tout || c.actif !== false);
  if (opt.filtre) {
    aJouer = aJouer.filter((c) =>
      c.id.toLowerCase().includes(opt.filtre.toLowerCase()) ||
      c.titre.toLowerCase().includes(opt.filtre.toLowerCase()));
  }

  const inactifs = cas.length - cas.filter((c) => c.actif !== false).length;

  titre(`  ${aJouer.length} cas à jouer`);

  const bilan = { succes: 0, echec: 0, ignore: 0 };
  const echecs = [];

  for (const c of aJouer) {
    const r = await executer(c);
    bilan[r.etat]++;
    const marque = { succes: C.vert("  OK  "), echec: C.rouge("  KO  "),
                     ignore: C.jaune(" IGN  ") }[r.etat];
    const temps = r.duree ? C.gris(` ${r.duree} ms`) : "";
    console.log(`${marque} ${C.gras(c.id.padEnd(8))} ${c.titre}${temps}`);
    if (r.detail) {
      console.log(C.gris(`         ${r.detail}`));
      if (r.etat === "echec") echecs.push({ ...c, detail: r.detail });
    }
  }

  titre("  Bilan");
  console.log(`  ${C.vert(bilan.succes + " réussis")}   ` +
              `${bilan.echec ? C.rouge(bilan.echec + " échoués") : "0 échoué"}   ` +
              `${C.jaune(bilan.ignore + " ignorés")}`);
  if (inactifs && !opt.tout) {
    console.log(C.gris(`  ${inactifs} cas désactivés dans cas.mjs ` +
      `(actif: false) — relance avec --tout pour les inclure`));
  }

  if (echecs.length) {
    titre("  À corriger");
    for (const e of echecs) console.log(`  ${C.rouge("•")} ${e.id} — ${e.detail}`);
  }

  console.log("");
  process.exit(bilan.echec ? 1 : 0);
}

principal().catch((e) => {
  console.error(C.rouge("\n  Erreur inattendue : " + e.stack));
  process.exit(2);
});
