// infra/lib/front-stack.ts
//
// Hébergement de l'application React.
//
//   S3         — stocke les fichiers, jamais exposé publiquement
//   CloudFront — sert le contenu en HTTPS depuis le réseau de diffusion
//
// Le compartiment reste privé : CloudFront y accède via un contrôle
// d'accès à l'origine (OAC), qui remplace l'ancienne identité d'accès.

import { Stack, StackProps, Duration, CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  Bucket, BucketEncryption, BlockPublicAccess,
} from "aws-cdk-lib/aws-s3";
import {
  Distribution, ViewerProtocolPolicy, AllowedMethods, CachedMethods,
  CachePolicy, PriceClass, HttpVersion,
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { ConfigEtape, nommer } from "./config/etapes";

export interface FrontStackProps extends StackProps {
  readonly etape: ConfigEtape;
}

export class FrontStack extends Stack {
  public readonly compartiment: Bucket;
  public readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: FrontStackProps) {
    super(scope, id, props);

    const { etape } = props;
    const estProd = etape.nom === "prod";

    // ── Compartiment ──────────────────────────────────────────────
    this.compartiment = new Bucket(this, "CompartimentFront", {
      bucketName: nommer(etape.nom, `front-${this.account}`),
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: estProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !estProd,
    });

    // ── Distribution ──────────────────────────────────────────────
    this.distribution = new Distribution(this, "Distribution", {
      comment: `TERRA HR — application web (${etape.nom})`,

      defaultBehavior: {
        // OAC : CloudFront signe ses requêtes vers S3, le compartiment
        // n'a jamais besoin d'être public
        origin: S3BucketOrigin.withOriginAccessControl(this.compartiment),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },

      defaultRootObject: "index.html",

      // React Router gère la navigation côté client : toute URL inconnue
      // doit renvoyer index.html, sinon un rafraîchissement sur
      // /employe/factures produirait une erreur 404.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.minutes(5),
        },
      ],

      // Europe et Amérique du Nord seulement : suffisant ici, et
      // sensiblement moins cher que la couverture mondiale
      priceClass: PriceClass.PRICE_CLASS_100,

      httpVersion: HttpVersion.HTTP2_AND_3,
      enableLogging: false, // les journaux d'accès sont facturés au volume
    });

    // ── Sorties ───────────────────────────────────────────────────
    new CfnOutput(this, "UrlApplication", {
      value: `https://${this.distribution.distributionDomainName}`,
      exportName: `${etape.nom}-url-application`,
      description: "Adresse publique de l'application",
    });

    new CfnOutput(this, "NomCompartimentFront", {
      value: this.compartiment.bucketName,
      description: "Destination du build : aws s3 sync dist/",
    });

    new CfnOutput(this, "IdDistribution", {
      value: this.distribution.distributionId,
      description: "Pour vider le cache après un déploiement",
    });
  }
}