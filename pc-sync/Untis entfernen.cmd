@echo off
title Schul-Scanner: Untis-Abruf entfernen
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0untis-entfernen.ps1"
echo.
pause
