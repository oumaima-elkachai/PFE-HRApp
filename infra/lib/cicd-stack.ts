// infra/lib/cicd-stack.ts
//
// Fédération d'identité entre GitHub Actions et AWS.
//
// Aucune clé d'accès n'est stockée dans GitHub. À chaque exécution, le
// workflow obtient un jeton signé par GitHub, l'échange contre des
// identifiants AWS temporaires, et les perd à la fin du travail. Une
// fuite du dépôt n'expose donc aucun secret durable.

import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  OpenIdConnectProvider,
  Role,
  WebIdentityPrincipal,
  PolicyStatement,
  Effect,
} from "aws-cdk-lib/aws-iam";
import { ConfigEtape, nommer } from "./config/etapes";

export interface CicdStackProps extends StackProps {
  readonly etape: ConfigEtape;
  /** Propriétaire du dépôt GitHub */
  readonly proprietaire: string;
  /** Nom du dépôt */
  readonly depot: string;
  /**
   * Restreindre le rôle à une branche précise.
   * Sans cette restriction, toute branche du dépôt — y compris celle
   * d'une pull request extérieure — pourrait déclencher un déploiement.
   */
  readonly branche?: string;
}

export class CicdStack extends Stack {
  public readonly roleDeploiement: Role;

  constructor(scope: Construct, id: string, props: CicdStackProps) {
    super(scope, id, props);

    const { etape, proprietaire, depot, branche } = props;

    // Un seul fournisseur OIDC par compte AWS. S'il existe déjà,
    // remplacer cette ligne par OpenIdConnectProvider.fromOpenIdConnectProviderArn.
    const fournisseur = new OpenIdConnectProvider(this, "FournisseurGitHub", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    // Portée du jeton accepté : dépôt, et branche si précisée
    const sujet = branche
      ? `repo:${proprietaire}/${depot}:ref:refs/heads/${branche}`
      : `repo:${proprietaire}/${depot}:*`;

    this.roleDeploiement = new Role(this, "RoleDeploiement", {
      roleName: nommer(etape.nom, "github-actions"),
      description: `Déploiement de TERRA HR depuis GitHub Actions (${etape.nom})`,
      assumedBy: new WebIdentityPrincipal(fournisseur.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": sujet,
        },
      }),
    });

    // Le rôle n'a aucune permission de création directe : il ne sait
    // qu'endosser les rôles créés par cdk bootstrap, qui portent eux
    // les autorisations réelles. Même principe que l'identité locale.
    this.roleDeploiement.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["sts:AssumeRole"],
      resources: [`arn:aws:iam::${this.account}:role/cdk-hnb659fds-*`],
    }));

    this.roleDeploiement.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["ssm:GetParameter"],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/hnb659fds/version`,
      ],
    }));

    // Lecture des sorties de pile, pour injecter l'URL de l'API dans le
    // build du front sans la coder en dur dans le dépôt
    this.roleDeploiement.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:ListStacks",
      ],
      resources: ["*"],
    }));

    // Publication du front et purge du cache
    this.roleDeploiement.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:GetObject"],
      resources: [
        `arn:aws:s3:::pferh-${etape.nom}-front-${this.account}`,
        `arn:aws:s3:::pferh-${etape.nom}-front-${this.account}/*`,
      ],
    }));

    this.roleDeploiement.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"],
      resources: ["*"],
    }));

    new CfnOutput(this, "ArnRoleDeploiement", {
      value: this.roleDeploiement.roleArn,
      description: "À reporter dans le secret AWS_ROLE_ARN du dépôt GitHub",
    });
  }
}