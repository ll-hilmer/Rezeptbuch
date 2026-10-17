import { db, getSetting, setSetting, onLocalChange, SYNCED_TABLES, SyncedTable, SyncMeta, Deletion } from './db';
import { getFirebase, getCurrentUser, signInWithGoogle, signOutFirebase } from './firebase-client';

/*
 * Synchronisierung über Firestore – auf möglichst wenige Zugriffe ausgelegt:
 * - Alle Einträge liegen in EINER Sammlung users/{uid}/items. Ein Abgleich ist eine einzige
 *   Abfrage "alles seit dem letzten Abgleich" (mit Index auf syncedAt nur die Änderungen).
 * - Bilder liegen getrennt in users/{uid}/images und werden nur bei Bedarf einzeln geladen.
 *   So bleiben die Dokumente in items klein – wichtig für die Enterprise-Edition, die ohne
 *   Index die ganze Sammlung durchsucht und nach gelesener Datenmenge abrechnet.
 * - Keine Live-Verbindung: abgerufen wird beim Start, beim Zurückkehren in die App und auf
 *   Knopfdruck; lokale Änderungen werden kurz danach hochgeladen.
 * - Ist das Tageskontingent aufgebraucht, pausiert der automatische Abgleich.
 * Bei Konflikten gewinnt die zuletzt gemachte Änderung.
 */

const K_ENABLED = 'syncEnabled';
const K_LAST_PULL = 'syncLastPull';
const K_LAST_SYNC = 'syncLastSyncAt';
const K_IMAGES_MOVED = 'syncImagesMoved';

const PAGE_SIZE = 25;
const FOCUS_INTERVAL_MS = 5 * 60 * 1000;
const CHANGE_DELAY_MS = 4000;
const QUOTA_PAUSE_MS = 60 * 60 * 1000;
const IMAGE_INLINE_LIMIT = 2_000; // Nur winzige Bilder bleiben im Dokument
const MAX_DOC_CHARS = 950_000; // Firestore erlaubt max. 1 MiB pro Dokument
const MAX_BATCH_CHARS = 8_000_000; // Firestore erlaubt max. 10 MiB pro Schreibvorgang
const IMAGE_REF = 'syncimg:';

type ItemTable = SyncedTable | 'image';

interface RemoteItem {
  table: ItemTable;
  id: string;
  mtime: number;
  deleted: boolean;
  data: Record<string, any> | null;
  syncedAt?: { seconds: number; nanoseconds: number; valueOf(): string };
}

export interface SyncStatus {
  enabled: boolean;
  email: string | null;
  running: boolean;
  lastSyncAt: number | null;
  error: string | null;
  lastResult: { received: number; pushed: number } | null;
}

let status: SyncStatus = { enabled: false, email: null, running: false, lastSyncAt: null, error: null, lastResult: null };
let pausedUntil = 0;
const statusListeners = new Set<(s: SyncStatus) => void>();

function setStatus(update: Partial<SyncStatus>) {
  status = { ...status, ...update };
  statusListeners.forEach(l => l(status));
}

export function getSyncStatus() {
  return status;
}

export function subscribeSyncStatus(listener: (s: SyncStatus) => void) {
  statusListeners.add(listener);
  return () => { statusListeners.delete(listener); };
}

// --- Hilfsfunktionen ---

// Schneller, nicht-kryptografischer Hash (cyrb53) für die Bild-Schlüssel
function hashString(str: string) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + str.length.toString(36);
}

// Ersetzt große Bilder durch Verweise und sammelt sie ein
function extractImages(value: any, images: Map<string, string>): any {
  if (typeof value === 'string') {
    if (value.startsWith('data:image') && value.length > IMAGE_INLINE_LIMIT) {
      const hash = hashString(value);
      images.set(hash, value);
      return IMAGE_REF + hash;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(v => extractImages(v, images));
  if (value && typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) result[k] = extractImages(v, images);
    return result;
  }
  return value;
}

function collectImageRefs(value: any, refs: Set<string>) {
  if (typeof value === 'string') {
    if (value.startsWith(IMAGE_REF)) refs.add(value.slice(IMAGE_REF.length));
  } else if (Array.isArray(value)) {
    value.forEach(v => collectImageRefs(v, refs));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach(v => collectImageRefs(v, refs));
  }
}

const MISSING_IMAGE = Symbol('missing');

function resolveImages(value: any, images: Map<string, string>): any {
  if (typeof value === 'string') {
    return value.startsWith(IMAGE_REF) ? images.get(value.slice(IMAGE_REF.length)) ?? MISSING_IMAGE : value;
  }
  if (Array.isArray(value)) return value.map(v => resolveImages(v, images)).filter(v => v !== MISSING_IMAGE);
  if (value && typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      const resolved = resolveImages(v, images);
      if (resolved !== MISSING_IMAGE) result[k] = resolved;
    }
    return result;
  }
  return value;
}

