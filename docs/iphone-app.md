# iPhone-App (nativ) – Plan & Einrichtung

Ziel: Die Web-App als echte iPhone-App – mit Apples Scanner, Untis direkt beim Öffnen und Action-Button.
**Gleiche Ablage, gleiche Datenformate** (siehe [`CLAUDE.md`](../CLAUDE.md)) – Web-App, PC und iPhone-App laufen parallel.

## Was die native App besser kann

| | Web-App | iPhone-App |
|---|---|---|
| Scanner | eigener (JavaScript) | **Apple-Scanner wie in Notizen** (VisionKit) |
| Texterkennung | Tesseract im Browser | **Apple Vision** – schneller, kann Handschrift |
| Untis | nur über den PC | **direkt beim Öffnen** (+ im Hintergrund) |
| Action-Button / Kontrollzentrum / Siri | – | **„Blatt scannen“ auf Knopfdruck** |
| Fotos der Meta-Brille | Aufnahmezeit aus EXIF (unsicher) | **Aufnahmezeit aus der Fotomediathek** |
| KI für Titel/Zusammenfassung | – | Apple Intelligence auf dem Gerät (iOS 26, optional) |

## Einrichtung auf dem Mac (macht der Nutzer)

1. **Xcode** aus dem Mac App Store installieren (groß – früh starten). Einmal öffnen, iOS-Plattform installieren lassen.
2. **Xcode → Einstellungen → Accounts → „+“ → Apple-ID** anmelden (kostenlos, ergibt ein „Personal Team“).
3. **Claude-App** auf dem Mac öffnen (gleicher Account) → Code.
4. **iPhone** per Kabel anschließen → „Diesem Computer vertrauen“.
   Auf dem iPhone: **Einstellungen → Datenschutz & Sicherheit → Entwicklermodus** einschalten (Neustart).
5. In Claude eine neue Sitzung starten und schreiben:
   > Klon https://github.com/Flamecodes1/schul-scanner nach ~/Developer/schul-scanner, lies CLAUDE.md und docs/iphone-app.md – wir bauen die iPhone-App, Meilenstein 1.
6. Nach der ersten Installation auf dem iPhone: **Einstellungen → Allgemein → VPN & Geräteverwaltung → deinem Entwicklerprofil vertrauen**.

**Kostenlose Apple-ID – das heißt:** Die App läuft **7 Tage**, danach in Xcode einmal „Run“ drücken (Daten bleiben erhalten).
Kein iCloud, kein TestFlight. Später auf das Entwicklerprogramm (99 €/Jahr) wechseln geht ohne Umbau.

## Technik (für Claude)

- **SwiftUI**, Deployment-Target **iOS 18** (iOS-26-Funktionen mit `#available`). Gerät: iPhone 16 Pro.
- Projekt in `ios/`, erzeugt mit **XcodeGen** (`ios/project.yml`, `brew install xcodegen`) – kein handgepflegtes `.pbxproj`.
- Signing: Personal Team des Nutzers, Bundle-ID z. B. `de.flamecodes.schulscanner`. Keine Entitlements, die ein Personal Team nicht kann (iCloud, Push, App Groups vermeiden bzw. prüfen).
- Bauen/Prüfen: `xcodebuild -scheme SchulScanner -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build`; Installation aufs Gerät per Xcode „Run“.
- Kein CI (GitHub Actions nicht verfügbar) – alles lokal bauen.

### Module

| Modul | Aufgabe | Vorlage in der Web-App |
|---|---|---|
| `GitHubStore` | index/config/timetable lesen, ein Commit pro Änderung (Git Data API, Retry bei 422), Offline-Warteschlange in Application Support | `js/github.js`, `js/library.js` |
| `Keychain` | GitHub-Token und Untis-Passwort | – |
| `ScannerView` | `VNDocumentCameraViewController`; `PhotosPicker` (Aufnahmedatum über `PHAsset.creationDate`); `fileImporter` für PDFs | `js/scanner.js` |
| `OCR` | Vision-Texterkennung (`de-DE`, `en-US`, genau), Zeilen mit Boxen | `js/ocr.js` |
| `PDFBuilder` | Seiten-JPEGs + unsichtbare Textebene, Thumbnail 360 px, `.md`-Datei | `js/pdf.js`, `markdown()` in `library.js` |
| `Classifier` | 1:1-Port der Punkte-Logik + Titelvorschlag | `js/classify.js`, `js/subjects.js` |
| `UntisClient` | Login, Stundenplan, Hausaufgaben, Arbeiten → `timetable.json` im gleichen Format (`source: "iphone"`), Verlauf wie im PC-Skript behalten | `pc-sync/untis-sync.mjs` |
| UI | Bibliothek (Heute-Karte, Fächer, Zuletzt, Suche), Fach, Blatt (PDFKit, Teilen), Einstellungen (GitHub, Untis, Kurse zuordnen, Fächer) | `js/app.js` |
| `AppIntents` | `ScanWorksheetIntent` + `AppShortcutsProvider` („Blatt scannen“), **ControlWidget** fürs Kontrollzentrum/Action-Button | – |

### Meilensteine

1. **Grundgerüst:** XcodeGen-Projekt, Einstellungen (Repo + Token → Keychain), Bibliothek aus `index.json` mit Vorschaubildern, Blatt ansehen (PDFKit) & teilen. → auf dem iPhone testen.
2. **Scannen:** Apple-Scanner, Fotos/PDF-Import, Texterkennung, Fach-Vorschlag + Titel, PDF mit Textebene, Upload über die Warteschlange.
3. **Untis direkt:** Anmeldung in den Einstellungen, Abruf beim Öffnen (höchstens alle 15 min) + `BGAppRefreshTask`, Heute-Karte, Kurse & Lehrer zuordnen.
4. **Action-Button & Siri:** App Intent + Control (Action-Button → „Blatt scannen“ öffnet direkt den Scanner).
5. **Extras:** Apple Intelligence für Titel/Zusammenfassung (iOS 26), Widget „Nächste Stunde“, Lernmodus (alle Blätter eines Themas als ein PDF).

### Stolpersteine

- Stunden → Fach immer über die Untis-Verknüpfung auflösen, Blätter über die Fach-ID (siehe `CLAUDE.md`).
- Der PC schreibt weiterhin `untis/timetable.json` – beim Schreiben immer frisch lesen, bei 422 wiederholen.
- `index.json` enthält den OCR-Text (≤ 4000 Zeichen) für die Suche – beim Schreiben unbekannte Felder erhalten.
