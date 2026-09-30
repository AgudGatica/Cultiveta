import React, { useState } from 'react';
import {
  LayoutDashboard,
  Sprout,
  Dna,
  Award,
  Sparkles,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Plus,
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
    { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard, badge: '' },
    { id: 'cultivations', label: 'Mis Cultivos', icon: Sprout, badge: cultivationsCount > 0 ? `${cultivationsCount}` : '' },
    { id: 'genetics', label: 'Genéticas', icon: Dna, badge: geneticsCount > 0 ? `${geneticsCount}` : '' },
    { id: 'harvests', label: 'Cosechas', icon: Award, badge: harvestsCount > 0 ? `${harvestsCount}` : '' },
    { id: 'compare_crops', label: 'Comparador', icon: Scale, badge: '' },
    { id: 'calculators', label: 'Calculadoras', icon: Calculator, badge: '' },
    { id: 'ai_assistant', label: 'Cultiveta IA', icon: Sparkles, isAI: true, badge: '✨' },
  ];

  return (
    <aside
      id="main-desktop-sidebar"
      className={`hidden lg:flex flex-col justify-between h-[calc(100vh-6rem)] sticky top-24 bg-white border border-[#EFE3CF] rounded-[32px] p-4 transition-all duration-300 z-20 shadow-xs ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Top Nav Section */}
      <div className="space-y-4">
        {/* Collapse toggle row */}
        <div className="flex items-center justify-between px-2 pt-1 pb-2 border-b border-[#EFE3CF]">
          {!isCollapsed && (
            <span className="text-[10px] uppercase tracking-wider text-[#9887A2] font-bold">
              Navegación
            </span>
          )}
          <button
            type="button"
            onClick={toggleCollapse}
            className="p-1.5 rounded-xl hover:bg-[#FAF2E1] text-[#6E5D77] hover:text-[#29202F] transition-colors cursor-pointer ml-auto"
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
            className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl font-bold text-xs bg-[#62B95B] hover:bg-[#52A54C] text-white shadow-md shadow-[#62B95B]/20 transition-all cursor-pointer ${
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
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? item.isAI
                      ? 'bg-[#6C45C7]/15 text-[#6C45C7] font-bold border border-[#6C45C7]/25 shadow-xs'
                      : 'bg-[#6C45C7]/10 text-[#6C45C7] font-bold border border-[#6C45C7]/20 shadow-xs'
                    : 'text-[#6E5D77] hover:text-[#29202F] hover:bg-[#FAF2E1]'
                }`}
                title={item.label}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive
                        ? item.isAI
                          ? 'text-[#6C45C7]'
                          : 'text-[#6C45C7]'
                        : item.isAI
                        ? 'text-[#6C45C7]'
                        : 'text-[#9887A2]'
                    }`}
                  />
                  {!isCollapsed && <span>{item.label}</span>}
                </div>

                {!isCollapsed && item.badge && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-[#6C45C7] text-white'
                        : 'bg-[#FAF2E1] text-[#6E5D77] border border-[#EFE3CF]'
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
        <div className="p-3 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-center space-y-1">
          <span className="text-[11px] font-bold text-[#29202F] block">
            Cultiveta 🌱
          </span>
          <span className="text-[10px] text-[#6E5D77] block">
            Diario botánico & IA
          </span>
        </div>
      )}
    </aside>
  );
};
