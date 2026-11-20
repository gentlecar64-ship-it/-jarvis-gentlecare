$ErrorActionPreference = 'Stop'
$serverDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $serverDirectory 'start-gcos.cmd'
$startupDirectory = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDirectory 'GCOS Server.lnk'

if (-not (Test-Path $launcher)) {
  throw "Fichier de lancement introuvable : $launcher"
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw 'Node.js est introuvable. Installez Node.js LTS avant de continuer.'
}

$envFile = Join-Path $serverDirectory '.env'
if (-not (Test-Path $envFile)) {
  throw 'Le fichier server\.env est absent. Copiez .env.example en .env et ajoutez le jeton Airtable.'
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcher
$shortcut.WorkingDirectory = $serverDirectory
$shortcut.Description = 'Démarrage automatique du serveur GCOS GentleCarE'
$shortcut.WindowStyle = 7
$shortcut.Save()

Write-Host "Démarrage automatique installé : $shortcutPath" -ForegroundColor Green
Write-Host 'GCOS démarrera à la prochaine ouverture de session Windows.'
