import Dexie, { type Table } from 'dexie';
import { Recipe, PantryItem, ShoppingList, IconMapping } from '../types';

// Felder für die Synchronisierung: Zeitpunkt der letzten lokalen Änderung, ob sie noch
// hochgeladen werden muss (fehlt = noch nie synchronisiert) und welcher Stand zuletzt
// in der Cloud lag (zum Erkennen echter Konflikte).
export interface SyncMeta {
  _mtime?: number;
  _dirty?: 0 | 1;
  _base?: number;
}

export interface StoredShoppingList extends ShoppingList {
  id: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

// Merkt sich gelöschte Einträge, bis die Löschung auf andere Geräte übertragen wurde
export interface Deletion {
  key: string;
  table: SyncedTable;
  id: string;
  _mtime: number;
}

// Zwischenspeicher für Bilder aus der Cloud (Schlüssel = Inhalts-Hash)
export interface SyncImage {
  hash: string;
  dataUrl: string;
}

export const SYNCED_TABLES = ['recipes', 'pantry', 'shoppingList', 'ingredientIcons'] as const;
export type SyncedTable = typeof SYNCED_TABLES[number];

// Alle Daten liegen lokal im Browser (IndexedDB). Die Cloud dient nur zum Abgleich.
class RezeptbuchDB extends Dexie {
  recipes!: Table<Recipe & SyncMeta, string>;
  pantry!: Table<PantryItem & SyncMeta, string>;
  shoppingList!: Table<StoredShoppingList & SyncMeta, string>;
  ingredientIcons!: Table<IconMapping & SyncMeta, string>;
  settings!: Table<Setting, string>;
  deletions!: Table<Deletion, string>;
  syncImages!: Table<SyncImage, string>;
  cloudImages!: Table<{ hash: string }, string>;

  constructor() {
    super('rezeptbuch');
    this.version(1).stores({
      recipes: 'id, createdAt',
      pantry: 'id, name',
      shoppingList: 'id',
      ingredientIcons: 'id, keyword',
      settings: 'key',
    });
    this.version(2).stores({
      deletions: 'key',
      syncImages: 'hash',
    });
    // Bilder, die bereits in users/{uid}/images liegen
    this.version(3).stores({
      cloudImages: 'hash',
    });
  }
}

export const db = new RezeptbuchDB();

export const SHOPPING_LIST_ID = 'default';

export function newId(): string {
  // crypto.randomUUID gibt es nur in sicheren Kontexten (https/localhost)
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback unten
    }
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// --- Benachrichtigung über lokale Änderungen (startet die Synchronisierung) ---

const changeListeners = new Set<() => void>();

export function onLocalChange(listener: () => void) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

function notifyLocalChange() {
  // Erst nach dem Schreiben benachrichtigen
  setTimeout(() => changeListeners.forEach(l => l()), 0);
}

// Markiert einen Datensatz als lokal geändert. Bei jedem Schreibzugriff verwenden.
export function stamp<T extends object>(data: T): T & SyncMeta {
  notifyLocalChange();
  return { ...data, _mtime: Date.now(), _dirty: 1 };
}

export async function deleteSynced(table: SyncedTable, id: string) {
  await db.transaction('rw', [db.table(table), db.deletions], async () => {
    await db.table(table).delete(id);
    await db.deletions.put({ key: `${table}:${id}`, table, id, _mtime: Date.now() });
  });
  notifyLocalChange();
}

// Entfernt die Sync-Felder, z. B. für Backups
export function stripSyncMeta<T extends SyncMeta>(record: T): Omit<T, keyof SyncMeta> {
  const { _mtime, _dirty, _base, ...rest } = record;
  return rest;
}

// --- Einstellungen ---

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const entry = await db.settings.get(key);
  return entry?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}

// Bittet den Browser, die Daten nicht automatisch zu löschen, wenn Speicher knapp wird.
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && await navigator.storage.persisted()) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    // Nicht unterstützt
  }
  return false;
}
