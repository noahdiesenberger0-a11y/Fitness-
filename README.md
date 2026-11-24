# Pulse – Strava für Krafttraining

Eine Trainings-App für Krafttraining: eigene **Splits** bauen, im Gym **Sätze abhaken**, **Rekorde** sammeln
und sehen, wie du stärker wirst. Mit Streaks und einem Aktivitätskalender wie auf GitHub.

> **Etappe 1 von 3** – die App läuft lokal auf deinem Gerät. Als Nächstes kommen Konten und das Teilen von Splits
> (Etappe 2), danach Feed, Folgen, Kudos und Kommentare (Etappe 3).

## Features

- **Splits (Trainingspläne)**
  - Eigene Splits im Baukasten: Tage (z. B. Push, Pull, Legs), Übungen mit Sätzen, Wiederholungsbereich (8–12), Pause und Tempo
  - Fertige Vorlagen zum Übernehmen und Anpassen: Push/Pull/Legs, Oberkörper/Unterkörper, Ganzkörper 3×, Anfänger-Start, Bro-Split
  - Ein Split ist aktiv; die App schlägt automatisch den nächsten Tag vor
- **Training**
  - Sätze abhaken (Gewicht × Wiederholungen); die Werte vom letzten Mal stehen schon drin
  - **Progressions-Tipp**: Wenn du letztes Mal alle Sätze am oberen Ende geschafft hast, schlägt die App mehr Gewicht vor
  - **Rekord-Erkennung** 🏆 während des Trainings (geschätztes 1RM, bei Körpergewicht: Wiederholungen)
  - **Pausen-Timer** nach jedem Satz mit Ton und Vibration, ±15 s
  - Übungen hinzufügen, tauschen, verschieben; eigene Übungen anlegen
  - Das laufende Training übersteht Schließen und Neuladen der App
  - Freies Training ohne Split, „Nochmal machen“ für ein altes Training
- **Animierte Figuren** (selbst gebaut, `models.js`)
  - **Vorführen**: Die Figur zeigt die Übung im eingestellten Tempo, mit markierten Muskeln
  - **Tempo-Coach**: führt durch einen Satz (z. B. 3 s runter, 1 s hoch), zählt laut mit und trägt die Wiederholungen ein
- **Fortschritt**
  - Kurve pro Übung: geschätztes 1RM, schwerster Satz oder Volumen, mit Fortschritt in **Prozent** seit Beginn
  - Sätze pro Muskelgruppe in dieser Woche (Richtwert 10–20) im Vergleich zu den Wochen davor
  - Volumen pro Woche, Rekord-Liste aller Übungen
- **Profil**
  - Streaks (Ruhetage halten sie, Skips brechen sie), Contribution-Heatmap, Statistik nach Woche, Monat, Jahr
  - Verlauf als Feed-Karten mit Volumen, Sätzen, Rekorden und Muskel-Mix
  - Sichtbarkeit (öffentlich, nur Follower, privat) – wird mit dem Teilen in Etappe 2 wirksam
- **Cardio als Nebensache**: einfache Einträge mit Art, Dauer und optional Distanz
- Export und Import als JSON, Beispieldaten (16 Wochen PPL mit echter Progression), Hell- und Dunkelmodus

### Umstieg von der alten Version

Daten der früheren Lauf-Version werden beim ersten Start automatisch übernommen: Krafttrainings bleiben Trainings,
Läufe und andere Sportarten werden Cardio-Einträge, der alte Kraft-Plan wird zum Split „Mein Plan“.
Die alten Daten bleiben zusätzlich unverändert im Browser gespeichert.

## Design

Das Design folgt den Regeln aus zwei Design-Skills ([taste-skill](https://github.com/leonxlnx/taste-skill) und [impeccable](https://github.com/pbakaus/impeccable)), die hier von Hand angewendet wurden:

- **Eine Akzentfarbe** (Orange), sonst neutrale, warme Flächen. Kontraste geprüft: Text mindestens 4,5:1
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

Am Handy braucht die App **HTTPS**, sonst lässt sie sich nicht installieren.
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
- **Bildschirm bleibt während des Trainings an** (Wake Lock)
- **Laufendes Training übersteht Schließen und Neuladen**
- Vibration bei Rekorden und am Ende der Satzpause
- App-Shortcuts (lange auf das Icon drücken): „Training“ und „Fortschritt“

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
| `app.js`       | Kern: Datenmodell, Übernahme alter Daten, Streaks, Heatmap, Profil, Cardio |
| `exercises.js` | Übungsbibliothek, Vorlagen-Splits, 1RM und Volumen |
| `workout.js`   | Training: Sätze abhaken, Pausen-Timer, Rekorde, Übungsauswahl |
| `splits.js`    | Splits verwalten und Split-Baukasten          |
| `progress.js`  | Fortschritt: Kurven, Rekorde, Muskelgruppen, Wochenvolumen |
| `coach.js`     | Vorführen und Tempo-Coach mit animierter Figur |
| `models.js`    | Animierte Übungs-Figuren (Posen, Muskeln, Geräte) |
| `manifest.json`| Web-App-Manifest (Name, Icons, Vollbild, Shortcuts) |
| `sw.js`        | Service Worker für den Offline-Betrieb        |
| `icons/`       | App-Icons                                     |
| `fonts/`       | Schriftdateien (Barlow, SIL Open Font License) |
