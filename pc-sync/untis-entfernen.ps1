# Entfernt den automatischen Untis-Abruf und die gespeicherten Zugangsdaten von diesem PC.
Unregister-ScheduledTask -TaskName 'Schul-Scanner Untis' -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $env:APPDATA 'schul-scanner') -ErrorAction SilentlyContinue
Write-Host ''
Write-Host '  Untis-Abruf und gespeicherte Zugangsdaten wurden entfernt.' -ForegroundColor Green
