import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Sun,
  Moon,
  Thermometer,
  Droplets,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Clock,
  PlayCircle,
  Lightbulb,
  Plus,
  Minus,
} from 'lucide-react';
import { Cultivation, CultivationGrowthStage } from '../../../types';
import { getStageIcon } from '../../../utils/growthStageUtils';
import { cultivationService } from '../../../services/cultivationService';

interface StageTransitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  cultivation: Cultivation;
  initialSelectedStage?: CultivationGrowthStage | null;
  stages: CultivationGrowthStage[];
  userId: string;
  onStageChanged: (updatedCultivation: Cultivation) => void;
}

export const StageTransitionModal: React.FC<StageTransitionModalProps> = ({
  isOpen,
  onClose,
  cultivation,
  initialSelectedStage,
  stages,
  userId,
  onStageChanged,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  const determineDefaultStage = (): string => {
    if (initialSelectedStage?.name) return initialSelectedStage.name;
    const currIdx = stages.findIndex(
      (s) => s.name.toLowerCase().trim() === (cultivation.currentStage || '').toLowerCase().trim()
    );
    if (currIdx !== -1 && currIdx < stages.length - 1) {
      return stages[currIdx + 1].name;
    }
    return cultivation.currentStage || stages[0]?.name || 'Vegetativo';
  };

  const getDefaultHoursForStage = (stageName: string): number => {
    const isFlor = stageName.toLowerCase().includes('flor');
    if (isFlor) return 12;

    const match = stages.find((s) => s.name.toLowerCase().trim() === stageName.toLowerCase().trim());
    if (match && match.photoperiodHoursLight !== undefined) {
      return match.photoperiodHoursLight;
    }

    if (
      stageName.toLowerCase().includes('veg') ||
      stageName.toLowerCase().includes('plánt') ||
      stageName.toLowerCase().includes('germin')
    ) {
      return 18;
    }

    return cultivation.lighting?.photoperiodHoursLight || 18;
  };

  const [selectedStageName, setSelectedStageName] = useState<string>(determineDefaultStage);
  const [effectiveDate, setEffectiveDate] = useState<string>(todayStr);
  const [updatePhotoperiod, setUpdatePhotoperiod] = useState<boolean>(true);
  const [customLightHours, setCustomLightHours] = useState<number>(() => {
    return getDefaultHoursForStage(determineDefaultStage());
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const stageName = initialSelectedStage?.name || determineDefaultStage();
      setSelectedStageName(stageName);
      setCustomLightHours(getDefaultHoursForStage(stageName));
      setEffectiveDate(todayStr);
      setUpdatePhotoperiod(true);
      setError(null);
    }
  }, [isOpen, initialSelectedStage]);

  if (!isOpen) return null;

  const targetStage =
    stages.find((s) => s.name.toLowerCase().trim() === selectedStageName.toLowerCase().trim()) ||
    stages[0];

  const isCurrentActive =
    (cultivation.currentStage || '').toLowerCase().trim() === selectedStageName.toLowerCase().trim();

  const isTransitionToFlowering =
    selectedStageName.toLowerCase().includes('flor') &&
    !(cultivation.currentStage || '').toLowerCase().includes('flor');

  const isFloweringStage = selectedStageName.toLowerCase().includes('flor');

  const handleStageSelect = (stageName: string) => {
    setSelectedStageName(stageName);
    setCustomLightHours(getDefaultHoursForStage(stageName));
  };

  const handleAdjustHours = (delta: number) => {
    setCustomLightHours((prev) => Math.min(24, Math.max(0, prev + delta)));
  };

  const darkHours = Math.max(0, 24 - customLightHours);

  const handleConfirmTransition = async () => {
    try {
      setSaving(true);
      setError(null);

      const targetIdx = stages.findIndex(
        (s) => s.name.toLowerCase().trim() === selectedStageName.toLowerCase().trim()
      );

      // Re-map stages: mark stages before target as completed
      const updatedStages = stages.map((st, idx) => ({
        ...st,
        isCompleted: targetIdx !== -1 && idx < targetIdx,
        photoperiodHoursLight:
          idx === targetIdx && updatePhotoperiod ? customLightHours : st.photoperiodHoursLight,
      }));

      const updates: Partial<Cultivation> = {
        currentStage: selectedStageName,
        stageStartDate: effectiveDate,
        stagesTimeline: updatedStages,
      };

      // Handle flowering date
      if (isFloweringStage) {
        updates.floweringStartDate = effectiveDate;
      }

      // Handle photoperiod sync if requested
      if (updatePhotoperiod && cultivation.type !== 'Outdoor') {
        updates.lighting = {
          ...(cultivation.lighting || { type: 'LED Quantum Board', usedWatts: 240 }),
          photoperiodHoursLight: customLightHours,
          photoperiodHoursDark: darkHours,
        };
      }

      // Handle harvest or finished
      if (selectedStageName === 'Cosecha' || selectedStageName === 'Finalizado') {
        updates.isFinished = true;
      }

      await cultivationService.updateCultivation(cultivation.id, updates, userId);

      const updatedCultivation: Cultivation = {
        ...cultivation,
        ...updates,
      };

      onStageChanged(updatedCultivation);
      onClose();
    } catch (err: any) {
      console.error('Error in stage transition:', err);
      setError(err?.message || 'Ocurrió un error al cambiar la etapa del cultivo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/80 backdrop-blur-xs overflow-y-auto animate-in fade-in">
      <div className="relative w-full max-w-xl bg-white rounded-3xl border border-stone-200 shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <header className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-xl shadow-2xs">
              {getStageIcon(selectedStageName)}
            </div>
            <div>
              <h3 className="font-extrabold text-base text-stone-900">
                Avanzar / Cambiar Etapa del Cultivo
              </h3>
              <p className="text-xs text-stone-500 font-medium">
                Actual: <strong className="text-stone-700">{cultivation.currentStage}</strong> → Nueva:{' '}
                <strong className="text-emerald-700">{selectedStageName}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Stage Selection Pills */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-stone-700">
              Seleccionar la nueva etapa objetivo:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {stages.map((st) => {
                const isSelected = st.name === selectedStageName;
                const isCurrent = st.name === cultivation.currentStage;
                const icon = getStageIcon(st.name);

                return (
                  <button
                    key={st.id || st.name}
                    type="button"
                    onClick={() => handleStageSelect(st.name)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                      isSelected
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-300'
                        : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-lg">{icon}</span>
                      {isCurrent && (
                        <span
                          className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                            isSelected ? 'bg-emerald-700 text-white' : 'bg-stone-200 text-stone-700'
                          }`}
                        >
                          Actual
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="font-extrabold text-xs leading-tight truncate">{st.name}</div>
                      <div
                        className={`text-[10px] font-medium ${
                          isSelected ? 'text-emerald-100' : 'text-stone-400'
                        }`}
                      >
                        {st.expectedDurationDays} días est.
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Effective Date Picker */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-700">
              Fecha de inicio de la nueva etapa:
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="stage-transition-date-input"
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-2xl bg-stone-50 border border-stone-300 text-stone-800 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <Calendar className="w-4 h-4 text-stone-400 absolute left-3 top-3 pointer-events-none" />
              </div>
              <button
                type="button"
                onClick={() => setEffectiveDate(todayStr)}
                className="px-3 py-2.5 rounded-2xl border border-stone-200 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition-all cursor-pointer shadow-2xs"
              >
                Hoy
              </button>
            </div>
            <p className="text-[11px] text-stone-400">
              Se registrará como el día de inicio para el cálculo de semanas, progreso y alertas.
            </p>
          </div>

          {/* Dedicated Photoperiod Editor (12-12 for flowering, editable to 13-11, etc.) */}
          {cultivation.type !== 'Outdoor' && (
            <div className="p-4 rounded-3xl bg-amber-50/80 border border-amber-200 space-y-3.5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-2xs shrink-0">
                    <Sun className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-amber-950 flex items-center gap-2">
                      <span>Fotoperíodo de Iluminación</span>
                      {isFloweringStage ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-black uppercase tracking-wider">
                          Floración (12-12 Sugerido)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-stone-200 text-stone-800 text-[10px] font-black uppercase tracking-wider">
                          Vegetativo
                        </span>
                      )}
                    </h4>
                    <p className="text-[11px] text-amber-800 font-medium">
                      {isFloweringStage
                        ? 'Al pasar a floración se ajusta a 12-12 por defecto. Puedes editar las horas (ej. 13 de luz y 11 de oscuridad).'
                        : 'Ajusta las horas de luz y oscuridad para esta fase del cultivo.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto bg-amber-100/80 px-2.5 py-1 rounded-xl border border-amber-300/60">
                  <input
                    id="sync-photoperiod-checkbox"
                    type="checkbox"
                    checked={updatePhotoperiod}
                    onChange={(e) => setUpdatePhotoperiod(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 border-amber-300 focus:ring-emerald-500 cursor-pointer"
                  />
                  <label
                    htmlFor="sync-photoperiod-checkbox"
                    className="text-xs font-bold text-amber-950 cursor-pointer select-none"
                  >
                    Actualizar temporizador
                  </label>
                </div>
              </div>

              {updatePhotoperiod && (
                <div className="space-y-3 pt-2.5 border-t border-amber-200/70">
                  {/* Hours Adjuster Stepper & Ratio Badge */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-amber-200/80 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-stone-700">Horas de Luz:</span>
                      <div className="flex items-center gap-1 bg-stone-100 rounded-xl p-1 border border-stone-200">
                        <button
                          type="button"
                          id="btn-decrease-light-hours"
                          onClick={() => handleAdjustHours(-1)}
                          disabled={customLightHours <= 0}
                          className="w-7 h-7 rounded-lg bg-white hover:bg-stone-200 text-stone-700 flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
                          title="Disminuir 1 hora"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          id="stage-light-hours-input"
                          type="number"
                          min="0"
                          max="24"
                          value={customLightHours}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val)) {
                              setCustomLightHours(Math.min(24, Math.max(0, val)));
                            }
                          }}
                          className="w-12 text-center text-sm font-black text-stone-900 bg-transparent focus:outline-none"
                        />
                        <button
                          type="button"
                          id="btn-increase-light-hours"
                          onClick={() => handleAdjustHours(1)}
                          disabled={customLightHours >= 24}
                          className="w-7 h-7 rounded-lg bg-white hover:bg-stone-200 text-stone-700 flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
                          title="Aumentar 1 hora"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="text-xs font-bold text-stone-400">hs luz</span>
                    </div>

                    {/* Badge showing full ratio */}
                    <div className="flex items-center gap-2">
                      <div className="px-3.5 py-1.5 rounded-xl bg-amber-100/90 border border-amber-300 text-amber-950 font-black text-xs flex items-center gap-2 shadow-2xs">
                        <span className="flex items-center gap-1 text-amber-800">
                          <Sun className="w-3.5 h-3.5 text-amber-600" />
                          {customLightHours}h Luz
                        </span>
                        <span className="text-amber-400">/</span>
                        <span className="flex items-center gap-1 text-indigo-900">
                          <Moon className="w-3.5 h-3.5 text-indigo-600" />
                          {darkHours}h Oscuridad
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-stone-600">
                      <span>Ajustes rápidos de fotoperíodo:</span>
                      {customLightHours === 13 && darkHours === 11 && (
                        <span className="text-amber-800 font-extrabold">✓ 13h Luz / 11h Oscuridad seleccionada</span>
                      )}
                      {customLightHours === 12 && darkHours === 12 && (
                        <span className="text-emerald-700 font-extrabold">✓ 12h Luz / 12h Oscuridad (Estándar)</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        id="preset-12-12"
                        onClick={() => setCustomLightHours(12)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                          customLightHours === 12 && darkHours === 12
                            ? 'bg-amber-500 text-white shadow-xs ring-2 ring-amber-300'
                            : 'bg-white hover:bg-amber-100 text-stone-700 border border-amber-200'
                        }`}
                      >
                        <Sun className="w-3 h-3 text-amber-200" />
                        <span>12 / 12</span>
                        <span className="text-[10px] font-normal opacity-90">(Estándar Flora)</span>
                      </button>

                      <button
                        type="button"
                        id="preset-13-11"
                        onClick={() => setCustomLightHours(13)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                          customLightHours === 13 && darkHours === 11
                            ? 'bg-amber-600 text-white shadow-xs ring-2 ring-amber-400'
                            : 'bg-white hover:bg-amber-100 text-stone-700 border border-amber-200'
                        }`}
                        title="13 horas de luz y 11 de oscuridad: mayor fotosíntesis y engorde de cogollos sin revertir floración"
                      >
                        <Sun className="w-3 h-3 text-amber-200" />
                        <span>13 / 11</span>
                        <span className="text-[10px] font-normal opacity-90">(Luz extra / Engorde)</span>
                      </button>

                      <button
                        type="button"
                        id="preset-11-13"
                        onClick={() => setCustomLightHours(11)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                          customLightHours === 11 && darkHours === 13
                            ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-300'
                            : 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-200'
                        }`}
                        title="11 horas de luz y 13 de oscuridad: acelera maduración final y floración en sativas puras"
                      >
                        <Moon className="w-3 h-3 text-indigo-300" />
                        <span>11 / 13</span>
                        <span className="text-[10px] font-normal opacity-90">(Maduración rápida)</span>
                      </button>

                      <button
                        type="button"
                        id="preset-18-6"
                        onClick={() => setCustomLightHours(18)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                          customLightHours === 18 && darkHours === 6
                            ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-300'
                            : 'bg-white hover:bg-stone-100 text-stone-700 border border-stone-200'
                        }`}
                      >
                        <Sun className="w-3 h-3 text-emerald-200" />
                        <span>18 / 6</span>
                        <span className="text-[10px] font-normal opacity-90">(Vegetativo)</span>
                      </button>
                    </div>
                  </div>

                  {/* 24-Hour Visual Day/Night Gauge */}
                  <div className="space-y-1 pt-1">
                    <div className="w-full h-4 rounded-full bg-slate-900 overflow-hidden flex shadow-inner border border-amber-300/60">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-300 flex items-center justify-center text-[9px] font-black text-amber-950"
                        style={{ width: `${(customLightHours / 24) * 100}%` }}
                      >
                        {customLightHours >= 3 && `${customLightHours}h`}
                      </div>
                      <div
                        className="h-full bg-slate-900 transition-all duration-300 flex items-center justify-center text-[9px] font-black text-indigo-200"
                        style={{ width: `${(darkHours / 24) * 100}%` }}
                      >
                        {darkHours >= 3 && `${darkHours}h`}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-stone-500 px-0.5">
                      <span className="flex items-center gap-1 text-amber-800 font-bold">
                        <Sun className="w-3 h-3 text-amber-500" />
                        Luz: {customLightHours} hs ({Math.round((customLightHours / 24) * 100)}%)
                      </span>
                      <span className="flex items-center gap-1 text-slate-700 font-bold">
                        <Moon className="w-3 h-3 text-indigo-500" />
                        Oscuridad: {darkHours} hs ({Math.round((darkHours / 24) * 100)}%)
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stage Agronomic Guidelines Card */}
          {targetStage && (
            <div className="p-4 rounded-3xl bg-emerald-50/50 border border-emerald-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Objetivos Agronómicos de {targetStage.name}</span>
                </span>
                <span className="text-[11px] text-emerald-800 font-bold">
                  {targetStage.expectedDurationDays} días recomendados
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-white/90 border border-emerald-200/60 flex items-center gap-2">
                  <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                  <div>
                    <span className="text-[10px] text-stone-500 block">Fotoperíodo</span>
                    <span className="font-bold text-stone-900">
                      {updatePhotoperiod && cultivation.type !== 'Outdoor'
                        ? `${customLightHours}h luz / ${darkHours}h osc.`
                        : targetStage.photoperiodHoursLight !== undefined
                        ? `${targetStage.photoperiodHoursLight}h luz / ${24 - targetStage.photoperiodHoursLight}h osc.`
                        : 'No fijado'}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white/90 border border-emerald-200/60 flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-rose-500 shrink-0" />
                  <div>
                    <span className="text-[10px] text-stone-500 block">Temp. Ideal</span>
                    <span className="font-bold text-stone-900">
                      {targetStage.targetTempMinC || 20}°C - {targetStage.targetTempMaxC || 26}°C
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white/90 border border-emerald-200/60 flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-cyan-500 shrink-0" />
                  <div>
                    <span className="text-[10px] text-stone-500 block">Humedad (HR)</span>
                    <span className="font-bold text-stone-900">
                      {targetStage.targetHumidityMinPct || 45}% -{' '}
                      {targetStage.targetHumidityMaxPct || 65}%
                    </span>
                  </div>
                </div>
              </div>

              {targetStage.notes && (
                <div className="p-2.5 rounded-xl bg-white/70 border border-emerald-200/50 text-[11px] text-stone-600 flex items-start gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>{targetStage.notes}</span>
                </div>
              )}
            </div>
          )}

          {isTransitionToFlowering && (
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200/90 text-xs text-emerald-900 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong>Inicio de Floración:</strong> Se iniciará el conteo de semanas de floración
                a partir del <strong>{effectiveDate}</strong>, permitiendo estimar con precisión el
                punto de engorde y la fecha probable de cosecha.
              </div>
            </div>
          )}

          {isCurrentActive && (
            <div className="p-3 rounded-2xl bg-stone-100 text-xs text-stone-600 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Esta es la etapa en la que ya se encuentra el cultivo. Puedes confirmar para
                actualizar el fotoperíodo o la fecha de inicio a <strong>{effectiveDate}</strong>.
              </span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-xs font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            id="confirm-stage-transition-btn"
            onClick={handleConfirmTransition}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
          >
            {saving ? (
              <Clock className="w-4 h-4 animate-spin text-white" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
            )}
            <span>
              {saving
                ? 'Guardando cambio...'
                : isCurrentActive
                ? 'Guardar Ajuste de Fotoperíodo'
                : `Avanzar a ${selectedStageName}`}
            </span>
          </button>
        </footer>
      </div>
    </div>
  );
};
