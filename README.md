# Pulse Gym – Trainings-App fürs Fitnessstudio

Pulse ist jetzt eine reine **Gym-App**. Laufen, Radfahren und GPS sind rausgeflogen – dafür ist alles rund ums Krafttraining
deutlich ausgebaut und die App führt dich Schritt für Schritt.

## Aufbau

| Bereich | Was du dort machst |
|---|---|
| **Einrichtung** (erster Start) | Name, Ziel (Muskelaufbau / Maximalkraft / Fit & straff) und Trainingstage wählen → fertiger Plan |
| **Heute** | Nächstes Training mit allen Übungen und Gewichten, großer Start-Button, Wochenziel, Monatsbilanz, letztes Training |
| **Pläne** | Eigene Pläne anlegen/bearbeiten, 9 Vorlagen (Ganzkörper, Push/Pull/Beine, Ober-/Unterkörper) |
| **Training** | Sätze loggen (kg, Wdh., Haken), Werte vom letzten Mal, automatischer Pausen-Timer, Tempo-Coach, Scheibenrechner |
| **Verlauf** | Alle Trainings nach Monat, Details, „Nochmal machen“, „Als Plan speichern“, Nachtragen |
| **Fortschritt** | Wochen-Serie, Trainingskalender, Volumen pro Woche, Sätze pro Muskelgruppe, Bestleistungen (1RM), Körpergewicht, Übungs-Bibliothek |

## Features

- **Geführter Einstieg**: Beim ersten Öffnen wird in 3 Schritten ein passender Trainingsplan erstellt – nie mehr eine leere Startseite
- **Nächstes Training automatisch**: Pläne werden reihum vorgeschlagen
- **Progressive Overload**: Alle Wiederholungen geschafft? Beim nächsten Mal wird automatisch mehr Gewicht eingetragen (↑)
- **Sätze abhaken** wie in einer echten Gym-App, Gewicht wird auf die folgenden Sätze übernommen, „Vorher“-Spalte zum Antippen
- **Pausen-Timer** startet nach jedem Satz (±15 s, überspringen, Ton + Vibration am Ende)
- **Tempo-Coach**: animierte Figur macht die Übung im eingestellten Tempo vor, zählt mit (Ton, Sprache, Vibration) und hakt den Satz ab
- **Bestleistungen live**: Meldung direkt beim Abhaken, Übersicht nach dem Training
- **Scheibenrechner** für Langhantelübungen (Stange 20/15/10 kg)
- **30 Übungen** mit Muskelgruppen, eigene Übungen anlegbar, Entwicklung des geschätzten 1RM pro Übung
- **Wochenziel & Serie** (Wochen in Folge mit erreichtem Ziel), Sätze pro Muskelgruppe mit Richtwert 10–20
- **Körpergewicht** mit Verlauf
- Laufendes Training übersteht Schließen/Neuladen, Backup Export/Import, Beispieldaten, Hell-/Dunkelmodus
- Alte Krafttrainings aus der vorherigen Pulse-Version werden automatisch übernommen

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

Pulse Gym ist eine **Progressive Web App**: Sie wird über den Browser installiert, bekommt ein eigenes Icon
auf dem Home-Bildschirm, startet im Vollbild ohne Browserleiste und funktioniert auch offline.

### 1. Online stellen

Am Handy braucht die App **HTTPS**, sonst ist keine Installation möglich.
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
- **Bildschirm bleibt im Tempo-Coach an** (Wake Lock)
- **Laufendes Training übersteht Schließen und Neuladen**
- App-Shortcuts (lange auf das Icon drücken): „Nächstes Training starten“ und „Fortschritt“

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
| `app.js`       | Daten, Heute, Verlauf, Fortschritt, Einstellungen, Einrichtung |
| `workout.js`   | Übungen, Pläne, laufendes Training, Pausen-Timer, Tempo-Coach |
| `models.js`    | Animierte Übungs-Figuren (Posen, Muskeln, Geräte) |
| `manifest.json`| Web-App-Manifest (Name, Icons, Vollbild, Shortcuts) |
| `sw.js`        | Service Worker für den Offline-Betrieb        |
| `icons/`       | App-Icons                                     |
| `fonts/`       | Schriftdateien (Barlow, SIL Open Font License) |
