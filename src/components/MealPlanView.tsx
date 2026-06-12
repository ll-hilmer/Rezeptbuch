import React, { useState, useEffect, useMemo } from 'react';
import { RecipeService } from '../services/RecipeService';
import { Recipe } from '../types';
import { Calendar, ChefHat, ArrowRight, Trash2, Edit3, Utensils, ChevronLeft, ChevronRight, ShoppingCart, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  format, 
  isAfter, 
  isSameDay, 
  startOfToday, 
  addDays, 
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  addMonths,
  subMonths
} from 'date-fns';
import { de } from 'date-fns/locale';

interface MealPlanViewProps {
  onEdit: (id: string) => void;
  onStartCooking: (recipe: Recipe) => void;
}

export default function MealPlanView({ onEdit, onStartCooking }: MealPlanViewProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'weekly' | 'monthly'>('weekly');
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    return RecipeService.listenToRecipes(setRecipes);
  }, []);

  const plannedMeals = useMemo(() => {
    const meals: { recipe: Recipe, date: string }[] = [];
    recipes.forEach(recipe => {
      recipe.plannedDates?.forEach(date => {
        meals.push({ recipe, date });
      });
    });
    return meals.sort((a, b) => a.date.localeCompare(b.date));
  }, [recipes]);

  const upcomingMeals = useMemo(() => {
    const today = startOfToday();
    return plannedMeals.filter(m => {
      const mealDate = new Date(m.date);
      return isAfter(mealDate, today) || isSameDay(mealDate, today);
    });
  }, [plannedMeals]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const mealsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return plannedMeals.filter(m => m.date === dateStr);
  };

  const removePlan = async (recipe: Recipe, date: string) => {
    const updatedDates = recipe.plannedDates.filter(d => d !== date);
    await RecipeService.updateRecipe(recipe.id!, { plannedDates: updatedDates });
  };

  const syncPlanToShoppingList = async () => {
    try {
      const pantryItems = await RecipeService.getPantryItems();
      const missingIngredients: any[] = [];

      upcomingMeals.forEach(meal => {
        meal.recipe.ingredients.forEach(ing => {
          const inPantry = pantryItems.some(p => 
            p.name.toLowerCase().includes(ing.name.toLowerCase()) || 
            ing.name.toLowerCase().includes(p.name.toLowerCase())
          );
          
          if (!inPantry) {
            missingIngredients.push({
              ...ing,
              recipeName: meal.recipe.name,
              recipeId: meal.recipe.id,
              recipeImage: meal.recipe.images?.[0]
            });
          }
        });
      });

      if (missingIngredients.length === 0) {
        alert("Alles vorhanden! Dein Vorrat deckt alle geplanten Mahlzeiten ab.");
        return;
      }

      const currentList = await RecipeService.getShoppingList();
      const existingItems = currentList?.items || [];
      
      const newItems = [...existingItems];
      missingIngredients.forEach(ing => {
        // Prevent duplicates for the same recipe
        const alreadyInList = existingItems.some(e => e.name === ing.name && e.recipeName === ing.recipeName);
        if (!alreadyInList) {
          newItems.push({
            name: ing.name,
            amount: ing.amount,
            unit: ing.unit,
            checked: false,
            recipeId: ing.recipeId,
            recipeName: ing.recipeName,
            recipeImage: ing.recipeImage,
            category: RecipeService.inferCategory(ing.name)
          });
        }
      });

      await RecipeService.updateShoppingList(newItems);
      alert(`${missingIngredients.length} fehlende Zutaten wurden zur Einkaufsliste hinzugefügt.`);
    } catch (err) {
      console.error("Sync Error:", err);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-serif font-bold italic text-natural-primary">Planung</h2>
          <div className="flex gap-4 mt-4">
             <button
              onClick={() => setActiveTab('weekly')}
              className={`pb-2 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 flex items-center gap-2 ${activeTab === 'weekly' ? 'border-natural-accent text-natural-accent' : 'border-transparent opacity-40 hover:opacity-60 text-natural-primary'}`}
             >
                Wochenplan
             </button>
             <button
              onClick={() => setActiveTab('monthly')}
              className={`pb-2 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 flex items-center gap-2 ${activeTab === 'monthly' ? 'border-natural-accent text-natural-accent' : 'border-transparent opacity-40 hover:opacity-60 text-natural-primary'}`}
             >
                Monatsplan
             </button>
          </div>
        </div>

        <button 
          onClick={syncPlanToShoppingList}
          className="flex items-center gap-2 bg-natural-accent text-white px-6 py-3 rounded-2xl text-sm font-black shadow-lg shadow-natural-accent/20 hover:scale-105 transition-all mb-1"
        >
          <Sparkles className="w-4 h-4" />
          Einkaufs-Sync
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'weekly' ? (
          <motion.div 
            key="weekly"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            {upcomingMeals.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border border-[#e9e4df] border-dashed">
                <Calendar className="w-12 h-12 text-[#e9e4df] mx-auto mb-4" />
                <p className="text-[#8b5a2b]">Noch keine Mahlzeiten geplant.</p>
                <p className="text-sm text-gray-400 mt-1">Wähle ein Rezept aus und setze ein Datum.</p>
              </div>
            ) : (
              <div className="space-y-12">
                {upcomingMeals.map((meal, idx) => {
                  const isToday = isSameDay(new Date(meal.date), startOfToday());
                  return (
                    <motion.div 
                      key={`${meal.recipe.id}-${meal.date}-${idx}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="relative pl-10 md:pl-16 border-l border-natural-primary/10"
                    >
                      {/* Timeline Dot */}
                      <div className={`absolute left-[-4.5px] top-6 w-2 h-2 rounded-full ${isToday ? 'bg-natural-accent ring-4 ring-natural-accent/10 scale-150' : 'bg-natural-primary/20'}`} />
                      
                      <div className="flex flex-col md:flex-row gap-6 items-start py-4">
                        <div className="min-w-[120px]">
                          <p className={`text-[10px] font-bold uppercase tracking-widest ${isToday ? 'text-natural-accent' : 'text-natural-primary opacity-60'}`}>
                            {isToday ? 'Heute' : format(new Date(meal.date), 'EEEE', { locale: de })}
                          </p>
                          <p className="text-lg font-serif font-medium text-natural-text">
                            {format(new Date(meal.date), 'd. MMMM', { locale: de })}
                          </p>
                        </div>

                        <div className="flex-1 w-full bg-white rounded-[32px] shadow-sm overflow-hidden hover:shadow-md transition-shadow flex items-center p-4 cursor-pointer" onClick={() => onStartCooking(meal.recipe)}>
                          <div className="w-20 h-20 bg-natural-bg rounded-[20px] overflow-hidden shrink-0">
                            {meal.recipe.images?.[0] ? (
                              <img src={meal.recipe.images[0]} alt={meal.recipe.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-natural-primary/20">
                                <ChefHat className="w-8 h-8" />
                              </div>
                            )}
                          </div>

                          <div className="ml-6 flex-1">
                             <p className="text-[10px] font-bold text-natural-primary opacity-60 uppercase tracking-wider mb-1">
                              {Array.isArray(meal.recipe.type) ? meal.recipe.type.join(', ') : meal.recipe.type}
                             </p>
                             <h3 className="text-lg font-serif text-natural-text line-clamp-1">{meal.recipe.name}</h3>
                             <div className="flex items-center gap-4 mt-1 opacity-60">
                              <span className="text-[10px] font-medium flex items-center gap-1">
                                {Array.isArray(meal.recipe.method) ? meal.recipe.method.join(', ') : meal.recipe.method}
                              </span>
                              <span>•</span>
                              <span className="text-[10px] font-medium flex items-center gap-1">
                                {Array.isArray(meal.recipe.carbs) ? meal.recipe.carbs.join(', ') : `${meal.recipe.carbs}g Carbs`}
                              </span>
                             </div>
                          </div>

                          <div className="flex gap-1 ml-2">
                            <button 
                              onClick={(e) => { e.stopPropagation(); onEdit(meal.recipe.id!); }}
                              className="p-3 text-natural-primary opacity-40 hover:opacity-100 hover:bg-natural-bg rounded-full transition-all"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); removePlan(meal.recipe, meal.date); }}
                              className="p-3 text-natural-accent opacity-40 hover:opacity-100 hover:bg-natural-bg rounded-full transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div 
            key="monthly"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Calendar Header */}
            <div className="flex items-center justify-between bg-white px-6 py-4 rounded-3xl shadow-sm border border-natural-bg">
              <button 
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="p-2 hover:bg-natural-bg rounded-full transition-colors text-natural-primary"
                aria-label="Vorheriger Monat"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h3 className="text-2xl font-serif font-bold text-natural-primary capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: de })}
              </h3>
              <button 
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="p-2 hover:bg-natural-bg rounded-full transition-colors text-natural-primary"
                aria-label="Nächster Monat"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="bg-white rounded-[32px] shadow-sm border border-natural-bg overflow-hidden text-natural-text">
              <div className="overflow-x-auto">
                <div className="min-w-[700px] md:min-w-0">
                  <div className="grid grid-cols-7 border-b border-natural-bg bg-natural-bg/10">
                    {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(day => (
                      <div key={day} className="py-4 text-center text-xs font-bold uppercase tracking-widest text-natural-primary/60">
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {calendarDays.map((day, idx) => {
                      const isCurrentMonth = isSameMonth(day, currentMonth);
                      const isToday = isSameDay(day, startOfToday());
                      const dayMeals = mealsForDate(day);
                      
                      return (
                        <div 
                          key={day.toISOString()} 
                          className={`min-h-[110px] md:min-h-[150px] p-2 border-r border-b border-natural-bg last:border-r-0 relative group ${!isCurrentMonth ? 'bg-natural-bg/10 opacity-30' : ''}`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-lg ${isToday ? 'bg-natural-accent text-white shadow-lg shadow-natural-accent/20' : 'text-natural-primary/80'}`}>
                              {format(day, 'd')}
                            </span>
                          </div>
                          
                          <div className="space-y-1.5">
                            {dayMeals.map((m, mIdx) => (
                              <motion.div 
                                key={`${m.recipe.id}-${m.date}-${mIdx}`}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                onClick={() => onStartCooking(m.recipe)}
                                className="bg-natural-bg/60 p-2 rounded-xl cursor-pointer hover:bg-natural-bg transition-colors border border-natural-primary/10 flex items-center gap-2 group/meal"
                                role="button"
                                aria-label={`Kochen starten: ${m.recipe.name}`}
                              >
                                <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 shadow-sm">
                                  {m.recipe.images?.[0] ? (
                                    <img src={m.recipe.images[0]} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <ChefHat className="w-full h-full p-1 text-natural-primary/40" />
                                  )}
                                </div>
                                <span className="text-[11px] font-bold text-natural-primary line-clamp-1 truncate group-hover/meal:text-natural-accent transition-colors">
                                  {m.recipe.name}
                                </span>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Info(props: any) {
  return (
    <svg 
      {...props} 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}
