import React, { useState } from 'react';
import {
  LayoutDashboard,
  Sprout,
  Dna,
  Sparkles,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Plus,
  Scale,
  Trophy,
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: any) => void;
  onOpenQuickAction?: () => void;
  cultivationsCount?: number;
  geneticsCount?: number;
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
  isCollapsed: externalIsCollapsed,
  onToggleCollapse: externalOnToggleCollapse,
  onOpenNewCropModal,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = externalIsCollapsed !== undefined ? externalIsCollapsed : internalCollapsed;
  const toggleCollapse = externalOnToggleCollapse || (() => setInternalCollapsed(!internalCollapsed));

  const navItems = [
    { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard, badge: '' },
    // Cultivos: historial de terminados y cosechas (los activos están en el Inicio)
    { id: 'cultivations', label: 'Cultivos', icon: Sprout, badge: cultivationsCount > 0 ? `${cultivationsCount}` : '' },
    { id: 'genetics', label: 'Genéticas', icon: Dna, badge: geneticsCount > 0 ? `${geneticsCount}` : '' },
    { id: 'compare_crops', label: 'Comparador', icon: Scale, badge: '' },
    { id: 'calculators', label: 'Calculadoras', icon: Calculator, badge: '' },
    { id: 'ai_assistant', label: 'Cultiveta IA', icon: Sparkles, isAI: true, badge: '✨' },
    { id: 'profile', label: 'Mi perfil', icon: Trophy, badge: '' },
  ];

  return (
    <aside
      id="main-desktop-sidebar"
      className={`hidden lg:flex flex-col justify-between h-[calc(100vh-6rem)] sticky top-24 bg-white border border-black/10 rounded-[32px] p-4 transition-all duration-300 z-20 shadow-xs ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Top Nav Section */}
      <div className="space-y-4">
        {/* Collapse toggle row */}
        <div className="flex items-center justify-between px-2 pt-1 pb-2 border-b border-black/10">
          {!isCollapsed && (
            <span className="text-[10px] uppercase tracking-wider text-ink-subtle font-bold">
              Navegación
            </span>
          )}
          <button
            type="button"
            onClick={toggleCollapse}
            className="p-1.5 rounded-xl hover:bg-[#EBF7F9] text-ink-muted hover:text-ink transition-colors cursor-pointer ml-auto"
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
            className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl font-bold text-xs bg-primary hover:brightness-95 text-ink shadow-md shadow-primary/20 transition-all cursor-pointer ${
              isCollapsed ? 'px-0' : 'px-4'
            }`}
            title="Anotar algo rápido"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            {!isCollapsed && <span>Anotar algo</span>}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1 pt-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id || (item.id === 'profile' && currentView === 'achievements');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full min-h-11 flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? item.isAI
                      ? 'bg-brand-deep text-white font-bold border border-brand-deep shadow-xs'
                      : 'bg-brand-deep text-white font-bold border border-brand-deep shadow-xs'
                    : 'text-ink-muted hover:text-ink hover:bg-track'
                }`}
                title={item.label}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive
                        ? item.isAI
                          ? 'text-brand-soft'
                          : 'text-brand-soft'
                        : item.isAI
                        ? 'text-brand'
                        : 'text-ink-subtle'
                    }`}
                  />
                  {!isCollapsed && <span>{item.label}</span>}
                </div>

                {!isCollapsed && item.badge && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-brand-softer text-brand-deep'
                        : 'bg-track text-ink-muted border border-black/10'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Footer Info */}
      {!isCollapsed && (
        <div className="p-3 rounded-2xl bg-surface border border-black/10 text-center space-y-1">
          <span className="text-[11px] font-bold text-ink block">
            Cultiveta 🌱
          </span>
          <span className="text-[10px] text-ink-muted block">
            Diario botánico & IA
          </span>
        </div>
      )}
    </aside>
  );
};
