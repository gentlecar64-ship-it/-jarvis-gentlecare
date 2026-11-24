#requires -Version 5.1
[CmdletBinding()]
param(
  [string]$InstallDir = 'C:\GCOS',
  [int]$Port = 4782
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Step([string]$Message) {
  Write-Host "`n[GCOS] $Message" -ForegroundColor Cyan
}

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
  Write-Host 'GCOS doit être installé avec les droits administrateur.' -ForegroundColor Yellow
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -InstallDir `"$InstallDir`" -Port $Port"
  Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments
  exit
}

Write-Step 'Vérification de Windows et de Node.js'
if ($PSVersionTable.PSVersion.Major -lt 5) { throw 'PowerShell 5.1 ou supérieur est requis.' }

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) {
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) { throw 'Node.js est absent et winget est indisponible. Installez Node.js LTS puis relancez.' }
  Write-Step 'Installation de Node.js LTS'
  & winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
}

Write-Step "Création de $InstallDir"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$zipPath = Join-Path $env:TEMP 'gcos-main.zip'
$extractPath = Join-Path $env:TEMP 'gcos-main'
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
Remove-Item $extractPath -Recurse -Force -ErrorAction SilentlyContinue

Write-Step 'Téléchargement de la dernière version GCOS'
$repoZip = 'https://github.com/gentlecar64-ship-it/-jarvis-gentlecare/archive/refs/heads/main.zip'
Invoke-WebRequest -Uri $repoZip -OutFile $zipPath -UseBasicParsing
Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
$sourceRoot = Get-ChildItem $extractPath -Directory | Select-Object -First 1
if (-not $sourceRoot) { throw 'Archive GCOS invalide.' }

Write-Step 'Copie des fichiers du serveur'
$serverSource = Join-Path $sourceRoot.FullName 'server'
if (-not (Test-Path $serverSource)) { throw 'Le dossier server est introuvable dans l’archive.' }
Copy-Item (Join-Path $serverSource '*') $InstallDir -Recurse -Force

Write-Step 'Configuration du serveur réseau'
$envFile = Join-Path $InstallDir '.env'
$envContent = @(
  "GCOS_PORT=$Port",
  'GCOS_HOST=0.0.0.0',
  'GCOS_ALLOWED_ORIGIN=*'
)
Set-Content -Path $envFile -Value $envContent -Encoding UTF8

Write-Step 'Création du script de démarrage'
$startScript = Join-Path $InstallDir 'Demarrer-GCOS.cmd'
$startContent = @"
@echo off
cd /d "$InstallDir"
node server.js >> "$InstallDir\gcos.log" 2>&1
"@
Set-Content -Path $startScript -Value $startContent -Encoding ASCII

Write-Step 'Configuration du démarrage automatique'
$taskName = 'GCOS Server'
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$startScript`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -User 'SYSTEM' | Out-Null

Write-Step 'Ouverture du pare-feu Windows'
$ruleName = "GCOS TCP $Port"
Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private | Out-Null

Write-Step 'Création du raccourci sur le Bureau'
$desktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
$shortcutPath = Join-Path $desktop 'GCOS.lnk'
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = 'http://localhost:' + $Port
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,220"
$shortcut.Save()

Write-Step 'Démarrage de GCOS'
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 3

$ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -ExpandProperty IPAddress -First 1

Write-Host "`nInstallation terminée." -ForegroundColor Green
Write-Host "Sur ce PC : http://localhost:$Port"
if ($ip) { Write-Host "Depuis un téléphone sur le même Wi-Fi : http://$ip`:$Port" -ForegroundColor Green }
Write-Host "`nUn raccourci GCOS a été ajouté au Bureau."
Start-Process "http://localhost:$Port"
Read-Host 'Appuyez sur Entrée pour fermer'
