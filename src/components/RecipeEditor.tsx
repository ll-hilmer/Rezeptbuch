import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RecipeService } from '../services/RecipeService';
import { RecipeType, Ingredient } from '../types';
import { Plus, Trash2, Save, X, ImageIcon, Star, Clock, Calendar as CalendarIcon, Info, Utensils, Sparkles, Flame, Wheat, Disc, Cloud, Wind } from 'lucide-react';
import { motion } from 'motion/react';
import { compressImage } from '../lib/images';
import { getIngredientIcon, useIngredientIcons } from '../lib/ingredient-icons';
import RichTextEditor from './RichTextEditor';
import { Controller } from 'react-hook-form';

const ingredientSchema = z.object({
  name: z.string().min(1, "Name erforderlich"),
  amount: z.string(),
  unit: z.string()
});

const stepSchema = z.object({
  description: z.string().min(1, "Beschreibung erforderlich"),
  duration: z.any().optional(),
  ingredientIndices: z.array(z.number()).optional(),
  stepIngredients: z.array(z.object({
    index: z.number(),
    amount: z.string().optional()
  })).optional()
});

const recipeSchema = z.object({
  name: z.string().min(1, "Name erforderlich"),
  rating: z.any().optional(),
  carbs: z.array(z.string()).optional(),
  type: z.array(z.string()).optional(),
  method: z.array(z.string()).optional(),
  description: z.string().optional(),
  originalLink: z.string().url("Muss eine gültige URL sein").or(z.string().length(0)).optional(),
  calories: z.any().optional(),
  nutritionalProtein: z.any().optional(),
  nutritionalCarbs: z.any().optional(),
  nutritionalFat: z.any().optional(),
  prepTime: z.any().optional(),
  difficulty: z.enum(['Einfach', 'Mittel', 'Schwer']).optional(),
  status: z.enum(['Neu', 'Ausprobieren', 'Ausprobiert']).optional(),
  ingredients: z.array(ingredientSchema).optional(),
  steps: z.array(stepSchema).optional(),
  images: z.array(z.string()).max(10).optional(),
  plannedDates: z.array(z.string()).optional()
});

type RecipeFormData = z.infer<typeof recipeSchema>;

interface RecipeEditorProps {
  recipeId: string | null;
  onSaved: () => void;
}

