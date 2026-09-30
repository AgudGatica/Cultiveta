import React, { useState } from 'react';
import { Calendar, Filter, X, Clock, RotateCcw, Check, Sparkles, ChevronRight } from 'lucide-react';

export type DatePreset = 'all' | 'today' | '7d' | '30d' | 'custom' | 'single';

export interface DateFilterState {
  preset: DatePreset;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export const getTodayString = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getNDaysAgoString = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const normalizeDate = (dateStr: string): string => {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr.slice(0, 10);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return dateStr.slice(0, 10);
  }
};

export const formatDateDisplay = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const [year, month, day] = dateStr.split('-');
    if (!year || !month || !day) return dateStr;
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const mIdx = parseInt(month, 10) - 1;
    return `${parseInt(day, 10)} ${months[mIdx] || month} ${year}`;
  } catch {
    return dateStr;
  }
};

interface DashboardDateFilterProps {
  filter: DateFilterState;
  onChangeFilter: (newFilter: DateFilterState) => void;
  wateringsCount: number;
  envCount: number;
  photosCount: number;
  totalRecordsCount: number;
}

export const DashboardDateFilter: React.FC<DashboardDateFilterProps> = ({
  filter,
  onChangeFilter,
  wateringsCount,
  envCount,
  photosCount,
  totalRecordsCount,
}) => {
  const [isCustomOpen, setIsCustomOpen] = useState(filter.preset === 'custom' || filter.preset === 'single');
  const [customStart, setCustomStart] = useState(filter.startDate || getTodayString());
  const [customEnd, setCustomEnd] = useState(filter.endDate || getTodayString());

  const handlePresetSelect = (preset: DatePreset) => {
    const today = getTodayString();
    if (preset === 'all') {
      setIsCustomOpen(false);
      onChangeFilter({ preset: 'all', startDate: '', endDate: '' });
    } else if (preset === 'today') {
      setIsCustomOpen(false);
      onChangeFilter({ preset: 'today', startDate: today, endDate: today });
    } else if (preset === '7d') {
      setIsCustomOpen(false);
      onChangeFilter({ preset: '7d', startDate: getNDaysAgoString(6), endDate: today });
    } else if (preset === '30d') {
      setIsCustomOpen(false);
      onChangeFilter({ preset: '30d', startDate: getNDaysAgoString(29), endDate: today });
    } else if (preset === 'single') {
      setIsCustomOpen(true);
      const targetDate = customStart || today;
      onChangeFilter({ preset: 'single', startDate: targetDate, endDate: targetDate });
    } else if (preset === 'custom') {
      setIsCustomOpen(true);
      onChangeFilter({ preset: 'custom', startDate: customStart || getNDaysAgoString(7), endDate: customEnd || today });
    }
  };

  const handleApplyCustomRange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStart) return;
    const start = customStart;
    const end = customEnd || customStart;
    // ensure chronological order
    if (start > end) {
      onChangeFilter({ preset: 'custom', startDate: end, endDate: start });
    } else {
      onChangeFilter({ preset: 'custom', startDate: start, endDate: end });
    }
  };

  const handleSingleDayChange = (dateValue: string) => {
    setCustomStart(dateValue);
    setCustomEnd(dateValue);
    onChangeFilter({
      preset: 'single',
      startDate: dateValue,
      endDate: dateValue,
    });
  };

  const isFilterActive = filter.preset !== 'all';

  const getRangeDescription = () => {
    if (filter.preset === 'all') return 'Mostrando todo el historial de cultivo';
    if (filter.preset === 'today') return `Hoy, ${formatDateDisplay(filter.startDate)}`;
    if (filter.preset === 'single') return `Día específico: ${formatDateDisplay(filter.startDate)}`;
    if (filter.startDate && filter.endDate) {
      if (filter.startDate === filter.endDate) {
        return `${formatDateDisplay(filter.startDate)}`;
      }
      return `${formatDateDisplay(filter.startDate)} al ${formatDateDisplay(filter.endDate)}`;
    }
    return 'Rango personalizado';
  };

  return (
    <div
      id="dashboard-date-filter"
      className="bg-white rounded-[28px] p-4 sm:p-6 border border-[#EFE3CF] shadow-xs space-y-4"
    >
      {/* Header bar: Icon, title, active badge, and clear button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#EFE3CF]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#6C45C7]/10 text-[#6C45C7] border border-[#6C45C7]/20">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-extrabold text-[#29202F]">Filtrar por Fecha</span>
              {isFilterActive && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#6C45C7]/15 text-[#6C45C7] border border-[#6C45C7]/30">
                  Filtro Activo
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#6E5D77] mt-0.5">{getRangeDescription()}</p>
          </div>
        </div>

        {/* Quick event count summary & reset */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#FFFDF7] border border-[#EFE3CF] text-[11px] text-[#6E5D77]">
            <span className="font-bold text-[#29202F]">{totalRecordsCount}</span>
            <span className="text-[#9887A2]">eventos</span>
            <span className="text-[#DECDB3]">|</span>
            <span className="text-[#6C45C7] font-bold">{wateringsCount}</span>
            <span className="text-[#9887A2]">riegos</span>
            <span className="text-[#DECDB3]">|</span>
            <span className="text-[#62B95B] font-bold">{envCount}</span>
            <span className="text-[#9887A2]">amb</span>
            <span className="text-[#DECDB3]">|</span>
            <span className="text-[#EB7864] font-bold">{photosCount}</span>
            <span className="text-[#9887A2]">fotos</span>
          </div>

          {isFilterActive && (
            <button
              type="button"
              id="reset-date-filter-btn"
              onClick={() => handlePresetSelect('all')}
              className="px-3 py-1.5 rounded-xl bg-[#FAF2E1] hover:bg-[#EFE3CF] text-[#29202F] border border-[#EFE3CF] text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Restablecer filtro a todo el historial"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Ver Todo</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Presets and Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          id="filter-preset-all"
          onClick={() => handlePresetSelect('all')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
            filter.preset === 'all'
              ? 'bg-[#6C45C7] text-white shadow-md shadow-[#6C45C7]/20 font-bold'
              : 'bg-[#FFFDF7] text-[#6E5D77] hover:text-[#29202F] hover:bg-[#FAF2E1] border border-[#EFE3CF]'
          }`}
        >
          <span>Todo el Histórico</span>
        </button>

        <button
          type="button"
          id="filter-preset-today"
          onClick={() => handlePresetSelect('today')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
            filter.preset === 'today'
              ? 'bg-[#6C45C7] text-white shadow-md shadow-[#6C45C7]/20 font-bold'
              : 'bg-[#FFFDF7] text-[#6E5D77] hover:text-[#29202F] hover:bg-[#FAF2E1] border border-[#EFE3CF]'
          }`}
        >
          <span>Hoy</span>
        </button>

        <button
          type="button"
          id="filter-preset-7d"
          onClick={() => handlePresetSelect('7d')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
            filter.preset === '7d'
              ? 'bg-[#6C45C7] text-white shadow-md shadow-[#6C45C7]/20 font-bold'
              : 'bg-[#FFFDF7] text-[#6E5D77] hover:text-[#29202F] hover:bg-[#FAF2E1] border border-[#EFE3CF]'
          }`}
        >
          <span>Últimos 7 días</span>
        </button>

        <button
          type="button"
          id="filter-preset-30d"
          onClick={() => handlePresetSelect('30d')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
            filter.preset === '30d'
              ? 'bg-[#6C45C7] text-white shadow-md shadow-[#6C45C7]/20 font-bold'
              : 'bg-[#FFFDF7] text-[#6E5D77] hover:text-[#29202F] hover:bg-[#FAF2E1] border border-[#EFE3CF]'
          }`}
        >
          <span>Últimos 30 días</span>
        </button>

        <button
          type="button"
          id="filter-preset-single"
          onClick={() => handlePresetSelect('single')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
            filter.preset === 'single'
              ? 'bg-[#6C45C7] text-white shadow-md shadow-[#6C45C7]/20 font-bold'
              : 'bg-[#FFFDF7] text-[#6E5D77] hover:text-[#29202F] hover:bg-[#FAF2E1] border border-[#EFE3CF]'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Día específico</span>
        </button>

        <button
          type="button"
          id="filter-preset-custom"
          onClick={() => handlePresetSelect('custom')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
            filter.preset === 'custom'
              ? 'bg-[#6C45C7] text-white shadow-md shadow-[#6C45C7]/20 font-bold'
              : 'bg-[#FFFDF7] text-[#6E5D77] hover:text-[#29202F] hover:bg-[#FAF2E1] border border-[#EFE3CF]'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>Rango personalizado</span>
        </button>
      </div>

      {/* Dynamic Date Inputs for Single Day or Custom Range */}
      {isCustomOpen && (
        <div className="pt-2 animate-in fade-in slide-in-from-top-2 duration-150">
          {filter.preset === 'single' ? (
            <div className="flex flex-wrap items-center gap-3 p-3.5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF]">
              <label htmlFor="single-date-input" className="text-xs text-[#29202F] font-medium flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[#6C45C7]" />
                <span>Seleccionar fecha a inspeccionar:</span>
              </label>
              <input
                type="date"
                id="single-date-input"
                value={filter.startDate || customStart}
                max={getTodayString()}
                onChange={(e) => handleSingleDayChange(e.target.value)}
                className="bg-white border border-[#DECDB3] hover:border-[#6C45C7] rounded-xl px-3 py-1.5 text-xs text-[#29202F] focus:outline-none focus:border-[#6C45C7] transition-colors cursor-pointer"
              />
              <span className="text-[11px] text-[#6E5D77]">
                Se muestran solo las métricas y registros guardados en esta fecha exacta.
              </span>
            </div>
          ) : (
            <form
              onSubmit={handleApplyCustomRange}
              className="flex flex-wrap items-center gap-3 p-3.5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF]"
            >
              <div className="flex items-center gap-2">
                <label htmlFor="custom-date-start" className="text-xs text-[#6E5D77] font-medium">
                  Desde:
                </label>
                <input
                  type="date"
                  id="custom-date-start"
                  value={customStart}
                  max={customEnd || getTodayString()}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="bg-white border border-[#DECDB3] hover:border-[#6C45C7] rounded-xl px-3 py-1.5 text-xs text-[#29202F] focus:outline-none focus:border-[#6C45C7] transition-colors cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="custom-date-end" className="text-xs text-[#6E5D77] font-medium">
                  Hasta:
                </label>
                <input
                  type="date"
                  id="custom-date-end"
                  value={customEnd}
                  min={customStart}
                  max={getTodayString()}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="bg-white border border-[#DECDB3] hover:border-[#6C45C7] rounded-xl px-3 py-1.5 text-xs text-[#29202F] focus:outline-none focus:border-[#6C45C7] transition-colors cursor-pointer"
                />
              </div>

              <button
                type="submit"
                id="apply-custom-date-btn"
                className="px-4 py-1.5 rounded-xl bg-[#62B95B] hover:bg-[#52A54C] text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Aplicar Rango</span>
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
