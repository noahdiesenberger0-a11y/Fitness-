# Pulse – Fitness Tracker

Eine leichtgewichtige Fitness-App im Stil von Strava, mit einem **Contribution-Graph wie auf GitHub**,
in dem du siehst, an welchen Tagen du trainiert hast.

## Features

- **Contribution-Heatmap**: das letzte Jahr, Tag für Tag. Je mehr Trainingsminuten, desto dunkler das Grün. Filterbar nach Sportart.
- **Streaks**
  - 🔥 Aktuelle Streak und 🏆 längste Streak (Tage in Folge mit Training)
  - 📅 Wochen-Streak (Wochen in Folge mit mindestens einem Training)
  - 😴 **Ruhetage** halten die Streak, ⏭️ **Skips** (ausgelassene Tage) brechen sie und werden gezählt
  - Heute bricht die Streak noch nicht, solange der Tag nicht vorbei ist
- **Splits**: km-Splits mit Pace, Unterschied zum vorherigen km, schnellstem km ⚡ und Erkennung von Negativ-Splits
- **GPS-Aufzeichnung**: Live-Tracking im Browser mit Zeit, Distanz, Pace, automatischen km-Splits (mit Vibration) und Routenskizze
- **Kraft-Modus** 🏋️: Training aus Übungen zusammenstellen (z. B. Bankdrücken 3 × 8 mit 60 kg)
  - Eine **animierte Figur** macht jede Übung im eingestellten **Tempo** vor (z. B. 3 s runter, 1 s halten, 1 s hoch), mit Gerät (Hantel, Bank, Stange, Kabelzug …) und farbig markierten Muskeln
  - Die Figuren sind selbst gebaut: ein Skelett aus Gelenkwinkeln, berechnet im Code (`models.js`), keine Bilddateien
  - Zählt Wiederholungen und Sätze mit, auf Wunsch mit Signaltönen, Sprachausgabe und Vibration
  - Automatische **Satzpause** mit Countdown, tatsächlich geschaffte Wiederholungen lassen sich anpassen
  - Speichert Sätze, Gewicht und Volumen, Bestleistungen pro Übung
- **Manuelles Eintragen** mit Dauer, Distanz, Splits, Gefühl und Notizen; Bearbeiten und Löschen
- **Statistiken**: Woche, Monat und Jahr, Aufteilung nach Sportart, Diagramm der letzten 12 Wochen
- **Persönliche Bestleistungen**: längster Lauf, schnellster km, beste Pace ab 5 km, 10 km und Halbmarathon, längste Radtour und mehr
- **Sportarten**: Laufen, Radfahren (km/h), Schwimmen (/100 m), Wandern, Gehen, Krafttraining, Yoga, Sonstiges
- **Zwei Farbwelten** mit je zwei Icons, im Profil wählbar: **Sunrise** (Galaxy Black, Stahlgrau, Sunrise-Orange mit Verlauf) und **Ägypten** (Ägyptischblau, Steinblau, Scharlachrot, Weiß). Das Logo ist ein kleiner Aktivitätskalender: jede Kachel eine andere Stufe mit eigenem Verlauf
- Export und Import als JSON (im Profil), Demo-Daten zum Ausprobieren, Hell- und Dunkelmodus

## Design

