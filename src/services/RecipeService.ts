import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  arrayUnion,
  onSnapshot
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Recipe, ShoppingList, ShoppingListItem, PantryItem } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

const RECIPES_COL = 'recipes';
const SHOPPING_LISTS_COL = 'shoppingLists';
const PANTRY_COL = 'pantry';

export const RecipeService = {
  async extractRecipeWithAI(text: string): Promise<Partial<Recipe>> {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
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

  async getPantryItems(): Promise<PantryItem[]> {
    const userId = auth.currentUser?.uid;
    if (!userId) return [];
    
    try {
      const q = query(
        collection(db, PANTRY_COL),
        where('userId', '==', userId)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PantryItem));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, PANTRY_COL);
      return [];
    }
  },

  async deletePantryItem(id: string) {
    try {
      await deleteDoc(doc(db, PANTRY_COL, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${PANTRY_COL}/${id}`);
    }
  },

  async updatePantryItem(id: string, data: any) {
    try {
      await updateDoc(doc(db, PANTRY_COL, id), data);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${PANTRY_COL}/${id}`);
    }
  },
  async getRecipes() {
    const userId = auth.currentUser?.uid;
    if (!userId) return [];
    
    try {
      const q = query(
        collection(db, RECIPES_COL),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Recipe));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, RECIPES_COL);
      return [];
    }
  },

  listenToRecipes(callback: (recipes: Recipe[]) => void) {
    const userId = auth.currentUser?.uid;
    if (!userId) return () => {};

    const q = query(
      collection(db, RECIPES_COL),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const recipes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Recipe));
      callback(recipes);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, RECIPES_COL);
    });
  },

  async addRecipe(recipe: Omit<Recipe, 'id' | 'userId' | 'createdAt'>) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    try {
      // Sanitieren der Daten bevor sie an Firestore gesendet werden
      const cleanData: any = {};
      const allowedFields = [
        'name', 'description', 'prepTime', 'calories', 
        'nutritionalProtein', 'nutritionalCarbs', 'nutritionalFat', 
        'type', 'method', 'ingredients', 'steps', 'images', 'status',
        'rating', 'plannedDates', 'originalLink', 'difficulty', 'carbs'
      ];

      Object.entries(recipe).forEach(([key, value]) => {
        if (allowedFields.includes(key) && value !== undefined && value !== null) {
          if (['prepTime', 'calories', 'nutritionalProtein', 'nutritionalCarbs', 'nutritionalFat', 'rating'].includes(key)) {
            cleanData[key] = Number(value) || 0;
          } else if (Array.isArray(value)) {
            // Arrays werden kopiert um sicherzustellen dass sie keine versteckten Props haben
            cleanData[key] = [...value];
          } else {
            cleanData[key] = value;
          }
        }
      });

      return await addDoc(collection(db, RECIPES_COL), {
        ...cleanData,
        userId,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, RECIPES_COL);
    }
  },

  async updateRecipe(id: string, recipe: Partial<Recipe>) {
    try {
      const recipeRef = doc(db, RECIPES_COL, id);
      
      // Sanitieren der Daten bevor sie an Firestore gesendet werden
      const cleanData: any = {};
      const allowedFields = [
        'name', 'description', 'prepTime', 'calories', 
        'nutritionalProtein', 'nutritionalCarbs', 'nutritionalFat', 
        'type', 'method', 'ingredients', 'steps', 'images', 'status',
        'rating', 'plannedDates', 'originalLink', 'difficulty', 'carbs'
      ];

      Object.entries(recipe).forEach(([key, value]) => {
        if (allowedFields.includes(key) && value !== undefined && value !== null) {
          if (['prepTime', 'calories', 'nutritionalProtein', 'nutritionalCarbs', 'nutritionalFat', 'rating'].includes(key)) {
            cleanData[key] = Number(value) || 0;
          } else if (Array.isArray(value)) {
            cleanData[key] = [...value];
          } else {
            cleanData[key] = value;
          }
        }
      });

      await updateDoc(recipeRef, {
        ...cleanData,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${RECIPES_COL}/${id}`);
    }
  },

  async deleteRecipe(id: string) {
    try {
      await deleteDoc(doc(db, RECIPES_COL, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${RECIPES_COL}/${id}`);
    }
  },

  async getShoppingList() {
    const userId = auth.currentUser?.uid;
    if (!userId) return null;

    try {
      const docRef = doc(db, SHOPPING_LISTS_COL, userId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as ShoppingList;
      }
      return { userId, items: [], updatedAt: null };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${SHOPPING_LISTS_COL}/${userId}`);
      return null;
    }
  },

  listenToShoppingList(callback: (list: ShoppingList) => void) {
    const userId = auth.currentUser?.uid;
    if (!userId) return () => {};

    const docRef = doc(db, SHOPPING_LISTS_COL, userId);
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data() as ShoppingList);
      } else {
        callback({ userId, items: [], updatedAt: null });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `${SHOPPING_LISTS_COL}/${userId}`);
    });
  },

  async updateShoppingList(items: ShoppingListItem[]) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      const docRef = doc(db, SHOPPING_LISTS_COL, userId);
      // Remove any undefined values from the items to prevent Firestore errors
      const sanitizedItems = items.map(item => {
        const cleaned: any = {};
        Object.entries(item).forEach(([key, value]) => {
          if (value !== undefined) {
            cleaned[key] = value;
          }
        });
        return cleaned;
      });

      await setDoc(docRef, {
        userId,
        items: sanitizedItems,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${SHOPPING_LISTS_COL}/${userId}`);
    }
  },

  async addIngredientsToShoppingList(recipe: { id?: string, name: string, images?: string[], ingredients: { name: string, amount: string, unit: string }[] }, customMappings?: Record<string, any>) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    try {
      const currentList = await this.getShoppingList();
      const currentItems = currentList?.items || [];
      
      const newItems = [...currentItems];
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
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${SHOPPING_LISTS_COL}/${userId}`);
    }
  },

  async getIconMappings(): Promise<any[]> {
    try {
      const snapshot = await getDocs(collection(db, 'ingredientIcons'));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'ingredientIcons');
      return [];
    }
  },

  inferCategory(name: string, customMappings?: Record<string, any>): string {
    const n = name.toLowerCase();
    
    // 1. Check custom mappings from Firestore first
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
