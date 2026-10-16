# Rezeptbuch

Rezeptverwaltung mit Wochenplaner, Einkaufsliste, Vorratsschrank und KI-Import.

Die App speichert alle Daten **lokal im Browser** (IndexedDB). Es gibt keinen Server und keine
Online-Datenbank, also auch keine Kosten oder Kontingente. Sie lässt sich als App auf
Handy und PC installieren (PWA) und funktioniert offline.

## Lokal starten

Voraussetzung: [Node.js](https://nodejs.org) ab Version 20.

```bash
npm install
npm run dev
```

Danach <http://localhost:3000> öffnen.

## Kostenlos online stellen

`npm run build` erzeugt im Ordner `dist/` eine rein statische Seite, die jeder Static-Hoster ausliefern kann.
Für private GitHub-Repos eignen sich z. B.:

- **Cloudflare Pages** oder **Netlify**: Repository verbinden, Build-Befehl `npm run build`,
  Ausgabeordner `dist`. Jeder Push auf `main` wird automatisch veröffentlicht.
- **GitHub Pages** (bei privaten Repos nur mit kostenpflichtigem GitHub-Plan): beim Build
  `BASE_PATH=/Rezeptbuch/` setzen, damit die Pfade stimmen.

Danach kann die Seite im Browser über „Zum Startbildschirm hinzufügen“ bzw. „App installieren“ installiert werden.

## Daten

- **Speicherort:** Jeder Browser und jedes Gerät hat einen eigenen Datenbestand. Auch
  `localhost` und die online gestellte Adresse gelten als getrennte Speicherorte.
- **Backup:** Unter *Einstellungen → Backup* lässt sich alles (inklusive Bilder und Icons) als JSON-Datei
  sichern und auf einem anderen Gerät wiederherstellen. Regelmäßige Backups werden empfohlen, da
  Browserdaten beim Löschen des Verlaufs verloren gehen können.
- **Übernahme aus der alten Firebase-Version:** *Einstellungen → Daten aus Firebase importieren*.
  Nach einmaliger Google-Anmeldung werden Rezepte, Vorrat, Einkaufsliste und alle hinterlegten Zutaten-Icons
  kopiert. Das funktioniert unter `localhost` sofort. Für eine online gestellte Adresse muss deren Domain zuerst in der
  [Firebase-Konsole](https://console.firebase.google.com) unter *Authentication → Settings → Autorisierte Domains*
  eingetragen werden. Alternativ lokal importieren und per Backup übertragen.

## KI-Import

Für den Import per Gemini wird ein eigener API-Key aus dem [Google AI Studio](https://aistudio.google.com/apikey)
benötigt. Er wird unter *Einstellungen → KI-Import* eingetragen und nur auf dem jeweiligen Gerät gespeichert.
