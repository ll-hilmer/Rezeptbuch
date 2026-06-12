export enum RecipeType {
  FISCH = 'Fisch',
  VEGETARISCH = 'Vegetarisch',
  FLEISCH = 'Fleisch'
}

export interface Ingredient {
  name: string;
  amount: string;
  unit: string;
  icon?: string; // Optional icon name from lucide
}

export interface StepIngredient {
  index: number;
  amount?: string;
}

export interface Step {
  description: string;
  duration?: number; // in seconds
  ingredientIndices?: number[]; // Legacy, keeping for compatibility during migration if needed
  stepIngredients?: StepIngredient[]; // New structured data
}

export interface Recipe {
  id?: string;
  name: string;
  rating: number;
  carbs: string[]; // Changed from number to array of tags
  type: RecipeType[]; // Changed to array
  method: string[]; // Changed from string to array
  ingredients: Ingredient[];
  steps?: Step[];
  description?: string;
  originalLink?: string;
  images: string[];
  plannedDates: string[];
  userId: string;
  calories?: number;
  nutritionalProtein?: number;
  nutritionalCarbs?: number;
  nutritionalFat?: number;
  difficulty?: 'Einfach' | 'Mittel' | 'Schwer';
  prepTime?: number; // Preparation time in minutes
  status?: 'Neu' | 'Ausprobieren' | 'Ausprobiert';
  createdAt: any;
  updatedAt?: any;
}

export interface PantryItem {
  id?: string;
  name: string;
  amount: string;
  unit: string;
  category?: string;
  expiryDate?: string;
  userId: string;
}

export interface ShoppingListItem {
  name: string;
  amount?: string;
  unit?: string;
  checked: boolean;
  recipeId?: string;
  recipeName?: string;
  recipeImage?: string;
  category?: string;
}

export interface ShoppingList {
  userId: string;
  items: ShoppingListItem[];
  updatedAt: any;
}
