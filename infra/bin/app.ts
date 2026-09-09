#!/usr/bin/env node
// infra/bin/app.ts
//
//   npx cdk deploy --all -c etape=dev
//   npx cdk deploy --all -c etape=prod
//
// L'étape par défaut est dev, afin qu'un déploiement distrait ne touche
// jamais la production.

import "source-map-support/register";
import { App, Tags } from "aws-cdk-lib";
import { obtenirEtape } from "../lib/config/etapes";
import { DataStack } from "../lib/data-stack";
import { AuthStack } from "../lib/auth-stack";
import { ApiStack } from "../lib/api-stack";
import { FrontStack } from "../lib/front-stack";
import { CicdStack } from "../lib/cicd-stack";

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
Tags.of(app).add("Application", "TERRA-HR");
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
  description: `TERRA HR — tables DynamoDB, stockage documentaire et budget (${etape.nom})`,
});

const auth = new AuthStack(app, `PfeRh-${etape.nom}-Auth`, {
  env,
  etape,
  description: `TERRA HR — identité et autorisation (${etape.nom})`,
});

const api = new ApiStack(app, `PfeRh-${etape.nom}-Api`, {
  env,
  etape,
  tables: donnees.tables,
  compartimentDocuments: donnees.compartimentDocuments,
  pool: auth.pool,
  clientWeb: auth.clientWeb,
  description: `TERRA HR — API HTTP et fonction applicative (${etape.nom})`,
});

const front = new FrontStack(app, `PfeRh-${etape.nom}-Front`, {
  env,
  etape,
  description: `TERRA HR — hébergement de l'application web (${etape.nom})`,
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
  description: `TERRA HR — rôle de déploiement GitHub Actions (${etape.nom})`,
});

import { SupervisionStack } from "../lib/supervision-stack";

const supervision = new SupervisionStack(app, `PfeRh-${etape.nom}-Supervision`, {
  env,
  etape,
  fonction: api.fonction,
  api: api.api,
  tables: donnees.tables,
  description: `TERRA HR — tableau de bord et alarmes (${etape.nom})`,
});

app.synth();

// Références conservées pour les stacks à venir (supervision, alarmes)
void api;
void front;
void cicd;
void supervision;

