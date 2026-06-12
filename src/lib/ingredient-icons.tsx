import React, { useState, useEffect } from 'react';
import { 
  Wheat, Leaf, Fish, Beef, Egg, Milk, Apple, 
  Citrus, Carrot, Soup, Wine, Coffee, Flame, Droplets, Utensils,
  Disc, Wind, Cloud
} from 'lucide-react';
import { db } from './firebase';
import { collection, onSnapshot } from 'firebase/firestore';

const staticIcons: Record<string, React.ReactNode> = {
  'Wheat': <Wheat className="w-full h-full" />,
  'Leaf': <Leaf className="w-full h-full" />,
  'Fish': <Fish className="w-full h-full" />,
  'Beef': <Beef className="w-full h-full" />,
  'Egg': <Egg className="w-full h-full" />,
  'Milk': <Milk className="w-full h-full" />,
  'Apple': <Apple className="w-full h-full" />,
  'Citrus': <Citrus className="w-full h-full" />,
  'Carrot': <Carrot className="w-full h-full" />,
  'Soup': <Soup className="w-full h-full" />,
  'Wine': <Wine className="w-full h-full" />,
  'Coffee': <Coffee className="w-full h-full" />,
  'Flame': <Flame className="w-full h-full" />,
  'Droplets': <Droplets className="w-full h-full" />,
  'Utensils': <Utensils className="w-full h-full" />,
  'Disc': <Disc className="w-full h-full" />
};

export interface IconMapping {
  keyword: string;
  iconName?: string;
  url?: string;
  category?: string;
}

export const getIngredientIcon = (name: string, customMappings?: Record<string, IconMapping>) => {
  const n = name.toLowerCase();
  
  // 1. Check custom mappings from Firestore
  if (customMappings) {
    for (const [keyword, mapping] of Object.entries(customMappings)) {
      if (n.includes(keyword.toLowerCase())) {
        if (mapping.url) {
          return <img src={mapping.url} alt={name} className="w-full h-full object-cover rounded-md" referrerPolicy="no-referrer" />;
        }
        if (mapping.iconName) {
          return staticIcons[mapping.iconName] || staticIcons['Utensils'];
        }
      }
    }
  }

  // 2. Fallback to existing logic
  if (n.includes('kartoffel')) return <Disc className="w-full h-full" />;
  if (n.includes('nudeln') || n.includes('pasta') || n.includes('spaghetti')) return <Wind className="w-full h-full" />;
  if (n.includes('reis')) return <Cloud className="w-full h-full" />;
  if (n.includes('mehl') || n.includes('brot')) return staticIcons['Wheat'];
  if (n.includes('fleisch') || n.includes('rind') || n.includes('hähnchen') || n.includes('beef') || n.includes('schwein') || n.includes('wurst')) return staticIcons['Beef'];
  if (n.includes('fisch') || n.includes('lachs') || n.includes('thunfisch') || n.includes('garnele')) return staticIcons['Fish'];
  if (n.includes('ei')) return staticIcons['Egg'];
  if (n.includes('milch') || n.includes('sahne') || n.includes('joghur') || n.includes('käse') || n.includes('mozzarella') || n.includes('feta')) return staticIcons['Milk'];
  if (n.includes('apfel') || n.includes('birne') || n.includes('frucht')) return staticIcons['Apple'];
  if (n.includes('zitrone') || n.includes('orange') || n.includes('limette')) return staticIcons['Citrus'];
  if (n.includes('karotte') || n.includes('möhre')) return staticIcons['Carrot'];
  if (n.includes('tomate') || n.includes('gurke') || n.includes('spinat') || n.includes('zwiebel') || n.includes('knoblauch') || n.includes('paprika') || n.includes('salat') || n.includes('kräuter') || n.includes('dill') || n.includes('petersilie')) return staticIcons['Leaf'];
  if (n.includes('suppe') || n.includes('brühe')) return staticIcons['Soup'];
  if (n.includes('wein') || n.includes('bier') || n.includes('alkohol')) return staticIcons['Wine'];
  if (n.includes('kaffee') || n.includes('tee')) return staticIcons['Coffee'];
  if (n.includes('wasser') || n.includes('öl') || n.includes('essig')) return staticIcons['Droplets'];
  if (n.includes('scharf') || n.includes('chili') || n.includes('gewürz')) return staticIcons['Flame'];
  
  return staticIcons['Utensils'];
};

export const useIngredientIcons = () => {
  const [mappings, setMappings] = useState<Record<string, IconMapping>>({});

  useEffect(() => {
    return onSnapshot(collection(db, 'ingredientIcons'), (snapshot) => {
      const newMappings: Record<string, IconMapping> = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        newMappings[data.keyword] = {
          keyword: data.keyword,
          iconName: data.iconName,
          url: data.url,
          category: data.category
        };
      });
      setMappings(newMappings);
    });
  }, []);

  return mappings;
};

export const AVAILABLE_ICON_NAMES = Object.keys(staticIcons);
