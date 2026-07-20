param(
  [switch]$SkipStartup,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Installation GCOS - GentleCarE'

function Step($message) {
  Write-Host "`n==> $message" -ForegroundColor Cyan
}

function Success($message) {
  Write-Host "[OK] $message" -ForegroundColor Green
}

function Fail($message) {
  Write-Host "[ERREUR] $message" -ForegroundColor Red
  exit 1
}

$serverDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $serverDir

Step 'Vérification de Windows et de Node.js'
if (-not $IsWindows -and $PSVersionTable.PSEdition -eq 'Core') {
  Fail 'Cet installateur est prévu pour Windows.'
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Fail 'Node.js LTS n’est pas installé. Installez Node.js 20 LTS ou supérieur, puis relancez ce fichier.'
}

$nodeVersionText = (& node --version).TrimStart('v')
$nodeMajor = [int]($nodeVersionText.Split('.')[0])
if ($nodeMajor -lt 20) {
  Fail "Node.js $nodeVersionText détecté. GCOS nécessite Node.js 20 ou supérieur."
}
Success "Node.js $nodeVersionText détecté"

Step 'Préparation du fichier de configuration privé'
$envFile = Join-Path $serverDir '.env'
$envExample = Join-Path $serverDir '.env.example'

if (-not (Test-Path $envFile)) {
  if (-not (Test-Path $envExample)) {
    Fail 'Le fichier .env.example est introuvable.'
  }
  Copy-Item $envExample $envFile
  Success 'Fichier .env créé'
} elseif ($Force) {
  Copy-Item $envExample $envFile -Force
  Success 'Fichier .env réinitialisé'
} else {
  Success 'Fichier .env déjà présent, conservé'
}

$envContent = Get-Content $envFile -Raw
if ($envContent -match 'AIRTABLE_TOKEN=\s*$' -or $envContent -match 'AIRTABLE_TOKEN=(CHANGE_ME|pat_VOTRE_JETON_AIRTABLE)') {
  Write-Host "`nLe jeton Airtable doit être ajouté dans :" -ForegroundColor Yellow
  Write-Host $envFile -ForegroundColor White
  Write-Host 'La ligne doit ressembler à : AIRTABLE_TOKEN=patXXXXXXXX' -ForegroundColor Yellow
  notepad.exe $envFile
  Read-Host 'Après avoir enregistré et fermé le Bloc-notes, appuyez sur Entrée'
}

$envContent = Get-Content $envFile -Raw
if ($envContent -notmatch 'AIRTABLE_TOKEN=pat' -or $envContent -match 'pat_VOTRE_JETON_AIRTABLE') {
  Write-Host '[ATTENTION] Aucun jeton Airtable valide détecté. Le serveur fonctionnera, mais Airtable restera indisponible.' -ForegroundColor Yellow
}

Step 'Création des dossiers de fonctionnement'
@('data','logs','backups') | ForEach-Object {
  $path = Join-Path $serverDir $_
  if (-not (Test-Path $path)) { New-Item -ItemType Directory -Path $path | Out-Null }
}
Success 'Dossiers data, logs et backups prêts'

Step 'Test syntaxique du serveur'
& node --check (Join-Path $serverDir 'server.js')
if ($LASTEXITCODE -ne 0) { Fail 'Le fichier server.js contient une erreur de syntaxe.' }
Success 'Serveur valide'

if (-not $SkipStartup) {
  Step 'Configuration du lancement automatique avec Windows'
  $startupScript = Join-Path $serverDir 'install-startup.ps1'
  if (Test-Path $startupScript) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $startupScript
    if ($LASTEXITCODE -eq 0) { Success 'Lancement automatique configuré' }
    else { Write-Host '[ATTENTION] Le lancement automatique n’a pas pu être configuré.' -ForegroundColor Yellow }
  } else {
    Write-Host '[ATTENTION] Script install-startup.ps1 introuvable.' -ForegroundColor Yellow
  }
}

Step 'Démarrage de contrôle du serveur GCOS'
$process = Start-Process -FilePath 'node.exe' -ArgumentList 'server.js' -WorkingDirectory $serverDir -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2

try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4782/health' -TimeoutSec 5
  Success "GCOS $($health.version) répond correctement"
  if ($health.airtableConfigured) { Success 'Airtable est configuré' }
  else { Write-Host '[ATTENTION] Airtable n’est pas encore configuré.' -ForegroundColor Yellow }
} catch {
  if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
  Fail "Le serveur n’a pas répondu : $($_.Exception.Message)"
}

if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }

Write-Host "`n========================================" -ForegroundColor Green
Write-Host 'GCOS est prêt à être utilisé.' -ForegroundColor Green
Write-Host 'Démarrage manuel : start-gcos.cmd' -ForegroundColor White
Write-Host 'Diagnostic : http://127.0.0.1:4782/health' -ForegroundColor White
Write-Host '========================================' -ForegroundColor Green
Read-Host 'Appuyez sur Entrée pour fermer'
