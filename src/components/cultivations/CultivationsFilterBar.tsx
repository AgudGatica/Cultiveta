import React from 'react';
import {
  Sprout,
  Leaf,
  Flower2,
  Droplets,
  Search,
  X,
  Layers,
  CheckCircle2,
  SlidersHorizontal,
} from 'lucide-react';
import { Cultivation } from '../../types';
import { isCropFinished } from '../../utils/cropCardInfo';

export type CultivationStatusFilter = 'active' | 'finished' | 'all';
export type StageFilterCategory = 'all' | 'germinacion' | 'vegetativo' | 'floracion' | 'lavado';

// La regla vive en utils/cropCardInfo (se usa también fuera de esta barra).
export { isCropFinished };

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

interface CultivationsFilterBarProps {
  statusFilter?: CultivationStatusFilter;
  onStatusFilterChange?: (status: CultivationStatusFilter) => void;
  activeFilter: StageFilterCategory;
  onFilterChange: (filter: StageFilterCategory) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  cultivations: Cultivation[];
  totalFilteredCount: number;
}

export const CultivationsFilterBar: React.FC<CultivationsFilterBarProps> = ({
  statusFilter = 'active',
  onStatusFilterChange,
  activeFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  cultivations,
  totalFilteredCount,
}) => {
  const activeCrops = cultivations.filter((c) => !isCropFinished(c));
  const finishedCrops = cultivations.filter((c) => isCropFinished(c));

  const countByStage: Record<StageFilterCategory, number> = {
    all: activeCrops.length,
    germinacion: activeCrops.filter((c) => matchesStageFilter(c, 'germinacion')).length,
    vegetativo: activeCrops.filter((c) => matchesStageFilter(c, 'vegetativo')).length,
    floracion: activeCrops.filter((c) => matchesStageFilter(c, 'floracion')).length,
    lavado: activeCrops.filter((c) => matchesStageFilter(c, 'lavado')).length,
  };

  const statusTabs: Array<{
    id: CultivationStatusFilter;
    label: string;
    count: number;
  }> = [
    { id: 'active', label: 'Activos', count: activeCrops.length },
    { id: 'finished', label: 'Finalizados', count: finishedCrops.length },
    { id: 'all', label: 'Todos', count: cultivations.length },
  ];

  const stageTabs: Array<{
    id: StageFilterCategory;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'all', label: 'Todas las etapas', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'germinacion', label: 'Germinación', icon: <Sprout className="w-3.5 h-3.5" /> },
    { id: 'vegetativo', label: 'Vegetativo', icon: <Leaf className="w-3.5 h-3.5" /> },
    { id: 'floracion', label: 'Floración', icon: <Flower2 className="w-3.5 h-3.5" /> },
    { id: 'lavado', label: 'Lavado', icon: <Droplets className="w-3.5 h-3.5" /> },
  ];

  const hasSearch = searchQuery.trim().length > 0;
  const hasStageFilter = statusFilter === 'active' && activeFilter !== 'all';
  const hasActiveFilters = hasSearch || hasStageFilter;

  return (
    <div
      id="cultivations-filter-bar"
      className="bg-white rounded-[32px] p-4 sm:p-6 border border-chip-line shadow-xs space-y-4"
    >
      {/* Nivel Superior: Selector de Estado (Activos / Finalizados / Todos) + Barra de Búsqueda */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Pestañas de Estado Principal */}
        <div className="flex items-center gap-1.5 p-1 bg-surface rounded-2xl border border-chip-line self-start sm:self-auto">
          {statusTabs.map((tab) => {
            const isSelected = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                id={`filter-status-${tab.id}`}
                onClick={() => onStatusFilterChange?.(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-brand text-white shadow-xs'
                    : 'text-ink-muted hover:text-ink hover:bg-track'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-line text-ink'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Input de Búsqueda */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-ink-subtle absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="cultivation-search-input"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar cultivo..."
              className="w-full pl-10 pr-9 py-2 rounded-2xl bg-surface border border-chip-line text-xs font-medium text-ink placeholder-ink-subtle focus:outline-hidden focus:border-brand focus:bg-white transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="p-1 rounded-lg text-ink-subtle hover:text-ink absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors cursor-pointer"
                title="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
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
              className="px-3 py-2 rounded-2xl bg-track hover:bg-line text-ink text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 border border-chip-line"
              title="Restablecer filtros"
            >
              <X className="w-3.5 h-3.5 text-ink-muted" />
              <span className="hidden sm:inline">Limpiar</span>
            </button>
          )}
        </div>
      </div>

      {/* Segundo Nivel: Filtro por Etapas (solo en modo 'Activos') */}
      {statusFilter === 'active' && (
        <div className="pt-3 border-t border-chip-line flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <span className="flex items-center gap-1 text-[11px] font-bold text-ink-subtle mr-1 shrink-0">
            <SlidersHorizontal className="w-3 h-3 text-brand" />
            Etapa:
          </span>

          {stageTabs.map((tab) => {
            const isSelected = activeFilter === tab.id;
            const count = countByStage[tab.id];

            return (
              <button
                key={tab.id}
                type="button"
                id={`filter-stage-${tab.id}`}
                onClick={() => onFilterChange(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-ok/15 text-ok-ink border-ok shadow-2xs'
                    : 'bg-surface hover:bg-track border-chip-line text-ink-muted hover:text-ink'
                }`}
              >
                <span className={isSelected ? 'text-ok' : 'text-ink-subtle'}>{tab.icon}</span>
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isSelected ? 'bg-ok-ink text-white' : 'bg-track text-ink-muted'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Indicador de resultados activos cuando hay filtros */}
      {hasActiveFilters && (
        <div className="flex items-center justify-between text-[11px] text-ink-muted px-1 pt-1 border-t border-chip-line">
          <span>
            Mostrando <strong className="text-ink">{totalFilteredCount}</strong> cultivo{totalFilteredCount !== 1 ? 's' : ''}
            {hasStageFilter && (
              <> en etapa de <strong className="text-ok capitalize">{activeFilter}</strong></>
            )}
            {hasSearch && (
              <> con búsqueda &quot;<strong className="text-ink">{searchQuery}</strong>&quot;</>
            )}
          </span>
          <span className="text-[10px] text-ink-subtle">
            {statusFilter === 'active' && `Activos: ${activeCrops.length}`}
            {statusFilter === 'finished' && `Finalizados: ${finishedCrops.length}`}
            {statusFilter === 'all' && `Total: ${cultivations.length}`}
          </span>
        </div>
      )}
    </div>
  );
};