Das Design folgt den Regeln aus zwei Design-Skills ([taste-skill](https://github.com/leonxlnx/taste-skill) und [impeccable](https://github.com/pbakaus/impeccable)), die hier von Hand angewendet wurden:

- **Eine Akzentfarbe** je Farbwelt, sonst neutrale, warme Flächen. Kontraste geprüft: Text mindestens 4,5:1 in Hell und Dunkel
- **Am Handy wie eine App:** Tab-Leiste unten (Start, Aktivitäten, Aufzeichnen, Kraft, Profil), durchscheinende Leisten,
  Großtitel, deren Titel beim Scrollen in die Kopfzeile wandert, Filter-Chips statt Auswahlfeldern, Listen wie in den
  iOS-Einstellungen, Bottom-Sheets mit Griff zum Wegwischen, Scroll-Position pro Tab, erneutes Tippen auf den Tab scrollt nach oben
- **Schrift:** Barlow für Text, Barlow Semi Condensed für Überschriften und Zahlen (Ziffern mit fester Breite), lokal eingebunden (`fonts/`, SIL Open Font License)
- **Eigenes Icon-Set** mit einer Strichstärke statt Emojis
- **Feste Skalen** für Abstände (4–64 px), Radien (8/10/16 px) und Bewegung (150 ms Hover, 90 ms Klick)
- Rahmen statt Schatten, keine verschachtelten Karten, keine Reihe gleicher Kennzahl-Kacheln
- Gestaltete Browser-Elemente: Fokus-Ring, Textauswahl, Scrollbalken, Schalter, Auswahlfelder
- Hell- und Dunkelmodus nach Systemeinstellung, „Bewegung reduzieren“ wird beachtet

## Aufs Handy bringen (Web-App)

Pulse ist eine **Progressive Web App**: Sie wird über den Browser installiert, bekommt ein eigenes Icon
auf dem Home-Bildschirm, startet im Vollbild ohne Browserleiste und funktioniert auch offline.

### 1. Online stellen

Am Handy braucht die App **HTTPS**, sonst erlauben Handys weder GPS noch die Installation.
Am einfachsten geht das mit GitHub Pages:

1. Im Repository auf GitHub: **Settings → Pages**
2. **Source: „Deploy from a branch“**, dann den Branch und den Ordner `/ (root)` wählen und speichern
3. Nach ca. 1 Minute ist die App unter `https://<github-name>.github.io/Fitness-/` erreichbar

> Achtung: GitHub Pages ist öffentlich. Deine Trainingsdaten sind es nicht, denn sie bleiben nur auf deinem Gerät.

### 2. Installieren

- **iPhone (Safari):** Seite öffnen → **Teilen** → **„Zum Home-Bildschirm“**
- **Android (Chrome):** Seite öffnen → Banner **„App installieren“** antippen (oder Menü ⋮ → „App installieren“)

### Was die Web-App am Handy kann

- Offline nutzbar (Service Worker `sw.js`)
- Navigationsleiste unten, Detailansichten als Bottom-Sheet, Safe-Area für Notch und Home-Indicator
- **Bildschirm bleibt während der GPS-Aufzeichnung an** (Wake Lock). Browser stoppen GPS, sobald das Handy gesperrt wird.
- **Laufende Aufzeichnung übersteht Schließen und Neuladen** und wird beim nächsten Öffnen fortgesetzt
- Vibration bei jedem km-Split
- App-Shortcuts (lange auf das Icon drücken): „Aufzeichnen“, „Krafttraining“ und „Eintragen“

### App-Icon in einer anderen Farbe

Im **Profil → App-Farbe** wählen. In der App gilt die Farbe sofort. Das Icon auf dem Home-Bildschirm übernimmt
das Handy nur beim Hinzufügen: Pulse vom Home-Bildschirm entfernen und neu hinzufügen. Die Daten bleiben erhalten,
solange du dieselbe Adresse benutzt.

### Lokal testen

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Alle Daten bleiben lokal im Browser bzw. in der App (`localStorage`). Mit **Export** kannst du ein Backup machen.

## Dateien

| Datei          | Inhalt                                        |
|----------------|-----------------------------------------------|
| `index.html`   | Aufbau der Ansichten                          |
| `styles.css`   | Design (dunkel/hell, mobil)                   |
| `app.js`       | Logik: Streaks, Heatmap, Splits, GPS, Statistik |
| `strength.js`  | Kraft-Modus: Sätze, Wiederholungen, Tempo-Animation |
| `models.js`    | Animierte Übungs-Figuren (Posen, Muskeln, Geräte) |
| `manifest.json`| Web-App-Manifest (Name, Icons, Vollbild, Shortcuts) |
| `sw.js`        | Service Worker für den Offline-Betrieb        |
| `icons/`       | App-Icons; `icons/<farbe>/` je Farbe          |
| `manifest-<farbe>.json` | Manifest je App-Farbe                |
| `tools/`       | Skripte, die Icons und Manifeste erzeugen     |
| `fonts/`       | Schriftdateien (Barlow, SIL Open Font License) |
