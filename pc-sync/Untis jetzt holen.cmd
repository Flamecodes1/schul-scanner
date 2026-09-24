@echo off
title Schul-Scanner: Stundenplan holen
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0untis-sync.ps1"
echo.
pause
