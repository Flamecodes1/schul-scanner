# Holt den Untis-Stundenplan und lädt ihn in deine private Ablage hoch.
# Läuft automatisch über die Windows-Aufgabenplanung (eingerichtet mit "Untis einrichten.cmd").
# Nebenbei wird dein Ablage-Ordner auf dem PC aktualisiert (neue Scans kommen mit).
param(
  [string]$ConfigPath = (Join-Path $env:APPDATA 'schul-scanner\untis.json')
)

$ErrorActionPreference = 'Stop'
$logPath = Join-Path (Split-Path $ConfigPath) 'untis-sync.log'

function Write-Log([string]$msg) {
  Write-Host $msg
  try { Add-Content -Path $logPath -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm')  $msg" -Encoding UTF8 } catch { }
}

# Externe Programme (git, node) schreiben Fortschritt auf stderr – das ist kein Fehler, nur der Exit-Code zählt.
function Invoke-Tool([string]$exe, [string[]]$arguments) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $out = & $exe @arguments 2>&1 | ForEach-Object { "$_" } }
  finally { $ErrorActionPreference = $old }
  return [pscustomobject]@{ Code = $LASTEXITCODE; Output = ($out -join "`n").Trim() }
}

try {
  if (-not (Test-Path $ConfigPath)) { throw 'Noch nicht eingerichtet – bitte "Untis einrichten.cmd" starten.' }
  $cfg = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not (Test-Path (Join-Path $cfg.ablage '.git'))) { throw "Ablage-Ordner nicht gefunden: $($cfg.ablage)" }

  $secure = ConvertTo-SecureString $cfg.passwordEncrypted
  $env:UNTIS_URL = $cfg.url
  $env:UNTIS_USER = $cfg.user
  $env:UNTIS_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
  Set-Location $cfg.ablage

  # 1. Neueste Version der Ablage holen (inkl. neuer Scans vom Handy)
  $r = Invoke-Tool git @('pull', '--rebase', '--autostash', '--quiet')
  if ($r.Code -ne 0) { throw "Ablage konnte nicht aktualisiert werden: $($r.Output)" }

  # 2. Stundenplan holen
  $r = Invoke-Tool node @((Join-Path $PSScriptRoot 'untis-sync.mjs'))
  if ($r.Output) { $r.Output -split "`n" | ForEach-Object { Write-Log "  $_" } }
  if ($r.Code -ne 0) { throw 'Untis-Abruf fehlgeschlagen (siehe oben).' }

  # 3. Hochladen, falls sich etwas geändert hat
  $status = Invoke-Tool git @('status', '--porcelain', '--', 'untis/timetable.json')
  if (-not $status.Output) { Write-Log 'Fertig – nichts Neues.'; exit 0 }
  [void](Invoke-Tool git @('add', 'untis/timetable.json'))
  $r = Invoke-Tool git @('commit', '-q', '-m', 'Stundenplan aktualisiert (PC)')
  if ($r.Code -ne 0) { throw "Commit fehlgeschlagen: $($r.Output)" }
  for ($i = 1; $i -le 3; $i++) {
    $r = Invoke-Tool git @('push', '--quiet')
    if ($r.Code -eq 0) { Write-Log 'Fertig – Stundenplan hochgeladen ✓'; exit 0 }
    [void](Invoke-Tool git @('pull', '--rebase', '--autostash', '--quiet'))
    Start-Sleep -Seconds 5
  }
  throw "Hochladen fehlgeschlagen: $($r.Output)"
}
catch {
  Write-Log "FEHLER: $($_.Exception.Message)"
  exit 1
}
finally {
  Remove-Item Env:UNTIS_PASSWORD -ErrorAction SilentlyContinue
}
