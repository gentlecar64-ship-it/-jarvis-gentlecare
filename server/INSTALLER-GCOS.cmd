@echo off
setlocal
cd /d "%~dp0"
title Installation GCOS - GentleCarE

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo PowerShell est introuvable sur ce PC.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-gcos.ps1"
if errorlevel 1 (
  echo.
  echo L'installation GCOS n'a pas pu se terminer.
  pause
  exit /b 1
)

endlocal
