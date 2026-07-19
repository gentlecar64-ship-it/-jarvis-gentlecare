@echo off
setlocal
title MAVIK GCOS - GentleCarE
cd /d "%~dp0server"

:START
cls
echo =====================================================
echo       MAVIK GCOS - GentleCarE
echo =====================================================
echo Demarrage et surveillance automatique...
echo.

node launcher-check.js
set "LAUNCH_CODE=%ERRORLEVEL%"

if "%LAUNCH_CODE%"=="10" goto ALREADY_RUNNING
if "%LAUNCH_CODE%"=="11" goto PORT_CONFLICT
if not "%LAUNCH_CODE%"=="0" goto LAUNCH_ERROR

echo Laissez cette fenetre ouverte. MAVIK se repare et se met a jour automatiquement.
echo.
node server.js
set "MAVIK_CODE=%ERRORLEVEL%"

if "%MAVIK_CODE%"=="0" goto END
echo.
echo MAVIK s'est arrete de facon inattendue (code %MAVIK_CODE%).
echo Redemarrage automatique dans 3 secondes...
timeout /t 3 /nobreak >nul
goto START

:ALREADY_RUNNING
echo.
echo MAVIK fonctionne deja. Aucun second serveur ne sera lance.
echo Ouvrez http://localhost:4782/alpha
start "" "http://localhost:4782/alpha"
goto END

:PORT_CONFLICT
echo.
echo ERREUR : le port 4782 est occupe par un autre programme.
echo Le redemarrage automatique est bloque pour eviter une boucle.
echo Lancez REPARER-MAVIK.cmd en tant qu'administrateur.
goto PAUSE_END

:LAUNCH_ERROR
echo.
echo ERREUR : le controle de demarrage MAVIK a echoue.
echo Lancez REPARER-MAVIK.cmd.
goto PAUSE_END

:PAUSE_END
pause
:END
echo MAVIK a ete arrete normalement.
endlocal
