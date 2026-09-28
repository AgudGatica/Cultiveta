import React, { useState, useRef, useEffect } from 'react';
import {
  Sprout,
  Search,
  Sparkles,
  User as UserIcon,
  Trash2,
  SlidersHorizontal,
  LogOut,
  Database,
  Bell,
  Settings,
  ChevronDown,
  ShieldCheck,
  Droplets,
  Thermometer,
  CalendarCheck,
} from 'lucide-react';
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
  onOpenPreferences?: () => void;
  onOpenNotifications?: () => void;
  notificationCount?: number;
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
  onOpenPreferences,
  onOpenNotifications,
  notificationCount = 0,
  onNavigate,
  onSearchOpen,
  onLogout,
  onSeedDemoData,
  onClearDemoData,
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const activeCultivations = cultivations.filter((c) => !c.isFinished);
  const displayName = userProfile?.displayName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Cultivador';

  // Cerrar menú de usuario al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserMenuOpen]);

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

          {/* Notification Bell Button */}
          {onOpenNotifications && (
            <button
              type="button"
              id="header-notification-btn"
              onClick={onOpenNotifications}
              className="relative p-2 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer flex items-center justify-center"
              title="Notificaciones de Alertas Climáticas (env_alert)"
            >
              <Bell className="w-4 h-4 text-zinc-300" />
              {notificationCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-mono font-bold flex items-center justify-center animate-pulse">
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
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

          {/* User profile avatar / interactive user menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              id="header-user-menu-btn"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              aria-expanded={isUserMenuOpen}
              className={`p-1.5 sm:px-3 sm:py-1.5 rounded-2xl bg-zinc-900 border transition-all flex items-center gap-2 cursor-pointer ${
                isUserMenuOpen
                  ? 'border-emerald-500/50 text-white shadow-sm shadow-emerald-500/10'
                  : 'border-zinc-800 text-zinc-300 hover:border-zinc-700'
              }`}
              title="Menú de usuario y preferencias"
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
              <ChevronDown
                className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
                  isUserMenuOpen ? 'rotate-180 text-emerald-400' : ''
                }`}
              />
            </button>

            {/* Menú Desplegable de Usuario */}
            {isUserMenuOpen && (
              <div
                id="header-user-dropdown-menu"
                className="absolute right-0 mt-2 w-72 sm:w-80 rounded-3xl bg-[#0F0F0F] border border-zinc-800 shadow-2xl p-3 z-50 animate-fade-in space-y-1.5"
              >
                {/* Cabecera del usuario en el menú */}
                <div className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center gap-3">
                  {userProfile?.photoURL || currentUser?.photoURL ? (
                    <img
                      src={userProfile?.photoURL || currentUser?.photoURL || ''}
                      alt="Avatar"
                      className="w-10 h-10 rounded-2xl object-cover border border-zinc-700"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm">
                      {displayName[0]?.toUpperCase() || <UserIcon className="w-4 h-4" />}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-white block truncate">
                      {displayName}
                    </span>
                    <span className="text-[11px] text-zinc-400 block truncate font-mono">
                      {currentUser?.email || 'Cultivador registrado'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400 font-mono font-bold mt-0.5">
                      <ShieldCheck className="w-3 h-3" />
                      Cuenta Activa
                    </span>
                  </div>
                </div>

                {/* Opción 1: Preferencias y Configuración de Alertas */}
                <button
                  type="button"
                  id="menu-open-preferences-btn"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onOpenPreferences?.();
                  }}
                  className="w-full p-2.5 rounded-2xl hover:bg-zinc-900 text-left transition-colors flex items-center gap-3 text-xs text-zinc-200 hover:text-white cursor-pointer group"
                >
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-colors">
                    <Settings className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">Preferencias & Alertas</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        Nuevo
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-400 block truncate">
                      Elige alertas climáticas, riego y calendario
                    </span>
                  </div>
                </button>

                {/* Opción 2: Centro de Notificaciones */}
                {onOpenNotifications && (
                  <button
                    type="button"
                    id="menu-open-notifications-btn"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onOpenNotifications();
                    }}
                    className="w-full p-2.5 rounded-2xl hover:bg-zinc-900 text-left transition-colors flex items-center gap-3 text-xs text-zinc-200 hover:text-white cursor-pointer group"
                  >
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:bg-amber-500/20 transition-colors">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold">Centro de Notificaciones</span>
                        {notificationCount > 0 && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-rose-500 text-white font-bold">
                            {notificationCount}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        Historial de avisos y alertas del cron
                      </span>
                    </div>
                  </button>
                )}

                {/* Opción 3: Cultiveta IA */}
                {onNavigate && (
                  <button
                    type="button"
                    id="menu-open-ai-btn"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onNavigate('ai_assistant');
                    }}
                    className="w-full p-2.5 rounded-2xl hover:bg-zinc-900 text-left transition-colors flex items-center gap-3 text-xs text-zinc-200 hover:text-white cursor-pointer group"
                  >
                    <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 group-hover:bg-violet-500/20 transition-colors">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-bold block">Cultiveta IA Assistant</span>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        Diagnósticos con fotos y asesoría técnica
                      </span>
                    </div>
                  </button>
                )}

                {/* Opción 4: Modo Avanzado */}
                {onToggleAdvancedMode && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleAdvancedMode();
                    }}
                    className="w-full p-2.5 rounded-2xl hover:bg-zinc-900 text-left transition-colors flex items-center justify-between text-xs text-zinc-300 hover:text-white cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-zinc-800 text-zinc-400">
                        <SlidersHorizontal className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-semibold block">Modo Avanzado (VPD/EC)</span>
                        <span className="text-[10px] text-zinc-500">Métricas avanzadas de cultivo</span>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        isAdvancedMode
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {isAdvancedMode ? 'ON' : 'OFF'}
                    </span>
                  </button>
                )}

                <div className="pt-1.5 border-t border-zinc-800/80">
                  {onLogout && (
                    <button
                      type="button"
                      id="menu-logout-btn"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full p-2.5 rounded-2xl hover:bg-rose-500/10 text-left transition-colors flex items-center gap-3 text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        <LogOut className="w-4 h-4" />
                      </div>
                      <span className="font-bold">Cerrar Sesión</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

