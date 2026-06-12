import React, { useState, useEffect, useMemo } from 'react';
import { RecipeService } from '../services/RecipeService';
import { ShoppingListItem } from '../types';
import { Plus, Trash2, CheckCircle2, ShoppingBag, Send, ChevronDown, ChevronRight, Tags, ChefHat, MoreHorizontal, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getIngredientIcon, useIngredientIcons } from '../lib/ingredient-icons';

export default function ShoppingListView() {
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [newItem, setNewItem] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'category' | 'recipe'>('category');
  const [collapsedRecipes, setCollapsedRecipes] = useState<Record<string, boolean>>({});
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const iconMappings = useIngredientIcons();

  useEffect(() => {
    return RecipeService.listenToShoppingList((list) => {
      setItems(list?.items || []);
      setLoading(false);
    });
  }, []);

  const handleToggleMultiple = async (indices: number[]) => {
    const updated = [...items];
    const targetState = !updated[indices[0]].checked;
    indices.forEach(idx => {
      updated[idx].checked = targetState;
    });
    await RecipeService.updateShoppingList(updated);
  };

  const handleAdd = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newItem.trim()) return;
    const category = RecipeService.inferCategory(newItem.trim(), iconMappings);
    const updated = [...items, { 
      name: newItem.trim(), 
      checked: false, 
      category, 
      recipeName: 'Manuell hinzugefügt' 
    }];
    await RecipeService.updateShoppingList(updated);
    setNewItem('');
  };

  const handleClearChecked = async () => {
    const updated = items.filter(item => !item.checked);
    await RecipeService.updateShoppingList(updated);
  };

  const handleDeleteMultiple = async (indices: number[]) => {
    const updated = items.filter((_, i) => !indices.includes(i));
    await RecipeService.updateShoppingList(updated);
  };

  const toggleRecipeCollapse = (recipeName: string) => {
    setCollapsedRecipes(prev => ({ ...prev, [recipeName]: !prev[recipeName] }));
  };

  const handleIncreaseAmount = async (recipeName: string) => {
    const recipeItems = items.filter(item => (item.recipeName || 'Manuell hinzugefügt') === recipeName);
    if (recipeItems.length === 0) return;

    // Group by name to find unique ingredients and their base amounts
    const groups: Record<string, typeof items> = {};
    recipeItems.forEach(item => {
      const key = item.name.toLowerCase().trim();
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    const newItemsToAdd: ShoppingListItem[] = [];
    Object.values(groups).forEach(group => {
      const first = group[0];
      const count = group.length;
      const aggregated = sumAmounts(group);
      
      // Calculate base amount
      let baseAmount = aggregated.amount;
      if (count > 0) {
        const match = aggregated.amount.match(/^(\d+(?:[.,]\d+)?)/);
        if (match) {
          const totalNum = parseFloat(match[1].replace(',', '.'));
          const baseNum = totalNum / count;
          baseAmount = aggregated.amount.replace(match[1], baseNum.toString().replace('.', ','));
        }
      }

      newItemsToAdd.push({
        ...first,
        amount: baseAmount,
        unit: aggregated.unit,
        checked: false
      });
    });

    const updated = [...items, ...newItemsToAdd];
    await RecipeService.updateShoppingList(updated);
    setActiveMenu(null);
  };

  const handleDecreaseAmount = async (recipeName: string) => {
    const recipeItems = items.filter(item => (item.recipeName || 'Manuell hinzugefügt') === recipeName);
    if (recipeItems.length === 0) return;

    // Group by name to find instances
    const groups: Record<string, number[]> = {};
    recipeItems.forEach((item, idx) => {
      const actualIdx = items.indexOf(item);
      const key = item.name.toLowerCase().trim();
      if (!groups[key]) groups[key] = [];
      groups[key].push(actualIdx);
    });

    // Check if we can decrease (multiplier > 1)
    const canDecrease = Object.values(groups).every(indices => indices.length > 1);
    if (!canDecrease) return;

    // Remove one index for each unique ingredient
    const indicesToRemove = Object.values(groups).map(indices => indices[0]);
    const updated = items.filter((_, i) => !indicesToRemove.includes(i));
    
    await RecipeService.updateShoppingList(updated);
    setActiveMenu(null);
  };

  const handleRemoveRecipe = async (recipeName: string) => {
    const updated = items.filter(item => {
      const currentItemRecipe = item.recipeName || 'Manuell hinzugefügt';
      return currentItemRecipe !== recipeName;
    });
    await RecipeService.updateShoppingList(updated);
    setActiveMenu(null);
  };

  // Grouping Logic
  const itemsWithIndex = useMemo(() => items.map((item, index) => ({ ...item, originalIndex: index })), [items]);
  
  const uncheckedItems = useMemo(() => itemsWithIndex.filter(i => !i.checked), [itemsWithIndex]);
  const checkedItems = useMemo(() => itemsWithIndex.filter(i => i.checked), [itemsWithIndex]);

  // Aggregation Logic for both checked and unchecked
  const aggregateList = (list: typeof itemsWithIndex) => {
    const groups: Record<string, Record<string, typeof itemsWithIndex>> = {};
    list.forEach(item => {
      const cat = item.category || 'Sonstiges';
      if (!groups[cat]) groups[cat] = {};
      
      const key = item.name.toLowerCase().trim();
      if (!groups[cat][key]) groups[cat][key] = [];
      groups[cat][key].push(item);
    });
    return groups;
  };

  const aggregatedUncheckedByCategory = useMemo(() => aggregateList(uncheckedItems), [uncheckedItems]);
  const aggregatedCheckedByCategory = useMemo(() => aggregateList(checkedItems), [checkedItems]);

  const groupByRecipe = (list: typeof itemsWithIndex) => {
    const groups: Record<string, { 
      itemsMap: Record<string, typeof itemsWithIndex>, 
      multiplier: number,
      recipeImage?: string 
    }> = {};

    list.forEach(item => {
      const rec = item.recipeName || 'Manuell hinzugefügt';
      if (!groups[rec]) {
        groups[rec] = { itemsMap: {}, multiplier: 1, recipeImage: item.recipeImage };
      }
      
      const key = item.name.toLowerCase().trim();
      if (!groups[rec].itemsMap[key]) {
        groups[rec].itemsMap[key] = [];
      }
      groups[rec].itemsMap[key].push(item);
    });

    // Calculate multiplier
    Object.values(groups).forEach(g => {
      const keys = Object.keys(g.itemsMap);
      if (keys.length > 0) {
        const totalCount = Object.values(g.itemsMap).reduce((sum, arr) => sum + arr.length, 0);
        g.multiplier = Math.ceil(totalCount / keys.length);
      }
    });

    return groups;
  };

  const groupedUncheckedByRecipe = useMemo(() => groupByRecipe(uncheckedItems), [uncheckedItems]);
  const groupedCheckedByRecipe = useMemo(() => groupByRecipe(checkedItems), [checkedItems]);

  if (loading) return <div className="py-20 text-center text-[#8b5a2b]">Lade Einkaufsliste...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-32">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-4xl font-serif font-bold italic text-natural-primary">Einkaufsliste</h2>
          <div className="flex gap-4 mt-4">
             <button 
              onClick={() => setActiveTab('category')}
              className={`pb-2 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 flex items-center gap-2 ${activeTab === 'category' ? 'border-natural-accent text-natural-accent' : 'border-transparent opacity-40 hover:opacity-60 text-natural-primary'}`}
             >
                <Tags className="w-3.5 h-3.5" />
                Nach Kategorien
             </button>
             <button 
              onClick={() => setActiveTab('recipe')}
              className={`pb-2 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 flex items-center gap-2 ${activeTab === 'recipe' ? 'border-natural-accent text-natural-accent' : 'border-transparent opacity-40 hover:opacity-60 text-natural-primary'}`}
             >
                <ChefHat className="w-3.5 h-3.5" />
                Nach Rezepten
             </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[32px] shadow-sm overflow-hidden flex flex-col">
        <form onSubmit={handleAdd} className="p-6 border-b border-natural-bg flex gap-3 bg-white sticky top-0 z-10">
          <input 
            type="text"
            placeholder="Etwas hinzufügen..."
            className="flex-1 bg-natural-bg border-none px-6 py-4 rounded-2xl focus:ring-2 focus:ring-natural-primary/20 outline-none transition-all"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
          />
          <button 
            type="submit"
            className="p-4 bg-natural-primary text-white rounded-2xl hover:bg-natural-primary/90 transition-all shadow-lg shadow-natural-primary/20"
          >
            <Plus className="w-6 h-6" />
          </button>
        </form>

        <div>
          <AnimatePresence initial={false}>
            {items.length === 0 ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-20 text-center flex flex-col items-center gap-4"
              >
                <div className="p-4 bg-natural-bg rounded-2xl text-natural-primary/20">
                  <ShoppingBag className="w-12 h-12" />
                </div>
                <p className="text-sm opacity-60 uppercase tracking-widest font-bold">Deine Liste ist leer</p>
              </motion.div>
            ) : activeTab === 'category' ? (
              <motion.div key="category-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {Object.entries(aggregatedUncheckedByCategory).map(([category, itemsMap]) => (
                  <motion.div layout key={category} className="border-b border-natural-bg last:border-none">
                    <div className="bg-natural-bg/30 px-6 py-2">
                       <span className="text-[10px] font-bold uppercase tracking-widest text-natural-primary opacity-60">{category}</span>
                    </div>
                    {Object.entries(itemsMap).map(([nameKey, group]) => {
                      const first = group[0];
                      const indices = group.map(i => i.originalIndex);
                      const aggregated = sumAmounts(group);
                      
                      return (
                        <ShoppingItemRow 
                          key={nameKey}
                          item={{ ...first, amount: aggregated.amount, unit: aggregated.unit }}
                          onToggle={() => handleToggleMultiple(indices)}
                          iconMappings={iconMappings}
                        />
                      );
                    })}
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div key="recipe-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {Object.entries(groupedUncheckedByRecipe).map(([recipeName, recipeData]: [string, any]) => {
                  const isCollapsed = collapsedRecipes[recipeName];
                  const { itemsMap, multiplier, recipeImage } = recipeData;
                  
                  return (
                    <motion.div layout key={recipeName} className="border-b border-natural-bg last:border-none relative">
                      <div className="flex items-center group/header hover:bg-natural-bg/30 transition-colors min-h-[100px]">
                          <button 
                            onClick={() => toggleRecipeCollapse(recipeName)}
                            className="flex-1 flex items-center gap-4 md:gap-6 px-4 md:px-6 py-4 md:py-6 min-w-0 h-full"
                          >
                            <div className="relative shrink-0 w-24 md:w-32">
                              <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-natural-bg shadow-sm border border-natural-bg/50">
                                {recipeImage ? (
                                  <img src={recipeImage} alt={recipeName} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    {recipeName === 'Manuell hinzugefügt' ? <Plus className="w-6 h-6 text-natural-primary/40" /> : <ChefHat className="w-6 h-6 text-natural-accent" />}
                                  </div>
                                )}
                              </div>
                              {multiplier > 1 && (
                                <div className="absolute -top-2 -right-2 bg-green-500 text-white text-[11px] font-black w-7 h-7 rounded-full flex items-center justify-center shadow-xl border-2 border-white z-20">
                                  {multiplier}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-start min-w-0 flex-1">
                              <span className="text-lg md:text-xl font-bold text-natural-primary leading-tight line-clamp-2 text-left">{recipeName}</span>
                              <span className="text-[10px] md:text-[11px] opacity-60 font-medium uppercase tracking-wider mt-1">
                                {Object.keys(itemsMap).length} Artikel
                              </span>
                            </div>
                          </button>
                        
                        <div className="flex items-center pr-2 md:pr-4 shrink-0 h-full">
                          <div className="relative group/menu">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenu(activeMenu === recipeName ? null : recipeName);
                              }}
                              className={`w-12 h-12 flex items-center justify-center rounded-xl transition-colors ${activeMenu === recipeName ? 'bg-natural-bg' : 'hover:bg-natural-bg'}`}
                            >
                              <MoreHorizontal className="w-5 h-5 text-natural-primary/40" />
                            </button>

                            {/* Recipe Menu Overlay */}
                            <AnimatePresence>
                              {activeMenu === recipeName && (
                                <>
                                  <div className="fixed inset-0 z-40 bg-black/5" onClick={(e) => { e.stopPropagation(); setActiveMenu(null); }} />
                                  <motion.div 
                                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                    className="absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-natural-bg z-50 py-2 w-64 overflow-hidden"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button 
                                      onClick={() => handleIncreaseAmount(recipeName)}
                                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-natural-primary hover:bg-natural-bg transition-colors"
                                    >
                                      <Plus className="w-4 h-4 text-green-600" />
                                      +1 Zutatenmenge erhöhen
                                    </button>
                                    
                                    {multiplier > 1 && (
                                      <button 
                                        onClick={() => handleDecreaseAmount(recipeName)}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-natural-primary hover:bg-natural-bg transition-colors"
                                      >
                                        <X className="w-4 h-4 text-red-500" />
                                        -1 Artikel entfernen
                                      </button>
                                    )}

                                    <button 
                                      onClick={() => handleRemoveRecipe(recipeName)}
                                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                      - von der Einkaufsliste entfernen
                                    </button>
                                    <div className="border-t border-natural-bg mx-2 my-1" />
                                    <button 
                                      onClick={() => setActiveMenu(null)}
                                      className="w-full text-center py-2 text-xs font-bold text-natural-primary/40 hover:text-natural-primary transition-colors"
                                    >
                                      Abbrechen
                                    </button>
                                  </motion.div>
                                </>
                              )}
                            </AnimatePresence>
                          </div>
                          
                          <button 
                            onClick={() => toggleRecipeCollapse(recipeName)} 
                            className="w-12 h-12 flex items-center justify-center rounded-xl hover:bg-natural-bg transition-colors"
                          >
                             {isCollapsed ? <ChevronRight className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
                          </button>
                        </div>
                      </div>

                      <AnimatePresence>
                        {!isCollapsed && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden bg-white"
                          >
                            {Object.entries(itemsMap as Record<string, typeof itemsWithIndex>).map(([nameKey, group]) => {
                              const first = group[0];
                              const indices = group.map(i => i.originalIndex);
                              const aggregated = sumAmounts(group as any);

                              return (
                                <ShoppingItemRow 
                                  key={nameKey}
                                  item={{ ...first, amount: aggregated.amount, unit: aggregated.unit }}
                                  onToggle={() => handleToggleMultiple(indices)}
                                  isIndented
                                  iconMappings={iconMappings}
                                />
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            {/* Checked Items Section */}
            {checkedItems.length > 0 && (
              <motion.div 
                key="checked-section"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 border-t-2 border-natural-bg"
              >
                <div className="bg-natural-bg/50 px-6 py-3 flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-natural-primary opacity-40">Bereits vorhandene Artikel</span>
                  <span className="px-2 py-0.5 bg-white rounded-full text-[9px] font-bold opacity-40">{checkedItems.length}</span>
                </div>
                <div className="bg-white">
                  {activeTab === 'category' ? (
                    Object.entries(aggregatedCheckedByCategory).map(([category, itemsMap]) => (
                      <div key={`checked-${category}`}>
                        {Object.entries(itemsMap).map(([nameKey, group]) => {
                          const first = group[0];
                          const indices = group.map(i => i.originalIndex);
                          const aggregated = sumAmounts(group);
                          return (
                            <ShoppingItemRow 
                              key={`checked-${nameKey}`}
                              item={{ ...first, amount: aggregated.amount, unit: aggregated.unit }}
                              onToggle={() => handleToggleMultiple(indices)}
                              iconMappings={iconMappings}
                            />
                          );
                        })}
                      </div>
                    ))
                  ) : activeTab === 'recipe' ? (
                    Object.entries(groupedCheckedByRecipe).map(([recipeName, recipeData]: [string, any]) => {
                      const { itemsMap } = recipeData;
                      return (
                        <div key={`checked-recipe-${recipeName}`}>
                          <div className="bg-natural-bg/10 px-6 py-1 border-y border-natural-bg/20">
                            <span className="text-[8px] font-bold uppercase tracking-widest text-natural-primary opacity-40">{recipeName}</span>
                          </div>
                          {Object.entries(itemsMap).map(([nameKey, group]: [string, any]) => {
                            const first = group[0];
                            const indices = group.map((i: any) => i.originalIndex);
                            const aggregated = sumAmounts(group);
                            return (
                              <ShoppingItemRow 
                                key={`checked-${recipeName}-${nameKey}`}
                                item={{ ...first, amount: aggregated.amount, unit: aggregated.unit }}
                                onToggle={() => handleToggleMultiple(indices)}
                                iconMappings={iconMappings}
                              />
                            );
                          })}
                        </div>
                      );
                    })
                  ) : (
                    checkedItems.map((item) => (
                      <ShoppingItemRow 
                        key={item.originalIndex}
                        item={item}
                        onToggle={() => handleToggleMultiple([item.originalIndex])}
                        iconMappings={iconMappings}
                      />
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {items.some(i => i.checked) && (
          <div className="p-6 bg-white flex justify-center sticky bottom-0 z-10 border-t border-natural-bg">
            <button 
              onClick={handleClearChecked}
              className="px-8 py-4 bg-natural-accent/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-natural-accent hover:bg-natural-accent/20 transition-all shadow-sm"
            >
              Erledigte Einträge löschen
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button 
          className="flex flex-col items-center gap-3 p-8 bg-white rounded-[32px] hover:shadow-md transition-all group"
          onClick={() => {
            const listText = items.filter(i => !i.checked).map(i => `- ${i.amount || ''} ${i.unit || ''} ${i.name}`).join('\n');
            if (listText) window.open(`mailto:?subject=Meine Einkaufsliste&body=${encodeURIComponent(listText)}`);
          }}
        >
          <div className="p-4 bg-natural-bg rounded-2xl group-hover:bg-natural-primary group-hover:text-white transition-all shadow-sm">
            <Send className="w-6 h-6 text-natural-primary group-hover:text-white" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-natural-primary">Liste versenden</span>
        </button>
        <div className="hidden sm:flex flex-col items-center gap-3 p-8 bg-natural-bg/10 rounded-[32px] border-2 border-dashed border-natural-bg/50">
           <ShoppingBag className="w-6 h-6 opacity-20" />
           <span className="text-[10px] font-black uppercase tracking-widest opacity-20">Mehr Funktionen kommen</span>
        </div>
      </div>
    </div>
  );
}

function sumAmounts(items: ShoppingListItem[]): { amount: string; unit: string } {
  if (items.length === 0) return { amount: '', unit: '' };
  if (items.length === 1) return { amount: items[0].amount || '', unit: items[0].unit || '' };

  const unit = items[0].unit || '';
  let total = 0;
  let allNumeric = true;

  for (const item of items) {
    // If units differ, we can't easily sum them numerically
    if (item.unit !== unit) {
      allNumeric = false;
      break;
    }
    // Extract number, handling both . and ,
    const valStr = item.amount?.replace(',', '.') || '0';
    const val = parseFloat(valStr);
    if (isNaN(val)) {
      allNumeric = false;
      break;
    }
    total += val;
  }

  if (allNumeric && total > 0) {
    // Format back to European style if needed, but keeping it simple
    return { 
      amount: total.toString().replace('.', ','), 
      unit 
    };
  }

  // Fallback: list them
  return { 
    amount: items.map(i => i.amount).filter(Boolean).join(' + '), 
    unit 
  };
}

function ShoppingItemRow({ item, onToggle, isIndented, iconMappings }: { item: ShoppingListItem, onToggle: () => void, isIndented?: boolean, iconMappings?: any }) {
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={`flex items-center gap-4 p-4 hover:bg-natural-bg/50 transition-colors group ${item.checked ? 'opacity-50' : ''} px-6`}
    >
      {/* Icon Links */}
      <div className="w-10 h-10 bg-natural-bg rounded-xl flex items-center justify-center text-natural-primary/60 p-2 overflow-hidden shrink-0 shadow-sm border border-natural-bg/50">
        {getIngredientIcon(item.name, iconMappings)}
      </div>
      
      {/* Bezeichnung & Menge */}
      <div className="flex-1 min-w-0 flex flex-col">
        <span className={`text-base font-bold truncate transition-all ${item.checked ? 'line-through opacity-40' : 'text-natural-text'}`}>
          {item.name}
        </span>
        {(item.amount || item.unit) && (
          <span className={`text-[10px] font-black text-natural-accent uppercase tracking-wider mt-0.5 ${item.checked ? 'opacity-20' : ''}`}>
            {item.amount}{item.amount && item.unit ? ' ' : ''}{item.unit}
          </span>
        )}
      </div>

      {/* Checkbox Rechts */}
      <div className="flex items-center shrink-0 ml-auto mr-1 md:mr-1.5 h-12 w-12 justify-center">
        <button onClick={onToggle} className="p-2 focus:outline-none">
          {item.checked ? (
            <div className="w-6 h-6 rounded-lg bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/20 transition-all transform scale-110">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
          ) : (
            <div className="w-6 h-6 rounded-lg bg-white border-2 border-neutral-200 group-hover:border-natural-primary/30 transition-all active:scale-95" />
          )}
        </button>
      </div>
    </motion.div>
  );
}
