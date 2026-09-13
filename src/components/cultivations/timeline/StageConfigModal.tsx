import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Calendar,
  Sun,
  Thermometer,
  Droplets,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Save,
  RotateCcw,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';
import { Cultivation, CultivationGrowthStage, CultivationStageName } from '../../../types';
import {
  STAGE_PRESETS,
  addDays,
  formatFriendlyDate,
  getStageIcon,
} from '../../../utils/growthStageUtils';
import { cultivationService } from '../../../services/cultivationService';

interface StageConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  cultivation: Cultivation;
  userId: string;
  initialStages: CultivationGrowthStage[];
  onStagesUpdated: (updatedCultivation: Cultivation) => void;
}

const COMMON_STAGE_NAMES: CultivationStageName[] = [
  'Germinación',
  'Plántula',
  'Vegetativo',
  'Prefloración',
  'Floración',
  'Maduración',
  'Cosecha',
  'Secado',
  'Curado',
];

export const StageConfigModal: React.FC<StageConfigModalProps> = ({
  isOpen,
  onClose,
  cultivation,
  userId,
  initialStages,
  onStagesUpdated,
}) => {
  const [stages, setStages] = useState<CultivationGrowthStage[]>(() => {
    // Deep clone initial stages
    return initialStages.map((s) => ({ ...s }));
  });
  const [activeStageName, setActiveStageName] = useState<string>(cultivation.currentStage);
  const [activeStageStartDate, setActiveStageStartDate] = useState<string>(
    cultivation.stageStartDate || cultivation.startDate || new Date().toISOString().split('T')[0]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Recalculate dates automatically from start date
  const handleRecalculateDates = (stagesList: CultivationGrowthStage[], startDate: string) => {
    let curr = startDate;
    return stagesList.map((st) => {
      const start = curr;
      const end = addDays(start, st.expectedDurationDays || 7);
      curr = end;
      return {
        ...st,
        startDate: start,
        endDate: end,
      };
    });
  };

  const applyPreset = (presetId: string) => {
    const preset = STAGE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    let curr = cultivation.startDate || new Date().toISOString().split('T')[0];
    const newStages: CultivationGrowthStage[] = preset.stages.map((item, idx) => {
      let duration = item.expectedDurationDays;
      if (item.name === 'Floración' && cultivation.declaredFloweringWeeks) {
        duration = Math.max(28, cultivation.declaredFloweringWeeks * 7);
      }
      const start = curr;
      const end = addDays(start, duration);
      curr = end;

      return {
        id: `stage_${Date.now()}_${idx}`,
        name: item.name,
        startDate: start,
        endDate: end,
        expectedDurationDays: duration,
        photoperiodHoursLight: item.photoperiodHoursLight,
        targetTempMinC: item.targetTempMinC,
        targetTempMaxC: item.targetTempMaxC,
        targetHumidityMinPct: item.targetHumidityMinPct,
        targetHumidityMaxPct: item.targetHumidityMaxPct,
        notes: item.notes,
        isCompleted: false,
      };
    });

    setStages(newStages);
  };

  const handleUpdateStage = (index: number, updates: Partial<CultivationGrowthStage>) => {
    setStages((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };

      // If duration or startDate changed, recalculate downstream endDates
      if (updates.expectedDurationDays !== undefined || updates.startDate !== undefined) {
        let curr = next[0].startDate || cultivation.startDate;
        for (let i = 0; i < next.length; i++) {
          next[i].startDate = curr;
          const end = addDays(curr, next[i].expectedDurationDays || 7);
          next[i].endDate = end;
          curr = end;
        }
      }
      return next;
    });
  };

  const handleAddStage = () => {
    const lastStage = stages[stages.length - 1];
    const newStartDate = lastStage ? (lastStage.endDate || addDays(lastStage.startDate, lastStage.expectedDurationDays)) : cultivation.startDate;
    const newStage: CultivationGrowthStage = {
      id: `stage_custom_${Date.now()}`,
      name: 'Nueva Etapa',
      startDate: newStartDate,
      endDate: addDays(newStartDate, 14),
      expectedDurationDays: 14,
      photoperiodHoursLight: 18,
      notes: '',
      isCompleted: false,
    };
    setStages((prev) => [...prev, newStage]);
  };

  const handleRemoveStage = (index: number) => {
    if (stages.length <= 1) {
      setError('Debes mantener al menos una etapa en el ciclo.');
      return;
    }
    setStages((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return handleRecalculateDates(next, cultivation.startDate);
    });
  };

  const handleMoveStage = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= stages.length) return;

    setStages((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIdx];
      next[targetIdx] = temp;
      return handleRecalculateDates(next, cultivation.startDate);
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      // Verify and set completion status relative to activeStageName with case-insensitive, trimmed matching
      const activeIdx = stages.findIndex(
        (s) => s.name.toLowerCase().trim() === (activeStageName || '').toLowerCase().trim()
      );
      const finalActiveStageName = activeIdx !== -1 ? stages[activeIdx].name : (stages[0]?.name || activeStageName || 'Vegetativo');

      const updatedStages = stages.map((st, idx) => ({
        ...st,
        isCompleted: activeIdx !== -1 && idx < activeIdx,
      }));

      // Determine flowering start date if entering or in flowering
      let floweringStartDate = cultivation.floweringStartDate;
      if (
        (finalActiveStageName === 'Floración' || finalActiveStageName.toLowerCase().includes('flor')) &&
        !floweringStartDate
      ) {
        floweringStartDate = activeStageStartDate || new Date().toISOString().split('T')[0];
      }

      const updates: Partial<Cultivation> = {
        stagesTimeline: updatedStages,
        currentStage: finalActiveStageName,
        stageStartDate: activeStageStartDate,
        floweringStartDate,
      };

      // Sync cultivation lighting with active stage photoperiod
      const activeStageObj = activeIdx !== -1 ? stages[activeIdx] : null;
      if (activeStageObj && activeStageObj.photoperiodHoursLight !== undefined && cultivation.type !== 'Outdoor') {
        const pLight = activeStageObj.photoperiodHoursLight;
        const pDark = Math.max(0, 24 - pLight);
        updates.lighting = {
          ...(cultivation.lighting || { type: 'LED Quantum Board', usedWatts: 240 }),
          photoperiodHoursLight: pLight,
          photoperiodHoursDark: pDark,
        };
      }

      await cultivationService.updateCultivation(cultivation.id, updates, userId);

      const updatedCultivation: Cultivation = {
        ...cultivation,
        ...updates,
      };

      onStagesUpdated(updatedCultivation);
      onClose();
    } catch (err: any) {
      console.error('Error saving stages', err);
      setError(err?.message || 'No se pudieron guardar las etapas.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/80 backdrop-blur-xs overflow-y-auto animate-in fade-in">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl border border-stone-200 shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]">
        {/* Header */}
        <header className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/70">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🌱</span>
              <h3 className="font-extrabold text-lg text-stone-900">
                Definir Etapas de Crecimiento y Cronograma
              </h3>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Personaliza la duración, fotoperíodo y objetivos de cada fase para{' '}
              <strong className="text-stone-800">{cultivation.name}</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Presets Selection */}
          <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                <Sparkles className="w-4 h-4 text-emerald-700" />
                <span>Cargar Plantilla Predefinida</span>
              </div>
              <span className="text-[11px] text-emerald-800">
                Reemplaza la lista con un ciclo probado
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {STAGE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className="p-2.5 rounded-xl text-left bg-white border border-emerald-200/80 hover:border-emerald-500 hover:shadow-2xs transition-all cursor-pointer group"
                >
                  <span className="text-xs font-bold text-stone-900 block group-hover:text-emerald-700 truncate">
                    {preset.name.split('(')[0].trim()}
                  </span>
                  <span className="text-[10px] text-stone-500 block line-clamp-1 mt-0.5">
                    {preset.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Current Stage Selection Banner */}
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-stone-900 block">
                Etapa Actual del Cultivo
              </span>
              <span className="text-[11px] text-stone-500">
                Determina qué hito se encuentra activo en este momento en la línea de tiempo.
              </span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <select
                id="active-stage-select"
                value={stages.some((s) => s.name === activeStageName) ? activeStageName : (stages[0]?.name || '')}
                onChange={(e) => setActiveStageName(e.target.value)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-stone-300 text-stone-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                {stages.map((st) => (
                  <option key={st.id} value={st.name}>
                    {getStageIcon(st.name)} {st.name}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1.5 text-xs text-stone-600">
                <Calendar className="w-3.5 h-3.5 text-stone-400" />
                <input
                  type="date"
                  value={activeStageStartDate}
                  onChange={(e) => setActiveStageStartDate(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl text-xs bg-white border border-stone-300 text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  title="Fecha en que comenzó la etapa actual"
                />
              </div>
            </div>
          </div>

          {/* Stages List Configuration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-stone-600">
                Etapas del Ciclo ({stages.length})
              </h4>
              <button
                type="button"
                onClick={handleAddStage}
                className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Añadir Etapa</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {stages.map((st, index) => {
                const isActive = st.name === activeStageName;
                const icon = getStageIcon(st.name);

                return (
                  <div
                    key={st.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isActive
                        ? 'bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-400/40 shadow-xs'
                        : 'bg-white border-stone-200/90 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                      {/* Left: Stage Icon, Name & Reorder */}
                      <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => handleMoveStage(index, 'up')}
                            className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-20 cursor-pointer"
                            title="Mover arriba"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={index === stages.length - 1}
                            onClick={() => handleMoveStage(index, 'down')}
                            className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-20 cursor-pointer"
                            title="Mover abajo"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>

                        <span className="text-xl shrink-0">{icon}</span>

                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            value={st.name}
                            onChange={(e) => handleUpdateStage(index, { name: e.target.value })}
                            list={`common-stages-${st.id}`}
                            className="font-bold text-sm text-stone-900 bg-transparent border-b border-transparent hover:border-stone-300 focus:border-emerald-600 focus:outline-none w-full max-w-[200px]"
                            placeholder="Nombre de etapa"
                          />
                          <datalist id={`common-stages-${st.id}`}>
                            {COMMON_STAGE_NAMES.map((name) => (
                              <option key={name} value={name} />
                            ))}
                          </datalist>
                          <span className="text-[11px] text-stone-400 block">
                            {formatFriendlyDate(st.startDate)} → {formatFriendlyDate(st.endDate)}
                          </span>
                        </div>

                        {isActive && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold uppercase tracking-wider">
                            Activa
                          </span>
                        )}
                      </div>

                      {/* Right: Controls (Duration, Light, Temp, Hum, Notes, Delete) */}
                      <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
                        {/* Duration Days */}
                        <div className="flex items-center gap-1 bg-stone-100 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-stone-700 border border-stone-200">
                          <span className="text-stone-400 text-[11px]">Duración:</span>
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={st.expectedDurationDays}
                            onChange={(e) =>
                              handleUpdateStage(index, {
                                expectedDurationDays: Math.max(1, parseInt(e.target.value) || 1),
                              })
                            }
                            className="w-12 bg-white text-center font-bold rounded-lg border border-stone-300 text-xs py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          <span className="text-stone-500 text-[11px]">días</span>
                        </div>

                        {/* Photoperiod light hours */}
                        <div className="flex items-center gap-1 bg-stone-100 px-2 py-1.5 rounded-xl text-xs font-semibold text-stone-700 border border-stone-200">
                          <Sun className="w-3.5 h-3.5 text-amber-500" />
                          <select
                            value={st.photoperiodHoursLight ?? 18}
                            onChange={(e) =>
                              handleUpdateStage(index, {
                                photoperiodHoursLight: parseInt(e.target.value),
                              })
                            }
                            className="bg-transparent font-bold text-xs text-stone-800 focus:outline-none cursor-pointer"
                          >
                            <option value={24}>24h (24/0)</option>
                            <option value={20}>20h (20/4)</option>
                            <option value={18}>18h (18/6 - Vegetativo)</option>
                            <option value={14}>14h (14/10)</option>
                            <option value={13}>13h (13/11 - Luz extra / Engorde)</option>
                            <option value={12}>12h (12/12 - Floración estándar)</option>
                            <option value={11}>11h (11/13 - Maduración rápida)</option>
                            <option value={10}>10h (10/14)</option>
                            <option value={0}>0h (Oscuridad total)</option>
                          </select>
                        </div>

                        {/* Delete Stage */}
                        <button
                          type="button"
                          onClick={() => handleRemoveStage(index)}
                          className="p-1.5 rounded-xl text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Eliminar etapa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Stage Note / Objective */}
                    <div className="mt-2.5 pt-2 border-t border-stone-100 flex items-center gap-2">
                      <span className="text-[11px] text-stone-400 font-medium shrink-0">
                        Notas / Guía:
                      </span>
                      <input
                        type="text"
                        value={st.notes || ''}
                        onChange={(e) => handleUpdateStage(index, { notes: e.target.value })}
                        placeholder="Ej. Realizar poda apical en 4to nudo, trasplante, o comenzar lavado..."
                        className="flex-1 text-xs text-stone-700 bg-stone-50/60 rounded-lg px-2.5 py-1 border border-stone-200/80 focus:bg-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <footer className="px-6 py-4 border-t border-stone-200 flex items-center justify-between bg-stone-50">
          <button
            type="button"
            onClick={() => handleRecalculateDates(stages, cultivation.startDate)}
            className="text-xs font-semibold text-stone-600 hover:text-stone-900 flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-stone-400" />
            <span>Recalcular fechas secuenciales</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-2xl text-xs font-bold text-stone-600 hover:bg-stone-200/60 transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              id="save-stages-btn"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Guardando...' : 'Guardar Cronograma'}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
