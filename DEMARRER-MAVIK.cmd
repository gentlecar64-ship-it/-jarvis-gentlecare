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
echo Acces sur ce PC :
echo   http://localhost:4782/alpha
echo.
echo Acces iPhone sur le meme Wi-Fi :
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$ip=(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object {$_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254*' -and $_.InterfaceAlias -notmatch 'Loopback|Bluetooth|vEthernet'} ^| Sort-Object InterfaceMetric ^| Select-Object -First 1 -ExpandProperty IPAddress); if($ip){'  http://'+$ip+':4782/alpha'}else{'  Adresse IP non detectee - verifiez le Wi-Fi'}"`) do echo %%I
echo.
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

:END
echo MAVIK a ete arrete normalement.
endlocal