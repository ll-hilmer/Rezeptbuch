import React, { useState } from 'react';
import { Recipe } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Clock, Flame, ChevronLeft, 
  ChefHat, BookOpen, Activity, 
  CheckCircle2, PlayCircle, ShoppingCart 
} from 'lucide-react';
import { getIngredientIcon, useIngredientIcons } from '../lib/ingredient-icons';

interface RecipeDetailProps {
  recipe: Recipe;
  onClose: () => void;
  onStartCooking: () => void;
  onAddToShoppingList: () => void;
}

type Tab = 'ingredients' | 'steps' | 'nutrients';

export default function RecipeDetail({ recipe, onClose, onStartCooking, onAddToShoppingList }: RecipeDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>('ingredients');
  const [isAdding, setIsAdding] = useState(false);
  const mappings = useIngredientIcons();

  const handleAddShopping = async () => {
    setIsAdding(true);
    try {
      await onAddToShoppingList();
    } finally {
      setIsAdding(false);
    }
  };

  const totalMinutes = recipe.prepTime || 20;

  return (
    <motion.div 
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 bg-white z-[9999] overflow-y-auto"
    >
      {/* Header Image Area */}
      <div className="relative w-full h-[40vh] md:h-[35vh]">
        {recipe.images?.length > 0 ? (
          <picture className="w-full h-full">
            {/* Desktop Image (images[0]) */}
            <source media="(min-width: 768px)" srcSet={recipe.images[0] || recipe.images[1]} />
            {/* Mobile Image (images[1] or fall back to 0) */}
            <img 
              src={recipe.images[1] || recipe.images[0]} 
              alt={recipe.name} 
              className="w-full h-full object-cover"
            />
          </picture>
        ) : (
          <div className="w-full h-full bg-natural-bg flex items-center justify-center text-natural-primary/20">
            <ChefHat className="w-32 h-32" />
          </div>
        )}
        
        {/* Overlay buttons */}
        <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center">
          <button 
            onClick={onClose}
            className="p-3 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/40 transition-all border border-white/20 shadow-lg"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white relative z-10 px-6 pt-8">
        <div className="max-w-3xl mx-auto space-y-8 pb-32">
          
          {/* Stats Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-natural-bg/30 p-4 md:p-5 rounded-[32px]">
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-[16px] shadow-sm">
                <Clock className="w-3.5 h-3.5 text-natural-accent" />
                <span className="text-xs font-bold text-natural-text">{totalMinutes} Min</span>
              </div>
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-[16px] shadow-sm">
                <Flame className="w-3.5 h-3.5 text-natural-primary" />
                <span className="text-xs font-bold text-natural-text">{recipe.calories || 0} Kcal</span>
              </div>
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-[16px] shadow-sm">
                <BookOpen className="w-3.5 h-3.5 text-natural-accent" />
                <span className="text-xs font-bold text-natural-text">{recipe.ingredients.length} Zutaten</span>
              </div>
            </div>
            
            {activeTab === 'ingredients' ? (
              <button 
                onClick={handleAddShopping}
                disabled={isAdding}
                className="px-5 py-2.5 bg-natural-accent text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-natural-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isAdding ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <ShoppingCart className="w-3.5 h-3.5" />
                )}
                Einkaufsliste
              </button>
            ) : activeTab === 'steps' ? (
              <button 
                onClick={onStartCooking}
                className="px-5 py-2.5 bg-natural-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-natural-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                Kochen starten
              </button>
            ) : null}
          </div>

          {/* Title */}
          <div className="space-y-2">
            <h1 className="text-4xl md:text-5xl font-sans font-bold italic text-natural-primary leading-tight">
              {recipe.name}
            </h1>
            {recipe.description && (
              <div 
                className="text-sm text-natural-text/60 font-sans prose max-w-none"
                dangerouslySetInnerHTML={{ __html: recipe.description }}
              />
            )}
          </div>

          {/* Tabs Navigation */}
          <div className="flex gap-1 bg-natural-bg p-1.5 rounded-[24px]">
            <TabButton 
              active={activeTab === 'ingredients'} 
              onClick={() => setActiveTab('ingredients')} 
              icon={<BookOpen className="w-4 h-4" />}
              label="Zutaten"
            />
             <TabButton 
              active={activeTab === 'steps'} 
              onClick={() => setActiveTab('steps')} 
              icon={<ChefHat className="w-4 h-4" />}
              label="Zubereitung"
            />
             <TabButton 
              active={activeTab === 'nutrients'} 
              onClick={() => setActiveTab('nutrients')} 
              icon={<Activity className="w-4 h-4" />}
              label="Nährstoffe"
            />
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'ingredients' && (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
                  {recipe.ingredients.map((ing, idx) => (
                    <div 
                      key={idx}
                      className="flex items-center gap-4 group"
                    >
                      <div className="w-14 h-14 bg-natural-bg rounded-full flex items-center justify-center p-3.5 text-natural-primary/70 shrink-0 border border-natural-bg">
                         {getIngredientIcon(ing.name, mappings)}
                      </div>
                      <div className="flex flex-col">
                        <p className="font-sans font-bold text-base text-natural-text leading-tight">{ing.name}</p>
                        <p className="text-xs font-bold text-natural-accent uppercase tracking-wider mt-0.5">{ing.amount} {ing.unit}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {activeTab === 'steps' && (
                <div className="space-y-12">
                   <div className="space-y-6">
                    {recipe.steps?.map((step, idx) => (
                      <div key={idx} className="flex gap-6">
                        <div className="shrink-0 w-8 h-8 rounded-full bg-natural-primary/10 flex items-center justify-center text-natural-primary font-bold text-sm">
                          {idx + 1}
                        </div>
                        <div className="space-y-3">
                          <div 
                            className="text-base md:text-lg text-natural-text leading-relaxed font-sans prose max-w-none"
                            dangerouslySetInnerHTML={{ __html: step.description }}
                          />
                          {step.stepIngredients && step.stepIngredients.length > 0 && (
                            <div className="flex flex-wrap gap-3">
                               {step.stepIngredients.map((si, siIdx) => {
                                 const ing = recipe.ingredients[si.index];
                                 if (!ing) return null;
                                 return (
                                   <div key={`${si.index}-${siIdx}`} className="bg-natural-bg/30 pl-4 pr-6 py-3 rounded-[24px] flex items-center gap-4 border border-natural-primary/5 hover:bg-natural-bg/50 transition-colors">
                                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center p-2 text-natural-primary/70 shrink-0 shadow-sm">
                                        {getIngredientIcon(ing.name, mappings)}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-sm font-bold text-natural-text leading-tight break-words">{ing.name}</p>
                                        <p className="text-[10px] text-natural-accent font-black uppercase tracking-wider mt-0.5">
                                          {si.amount || ing.amount} {ing.unit}
                                        </p>
                                      </div>
                                   </div>
                                 );
                               })}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button 
                    onClick={onStartCooking}
                    className="w-full py-5 bg-natural-primary text-white rounded-[28px] font-bold shadow-xl shadow-natural-primary/20 flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all group"
                  >
                    <PlayCircle className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                    Jetzt kochen starten
                  </button>
                </div>
              )}

              {activeTab === 'nutrients' && (
                <div className="space-y-8">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <NutritionCard label="Kalorien" value={`${recipe.calories || 0}`} unit="kcal" />
                    <NutritionCard label="Protein" value={`${recipe.nutritionalProtein || 0}`} unit="g" />
                    <NutritionCard label="Kohlenhydrate" value={`${recipe.nutritionalCarbs || 0}`} unit="g" />
                    <NutritionCard label="Fett" value={`${recipe.nutritionalFat || 0}`} unit="g" />
                  </div>
                  
                  <div className="bg-natural-bg/30 p-8 rounded-[40px] space-y-4">
                     <h3 className="text-sm font-bold uppercase tracking-widest text-[#A65D43]">Ernährungstyp</h3>
                     <div className="flex flex-wrap gap-2">
                        {(Array.isArray(recipe.type) ? recipe.type : [recipe.type]).map(t => (
                          <span key={t} className="px-4 py-2 bg-white rounded-full text-xs font-bold text-natural-primary shadow-sm">
                            {t}
                          </span>
                        ))}
                     </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[20px] text-xs font-bold transition-all ${
        active 
          ? 'bg-white text-natural-primary shadow-sm' 
          : 'text-natural-primary/40 hover:text-natural-primary/60'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function NutritionCard({ label, value, unit }: { label: string, value: string, unit: string }) {
  return (
    <div className="bg-natural-bg/30 p-6 rounded-[32px] text-center space-y-1">
      <p className="text-[9px] font-black uppercase tracking-widest text-natural-primary opacity-40">{label}</p>
      <p className="text-3xl font-sans italic font-bold text-natural-text">{value}</p>
      <p className="text-[10px] font-bold text-natural-accent">{unit}</p>
    </div>
  );
}