// Verkleinert ein Bild, bis es in ein Firestore-Dokument passt
async function shrinkDataUrl(dataUrl: string, maxChars: number): Promise<string> {
  if (dataUrl.length <= maxChars) return dataUrl;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
    img.src = dataUrl;
  });
  let size = Math.max(img.width, img.height);
  let result = dataUrl;
  for (let i = 0; i < 6 && result.length > maxChars; i++) {
    size = Math.round(size * 0.75);
    const scale = Math.min(1, size / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    result = canvas.toDataURL('image/jpeg', 0.8);
  }
  return result;
}

function describeError(err: any): string {
  const code = err?.code || '';
  if (code === 'permission-denied') {
    return 'Zugriff verweigert. Bitte die neuen Firestore-Regeln in der Firebase-Konsole veröffentlichen (siehe README).';
  }
  if (code === 'resource-exhausted') {
    return 'Das kostenlose Tageskontingent von Firebase ist aufgebraucht. Die Synchronisierung klappt wieder nach dem Zurücksetzen (gegen 9 Uhr).';
  }
  if (code === 'unavailable' || !navigator.onLine) {
    return 'Keine Verbindung. Die Änderungen werden später übertragen.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Das Anmeldefenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Anmeldung abgebrochen.';
  }
  return err?.message || String(err);
}

// --- Abgleich ---

