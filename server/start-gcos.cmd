@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title GCOS Server - GentleCarE

set "UPDATE_STATE=%~dp0data\updates\pending-update.json"
set "UPDATE_SCRIPT=%~dp0apply-update.ps1"

if exist "%UPDATE_STATE%" (
  echo [GCOS] Mise a jour prete. Installation en cours...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%UPDATE_SCRIPT%" -PendingFile "%UPDATE_STATE%"
  if errorlevel 1 (
    echo [GCOS] La mise a jour a echoue. L'ancienne version est conservee.
    pause
  )
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js 20 ou superieur est requis.
  echo Installez Node.js LTS puis relancez ce fichier.
  pause
  exit /b 1
)

if not exist ".env" (
  echo.
  echo Le fichier server\.env est absent.
  echo Copiez .env.example en .env puis ajoutez le jeton Airtable.
  pause
  exit /b 1
)

echo Demarrage de GCOS...
start "GCOS" http://localhost:4782
node server.js
if errorlevel 1 (
  echo.
  echo Le serveur GCOS s'est arrete avec une erreur.
  pause
)
endlocal
