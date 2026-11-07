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
import {
  getStageIcon,
  getLocalTodayDateOnly,
  isFloweringStage,
  isPreFloweringStage,
  computeStageTransition,
} from '../../../utils/growthStageUtils';
import { indoorService, useIndoors } from '../../../services/indoorService';
import { PhotoperiodPresetPicker } from '../PhotoperiodPresetPicker';
import { useDevicesOverview, lightBindingFor } from '../../../services/devicesService';
import { darkHoursFor, describePhotoperiod } from '../../../utils/photoperiods';

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
  const todayStr = getLocalTodayDateOnly();
  // Superciclos: solo si la luz de este cultivo está en un enchufe inteligente (cada encendido se corre)
  const devicesOverview = useDevicesOverview();
  const hasSmartPlug = !!(lightBindingFor(devicesOverview, cultivation.id) || (cultivation.indoorId && lightBindingFor(devicesOverview, cultivation.indoorId)));
  // en un ambiente interior la luz es compartida: el fotoperiodo nuevo vale para todo el ambiente
  const indoor = useIndoors().find((i) => i.id === cultivation.indoorId && i.environment !== 'exterior') || null;

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
    if (isFloweringStage(stageName) || isPreFloweringStage(stageName)) {
      return 12;
    }

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
      setEffectiveDate(getLocalTodayDateOnly());
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

  const isEnteringFlowering =
    isFloweringStage(selectedStageName) &&
    !isFloweringStage(cultivation.currentStage);

  const handleStageSelect = (stageName: string) => {
    setSelectedStageName(stageName);
    setCustomLightHours(getDefaultHoursForStage(stageName));
  };

  const darkHours = darkHoursFor(customLightHours);
  const photoperiod = describePhotoperiod(customLightHours, darkHours);

  const handleConfirmTransition = async () => {
    try {
      setSaving(true);
      setError(null);

      const { updatedStages, updates } = computeStageTransition(
        cultivation,
        stages,
        selectedStageName,
        effectiveDate,
        {
          updatePhotoperiod,
          customLightHours,
        }
      );

      // Handle harvest or finished
      if (selectedStageName === 'Cosecha' || selectedStageName === 'Finalizado') {
        updates.isFinished = true;
      }

      await indoorService.saveCropUpdates(cultivation, updates, userId);

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
    <div className="cultiveta-modal-overlay animate-in fade-in">
      <div className="cultiveta-modal-container my-auto max-w-xl overflow-hidden">
        {/* Header */}
        <header className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-ok-bg text-ok-ink flex items-center justify-center text-xl shadow-2xs">
              {getStageIcon(selectedStageName)}
            </div>
            <div>
              <h3 className="font-extrabold text-base text-ink">
                Avanzar o cambiar de etapa
              </h3>
              <p className="text-xs text-ink-muted font-medium">
                Actual: <strong className="text-ink">{cultivation.currentStage}</strong> → Nueva:{' '}
                <strong className="text-ok-ink">{selectedStageName}</strong>
              </p>
            </div>
          </div>
          <button aria-label="Cerrar"
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-ink-subtle hover:text-ink hover:bg-line transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3.5 rounded-2xl bg-error/10 border border-error/30 text-error text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-error" />
              <span>{error}</span>
            </div>
          )}

          {/* Stage Selection Pills */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-ink">
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
                        ? 'bg-brand-deep text-white border-ok-line shadow-md ring-2 ring-ok'
                        : 'bg-surface hover:bg-track text-ink border-line'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-lg">{icon}</span>
                      {isCurrent && (
                        <span
                          className={`text-[11px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                            isSelected ? 'bg-brand-deep text-white' : 'bg-line text-ink'
                          }`}
                        >
                          Actual
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="font-extrabold text-xs leading-tight truncate">{st.name}</div>
                      <div
                        className={`text-[11px] font-medium ${
                          isSelected ? 'text-white' : 'text-ink-subtle'
                        }`}
                      >
                        {st.expectedDurationDays} {st.expectedDurationDays === 1 ? 'día' : 'días'} est.
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Effective Date Picker */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-ink">
              Fecha de inicio de la nueva etapa:
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="stage-transition-date-input"
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-2xl bg-surface border border-line text-ink text-xs font-bold focus:bg-white focus:ring-2 focus:ring-ok focus:outline-none"
                />
                <Calendar className="w-4 h-4 text-ink-subtle absolute left-3 top-3 pointer-events-none" />
              </div>
              <button
                type="button"
                onClick={() => setEffectiveDate(todayStr)}
                className="px-3 py-2.5 rounded-2xl border border-line bg-track hover:bg-line text-ink text-xs font-bold transition-all cursor-pointer shadow-2xs"
              >
                Hoy
              </button>
            </div>
            <p className="text-xs text-ink-subtle">
              Se registrará como el día de inicio para el cálculo de semanas, progreso y alertas.
            </p>
          </div>

          {/* Dedicated Photoperiod Editor (12-12 for flowering, editable to 13-11, etc.) */}
          {cultivation.type !== 'Outdoor' && (
            <div className="p-4 rounded-3xl bg-warn-bg border border-warn-line space-y-3.5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-warn-line text-ink flex items-center justify-center shadow-2xs shrink-0">
                    <Sun className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-warn-ink flex items-center gap-2">
                      <span>Horas de luz</span>
                      {isFloweringStage(selectedStageName) ? (
                        <span className="px-2 py-0.5 rounded-full bg-warn-bg text-warn-ink text-[11px] font-black uppercase tracking-wider">
                          Floración (12/12 sugerido)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-line text-ink text-[11px] font-black uppercase tracking-wider">
                          Vegetativo
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-warn-ink font-medium">
                      {isFloweringStage(selectedStageName)
                        ? 'Al pasar a floración se ajusta a 12/12 por defecto. También podés elegir 13/11: floración con una hora más de luz para sumar peso en las flores.'
                        : 'Ajustá las horas de luz y oscuridad para esta fase del cultivo.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto bg-warn-bg px-2.5 py-1 rounded-xl border border-warn-line">
                  <input
                    id="sync-photoperiod-checkbox"
                    type="checkbox"
                    checked={updatePhotoperiod}
                    onChange={(e) => setUpdatePhotoperiod(e.target.checked)}
                    className="w-4 h-4 rounded text-ok-ink border-warn-line focus:ring-ok cursor-pointer"
                  />
                  <label
                    htmlFor="sync-photoperiod-checkbox"
                    className="text-xs font-bold text-warn-ink cursor-pointer select-none"
                  >
                    Actualizar temporizador
                  </label>
                </div>
              </div>

              {updatePhotoperiod && indoor && (
                <p id="stage-indoor-light-note" className="text-xs font-bold text-warn-ink bg-white/70 border border-warn-line rounded-xl px-3 py-2">
                  La luz es la del ambiente {indoor.name}: el fotoperiodo nuevo vale para todas sus plantas.
                </p>
              )}

              {updatePhotoperiod && (
                <div className="space-y-3 pt-2.5 border-t border-warn-line">
                  {/* Fotoperiodo elegido */}
                  <div className="flex items-center justify-center bg-white p-3 rounded-2xl border border-warn-line shadow-2xs">
                    {/* Badge showing full ratio */}
                    <div className="flex items-center gap-2">
                      <div className="px-3.5 py-1.5 rounded-xl bg-warn-bg border border-warn-line text-warn-ink font-black text-xs flex items-center gap-2 shadow-2xs">
                        <span className="flex items-center gap-1 text-warn-ink">
                          <Sun className="w-3.5 h-3.5 text-warn-ink" />
                          {customLightHours}h Luz
                        </span>
                        <span className="text-warn-ink">/</span>
                        <span className="flex items-center gap-1 text-brand">
                          <Moon className="w-3.5 h-3.5 text-brand" />
                          {darkHours}h Oscuridad
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Botones rápidos de fotoperiodo (y superciclos experimentales) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-ink-muted">
                      <span>Ajustes rápidos de fotoperíodo:</span>
                      {photoperiod.name && (
                        <span className="text-warn-ink font-extrabold">
                          ✓ {photoperiod.label} · {photoperiod.name}
                        </span>
                      )}
                    </div>
                    <PhotoperiodPresetPicker
                      idPrefix="preset"
                      hasSmartPlug={hasSmartPlug}
                      light={customLightHours}
                      dark={darkHours}
                      onSelect={(light) => setCustomLightHours(light)}
                    />
                  </div>

                  {/* 24-Hour Visual Day/Night Gauge */}
                  <div className="space-y-1 pt-1">
                    <div className="w-full h-4 rounded-full bg-brand-deep overflow-hidden flex shadow-inner border border-warn-line">
                      <div
                        className="h-full bg-warn-line transition-all duration-300 flex items-center justify-center text-[11px] font-black text-warn-ink"
                        style={{ width: `${photoperiod.lightPct}%` }}
                      >
                        {customLightHours >= 3 && `${customLightHours}h`}
                      </div>
                      <div
                        className="h-full bg-brand-deep transition-all duration-300 flex items-center justify-center text-[11px] font-black text-white"
                        style={{ width: `${photoperiod.darkPct}%` }}
                      >
                        {darkHours >= 3 && `${darkHours}h`}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-ink-muted px-0.5">
                      <span className="flex items-center gap-1 text-warn-ink font-bold">
                        <Sun className="w-3 h-3 text-warn-ink" />
                        Luz: {customLightHours} hs ({photoperiod.lightPct}%)
                      </span>
                      <span className="flex items-center gap-1 text-ink font-bold">
                        <Moon className="w-3 h-3 text-brand" />
                        Oscuridad: {darkHours} hs ({photoperiod.darkPct}%)
                      </span>
                      {photoperiod.supercycle && (
                        <span className="rounded-full bg-warn-bg border border-warn-line px-2 py-0.5 text-[11px] font-black uppercase text-warn-ink">
                          Superciclo {photoperiod.cycleHours} h · Experimental
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stage Agronomic Guidelines Card */}
          {targetStage && (
            <div className="p-4 rounded-3xl bg-ok-bg border border-ok-line space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-ok-ink uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-ok-ink" />
                  <span>Objetivos de {targetStage.name}</span>
                </span>
                <span className="text-xs text-ok-ink font-bold">
                  {targetStage.expectedDurationDays} {targetStage.expectedDurationDays === 1 ? 'día recomendado' : 'días recomendados'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-white/90 border border-ok-line flex items-center gap-2">
                  <Sun className="w-4 h-4 text-warn-ink shrink-0" />
                  <div>
                    <span className="text-[11px] text-ink-muted block">Fotoperíodo</span>
                    <span className="font-bold text-ink">
                      {updatePhotoperiod && cultivation.type !== 'Outdoor'
                        ? `${customLightHours}h luz / ${darkHours}h osc.`
                        : targetStage.photoperiodHoursLight !== undefined
                        ? `${targetStage.photoperiodHoursLight}h luz / ${darkHoursFor(targetStage.photoperiodHoursLight, targetStage.photoperiodHoursDark)}h osc.`
                        : 'No fijado'}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white/90 border border-ok-line flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-error shrink-0" />
                  <div>
                    <span className="text-[11px] text-ink-muted block">Temperatura ideal</span>
                    <span className="font-bold text-ink">
                      {targetStage.targetTempMinC || 20}°C - {targetStage.targetTempMaxC || 26}°C
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-white/90 border border-ok-line flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-brand shrink-0" />
                  <div>
                    <span className="text-[11px] text-ink-muted block">Humedad</span>
                    <span className="font-bold text-ink">
                      {targetStage.targetHumidityMinPct || 45}% -{' '}
                      {targetStage.targetHumidityMaxPct || 65}%
                    </span>
                  </div>
                </div>
              </div>

              {targetStage.notes && (
                <div className="p-2.5 rounded-xl bg-white/70 border border-ok-line text-xs text-ink-muted flex items-start gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5 text-warn-ink shrink-0 mt-0.5" />
                  <span>{targetStage.notes}</span>
                </div>
              )}
            </div>
          )}

          {isEnteringFlowering && (
            <div className="p-3 rounded-2xl bg-ok-bg border border-ok-line text-xs text-ok-ink flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-ok-ink shrink-0 mt-0.5" />
              <div>
                <strong>Inicio de floración:</strong> Se iniciará el conteo de semanas de floración
                a partir del <strong>{effectiveDate}</strong>, permitiendo estimar con precisión el
                punto de engorde y la fecha probable de cosecha.
              </div>
            </div>
          )}

          {isCurrentActive && (
            <div className="p-3 rounded-2xl bg-track text-xs text-ink-muted flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-ok-ink shrink-0" />
              <span>
                Esta es la etapa en la que ya se encuentra el cultivo. Podés confirmar para
                actualizar el fotoperíodo o la fecha de inicio a <strong>{effectiveDate}</strong>.
              </span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="px-6 py-4 border-t border-line bg-surface flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-xs font-bold text-ink-muted hover:text-ink hover:bg-line transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            id="confirm-stage-transition-btn"
            onClick={handleConfirmTransition}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-brand-deep hover:bg-brand-deep text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
          >
            {saving ? (
              <Clock className="w-4 h-4 animate-spin text-white" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-ok-ink" />
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
