Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  🚀 DynamoDB Local" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📍 Emplacement: C:\dynamodb-local" -ForegroundColor Yellow
Write-Host "🌐 Port: 8000" -ForegroundColor Yellow
Write-Host ""

Set-Location C:\dynamodb-local

Write-Host "✅ Démarrage en cours..." -ForegroundColor Green
& java "-Djava.library.path=.\DynamoDBLocal_lib" -jar DynamoDBLocal.jar -sharedDb -port 8000
