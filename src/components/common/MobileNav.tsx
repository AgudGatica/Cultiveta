import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Sprout,
  Plus,
  Sparkles,
  MoreHorizontal,
  Dna,
  Scale,
  Calculator,
  X,
  Trophy,
} from 'lucide-react';

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
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Cerrar el menú "Más" al tocar fuera
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    if (isMoreMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isMoreMenuOpen]);

  const secondaryNavItems = [
    { id: 'profile', label: 'Mi perfil', icon: Trophy, desc: 'Tu nivel, tu racha y tus logros' },
    { id: 'genetics', label: 'Genéticas', icon: Dna, desc: 'Banco de semillas y cepas' },
    { id: 'compare_crops', label: 'Comparador', icon: Scale, desc: 'Curvas de cosechas anteriores' },
    { id: 'calculators', label: 'Calculadoras', icon: Calculator, desc: 'VPD, luz PPFD y mezclas' },
  ];

  const isSecondaryActive =
    secondaryNavItems.some((item) => item.id === currentView) || currentView === 'achievements';

  return (
    <>
      {/* Menú desplegable "Más" */}
      {isMoreMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-ink/30 backdrop-blur-xs flex flex-col justify-end">
          <div
            ref={moreMenuRef}
            className="bg-surface rounded-t-[32px] border-t border-black/10 p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-200"
          >
            <div className="flex items-center justify-between pb-2 border-b border-black/10">
              <span className="text-xs font-bold text-ink">Más herramientas</span>
              <button
                type="button"
                onClick={() => setIsMoreMenuOpen(false)}
                aria-label="Cerrar menú"
                className="min-h-11 min-w-11 flex items-center justify-center rounded-full hover:bg-track text-ink-muted cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {secondaryNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id || (item.id === 'profile' && currentView === 'achievements');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onNavigate(item.id);
                    }}
                    className={`flex items-center gap-3.5 p-3 rounded-2xl text-left transition-all cursor-pointer ${
                      isActive
                        ? 'bg-brand-deep text-white border border-brand-deep font-bold'
                        : 'bg-white hover:bg-track text-ink border border-black/10'
                    }`}
                  >
                    <div className="p-2 rounded-xl bg-icon-bg text-brand">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold block">{item.label}</span>
                      <span className="text-[10px] text-ink-muted block">{item.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Barra de navegación inferior móvil */}
      <nav
        id="mobile-bottom-nav"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-black/10 px-3 py-2 flex items-center justify-around shadow-lg"
      >
        {/* 1. Inicio */}
        <button
          type="button"
          id="mobile-nav-home"
          onClick={() => {
            setIsMoreMenuOpen(false);
            onNavigate('dashboard');
          }}
          className={`flex flex-col items-center justify-center gap-1 min-h-11 min-w-11 py-1 px-3 rounded-xl transition-colors cursor-pointer ${
            currentView === 'dashboard'
              ? 'bg-brand-deep text-white font-bold'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[11px]">Inicio</span>
        </button>

        {/* 2. Cultivos */}
        <button
          type="button"
          id="mobile-nav-cultivations"
          onClick={() => {
            setIsMoreMenuOpen(false);
            onNavigate('cultivations');
          }}
          className={`flex flex-col items-center justify-center gap-1 min-h-11 min-w-11 py-1 px-3 rounded-xl transition-colors cursor-pointer ${
            currentView === 'cultivations'
              ? 'bg-brand-deep text-white font-bold'
              : 'text-ink-muted hover:text-ink'
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
            aria-label="Anotar algo rápido"
            className="w-13 h-13 rounded-full bg-primary hover:brightness-95 text-ink flex items-center justify-center shadow-lg shadow-primary/30 transition-transform active:scale-95 cursor-pointer border-4 border-white"
            title="Anotar algo rápido"
          >
            <Plus className="w-6 h-6 stroke-[3]" />
          </button>
        </div>

        {/* 4. Cultiveta IA */}
        <button
          type="button"
          id="mobile-nav-ai"
          onClick={() => {
            setIsMoreMenuOpen(false);
            onNavigate('ai_assistant');
          }}
          className={`flex flex-col items-center justify-center gap-1 min-h-11 min-w-11 py-1 px-3 rounded-xl transition-colors cursor-pointer ${
            currentView === 'ai_assistant'
              ? 'bg-brand-deep text-white font-bold'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          <Sparkles className="w-5 h-5" />
          <span className="text-[11px]">Cultiveta IA</span>
        </button>

        {/* 5. Más */}
        <button
          type="button"
          id="mobile-nav-more"
          onClick={() => setIsMoreMenuOpen((prev) => !prev)}
          aria-expanded={isMoreMenuOpen}
          className={`flex flex-col items-center justify-center gap-1 min-h-11 min-w-11 py-1 px-3 rounded-xl transition-colors cursor-pointer ${
            isSecondaryActive || isMoreMenuOpen
              ? 'bg-brand-deep text-white font-bold'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[11px]">Más</span>
        </button>
      </nav>
    </>
  );
};
