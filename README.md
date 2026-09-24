# 📸 Schul-Scanner

Arbeitsblätter mit dem iPhone scannen – die App erkennt das Fach automatisch und legt alles
ordentlich in deiner eigenen, privaten Ablage auf GitHub ab. Am PC siehst du alles sofort.

## Was die App kann

- **Scannen wie mit einem Scanner:** Foto machen → Blattkanten werden erkannt → gerade gezogen → Papier wird weiß
- **Fach automatisch erkennen** anhand von
  - deinem **Untis-Stundenplan** (welche Stunde läuft gerade / lief zuletzt, inkl. Vertretungen),
  - **Fachname, Lehrkraft und Stichwörtern** auf dem Blatt,
  - der **Sprache** (Englisch, Französisch, Latein, Spanisch),
  - **Ähnlichkeit zu deinen bisherigen Blättern** – die App lernt mit jedem Blatt dazu.
- **Titel automatisch** aus der Überschrift
- **Durchsuchbar:** Texterkennung direkt auf dem Handy, Suche über alle Blätter; die PDFs haben eine Textebene (Strg+F am PC)
- **Heute-Ansicht:** aktuelle Stunde, heutiger Plan, Hausaufgaben und anstehende Arbeiten aus Untis
- **Fotos der Meta-Brille:** über „Aus deinen Fotos“ importieren – die Aufnahmezeit wird für den Stundenplan-Abgleich benutzt
- **PDF-Import** (z. B. aus Mail oder Schul-Cloud)
- **Offline:** Scans werden lokal gespeichert und hochgeladen, sobald du wieder Internet hast

## Wie es aufgebaut ist

```
iPhone (Web-App)  ──►  privates Repo „schul-ablage“  ◄──►  PC: holt Stundenplan aus WebUntis
       ▲                         │                             und hält den Ablage-Ordner aktuell
       └──── PC (Browser) ◄──────┘
```

| Teil | Wo | Was |
|---|---|---|
| App | dieses Repo (GitHub Pages) | HTML/CSS/JS, keine Daten |
| Ablage | privates Repo `schul-ablage` | PDFs, Texte, `index.json`, `config.json`, Stundenplan |
| Untis-Sync | `pc-sync/` auf deinem PC | Windows-Aufgabe, läuft morgens + alle 2 Std., schreibt nur in die private Ablage |

Vorlage für die Ablage: [`ablage-vorlage/`](ablage-vorlage/)

## Einrichten

1. **Ablage-Repo** (privat) aus `ablage-vorlage/` anlegen.
2. **Token für die App** erstellen: [Fine-grained Token](https://github.com/settings/personal-access-tokens/new)
   - *Repository access:* Only select repositories → `schul-ablage`
   - *Permissions:* **Contents** = Read and write
3. **App auf dem iPhone öffnen** (GitHub-Pages-Adresse) → in Safari **Teilen → Zum Home-Bildschirm**.
4. In der App unter **Einstellungen** Repo-Name und Token eintragen.
5. **Untis:** am PC in `pc-sync/` die Datei **`Untis einrichten.cmd`** doppelklicken und den Anweisungen folgen
   (braucht Node.js und Git mit Zugriff auf die Ablage). Details in [`ablage-vorlage/README.md`](ablage-vorlage/README.md).

## Entwickeln

Keine Build-Tools nötig – einfach einen lokalen Server starten:

```bash
python -m http.server 5173
```

und `http://localhost:5173` öffnen. Bei Änderungen an App-Dateien `VERSION` in `sw.js` erhöhen,
damit installierte Apps das Update bekommen.

| Datei | Aufgabe |
|---|---|
| `js/app.js` | Oberfläche & Scan-Ablauf |
| `js/scanner.js` | Kantenerkennung, Entzerren, Scan-Look |
| `js/ocr.js` | Texterkennung (Tesseract.js) |
| `js/classify.js` | Fach- und Titelerkennung |
| `js/library.js` | Bibliothek, Offline-Warteschlange, Abgleich mit GitHub |
| `js/github.js` | GitHub-API (ein Commit pro Blatt) |
| `js/pdf.js` | PDF erzeugen (jsPDF) und anzeigen (pdf.js) |
| `js/subjects.js` | Wissen über Schulfächer |
