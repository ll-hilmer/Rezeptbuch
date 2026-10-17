import { db, stamp, stripSyncMeta, getSetting, SHOPPING_LIST_ID } from './db';
import { getFirebase, signInWithGoogle, signOutFirebase } from './firebase-client';
import { Recipe, PantryItem, ShoppingList, IconMapping } from '../types';

const BACKUP_FORMAT = 'rezeptbuch-backup';
const BACKUP_VERSION = 1;

export interface BackupData {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  recipes: Recipe[];
  pantry: PantryItem[];
  shoppingList: ShoppingList | null;
  ingredientIcons: IconMapping[];
}

export interface ImportSummary {
  recipes: number;
  pantry: number;
  shoppingItems: number;
  ingredientIcons: number;
}

export async function createBackup(): Promise<BackupData> {
  const [recipes, pantry, shoppingList, ingredientIcons] = await Promise.all([
    db.recipes.toArray(),
    db.pantry.toArray(),
    db.shoppingList.get(SHOPPING_LIST_ID),
    db.ingredientIcons.toArray(),
  ]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    recipes: recipes.map(stripSyncMeta),
    pantry: pantry.map(stripSyncMeta),
    shoppingList: shoppingList ? { items: shoppingList.items, updatedAt: shoppingList.updatedAt } : null,
    ingredientIcons: ingredientIcons.map(stripSyncMeta),
  };
}

export async function downloadBackup() {
  const backup = await createBackup();
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rezeptbuch-backup-${backup.exportedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Schreibt Daten in die lokale Datenbank. Einträge mit gleicher ID werden überschrieben,
// ein erneuter Import erzeugt also keine Duplikate. Die Einträge gelten als geändert und
// werden bei aktiver Synchronisierung hochgeladen.
async function writeData(data: Omit<BackupData, 'format' | 'version' | 'exportedAt'>): Promise<ImportSummary> {
  await db.transaction('rw', [db.recipes, db.pantry, db.shoppingList, db.ingredientIcons], async () => {
    await db.recipes.bulkPut(data.recipes.map(r => stamp(r)));
    await db.pantry.bulkPut(data.pantry.map(p => stamp(p)));
    await db.ingredientIcons.bulkPut(data.ingredientIcons.map(i => stamp(i)));
    if (data.shoppingList) {
      await db.shoppingList.put(stamp({ ...data.shoppingList, id: SHOPPING_LIST_ID }));
    }
  });
  return {
    recipes: data.recipes.length,
    pantry: data.pantry.length,
    shoppingItems: data.shoppingList?.items.length ?? 0,
    ingredientIcons: data.ingredientIcons.length,
  };
}

export async function importBackupFile(file: File): Promise<ImportSummary> {
  let data: BackupData;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('Die Datei ist kein gültiges Backup.');
  }
  if (data?.format !== BACKUP_FORMAT || !Array.isArray(data.recipes)) {
    throw new Error('Die Datei ist kein Rezeptbuch-Backup.');
  }
  if (data.version > BACKUP_VERSION) {
    throw new Error('Das Backup stammt aus einer neueren App-Version.');
  }
  return writeData({
    recipes: data.recipes.filter(r => r?.id),
    pantry: (data.pantry || []).filter(p => p?.id),
    shoppingList: data.shoppingList || null,
    ingredientIcons: (data.ingredientIcons || []).filter(i => i?.id),
  });
}

// Firestore-Timestamps (und verschachtelte Objekte) in einfache Werte umwandeln
function normalize(value: any): any {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    if (typeof value.toMillis === 'function') return value.toMillis();
    const result: Record<string, any> = {};
    for (const [key, v] of Object.entries(value)) result[key] = normalize(v);
    return result;
  }
  return value;
}

// Einmalige Übernahme der Daten aus der alten Firebase-Datenbank (AI Studio).
export async function importFromFirebase(): Promise<ImportSummary> {
  const { firestore: fs, firestoreModule: firestore } = await getFirebase();
  const user = await signInWithGoogle();

  try {
    const byUser = (name: string) =>
      firestore.getDocs(firestore.query(firestore.collection(fs, name), firestore.where('userId', '==', user.uid)));

    const [recipeSnap, pantrySnap, listSnap, iconSnap] = await Promise.all([
      byUser('recipes'),
      byUser('pantry'),
      firestore.getDoc(firestore.doc(fs, 'shoppingLists', user.uid)),
      firestore.getDocs(firestore.collection(fs, 'ingredientIcons')),
    ]);

    const recipes = recipeSnap.docs.map(d => {
      const r = normalize({ ...d.data(), id: d.id });
      if (typeof r.createdAt !== 'number') r.createdAt = Date.now();
      return r as Recipe;
    });
    const pantry = pantrySnap.docs.map(d => normalize({ ...d.data(), id: d.id }) as PantryItem);
    const ingredientIcons = iconSnap.docs.map(d => normalize({ ...d.data(), id: d.id }) as IconMapping);
    const listData = listSnap.exists() ? normalize(listSnap.data()) : null;
    const shoppingList: ShoppingList | null = listData
      ? { items: Array.isArray(listData.items) ? listData.items : [], updatedAt: listData.updatedAt ?? null }
      : null;

    return await writeData({ recipes, pantry, shoppingList, ingredientIcons });
  } finally {
    // Angemeldet bleiben, wenn die Synchronisierung dieselbe Anmeldung nutzt
    if (!(await getSetting<boolean>('syncEnabled'))) await signOutFirebase();
  }
}
