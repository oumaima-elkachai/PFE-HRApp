# frontend/publier.ps1
#
# Construit et publie l'application sur S3, puis invalide le cache
# CloudFront.
#
#   .\publier.ps1
#
# Le déploiement se fait en deux passes : les fichiers versionnés
# d'abord avec un cache long, puis index.html avec un cache nul.
# L'ordre importe — publier index.html en premier exposerait
# brièvement une page référençant des fichiers encore absents.

$ErrorActionPreference = "Stop"

$COMPARTIMENT   = "pferh-dev-front-707578706755"
$DISTRIBUTION   = "E3ECGH64MA9PZ0"
$REGION         = "eu-west-3"

Write-Host "`nConstruction de l'application..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Échec de la construction" }

Write-Host "`nPublication des ressources statiques..." -ForegroundColor Cyan
# Vite ajoute une empreinte au nom de chaque fichier : leur contenu ne
# change jamais, ils peuvent être mis en cache un an.
aws s3 sync dist/ "s3://$COMPARTIMENT" `
  --region $REGION `
  --delete `
  --exclude "index.html" `
  --cache-control "public,max-age=31536000,immutable"

Write-Host "`nPublication de index.html..." -ForegroundColor Cyan
# Ce fichier garde le même nom à chaque version : il ne doit jamais
# être mis en cache, sinon les navigateurs continueraient de charger
# l'ancienne application.
aws s3 cp dist/index.html "s3://$COMPARTIMENT/index.html" `
  --region $REGION `
  --cache-control "no-cache,no-store,must-revalidate" `
  --content-type "text/html; charset=utf-8"

Write-Host "`nInvalidation du cache CloudFront..." -ForegroundColor Cyan
$invalidation = aws cloudfront create-invalidation `
  --distribution-id $DISTRIBUTION `
  --paths "/*" `
  --query "Invalidation.Id" `
  --output text

Write-Host "`nPublication terminée." -ForegroundColor Green
Write-Host "  Invalidation : $invalidation"
Write-Host "  Application  : https://d2cc1fkfzt3nok.cloudfront.net`n"
Write-Host "  La propagation prend une à deux minutes." -ForegroundColor DarkGray