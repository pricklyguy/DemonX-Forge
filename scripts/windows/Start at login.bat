@echo off
rem Makes DemonX Forge start by itself, minimised, when you sign in to Windows.
setlocal
cd /d "%~dp0"
echo DemonX Forge will start by itself when you sign in to Windows.
echo.
echo Should it also open Forge in the browser each time?
echo   Y = yes: for a computer you sit at.
echo   N = no:  Forge runs in the background and you open it yourself (for example from the desktop icon).
choice /c YN /n /m "Open the browser at login? [Y/N] "
set "ARGS="
if errorlevel 2 set "ARGS=nobrowser"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\DemonX Forge.lnk'); $s.TargetPath='%~dp0Start DemonX Forge.bat'; $s.Arguments='%ARGS%'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%~dp0forge.ico'; $s.WindowStyle=7; $s.Save()"
if errorlevel 1 (echo Could not set it up. & pause & exit /b 1)
echo.
echo Done. DemonX Forge will start by itself the next time you sign in to Windows.
echo To change your answer, run this file again. To undo it, run "Stop starting at login.bat".
pause
