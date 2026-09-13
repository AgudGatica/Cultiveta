import React from 'react';
import { Sprout, Search, Sparkles, User as UserIcon, Trash2, SlidersHorizontal, LogOut, Database } from 'lucide-react';
import { Cultivation, UserProfile } from '../../types';
import { User } from 'firebase/auth';

interface HeaderProps {
  currentUser?: User | null;
  userProfile?: UserProfile | null;
  cultivations?: Cultivation[];
  activeCultivationId?: string | null;
  onSelectCultivation?: (id: string) => void;
  hasDemoData?: boolean;
  onDeleteDemoData?: () => void;
  isAdvancedMode?: boolean;
  onToggleAdvancedMode?: () => void;
  onOpenQuickAction?: () => void;
  onNavigate?: (view: string) => void;
  onSearchOpen?: () => void;
  onLogout?: () => void;
  onSeedDemoData?: () => void;
  onClearDemoData?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  userProfile,
  cultivations = [],
  activeCultivationId,
  onSelectCultivation,
  hasDemoData,
  onDeleteDemoData,
  isAdvancedMode,
  onToggleAdvancedMode,
  onOpenQuickAction,
  onNavigate,
  onSearchOpen,
  onLogout,
  onSeedDemoData,
  onClearDemoData,
}) => {
  const activeCultivations = cultivations.filter((c) => !c.isFinished);
  const displayName = userProfile?.displayName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Cultivador';

  return (
    <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/80 px-4 lg:px-8 py-3.5">
      {hasDemoData && (
        <div
          id="demo-banner"
          className="mb-2.5 px-4 py-2 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-xs text-amber-300"
        >
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-amber-500 text-black font-bold tracking-wider text-[10px]">
              DEMO
            </span>
            <span>Estás explorando datos de muestra precargados para demostración.</span>
          </div>
          <button
            type="button"
            onClick={onDeleteDemoData || onClearDemoData}
            className="flex items-center gap-1 font-semibold text-amber-400 hover:text-amber-300 underline cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Eliminar datos demo
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
        {/* Left: Brand Logo & Title */}
        <div className="flex items-center gap-3">
          <div
            onClick={() => onNavigate && onNavigate('dashboard')}
            className="flex items-center gap-3 cursor-pointer select-none group"
          >
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              <Sprout className="w-5 h-5 text-black stroke-[2.5]" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
                CULTIVETA<span className="text-emerald-400">.</span>
              </h1>
            </div>
          </div>

          {activeCultivations.length > 0 && onSelectCultivation && (
            <div className="hidden sm:flex items-center gap-2 bg-zinc-900/80 px-3.5 py-2 rounded-2xl border border-zinc-800 shadow-2xs ml-2">
              <Sprout className="w-4 h-4 text-emerald-400" />
              <select
                id="header-cultivation-selector"
                value={activeCultivationId || ''}
                onChange={(e) => onSelectCultivation(e.target.value)}
                className="text-xs font-semibold text-zinc-300 bg-transparent border-none focus:outline-hidden cursor-pointer"
              >
                <option value="" className="bg-zinc-900 text-zinc-300">Todas las carpas</option>
                {activeCultivations.map((c) => (
                  <option key={c.id} value={c.id} className="bg-zinc-900 text-zinc-200">
                    {c.name} ({c.currentStage})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Right action group */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Demo Data Quick Trigger */}
          {onSeedDemoData && (
            <button
              type="button"
              id="header-seed-demo-btn"
              onClick={onSeedDemoData}
              className="hidden md:flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-semibold transition-all cursor-pointer"
              title="Cargar datos de prueba"
            >
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cargar Demo</span>
            </button>
          )}

          {/* Search Button */}
          {onSearchOpen && (
            <button
              type="button"
              onClick={onSearchOpen}
              id="global-search-btn"
              className="p-2 sm:px-3.5 sm:py-2 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
              title="Buscar en cultivos y registros"
            >
              <Search className="w-4 h-4 text-zinc-500" />
              <span className="hidden md:inline">Buscar...</span>
            </button>
          )}

          {/* Mode Switch (Simple / Avanzado) */}
          {onToggleAdvancedMode && (
            <button
              type="button"
              id="toggle-advanced-mode-btn"
              onClick={onToggleAdvancedMode}
              className={`px-3.5 py-2 rounded-2xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                isAdvancedMode
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700'
              }`}
              title="Alternar entre modo simple y avanzado"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Modo:</span>
              <span>{isAdvancedMode ? 'Avanzado' : 'Simple'}</span>
            </button>
          )}

          {/* Cultiveta IA Direct Button */}
          <button
            type="button"
            id="header-ai-btn"
            onClick={() => onNavigate && onNavigate('ai_assistant')}
            className="px-3.5 py-2 rounded-2xl text-xs font-bold bg-violet-500/10 text-violet-300 border border-violet-500/20 hover:bg-violet-500/20 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span className="hidden sm:inline">Cultiveta IA</span>
          </button>

          {/* User profile avatar / button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              id="header-profile-btn"
              onClick={() => onNavigate && onNavigate('profile')}
              className="p-1.5 sm:px-3 sm:py-1.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700 flex items-center gap-2 transition-colors cursor-pointer"
            >
              {userProfile?.photoURL || currentUser?.photoURL ? (
                <img
                  src={userProfile?.photoURL || currentUser?.photoURL || ''}
                  alt="Avatar"
                  className="w-6 h-6 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-xs">
                  {displayName[0]?.toUpperCase() || <UserIcon className="w-3.5 h-3.5" />}
                </div>
              )}
              <span className="hidden md:inline text-xs font-semibold max-w-[100px] truncate text-zinc-200">
                {displayName}
              </span>
            </button>

            {onLogout && (
              <button
                type="button"
                id="header-logout-btn"
                onClick={onLogout}
                className="p-2 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 hover:border-rose-500/30 transition-colors cursor-pointer"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

