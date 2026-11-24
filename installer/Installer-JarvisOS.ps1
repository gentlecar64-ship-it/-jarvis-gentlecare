#requires -Version 5.1
[CmdletBinding()]
param(
  [string]$InstallDir = 'C:\JarvisOS',
  [string]$TaskName = 'Jarvis OS Server'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
  Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  exit
}

Write-Host 'Installation de Jarvis OS...' -ForegroundColor Cyan

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  throw 'Node.js est requis. Installez Node.js LTS puis relancez cet installateur.'
}

$zipPath = Join-Path $env:TEMP 'jarvis-os-main.zip'
$extractDir = Join-Path $env:TEMP 'jarvis-os-main'
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue

Invoke-WebRequest -Uri 'https://github.com/gentlecar64-ship-it/-jarvis-gentlecare/archive/refs/heads/main.zip' -OutFile $zipPath -UseBasicParsing
Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
$root = Get-ChildItem $extractDir -Directory | Select-Object -First 1
$source = Join-Path $root.FullName 'server'
if (-not (Test-Path (Join-Path $source 'server.js'))) { throw 'Fichiers Jarvis OS introuvables.' }

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*node*' } | Stop-Process -Force -ErrorAction SilentlyContinue

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$dataBackup = Join-Path $env:TEMP 'jarvis-os-data-backup'
Remove-Item $dataBackup -Recurse -Force -ErrorAction SilentlyContinue
if (Test-Path (Join-Path $InstallDir 'data')) { Copy-Item (Join-Path $InstallDir 'data') $dataBackup -Recurse -Force }
$envFile = Join-Path $InstallDir '.env'
$envBackup = $null
if (Test-Path $envFile) { $envBackup = Get-Content $envFile -Raw }

Copy-Item (Join-Path $source '*') $InstallDir -Recurse -Force
if (Test-Path $dataBackup) { Copy-Item $dataBackup (Join-Path $InstallDir 'data') -Recurse -Force }
if ($envBackup) { Set-Content -Path $envFile -Value $envBackup -Encoding UTF8 }
elseif (-not (Test-Path $envFile)) {
  @"
GCOS_HOST=0.0.0.0
GCOS_PORT=4782
GCOS_BACKUP_INTERVAL_MINUTES=360
GCOS_BACKUP_RETENTION=30
"@ | Set-Content -Path $envFile -Encoding UTF8
}

$nodePath = (Get-Command node.exe).Source
$action = New-ScheduledTaskAction -Execute $nodePath -Argument 'server.js' -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

if (-not (Get-NetFirewallRule -DisplayName 'Jarvis OS 4782' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName 'Jarvis OS 4782' -Direction Inbound -Protocol TCP -LocalPort 4782 -Action Allow -Profile Private | Out-Null
}

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 4

$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'Jarvis OS.url'
@"
[InternetShortcut]
URL=http://localhost:4782/
IconFile=%SystemRoot%\System32\shell32.dll
IconIndex=14
"@ | Set-Content -Path $shortcutPath -Encoding ASCII

try {
  $health = Invoke-RestMethod -Uri 'http://localhost:4782/health' -TimeoutSec 10
  Write-Host "Jarvis OS $($health.version) est installé et démarré." -ForegroundColor Green
} catch {
  Write-Host 'Installation terminée. Redémarrez le PC si le serveur ne démarre pas immédiatement.' -ForegroundColor Yellow
}

Start-Process 'http://localhost:4782/'
Read-Host 'Appuyez sur Entrée pour fermer'
