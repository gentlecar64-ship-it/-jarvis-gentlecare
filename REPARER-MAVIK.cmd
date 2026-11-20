@echo off
setlocal
title Reparation MAVIK GCOS
cd /d "%~dp0"

echo =====================================================
echo       REPARATION MAVIK GCOS
echo =====================================================
echo 1/7 - Verification de Git...
git --version >nul 2>&1
if errorlevel 1 goto GIT_ERROR

echo 2/7 - Recuperation de la derniere version...
git fetch origin main
if errorlevel 1 goto NETWORK_ERROR
git pull --ff-only origin main
if errorlevel 1 goto PULL_ERROR

echo 3/7 - Arret de l'ancienne instance MAVIK...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$connections=@(Get-NetTCPConnection -LocalPort 4782 -State Listen -ErrorAction SilentlyContinue); if($connections.Count -eq 0){exit 0}; $connection=$connections[0]; $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$connection.OwningProcess) -ErrorAction SilentlyContinue; if($null -ne $process -and ($process.CommandLine -match 'Mavik-GCOS' -or $process.CommandLine -match 'server.js')){Stop-Process -Id $connection.OwningProcess -Force -ErrorAction Stop; Start-Sleep -Milliseconds 800; exit 0}; Write-Host ('Le port 4782 est utilise par '+$process.Name); exit 12"
if errorlevel 1 goto PORT_ERROR

echo 4/7 - Verification des fichiers principaux...
node --check server\server.js
if errorlevel 1 goto CODE_ERROR
node --check server\auth.js
if errorlevel 1 goto CODE_ERROR
node --check server\jarvis.js
if errorlevel 1 goto CODE_ERROR
node --check server\updater.js
if errorlevel 1 goto CODE_ERROR
node --check server\diagnostics.js
if errorlevel 1 goto CODE_ERROR
node --check server\design-installer.js
if errorlevel 1 goto CODE_ERROR
node --check server\launcher-check.js
if errorlevel 1 goto CODE_ERROR

echo 5/7 - Verification du design verrouille...
if not exist server\public\alpha.template.html goto DESIGN_ERROR
if not exist server\public\login.template.html goto DESIGN_ERROR
if not exist server\public\profile.template.html goto DESIGN_ERROR
if not exist server\public\jarvis.template.html goto DESIGN_ERROR

echo 6/7 - Reinstallation du design et du logo officiel...
node -e "const r=require('./server/design-installer').install();if(!r.profileTarget||!r.jarvisTarget)process.exit(2);console.log('Design',r.designVersion,'installe sur toutes les interfaces.')"
if errorlevel 1 goto DESIGN_ERROR

echo 7/7 - Reparation terminee.
echo MAVIK va maintenant redemarrer.
timeout /t 2 /nobreak >nul
call "%~dp0DEMARRER-MAVIK.cmd"
goto END

:GIT_ERROR
echo.
echo ERREUR : Git pour Windows est absent ou inaccessible.
echo Installez Git pour Windows puis relancez ce fichier.
goto PAUSE_END

:NETWORK_ERROR
echo.
echo ERREUR : impossible de joindre GitHub.
echo Verifiez Internet, puis relancez REPARER-MAVIK.cmd.
goto PAUSE_END

:PULL_ERROR
echo.
echo ERREUR : la mise a jour ne peut pas etre appliquee automatiquement.
echo Ne supprimez aucun fichier. Conservez ce message pour la future hotline MAVIK.
goto PAUSE_END

:PORT_ERROR
echo.
echo ERREUR : l'ancien processus utilisant le port 4782 ne peut pas etre arrete.
echo Fermez toutes les fenetres MAVIK, puis relancez ce fichier avec clic droit - Executer en tant qu'administrateur.
goto PAUSE_END

:CODE_ERROR
echo.
echo ERREUR : un fichier MAVIK est incomplet.
echo Relancez ce fichier lorsque la connexion Internet est stable.
goto PAUSE_END

:DESIGN_ERROR
echo.
echo ERREUR : le logo ou le design GentleCarE verrouille ne peut pas etre reinstalle.
echo Relancez REPARER-MAVIK.cmd. Si le probleme persiste, conservez ce message pour la hotline MAVIK.
goto PAUSE_END

:PAUSE_END
pause
:END
endlocal
