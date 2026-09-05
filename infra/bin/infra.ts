#!/usr/bin/env node
// infra/bin/app.ts
//
// Point d'entrée. Sélection de l'étape par contexte :
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



const app = new App();

const etape = obtenirEtape(app.node.tryGetContext("etape") ?? "dev");

const env = { account: etape.compte, region: etape.region };

// Les étiquettes posées au niveau de l'application se propagent à toutes
// les ressources de toutes les stacks. Environment et CostCenter sont
// activées comme cost allocation tags dans la console de facturation,
// ce qui permet de suivre le coût par environnement.
Tags.of(app).add("Project", "PFE-RH");
Tags.of(app).add("Application", "TERRA-HR");
Tags.of(app).add("Environment", etape.nom);
Tags.of(app).add("Owner", etape.emailAlertes);
Tags.of(app).add("CostCenter", "PFE-2026");
Tags.of(app).add("ManagedBy", "AWS-CDK");

// ── Stacks ──────────────────────────────────────────────────────────

const donnees = new DataStack(app, `PfeRh-${etape.nom}-Data`, {
  env,
  etape,
  description: `TERRA HR — tables DynamoDB et stockage documentaire (${etape.nom})`,
});

const auth = new AuthStack(app, `PfeRh-${etape.nom}-Auth`, {
  env,
  etape,
  description: `TERRA HR — identité et autorisation (${etape.nom})`,
});
void auth;

// Stacks à venir :
//   AuthStack   — pool Cognito, groupes, client applicatif
//   ApiStack    — API HTTP, autorisation JWT, fonctions par domaine
//   FrontStack  — S3 et CloudFront
//   SupervisionStack — alarmes, tableau de bord, budget

app.synth();

// Référence conservée pour les stacks suivantes
void donnees;
