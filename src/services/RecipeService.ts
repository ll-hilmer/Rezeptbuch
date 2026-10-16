import { liveQuery } from 'dexie';
import { db, newId, getSetting, SHOPPING_LIST_ID } from '../lib/db';
import { Recipe, ShoppingList, ShoppingListItem, PantryItem, IconMapping } from '../types';

export const GEMINI_KEY_SETTING = 'geminiApiKey';

const ALLOWED_RECIPE_FIELDS = [
  'name', 'description', 'prepTime', 'calories',
  'nutritionalProtein', 'nutritionalCarbs', 'nutritionalFat',
  'type', 'method', 'ingredients', 'steps', 'images', 'status',
  'rating', 'plannedDates', 'originalLink', 'difficulty', 'carbs'
];
const NUMERIC_RECIPE_FIELDS = ['prepTime', 'calories', 'nutritionalProtein', 'nutritionalCarbs', 'nutritionalFat', 'rating'];

function sanitizeRecipe(recipe: Partial<Recipe>): Partial<Recipe> {
  const cleanData: any = {};
  Object.entries(recipe).forEach(([key, value]) => {
    if (ALLOWED_RECIPE_FIELDS.includes(key) && value !== undefined && value !== null) {
      if (NUMERIC_RECIPE_FIELDS.includes(key)) {
        cleanData[key] = Number(value) || 0;
      } else if (Array.isArray(value)) {
        cleanData[key] = [...value];
      } else {
        cleanData[key] = value;
      }
    }
  });
  return cleanData;
}

function subscribe<T>(query: () => Promise<T>, callback: (value: T) => void) {
  const subscription = liveQuery(query).subscribe({
    next: callback,
    error: (error) => console.error('Datenbankfehler:', error),
  });
  return () => subscription.unsubscribe();
}

const emptyShoppingList = (): ShoppingList => ({ items: [], updatedAt: null });

