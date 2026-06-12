import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Plus, Trash2, Package, Search, ChevronRight, Calendar, AlertCircle, Settings, Tag, Clock, Flame, Star, Sparkles, Filter, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getIngredientIcon, AVAILABLE_ICON_NAMES, useIngredientIcons } from '../lib/ingredient-icons';
import { RecipeService } from '../services/RecipeService';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Recipe, PantryItem } from '../types';
import RecipeDetail from './RecipeDetail';
import { differenceInDays, parseISO, isPast } from 'date-fns';


interface IconMapping {
  id: string;
  keyword: string;
  iconName: string;
  category?: string;
  url?: string;
}

export default function PantryView() {
  const mappingsObj = useIngredientIcons();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [mappings, setMappings] = useState<IconMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState({ name: '', amount: '', unit: '', expiryDate: '' });
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'inventory' | 'icons' | 'smart'>('inventory');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [detailedRecipe, setDetailedRecipe] = useState<Recipe | null>(null);
  
  const handleAddToShoppingList = async (recipe: Recipe) => {
    const mappingsArr = await RecipeService.getIconMappings();
    const mappingsObj: Record<string, string> = {};
    mappingsArr.forEach(m => {
      const name = m.keyword || m.name;
      if (m && name) {
        mappingsObj[name.toLowerCase().trim()] = m.category || '';
      }
    });
    
    await RecipeService.addIngredientsToShoppingList(recipe, mappingsObj);
    alert('Zutaten zur Einkaufsliste hinzugefügt!');
  };

  // Smart Recipes Filters
  const [showSmartFilters, setShowSmartFilters] = useState(false);
  const [smartFilterTypes, setSmartFilterTypes] = useState<string[]>([]);
  const [smartFilterMethods, setSmartFilterMethods] = useState<string[]>([]);
  const [smartFilterCarbs, setSmartFilterCarbs] = useState<string[]>([]);
  const [smartExcludeIngredients, setSmartExcludeIngredients] = useState('');

  const [newMapping, setNewMapping] = useState({ keyword: '', iconName: AVAILABLE_ICON_NAMES[0], url: '', category: '' });

  const downscaleImage = (dataUrl: string, maxWidth: number = 200): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/webp', 0.8));
      };
      img.src = dataUrl;
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const downscaled = await downscaleImage(reader.result as string);
        setNewMapping(prev => ({ ...prev, url: downscaled, iconName: '' }));
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (!auth.currentUser) return;

    const recipesUnsub = RecipeService.listenToRecipes(setRecipes);

    const qItems = query(
      collection(db, 'pantry'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubItems = onSnapshot(qItems, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PantryItem));
      setItems(data.sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    });

    const unsubIcons = onSnapshot(collection(db, 'ingredientIcons'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IconMapping));
      setMappings(data.sort((a, b) => a.keyword.localeCompare(b.keyword)));
    });

    return () => { 
      recipesUnsub();
      unsubItems(); 
      unsubIcons(); 
    };
  }, []);

  const smartRecipes = React.useMemo(() => {
    return recipes
      .filter(recipe => {
        // Exclude logic
        const exclusionTerms = smartExcludeIngredients.toLowerCase().split(',').map(t => t.trim()).filter(t => t.length > 0);
        const isExcludedByIngredient = exclusionTerms.some(term => 
          recipe.ingredients.some(i => i.name.toLowerCase().includes(term)) ||
          recipe.name.toLowerCase().includes(term)
        );
        if (isExcludedByIngredient) return false;

        // Filter logic
        const recipeTypes = Array.isArray(recipe.type) ? recipe.type : [recipe.type];
        const matchesType = smartFilterTypes.length === 0 || smartFilterTypes.some(t => recipeTypes.includes(t as any));
        
        const recipeMethods = Array.isArray(recipe.method) ? recipe.method : [recipe.method];
        const matchesMethod = smartFilterMethods.length === 0 || smartFilterMethods.some(m => recipeMethods.includes(m));

        const recipeCarbs = Array.isArray(recipe.carbs) ? recipe.carbs : [recipe.carbs];
        const matchesCarbs = smartFilterCarbs.length === 0 || smartFilterCarbs.some(c => recipeCarbs.includes(c));

        return matchesType && matchesMethod && matchesCarbs;
      })
      .map(recipe => {
        const totalIngs = recipe.ingredients.length;
        if (totalIngs === 0) return { ...recipe, matchPercentage: 0 };
        
        const matchedIngs = recipe.ingredients.filter(recipeIng => 
          items.some(pantryItem => 
            pantryItem.name.toLowerCase().includes(recipeIng.name.toLowerCase()) ||
            recipeIng.name.toLowerCase().includes(pantryItem.name.toLowerCase())
          )
        ).length;
        
        const percentage = (matchedIngs / totalIngs) * 100;
        return { ...recipe, matchPercentage: Math.round(percentage) };
      })
      .sort((a, b) => (b as any).matchPercentage - (a as any).matchPercentage);
  }, [recipes, items, smartExcludeIngredients, smartFilterTypes, smartFilterMethods, smartFilterCarbs]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name || !auth.currentUser) return;

    try {
      const sanitizedItem = {
        name: newItem.name || '',
        amount: newItem.amount || '',
        unit: newItem.unit || '',
        expiryDate: newItem.expiryDate || '',
        category: RecipeService.inferCategory(newItem.name, mappingsObj),
        userId: auth.currentUser.uid,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'pantry'), sanitizedItem);
      setNewItem({ name: '', amount: '', unit: '', expiryDate: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'pantry');
    }
  };

  const handleAddMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMapping.keyword) return;

    try {
      const sanitizedMapping = {
        keyword: newMapping.keyword || '',
        iconName: newMapping.iconName || '',
        url: newMapping.url || '',
        category: newMapping.category || ''
      };
      await addDoc(collection(db, 'ingredientIcons'), sanitizedMapping);
      setNewMapping({ keyword: '', iconName: AVAILABLE_ICON_NAMES[0], url: '', category: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'ingredientIcons');
    }
  };

  const handleDelete = async (id: string, collectionName: string) => {
    try {
      await deleteDoc(doc(db, collectionName, id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${collectionName}/${id}`);
    }
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  const groupedItems = React.useMemo(() => {
    const groups: Record<string, PantryItem[]> = {};
    filteredItems.forEach(item => {
      const cat = item.category || RecipeService.inferCategory(item.name);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [filteredItems]);

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-4xl font-serif font-bold italic text-natural-primary">Vorrat & Backend</h2>
          <div className="flex gap-4 mt-4">
             <button 
              onClick={() => setView('inventory')}
              className={`pb-2 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 ${view === 'inventory' ? 'border-natural-accent text-natural-accent' : 'border-transparent opacity-40 hover:opacity-60'}`}
             >
                Bestand
             </button>
             <button 
              onClick={() => setView('smart')}
              className={`pb-2 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 ${view === 'smart' ? 'border-natural-accent text-natural-accent' : 'border-transparent opacity-40 hover:opacity-60'}`}
             >
                Smart Rezepte
             </button>
             <button 
              onClick={() => setView('icons')}
              className={`pb-2 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 ${view === 'icons' ? 'border-natural-accent text-natural-accent' : 'border-transparent opacity-40 hover:opacity-60'}`}
             >
                Icon Manager
             </button>
          </div>
        </div>
        
        {view === 'smart' && (
          <button 
            onClick={() => setShowSmartFilters(!showSmartFilters)}
            className={`p-3 rounded-full border transition-colors flex items-center gap-2 ${showSmartFilters ? 'bg-natural-accent text-white border-natural-accent' : 'bg-white text-natural-accent border-none shadow-sm'}`}
            title="Smart Filter"
          >
            <Filter className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest px-1">Smart Filter</span>
          </button>
        )}

        {view === 'inventory' && (
          <div className="p-3 bg-white rounded-2xl shadow-sm border border-natural-bg flex items-center gap-3">
             <Search className="w-4 h-4 text-natural-primary/40" />
             <input 
              type="text" 
              placeholder="Suchen..." 
              className="bg-transparent border-none outline-none text-sm w-40"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
             />
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {view === 'inventory' ? (
          <motion.div 
            key="inventory"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            <div className="lg:col-span-1">
              <form onSubmit={handleAdd} className="bg-natural-primary/5 p-8 rounded-[32px] space-y-6 sticky top-8">
                <div className="flex items-center gap-3 mb-2">
                   <div className="w-10 h-10 bg-natural-primary text-white rounded-2xl flex items-center justify-center">
                      <Plus className="w-6 h-6" />
                   </div>
                   <h3 className="text-xl font-serif font-bold italic text-natural-primary">Hinzufügen</h3>
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Bezeichnung</label>
                  <div className="flex gap-2">
                     <div className="w-10 h-10 bg-natural-bg rounded-xl flex items-center justify-center shrink-0">
                        {getIngredientIcon(newItem.name, mappingsObj)}
                     </div>
                     <input 
                      type="text" 
                      placeholder="z.B. Nudeln"
                      className="flex-1 bg-natural-bg border-none rounded-xl px-4 text-sm outline-none focus:ring-2 focus:ring-natural-primary/20"
                      value={newItem.name}
                      onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Menge</label>
                      <input 
                        type="text" 
                        placeholder="2"
                        className="w-full bg-natural-bg border-none rounded-xl px-4 py-2.5 text-sm outline-none"
                        value={newItem.amount}
                        onChange={(e) => setNewItem({...newItem, amount: e.target.value})}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Einheit</label>
                      <input 
                        type="text" 
                        placeholder="Packung"
                        className="w-full bg-natural-bg border-none rounded-xl px-4 py-2.5 text-sm outline-none"
                        value={newItem.unit}
                        onChange={(e) => setNewItem({...newItem, unit: e.target.value})}
                      />
                   </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Haltbar bis (optional)</label>
                  <input 
                    type="date" 
                    className="w-full bg-natural-bg border-none rounded-xl px-4 py-2.5 text-sm outline-none"
                    value={newItem.expiryDate}
                    onChange={(e) => setNewItem({...newItem, expiryDate: e.target.value})}
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full bg-natural-primary text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-natural-primary/10 hover:opacity-90 transition-opacity"
                >
                  Hinzufügen
                </button>
              </form>
            </div>

            <div className="lg:col-span-2 space-y-8">
              {filteredItems.length === 0 ? (
                <div className="bg-white rounded-[32px] p-20 text-center flex flex-col items-center gap-4">
                  <Package className="w-12 h-12 text-natural-primary/20" />
                  <p className="text-sm opacity-60 uppercase tracking-widest font-bold">Kein Bestand gefunden</p>
                </div>
              ) : (
                Object.entries(groupedItems).map(([category, catItems]) => (
                  <div key={category} className="space-y-4">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-natural-primary/40 pl-2">
                       {category}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                      {catItems.map(item => {
                        const daysLeft = item.expiryDate ? differenceInDays(parseISO(item.expiryDate), new Date()) : null;
                        const isExpired = item.expiryDate && isPast(parseISO(item.expiryDate)) && daysLeft !== null && daysLeft < 0;
                        
                        let expiryColor = 'text-natural-primary/40';
                        let expiryBg = 'bg-natural-bg';
                        let statusText = '';
                        let statusColor = 'bg-natural-primary/20';
                        
                        if (daysLeft !== null) {
                          if (daysLeft < 0) {
                            expiryColor = 'text-red-600';
                            expiryBg = 'bg-red-50';
                            statusText = 'Abgelaufen';
                            statusColor = 'bg-red-500';
                          } else if (daysLeft <= 2) {
                            expiryColor = 'text-red-500';
                            expiryBg = 'bg-red-50';
                            statusText = daysLeft === 0 ? 'Heute' : 'Kritisch';
                            statusColor = 'bg-red-500';
                          } else if (daysLeft <= 7) {
                            expiryColor = 'text-amber-600';
                            expiryBg = 'bg-amber-50';
                            statusText = `${daysLeft} Tage`;
                            statusColor = 'bg-amber-500';
                          } else {
                            expiryColor = 'text-emerald-600';
                            expiryBg = 'bg-emerald-50';
                            statusText = `${daysLeft} Tage`;
                            statusColor = 'bg-emerald-500';
                          }
                        }

                        return (
                          <div key={item.id} className="bg-white pl-5 pr-3 py-3 rounded-[28px] shadow-sm flex items-center justify-between group hover:shadow-md transition-shadow relative overflow-hidden h-full min-h-[85px] border border-natural-bg/50">
                            {/* Vertical Freshness Indicator */}
                            {item.expiryDate && (
                              <div 
                                className={`absolute left-0 top-4 bottom-4 w-1.5 rounded-full ${statusColor} opacity-80`} 
                                role="img"
                                aria-label={`Status: ${statusText}`}
                                title={statusText}
                              />
                            )}
                            
                            <div className="flex items-center gap-4 flex-1 min-w-0 pr-2">
                              <div className="w-12 h-12 bg-natural-bg rounded-2xl flex items-center justify-center p-2 text-natural-primary/70 relative shrink-0">
                                {getIngredientIcon(item.name, mappingsObj)}
                                {item.expiryDate && (
                                  <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${statusColor}`} />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <h4 className="font-serif font-bold text-natural-text leading-tight break-words">{item.name}</h4>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className="text-[10px] opacity-40 font-bold uppercase tracking-widest whitespace-nowrap">
                                    {item.amount} {item.unit}
                                  </span>
                                  {item.expiryDate && (
                                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${expiryBg} ${expiryColor} whitespace-nowrap`} aria-label={`Haltbarkeit: ${statusText}`}>
                                      <Calendar className="w-3.5 h-3.5" />
                                      <span className="text-[11px] font-black uppercase tracking-tight">
                                        {statusText}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(item.id!, 'pantry');
                              }} 
                              className={`p-4 text-red-500 rounded-full transition-all shrink-0 z-30 relative ml-2 focus:ring-2 focus:ring-red-200 outline-none ${isExpired ? 'opacity-100 bg-red-50' : 'opacity-100 md:opacity-0 group-hover:opacity-100 hover:bg-red-50'}`}
                              aria-label={`${item.name} löschen`}
                              title="Löschen"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        ) : view === 'smart' ? (
          <motion.div 
            key="smart"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <AnimatePresence>
              {showSmartFilters && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden bg-white border border-natural-bg rounded-2xl p-6 shadow-sm space-y-6 mb-8"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Exclusions */}
                    <div className="md:col-span-2">
                       <label className="text-[10px] font-bold uppercase tracking-wider text-red-600 mb-2 block">Dinge ausschließen</label>
                       <div className="relative">
                          <X className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />
                          <input 
                            type="text"
                            placeholder="Zutaten ausschließen (Koma-getrennt)..."
                            className="bg-red-50 border-none rounded-2xl py-3 pl-12 pr-6 w-full text-sm outline-none focus:ring-2 focus:ring-red-200"
                            value={smartExcludeIngredients}
                            onChange={(e) => setSmartExcludeIngredients(e.target.value)}
                          />
                       </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-natural-primary opacity-60">Sättigungsbeilage</label>
                        {smartFilterCarbs.length > 0 && (
                          <button onClick={() => setSmartFilterCarbs([])} className="text-[10px] text-natural-accent font-bold hover:underline">Reset</button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {['Reis', 'Nudeln', 'Kartoffeln'].map(c => (
                          <button
                            key={c}
                            onClick={() => setSmartFilterCarbs(prev => 
                              prev.includes(c) ? prev.filter(p => p !== c) : [...prev, c]
                            )}
                            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${smartFilterCarbs.includes(c) ? 'bg-natural-accent text-white shadow-md' : 'bg-natural-bg text-natural-primary hover:bg-white border border-transparent shadow-sm'}`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-natural-primary opacity-60">Kategorien</label>
                        {smartFilterMethods.length > 0 && (
                          <button onClick={() => setSmartFilterMethods([])} className="text-[10px] text-natural-accent font-bold hover:underline">Reset</button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {['Highlight', 'Thermomix', 'Ofen', 'Pfannengericht', 'Saucen', 'Airfryer', 'Snacks', 'Beilagen'].map(m => (
                          <button
                            key={m}
                            onClick={() => setSmartFilterMethods(prev => 
                              prev.includes(m) ? prev.filter(p => p !== m) : [...prev, m]
                            )}
                            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${smartFilterMethods.includes(m) ? 'bg-natural-accent text-white shadow-md' : 'bg-natural-bg text-natural-primary hover:bg-white border border-transparent shadow-sm'}`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {smartRecipes.map(recipe => (
                  <div key={recipe.id}
                  onClick={() => setDetailedRecipe(recipe)}
                  className="bg-white p-5 rounded-[32px] shadow-sm border border-natural-bg/50 flex flex-col gap-4 cursor-pointer hover:shadow-xl transition-all group h-full"
                >
                  <div className="h-40 bg-natural-bg rounded-[24px] overflow-hidden relative">
                     {recipe.images?.[0] ? (
                       <img src={recipe.images[0]} alt={recipe.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                     ) : (
                       <div className="w-full h-full flex items-center justify-center text-natural-primary/10">
                          <Package className="w-12 h-12" />
                       </div>
                     )}
                     <div className="absolute top-3 right-3 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full text-[10px] font-black text-natural-accent shadow-sm">
                        {(recipe as any).matchPercentage}% Match
                     </div>
                  </div>

                  <div className="px-1 space-y-3">
                     <h3 className="text-xl font-serif font-bold italic text-natural-primary leading-tight line-clamp-1">{recipe.name}</h3>
                     
                     <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                           <Flame className="w-4 h-4 text-natural-primary/40" />
                           <span className="text-[10px] font-bold text-natural-primary/60">{recipe.calories || 0} kcal</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                           <Clock className="w-4 h-4 text-natural-accent/40" />
                           <span className="text-[10px] font-bold text-natural-accent/60">{recipe.prepTime || 20} min</span>
                        </div>
                     </div>

                     <div className="w-full bg-natural-bg h-1.5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(recipe as any).matchPercentage}%` }}
                          className="h-full bg-natural-accent"
                        />
                     </div>
                  </div>
                </div>
              ))}
              
              {smartRecipes.length === 0 && (
                <div className="md:col-span-2 lg:col-span-3 py-20 text-center">
                  <Sparkles className="w-12 h-12 text-natural-primary/10 mx-auto mb-4" />
                  <p className="text-natural-primary opacity-60">Keine passenden Smart-Rezepte gefunden.</p>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="icons"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
             <div className="lg:col-span-1">
              <form onSubmit={handleAddMapping} className="bg-white p-6 rounded-[32px] shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-4">
                   <Settings className="w-5 h-5 text-natural-accent" />
                   <h3 className="text-lg font-serif text-natural-text">Icon Manager</h3>
                </div>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Stichwort / Zutat</label>
                  <input 
                    type="text" 
                    placeholder="z.B. Brokkoli"
                    className="w-full bg-natural-bg border-none rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-natural-primary/20"
                    value={newMapping.keyword}
                    onChange={(e) => setNewMapping({...newMapping, keyword: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Kategorie (Optional)</label>
                  <select 
                    className="w-full bg-natural-bg border-none rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-natural-primary/20 appearance-none cursor-pointer"
                    value={newMapping.category}
                    onChange={(e) => setNewMapping({...newMapping, category: e.target.value})}
                  >
                    <option value="">Automatisch</option>
                    <option value="Obst & Gemüse">Obst & Gemüse</option>
                    <option value="Milch & Käse">Milch & Käse</option>
                    <option value="Fleisch & Fisch">Fleisch & Fisch</option>
                    <option value="Brot & Backwaren">Brot & Backwaren</option>
                    <option value="Vorrat">Vorrat</option>
                    <option value="Gewürze">Gewürze</option>
                    <option value="Tiefkühl">Tiefkühl</option>
                    <option value="Snacks">Snacks</option>
                    <option value="Getränke">Getränke</option>
                    <option value="Sonstiges">Sonstiges</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Icon auswählen oder hochladen</label>
                  
                  <div className="flex gap-4 mb-3">
                     <button
                        type="button"
                        onClick={() => setNewMapping(prev => ({ ...prev, url: '' }))}
                        className={`flex-1 py-2 text-[9px] font-bold uppercase rounded-lg border transition-all ${!newMapping.url ? 'bg-natural-primary text-white border-natural-primary' : 'bg-white border-natural-bg opacity-40'}`}
                     >
                        Library
                     </button>
                     <label className={`flex-1 py-2 text-[9px] font-bold uppercase rounded-lg border transition-all cursor-pointer text-center ${newMapping.url ? 'bg-natural-accent text-white border-natural-accent' : 'bg-white border-natural-bg opacity-40'}`}>
                        Eigens Bild
                        <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                     </label>
                  </div>

                  {!newMapping.url ? (
                    <div className="grid grid-cols-5 gap-2 max-h-40 overflow-y-auto p-1 bg-natural-bg/50 rounded-xl">
                      {AVAILABLE_ICON_NAMES.map(icon => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() => setNewMapping({...newMapping, iconName: icon, url: ''})}
                          className={`aspect-square p-2 rounded-lg transition-all flex items-center justify-center ${newMapping.iconName === icon && !newMapping.url ? 'bg-natural-primary text-white' : 'bg-white text-natural-primary/40 hover:bg-white/80'}`}
                          title={icon}
                        >
                           {getIngredientIcon(icon)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="relative aspect-video bg-natural-bg rounded-xl overflow-hidden shadow-inner group">
                       <img src={newMapping.url} className="w-full h-full object-cover" />
                       <button 
                        type="button"
                        onClick={() => setNewMapping(prev => ({ ...prev, url: '' }))}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                       >
                          <Trash2 className="w-6 h-6 text-white" />
                       </button>
                    </div>
                  )}
                </div>

                <button 
                  type="submit"
                  className="w-full bg-natural-accent text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-natural-accent/10 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Mapping speichern
                </button>
              </form>
            </div>

            <div className="lg:col-span-2 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                {mappings.map(map => (
                  <div key={map.id} className="bg-white p-4 px-5 rounded-[28px] shadow-sm flex items-center justify-between group h-full min-h-[85px] border border-natural-bg/50">
                    <div className="flex items-center gap-4 flex-1 min-w-0 pr-2">
                      <div className="w-12 h-12 bg-natural-bg rounded-2xl flex items-center justify-center p-3 text-natural-primary/70 shrink-0">
                         {getIngredientIcon(map.keyword, { [map.keyword]: (map as any).url || (map as any).iconName })}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-serif text-natural-text capitalize break-words">{map.keyword}</h4>
                        <div className="flex flex-wrap gap-2 mt-1">
                          <p className="text-[10px] font-bold text-natural-primary opacity-40 flex items-center gap-1">
                            <Tag className="w-3 h-3 shrink-0" />
                            {map.iconName || 'Eigens Bild'}
                          </p>
                          {map.category && (
                            <p className="text-[10px] font-bold text-natural-accent flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              {map.category}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(map.id, 'ingredientIcons');
                      }} 
                      className="p-4 text-red-500 opacity-100 md:opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded-full transition-all shrink-0 z-30 relative ml-2 focus:ring-2 focus:ring-red-200 outline-none"
                      aria-label={`Mapping für ${map.keyword} löschen`}
                      title="Löschen"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detailedRecipe && (
          <RecipeDetail 
            recipe={detailedRecipe} 
            onClose={() => setDetailedRecipe(null)}
            onAddToShoppingList={() => handleAddToShoppingList(detailedRecipe)}
            onStartCooking={() => {
              setDetailedRecipe(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
