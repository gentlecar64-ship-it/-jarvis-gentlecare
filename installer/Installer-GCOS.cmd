@echo off
setlocal
cd /d "%~dp0"
echo Installation de GCOS...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Installer-GCOS.ps1"
if errorlevel 1 (
  echo.
  echo L'installation a rencontre une erreur.
  pause
)
endlocal
