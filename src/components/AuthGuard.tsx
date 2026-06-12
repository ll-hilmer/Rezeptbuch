import React, { useEffect, useState } from 'react';
import { auth, loginWithGoogle } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { LogIn, ChefHat } from 'lucide-react';
import { motion } from 'motion/react';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdfcfb]">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <ChefHat className="w-12 h-12 text-[#5c4033]" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-natural-bg px-4 text-center">
        <div className="p-4 bg-white rounded-[32px] shadow-sm mb-8">
          <ChefHat className="w-16 h-16 text-natural-primary" />
        </div>
        <h1 className="text-5xl font-serif font-bold italic text-natural-primary mb-2">GourmetPlaner</h1>
        <p className="text-sm opacity-60 uppercase tracking-widest mb-10 max-w-sm">
          Deine digitale Rezeptsammlung & Wochenplanung
        </p>
        <button
          onClick={loginWithGoogle}
          className="flex items-center gap-4 bg-natural-accent text-white px-10 py-4 rounded-full hover:opacity-90 transition-all shadow-xl shadow-natural-accent/20 font-bold active:scale-95"
          id="login-button"
        >
          <LogIn className="w-5 h-5" />
          Mit Google beginnen
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
