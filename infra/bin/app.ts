#!/usr/bin/env node
// infra/bin/app.ts
//
//   npx cdk deploy --all -c etape=dev
//   npx cdk deploy --all -c etape=prod
//
// L'étape par défaut est dev, afin qu'un déploiement distrait ne touche
// jamais la production.
//
// ══ Ce qui est corrigé dans cette version ═══════════════════════════
//
// ── 1. app.synth() était appelé au milieu du fichier ───────────────
//
// La version précédente faisait ceci :
//
//     const supervision = new SupervisionStack(...);
//     app.synth();                                    // ← ici
//     import { TachesStack } from "../lib/taches-stack";
//     const taches = new TachesStack(...);            // ← après
//
// CDK construit l'assemblage au premier appel de `synth()` et le met en
// cache : les appels suivants renvoient le même. Tout construct créé
// après cette ligne n'entre donc dans aucun modèle CloudFormation.
//
// Conséquence : `TachesStack` n'a jamais été déployée. Pas d'erreur,
// pas d'avertissement — le fichier compile, `cdk deploy --all` réussit,
// et la pile n'existe nulle part. C'est ce que confirme la liste des
// piles du compte : six, et pas de `PfeRh-dev-Taches`.
//
// `synth()` est maintenant la dernière instruction du fichier, et les
// imports sont tous en tête. Un `import` placé au milieu du code n'est
// pas une erreur en TypeScript — il est remonté à la compilation — mais
// il masque visuellement l'ordre réel d'exécution, et c'est exactement
// ce qui a permis au défaut de passer inaperçu.
//
// ── 2. L'URL de l'application n'est plus écrite en dur ─────────────
//
// `TachesStack` recevait `"https://d2cc1fkfzt3nok.cloudfront.net"`,
// recopié à la main. Si la distribution est un jour recréée — et une
// pile Front détruite puis redéployée en change le nom — les courriels
// de rappel pointeraient vers une adresse morte, sans que rien ne le
// signale.
//
// Elle est maintenant lue sur la pile Front. CDK en déduit l'ordre de
// déploiement : Front avant Taches.

import "source-map-support/register";
import { App, Tags } from "aws-cdk-lib";
import { obtenirEtape } from "../lib/config/etapes";
import { DataStack } from "../lib/data-stack";
import { AuthStack } from "../lib/auth-stack";
import { ApiStack } from "../lib/api-stack";
import { FrontStack } from "../lib/front-stack";
import { CicdStack } from "../lib/cicd-stack";
import { SupervisionStack } from "../lib/supervision-stack";
import { TachesStack } from "../lib/taches-stack";

const app = new App();
const etape = obtenirEtape(app.node.tryGetContext("etape") ?? "dev");
const env = { account: etape.compte, region: etape.region };

// ── Étiquetage global ───────────────────────────────────────────────
// Déclaré avant les stacks pour la lisibilité. CDK les applique de
// toute façon à la synthèse, sur l'ensemble de l'arbre.
//
// Environment et CostCenter sont activées comme cost allocation tags
// dans la console de facturation : elles permettent de suivre le coût
// par environnement et alimentent le filtre du budget mensuel.
Tags.of(app).add("Project", "PFE-RH");
Tags.of(app).add("Application", "HR-UP");
Tags.of(app).add("Environment", etape.nom);
Tags.of(app).add("Owner", etape.emailAlertes);
Tags.of(app).add("CostCenter", "PFE-2026");
Tags.of(app).add("ManagedBy", "AWS-CDK");

// ── Stacks ──────────────────────────────────────────────────────────
// L'ordre de déploiement est déduit des dépendances, non de l'ordre
// d'écriture : CDK déploie Data et Auth avant Api, qui référence leurs
// ressources.

const donnees = new DataStack(app, `PfeRh-${etape.nom}-Data`, {
  env,
  etape,
  description: `HR UP — tables DynamoDB, stockage documentaire et budget (${etape.nom})`,
});

const auth = new AuthStack(app, `PfeRh-${etape.nom}-Auth`, {
  env,
  etape,
  description: `HR UP — identité et autorisation (${etape.nom})`,
});

const api = new ApiStack(app, `PfeRh-${etape.nom}-Api`, {
  env,
  etape,
  tables: donnees.tables,
  compartimentDocuments: donnees.compartimentDocuments,
  pool: auth.pool,
  clientWeb: auth.clientWeb,
  description: `HR UP — API HTTP et fonction applicative (${etape.nom})`,
});

const front = new FrontStack(app, `PfeRh-${etape.nom}-Front`, {
  env,
  etape,
  description: `HR UP — hébergement de l'application web (${etape.nom})`,
});

// Indépendante des autres : elle ne crée qu'un rôle IAM, déployé une
// seule fois depuis un poste de développement. C'est elle qui rend le
// pipeline possible, elle ne peut donc pas en dépendre.
const cicd = new CicdStack(app, `PfeRh-${etape.nom}-Cicd`, {
  env,
  etape,
  proprietaire: "oumaima-elkachai",
  depot: "PFE-HRApp",
  branche: "main",
  description: `HR UP — rôle de déploiement GitHub Actions (${etape.nom})`,
});

const supervision = new SupervisionStack(app, `PfeRh-${etape.nom}-Supervision`, {
  env,
  etape,
  fonction: api.fonction,
  api: api.api,
  tables: donnees.tables,
  description: `HR UP — tableau de bord et alarmes (${etape.nom})`,
});

// Traitements planifiés. En dev, `COURRIEL_SIMULE` vaut true : les
// rappels sont journalisés au lieu d'être envoyés, ce qui rend le
// déploiement sans effet sur les boîtes aux lettres.
//
// L'adresse expéditrice doit être vérifiée dans SES avant tout envoi
// réel. Tant que l'étape est `dev`, son absence de vérification ne
// bloque rien.
const taches = new TachesStack(app, `PfeRh-${etape.nom}-Taches`, {
  env,
  etape,
  tables: donnees.tables,
  expediteur: "elkachaioumaima@gmail.com",
  urlApplication: `https://${front.distribution.distributionDomainName}`,
  description: `HR UP — traitements planifiés (${etape.nom})`,
});

void api;
void front;
void cicd;
void supervision;
void taches;

// Dernière instruction du fichier : tout ce qui précède est dans
// l'assemblage, et rien ne peut lui être ajouté après.
app.synth();