async function pull(uid: string) {
  const { firestore, firestoreModule: fs } = await getFirebase();
  // Zeitstempel in voller Genauigkeit (Sekunden + Nanosekunden) speichern – beim Runden auf
  // Millisekunden würde das zuletzt geschriebene Paket bei jedem Abgleich erneut gelesen.
  const last = await getSetting<{ s: number; n: number }>(K_LAST_PULL);
  const items = fs.collection(firestore, 'users', uid, 'items');
  // Kein Sicherheitspuffer nötig: Firestore ist streng konsistent, später geschriebene
  // Dokumente haben immer einen neueren Zeitstempel. Ein Puffer würde bei jedem Abgleich
  // das zuletzt geschriebene Paket erneut lesen.
  const since = last ? new fs.Timestamp(last.s, last.n) : fs.Timestamp.fromMillis(0);

  const changes: RemoteItem[] = [];
  let maxSyncedAt = since;
  let cursor: any = null;
  while (true) {
    const constraints: any[] = [fs.where('syncedAt', '>', since), fs.orderBy('syncedAt'), fs.limit(PAGE_SIZE)];
    if (cursor) constraints.push(fs.startAfter(cursor));
    const snap = await fs.getDocs(fs.query(items, ...constraints));
    for (const d of snap.docs) {
      const item = d.data() as RemoteItem;
      if (item.table !== 'image') changes.push(item); // Bilder lagen früher ebenfalls hier
      // Timestamp.valueOf() liefert einen sortierbaren String
      if (item.syncedAt && item.syncedAt.valueOf() > maxSyncedAt.valueOf()) maxSyncedAt = item.syncedAt as any;
    }
    if (snap.size < PAGE_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  if (changes.length) await applyRemote(uid, changes);
  await setSetting(K_LAST_PULL, { s: maxSyncedAt.seconds, n: maxSyncedAt.nanoseconds });
  return changes.length;
}

async function applyRemote(uid: string, changes: RemoteItem[]) {
  const records = changes.filter(c => (SYNCED_TABLES as readonly string[]).includes(c.table));

  // 1. Bildverweise auflösen; unbekannte Bilder einzeln nachladen (einmal pro Gerät)
  const refs = new Set<string>();
  records.forEach(c => collectImageRefs(c.data, refs));
  const images = new Map<string, string>();
  if (refs.size) {
    const known = await db.syncImages.bulkGet([...refs]);
    known.forEach(img => img && images.set(img.hash, img.dataUrl));
    const missing = [...refs].filter(h => !images.has(h));
    if (missing.length) {
      const { firestore, firestoreModule: fs } = await getFirebase();
      for (const hash of missing) {
        let snap = await fs.getDoc(fs.doc(firestore, 'users', uid, 'images', hash));
        let dataUrl = snap.exists() ? snap.data().dataUrl : undefined;
        if (!dataUrl) {
          // Früherer Speicherort
          snap = await fs.getDoc(fs.doc(firestore, 'users', uid, 'items', `image:${hash}`));
          dataUrl = snap.exists() ? (snap.data() as RemoteItem).data?.dataUrl : undefined;
        }
        if (dataUrl) {
          images.set(hash, dataUrl);
          await db.syncImages.put({ hash, dataUrl });
          await db.cloudImages.put({ hash });
        }
      }
    }
  }

  // 2. Änderungen übernehmen – neuere lokale, noch nicht hochgeladene Änderungen gewinnen
  await db.transaction('rw', [...SYNCED_TABLES.map(t => db.table(t)), db.deletions], async () => {
    for (const change of records) {
      const table = db.table(change.table);
      const key = `${change.table}:${change.id}`;
      const local = await table.get(change.id) as SyncMeta | undefined;
      const tombstone = await db.deletions.get(key);

      const localPending = !!local && local._dirty !== 0;
      if (local && !localPending && local._mtime === change.mtime && !change.deleted) continue;
      // Stand, auf dem die lokale Änderung aufbaut (z. B. das Echo des eigenen Uploads) – kein Konflikt
      if (localPending && local!._base !== undefined && change.mtime <= local!._base) continue;

      const pendingMtime = tombstone ? tombstone._mtime : localPending ? (local!._mtime ?? 0) : -1;

      // Fehlt ein Bild in der Cloud, lieber den lokalen Stand behalten als das Bild zu verlieren
      if (local && !change.deleted) {
        const recordRefs = new Set<string>();
        collectImageRefs(change.data, recordRefs);
        if ([...recordRefs].some(h => !images.has(h))) {
          console.warn('[Sync] Bild fehlt in der Cloud, lokaler Stand bleibt erhalten:', key);
          continue;
        }
      }

      // Einkaufsliste wurde auf zwei Geräten gleichzeitig geändert: zusammenführen statt überschreiben
      if (change.table === 'shoppingList' && localPending && !change.deleted) {
        const remote = resolveImages(change.data, images);
        const localList = local as any;
        const [winner, loser] = pendingMtime > change.mtime ? [localList, remote] : [remote, localList];
        await table.put({
          ...winner,
          items: mergeShoppingItems(winner.items ?? [], loser.items ?? []),
          id: change.id,
          _mtime: Date.now(),
          _base: change.mtime,
          _dirty: 1,
        });
        continue;
      }

      if (pendingMtime > change.mtime) continue;

      if (change.deleted) {
        await table.delete(change.id);
      } else {
        await table.put({ ...resolveImages(change.data, images), id: change.id, _mtime: change.mtime, _base: change.mtime, _dirty: 0 });
      }
      if (tombstone) await db.deletions.delete(key);
    }
  });
}

// Übernimmt die neuere Liste und ergänzt Einträge, die nur auf dem anderen Gerät hinzugefügt
// wurden. Abgehakte Einträge werden nicht zurückgeholt; abgehakt bleibt, was eine Seite abgehakt hat.
function mergeShoppingItems(winner: any[], loser: any[]) {
  const key = (item: any) => [item.name, item.unit, item.recipeId].map(v => String(v ?? '').trim().toLowerCase()).join('|');
  const loserByKey = new Map<string, any[]>();
  loser.forEach(item => {
    const k = key(item);
    loserByKey.set(k, [...(loserByKey.get(k) ?? []), item]);
  });
  const merged = winner.map(item => {
    const candidates = loserByKey.get(key(item));
    const match = candidates?.shift();
    return match?.checked && !item.checked ? { ...item, checked: true } : item;
  });
  loserByKey.forEach(rest => rest.filter(item => !item.checked).forEach(item => merged.push(item)));
  return merged;
}

async function push(uid: string) {
  await moveLegacyImages(uid);
  const dirty: { table: SyncedTable; record: any }[] = [];
  for (const table of SYNCED_TABLES) {
    const all = await db.table(table).toArray();
    all.filter((r: SyncMeta) => r._dirty !== 0).forEach(record => dirty.push({ table, record }));
  }
  const tombstones = await db.deletions.toArray();
  const { firestore, firestoreModule: fs } = await getFirebase();
  if (!dirty.length && !tombstones.length) return { pushed: 0, skipped: [] as string[] };

  const docRef = (id: string) => fs.doc(firestore, 'users', uid, 'items', id);

  type Op = { id: string; item: RemoteItem; size: number };
  const recordOps: Op[] = [];
  const skipped: string[] = [];
  const allImages = new Map<string, string>();

  for (const { table, record } of dirty) {
    const { _mtime, _dirty, _base, id, ...rest } = record;
    const data = extractImages(rest, allImages);
    const size = JSON.stringify(data).length;
    if (size > MAX_DOC_CHARS) {
      skipped.push(record.name || record.keyword || id);
      continue;
    }
    recordOps.push({ id: `${table}:${id}`, item: { table, id, mtime: _mtime ?? 0, deleted: false, data }, size });
  }
  for (const t of tombstones) {
    recordOps.push({ id: `${t.table}:${t.id}`, item: { table: t.table, id: t.id, mtime: t._mtime, deleted: true, data: null }, size: 100 });
  }

  // Bilder, die schon in der Cloud liegen, nicht erneut hochladen
  const uploaded = await db.cloudImages.bulkGet([...allImages.keys()]);
  const uploadedSet = new Set(uploaded.filter(Boolean).map(img => img!.hash));
  const newImages = [...allImages].filter(([hash]) => !uploadedSet.has(hash));

  // Bilder zuerst hochladen, damit Einträge nie auf fehlende Bilder verweisen
  await uploadImages(uid, newImages);

  // In Paketen schreiben
  const commit = async (ops: Op[]) => {
    let batch = fs.writeBatch(firestore);
    let count = 0, chars = 0;
    for (const op of ops) {
      if (count && (count >= 400 || chars + op.size > MAX_BATCH_CHARS)) {
        await batch.commit();
        batch = fs.writeBatch(firestore);
        count = 0; chars = 0;
      }
      batch.set(docRef(op.id), { ...op.item, syncedAt: fs.serverTimestamp() });
      count++; chars += op.size;
    }
    if (count) await batch.commit();
  };
  await commit(recordOps);

  // Als hochgeladen markieren – außer der Eintrag wurde inzwischen erneut geändert
  await db.transaction('rw', [...SYNCED_TABLES.map(t => db.table(t)), db.deletions], async () => {
    for (const { item } of recordOps) {
      if (item.deleted) {
        const key = `${item.table}:${item.id}`;
        const current = await db.deletions.get(key) as Deletion | undefined;
        if (current && current._mtime === item.mtime) await db.deletions.delete(key);
      } else {
        const table = db.table(item.table);
        const current = await table.get(item.id) as SyncMeta | undefined;
        if (!current) continue;
        // Dieser Stand liegt jetzt in der Cloud; erneut geänderte Einträge bleiben zum Hochladen markiert
        await table.update(item.id, (current._mtime ?? 0) === item.mtime ? { _dirty: 0, _base: item.mtime } : { _base: item.mtime });
      }
    }
  });

  return { pushed: recordOps.length, skipped };
}

async function uploadImages(uid: string, images: [string, string][]) {
  if (!images.length) return;
  const { firestore, firestoreModule: fs } = await getFirebase();
  let batch = fs.writeBatch(firestore);
  let count = 0, chars = 0;
  const done: string[] = [];
  const flush = async () => {
    if (!count) return;
    await batch.commit();
    await db.cloudImages.bulkPut(done.splice(0).map(hash => ({ hash })));
    batch = fs.writeBatch(firestore);
    count = 0; chars = 0;
  };
  for (const [hash, dataUrl] of images) {
    const small = await shrinkDataUrl(dataUrl, MAX_DOC_CHARS);
    if (count && (count >= 400 || chars + small.length > MAX_BATCH_CHARS)) await flush();
    batch.set(fs.doc(firestore, 'users', uid, 'images', hash), { dataUrl: small });
    done.push(hash);
    count++; chars += small.length;
  }
  await flush();
  await db.syncImages.bulkPut(images.map(([hash, dataUrl]) => ({ hash, dataUrl })));
}

// Einmalig pro Gerät: Bilder der früheren Version aus items nach images verschieben, damit die
// Abgleichsabfrage sie nicht mehr mitliest
async function moveLegacyImages(uid: string) {
  if (await getSetting<boolean>(K_IMAGES_MOVED)) return;
  const { firestore, firestoreModule: fs } = await getFirebase();
  const cached = await db.syncImages.toArray();

  // Hat ein anderes Gerät die Bilder schon verschoben, reicht ein kleiner Lesezugriff
  const meta = fs.doc(firestore, 'users', uid, 'meta', 'state');
  const metaSnap = await fs.getDoc(meta);
  if (metaSnap.exists() && metaSnap.data().imagesMoved) {
    await db.cloudImages.bulkPut(cached.map(i => ({ hash: i.hash })));
    await setSetting(K_IMAGES_MOVED, true);
    return;
  }

  const uploaded = new Set((await db.cloudImages.toArray()).map(i => i.hash));
  await uploadImages(uid, cached.filter(i => !uploaded.has(i.hash)).map(i => [i.hash, i.dataUrl]));

  // Einträge, in denen noch mittelgroße Bilder stecken (z. B. Icons), neu hochladen,
  // damit diese Bilder ebenfalls ausgelagert werden
  for (const table of SYNCED_TABLES) {
    await db.table(table).toCollection().modify((record: any) => {
      const found = new Map<string, string>();
      extractImages(record, found);
      if (found.size) {
        record._dirty = 1;
        record._mtime = Date.now();
      }
    });
  }
  await fs.setDoc(meta, { imagesMoved: true }, { merge: true });

  for (let i = 0; i < cached.length; i += 400) {
    const batch = fs.writeBatch(firestore);
    cached.slice(i, i + 400).forEach(img => batch.delete(fs.doc(firestore, 'users', uid, 'items', `image:${img.hash}`)));
    await batch.commit();
  }
  await setSetting(K_IMAGES_MOVED, true);
}

let running: Promise<void> | null = null;
let rerun = false;

// manual: vom Nutzer ausgelöst (ignoriert die Pause bei aufgebrauchtem Kontingent)
// pullRemote: false = nur hochladen (z. B. direkt nach einer lokalen Änderung)
export async function syncNow({ manual = false, pullRemote = true } = {}): Promise<void> {
  if (!status.enabled) return;
  if (!manual && Date.now() < pausedUntil) return;
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    setStatus({ running: true });
    try {
      const user = await getCurrentUser();
      if (!user) {
        setStatus({ error: 'Nicht angemeldet. Bitte die Synchronisierung neu aktivieren.' });
        return;
      }
      do {
        rerun = false;
        // Die Einkaufsliste wird bei gleichzeitigen Änderungen zusammengeführt – dafür muss
        // vor dem Hochladen der aktuelle Stand abgerufen werden
        const listPending = (await db.shoppingList.toArray()).some(l => l._dirty !== 0);
        const received = pullRemote || listPending ? await pull(user.uid) : 0;
        const { pushed, skipped } = await push(user.uid);
        console.debug(`[Sync] ${received} empfangen, ${pushed} gesendet`);
        const lastSyncAt = Date.now();
        await setSetting(K_LAST_SYNC, lastSyncAt);
        pausedUntil = 0;
        setStatus({
          lastSyncAt,
          email: user.email,
          lastResult: { received, pushed },
          error: skipped.length ? `Zu groß für die Synchronisierung: ${skipped.join(', ')}` : null,
        });
      } while (rerun);
    } catch (err: any) {
      console.error('Synchronisierung fehlgeschlagen:', err);
      if (err?.code === 'resource-exhausted') pausedUntil = Date.now() + QUOTA_PAUSE_MS;
      setStatus({ error: describeError(err) });
    } finally {
      setStatus({ running: false });
      running = null;
    }
  })();
  return running;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSync(delay = CHANGE_DELAY_MS) {
  if (!status.enabled) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    syncNow({ pullRemote: false });
  }, delay);
}

