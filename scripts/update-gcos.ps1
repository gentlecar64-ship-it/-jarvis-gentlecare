param(
    [Parameter(Mandatory = $false)]
    [string]$InstallDir = "$env:LOCALAPPDATA\GCOS",

    [Parameter(Mandatory = $false)]
    [string]$RepositoryZipUrl = "https://github.com/gentlecar64-ship-it/-jarvis-gentlecare/archive/refs/heads/main.zip",

    [Parameter(Mandatory = $false)]
    [string]$DataDir = "$env:LOCALAPPDATA\GCOS-Data"
)

$ErrorActionPreference = "Stop"

$workDir = Join-Path $env:TEMP "gcos-update"
$downloadFile = Join-Path $workDir "gcos-update.zip"
$extractDir = Join-Path $workDir "extract"
$rollbackDir = "$InstallDir.rollback"
$logDir = Join-Path $DataDir "logs"
$logFile = Join-Path $logDir "update.log"

function Write-UpdateLog {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Write-Host $line
    Add-Content -Path $logFile -Value $line
}

function Remove-Safely {
    param([string]$Path)
    if (Test-Path $Path) {
        Remove-Item -Path $Path -Recurse -Force
    }
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Remove-Safely $workDir
New-Item -ItemType Directory -Path $workDir -Force | Out-Null

try {
    Write-UpdateLog "Début de la mise à jour GCOS."

    Write-UpdateLog "Téléchargement de la nouvelle version."
    Invoke-WebRequest -Uri $RepositoryZipUrl -OutFile $downloadFile -UseBasicParsing

    Write-UpdateLog "Extraction de la nouvelle version."
    Expand-Archive -Path $downloadFile -DestinationPath $extractDir -Force

    $sourceDir = Get-ChildItem -Path $extractDir -Directory | Select-Object -First 1
    if (-not $sourceDir) {
        throw "Le paquet téléchargé ne contient aucun dossier d'application."
    }

    # Une seule sauvegarde temporaire de l'application est conservée.
    Remove-Safely $rollbackDir
    if (Test-Path $InstallDir) {
        Write-UpdateLog "Création de la sauvegarde temporaire de retour arrière."
        Move-Item -Path $InstallDir -Destination $rollbackDir
    }

    Write-UpdateLog "Installation de la nouvelle version."
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Copy-Item -Path (Join-Path $sourceDir.FullName "*") -Destination $InstallDir -Recurse -Force

    $requiredFile = Join-Path $InstallDir "index.html"
    if (-not (Test-Path $requiredFile)) {
        throw "Validation impossible : index.html est absent de la nouvelle version."
    }

    Write-UpdateLog "Validation réussie. Suppression de l'ancienne version."
    Remove-Safely $rollbackDir
    Remove-Safely $workDir

    Write-UpdateLog "Mise à jour GCOS terminée avec succès."
    exit 0
}
catch {
    Write-UpdateLog "Échec de la mise à jour : $($_.Exception.Message)"

    Remove-Safely $InstallDir
    if (Test-Path $rollbackDir) {
        Write-UpdateLog "Restauration automatique de la version précédente."
        Move-Item -Path $rollbackDir -Destination $InstallDir
    }

    Remove-Safely $workDir
    Write-UpdateLog "Retour arrière terminé."
    exit 1
}
