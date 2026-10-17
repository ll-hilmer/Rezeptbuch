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

**Einmalig in der [Firebase-Konsole](https://console.firebase.google.com) einrichten**
(*Firestore Database*, oben die Datenbank `ai-studio-978db81f-…` auswählen):

1. **Regeln:** Im Reiter *Sicherheit* bzw. *Regeln* den Inhalt vollständig durch
   [`firestore.rules`](firestore.rules) ersetzen und *Veröffentlichen*. Ohne diesen Schritt
   meldet die App „Zugriff verweigert“.
2. **Index:** Im Reiter *Indexe* einen Index anlegen: Sammlung `items`, Feld `syncedAt`
   aufsteigend, Bereich *Sammlung*. Die AI-Studio-Datenbank ist eine Enterprise-Edition. Dort
   werden keine Indexe automatisch erstellt, und ohne Index durchsucht jede Abfrage die ganze
   Sammlung. Abgerechnet wird nach gelesener Datenmenge.

So bleibt der Verbrauch gering:

- Alle Einträge liegen in einer Sammlung `users/{uid}/items`. Ein Abruf ist eine einzige Abfrage
  „alles seit dem letzten Abgleich“. Mit Index werden nur die Änderungen gelesen.
- Bilder liegen getrennt in `users/{uid}/images` und werden pro Gerät nur einmal geladen. Die
  Abgleichsabfrage liest dadurch nur kleine Textdokumente, auch ohne Index.
- Eigene Änderungen werden nur hochgeladen, ohne gleichzeitig abzurufen (außer bei der
  Einkaufsliste, die bei gleichzeitigen Änderungen zusammengeführt wird). Neues von anderen
  Geräten wird beim Öffnen, beim Zurückwechseln in die App (höchstens alle 5 Minuten) und mit
  „Jetzt abgleichen“ abgerufen.
- Ist das Tageskontingent aufgebraucht, pausiert der automatische Abgleich für eine Stunde.
- Konflikte: Die zuletzt gemachte Änderung gewinnt.

## KI-Import

Für den Import per Gemini wird ein eigener API-Key aus dem [Google AI Studio](https://aistudio.google.com/apikey)
benötigt. Er wird unter *Einstellungen → KI-Import* eingetragen und nur auf dem jeweiligen Gerät gespeichert.
