@echo off
rem Puts a DemonX Forge icon on your desktop. Double-click it later to start Forge.
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\DemonX Forge.lnk'); $s.TargetPath='%~dp0Start DemonX Forge.bat'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%~dp0forge.ico'; $s.Description='DemonX Forge: parametric 3D CAD in your browser'; $s.Save()"
if errorlevel 1 (echo Could not make the shortcut. & pause & exit /b 1)
echo.
echo Done: there is a "DemonX Forge" icon on your desktop. To remove it, delete it like any other icon.
pause