export const RecipeService = {
  async extractRecipeWithAI(text: string): Promise<Partial<Recipe>> {
    const apiKey = await getSetting<string>(GEMINI_KEY_SETTING);
    if (!apiKey) {
      throw new Error('Kein Gemini API-Key hinterlegt. Bitte in den Einstellungen eintragen.');
    }
    // Erst bei Bedarf laden, damit die App schneller startet
    const { GoogleGenAI, Type } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Extrahiere alle Rezeptdetails aus folgendem Text oder URL: ${text}.
      Übersetze alles ins Deutsche falls nötig.
      Antworte strikt im JSON Format.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            prepTime: { type: Type.NUMBER },
            calories: { type: Type.NUMBER },
            nutritionalProtein: { type: Type.NUMBER },
            nutritionalCarbs: { type: Type.NUMBER },
            nutritionalFat: { type: Type.NUMBER },
            type: { type: Type.ARRAY, items: { type: Type.STRING } },
            method: { type: Type.ARRAY, items: { type: Type.STRING } },
            ingredients: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  amount: { type: Type.STRING },
                  unit: { type: Type.STRING }
                },
                required: ["name", "amount", "unit"]
              }
            },
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  description: { type: Type.STRING }
                }
              }
            }
          },
          required: ["name", "ingredients", "steps"]
        }
      }
    });

    try {
      return JSON.parse(response.text || '{}');
    } catch (e) {
      console.error("AI Parse Error:", e);
      throw new Error("Rezept konnte nicht extrahiert werden.");
    }
  },

  // --- Vorrat ---

  async getPantryItems(): Promise<PantryItem[]> {
    return db.pantry.toArray();
  },

  listenToPantryItems(callback: (items: PantryItem[]) => void) {
    return subscribe(() => db.pantry.orderBy('name').toArray(), callback);
  },

  async addPantryItem(item: Omit<PantryItem, 'id'>) {
    const id = newId();
    await db.pantry.add({ ...item, id, createdAt: Date.now() });
    return id;
  },

  async deletePantryItem(id: string) {
    await db.pantry.delete(id);
  },

  async updatePantryItem(id: string, data: Partial<PantryItem>) {
    await db.pantry.update(id, data);
  },

  // --- Rezepte ---

  async getRecipes(): Promise<Recipe[]> {
    return db.recipes.orderBy('createdAt').reverse().toArray();
  },

  async getRecipe(id: string): Promise<Recipe | undefined> {
    return db.recipes.get(id);
  },

  listenToRecipes(callback: (recipes: Recipe[]) => void) {
    return subscribe(() => this.getRecipes(), callback);
  },

  async addRecipe(recipe: Omit<Recipe, 'id' | 'userId' | 'createdAt'>) {
    const id = newId();
    await db.recipes.add({
      rating: 0, carbs: [], type: [], method: [], ingredients: [], images: [], plannedDates: [],
      ...sanitizeRecipe(recipe),
      id,
      createdAt: Date.now(),
    } as Recipe);
    return id;
  },

  async updateRecipe(id: string, recipe: Partial<Recipe>) {
    await db.recipes.update(id, {
      ...sanitizeRecipe(recipe),
      updatedAt: Date.now(),
    });
  },

  async deleteRecipe(id: string) {
    await db.recipes.delete(id);
  },

  // --- Einkaufsliste ---

  async getShoppingList(): Promise<ShoppingList> {
    return (await db.shoppingList.get(SHOPPING_LIST_ID)) || emptyShoppingList();
  },

  listenToShoppingList(callback: (list: ShoppingList) => void) {
    return subscribe(() => this.getShoppingList(), callback);
  },

  async updateShoppingList(items: ShoppingListItem[]) {
    // undefined-Werte entfernen, damit Export/Import sauber bleibt
    const sanitizedItems = items.map(item => {
      const cleaned: any = {};
      Object.entries(item).forEach(([key, value]) => {
        if (value !== undefined) {
          cleaned[key] = value;
        }
      });
      return cleaned;
    });

    await db.shoppingList.put({
      id: SHOPPING_LIST_ID,
      items: sanitizedItems,
      updatedAt: Date.now()
    });
  },

  async addIngredientsToShoppingList(recipe: { id?: string, name: string, images?: string[], ingredients: { name: string, amount: string, unit: string }[] }, customMappings?: Record<string, any>) {
    const currentList = await this.getShoppingList();
    const newItems = [...currentList.items];
    recipe.ingredients.forEach(ing => {
      const category = this.inferCategory(ing.name, customMappings);
      newItems.push({
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit,
        checked: false,
        recipeId: recipe.id,
        recipeName: recipe.name,
        recipeImage: recipe.images?.[0],
        category
      });
    });

    await this.updateShoppingList(newItems);
  },

  // --- Zutaten-Icons ---

  // "name" ist ein altes Feld aus früheren Versionen
  async getIconMappings(): Promise<(IconMapping & { name?: string })[]> {
    return db.ingredientIcons.toArray();
  },

  listenToIconMappings(callback: (mappings: IconMapping[]) => void) {
    return subscribe(() => db.ingredientIcons.orderBy('keyword').toArray(), callback);
  },

  async addIconMapping(mapping: Omit<IconMapping, 'id'>) {
    const id = newId();
    await db.ingredientIcons.add({ ...mapping, id });
    return id;
  },

  async deleteIconMapping(id: string) {
    await db.ingredientIcons.delete(id);
  },

  inferCategory(name: string, customMappings?: Record<string, any>): string {
    const n = name.toLowerCase();

    // 1. Check custom mappings first
    if (customMappings) {
      for (const [keyword, mapping] of Object.entries(customMappings)) {
        if (keyword && n.includes(keyword.toLowerCase())) {
          const category = typeof mapping === 'string' ? mapping : mapping?.category;
          if (category) return category;
        }
      }
    }

    // 2. Fallback to existing logic
    if (/apfel|birne|banane|zitrone|limette|tomate|gurke|paprika|zwiebel|knoblauch|salat|spinat|kartoffel|karotte|pilze|kräuter|kürbis|zucchini|aubergine|brokkoli|blumenkohl|lauch|beeren|obst|gemüse/.test(n)) return 'Obst & Gemüse';
    if (/milch|käse|sahne|quark|joghurt|butter|eier|feta|mozzarella|parmesan/.test(n)) return 'Milch & Käse';
    if (/fleisch|hähnchen|rind|schwein|speck|wurst|fisch|lachs|thunfisch|garnele/.test(n)) return 'Fleisch & Fisch';
    if (/brot|brötchen|baguette|toast|mehl|backpulver|hefe|zucker|vanille|nuesse|nüsse/.test(n)) return 'Brot & Backwaren';
    if (/nudeln|reis|couscous|quinoa|linsen|bohnen|erbsen|mais|senf|ketchup|mayonnaise|öl|essig|brühe|passierte|tomatene|mark|konserve|pest/.test(n)) return 'Vorrat';
    if (/gewürz|salz|pfeffer|paprika edelsüß|zimt|kurkuma|oregano|basilikum|thymian|rosmarin|kreuzkümmel|koriander/.test(n)) return 'Gewürze';
    return 'Sonstiges';
  }
};
