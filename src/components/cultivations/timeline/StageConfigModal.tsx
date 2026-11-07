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
  getLocalTodayDateOnly,
  isFloweringStage,
} from '../../../utils/growthStageUtils';
import { indoorService } from '../../../services/indoorService';
import { darkHoursFor } from '../../../utils/photoperiods';

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
  // la preflora y la maduración son parte de la floración (desde el 12/12 hasta el corte)
  'Floración',
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
    cultivation.stageStartDate || cultivation.startDate || getLocalTodayDateOnly()
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

    let curr = cultivation.startDate || getLocalTodayDateOnly();
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
      name: 'Nueva etapa',
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
      setError('Tiene que quedar al menos una etapa en el ciclo.');
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

      // La floración empieza el día del cambio a 12/12
      let floweringStartDate = cultivation.floweringStartDate;
      if (isFloweringStage(finalActiveStageName) && !floweringStartDate) {
        floweringStartDate = activeStageStartDate || getLocalTodayDateOnly();
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
        const pDark = darkHoursFor(pLight, activeStageObj.photoperiodHoursDark);
        updates.lighting = {
          ...(cultivation.lighting || { type: 'LED Quantum Board', usedWatts: 240 }),
          photoperiodHoursLight: pLight,
          photoperiodHoursDark: pDark,
        };
      }

      await indoorService.saveCropUpdates(cultivation, updates, userId);

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
    <div className="cultiveta-modal-overlay animate-in fade-in">
      <div className="cultiveta-modal-container my-auto max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <header className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-lg text-ink">
                Definir etapas
              </h3>
            </div>
            <p className="text-xs text-ink-muted mt-0.5">
              Personalizá la duración, fotoperíodo y objetivos de cada fase para{' '}
              <strong className="text-ink">{cultivation.name}</strong>.
            </p>
          </div>
          <button aria-label="Cerrar"
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-ink-subtle hover:text-ink hover:bg-line transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 rounded-2xl bg-error/10 border border-error/30 text-error text-xs flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Presets Selection */}
          <div className="p-4 rounded-2xl bg-ok-bg border border-ok-line space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-ok-ink">
                <Sparkles className="w-4 h-4 text-ok-ink" />
                <span>Cargar plantilla predefinida</span>
              </div>
              <span className="text-xs text-ok-ink">
                Reemplaza la lista con un ciclo probado
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {STAGE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className="p-2.5 rounded-xl text-left bg-white border border-ok-line hover:border-ok-line hover:shadow-2xs transition-all cursor-pointer group"
                >
                  <span className="text-xs font-bold text-ink block group-hover:text-ok-ink truncate">
                    {preset.name.split('(')[0].trim()}
                  </span>
                  <span className="text-[11px] text-ink-muted block line-clamp-1 mt-0.5">
                    {preset.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Current Stage Selection Banner */}
          <div className="p-4 rounded-2xl bg-surface border border-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-ink block">
                Etapa actual del cultivo
              </span>
              <span className="text-xs text-ink-muted">
                Determina qué hito se encuentra activo en este momento en la línea de tiempo.
              </span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <select
                id="active-stage-select"
                value={stages.some((s) => s.name === activeStageName) ? activeStageName : (stages[0]?.name || '')}
                onChange={(e) => setActiveStageName(e.target.value)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-line text-ink focus:ring-2 focus:ring-ok focus:outline-none"
              >
                {stages.map((st) => (
                  <option key={st.id} value={st.name}>
                    {getStageIcon(st.name)} {st.name}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                <Calendar className="w-3.5 h-3.5 text-ink-subtle" />
                <input
                  type="date"
                  value={activeStageStartDate}
                  onChange={(e) => setActiveStageStartDate(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl text-xs bg-white border border-line text-ink focus:outline-none focus:ring-2 focus:ring-ok font-medium"
                  title="Fecha en que comenzó la etapa actual"
                />
              </div>
            </div>
          </div>

          {/* Stages List Configuration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-ink-muted">
                Etapas del Ciclo ({stages.length})
              </h4>
              <button
                type="button"
                onClick={handleAddStage}
                className="px-3 py-1.5 rounded-xl bg-brand-deep hover:bg-brand-deep text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Sumar etapa</span>
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
                        ? 'bg-ok-bg border-ok-line ring-1 ring-ok shadow-xs'
                        : 'bg-white border-line hover:border-line'
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
                            className="p-1 text-ink-subtle hover:text-ink disabled:opacity-20 cursor-pointer"
                            title="Mover arriba"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={index === stages.length - 1}
                            onClick={() => handleMoveStage(index, 'down')}
                            className="p-1 text-ink-subtle hover:text-ink disabled:opacity-20 cursor-pointer"
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
                            className="font-bold text-sm text-ink bg-transparent border-b border-transparent hover:border-line focus:border-ok-line focus:outline-none w-full max-w-[200px]"
                            placeholder="Nombre de etapa"
                          />
                          <datalist id={`common-stages-${st.id}`}>
                            {COMMON_STAGE_NAMES.map((name) => (
                              <option key={name} value={name} />
                            ))}
                          </datalist>
                          <span className="text-xs text-ink-subtle block">
                            {formatFriendlyDate(st.startDate)} → {formatFriendlyDate(st.endDate)}
                          </span>
                        </div>

                        {isActive && (
                          <span className="px-2 py-0.5 rounded-full bg-brand-deep text-white text-[11px] font-extrabold uppercase tracking-wider">
                            Activa
                          </span>
                        )}
                      </div>

                      {/* Right: Controls (Duration, Light, Temp, Hum, Notes, Delete) */}
                      <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
                        {/* Duration Days */}
                        <div className="flex items-center gap-1 bg-track px-2.5 py-1.5 rounded-xl text-xs font-semibold text-ink border border-line">
                          <span className="text-ink-subtle text-xs">Duración:</span>
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
                            className="w-12 bg-white text-center font-bold rounded-lg border border-line text-xs py-0.5 focus:outline-none focus:ring-1 focus:ring-ok"
                          />
                          <span className="text-ink-muted text-xs">días</span>
                        </div>

                        {/* Photoperiod light hours */}
                        <div className="flex items-center gap-1 bg-track px-2 py-1.5 rounded-xl text-xs font-semibold text-ink border border-line max-w-full min-w-0">
                          <Sun className="w-3.5 h-3.5 text-warn-ink shrink-0" aria-hidden="true" />
                          <select
                            value={st.photoperiodHoursLight ?? 18}
                            onChange={(e) =>
                              handleUpdateStage(index, {
                                photoperiodHoursLight: parseInt(e.target.value),
                              })
                            }
                            aria-label="Horas de luz"
                            className="min-h-8 min-w-0 max-w-[13rem] truncate bg-transparent font-bold text-xs text-ink focus:outline-none cursor-pointer"
                          >
                            <option value={18}>18/6 · Vegetativo</option>
                            <option value={20}>20/4 · Vegetativo largo (recomendado para autoflorecientes)</option>
                            <option value={12}>12/12 · Floración clásica</option>
                            <option value={13}>13/11 · Floración +1 h</option>
                            {st.photoperiodHoursLight !== undefined &&
                              ![0, 12, 13, 18, 20].includes(st.photoperiodHoursLight) && (
                                <option value={st.photoperiodHoursLight}>
                                  {st.photoperiodHoursLight}/{24 - st.photoperiodHoursLight} · Actual (fuera de las opciones)
                                </option>
                              )}
                            <option value={0}>0h (Oscuridad total)</option>
                            <option disabled value="superciclo-26">13/13 · Superciclo floración 26 h (experimental, requiere enchufe Wi-Fi)</option>
                            <option disabled value="superciclo-28">14/14 · Superciclo floración 28 h (experimental, requiere enchufe Wi-Fi)</option>
                          </select>
                        </div>

                        {/* Delete Stage */}
                        <button
                          type="button"
                          onClick={() => handleRemoveStage(index)}
                          className="p-1.5 rounded-xl text-ink-subtle hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
                          title="Eliminar etapa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Stage Note / Objective */}
                    <div className="mt-2.5 pt-2 border-t border-line flex items-center gap-2">
                      <span className="text-xs text-ink-subtle font-medium shrink-0">
                        Notas / Guía:
                      </span>
                      <input
                        type="text"
                        value={st.notes || ''}
                        onChange={(e) => handleUpdateStage(index, { notes: e.target.value })}
                        placeholder="Ej. Realizar poda apical en 4to nudo, trasplante, o comenzar lavado..."
                        className="flex-1 text-xs text-ink bg-surface rounded-lg px-2.5 py-1 border border-line focus:bg-white focus:outline-none focus:border-ok-line"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <footer className="px-6 py-4 border-t border-line flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-surface">
          <button
            type="button"
            onClick={() => handleRecalculateDates(stages, cultivation.startDate)}
            className="min-h-11 text-xs font-semibold text-ink-muted hover:text-ink flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-ink-subtle" aria-hidden="true" />
            <span>Recalcular las fechas en orden</span>
          </button>

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-h-11 px-4 py-2 rounded-2xl text-xs font-bold text-ink-muted hover:bg-line transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              id="save-stages-btn"
              onClick={handleSave}
              disabled={saving}
              className="min-h-11 px-5 py-2 rounded-2xl bg-brand-deep hover:bg-brand-deep text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Guardando...' : 'Guardar etapas'}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
