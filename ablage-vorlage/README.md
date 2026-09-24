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

Den Stundenplan holt dein **PC**: Im App-Projekt liegt der Ordner `pc-sync` – dort einmal
**`Untis einrichten.cmd`** doppelklicken und WebUntis-Adresse, Benutzername und Passwort eingeben.

Danach läuft eine Windows-Aufgabe morgens, alle 2 Stunden und beim Anmelden (verpasste Läufe werden nachgeholt).
Sie holt den Stundenplan nach `untis/timetable.json` und aktualisiert dabei auch diesen Ordner auf dem PC –
neue Scans vom Handy landen also automatisch hier.

- Passwort: bleibt auf dem PC, verschlüsselt mit deinem Windows-Konto (`%APPDATA%\schul-scanner`)
- Sofort abrufen: `Untis jetzt holen.cmd`
- Protokoll: `%APPDATA%\schul-scanner\untis-sync.log`
- Wieder entfernen: `Untis entfernen.cmd`
