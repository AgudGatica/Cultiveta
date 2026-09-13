import React from 'react';
import { LayoutDashboard, Sprout, Plus, Calculator, Sparkles } from 'lucide-react';

interface MobileNavProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenQuickAction: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  currentView,
  onNavigate,
  onOpenQuickAction,
}) => {
  return (
    <nav
      id="mobile-bottom-nav"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0F0F0F]/95 backdrop-blur-xl border-t border-zinc-800 px-3 py-2 flex items-center justify-around shadow-2xl"
    >
      {/* 1. Inicio */}
      <button
        type="button"
        id="mobile-nav-home"
        onClick={() => onNavigate('dashboard')}
        className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 rounded-xl transition-colors cursor-pointer ${
          currentView === 'dashboard' ? 'text-emerald-400 font-bold' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <LayoutDashboard className="w-5 h-5" />
        <span className="text-[11px]">Inicio</span>
      </button>

      {/* 2. Cultivos */}
      <button
        type="button"
        id="mobile-nav-cultivations"
        onClick={() => onNavigate('cultivations')}
        className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 rounded-xl transition-colors cursor-pointer ${
          currentView === 'cultivations' || currentView === 'cultivation_detail'
            ? 'text-emerald-400 font-bold'
            : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <Sprout className="w-5 h-5" />
        <span className="text-[11px]">Cultivos</span>
      </button>

      {/* 3. Central Registrar Button */}
      <div className="relative -top-4">
        <button
          type="button"
          id="mobile-nav-quick-action-btn"
          onClick={onOpenQuickAction}
          className="w-13 h-13 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center shadow-lg shadow-emerald-500/20 transition-transform active:scale-95 cursor-pointer border-4 border-[#050505]"
          title="Registrar dato rápido"
        >
          <Plus className="w-6 h-6 stroke-[3]" />
        </button>
      </div>

      {/* 4. Calculadoras */}
      <button
        type="button"
        id="mobile-nav-calculators"
        onClick={() => onNavigate('calculators')}
        className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 rounded-xl transition-colors cursor-pointer ${
          currentView === 'calculators'
            ? 'text-emerald-400 font-bold'
            : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <Calculator className="w-5 h-5" />
        <span className="text-[11px]">VPD / Calcs</span>
      </button>

      {/* 5. Cultiveta IA */}
      <button
        type="button"
        id="mobile-nav-ai"
        onClick={() => onNavigate('ai_assistant')}
        className={`flex flex-col items-center justify-center gap-1 py-1 px-2.5 rounded-xl transition-colors cursor-pointer ${
          currentView === 'ai_assistant'
            ? 'text-violet-400 font-bold'
            : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        <Sparkles className="w-5 h-5" />
        <span className="text-[11px]">IA Gemini</span>
      </button>
    </nav>
  );
};

