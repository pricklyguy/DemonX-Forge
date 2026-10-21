@echo off
rem Starts DemonX Forge and opens it in your browser. Close this window to stop Forge.
rem   Start DemonX Forge.bat            start and open the browser
rem   Start DemonX Forge.bat nobrowser  start without opening the browser (used by "Start at login")
rem launcher.mjs starts the version named in current.txt, and again after an update (File > Updates > Update now)
setlocal
title DemonX Forge
cd /d "%~dp0"
if not defined FORGE_PORT set FORGE_PORT=8120
echo Starting DemonX Forge. Leave this window open: closing it stops Forge.
rem open the browser a few seconds from now, when the server is up
if /i not "%~1"=="nobrowser" start "" /min cmd /c "timeout /t 4 /nobreak >nul & start "" http://127.0.0.1:%FORGE_PORT%"
"%~dp0node\node.exe" "%~dp0launcher.mjs" forge
echo.
echo DemonX Forge stopped. If that was not expected, the message above says why.
pause
