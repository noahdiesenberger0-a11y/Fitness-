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
- **Manuelles Eintragen** mit Dauer, Distanz, Splits, Gefühl und Notizen; Bearbeiten und Löschen
- **Statistiken**: Woche, Monat und Jahr, Aufteilung nach Sportart, Diagramm der letzten 12 Wochen
- **Persönliche Bestleistungen**: längster Lauf, schnellster km, beste Pace ab 5 km, 10 km und Halbmarathon, längste Radtour und mehr
- **Sportarten**: Laufen, Radfahren (km/h), Schwimmen (/100 m), Wandern, Gehen, Krafttraining, Yoga, Sonstiges
- Export und Import als JSON, Demo-Daten zum Ausprobieren, Hell- und Dunkelmodus, für Handys optimiert

## Starten

Es gibt keinen Build-Schritt und keine Abhängigkeiten. Starte einfach einen lokalen Server:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

> Für die GPS-Aufzeichnung auf dem Handy muss die Seite über **HTTPS** laufen (z. B. über GitHub Pages).

Alle Daten bleiben lokal im Browser (`localStorage`).

## Dateien

| Datei          | Inhalt                                        |
|----------------|-----------------------------------------------|
| `index.html`   | Aufbau der Ansichten                          |
| `styles.css`   | Design (dunkel/hell, mobil)                   |
| `app.js`       | Logik: Streaks, Heatmap, Splits, GPS, Statistik |
| `manifest.json`| Web-App-Manifest (zum Startbildschirm hinzufügen) |
