# Samy Production 237 - Selection Photo Launcher
# Fais un clic droit dessus -> "Run with PowerShell" ou "Execute en PowerShell"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = "http://localhost:3000"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  SAMY PRODUCTION 237 - Selection Photo" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
try {
    $node = Get-Command node -ErrorAction Stop
    Write-Host "[OK] Node.js trouve" -ForegroundColor Green
} catch {
    Write-Host "[ERREUR] Node.js introuvable. Telecharge-le sur https://nodejs.org" -ForegroundColor Red
    Read-Host "Appuie sur Entree pour quitter"
    exit 1
}

# Check if server is already running
try {
    $response = Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "[OK] Serveur deja actif sur $url" -ForegroundColor Green
        Start-Process $url
        Start-Process "$url/admin"
        goto :finish
    }
} catch {
    # Server not running, continue
}

# Clean Next.js cache to avoid stale build errors
if (Test-Path "$projectDir\.next") {
    Write-Host "[INFO] Nettoyage du cache Next.js..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force "$projectDir\.next" -ErrorAction SilentlyContinue
    Write-Host "[OK] Cache nettoye" -ForegroundColor Green
}

# Install deps if needed
if (-not (Test-Path "$projectDir\node_modules")) {
    Write-Host "[INFO] Installation des dependances..." -ForegroundColor Yellow
    Set-Location $projectDir
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERREUR] Echec de l'installation." -ForegroundColor Red
        Read-Host "Appuie sur Entree pour quitter"
        exit 1
    }
    Write-Host "[OK] Dependances installees" -ForegroundColor Green
} else {
    Write-Host "[OK] Modules deja installes" -ForegroundColor Green
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Demarrage du serveur..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Portail client  : $url" -ForegroundColor White
Write-Host "  Connexion studio: $url/admin/login" -ForegroundColor White
Write-Host "  Inscription     : $url/admin/register" -ForegroundColor White
Write-Host ""

# Start the dev server
Set-Location $projectDir
$process = Start-Process -FilePath "cmd" -ArgumentList "/c npm run dev" -WindowStyle Normal -PassThru

# Wait for server to be ready
Write-Host "Attente du demarrage..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
    try {
        $r = Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
}

if ($ready) {
    Write-Host "[OK] Serveur pret !" -ForegroundColor Green
} else {
    Write-Host "[!] Si la page ne charge pas, actualise apres quelques secondes." -ForegroundColor Yellow
}

# Open browser
Start-Process $url
Start-Process "$url/admin"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  C'est pret ! Les pages s'ouvrent." -ForegroundColor Cyan
Write-Host "  Pour arreter, ferme la fenetre noire." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Read-Host "Appuie sur Entree pour fermer ce message"
