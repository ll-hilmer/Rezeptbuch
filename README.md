# Rezeptbuch

Rezeptverwaltung mit Wochenplaner, Einkaufsliste, Vorratsschrank und KI-Import.

Die App speichert alle Daten **lokal im Browser** (IndexedDB), funktioniert offline und lässt sich
als App auf Handy, Tablet und PC installieren (PWA). Optional gleicht sie die Daten über Firebase
zwischen mehreren Geräten ab.

## Lokal starten

Voraussetzung: [Node.js](https://nodejs.org) ab Version 20.

```bash
npm install
npm run dev
```

Danach <http://localhost:3000> öffnen.

## Online stellen (GitHub Pages)

Jeder Push auf `main` baut die App automatisch und veröffentlicht sie unter
<https://ll-hilmer.github.io/Rezeptbuch/> (Workflow `.github/workflows/deploy.yml`).

Einmalig einrichten: im Repository unter *Settings → Pages → Build and deployment* als **Source**
„GitHub Actions“ auswählen.

Alternativ kann der Ordner `dist/` aus `npm run build` bei jedem anderen Static-Hoster
(Cloudflare Pages, Netlify …) liegen.

Danach kann die Seite im Browser über „Zum Startbildschirm hinzufügen“ bzw. „App installieren“ installiert werden.

## Daten

- **Speicherort:** Jeder Browser und jedes Gerät hat einen eigenen Datenbestand. Auch
  `localhost` und die online gestellte Adresse gelten als getrennte Speicherorte. Mit der
  Synchronisierung (siehe unten) werden sie automatisch abgeglichen.
- **Backup:** Unter *Einstellungen → Backup* lässt sich alles (inklusive Bilder und Icons) als JSON-Datei
  sichern und auf einem anderen Gerät wiederherstellen. Regelmäßige Backups werden empfohlen, da
  Browserdaten beim Löschen des Verlaufs verloren gehen können.
- **Übernahme aus der alten Firebase-Version:** *Einstellungen → Daten aus Firebase importieren*.
  Nach einmaliger Google-Anmeldung werden Rezepte, Vorrat, Einkaufsliste und alle hinterlegten Zutaten-Icons
  kopiert. Das funktioniert unter `localhost` sofort. Für eine online gestellte Adresse muss deren Domain zuerst in der
  [Firebase-Konsole](https://console.firebase.google.com) unter *Authentication → Settings → Autorisierte Domains*
  eingetragen werden. Alternativ lokal importieren und per Backup übertragen.

## Synchronisierung zwischen Geräten

Unter *Einstellungen → Synchronisierung* mit dem Google-Konto anmelden, auf jedem Gerät einmal.
Danach werden Änderungen automatisch abgeglichen: beim Öffnen, beim Zurückwechseln in die App und
wenige Sekunden nach dem Bearbeiten.

**Einmalig nötig:** die Firestore-Regeln aus [`firestore.rules`](firestore.rules) veröffentlichen.
In der [Firebase-Konsole](https://console.firebase.google.com) *Firestore Database* öffnen, oben die
Datenbank `ai-studio-…` auswählen, dann im Reiter *Regeln* den Inhalt vollständig ersetzen und
*Veröffentlichen* klicken. Ohne diesen Schritt meldet die App „Zugriff verweigert“.

So bleibt der Verbrauch im kostenlosen Firebase-Tarif (50.000 Lese- und 20.000 Schreibzugriffe pro Tag) gering:

- Alle Daten liegen in einer Sammlung `users/{uid}/items`. Ein Abgleich ist eine einzige Abfrage
  „alles seit dem letzten Abgleich“. Ohne Änderungen kostet das **einen** Lesezugriff.
- Es gibt keine dauerhafte Live-Verbindung. Hochgeladen werden nur geänderte Einträge.
- Fotos liegen als eigene Dokumente und werden pro Bild nur einmal übertragen, auch wenn sie in
  Rezept und Einkaufsliste vorkommen oder der Rezepttext geändert wird.
- Konflikte: Die zuletzt gemachte Änderung gewinnt. Die Einkaufsliste wird bei gleichzeitigen
  Änderungen zusammengeführt, damit keine Einträge verloren gehen.

Der erste Abgleich überträgt alles einmal, bei 40 Rezepten einige hundert Zugriffe. Danach bleibt es
im normalen Gebrauch bei wenigen Dutzend Zugriffen pro Tag.

## KI-Import

Für den Import per Gemini wird ein eigener API-Key aus dem [Google AI Studio](https://aistudio.google.com/apikey)
benötigt. Er wird unter *Einstellungen → KI-Import* eingetragen und nur auf dem jeweiligen Gerät gespeichert.
