import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RecipeService } from '../services/RecipeService';
import { Recipe, RecipeType } from '../types';
import { 
  Search, Filter, Star, ExternalLink, Trash2, Edit3, ShoppingCart, 
  Info, Utensils, Play, Wheat, Clock, Flame, Settings, Sparkles, Wand2, X, Heart, Tag
} from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import CookingMode from './CookingMode';
import { getIngredientIcon, useIngredientIcons } from '../lib/ingredient-icons';

interface RecipeListProps {
  onEdit: (id: string) => void;
  onOpenDetail: (recipe: Recipe) => void;
}

export default function RecipeList({ onEdit, onOpenDetail }: RecipeListProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [activeTab, setActiveTab] = useState<'list' | 'discover'>('list');
  const [search, setSearch] = useState('');
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [filterMethods, setFilterMethods] = useState<string[]>([]);
  const [filterCarbs, setFilterCarbs] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showDiscoverFilters, setShowDiscoverFilters] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [viewSettings, setViewSettings] = useState({
    showRating: false,
    showCalories: false,
    showTime: false,
    showBadges: false,
    showStatus: false,
  });
  const [loading, setLoading] = useState(true);
  const [showAIImport, setShowAIImport] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [discoverIndex, setDiscoverIndex] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<number>(0);
  const actionRunning = React.useRef(false);

  const dragX = useMotionValue(0);
  const swipeOpacityLeft = useTransform(dragX, [-80, -20], [1, 0]);
  const swipeOpacityRight = useTransform(dragX, [20, 80], [0, 1]);
  const swipeScaleLeft = useTransform(dragX, [-150, -80, 0], [1.5, 1, 0.5]);
  const swipeScaleRight = useTransform(dragX, [0, 80, 150], [0.5, 1, 1.5]);
  const swipeRotateLeft = useTransform(dragX, [-150, 0], [-25, 0]);
  const swipeRotateRight = useTransform(dragX, [0, 150], [0, 25]);

  const hasTriggeredHaptic = useRef(false);

  // Discover Filters
  const [discoverFilterTypes, setDiscoverFilterTypes] = useState<string[]>([]);
  const [discoverFilterMethods, setDiscoverFilterMethods] = useState<string[]>([]);
  const [discoverFilterCarbs, setDiscoverFilterCarbs] = useState<string[]>([]);
  const [discoverExcludeTags, setDiscoverExcludeTags] = useState<string[]>([]);
  const [discoverExcludeIngredients, setDiscoverExcludeIngredients] = useState('');

  useEffect(() => {
    dragX.set(0);
    setSwipeDirection(0);
    actionRunning.current = false;
  }, [discoverIndex, dragX]);

  const handleAIImport = async () => {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const extracted = await RecipeService.extractRecipeWithAI(aiText);
      await RecipeService.addRecipe(extracted as any);
      setShowAIImport(false);
      setAiText('');
      alert('Rezept erfolgreich importiert!')
    } catch (err) {
      alert('Fehler beim Import: ' + (err as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  const discoverRecipes = useMemo(() => {
    return recipes.filter(recipe => {
      // Exclude logic
      const exclusionTerms = discoverExcludeIngredients.toLowerCase().split(',').map(t => t.trim()).filter(t => t.length > 0);
      const isExcludedByIngredient = exclusionTerms.some(term => 
        recipe.ingredients.some(i => i.name.toLowerCase().includes(term)) ||
        recipe.name.toLowerCase().includes(term)
      );
      if (isExcludedByIngredient) return false;

      // Filter logic
      const recipeTypes = Array.isArray(recipe.type) ? recipe.type : [recipe.type];
      const matchesType = discoverFilterTypes.length === 0 || discoverFilterTypes.some(t => recipeTypes.includes(t as RecipeType));
      
      const recipeMethods = Array.isArray(recipe.method) ? recipe.method : [recipe.method];
      const matchesMethod = discoverFilterMethods.length === 0 || discoverFilterMethods.some(m => recipeMethods.includes(m));

      const isExcludedByCategory = discoverExcludeTags.length > 0 && discoverExcludeTags.some(t => recipeMethods.includes(t));
      if (isExcludedByCategory) return false;

      const recipeCarbs = Array.isArray(recipe.carbs) ? recipe.carbs : [recipe.carbs];
      const matchesCarbs = discoverFilterCarbs.length === 0 || discoverFilterCarbs.some(c => recipeCarbs.includes(c));

      return matchesType && matchesMethod && matchesCarbs;
    });
  }, [recipes, discoverFilterTypes, discoverFilterMethods, discoverFilterCarbs, discoverExcludeIngredients, discoverExcludeTags]);

  const shuffledRecipes = useMemo(() => {
    return [...discoverRecipes].sort(() => Math.random() - 0.5);
  }, [discoverRecipes]);

  const currentDiscoverRecipe = shuffledRecipes[discoverIndex % shuffledRecipes.length];

  useEffect(() => {
    return RecipeService.listenToRecipes((data) => {
      setRecipes(data);
      setLoading(false);
    });
  }, []);

  const filteredRecipes = useMemo(() => {
    return recipes.filter(recipe => {
      const searchTerms = search.toLowerCase().split(',').map(t => t.trim()).filter(t => t.length > 0);
      
      const matchesSearch = searchTerms.length === 0 || searchTerms.every(term => 
        recipe.name.toLowerCase().includes(term) || 
        recipe.ingredients.some(i => i.name.toLowerCase().includes(term))
      );
      
      const recipeTypes = Array.isArray(recipe.type) ? recipe.type : [recipe.type];
      const matchesType = filterTypes.length === 0 || filterTypes.some(t => recipeTypes.includes(t as RecipeType));
      
      const recipeStatus = recipe.status || 'Neu';
      const matchesStatus = filterStatuses.length === 0 || filterStatuses.includes(recipeStatus);
      
      const recipeMethods = Array.isArray(recipe.method) ? recipe.method : [recipe.method];
      const matchesMethod = filterMethods.length === 0 || filterMethods.some(m => recipeMethods.includes(m));

      const recipeCarbs = Array.isArray(recipe.carbs) ? recipe.carbs : [recipe.carbs];
      const matchesCarbs = filterCarbs.length === 0 || filterCarbs.some(c => recipeCarbs.includes(c));
      
      return matchesSearch && matchesType && matchesStatus && matchesMethod && matchesCarbs;
    });
  }, [recipes, search, filterTypes, filterStatuses, filterMethods, filterCarbs]);

  const handleNextDiscover = () => {
    setSwipeDirection(-1);
    setDiscoverIndex(prev => prev + 1);
  };

  const handleOpenDetailFromDiscover = (recipe: Recipe) => {
    setSwipeDirection(1);
    onOpenDetail(recipe);
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!id) {
      console.error("Löschfehler: Rezept-ID fehlt.");
      return;
    }

    setConfirmDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;

    try {
      setLoading(true);
      await RecipeService.deleteRecipe(confirmDeleteId);
      setConfirmDeleteId(null);
    } catch (err) {
      console.error("Fehler beim Löschen des Rezepts:", err);
      alert("Fehler beim Löschen des Rezepts: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToShoppingList = async (recipe: Recipe) => {
    const mappingsArr = await RecipeService.getIconMappings();
    const mappingsObj: Record<string, string> = {};
    mappingsArr.forEach(m => mappingsObj[m.name.toLowerCase().trim()] = m.category || '');
    
    await RecipeService.addIngredientsToShoppingList(recipe, mappingsObj);
    alert('Zutaten zur Einkaufsliste hinzugefügt!');
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="animate-pulse flex flex-col items-center">
        <ChefHat className="w-10 h-10 text-gray-300 mb-2" />
        <p className="text-gray-400">Rezepte werden geladen...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-4xl font-sans font-bold italic text-natural-primary">Meine Rezepte</h2>
          <div className="flex gap-4 mt-2">
            <button 
              onClick={() => setActiveTab('list')}
              className={`pb-2 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 ${activeTab === 'list' ? 'border-natural-accent text-natural-accent' : 'border-transparent opacity-40 hover:opacity-60'}`}
            >
              Meine Liste
            </button>
            <button 
              onClick={() => setActiveTab('discover')}
              className={`pb-2 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 ${activeTab === 'discover' ? 'border-natural-accent text-natural-accent' : 'border-transparent opacity-40 hover:opacity-60'}`}
            >
              Entdecke
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          {activeTab === 'discover' && (
            <button 
              onClick={() => setShowDiscoverFilters(!showDiscoverFilters)}
              className={`p-3 rounded-full border transition-colors flex items-center gap-2 ${showDiscoverFilters ? 'bg-natural-accent text-white border-natural-accent' : 'bg-white text-natural-accent border-none shadow-sm'}`}
              title="Entdecke Filter"
            >
              <Filter className="w-5 h-5" />
              <span className="text-[10px] font-black uppercase tracking-widest px-1">Entdecke Filter</span>
            </button>
          )}

          {activeTab === 'list' && (
            <>
              <div className="relative flex-1 md:w-80">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-natural-primary/40" />
                <input 
                  type="text"
                  placeholder="Zutaten suchen..."
                  className="bg-white border-none rounded-full py-3 pl-12 pr-6 w-full text-sm shadow-sm focus:ring-2 focus:ring-natural-primary outline-none"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  id="recipe-search"
                />
              </div>
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`p-3 rounded-full border transition-colors ${showFilters ? 'bg-natural-primary text-white border-natural-primary' : 'bg-white text-natural-primary border-none shadow-sm'}`}
                id="filter-toggle"
                title="Filter"
              >
                <Filter className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className={`p-3 rounded-full border transition-colors ${showSettings ? 'bg-natural-accent text-white border-natural-accent' : 'bg-white text-natural-accent border-none shadow-sm'}`}
                id="settings-toggle"
                title="Einstellungen"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setShowAIImport(true)}
                className="px-6 py-3 bg-natural-accent text-white rounded-full flex items-center gap-2 text-sm font-black shadow-lg shadow-natural-accent/20 hover:scale-105 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                KI-Import
              </button>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {confirmDeleteId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-[200] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[32px] p-8 max-w-sm w-full text-center shadow-2xl"
            >
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-natural-primary mb-2">Rezept löschen?</h3>
              <p className="text-natural-primary/60 text-sm mb-8">Bist du sicher? Diese Aktion kann nicht rückgängig gemacht werden.</p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-4 bg-natural-bg text-natural-primary rounded-2xl font-bold hover:bg-natural-bg/80 transition-colors"
                >
                  Abbrechen
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold shadow-lg shadow-red-600/20 hover:bg-red-700 transition-all"
                >
                  Löschen
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAIImport && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-natural-primary/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-xl p-8 relative overflow-hidden"
            >
              <button 
                onClick={() => setShowAIImport(false)}
                className="absolute top-6 right-6 p-2 text-natural-primary/40 hover:text-natural-primary transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-natural-accent text-white rounded-2xl flex items-center justify-center">
                  <Wand2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-sans font-bold italic text-natural-primary">KI-Rezept-Assistent</h3>
                  <p className="text-xs opacity-50 uppercase font-black tracking-widest">Importiere Rezepte aus Text oder URLs</p>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-natural-primary/70 leading-relaxed">
                  Füge einen Link zu einem Rezept ein oder kopiere einen beliebigen Text (z.B. aus Instagram oder WhatsApp). Die KI kümmert sich um den Rest.
                </p>
                <textarea 
                  className="w-full h-40 bg-natural-bg border-none rounded-3xl p-6 text-sm outline-none focus:ring-2 focus:ring-natural-accent/20 transition-all resize-none"
                  placeholder="Link einfügen oder Text kopieren..."
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                />

                <button 
                  onClick={handleAIImport}
                  disabled={aiLoading || !aiText.trim()}
                  className="w-full bg-natural-primary text-white py-4 rounded-2xl font-black text-sm shadow-xl shadow-natural-primary/10 hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 overflow-hidden relative"
                >
                  {aiLoading ? (
                    <motion.div 
                      animate={{ rotate: 360 }} 
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      <Sparkles className="w-5 h-5 text-natural-accent" />
                    </motion.div>
                  ) : (
                    <>
                      <Wand2 className="w-5 h-5 text-natural-accent" />
                      Extraktion starten
                    </>
                  )}
                  {aiLoading && (
                    <motion.div 
                      initial={{ x: '-100%' }}
                      animate={{ x: '100%' }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none"
                    />
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {activeTab === 'list' ? (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <AnimatePresence>
              {showSettings && (
                 <motion.div
                   initial={{ height: 0, opacity: 0 }}
                   animate={{ height: 'auto', opacity: 1 }}
                   exit={{ height: 0, opacity: 0 }}
                   className="overflow-hidden"
                 >
                    <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-none md:flex-wrap md:pb-2 bg-natural-bg/5 p-2 rounded-2xl border border-natural-bg/20">
                       <SettingToggle 
                        label="Bewertung" 
                        icon={<Star className="w-3 h-3" />}
                        active={viewSettings.showRating} 
                        onChange={(val) => setViewSettings(v => ({...v, showRating: val}))} 
                       />
                       <SettingToggle 
                        label="Kalorien" 
                        icon={<Flame className="w-3 h-3" />}
                        active={viewSettings.showCalories} 
                        onChange={(val) => setViewSettings(v => ({...v, showCalories: val}))} 
                       />
                       <SettingToggle 
                        label="Dauer" 
                        icon={<Clock className="w-3 h-3" />}
                        active={viewSettings.showTime} 
                        onChange={(val) => setViewSettings(v => ({...v, showTime: val}))} 
                       />
                       <SettingToggle 
                        label="Typ" 
                        icon={<Wheat className="w-3 h-3" />}
                        active={viewSettings.showBadges} 
                        onChange={(val) => setViewSettings(v => ({...v, showBadges: val}))} 
                       />
                       <SettingToggle 
                        label="Status" 
                        icon={<Tag className="w-3 h-3" />}
                        active={viewSettings.showStatus} 
                        onChange={(val) => setViewSettings(v => ({...v, showStatus: val}))} 
                       />
                    </div>
                 </motion.div>
              )}

              {showFilters && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden bg-white border border-[#e9e4df] rounded-2xl p-6 shadow-sm space-y-6"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-natural-primary opacity-60">Sättigungsbeilage (Mehrfachauswahl)</label>
                        {filterCarbs.length > 0 && (
                          <button onClick={() => setFilterCarbs([])} className="text-[10px] text-natural-accent font-bold hover:underline">Reset</button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {['Reis', 'Nudeln', 'Kartoffeln'].map(c => (
                          <button
                            key={`carb-${c}`}
                            onClick={() => setFilterCarbs(prev => 
                              prev.includes(c) ? prev.filter(p => p !== c) : [...prev, c]
                            )}
                            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${filterCarbs.includes(c) ? 'bg-natural-accent text-white shadow-md' : 'bg-natural-bg text-natural-primary hover:bg-white border border-transparent shadow-sm'}`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-natural-primary opacity-60">Status</label>
                        {filterStatuses.length > 0 && (
                          <button onClick={() => setFilterStatuses([])} className="text-[10px] text-natural-accent font-bold hover:underline">Reset</button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {['Neu', 'Ausprobieren', 'Ausprobiert'].map(s => (
                          <button
                            key={`status-${s}`}
                            onClick={() => setFilterStatuses(prev => 
                              prev.includes(s) ? prev.filter(p => p !== s) : [...prev, s]
                            )}
                            className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${filterStatuses.includes(s) ? 'bg-natural-accent text-white shadow-md' : 'bg-natural-bg text-natural-primary hover:bg-white border border-transparent hover:border-natural-bg shadow-sm'}`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-natural-primary opacity-60">Mahlzeiten</label>
                        {filterTypes.length > 0 && (
                          <button onClick={() => setFilterTypes([])} className="text-[10px] text-natural-accent font-bold hover:underline">Reset</button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {Object.values(RecipeType).map(t => (
                          <button
                            key={`type-${t}`}
                            onClick={() => setFilterTypes(prev => 
                              prev.includes(t) ? prev.filter(p => p !== t) : [...prev, t]
                            )}
                            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${filterTypes.includes(t) ? 'bg-natural-primary text-white shadow-md' : 'bg-natural-bg text-natural-primary hover:bg-white border border-transparent shadow-sm'}`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-natural-primary opacity-60">Kategorien (Mehrfachauswahl)</label>
                        {filterMethods.length > 0 && (
                          <button onClick={() => setFilterMethods([])} className="text-[10px] text-natural-accent font-bold hover:underline">Reset</button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {['Highlight', 'Thermomix', 'Ofen', 'Pfannengericht', 'Saucen', 'Airfryer', 'Snacks', 'Beilagen'].map(m => (
                          <button
                            key={`method-${m}`}
                            onClick={() => setFilterMethods(prev => 
                              prev.includes(m) ? prev.filter(p => p !== m) : [...prev, m]
                            )}
                            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${filterMethods.includes(m) ? 'bg-natural-accent text-white shadow-md' : 'bg-natural-bg text-natural-primary hover:bg-white border border-transparent shadow-sm'}`}
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

            {filteredRecipes.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border border-[#e9e4df] border-dashed">
                <Utensils className="w-12 h-12 text-[#e9e4df] mx-auto mb-4" />
                <p className="text-[#8b5a2b]">Keine Rezepte gefunden.</p>
                <p className="text-sm text-gray-400 mt-1">Hast du schon ein neues Rezept hinzugefügt?</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                {filteredRecipes.map((recipe, idx) => (
                  <RecipeCard 
                    key={recipe.id || `recipe-${idx}`} 
                    recipe={recipe} 
                    settings={viewSettings}
                    onEdit={() => onEdit(recipe.id!)} 
                    onDelete={(e: React.MouseEvent) => handleDelete(recipe.id!, e)}
                    onAddShopping={() => handleAddToShoppingList(recipe)}
                    onOpenDetail={() => onOpenDetail(recipe)}
                  />
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="discover"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6 flex flex-col items-center"
          >
            <AnimatePresence>
              {showDiscoverFilters && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="w-full max-w-2xl overflow-hidden bg-white border border-[#e9e4df] rounded-2xl p-6 shadow-sm space-y-6 mb-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Exclusions */}
                    <div className="md:col-span-2">
                       <label className="text-[10px] font-bold uppercase tracking-wider text-red-600 mb-2 block">Dinge ausschließen (z.B. Fisch, Fleisch, Pilze)</label>
                       <div className="relative">
                          <X className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />
                          <input 
                            type="text"
                            placeholder="Zutaten zum Ausschließen (mit Komma trennen)..."
                            className="bg-red-50 border-none rounded-2xl py-3 pl-12 pr-6 w-full text-sm outline-none focus:ring-2 focus:ring-red-200"
                            value={discoverExcludeIngredients}
                            onChange={(e) => setDiscoverExcludeIngredients(e.target.value)}
                          />
                       </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-natural-primary opacity-60">Sättigungsbeilage</label>
                        {discoverFilterCarbs.length > 0 && (
                          <button onClick={() => setDiscoverFilterCarbs([])} className="text-[10px] text-natural-accent font-bold hover:underline">Reset</button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {['Reis', 'Nudeln', 'Kartoffeln'].map(c => (
                          <button
                            key={`discover-carb-${c}`}
                            onClick={() => setDiscoverFilterCarbs(prev => 
                              prev.includes(c) ? prev.filter(p => p !== c) : [...prev, c]
                            )}
                            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${discoverFilterCarbs.includes(c) ? 'bg-natural-accent text-white shadow-md' : 'bg-natural-bg text-natural-primary hover:bg-white border border-transparent shadow-sm'}`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-natural-primary opacity-60">Mahlzeiten</label>
                        {discoverFilterTypes.length > 0 && (
                          <button onClick={() => setDiscoverFilterTypes([])} className="text-[10px] text-natural-accent font-bold hover:underline">Reset</button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {Object.values(RecipeType).map(t => (
                          <button
                            key={`discover-type-${t}`}
                            onClick={() => setDiscoverFilterTypes(prev => 
                              prev.includes(t) ? prev.filter(p => p !== t) : [...prev, t]
                            )}
                            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${discoverFilterTypes.includes(t) ? 'bg-natural-primary text-white shadow-md' : 'bg-natural-bg text-natural-primary hover:bg-white border border-transparent shadow-sm'}`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-natural-primary opacity-60">Kategorien bevorzugen</label>
                        {discoverFilterMethods.length > 0 && (
                          <button onClick={() => setDiscoverFilterMethods([])} className="text-[10px] text-natural-accent font-bold hover:underline">Reset</button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {['Highlight', 'Thermomix', 'Ofen', 'Pfannengericht', 'Saucen', 'Airfryer', 'Snacks', 'Beilagen'].map(m => (
                          <button
                            key={`discover-pref-${m}`}
                            onClick={() => {
                              setDiscoverFilterMethods(prev => 
                                prev.includes(m) ? prev.filter(p => p !== m) : [...prev, m]
                              );
                              // Remove from exclusions if added to includes
                              setDiscoverExcludeTags(prev => prev.filter(p => p !== m));
                            }}
                            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${discoverFilterMethods.includes(m) ? 'bg-natural-accent text-white shadow-md' : 'bg-natural-bg text-natural-primary hover:bg-white border border-transparent shadow-sm'}`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-red-600 opacity-60">Kategorien verbergen</label>
                        {discoverExcludeTags.length > 0 && (
                          <button onClick={() => setDiscoverExcludeTags([])} className="text-[10px] text-red-600 font-bold hover:underline">Reset</button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {['Highlight', 'Thermomix', 'Ofen', 'Pfannengericht', 'Saucen', 'Airfryer', 'Snacks', 'Beilagen'].map(m => (
                          <button
                            key={`discover-hide-${m}`}
                            onClick={() => {
                              setDiscoverExcludeTags(prev => 
                                prev.includes(m) ? prev.filter(p => p !== m) : [...prev, m]
                              );
                              // Remove from includes if added to exclusions
                              setDiscoverFilterMethods(prev => prev.filter(p => p !== m));
                            }}
                            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${discoverExcludeTags.includes(m) ? 'bg-red-600 text-white shadow-md' : 'bg-red-50 text-red-600 hover:bg-white border border-transparent shadow-sm'}`}
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

            {shuffledRecipes.length > 0 && currentDiscoverRecipe ? (
              <div className="relative w-full max-w-[220px] md:max-w-[280px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${currentDiscoverRecipe.id}-${discoverIndex}`}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    onDrag={(e, info) => {
                      const threshold = 80;
                      if (!hasTriggeredHaptic.current && Math.abs(info.offset.x) > threshold) {
                        try { window.navigator.vibrate(10); } catch (e) {}
                        hasTriggeredHaptic.current = true;
                      } else if (Math.abs(info.offset.x) < threshold) {
                        hasTriggeredHaptic.current = false;
                      }
                    }}
                    onDragEnd={(_, info) => {
                      if (actionRunning.current) return;
                      
                      const threshold = 100;
                      const velocityThreshold = 500;
                      
                      if (info.offset.x > threshold || info.velocity.x > velocityThreshold) {
                        actionRunning.current = true;
                        setSwipeDirection(1);
                        handleOpenDetailFromDiscover(currentDiscoverRecipe);
                      } else if (info.offset.x < -threshold || info.velocity.x < -velocityThreshold) {
                        actionRunning.current = true;
                        setSwipeDirection(-1);
                        handleNextDiscover();
                      }
                    }}
                    onTap={() => {
                      if (!actionRunning.current) {
                        const xOffset = Math.abs(dragX.get());
                        if (xOffset < 10) {
                          actionRunning.current = true;
                          setSwipeDirection(1);
                          handleOpenDetailFromDiscover(currentDiscoverRecipe);
                        }
                      }
                    }}
                    dragDirectionLock
                    style={{ x: dragX }}
                    whileDrag={{ scale: 1.05 }}
                    initial={{ scale: 0.9, opacity: 0, rotate: -5 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    exit={{
                      x: swipeDirection > 0 ? 500 : (swipeDirection < 0 ? -500 : 0),
                      opacity: 0,
                      rotate: swipeDirection > 0 ? 45 : (swipeDirection < 0 ? -45 : 0),
                    }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="cursor-grab active:cursor-grabbing relative"
                  >
                    {/* Visual Swipe Feedback Overlays */}
                    <motion.div 
                      style={{ opacity: swipeOpacityLeft }}
                      className="absolute inset-0 pointer-events-none rounded-[32px] bg-red-500/20 z-10 flex items-center justify-end pr-10"
                    >
                       <motion.div style={{ scale: swipeScaleLeft, rotate: swipeRotateLeft }}>
                          <X className="w-12 h-12 text-red-600" />
                       </motion.div>
                    </motion.div>
                    <motion.div 
                      style={{ opacity: swipeOpacityRight }}
                      className="absolute inset-0 pointer-events-none rounded-[32px] bg-green-500/20 z-10 flex items-center justify-start pl-10"
                    >
                       <motion.div style={{ scale: swipeScaleRight, rotate: swipeRotateRight }}>
                          <Heart className="w-12 h-12 text-green-600 fill-current" />
                       </motion.div>
                    </motion.div>

                    <RecipeCard 
                      recipe={currentDiscoverRecipe} 
                      settings={{
                        showRating: false,
                        showCalories: false,
                        showTime: false,
                        showBadges: false,
                        showStatus: false
                      }}
                      onEdit={() => onEdit(currentDiscoverRecipe.id!)} 
                      onDelete={(e: React.MouseEvent) => handleDelete(currentDiscoverRecipe.id!, e)}
                      onAddShopping={() => handleAddToShoppingList(currentDiscoverRecipe)}
                      onOpenDetail={() => {}} // Handle opening via parent motion.div onTap to avoid event conflicts during drag
                    />
                  </motion.div>
                </AnimatePresence>

                <div className="flex justify-center gap-8 mt-8">
                  <button 
                    onClick={handleNextDiscover}
                    className="w-12 h-12 flex items-center justify-center bg-white text-red-500 rounded-full shadow-xl border border-red-50 hover:bg-red-50 hover:scale-110 active:scale-95 transition-all group"
                    title="Überspringen"
                  >
                    <X className="w-6 h-6 transition-transform group-active:-rotate-12" />
                  </button>
                  <button 
                    onClick={() => handleOpenDetailFromDiscover(currentDiscoverRecipe)}
                    className="w-12 h-12 flex items-center justify-center bg-white text-green-500 rounded-full shadow-xl border border-green-50 hover:bg-green-50 hover:scale-110 active:scale-95 transition-all group"
                    title="Details ansehen"
                  >
                    <Heart className="w-6 h-6 fill-current transition-transform group-active:scale-125" />
                  </button>
                </div>

                {/* Hint for Swiping */}
                <div className="mt-6 flex justify-between px-6 text-[9px] font-bold uppercase tracking-widest opacity-20 pointer-events-none">
                  <span>← Links für Skip</span>
                  <span>Rechts für Details →</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-20">
                <ChefHat className="w-16 h-16 text-natural-primary/10 mx-auto mb-4" />
                <p className="text-natural-primary opacity-60">Noch keine Rezepte zum Entdecken vorhanden.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RecipeCard({ recipe, onEdit, onDelete, onAddShopping, onOpenDetail, settings }: any) {
  const [showDetails, setShowDetails] = useState(false);
  const mappings = useIngredientIcons();

  const statusColor = recipe.status === 'Ausprobiert' ? 'bg-green-100 text-green-700' :
                    recipe.status === 'Ausprobieren' ? 'bg-blue-100 text-blue-700' :
                    'bg-orange-100 text-orange-700';

  return (
    <motion.div 
      layout
      className="bg-white rounded-[24px] md:rounded-[32px] p-2 md:p-2.5 shadow-sm flex flex-col gap-2 md:gap-3 group h-full cursor-pointer hover:shadow-xl transition-all"
      onClick={onOpenDetail}
    >
      <div className="aspect-square w-[94%] mx-auto mt-1 bg-[#E8E8E0] rounded-[18px] md:rounded-[24px] relative overflow-hidden flex-shrink-0">
        {recipe.images?.[0] ? (
          <img src={recipe.images[0]} alt={recipe.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-natural-primary/20">
            <ChefHat className="w-12 h-12" />
          </div>
        )}
        <div className="absolute top-3 right-3 flex flex-col gap-1 items-end">
          {settings?.showStatus && (
            <div className={`mt-1 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm ${statusColor}`}>
               {recipe.status || 'Neu'}
            </div>
          )}
        </div>
        <div className="absolute top-3 left-3 flex flex-col gap-1">
          {settings?.showRating && (
            <div className="bg-white/90 backdrop-blur px-2 py-1 rounded-lg flex gap-1 items-center shadow-sm">
               {[...Array(5)].map((_, i) => (
                 <span key={`star-${i}`} className={`text-xs ${i < recipe.rating ? 'text-natural-accent' : 'text-natural-accent/30'}`}>★</span>
               ))}
            </div>
          )}
          {settings?.showCalories && recipe.calories > 0 && (
            <div className="bg-white/90 backdrop-blur px-2 py-1 rounded-lg flex gap-1.5 items-center shadow-sm text-[10px] font-black text-natural-primary">
               <Flame className="w-3 h-3 text-natural-primary" />
               {recipe.calories} kcal
            </div>
          )}
          {settings?.showTime && recipe.prepTime > 0 && (
            <div className="bg-white/90 backdrop-blur px-2 py-1 rounded-lg flex gap-1.5 items-center shadow-sm text-[10px] font-black text-natural-accent">
               <Clock className="w-3 h-3 text-natural-accent" />
               {recipe.prepTime} min
            </div>
          )}
        </div>
        <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-0">
          <button 
            type="button"
            onClick={(e) => { 
              e.preventDefault();
              e.stopPropagation(); 
              onEdit(); 
            }} 
            className="p-3 bg-white/90 backdrop-blur rounded-full text-blue-600 shadow-xl hover:bg-white transition-all hover:scale-110 active:scale-95" 
            title="Bearbeiten"
          >
            <Edit3 className="w-5 h-5" />
          </button>
          <button 
            type="button"
            onClick={(e) => { 
              e.preventDefault();
              e.stopPropagation(); 
              onDelete(e); 
            }} 
            className="p-3 bg-white/90 backdrop-blur rounded-full text-red-600 shadow-xl hover:bg-white transition-all hover:scale-110 active:scale-95" 
            title="Löschen"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="px-1 flex flex-col flex-1">
        <h3 className="text-sm md:text-lg font-sans text-natural-text mb-auto leading-tight line-clamp-2">{recipe.name}</h3>

        <div className="flex gap-1.5 md:gap-2 mt-3 md:mt-4">
          <button 
            onClick={(e) => { e.stopPropagation(); onOpenDetail(); }}
            className="flex-1 flex items-center justify-center gap-1 md:gap-2 py-1.5 md:py-2 rounded-full bg-natural-primary text-white text-[10px] md:text-xs font-medium hover:opacity-90 transition-opacity shadow-sm"
          >
            Ansehen
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onAddShopping(); }}
            className="p-2 md:p-3 rounded-full bg-natural-bg text-natural-primary hover:bg-white transition-colors border border-transparent shadow-sm"
            title="Auf Einkaufsliste"
          >
            <ShoppingCart className="w-4 h-4 md:w-5 h-5" />
          </button>
        </div>

        <AnimatePresence>
          {showDetails && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-4 pt-4 border-t border-natural-bg overflow-hidden"
            >
              <div className="space-y-4">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-natural-accent mb-2">Zutaten</h4>
                  <ul className="grid grid-cols-1 gap-1.5">
                    {recipe.ingredients.map((ing, idx) => (
                      <li key={`ing-${idx}`} className="text-xs text-natural-text flex items-center gap-2 bg-natural-bg/30 p-1.5 rounded-lg">
                        <div className="w-6 h-6 flex items-center justify-center bg-white rounded-md shadow-sm text-natural-primary/70">
                          {getIngredientIcon(ing.name, mappings)}
                        </div>
                        <span className="font-semibold">{ing.amount} {ing.unit}</span>
                        <span className="opacity-80">{ing.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-natural-accent mb-2">Zubereitung</h4>
                  <p className="text-xs text-natural-text opacity-80 whitespace-pre-wrap leading-relaxed">{recipe.description}</p>
                </div>
                {recipe.originalLink && (
                  <a 
                    href={recipe.originalLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-[10px] font-bold text-natural-primary hover:underline uppercase tracking-wider"
                  >
                    Original Rezept <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function ChefHat(props: any) {
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
      <path d="M6 13.8V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8.8" />
      <path d="M12 2v20" />
      <path d="M18 17H6a4 4 0 0 0-4 4 1 1 0 0 0 1 1h18a1 1 0 0 0 1-1 4 4 0 0 0-4-4Z" />
    </svg>
  );
}

function SettingToggle({ label, active, onChange, icon }: { label: string, active: boolean, onChange: (val: boolean) => void, icon?: React.ReactNode }) {
  return (
    <button 
      onClick={() => onChange(!active)}
      className={`flex items-center gap-2 px-3 py-2 rounded-full border transition-all shrink-0 active:scale-95 ${
        active 
          ? 'bg-natural-accent border-natural-accent text-white shadow-sm' 
          : 'bg-white border-[#F1EDE8] text-natural-primary/60 hover:border-natural-accent/30'
      }`}
    >
      <div className={`w-3 h-3 flex items-center justify-center ${active ? 'text-white' : 'text-natural-accent'}`}>
        {icon}
      </div>
      <span className="text-[10px] font-black uppercase tracking-widest leading-none">
        {label}
      </span>
    </button>
  );
}
