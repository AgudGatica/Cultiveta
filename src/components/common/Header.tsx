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
  const displayName =
    userProfile?.displayName ||
    currentUser?.displayName ||
    currentUser?.email?.split('@')[0] ||
    'Cultivador';

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
    <header className="sticky top-0 z-30 bg-[#FFF8E8]/90 backdrop-blur-xl border-b border-[#EFE3CF] px-4 lg:px-8 py-3.5 transition-colors">
      {hasDemoData && (
        <div
          id="demo-banner"
          className="mb-2.5 px-4 py-2 rounded-2xl bg-[#F3C843]/20 border border-[#F3C843]/40 flex items-center justify-between text-xs text-[#29202F]"
        >
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-lg bg-[#F3C843] text-[#29202F] font-bold tracking-wider text-[10px]">
              DEMO
            </span>
            <span className="font-medium">Estás explorando datos de muestra precargados.</span>
          </div>
          <button
            type="button"
            onClick={onDeleteDemoData || onClearDemoData}
            className="flex items-center gap-1 font-semibold text-[#6C45C7] hover:underline cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Eliminar demo
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
        {/* Left: Brand Logo & Title */}
        <div className="flex items-center gap-3">
          <div
            onClick={() => onNavigate && onNavigate('dashboard')}
            className="flex items-center gap-2.5 cursor-pointer select-none group"
            title="Ir al inicio de Cultiveta"
          >
            <div className="w-10 h-10 bg-[#62B95B] rounded-2xl flex items-center justify-center shadow-md shadow-[#62B95B]/20 group-hover:scale-105 transition-transform">
              <Sprout className="w-5 h-5 text-white stroke-[2.5]" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-xl font-extrabold tracking-tight text-[#29202F] flex items-center">
                Cultiveta<span className="text-[#62B95B]">.</span>
              </h1>
            </div>
          </div>

          {activeCultivations.length > 0 && onSelectCultivation && (
            <div className="hidden sm:flex items-center gap-2 bg-white px-3.5 py-1.5 rounded-2xl border border-[#EFE3CF] shadow-xs ml-2">
              <Sprout className="w-4 h-4 text-[#62B95B]" />
              <select
                id="header-cultivation-selector"
                value={activeCultivationId || ''}
                onChange={(e) => onSelectCultivation(e.target.value)}
                className="text-xs font-semibold text-[#29202F] bg-transparent border-none focus:outline-hidden cursor-pointer"
              >
                <option value="">Todas las carpas</option>
                {activeCultivations.map((c) => (
                  <option key={c.id} value={c.id}>
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
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white hover:bg-[#FAF2E1] text-[#29202F] border border-[#EFE3CF] text-xs font-semibold transition-all cursor-pointer shadow-xs"
              title="Cargar datos de prueba"
            >
              <Database className="w-3.5 h-3.5 text-[#62B95B]" />
              <span>Demo</span>
            </button>
          )}

          {/* Search Button */}
          {onSearchOpen && (
            <button
              type="button"
              onClick={onSearchOpen}
              id="global-search-btn"
              className="p-2 sm:px-3 sm:py-1.5 rounded-2xl bg-white border border-[#EFE3CF] text-[#6E5D77] hover:text-[#29202F] hover:bg-[#FAF2E1] text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
              title="Buscar en cultivos y bitácora"
            >
              <Search className="w-4 h-4 text-[#9887A2]" />
              <span className="hidden md:inline">Buscar...</span>
            </button>
          )}

          {/* Mode Switch (Simple / Avanzado) */}
          {onToggleAdvancedMode && (
            <button
              type="button"
              id="toggle-advanced-mode-btn"
              onClick={onToggleAdvancedMode}
              className={`px-3 py-1.5 rounded-2xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border shadow-xs ${
                isAdvancedMode
                  ? 'bg-[#6C45C7]/10 text-[#6C45C7] border-[#6C45C7]/30'
                  : 'bg-white text-[#6E5D77] border-[#EFE3CF] hover:bg-[#FAF2E1]'
              }`}
              title="Alternar entre modo simple y avanzado"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#6C45C7]" />
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
              className="relative p-2 rounded-2xl bg-white border border-[#EFE3CF] text-[#29202F] hover:bg-[#FAF2E1] transition-colors cursor-pointer flex items-center justify-center shadow-xs"
              title="Notificaciones y avisos"
            >
              <Bell className="w-4 h-4 text-[#29202F]" />
              {notificationCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[#EB7864] text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
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
            className="px-3.5 py-1.5 rounded-2xl text-xs font-bold bg-[#6C45C7]/10 text-[#6C45C7] border border-[#6C45C7]/30 hover:bg-[#6C45C7]/20 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Preguntale a Cultiveta IA"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#6C45C7]" />
            <span className="hidden sm:inline">Cultiveta IA</span>
          </button>

          {/* User profile avatar / interactive user menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              id="header-user-menu-btn"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              aria-expanded={isUserMenuOpen}
              className={`p-1.5 sm:px-3 sm:py-1.5 rounded-2xl bg-white border transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                isUserMenuOpen
                  ? 'border-[#6C45C7] text-[#29202F]'
                  : 'border-[#EFE3CF] text-[#29202F] hover:bg-[#FAF2E1]'
              }`}
              title="Perfil y configuración"
            >
              {userProfile?.photoURL || currentUser?.photoURL ? (
                <img
                  src={userProfile?.photoURL || currentUser?.photoURL || ''}
                  alt="Avatar"
                  className="w-6 h-6 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-[#62B95B]/20 text-[#62B95B] border border-[#62B95B]/30 flex items-center justify-center font-bold text-xs">
                  {displayName[0]?.toUpperCase() || <UserIcon className="w-3.5 h-3.5" />}
                </div>
              )}
              <span className="hidden md:inline text-xs font-bold max-w-[100px] truncate text-[#29202F]">
                {displayName}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-[#6E5D77] transition-transform duration-200 ${
                  isUserMenuOpen ? 'rotate-180 text-[#6C45C7]' : ''
                }`}
              />
            </button>

            {/* Menú Desplegable de Usuario */}
            {isUserMenuOpen && (
              <div
                id="header-user-dropdown-menu"
                className="absolute right-0 mt-2 w-72 sm:w-80 rounded-3xl bg-white border border-[#EFE3CF] shadow-2xl p-3 z-50 animate-fade-in space-y-1.5"
              >
                {/* Cabecera del usuario en el menú */}
                <div className="p-3 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] flex items-center gap-3">
                  {userProfile?.photoURL || currentUser?.photoURL ? (
                    <img
                      src={userProfile?.photoURL || currentUser?.photoURL || ''}
                      alt="Avatar"
                      className="w-10 h-10 rounded-2xl object-cover border border-[#DECDB3]"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-2xl bg-[#62B95B]/20 text-[#62B95B] border border-[#62B95B]/30 flex items-center justify-center font-bold text-sm">
                      {displayName[0]?.toUpperCase() || <UserIcon className="w-4 h-4" />}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-[#29202F] block truncate">
                      {displayName}
                    </span>
                    <span className="text-[11px] text-[#6E5D77] block truncate">
                      {currentUser?.email || 'Cultivador registrado'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-[#62B95B] font-bold mt-0.5">
                      <ShieldCheck className="w-3 h-3" />
                      Cuenta activa
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
                  className="w-full p-2.5 rounded-2xl hover:bg-[#FAF2E1] text-left transition-colors flex items-center gap-3 text-xs text-[#29202F] cursor-pointer group"
                >
                  <div className="p-2 rounded-xl bg-[#6C45C7]/10 text-[#6C45C7] border border-[#6C45C7]/20 group-hover:bg-[#6C45C7]/20 transition-colors">
                    <Settings className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-bold block">Preferencias & Alertas</span>
                    <span className="text-[10px] text-[#6E5D77] block truncate">
                      Ajustá límites ambientales y notificaciones
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
                    className="w-full p-2.5 rounded-2xl hover:bg-[#FAF2E1] text-left transition-colors flex items-center gap-3 text-xs text-[#29202F] cursor-pointer group"
                  >
                    <div className="p-2 rounded-xl bg-[#F3C843]/20 text-[#29202F] border border-[#F3C843]/40 group-hover:bg-[#F3C843]/30 transition-colors">
                      <Bell className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold">Avisos y Alertas</span>
                        {notificationCount > 0 && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-[#EB7864] text-white font-bold">
                            {notificationCount}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-[#6E5D77] block truncate">
                        Historial de recordatorios y avisos
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
                    className="w-full p-2.5 rounded-2xl hover:bg-[#FAF2E1] text-left transition-colors flex items-center gap-3 text-xs text-[#29202F] cursor-pointer group"
                  >
                    <div className="p-2 rounded-xl bg-[#6C45C7]/10 text-[#6C45C7] border border-[#6C45C7]/20 group-hover:bg-[#6C45C7]/20 transition-colors">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-bold block">Preguntale a Cultiveta</span>
                      <span className="text-[10px] text-[#6E5D77] block truncate">
                        Asistencia botánica y diagnóstico
                      </span>
                    </div>
                  </button>
                )}

                <div className="h-px bg-[#EFE3CF] my-1"></div>

                {/* Opción 4: Cerrar sesión */}
                {onLogout && (
                  <button
                    type="button"
                    id="menu-logout-btn"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full p-2.5 rounded-2xl hover:bg-[#EB7864]/10 text-left transition-colors flex items-center gap-3 text-xs text-[#EB7864] font-bold cursor-pointer group"
                  >
                    <div className="p-2 rounded-xl bg-[#EB7864]/10 text-[#EB7864] group-hover:bg-[#EB7864]/20 transition-colors">
                      <LogOut className="w-4 h-4" />
                    </div>
                    <span>Cerrar sesión</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
