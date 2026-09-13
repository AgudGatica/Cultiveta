import React, { useState } from 'react';
import {
  LayoutDashboard,
  Sprout,
  Dna,
  Calendar,
  BarChart3,
  Award,
  Sparkles,
  Calculator,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Plus,
  Flame,
  Droplets,
  Scale,
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: any) => void;
  onOpenQuickAction?: () => void;
  cultivationsCount?: number;
  geneticsCount?: number;
  harvestsCount?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenNewCropModal?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  onOpenQuickAction,
  cultivationsCount = 0,
  geneticsCount = 0,
  harvestsCount = 0,
  isCollapsed: externalIsCollapsed,
  onToggleCollapse: externalOnToggleCollapse,
  onOpenNewCropModal,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = externalIsCollapsed !== undefined ? externalIsCollapsed : internalCollapsed;
  const toggleCollapse = externalOnToggleCollapse || (() => setInternalCollapsed(!internalCollapsed));

  const navItems = [
    { id: 'dashboard', label: 'Panel Principal', icon: LayoutDashboard, badge: '' },
    { id: 'cultivations', label: 'Mis Cultivos', icon: Sprout, badge: cultivationsCount > 0 ? `${cultivationsCount}` : '' },
    { id: 'genetics', label: 'Genéticas', icon: Dna, badge: geneticsCount > 0 ? `${geneticsCount}` : '' },
    { id: 'harvests', label: 'Cosechas', icon: Award, badge: harvestsCount > 0 ? `${harvestsCount}` : '' },
    { id: 'compare_crops', label: 'Comparador', icon: Scale, badge: 'VS' },
    { id: 'calculators', label: 'Calculadoras', icon: Calculator, badge: 'VPD' },
    { id: 'ai_assistant', label: 'Cultiveta IA', icon: Sparkles, isAI: true, badge: 'GEMINI' },
  ];

  return (
    <aside
      id="main-desktop-sidebar"
      className={`hidden lg:flex flex-col justify-between h-[calc(100vh-6rem)] sticky top-24 bg-[#0F0F0F] border border-zinc-800 rounded-[32px] p-4 transition-all duration-300 z-20 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Top Nav Section */}
      <div className="space-y-4">
        {/* Collapse toggle row */}
        <div className="flex items-center justify-between px-2 pt-1 pb-2 border-b border-zinc-800/80">
          {!isCollapsed && (
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
              Menú Bento
            </span>
          )}
          <button
            type="button"
            onClick={toggleCollapse}
            className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer ml-auto"
            title={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Quick Action Button */}
        <div>
          <button
            type="button"
            id="sidebar-new-crop-btn"
            onClick={onOpenQuickAction || onOpenNewCropModal}
            className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/10 transition-all cursor-pointer ${
              isCollapsed ? 'px-0' : 'px-4'
            }`}
            title="Registrar o Crear"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            {!isCollapsed && <span>Registro Rápido</span>}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1.5 pt-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                id={`sidebar-nav-${item.id}`}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs font-semibold transition-all cursor-pointer border ${
                  isActive
                    ? item.isAI
                      ? 'bg-violet-950/40 text-violet-300 border-violet-800/40 font-bold'
                      : 'bg-zinc-900 text-white border-zinc-700/80 font-bold shadow-xs'
                    : item.isAI
                    ? 'text-violet-400 hover:bg-zinc-900/60 border-transparent'
                    : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200 border-transparent'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
                title={item.label}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive
                      ? item.isAI
                        ? 'text-violet-400'
                        : 'text-emerald-400'
                      : item.isAI
                      ? 'text-violet-400'
                      : 'text-zinc-400'
                  }`}
                />
                {!isCollapsed && (
                  <div className="flex items-center justify-between w-full">
                    <span>{item.label}</span>
                    {item.badge && (
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                          item.isAI
                            ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                            : isActive
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Mini Bento Card */}
      {!isCollapsed && (
        <div className="pt-3 border-t border-zinc-800/80">
          <div className="p-3.5 rounded-2xl bg-zinc-900/70 border border-zinc-800 text-xs space-y-2">
            <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500">
              <span>Estado Sistema</span>
              <div className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>ONLINE</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-zinc-400 text-[11px]">
              <span>Firestore Sync</span>
              <span className="font-mono text-zinc-300">Activo</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

