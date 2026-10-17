import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, Download, Upload, CloudDownload, HardDrive, Check, Loader2, RefreshCw, LogOut } from 'lucide-react';
import { getSetting, setSetting, requestPersistentStorage } from '../lib/db';
import { downloadBackup, importBackupFile, importFromFirebase, ImportSummary } from '../lib/backup';
import { GEMINI_KEY_SETTING } from '../services/RecipeService';
import { getFirebase } from '../lib/firebase-client';
import { enableSync, disableSync, syncNow, getSyncStatus, subscribeSyncStatus } from '../lib/sync';

function formatTime(ms: number) {
  return new Date(ms).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

function describe(summary: ImportSummary) {
  return `${summary.recipes} Rezepte, ${summary.pantry} Vorratseinträge, ${summary.ingredientIcons} Icons und ${summary.shoppingItems} Einträge der Einkaufsliste übernommen.`;
}

export default function SettingsView() {
  const [apiKey, setApiKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [busy, setBusy] = useState<null | 'backup' | 'import' | 'firebase'>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'error', text: string } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [sync, setSync] = useState(getSyncStatus());

  useEffect(() => subscribeSyncStatus(setSync), []);

  // Firebase vorladen, damit das Google-Anmeldefenster direkt nach dem Tippen öffnet
  // (sonst blockieren manche Browser, v. a. Safari, das Pop-up)
  useEffect(() => { getFirebase().catch(() => {}); }, []);

  useEffect(() => {
    getSetting<string>(GEMINI_KEY_SETTING).then(k => setApiKey(k || ''));
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    navigator.storage?.estimate?.().then(({ usage }) => {
      if (usage !== undefined) setUsage(`${(usage / 1024 / 1024).toFixed(1)} MB`);
    }).catch(() => {});
  }, []);

  const run = async (kind: 'backup' | 'import' | 'firebase', action: () => Promise<string | void>) => {
    setBusy(kind);
    setMessage(null);
    try {
      const text = await action();
      if (text) setMessage({ type: 'ok', text });
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message || String(err) });
    } finally {
      setBusy(null);
    }
  };

  const saveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    await setSetting(GEMINI_KEY_SETTING, apiKey.trim());
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) run('import', async () => describe(await importBackupFile(file)));
  };

  const card = 'bg-white rounded-[32px] shadow-sm p-6 md:p-8 space-y-4';
  const button = 'flex items-center justify-center gap-2 bg-natural-accent text-white px-6 py-3 rounded-full font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50';
  const secondaryButton = 'flex items-center justify-center gap-2 border border-natural-primary/20 text-natural-primary px-6 py-3 rounded-full font-bold text-sm hover:bg-natural-bg transition-all disabled:opacity-50';
  const spinner = <Loader2 className="w-4 h-4 animate-spin" />;

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-32">
      <h2 className="text-4xl font-serif font-bold italic text-natural-primary">Einstellungen</h2>

      {message && (
        <div className={`rounded-2xl px-5 py-4 text-sm ${message.type === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <section className={card}>
        <h3 className="flex items-center gap-2 font-bold text-natural-primary"><RefreshCw className="w-5 h-5" /> Synchronisierung</h3>
        <p className="text-sm opacity-70">
          Gleicht deine Daten über dein Google-Konto zwischen allen Geräten ab, z. B. PC und Tablet. Die App bleibt offline nutzbar.
          Eigene Änderungen werden kurz nach dem Bearbeiten hochgeladen. Neues von anderen Geräten wird beim Öffnen,
          beim Zurückwechseln in die App (höchstens alle 5 Minuten) und mit „Jetzt abgleichen“ abgerufen.
        </p>
        {sync.enabled ? (
          <>
            <p className="text-sm">
              Angemeldet{sync.email ? <> als <strong>{sync.email}</strong></> : null} · Letzter Abgleich:{' '}
              <strong>{sync.running ? 'läuft …' : sync.lastSyncAt ? formatTime(sync.lastSyncAt) : 'noch nie'}</strong>
              {sync.lastResult && !sync.running && (
                <> · {sync.lastResult.received} empfangen, {sync.lastResult.pushed} gesendet</>
              )}
            </p>
            {sync.error && <p className="text-sm rounded-2xl px-4 py-3 bg-red-100 text-red-800">{sync.error}</p>}
            <div className="flex flex-col sm:flex-row gap-3">
              <button className={button} disabled={sync.running} onClick={() => syncNow({ manual: true })}>
                {sync.running ? spinner : <RefreshCw className="w-4 h-4" />} Jetzt abgleichen
              </button>
              <button className={secondaryButton} disabled={sync.running} onClick={() => disableSync()}>
                <LogOut className="w-4 h-4" /> Synchronisierung beenden
              </button>
            </div>
          </>
        ) : (
          <>
            {sync.error && <p className="text-sm rounded-2xl px-4 py-3 bg-red-100 text-red-800">{sync.error}</p>}
            <button className={button} disabled={sync.running} onClick={() => enableSync()}>
              {sync.running ? spinner : <RefreshCw className="w-4 h-4" />} Mit Google anmelden und aktivieren
            </button>
          </>
        )}
      </section>

      <section className={card}>
        <h3 className="flex items-center gap-2 font-bold text-natural-primary"><HardDrive className="w-5 h-5" /> Speicherort</h3>
        <p className="text-sm opacity-70">
          Alle Rezepte, Bilder und Listen liegen auf diesem Gerät im Browser, die App funktioniert deshalb auch offline.
          Ohne Synchronisierung hat jedes Gerät und jeder Browser einen eigenen Datenbestand.
        </p>
        <p className="text-sm">
          Belegter Speicher: <strong>{usage ?? 'unbekannt'}</strong> · Dauerhafter Speicher:{' '}
          <strong>{persisted === null ? 'unbekannt' : persisted ? 'aktiv' : 'nicht aktiv'}</strong>
        </p>
        {persisted === false && (
          <button className={secondaryButton} onClick={async () => setPersisted(await requestPersistentStorage())}>
            Dauerhaften Speicher anfragen
          </button>
        )}
      </section>

      <section className={card}>
        <h3 className="flex items-center gap-2 font-bold text-natural-primary"><Download className="w-5 h-5" /> Backup</h3>
        <p className="text-sm opacity-70">
          Sichert alles (inklusive Bilder und Icons) in eine Datei. Beim Wiederherstellen werden vorhandene Einträge ergänzt bzw. aktualisiert,
          die Einkaufsliste wird ersetzt.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button className={button} disabled={!!busy} onClick={() => run('backup', () => downloadBackup())}>
            {busy === 'backup' ? spinner : <Download className="w-4 h-4" />} Backup herunterladen
          </button>
          <button className={secondaryButton} disabled={!!busy} onClick={() => fileInput.current?.click()}>
            {busy === 'import' ? spinner : <Upload className="w-4 h-4" />} Backup wiederherstellen
          </button>
          <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={handleFile} />
        </div>
      </section>

      <section className={card}>
        <h3 className="flex items-center gap-2 font-bold text-natural-primary"><CloudDownload className="w-5 h-5" /> Aus alter Firebase-Version übernehmen</h3>
        <p className="text-sm opacity-70">
          Du meldest dich einmalig mit deinem Google-Konto an, dann werden Rezepte, Vorrat, Einkaufsliste und hinterlegte Icons
          aus der alten Online-Datenbank auf dieses Gerät kopiert. Danach wirst du automatisch wieder abgemeldet.
          Mehrfaches Ausführen erzeugt keine Duplikate.
        </p>
        <button
          className={button}
          disabled={!!busy}
          onClick={() => run('firebase', async () => describe(await importFromFirebase()))}
        >
          {busy === 'firebase' ? spinner : <CloudDownload className="w-4 h-4" />} Daten aus Firebase importieren
        </button>
      </section>

      <section className={card}>
        <h3 className="flex items-center gap-2 font-bold text-natural-primary"><KeyRound className="w-5 h-5" /> KI-Import (Gemini)</h3>
        <p className="text-sm opacity-70">
          Für den Rezept-Import per KI wird ein eigener Gemini API-Key benötigt (kostenlos erhältlich im Google AI Studio).
          Der Key wird nur auf diesem Gerät gespeichert und nicht ins Backup übernommen.
        </p>
        <form onSubmit={saveKey} className="flex flex-col sm:flex-row gap-3">
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="API-Key einfügen"
            autoComplete="off"
            className="flex-1 bg-natural-bg rounded-full px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-natural-accent/30"
          />
          <button type="submit" className={button}>
            {keySaved ? <Check className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />} {keySaved ? 'Gespeichert' : 'Speichern'}
          </button>
        </form>
      </section>
    </div>
  );
}
