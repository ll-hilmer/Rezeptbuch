import Dexie, { type Table } from 'dexie';
import { Recipe, PantryItem, ShoppingList, IconMapping } from '../types';

export interface StoredShoppingList extends ShoppingList {
  id: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

// Alle Daten liegen lokal im Browser (IndexedDB) – keine Server- oder Datenbankkosten.
class RezeptbuchDB extends Dexie {
  recipes!: Table<Recipe, string>;
  pantry!: Table<PantryItem, string>;
  shoppingList!: Table<StoredShoppingList, string>;
  ingredientIcons!: Table<IconMapping, string>;
  settings!: Table<Setting, string>;

  constructor() {
    super('rezeptbuch');
    this.version(1).stores({
      recipes: 'id, createdAt',
      pantry: 'id, name',
      shoppingList: 'id',
      ingredientIcons: 'id, keyword',
      settings: 'key',
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