export default function RecipeEditor({ recipeId, onSaved }: RecipeEditorProps) {
  const mappings = useIngredientIcons();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [newImage, setNewImage] = useState('');
  const [newDate, setNewDate] = useState('');

  const { register, control, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<RecipeFormData>({
    resolver: zodResolver(recipeSchema),
    defaultValues: {
      name: '',
      rating: 0,
      carbs: [],
      type: [],
      method: [],
      description: '',
      originalLink: '',
      calories: 0,
      nutritionalProtein: 0,
      nutritionalCarbs: 0,
      nutritionalFat: 0,
      prepTime: 20,
      difficulty: 'Einfach',
      status: 'Neu',
      ingredients: [],
      steps: [],
      images: [],
      plannedDates: []
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "ingredients"
  });

  const autoDetectIngredients = (stepIndex: number) => {
    const currentSteps = watch('steps') || [];
    const stepDescription = currentSteps[stepIndex]?.description || '';
    if (!stepDescription) return;

    // Strip HTML for searching
    const plainText = stepDescription.replace(/<[^>]*>?/gm, '').toLowerCase();
    const allIngredients = watch('ingredients') || [];
    
    const detected: { index: number, amount: string }[] = [];
    allIngredients.forEach((ing, i) => {
      if (!ing.name) return;
      const ingName = ing.name.toLowerCase();
      // Look for name or parts of it
      if (plainText.includes(ingName) || ingName.split(' ').some(word => word.length > 3 && plainText.includes(word))) {
        detected.push({ index: i, amount: ing.amount });
      }
    });

    if (detected.length > 0) {
      // Merge with existing or replace? User asked for "ausgewählt werden", so we select them.
      const currentStepIngredients = currentSteps[stepIndex].stepIngredients || [];
      const merged = [...currentStepIngredients];
      
      detected.forEach(d => {
        if (!merged.find(m => m.index === d.index)) {
          merged.push(d);
        }
      });
      
      setValue(`steps.${stepIndex}.stepIngredients`, merged);
    }
  };

  const { fields: stepFields, append: appendStep, remove: removeStep } = useFieldArray({
    control,
    name: "steps"
  });

  const images = watch('images') || [];
  const plannedDates = watch('plannedDates') || [];

  useEffect(() => {
    if (recipeId) {
      setFetching(true);
      const fetchRecipe = async () => {
        try {
          const data: any = await RecipeService.getRecipe(recipeId);
          if (data) {
            reset({
              rating: 0,
              status: 'Neu',
              difficulty: 'Mittel',
              calories: 0,
              nutritionalProtein: 0,
              nutritionalCarbs: 0,
              nutritionalFat: 0,
              prepTime: 20,
              description: '',
              originalLink: '',
              ...data,
              carbs: Array.isArray(data.carbs) ? data.carbs : [],
              type: Array.isArray(data.type) ? data.type : (data.type ? [data.type] : []),
              method: Array.isArray(data.method) ? data.method : (data.method ? [data.method] : []),
              images: data.images || [],
              plannedDates: data.plannedDates || [],
              ingredients: Array.isArray(data.ingredients) ? data.ingredients : [{ name: '', amount: '', unit: '' }],
              steps: Array.isArray(data.steps) ? data.steps : [{ description: '', duration: 0 }],
            } as any);
          }
        } catch (error) {
          console.error('Rezept konnte nicht geladen werden:', error);
        } finally {
          setFetching(false);
        }
      };
      fetchRecipe();
    } else {
      reset();
    }
  }, [recipeId, reset]);

  const parseGermanNumber = (value: string | number | undefined): number => {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') return value;
    // Replace comma with dot and parse
    const normalized = value.toString().replace(/,/g, '.');
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  };

  const onSubmit = async (data: RecipeFormData) => {
    setLoading(true);
    try {
      // Process numeric values and ensure arrays exist
      const processedData = {
        ...data,
        carbs: data.carbs || [],
        type: data.type || [],
        method: data.method || [],
        ingredients: data.ingredients || [],
        images: data.images || [],
        plannedDates: data.plannedDates || [],
        rating: parseGermanNumber(data.rating),
        calories: parseGermanNumber(data.calories),
        nutritionalProtein: parseGermanNumber(data.nutritionalProtein),
        nutritionalCarbs: parseGermanNumber(data.nutritionalCarbs),
        nutritionalFat: parseGermanNumber(data.nutritionalFat),
        prepTime: parseGermanNumber(data.prepTime),
        steps: data.steps?.map(step => ({
          ...step,
          duration: parseGermanNumber(step.duration)
        })) || []
      };

      if (recipeId) {
        await RecipeService.updateRecipe(recipeId, processedData as any);
      } else {
        await RecipeService.addRecipe(processedData as any);
      }
      onSaved();
    } catch (error) {
      console.error("Save Error:", String(error));
      let displayMessage = error instanceof Error ? error.message : String(error);
      
      // Versuche den JSON-Fehler zu parsen für eine bessere Anzeige
      try {
        const parsedError = JSON.parse(displayMessage);
        if (parsedError.error) {
          displayMessage = parsedError.error;
        }
      } catch {
        // Nicht JSON, bleibe bei der Original-Nachricht
      }

      alert('Fehler beim Speichern: ' + displayMessage);
    } finally {
      setLoading(false);
    }
  };

  const onInvalid = (errors: any) => {
    const details: string[] = [];
    
    const flattenErrors = (obj: any, prefix = '') => {
      Object.entries(obj).forEach(([key, value]: [string, any]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && value.message) {
          details.push(`${path}: ${value.message}`);
        } else if (value && typeof value === 'object') {
          flattenErrors(value, path);
        }
      });
    };

    flattenErrors(errors);
    
    console.error("Validation Errors Details:", details);
    alert("Bitte überprüfe deine Eingaben. Folgende Felder sind fehlerhaft:\n\n" + 
      (details.length > 0 ? details.join('\n') : "Unbekannter Validierungsfehler"));
  };

  const addImage = () => {
    if (newImage && images.length < 10) {
      setValue('images', [...images, newImage]);
      setNewImage('');
    }
  };

  const removeImage = (index: number) => {
    setValue('images', images.filter((_, i) => i !== index));
  };

  const addDate = () => {
    if (newDate) {
      setValue('plannedDates', [...plannedDates, newDate].sort());
      setNewDate('');
    }
  };

  const removeDate = (index: number) => {
    setValue('plannedDates', plannedDates.filter((_, i) => i !== index));
  };

  const handleLocalUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      compressImage(file).then((dataUrl) => {
        if (images.length < 10) {
          setValue('images', [...images, dataUrl]);
        }
      });
    }
  };

  if (fetching) return <div className="py-20 text-center">Rezept wird geladen...</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-4xl font-serif font-bold italic text-natural-primary">
            {recipeId ? 'Rezept bearbeiten' : 'Neues Rezept'}
          </h2>
        </div>
        <button onClick={onSaved} className="p-2 text-natural-primary opacity-60 hover:opacity-100 transition-opacity">
          <X className="w-6 h-6" />
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-8 pb-10">
        {/* Basic Info Card */}
        <div className="bg-white p-8 rounded-[40px] shadow-sm space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-6 bg-natural-accent rounded-full" />
                <label style={{ fontFamily: 'Verdana, sans-serif' }} className="text-[9px] font-black tracking-[0.2em] text-natural-primary">Name & Status</label>
              </div>
              <div className="space-y-4">
                <input 
                  {...register('name')}
                  placeholder="Rezeptname..."
                  className="w-full px-0 py-2 bg-transparent border-b-2 border-natural-bg focus:border-natural-accent transition-all font-serif italic text-3xl outline-none"
                />
                {errors.name && <p style={{ fontFamily: 'Verdana, sans-serif' }} className="text-red-500 text-[9px] font-bold">{errors.name.message}</p>}
                
                <div className="grid grid-cols-3 gap-2 pt-2">
                  {['Neu', 'Ausprobieren', 'Ausprobiert'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setValue('status', s as any)}
                      style={{ fontFamily: 'Verdana, sans-serif' }}
                      className={`py-3 px-1 rounded-2xl text-[9px] font-black tracking-tight transition-all ${
                        watch('status') === s 
                          ? 'bg-natural-primary text-white shadow-lg' 
                          : 'bg-natural-bg text-natural-primary opacity-40 hover:opacity-100'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <label style={{ fontFamily: 'Verdana, sans-serif' }} className="text-[9px] font-black tracking-[0.2em] text-natural-primary opacity-30 px-1">Bewertung & Kategorien</label>
              <div className="space-y-6">
                <div className="flex items-center justify-between bg-natural-bg/30 p-4 rounded-2xl">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setValue('rating', star)}
                        className={`p-1 transition-transform active:scale-125 ${watch('rating') >= star ? 'text-natural-accent' : 'text-gray-200'}`}
                      >
                        <Star className={`w-6 h-6 ${watch('rating') >= star ? 'fill-current' : ''}`} />
                      </button>
                    ))}
                  </div>
                  <span className="text-xs font-black text-natural-primary opacity-30">{watch('rating')} / 5</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {['Highlight', 'Thermomix', 'Ofen', 'Pfannengericht', 'Saucen', 'Airfryer', 'Snacks', 'Beilagen'].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        const currentVal = watch('method');
                        const current = Array.isArray(currentVal) ? currentVal : [];
                        const next = current.includes(m) 
                          ? current.filter(item => item !== m) 
                          : [...current, m];
                        setValue('method', next);
                      }}
                      style={{ fontFamily: 'Verdana, sans-serif' }}
                      className={`px-3 py-1.5 rounded-full text-[9px] font-bold tracking-tight transition-all ${
                        (Array.isArray(watch('method')) && watch('method').includes(m))
                          ? 'bg-natural-accent text-white shadow-sm'
                          : 'bg-white text-natural-text border border-natural-bg hover:border-natural-accent/20'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <label style={{ fontFamily: 'Verdana, sans-serif' }} className="text-[9px] font-black tracking-[0.2em] text-natural-primary opacity-30 px-1">Basis & Carbs</label>
              <div className="space-y-6">
                <div className="flex items-center justify-between py-3 border-b border-natural-bg px-2">
                  {Object.values(RecipeType).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        const currentVal = watch('type');
                        const current = Array.isArray(currentVal) ? currentVal : [];
                        const next = current.includes(t) 
                          ? current.filter(item => item !== t) 
                          : [...current, t];
                        setValue('type', next);
                      }}
                      className={`flex flex-col items-center gap-2.5 transition-all group shrink-0 ${
                        (Array.isArray(watch('type')) && watch('type').includes(t))
                          ? 'text-natural-accent'
                          : 'text-natural-primary/20 hover:text-natural-primary/40'
                      }`}
                    >
                      <div className={`w-14 h-14 flex items-center justify-center rounded-2xl transition-all group-hover:scale-105 p-3.5 ${ (Array.isArray(watch('type')) && watch('type').includes(t)) ? 'bg-natural-accent/10' : 'bg-natural-bg' }`}>
                        <div className="w-full h-full">
                          {getIngredientIcon(t, mappings)}
                        </div>
                      </div>
                      <span style={{ fontFamily: 'Verdana, sans-serif' }} className="text-[9px] font-bold tracking-tight">{t}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between py-3 px-2">
                  {['Kartoffeln', 'Reis', 'Nudeln'].map(carb => (
                    <button
                      key={carb}
                      type="button"
                      onClick={() => {
                        const currentVal = watch('carbs');
                        const current = Array.isArray(currentVal) ? currentVal : [];
                        const next = current.includes(carb) 
                          ? current.filter(c => c !== carb) 
                          : [...current, carb];
                        setValue('carbs', next);
                      }}
                      className={`flex flex-col items-center gap-2.5 transition-all group shrink-0 ${
                        (Array.isArray(watch('carbs')) && watch('carbs').includes(carb))
                          ? 'text-natural-accent'
                          : 'text-natural-primary/20 hover:text-natural-primary/40'
                      }`}
                    >
                      <div className={`w-14 h-14 flex items-center justify-center rounded-2xl transition-all group-hover:scale-105 p-3.5 ${ (Array.isArray(watch('carbs')) && watch('carbs').includes(carb)) ? 'bg-natural-accent/10' : 'bg-natural-bg' }`}>
                        <div className="w-full h-full">
                          {getIngredientIcon(carb, mappings)}
                        </div>
                      </div>
                      <span style={{ fontFamily: 'Verdana, sans-serif' }} className="text-[9px] font-bold tracking-tight">{carb}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats bar */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 bg-natural-bg/20 p-6 rounded-[32px]">
            <div className="space-y-1.5 px-2">
              <div className="flex items-center gap-2 opacity-40">
                <Clock className="w-3.5 h-3.5" />
                <label style={{ fontFamily: 'Verdana, sans-serif' }} className="text-[9px] font-black tracking-tight">Dauer</label>
              </div>
              <div className="flex items-baseline gap-1">
                <input 
                  type="text"
                  {...register('prepTime')}
                  className="w-12 bg-transparent border-none p-0 focus:ring-0 outline-none text-xl font-bold text-natural-text"
                  placeholder="20"
                />
                <span className="text-[11px] font-bold opacity-30">min</span>
              </div>
            </div>

            <div className="space-y-1.5 px-2">
              <div className="flex items-center gap-2 opacity-40">
                <Flame className="w-3.5 h-3.5" />
                <label style={{ fontFamily: 'Verdana, sans-serif' }} className="text-[9px] font-black tracking-tight">Kalorien</label>
              </div>
              <div className="flex items-baseline gap-1">
                <input 
                  type="text"
                  {...register('calories')}
                  className="w-16 bg-transparent border-none p-0 focus:ring-0 outline-none text-xl font-bold text-natural-text"
                  placeholder="450"
                />
              </div>
            </div>

            <div className="space-y-1.5 px-2">
              <div className="flex items-center gap-2 opacity-40 text-blue-600">
                <Utensils className="w-3.5 h-3.5" />
                <label style={{ fontFamily: 'Verdana, sans-serif' }} className="text-[9px] font-black tracking-tight">Protein</label>
              </div>
              <div className="flex items-baseline gap-1">
                <input 
                  type="text"
                  {...register('nutritionalProtein')}
                  className="w-12 bg-transparent border-none p-0 focus:ring-0 outline-none text-xl font-bold text-natural-text"
                  placeholder="20"
                />
                <span className="text-[11px] font-bold opacity-30">g</span>
              </div>
            </div>

            <div className="space-y-1.5 px-2">
              <div className="flex items-center gap-2 opacity-40 text-orange-600">
                <Wheat className="w-3.5 h-3.5" />
                <label style={{ fontFamily: 'Verdana, sans-serif' }} className="text-[9px] font-black tracking-tight">Carbs</label>
              </div>
              <div className="flex items-baseline gap-1">
                <input 
                  type="text"
                  {...register('nutritionalCarbs')}
                  className="w-12 bg-transparent border-none p-0 focus:ring-0 outline-none text-xl font-bold text-natural-text"
                  placeholder="50"
                />
                <span className="text-[11px] font-bold opacity-30">g</span>
              </div>
            </div>

            <div className="space-y-1.5 px-2">
              <div className="flex items-center gap-2 opacity-40 text-red-600">
                <Utensils className="w-3.5 h-3.5" />
                <label style={{ fontFamily: 'Verdana, sans-serif' }} className="text-[9px] font-black tracking-tight">Fett</label>
              </div>
              <div className="flex items-baseline gap-1">
                <input 
                  type="text"
                  {...register('nutritionalFat')}
                  className="w-12 bg-transparent border-none p-0 focus:ring-0 outline-none text-xl font-bold text-natural-text"
                  placeholder="15"
                />
                <span className="text-[11px] font-bold opacity-30">g</span>
              </div>
            </div>

            <div className="space-y-1.5 px-2">
              <div className="flex items-center gap-2 opacity-40">
                <Sparkles className="w-3.5 h-3.5" />
                <label style={{ fontFamily: 'Verdana, sans-serif' }} className="text-[9px] font-black tracking-tight">Stufe</label>
              </div>
              <select 
                {...register('difficulty')}
                className="w-full bg-transparent border-none p-0 focus:ring-0 outline-none text-base font-bold text-natural-text appearance-none cursor-pointer"
              >
                <option value="Einfach">Einfach</option>
                <option value="Mittel">Mittel</option>
                <option value="Schwer">Schwer</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label style={{ fontFamily: 'Verdana, sans-serif' }} className="text-[9px] font-black tracking-[0.2em] text-natural-primary opacity-30">Original Rezept Link</label>
            <input 
              {...register('originalLink')}
              placeholder="https://..."
              className="w-full px-5 py-3 bg-natural-bg/30 border border-natural-bg rounded-2xl focus:ring-2 focus:ring-natural-accent/20 outline-none text-sm italic opacity-60 focus:opacity-100 transition-all"
            />
            {errors.originalLink && <p className="text-red-500 text-xs">{errors.originalLink.message}</p>}
          </div>
        </div>

        {/* Ingredients Card */}
        <div className="bg-white p-8 rounded-[32px] shadow-sm space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xl font-serif text-natural-text">Zutaten</h3>
            <button
              type="button"
              onClick={() => append({ name: '', amount: '', unit: '' })}
              style={{ fontFamily: 'Verdana, sans-serif' }}
              className="flex items-center gap-2 text-[9px] font-bold tracking-tight text-natural-accent hover:opacity-80"
            >
              <Plus className="w-4 h-4" /> hinzufügen
            </button>
          </div>
          
          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-2 items-start">
                <div className="w-10 h-10 bg-natural-bg rounded-xl flex items-center justify-center text-natural-primary/60 p-2 overflow-hidden shrink-0 mt-0.5">
                  {getIngredientIcon(watch(`ingredients.${index}.name` as const) || '', mappings)}
                </div>
                <input 
                  {...register(`ingredients.${index}.amount` as const)}
                  placeholder="Menge"
                  className="w-20 px-3 py-2.5 bg-natural-bg border-none rounded-xl focus:ring-2 focus:ring-natural-primary/20 text-sm outline-none"
                />
                <input 
                  {...register(`ingredients.${index}.unit` as const)}
                  placeholder="Einheit"
                  className="w-24 px-3 py-2.5 bg-natural-bg border-none rounded-xl focus:ring-2 focus:ring-natural-primary/20 text-sm outline-none"
                />
                <input 
                  {...register(`ingredients.${index}.name` as const)}
                  placeholder="Zutat"
                  className="flex-1 px-3 py-2.5 bg-natural-bg border-none rounded-xl focus:ring-2 focus:ring-natural-primary/20 text-sm outline-none"
                />
                {fields.length > 1 && (
                  <button type="button" onClick={() => remove(index)} className="p-2.5 text-natural-accent/40 hover:text-natural-accent transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Steps Card */}
        <div className="bg-white p-8 rounded-[32px] shadow-sm space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xl font-serif text-natural-text">Kochschritte</h3>
            <button
              type="button"
              onClick={() => appendStep({ description: '', duration: 0, ingredientIndices: [] })}
              style={{ fontFamily: 'Verdana, sans-serif' }}
              className="flex items-center gap-2 text-[9px] font-bold tracking-tight text-natural-accent hover:opacity-80"
            >
              <Plus className="w-4 h-4" /> Schritt hinzufügen
            </button>
          </div>
          
          <div className="space-y-4">
            {stepFields.map((field, index) => (
              <div key={field.id} className="space-y-2 p-4 bg-natural-bg/50 rounded-2xl relative group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span style={{ fontFamily: 'Verdana, sans-serif' }} className="text-[9px] font-bold text-natural-primary opacity-40">Schritt {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => autoDetectIngredients(index)}
                      style={{ fontFamily: 'Verdana, sans-serif' }}
                      className="text-[9px] font-black text-natural-accent hover:opacity-100 opacity-60 transition-all flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" /> Zutaten erkennen
                    </button>
                  </div>
                  {stepFields.length > 1 && (
                    <button type="button" onClick={() => removeStep(index)} className="text-natural-accent/40 hover:text-natural-accent transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Controller
                    control={control}
                    name={`steps.${index}.description` as const}
                    render={({ field }) => (
                      <RichTextEditor 
                        value={field.value} 
                        onChange={field.onChange}
                        placeholder="Beschreibe diesen Schritt..."
                      />
                    )}
                  />
                  <div className="w-full flex items-center justify-end">
                    <label style={{ fontFamily: 'Verdana, sans-serif' }} className="text-[9px] font-bold text-natural-primary opacity-40">Timer (Sek.)</label>
                    <input 
                      type="text"
                      {...register(`steps.${index}.duration` as const)}
                      placeholder="0"
                      className="w-full px-3 py-2.5 bg-white border-none rounded-xl focus:ring-2 focus:ring-natural-primary/20 text-sm outline-none"
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <label style={{ fontFamily: 'Verdana, sans-serif' }} className="text-[9px] font-bold text-natural-primary opacity-40">Zutaten für diesen Schritt</label>
                  <div className="flex flex-col gap-2">
                    {watch('ingredients')?.map((ing, iIdx) => {
                      const currentSteps = watch('steps') || [];
                      const stepIngredients = currentSteps[index].stepIngredients || [];
                      const activeIng = stepIngredients.find(si => si.index === iIdx);
                      
                      return (
                        <div key={iIdx} className="flex gap-2 items-center">
                          <button
                            type="button"
                            onClick={() => {
                              const nextStepIngredients = activeIng
                                ? stepIngredients.filter(si => si.index !== iIdx)
                                : [...stepIngredients, { index: iIdx, amount: ing.amount }];
                              setValue(`steps.${index}.stepIngredients`, nextStepIngredients);
                            }}
                            style={{ fontFamily: 'Verdana, sans-serif' }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[9px] font-bold transition-all flex-1 ${
                              activeIng
                                ? 'bg-natural-accent text-white shadow-sm'
                                : 'bg-white text-natural-primary/60 border border-natural-bg'
                            }`}
                          >
                            <div className="w-4 h-4">
                              {getIngredientIcon(ing.name, mappings)}
                            </div>
                            <span className="flex-1 text-left">{ing.name}</span>
                            <span className="opacity-60">({ing.amount} {ing.unit})</span>
                          </button>
                          
                          {activeIng && (
                            <div className="flex items-center gap-2">
                              <input 
                                type="text"
                                value={activeIng.amount || ''}
                                onChange={(e) => {
                                  const nextStepIngredients = stepIngredients.map(si => 
                                    si.index === iIdx ? { ...si, amount: e.target.value } : si
                                  );
                                  setValue(`steps.${index}.stepIngredients`, nextStepIngredients);
                                }}
                                placeholder="Menge..."
                                className="w-20 bg-natural-bg border-none rounded-xl px-3 py-1.5 text-[10px] outline-none"
                              />
                              <span style={{ fontFamily: 'Verdana, sans-serif' }} className="text-[9px] font-bold opacity-40 whitespace-nowrap">{ing.unit}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Description & Planning */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded-3xl border border-[#e9e4df] shadow-sm space-y-4">
            <h3 className="text-lg font-serif font-bold text-[#2c1810]">Beschreibung</h3>
            <Controller
              control={control}
              name="description"
              render={({ field }) => (
                <RichTextEditor 
                  value={field.value} 
                  onChange={field.onChange}
                  placeholder="Erzähle, wie man das Rezept zubereitet..."
                />
              )}
            />
          </div>

          <div className="space-y-8">
             <div className="bg-white p-6 rounded-3xl border border-[#e9e4df] shadow-sm space-y-4">
              <h3 className="text-lg font-serif font-bold text-[#2c1810]">Planung</h3>
              <div className="flex gap-2">
                <input 
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="flex-1 px-4 py-2 bg-gray-50 border border-[#e9e4df] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5c4033]/20 outline-none"
                />
                <button type="button" onClick={addDate} className="p-2 bg-[#5c4033] text-white rounded-xl">
                  <Plus className="w-6 h-6" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {plannedDates.map((date, idx) => (
                  <div key={idx} style={{ fontFamily: 'Verdana, sans-serif' }} className="flex items-center gap-2 bg-[#fdfcfb] px-3 py-1.5 rounded-full border border-[#e9e4df] text-[9px] font-semibold text-[#8b5a2b]">
                    <CalendarIcon className="w-3 h-3" />
                    {new Date(date).toLocaleDateString('de-DE')}
                    <button type="button" onClick={() => removeDate(idx)} className="text-red-400 hover:text-red-600">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-[#e9e4df] shadow-sm space-y-6">
              <div className="space-y-2">
                <h3 className="text-lg font-serif font-bold text-[#2c1810]">Bilder hinzufügen</h3>
                <p className="text-[10px] text-natural-text/60 italic">Tipp: Lade Bilder für Desktop und Mobil hoch für beste Qualität auf allen Geräten.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Desktop Image Slot */}
                <div className="space-y-3">
                  <span className="text-[9px] font-black uppercase tracking-widest text-natural-accent">Desktop Bild (1)</span>
                  <div className="relative aspect-video rounded-2xl overflow-hidden bg-natural-bg border-2 border-dashed border-natural-primary/10 group">
                    {images[0] ? (
                      <>
                        <img src={images[0]} className="w-full h-full object-cover" />
                        <button 
                          type="button" 
                          onClick={() => removeImage(0)}
                          className="absolute inset-0 bg-red-600/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                        >
                          <Trash2 className="w-6 h-6" />
                        </button>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                        <ImageIcon className="w-8 h-8 text-natural-primary/20 mb-2" />
                        <input 
                          type="file" 
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              compressImage(file).then((dataUrl) => {
                                const current = [...images];
                                current[0] = dataUrl;
                                setValue('images', current);
                              });
                            }
                          }}
                          className="hidden"
                          id="desktop-upload"
                        />
                        <label 
                          htmlFor="desktop-upload"
                          className="text-[9px] font-bold text-natural-primary/60 cursor-pointer hover:text-natural-accent transition-colors"
                        >
                          KLICKEN ZUM HOCHLADEN
                        </label>
                      </div>
                    )}
                  </div>
                  <input 
                    type="text"
                    placeholder="Oder URL..."
                    className="w-full px-3 py-2 bg-natural-bg border-none rounded-xl text-[10px] outline-none"
                    value={images[0] || ''}
                    onChange={(e) => {
                      const current = [...images];
                      current[0] = e.target.value;
                      setValue('images', current);
                    }}
                  />
                </div>

                {/* Mobile Image Slot */}
                <div className="space-y-3">
                  <span className="text-[9px] font-black uppercase tracking-widest text-natural-accent">Mobil Bild (2)</span>
                  <div className="relative aspect-video rounded-2xl overflow-hidden bg-natural-bg border-2 border-dashed border-natural-primary/10 group">
                    {images[1] ? (
                      <>
                        <img src={images[1]} className="w-full h-full object-cover" />
                        <button 
                          type="button" 
                          onClick={() => removeImage(1)}
                          className="absolute inset-0 bg-red-600/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                        >
                          <Trash2 className="w-6 h-6" />
                        </button>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                        <ImageIcon className="w-8 h-8 text-natural-primary/20 mb-2" />
                        <input 
                          type="file" 
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              compressImage(file).then((dataUrl) => {
                                const current = [...images];
                                current[1] = dataUrl;
                                setValue('images', current);
                              });
                            }
                          }}
                          className="hidden"
                          id="mobile-upload"
                        />
                        <label 
                          htmlFor="mobile-upload"
                          className="text-[9px] font-bold text-natural-primary/60 cursor-pointer hover:text-natural-accent transition-colors"
                        >
                          KLICKEN ZUM HOCHLADEN
                        </label>
                      </div>
                    )}
                  </div>
                  <input 
                    type="text"
                    placeholder="Oder URL..."
                    className="w-full px-3 py-2 bg-natural-bg border-none rounded-xl text-[10px] outline-none"
                    value={images[1] || ''}
                    onChange={(e) => {
                      const current = [...images];
                      current[1] = e.target.value;
                      setValue('images', current);
                    }}
                  />
                </div>
              </div>

              {/* Additional Images */}
              {images.length > 2 && (
                <div className="pt-4 border-t border-natural-bg">
                  <span className="text-[9px] font-black uppercase tracking-widest text-natural-primary/40 mb-3 block">Weitere Bilder</span>
                  <div className="grid grid-cols-4 gap-2">
                    {images.slice(2).map((url, idx) => (
                      <div key={idx} className="relative aspect-square rounded-xl overflow-hidden group border border-natural-bg">
                        <img src={url} className="w-full h-full object-cover" />
                        <button 
                          type="button" 
                          onClick={() => removeImage(idx + 2)}
                          className="absolute inset-0 bg-red-600/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-4 pt-4 sticky bottom-4 z-10 md:static">
          <button
            type="button"
            onClick={onSaved}
            className="px-10 py-4 rounded-full bg-white text-natural-text font-bold shadow-sm hover:bg-natural-bg transition-colors"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-12 py-4 rounded-full bg-natural-accent text-white font-bold shadow-lg shadow-natural-accent/20 hover:opacity-90 disabled:opacity-50 transition-all transform active:scale-95"
            id="save-recipe-btn"
          >
            {loading ? <span className="animate-spin text-lg">⏳</span> : <Plus className="w-5 h-5" />}
            Rezept speichern
          </button>
        </div>
      </form>
    </div>
  );
}
