@echo off
setlocal
set "MAVIK_URL=https://gentlecar64-ship-it.github.io/-jarvis-gentlecare/alpha/workshop/index.html?station=atelier"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" (
  echo Microsoft Edge est introuvable.
  pause
  exit /b 1
)
start "MAVIK Atelier" "%EDGE%" --kiosk "%MAVIK_URL%" --edge-kiosk-type=fullscreen --no-first-run --disable-pinch --overscroll-history-navigation=0
endlocal
