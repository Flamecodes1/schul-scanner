# Schul-Scanner – Projektwissen für Claude

Arbeitsblätter scannen → Fach automatisch erkennen → in einem privaten GitHub-Repo ablegen.
Nutzer: Schüler (kaufmännische Schule), iPhone 16 Pro, Windows-PC, Mac, Meta-Brille.
**Sprache: Deutsch** (UI, Kommentare, Antworten). Einfach und benutzerfreundlich halten.

## Teile

| Teil | Ort | Status |
|---|---|---|
| Web-App (PWA) | dieses Repo, GitHub Pages: https://flamecodes1.github.io/schul-scanner/ | läuft |
| Ablage (Daten) | privates Repo `Flamecodes1/schul-ablage` (lokal: `~/Downloads/schul-ablage` auf dem PC) | läuft |
| Untis-Abruf | `pc-sync/` – Windows-Aufgabe auf dem PC, schreibt `untis/timetable.json` in die Ablage | läuft |
| iPhone-App (nativ) | geplant, siehe [`docs/iphone-app.md`](docs/iphone-app.md) | **nächster Schritt** |

## Wichtige Einschränkungen

- **GitHub Actions sind für das Konto nicht nutzbar** (Abrechnungssperre, Nutzer will nichts bezahlen). Keine Workflows bauen – auch nicht im öffentlichen Repo.
- **WebUntis erlaubt keine Browser-Anfragen** (kein CORS) → die Web-App kann Untis nicht selbst abfragen. Native App oder PC schon.
- **Kostenlos bleiben:** iOS-App zunächst mit kostenloser Apple-ID („Personal Team“, 7 Tage gültig). Damit gibt es **kein iCloud/CloudKit** → Speicher bleibt das GitHub-Repo.
- Dieses Repo ist **öffentlich**: keine persönlichen Daten (Schule, Lehrernamen, Zugangsdaten) committen.
- Web-App und iPhone-App müssen **dieselben Datenformate** lesen/schreiben (unten), damit beide parallel funktionieren.

## Datenformate in der Ablage

```
index.json                 {version:1, docs:[Doc…]}  (neueste zuerst)
config.json                {version:1, subjects:[Subject…]}
untis/timetable.json       Stundenplan (vom PC)
<Schuljahr>/<Fachname>/<YYYY-MM-DD Titel>.pdf   z. B. 2026-27/Deutsch/2026-09-24 Gedichtanalyse.pdf
<…gleicher Name>.md        Frontmatter (titel, fach, datum, seiten, lehrer, stunde, id) + erkannter Text
.thumbs/<docId>.jpg        Vorschaubild, 360 px breit
```

- **Schuljahr** wechselt im August: Datum ≥ August → `JJJJ-(JJ+1)`, sonst `(JJJJ-1)-JJ`.
- **Dateinamen:** `\/:*?"<>|#%{}^~[]` und Steuerzeichen → Leerzeichen, max. 80 Zeichen; bei Kollision ` (2)`, ` (3)` …

**Doc** (`index.json`):
`id, subject (App-Fach-ID!), title, date (YYYY-MM-DD), created (ISO), pages, source (kamera|fotos|datei|pdf), text (OCR, ≤4000 Zeichen), lesson? {start,end,teachers[]}, path, md, thumb, pdfSha, thumbSha`

**Subject** (`config.json`):
`id, name, color (#hex), keywords[], hidden, fromUntis?, untis?[] (verknüpfte Untis-Kürzel)`

**timetable.json:**
`version, source:"pc", school, updated (ISO), range{from,to}, subjects[{short,long,teachers[],teacherNames[],color?}], lessons[{date,start,end,subject (Untis-Kürzel),subjectName,teachers[],teacherNames[],rooms[],status: normal|cancelled|changed, info?}], weekPattern{"0".."6":[{start,end,subject}]} (0=So), homework[{due,date,subject,text,done}], exams[{date,start,subject,name,text}]`

## Regeln, die man leicht falsch macht

- **Zwei Namensräume:** Blätter speichern die **App-Fach-ID**, Stunden das **Untis-Kürzel** (z. B. `GESWI`).
  Fach eines Blatts: erst `id`, dann `untis`. Fach einer Stunde: erst `untis`-Verknüpfung, dann `id`. (`subjectById` / `subjectForLesson` in `js/library.js`)
- **Untis-Kurse nie automatisch zusammenlegen.** Ein Standardfach (z. B. `deutsch`) übernimmt nur einen Kurs, wenn es noch keinen hat. Der Nutzer ordnet Kurse selbst zu (Seite „Kurse & Lehrer zuordnen“).
- **Schreiben ins Repo:** immer **ein Commit pro Änderung** über die Git Data API (Blobs → Tree mit `base_tree` → Commit → `PATCH refs/heads/main` mit `force:false`). Bei 422 neu lesen und wiederholen – der PC committet parallel den Stundenplan.
- Token der App: Fine-grained PAT, nur `schul-ablage`, **Contents: Read and write**.

## Fach-Erkennung (`js/classify.js`)

Punkte pro Fach, bestes Fach gewinnt; „sicher“ wenn ≥ 2,5 Punkte und ≥ 1,5 Vorsprung:
- Stundenplan: läuft gerade (±5 min) **4**; sonst zuletzt heute 2,6 / 1,6 / 1,0 …, nächste Stunde 1,2 (ohne echte Daten: Wochenplan × 0,7)
- Fachname oben auf dem Blatt **3,2** (sonst im Text 1,4), Lehrername **2,5**, Stichwörter 0,6 je Treffer (max. 3)
- Sprache (en/fr/la/es über Stoppwörter) **3,4**
- Ähnlichkeit zu früheren Blättern (TF-IDF-Zentroid je Fach): min(3,5; 9 × Kosinus)

Titel: größte Textzeile im oberen Teil der ersten Seite (`suggestTitle`).

## Untis-API (für die native App)

- Login: `POST https://{server}/WebUntis/jsonrpc.do?school={school}` → `{"id":"…","method":"authenticate","params":{"user","password","client"},"jsonrpc":"2.0"}` → `result.sessionId, personId, personType`
- Danach Cookie: `JSESSIONID={sessionId}; schoolname="_{base64(school)}"`
- Stundenplan: JSON-RPC `getTimetable` mit `options:{element:{id:personId,type:personType}, startDate, endDate (YYYYMMDD als Zahl), showSubstText, showInfo, showLsText, subjectFields/teacherFields/roomFields:["id","name","longname"]}` → `code: cancelled|irregular`
- Hausaufgaben: `GET /WebUntis/api/homeworks/lessons?startDate=…&endDate=…` → `data.homeworks`, `data.lessons` (lessonId → subject)
- Arbeiten: `GET /WebUntis/api/exams?startDate=…&endDate=…&klasseId=-1&withGrades=false` → `data.exams`
- Schulsuche: `POST https://mobile.webuntis.com/ms/schoolquery2` mit `searchSchool` `{search}` → `result.schools[{server,loginName,displayName}]`
- Referenz-Implementierung inkl. Umwandlung ins timetable.json-Format: `pc-sync/untis-sync.mjs`

## Entwicklung

- Web-App: keine Build-Tools, `python -m http.server 5173`. Bei Änderungen `VERSION` in `sw.js` erhöhen.
- Testdaten/Mock-GitHub lokal in `.testdata/` (gitignored).
- Commits: auf Deutsch, Push auf `main` (GitHub Pages baut automatisch).
