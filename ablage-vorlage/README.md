# 📚 Schul-Ablage

Hier landen automatisch alle Arbeitsblätter aus der **Schul-Scanner**-App – sortiert nach Schuljahr und Fach.

```
2026-27/
  Deutsch/
    2026-09-24 Gedichtanalyse.pdf   ← das Blatt (mit durchsuchbarem Text)
    2026-09-24 Gedichtanalyse.md    ← erkannter Text + Infos
  Mathe/
    …
untis/timetable.json                ← dein Stundenplan (automatisch aus WebUntis)
index.json                          ← Verzeichnis aller Blätter (für die App)
config.json                         ← deine Fächer
```

## Am PC ansehen

- **Im Browser:** einfach hier auf GitHub durch die Ordner klicken, oder die Schul-Scanner-App im Browser öffnen.
- **Als Ordner auf dem PC:** mit [GitHub Desktop](https://desktop.github.com/) klonen. Dann liegt alles als ganz normaler Ordner auf deinem PC.
- **Mit Obsidian:** den geklonten Ordner als „Vault“ öffnen – jede `.md`-Datei enthält den Text des Blatts und einen Link zum PDF.

## Stundenplan aus Untis

Der Workflow `.github/workflows/untis-sync.yml` holt mehrmals am Tag deinen Stundenplan. Dafür unter
**Settings → Secrets and variables → Actions → New repository secret** eintragen:

| Secret | Inhalt |
|---|---|
| `UNTIS_URL` | Die Adresse, wenn du WebUntis im Browser öffnest (z. B. `https://xyz.webuntis.com/WebUntis/?school=abc`) |
| `UNTIS_USER` | Dein Untis-Benutzername |
| `UNTIS_PASSWORD` | Dein Untis-Passwort |

Falls in der Adresse kein `?school=…` steht, zusätzlich `UNTIS_SCHOOL` mit dem Namen deiner Schule anlegen.
Meldest du dich bei Untis über IServ/Microsoft an, nimm statt Benutzer/Passwort das Secret `UNTIS_QR`
(Inhalt des QR-Codes aus WebUntis → Profil → Freigaben).

Die Secrets sind verschlüsselt und nur für den Workflow sichtbar – nicht für die App und nicht im Code.
