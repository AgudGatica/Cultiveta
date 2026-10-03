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

export type CultivationStatusFilter = 'active' | 'finished' | 'all';
export type StageFilterCategory = 'all' | 'germinacion' | 'vegetativo' | 'floracion' | 'lavado';

export const isCropFinished = (crop: Cultivation): boolean => {
  return Boolean(
    crop.isFinished === true ||
    crop.status?.toLowerCase() === 'cosechado' ||
    crop.status?.toLowerCase() === 'finalizado' ||
    crop.currentStage?.toLowerCase() === 'cosechado'
  );
};

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
      className="bg-white rounded-[32px] p-4 sm:p-6 border border-[#EFE3CF] shadow-xs space-y-4"
    >
      {/* Nivel Superior: Selector de Estado (Activos / Finalizados / Todos) + Barra de Búsqueda */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Pestañas de Estado Principal */}
        <div className="flex items-center gap-1.5 p-1 bg-[#FFF8E8] rounded-2xl border border-[#EFE3CF] self-start sm:self-auto">
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
                    ? 'bg-[#6C45C7] text-white shadow-xs'
                    : 'text-[#6E5D77] hover:text-[#29202F] hover:bg-[#FAF2E1]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-[#EFE3CF] text-[#29202F]'
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
            <Search className="w-4 h-4 text-[#9887A2] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="cultivation-search-input"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar cultivo..."
              className="w-full pl-10 pr-9 py-2 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs font-medium text-[#29202F] placeholder-[#9887A2] focus:outline-hidden focus:border-[#6C45C7] focus:bg-white transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="p-1 rounded-lg text-[#9887A2] hover:text-[#29202F] absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors cursor-pointer"
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
              className="px-3 py-2 rounded-2xl bg-[#FAF2E1] hover:bg-[#EFE3CF] text-[#29202F] text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 border border-[#EFE3CF]"
              title="Restablecer filtros"
            >
              <X className="w-3.5 h-3.5 text-[#6E5D77]" />
              <span className="hidden sm:inline">Limpiar</span>
            </button>
          )}
        </div>
      </div>

      {/* Segundo Nivel: Filtro por Etapas (solo en modo 'Activos') */}
      {statusFilter === 'active' && (
        <div className="pt-3 border-t border-[#EFE3CF] flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <span className="flex items-center gap-1 text-[11px] font-bold text-[#9887A2] mr-1 shrink-0">
            <SlidersHorizontal className="w-3 h-3 text-[#6C45C7]" />
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
                    ? 'bg-[#62B95B]/15 text-[#2d6b28] border-[#62B95B] shadow-2xs'
                    : 'bg-[#FFFDF7] hover:bg-[#FAF2E1] border-[#EFE3CF] text-[#6E5D77] hover:text-[#29202F]'
                }`}
              >
                <span className={isSelected ? 'text-[#62B95B]' : 'text-[#9887A2]'}>{tab.icon}</span>
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isSelected ? 'bg-[#62B95B] text-white' : 'bg-[#FAF2E1] text-[#6E5D77]'
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
        <div className="flex items-center justify-between text-[11px] text-[#6E5D77] px-1 pt-1 border-t border-[#EFE3CF]">
          <span>
            Mostrando <strong className="text-[#29202F]">{totalFilteredCount}</strong> cultivo{totalFilteredCount !== 1 ? 's' : ''}
            {hasStageFilter && (
              <> en etapa de <strong className="text-[#62B95B] capitalize">{activeFilter}</strong></>
            )}
            {hasSearch && (
              <> con búsqueda &quot;<strong className="text-[#29202F]">{searchQuery}</strong>&quot;</>
            )}
          </span>
          <span className="text-[10px] text-[#9887A2]">
            {statusFilter === 'active' && `Activos: ${activeCrops.length}`}
            {statusFilter === 'finished' && `Finalizados: ${finishedCrops.length}`}
            {statusFilter === 'all' && `Total: ${cultivations.length}`}
          </span>
        </div>
      )}
    </div>
  );
};