export async function enableSync() {
  try {
    const user = await signInWithGoogle();
    await setSetting(K_ENABLED, true);
    await setSetting(K_LAST_PULL, null);
    setStatus({ enabled: true, email: user.email, error: null });
    await syncNow({ manual: true });
  } catch (err) {
    setStatus({ error: describeError(err) });
  }
}

export async function disableSync() {
  await setSetting(K_ENABLED, false);
  await setSetting(K_LAST_PULL, null);
  setStatus({ enabled: false, email: null, error: null, lastSyncAt: null });
  await signOutFirebase();
}

let initialized = false;

// Beim App-Start aufrufen
export async function initSync() {
  if (initialized) return;
  initialized = true;

  onLocalChange(() => scheduleSync());

  document.addEventListener('visibilitychange', () => {
    if (!status.enabled) return;
    if (document.visibilityState === 'hidden') {
      // Ausstehende Änderungen sofort hochladen, bevor die App geschlossen wird
      if (timer) {
        clearTimeout(timer);
        timer = null;
        syncNow({ pullRemote: false });
      }
    } else if (!status.lastSyncAt || Date.now() - status.lastSyncAt > FOCUS_INTERVAL_MS) {
      syncNow();
    }
  });
  window.addEventListener('online', () => scheduleSync(1000));

  if (await getSetting<boolean>(K_ENABLED)) {
    setStatus({ enabled: true, lastSyncAt: (await getSetting<number>(K_LAST_SYNC)) ?? null });
    syncNow();
  }
}
