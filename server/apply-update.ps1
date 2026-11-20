param(
  [Parameter(Mandatory = $true)]
  [string]$PendingFile
)

$ErrorActionPreference = 'Stop'

function Write-GcosLog([string]$Message) {
  Write-Host "[GCOS] $Message"
}

if (-not (Test-Path -LiteralPath $PendingFile)) {
  Write-GcosLog 'Aucune mise a jour en attente.'
  exit 0
}

$pending = Get-Content -LiteralPath $PendingFile -Raw | ConvertFrom-Json
$archive = [string]$pending.archive
$rootDir = [string]$pending.rootDir
$expectedHash = [string]$pending.sha256

if (-not (Test-Path -LiteralPath $archive)) { throw 'Archive de mise a jour introuvable.' }
if (-not (Test-Path -LiteralPath $rootDir)) { throw 'Dossier GCOS introuvable.' }

$actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($expectedHash -and $actualHash -ne $expectedHash.ToLowerInvariant()) {
  throw 'Controle de securite SHA-256 invalide.'
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$workDir = Join-Path ([System.IO.Path]::GetTempPath()) "gcos-update-$timestamp"
$extractDir = Join-Path $workDir 'extract'
$backupDir = Join-Path $rootDir "server\data\updates\rollback-$timestamp"

New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Write-GcosLog "Extraction de la version $($pending.version)..."
Expand-Archive -LiteralPath $archive -DestinationPath $extractDir -Force

$children = @(Get-ChildItem -LiteralPath $extractDir)
$sourceRoot = if ($children.Count -eq 1 -and $children[0].PSIsContainer) { $children[0].FullName } else { $extractDir }

$protected = @(
  'server\data',
  'server\.env',
  'server\backups',
  '.git'
)

Write-GcosLog 'Sauvegarde de la version actuelle...'
Get-ChildItem -LiteralPath $rootDir -Force | ForEach-Object {
  if ($_.Name -in @('.git')) { return }
  Copy-Item -LiteralPath $_.FullName -Destination $backupDir -Recurse -Force
}

Write-GcosLog 'Installation de la nouvelle version...'
Get-ChildItem -LiteralPath $sourceRoot -Force | ForEach-Object {
  $relative = $_.Name
  if ($relative -eq '.git') { return }
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $rootDir $relative) -Recurse -Force
}

# Les donnees locales, secrets et sauvegardes ne sont jamais supprimes par une mise a jour.
foreach ($item in $protected) {
  $null = $item
}

Remove-Item -LiteralPath $PendingFile -Force
Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue

Write-GcosLog "Mise a jour $($pending.version) installee."
exit 0
