import React, { useState, useEffect } from 'react';
import { Recipe } from '../types';
import { X, ChevronLeft, ChevronRight, Play, Pause, RotateCcw, CheckCircle2, Clock, ChefHat, Utensils, BookOpen, Check, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getIngredientIcon, useIngredientIcons } from '../lib/ingredient-icons';
import { RecipeService } from '../services/RecipeService';

interface CookingModeProps {
  recipe: Recipe;
  onClose: () => void;
}

export default function CookingMode({ recipe, onClose }: CookingModeProps) {
  const mappings = useIngredientIcons();
  const [currentStepIndex, setCurrentStepIndex] = useState(-1); // -1 is Overview
  const steps = recipe.steps || [];
  const currentStep = currentStepIndex >= 0 ? steps[currentStepIndex] : null;

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<Record<number, boolean>>({});
  const [showFinishedDialog, setShowFinishedDialog] = useState(false);

  // Smart ingredient detection logic
  const getRelevantIngredientsForStep = (description: string) => {
    if (!description) return [];
    // Strip HTML for searching
    const plainText = description.replace(/<[^>]*>?/gm, '').toLowerCase();
    
    return recipe.ingredients.filter(ing => {
      const ingName = ing.name.toLowerCase();
      // Simple word match or substring
      return plainText.includes(ingName) || 
             ingName.split(' ').some(word => word.length > 3 && plainText.includes(word));
    });
  };

  const currentStepIngredients = currentStep ? getRelevantIngredientsForStep(currentStep.description) : [];

  const handleFinish = async (deductPantry: boolean) => {
    if (deductPantry) {
      try {
        const pantryItems = await RecipeService.getPantryItems();
        for (const ing of recipe.ingredients) {
          const match = pantryItems.find(p => p.name.toLowerCase() === ing.name.toLowerCase());
          if (match) {
            // Simple logic: remove for now, or could try to subtract amount
            // Since amounts are strings (e.g. "1 EL"), subtraction is tricky
            // We'll remove it if it's consumed
            await RecipeService.deletePantryItem(match.id!);
          }
        }
      } catch (err) {
        console.error("Consumption Error:", err);
      }
    }
    
    // Update recipe status to 'Ausprobiert'
    await RecipeService.updateRecipe(recipe.id!, { status: 'Ausprobiert' });
    onClose();
  };

  useEffect(() => {
    if (currentStep?.duration) {
      setTimeLeft(currentStep.duration);
      setIsActive(false);
    } else {
      setTimeLeft(null);
      setIsActive(false);
    }
  }, [currentStepIndex, currentStep]);

  useEffect(() => {
    let interval: any = null;
    if (isActive && timeLeft !== null && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => (prev !== null ? prev - 1 : null));
      }, 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(200);
      }
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const nextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const prevStep = () => {
    if (currentStepIndex > -1) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const toggleIngredient = (idx: number) => {
    setCheckedIngredients(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="fixed inset-0 bg-natural-bg z-[100] flex flex-col font-sans">
      {/* Header */}
      <header className="p-6 flex justify-between items-center bg-white shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-natural-primary/10 rounded-xl">
            <ChefHat className="w-6 h-6 text-natural-primary" />
          </div>
          <div>
            <h1 className="text-xl font-sans font-bold text-natural-primary line-clamp-1">{recipe.name}</h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#A65D43]/60">
              {currentStepIndex === -1 ? 'Vorbereitung' : `Schritt ${currentStepIndex + 1} von ${steps.length}`}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 text-natural-primary opacity-40 hover:opacity-100 transition-opacity">
          <X className="w-6 h-6" />
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative flex flex-col items-center p-6 pb-20">
        <AnimatePresence mode="wait">
          {currentStepIndex === -1 ? (
            <motion.div
              key="overview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="max-w-2xl w-full bg-white p-8 md:p-12 rounded-[48px] shadow-xl space-y-8 mt-4"
            >
              <div className="flex items-center gap-4 border-b border-natural-bg pb-6">
                 <div className="w-12 h-12 bg-natural-bg rounded-2xl flex items-center justify-center text-natural-primary">
                    <BookOpen />
                 </div>
                 <div>
                    <h2 className="text-2xl font-sans font-bold italic text-natural-text">Zutaten Check</h2>
                    <p className="text-xs opacity-60 uppercase tracking-widest">Hast du alles griffbereit?</p>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recipe.ingredients.map((ing, idx) => (
                  <button 
                    key={`ing-check-${idx}`}
                    onClick={() => toggleIngredient(idx)}
                    className={`flex items-center gap-4 p-4 rounded-3xl transition-all border text-left group ${
                      checkedIngredients[idx] 
                        ? 'bg-natural-primary/5 border-natural-primary' 
                        : 'bg-natural-bg/50 border-transparent hover:border-natural-primary/20'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${checkedIngredients[idx] ? 'bg-natural-primary text-white' : 'bg-white shadow-sm'}`}>
                      {checkedIngredients[idx] ? <Check className="w-5 h-5" /> : (
                        <div className="w-6 h-6 p-1 text-natural-primary/70">
                          {getIngredientIcon(ing.name, mappings)}
                        </div>
                      )}
                    </div>
                    <div className={checkedIngredients[idx] ? 'opacity-40 line-through' : ''}>
                      <p className="text-sm font-sans font-bold text-natural-text">{ing.name}</p>
                      <p className="text-[10px] font-bold text-natural-primary">{ing.amount} {ing.unit}</p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="pt-4">
                 <button 
                  onClick={() => setCurrentStepIndex(0)}
                  className="w-full py-5 bg-natural-primary text-white rounded-[24px] font-bold shadow-lg shadow-natural-primary/20 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                 >
                  <Play className="w-5 h-5 fill-current" />
                  Kochen starten
                 </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={currentStepIndex}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="max-w-2xl w-full bg-white p-10 md:p-14 rounded-[48px] shadow-xl space-y-10 mt-4"
            >
              <div className="space-y-6">
                 <div className="flex justify-between items-start">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#A65D43]">Schritt {currentStepIndex + 1}</span>
                    {currentStep?.duration && (
                       <div className="flex items-center gap-2 text-natural-primary font-mono font-bold bg-natural-bg px-3 py-1 rounded-full">
                          <Clock className="w-4 h-4" />
                          {formatTime(timeLeft || 0)}
                       </div>
                    )}
                 </div>

                 {/* Cooking instruction */}
                 <div 
                  className="text-base md:text-lg font-sans leading-tight text-natural-text prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: currentStep?.description || '' }}
                 />

                {/* Step Ingredients */}
                {((currentStep?.stepIngredients || []).length > 0 || (currentStep?.ingredientIndices || []).length > 0) && (
                  <div className="bg-natural-bg/30 p-6 rounded-[32px] space-y-4">
                     <p className="text-[10px] font-bold uppercase tracking-widest text-natural-primary opacity-40">Hierfür benötigst du:</p>
                      <div className="flex flex-wrap gap-4">
                        {/* New structured data */}
                        {currentStep?.stepIngredients?.map((si, siIdx) => {
                          const ing = recipe.ingredients[si.index];
                          if (!ing) return null;
                          return (
                            <div key={`step-ing-${si.index}-${siIdx}`} className="bg-white pl-4 pr-6 py-3 rounded-[24px] shadow-sm flex items-center gap-4 border border-natural-bg hover:shadow-md transition-shadow">
                              <div className="w-10 h-10 bg-natural-bg rounded-xl flex items-center justify-center p-2 text-natural-primary/70 shrink-0">
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
                        {/* Fallback for legacy data */}
                        {!currentStep?.stepIngredients && currentStep?.ingredientIndices?.map(idx => {
                          const ing = recipe.ingredients[idx];
                          if (!ing) return null;
                          return (
                            <div key={`legacy-ing-${idx}`} className="bg-white pl-4 pr-6 py-3 rounded-[24px] shadow-sm flex items-center gap-4 border border-natural-bg hover:shadow-md transition-shadow">
                              <div className="w-10 h-10 bg-natural-bg rounded-xl flex items-center justify-center p-2 text-natural-primary/70 shrink-0">
                                {getIngredientIcon(ing.name, mappings)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-natural-text leading-tight break-words">{ing.name}</p>
                                <p className="text-[10px] text-natural-accent font-black uppercase tracking-wider mt-0.5">{ing.amount} {ing.unit}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                  </div>
                )}
              </div>

              {timeLeft !== null && (
                <div className="flex items-center justify-between bg-natural-bg/50 p-6 rounded-[32px]">
                   <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase text-natural-primary opacity-40">Timer</span>
                      <span className="text-4xl font-mono font-bold tabular-nums text-natural-primary">
                        {formatTime(timeLeft)}
                      </span>
                   </div>
                   <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setTimeLeft(currentStep?.duration || 0)}
                        className="p-4 bg-white rounded-full text-natural-primary hover:bg-natural-primary hover:text-white transition-all shadow-sm"
                      >
                        <RotateCcw className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => setIsActive(!isActive)}
                        disabled={timeLeft === 0}
                        className={`w-16 h-16 flex items-center justify-center rounded-full shadow-xl transition-all active:scale-95 ${isActive ? 'bg-[#A65D43] text-white' : 'bg-natural-primary text-white'} disabled:opacity-50`}
                      >
                        {isActive ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-1" />}
                      </button>
                   </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Controls */}
      <footer className="p-8 bg-white border-t border-natural-bg flex items-center justify-between shrink-0">
        <button 
          onClick={prevStep}
          disabled={currentStepIndex === -1}
          className="flex items-center gap-2 px-6 py-4 rounded-full text-natural-primary font-bold disabled:opacity-20 transition-all hover:bg-natural-bg"
        >
          <ChevronLeft className="w-6 h-6" />
          <span className="hidden md:inline">Zurück</span>
        </button>

        <div className="hidden md:flex gap-2">
          <div 
            className={`h-2 rounded-full transition-all duration-500 ${currentStepIndex === -1 ? 'w-8 bg-natural-primary' : 'w-2 bg-natural-primary/10'}`}
            key="dot-overview"
          />
          {steps.map((_, idx) => (
            <div 
              key={`dot-step-${idx}`}
              className={`h-2 rounded-full transition-all duration-500 ${idx === currentStepIndex ? 'w-8 bg-[#A65D43]' : 'w-2 bg-natural-primary/10'}`}
            />
          ))}
        </div>

        {currentStepIndex === steps.length - 1 ? (
          <button 
            onClick={() => setShowFinishedDialog(true)}
            className="flex items-center gap-2 px-10 py-4 rounded-full bg-[#A65D43] text-white font-bold shadow-lg shadow-[#A65D43]/20 hover:scale-105 transition-all"
          >
            Abschließen
            <CheckCircle2 className="w-6 h-6" />
          </button>
        ) : (
          <button 
            onClick={nextStep}
            className="flex items-center gap-2 px-8 py-4 rounded-full bg-natural-primary text-white font-bold transition-all hover:scale-105 shadow-lg shadow-natural-primary/10"
          >
            {currentStepIndex === -1 ? 'Los geht\'s' : 'Nächster Schritt'}
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </footer>

      {/* Finished Dialog Overlay */}
      <AnimatePresence>
        {showFinishedDialog && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-natural-primary/60 backdrop-blur-md z-[110] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[48px] p-10 max-w-lg w-full text-center space-y-8 shadow-2xl relative overflow-hidden"
            >
               <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-natural-accent via-[#A65D43] to-natural-accent" />
               
               <div className="w-20 h-20 bg-natural-bg rounded-3xl flex items-center justify-center text-natural-accent mx-auto">
                  <CheckCircle2 className="w-10 h-10" />
               </div>

               <div className="space-y-2">
                  <h3 className="text-3xl font-sans font-bold italic text-natural-primary">Guten Appetit!</h3>
                  <p className="text-sm opacity-60 font-medium">Das Rezept wurde erfolgreich gekocht.</p>
               </div>

               <div className="bg-natural-bg/30 p-6 rounded-[32px] border border-natural-accent/10">
                  <div className="flex items-center gap-3 justify-center mb-2">
                    <Sparkles className="w-4 h-4 text-natural-accent" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-natural-accent">Smarte Vorrats-Abbuchung</span>
                  </div>
                  <p className="text-xs text-natural-primary/70 leading-relaxed mb-6">
                    Soll ich die verwendeten Zutaten automatisch aus deinem Vorrat entfernen?
                  </p>
                  
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => handleFinish(true)}
                      className="w-full py-4 bg-natural-accent text-white rounded-2xl font-black text-sm shadow-lg shadow-natural-accent/20 hover:scale-[1.02] transition-all"
                    >
                      Ja, Vorrat aktualisieren
                    </button>
                    <button 
                      onClick={() => handleFinish(false)}
                      className="w-full py-4 bg-white text-natural-primary border border-natural-bg rounded-2xl font-bold text-sm hover:bg-natural-bg transition-all"
                    >
                      Nur als gekocht markieren
                    </button>
                  </div>
               </div>

               <button onClick={() => setShowFinishedDialog(false)} className="text-[10px] font-bold uppercase tracking-widest opacity-30 hover:opacity-100 transition-opacity">
                  Doch noch nicht fertig?
               </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
