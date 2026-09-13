import React from 'react';
import {
  Sprout,
  Leaf,
  Flower2,
  Droplets,
  Search,
  X,
  SlidersHorizontal,
  Layers,
} from 'lucide-react';
import { Cultivation } from '../../types';

export type StageFilterCategory = 'all' | 'germinacion' | 'vegetativo' | 'floracion' | 'lavado';

interface CultivationsFilterBarProps {
  activeFilter: StageFilterCategory;
  onFilterChange: (filter: StageFilterCategory) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  cultivations: Cultivation[];
  totalFilteredCount: number;
}

export const matchesStageFilter = (crop: Cultivation, filter: StageFilterCategory): boolean => {
  if (filter === 'all') return true;

  const stage = (crop.currentStage || '').toLowerCase();

  switch (filter) {
    case 'germinacion':
      return stage.includes('germin') || stage.includes('plánt') || stage.includes('plantula') || stage.includes('semilla');
    case 'vegetativo':
      return stage.includes('vege') || stage.includes('crecimiento');
    case 'floracion':
      return stage.includes('flora') || stage.includes('preflora') || stage.includes('stretch');
    case 'lavado':
      return stage.includes('lavad') || stage.includes('flush') || stage.includes('madur') || stage.includes('secado');
    default:
      return true;
  }
};

export const CultivationsFilterBar: React.FC<CultivationsFilterBarProps> = ({
  activeFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  cultivations,
  totalFilteredCount,
}) => {
  // Only count active (non-finished) crops
  const activeCrops = cultivations.filter((c) => !c.isFinished);

  const countByFilter: Record<StageFilterCategory, number> = {
    all: activeCrops.length,
    germinacion: activeCrops.filter((c) => matchesStageFilter(c, 'germinacion')).length,
    vegetativo: activeCrops.filter((c) => matchesStageFilter(c, 'vegetativo')).length,
    floracion: activeCrops.filter((c) => matchesStageFilter(c, 'floracion')).length,
    lavado: activeCrops.filter((c) => matchesStageFilter(c, 'lavado')).length,
  };

  const filterTabs: Array<{
    id: StageFilterCategory;
    label: string;
    icon: React.ReactNode;
    color: string;
    activeColor: string;
  }> = [
    {
      id: 'all',
      label: 'Todas las etapas',
      icon: <Layers className="w-3.5 h-3.5" />,
      color: 'text-zinc-400',
      activeColor: 'bg-zinc-800 text-white border-zinc-700',
    },
    {
      id: 'germinacion',
      label: 'Germinación',
      icon: <Sprout className="w-3.5 h-3.5" />,
      color: 'text-emerald-400',
      activeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    },
    {
      id: 'vegetativo',
      label: 'Vegetativo',
      icon: <Leaf className="w-3.5 h-3.5" />,
      color: 'text-teal-400',
      activeColor: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
    },
    {
      id: 'floracion',
      label: 'Floración',
      icon: <Flower2 className="w-3.5 h-3.5" />,
      color: 'text-amber-400',
      activeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    },
    {
      id: 'lavado',
      label: 'Lavado',
      icon: <Droplets className="w-3.5 h-3.5" />,
      color: 'text-cyan-400',
      activeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    },
  ];

  const hasActiveFilters = activeFilter !== 'all' || searchQuery.trim().length > 0;

  return (
    <div
      id="cultivations-filter-bar"
      className="bg-[#0F0F0F] rounded-2xl sm:rounded-3xl p-3 sm:p-4 border border-zinc-800 shadow-lg space-y-3"
    >
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Stage Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <span className="hidden sm:flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-500 mr-1.5 shrink-0">
            <SlidersHorizontal className="w-3 h-3" />
            Etapa:
          </span>

          {filterTabs.map((tab) => {
            const isSelected = activeFilter === tab.id;
            const count = countByFilter[tab.id];

            return (
              <button
                key={tab.id}
                type="button"
                id={`filter-stage-${tab.id}`}
                onClick={() => onFilterChange(tab.id)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all shrink-0 cursor-pointer ${
                  isSelected
                    ? `${tab.activeColor} shadow-md`
                    : 'bg-zinc-900/80 hover:bg-zinc-800 border-zinc-800/80 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span className={isSelected ? 'text-inherit' : tab.color}>{tab.icon}</span>
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search input and clear action */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="cultivation-search-input"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar por nombre o genética..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/60 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 absolute right-2 top-1/2 -translate-y-1/2 transition-colors cursor-pointer"
                title="Limpiar búsqueda"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              id="clear-stage-filters-btn"
              onClick={() => {
                onFilterChange('all');
                onSearchChange('');
              }}
              className="px-2.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              title="Restablecer filtros"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Limpiar</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter status indicator when filtered */}
      {hasActiveFilters && (
        <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1 pt-1 border-t border-zinc-800/60">
          <span>
            Mostrando <strong className="text-white font-mono">{totalFilteredCount}</strong> cultivo{totalFilteredCount !== 1 ? 's' : ''}
            {activeFilter !== 'all' && (
              <> en etapa de <strong className="text-emerald-400 capitalize">{activeFilter}</strong></>
            )}
            {searchQuery && (
              <> con búsqueda &quot;<strong className="text-white">{searchQuery}</strong>&quot;</>
            )}
          </span>

          <span className="text-[10px] text-zinc-500">
            Total activos: {activeCrops.length}
          </span>
        </div>
      )}
    </div>
  );
};
