@echo off
title DemonX Forge
cd /d "%~dp0"
set "FORGE_ROOT=%~dp0app"
set "FORGE_ENGINE=%~dp0engine\solidcraft-cli.exe"
echo Starting DemonX Forge. Leave this window open: closing it stops Forge.
rem open the browser a few seconds from now, when the server is up
start "" /min cmd /c "timeout /t 4 /nobreak >nul & start "" http://127.0.0.1:8120"
"%~dp0node\node.exe" "%~dp0app\server.mjs"
echo.
echo DemonX Forge stopped.
pause
