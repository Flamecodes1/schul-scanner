# Richtet den automatischen Untis-Abruf auf diesem PC ein.
# Deine Zugangsdaten bleiben auf diesem PC – das Passwort wird mit deinem Windows-Konto verschlüsselt.

$ErrorActionPreference = 'Stop'
$dataDir = Join-Path $env:APPDATA 'schul-scanner'
$configPath = Join-Path $dataDir 'untis.json'
$taskName = 'Schul-Scanner Untis'
$syncScript = Join-Path $PSScriptRoot 'untis-sync.ps1'

Write-Host ''
Write-Host '  Schul-Scanner – Stundenplan aus WebUntis einrichten' -ForegroundColor Cyan
Write-Host '  Deine Daten bleiben auf diesem PC, das Passwort wird verschlüsselt gespeichert.'
Write-Host ''

try {
  foreach ($cmd in 'node', 'git', 'npm') {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "$cmd ist nicht installiert." }
  }

  # Ablage-Ordner finden
  $ablage = Join-Path $env:USERPROFILE 'Downloads\schul-ablage'
  if (-not (Test-Path (Join-Path $ablage '.git'))) {
    $ablage = (Read-Host '  Wo liegt dein Ordner "schul-ablage"? Pfad eingeben').Trim('" ')
    if (-not (Test-Path (Join-Path $ablage '.git'))) { throw "Dort ist kein Ablage-Ordner: $ablage" }
  }
  Write-Host "  Ablage: $ablage" -ForegroundColor DarkGray

  # Bibliotheken (einmalig)
  if (-not (Test-Path (Join-Path $PSScriptRoot 'node_modules\webuntis'))) {
    Write-Host '  Installiere Bibliotheken …'
    Push-Location $PSScriptRoot
    try { & npm install --no-audit --no-fund --ignore-scripts --silent } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'npm install fehlgeschlagen.' }
  }

  # Zugangsdaten
  Write-Host ''
  Write-Host '  Öffne die WebUntis-Anmeldeseite im Browser (noch nicht einloggen) und kopier die Adresse.' -ForegroundColor Yellow
  $url = (Read-Host '  WebUntis-Adresse').Trim()
  $user = (Read-Host '  Untis-Benutzername').Trim()
  $pw = Read-Host '  Untis-Passwort (wird beim Tippen nicht angezeigt)' -AsSecureString
  if (-not $url -or -not $user -or $pw.Length -eq 0) { throw 'Bitte alle drei Angaben ausfüllen.' }

  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
  [pscustomobject]@{
    url = $url
    user = $user
    passwordEncrypted = ($pw | ConvertFrom-SecureString)
    ablage = $ablage
  } | ConvertTo-Json | Set-Content -Path $configPath -Encoding UTF8

  # Erster Abruf als Test
  Write-Host ''
  Write-Host '  Teste den Abruf …' -ForegroundColor Cyan
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $syncScript
  if ($LASTEXITCODE -ne 0) {
    throw 'Der Abruf hat nicht geklappt. Prüf Adresse, Benutzername und Passwort und starte die Einrichtung nochmal.'
  }

  # Automatisch: morgens und dann alle 2 Stunden (wird nachgeholt, wenn der PC aus war) + beim Anmelden
  $action = New-ScheduledTaskAction -Execute 'conhost.exe' `
    -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$syncScript`""
  $daily = New-ScheduledTaskTrigger -Daily -At '06:15'
  $daily.Repetition = (New-ScheduledTaskTrigger -Once -At '06:15' `
      -RepetitionInterval (New-TimeSpan -Hours 2) -RepetitionDuration (New-TimeSpan -Hours 16)).Repetition
  $logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  $logon.Delay = 'PT2M'
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  $description = 'Holt den Untis-Stundenplan für den Schul-Scanner und aktualisiert den Ablage-Ordner.'
  try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($daily, $logon) -Settings $settings `
      -Principal $principal -Description $description -Force | Out-Null
  } catch {
    # Manche Windows-Versionen erlauben "beim Anmelden" nur mit Admin-Rechten – dann eben nur tagsüber
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($daily) -Settings $settings `
      -Principal $principal -Description $description -Force | Out-Null
  }

  Write-Host ''
  Write-Host '  ✓ Fertig! Dein Stundenplan wird jetzt automatisch aktualisiert, wenn dein PC an ist.' -ForegroundColor Green
  Write-Host '    In der App: Einstellungen → Stundenplan. Zum sofortigen Abruf: "Untis jetzt holen.cmd".'
  exit 0
}
catch {
  Write-Host ''
  Write-Host "  ✗ $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
