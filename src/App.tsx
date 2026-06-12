import React, { useState, useEffect } from 'react';
import { ChefHat, ListTodo, Calendar, Plus, Library, LogOut, Package } from 'lucide-react';
import { logout } from './lib/firebase';
import RecipeList from './components/RecipeList';
import RecipeEditor from './components/RecipeEditor';
import ShoppingListView from './components/ShoppingListView';
import MealPlanView from './components/MealPlanView';
import PantryView from './components/PantryView';
import RecipeDetail from './components/RecipeDetail';
import AuthGuard from './components/AuthGuard';
import CookingMode from './components/CookingMode';
import { Recipe } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { RecipeService } from './services/RecipeService';

type View = 'recipes' | 'planner' | 'shopping' | 'add' | 'pantry';

export default function App() {
  const [activeView, setActiveView] = useState<View>('recipes');
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [activeCookingRecipe, setActiveCookingRecipe] = useState<Recipe | null>(null);
  const [detailedRecipe, setDetailedRecipe] = useState<Recipe | null>(null);

  const handleEdit = (id: string) => {
    setEditingRecipeId(id);
    setActiveView('add');
  };

  const handleSaved = () => {
    setEditingRecipeId(null);
    setActiveView('recipes');
  };

  const handleAddToShoppingList = async (recipe: Recipe) => {
    const mappingsArr = await RecipeService.getIconMappings();
    const mappingsObj: Record<string, string> = {};
    mappingsArr.forEach(m => {
      // Use keyword as it is the correct field name in ingredientIcons collection
      const name = m.keyword || m.name;
      if (m && name) {
        mappingsObj[name.toLowerCase().trim()] = m.category || '';
      }
    });
    
    await RecipeService.addIngredientsToShoppingList(recipe, mappingsObj);
    alert('Zutaten zur Einkaufsliste hinzugefügt!');
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-natural-bg text-natural-text pb-20 md:pb-0 md:pl-24">
        {/* Sidebar / Desktop Nav */}
        <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-24 bg-natural-primary flex flex-col items-center py-8 gap-10 text-natural-bg">
          <div className="p-3 bg-white/10 rounded-2xl">
            <ChefHat className="w-8 h-8" />
          </div>

          <nav className="flex flex-col gap-8">
            <SidebarIcon 
              active={activeView === 'recipes'} 
              onClick={() => setActiveView('recipes')}
              icon={<Library className="w-6 h-6" />}
              label="Rezepte"
            />
            <SidebarIcon 
              active={activeView === 'planner'} 
              onClick={() => setActiveView('planner')}
              icon={<Calendar className="w-6 h-6" />}
              label="Plan"
            />
            <SidebarIcon 
              active={activeView === 'shopping'} 
              onClick={() => setActiveView('shopping')}
              icon={<ListTodo className="w-6 h-6" />}
              label="Liste"
            />
            <SidebarIcon 
              active={activeView === 'pantry'} 
              onClick={() => setActiveView('pantry')}
              icon={<Package className="w-6 h-6" />}
              label="Vorrat"
            />
            <SidebarIcon 
              active={activeView === 'add'} 
              onClick={() => { setEditingRecipeId(null); setActiveView('add'); }}
              icon={<Plus className="w-6 h-6" />}
              label="Neu"
            />
          </nav>

          <button 
            onClick={logout}
            className="mt-auto p-3 opacity-60 hover:opacity-100 transition-opacity"
            id="logout-button"
            title="Abmelden"
          >
            <LogOut className="w-6 h-6" />
          </button>
        </aside>

        {/* Header Mobile */}
        <header className="md:hidden flex items-center justify-between p-4 bg-white border-b border-[#e9e4df] sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <ChefHat className="w-6 h-6 text-natural-primary" />
            <h1 className="font-serif font-bold italic text-natural-primary">Rezeptbuch</h1>
          </div>
          <button onClick={logout} className="text-natural-accent" id="mobile-logout">
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        {/* Main Content */}
        <main className="max-w-5xl mx-auto p-4 md:p-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeView === 'recipes' && (
                <RecipeList 
                  onEdit={handleEdit} 
                  onOpenDetail={setDetailedRecipe} 
                />
              )}
              {activeView === 'planner' && (
                <MealPlanView 
                  onEdit={handleEdit} 
                  onStartCooking={setDetailedRecipe} 
                />
              )}
              {activeView === 'shopping' && <ShoppingListView />}
              {activeView === 'pantry' && <PantryView />}
              {activeView === 'add' && <RecipeEditor recipeId={editingRecipeId} onSaved={handleSaved} />}
            </motion.div>
          </AnimatePresence>

          <AnimatePresence>
            {detailedRecipe && (
              <RecipeDetail 
                recipe={detailedRecipe} 
                onClose={() => setDetailedRecipe(null)}
                onAddToShoppingList={() => handleAddToShoppingList(detailedRecipe)}
                onStartCooking={() => {
                  const r = detailedRecipe;
                  setDetailedRecipe(null);
                  setActiveCookingRecipe(r);
                }}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {activeCookingRecipe && (
              <CookingMode 
                recipe={activeCookingRecipe} 
                onClose={() => setActiveCookingRecipe(null)} 
              />
            )}
          </AnimatePresence>
        </main>

        {/* Mobile Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#e9e4df] flex items-center justify-around p-2 pb-6 z-50">
          <MobileNavItem active={activeView === 'recipes'} onClick={() => setActiveView('recipes')} icon={<Library className="w-6 h-6" />} label="Rezepte" />
          <MobileNavItem active={activeView === 'planner'} onClick={() => setActiveView('planner')} icon={<Calendar className="w-6 h-6" />} label="Plan" />
          <div className="relative -top-4">
            <button 
              onClick={() => { setEditingRecipeId(null); setActiveView('add'); }}
              className="bg-natural-accent text-white p-4 rounded-full shadow-lg"
              id="mobile-add-btn"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
          <MobileNavItem active={activeView === 'shopping'} onClick={() => setActiveView('shopping')} icon={<ListTodo className="w-6 h-6" />} label="Einkauf" />
          <MobileNavItem active={activeView === 'pantry'} onClick={() => setActiveView('pantry')} icon={<Package className="w-6 h-6" />} label="Vorrat" />
        </nav>
      </div>
    </AuthGuard>
  );
}

function SidebarIcon({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`p-2 transition-all group relative ${active ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
      id={`nav-${label.toLowerCase()}`}
      title={label}
    >
      {icon}
      {active && (
        <motion.div 
          layoutId="active-nav"
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-l-full" 
        />
      )}
    </button>
  );
}

function MobileNavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 ${active ? 'text-[#5c4033]' : 'text-[#8b5a2b]'}`}
      id={`mobile-nav-${label.toLowerCase()}`}
    >
      {icon}
      <span className="text-[10px] font-medium tracking-wide border-0">{label}</span>
    </button>
  );
}
