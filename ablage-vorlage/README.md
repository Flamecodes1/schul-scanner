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

Der Stundenplan wird von einem Workflow im **App-Repo** (`schul-scanner`) geholt – dort sind GitHub Actions
kostenlos – und direkt hierher nach `untis/timetable.json` geschrieben. Hier im privaten Repo läuft nichts.

Die Secrets trägst du deshalb im App-Repo ein: **schul-scanner → Settings → Secrets and variables → Actions**

| Secret | Inhalt |
|---|---|
| `UNTIS_URL` | Die Adresse, wenn du WebUntis im Browser öffnest (z. B. `https://xyz.webuntis.com/WebUntis/?school=abc`) |
| `UNTIS_USER` | Dein Untis-Benutzername |
| `UNTIS_PASSWORD` | Dein Untis-Passwort |
| `ABLAGE_TOKEN` | Ein Fine-grained Token nur für dieses Repo mit *Contents: Read and write* |

Falls in der Adresse kein `?school=…` steht, zusätzlich `UNTIS_SCHOOL` anlegen.
Meldest du dich bei Untis über IServ/Microsoft an, nimm statt Benutzer/Passwort das Secret `UNTIS_QR`
(Inhalt des QR-Codes aus WebUntis → Profil → Freigaben).

Secrets sind verschlüsselt: Niemand kann sie lesen – auch nicht in einem öffentlichen Repo.
