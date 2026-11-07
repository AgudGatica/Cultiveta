import React, { useState } from 'react';
import { X, CheckCircle2, Award, Scale, Calendar, Star, ChevronDown, ChevronUp } from 'lucide-react';
import { Cultivation, Harvest } from '../../types';
import { harvestService } from '../../services/harvestService';
import { cultivationService } from '../../services/cultivationService';
import { getLocalTodayDateOnly } from '../../utils/growthStageUtils';

interface FinalizeHarvestModalProps {
  isOpen: boolean;
  onClose: () => void;
  cultivation: Cultivation;
  userId: string;
  onHarvestFinalized: (harvest: Harvest) => void;
  onCultivationUpdated?: (updatedCultivation: Cultivation) => void;
}

export const FinalizeHarvestModal: React.FC<FinalizeHarvestModalProps> = ({
  isOpen,
  onClose,
  cultivation,
  userId,
  onHarvestFinalized,
  onCultivationUpdated,
}) => {
  const totalDays = cultivationService.calculateDays(cultivation.startDate);
  const floweringDays = cultivationService.calculateFloweringDays(cultivation.floweringStartDate);

  // Fecha final: defecto hoy o fecha guardada previamente
  const [harvestDate, setHarvestDate] = useState(
    cultivation.harvestDate || cultivation.endDate || getLocalTodayDateOnly()
  );
  // Peso estimado en gramos
  const [estimatedWeight, setEstimatedWeight] = useState<number | ''>(
    cultivation.estimatedWeight || cultivation.finalWeight || ''
  );
  const [notes, setNotes] = useState(cultivation.statusNotes || '');
  
  // Opciones avanzadas (opcional, ocultas por defecto para mantener el modal sencillo)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [wetWeightGrams, setWetWeightGrams] = useState<number | ''>('');
  const [rating1To5, setRating1To5] = useState(5);
  const [curingNotes, setCuringNotes] = useState('Secado 14 días a 18°C y 55% HR. Curado en frascos herméticos.');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!harvestDate) {
      setError('Por favor selecciona la fecha final de cierre o cosecha.');
      return;
    }

    if (estimatedWeight === '' || Number(estimatedWeight) <= 0) {
      setError('Por favor ingresa un peso estimado válido mayor a 0 gramos.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const weightNum = Number(estimatedWeight);
      const plantCount = cultivation.plantCount || 1;
      const gramsPerPlant = Number((weightNum / plantCount).toFixed(1));
      const nowIso = new Date().toISOString();

      // 1. Actualizar el cultivo en Firestore:
      // Se marca el estado como 'cosechado', etapa como 'Cosechado', isFinished a true,
      // y se registran la fecha final y el peso estimado.
      const cultivationUpdates: Partial<Cultivation> = {
        status: 'cosechado',
        currentStage: 'Cosechado',
        isFinished: true,
        endDate: harvestDate,
        harvestDate: harvestDate,
        estimatedWeight: weightNum,
        finalWeight: weightNum,
        statusNotes: notes.trim() || undefined,
        updatedAt: nowIso,
      };


      // 1. La ficha primero: nunca queda un cultivo cosechado sin su cosecha
      const newHarvest = await harvestService.recordHarvest({
        userId,
        cultivationId: cultivation.id,
        cultivationName: cultivation.name,
        geneticsName: cultivation.geneticsName,
        seedBank: cultivation.seedBank,
        startDate: cultivation.startDate,
        harvestDate,
        totalDays,
        floweringDays: floweringDays || undefined,
        plantCount,
        wetWeightGrams: wetWeightGrams ? Number(wetWeightGrams) : undefined,
        finalDryWeightGrams: weightNum,
        gramsPerPlant,
        rating1To5,
        curingNotes: curingNotes.trim() || undefined,
        finalNotes: notes.trim() || undefined,
        isDemo: cultivation.isDemo,
      });

      // 2. Después, el cultivo (con las notas y la etapa finales)
      await cultivationService.updateCultivation(cultivation.id, cultivationUpdates, userId);

      // 3. Notificar a los componentes superiores
      const updatedCultivation: Cultivation = {
        ...cultivation,
        ...cultivationUpdates,
        harvestId: newHarvest.id,
      };

      if (onCultivationUpdated) {
        onCultivationUpdated(updatedCultivation);
      }

      onHarvestFinalized(newHarvest);
      onClose();
    } catch (err: any) {
      console.error('Error finalizando cultivo en Firestore:', err);
      setError(err?.message || 'No se pudo guardar. Probá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const plantCount = cultivation.plantCount || 1;
  const avgGramsPerPlant = estimatedWeight ? (Number(estimatedWeight) / plantCount).toFixed(1) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="cultiveta-modal-overlay animate-in fade-in"
    >
      <div
        id="finalize-harvest-modal"
        data-testid="finalize-harvest-modal"
        className="cultiveta-modal-container my-auto max-w-lg p-6 sm:p-7"
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between pb-4 border-b border-line mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-warn-bg text-warn-ink">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-ink">
                Finalizar cultivo
              </h2>
              <p className="text-xs text-ink-muted">
                Marcar como <strong className="text-brand">cosechado</strong> y anotar los resultados
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="p-2 text-ink-subtle hover:text-ink rounded-full hover:bg-track transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-error/10 border border-error/30 text-error text-xs font-medium">
            {error}
          </div>
        )}

        {/* Resumen del Cultivo */}
        <div className="mb-5 p-3.5 rounded-2xl bg-surface border border-line text-xs grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-ink-subtle text-xs">Cultivo</div>
            <div className="font-bold text-ink truncate" title={cultivation.name}>
              {cultivation.name}
            </div>
          </div>
          <div>
            <div className="text-ink-subtle text-xs">Duración total</div>
            <div className="font-bold text-ink">{totalDays} días</div>
          </div>
          <div>
            <div className="text-ink-subtle text-xs">Plantas</div>
            <div className="font-bold text-ink">{plantCount} {plantCount === 1 ? 'planta' : 'plantas'}</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Campo 1: Fecha Final */}
          <div>
            <label
              htmlFor="harvest-date-input"
              className="block text-xs font-bold text-ink mb-1.5 flex items-center gap-1.5"
            >
              <Calendar className="w-4 h-4 text-ok-ink" />
              <span>Fecha final / fecha de cosecha *</span>
            </label>
            <input
              id="harvest-date-input"
              data-testid="harvest-date-input"
              type="date"
              required
              value={harvestDate}
              onChange={(e) => setHarvestDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl bg-surface border border-line text-ink text-sm font-semibold focus:outline-hidden focus:border-ok-line focus:bg-white transition-colors"
            />
            <span className="text-xs text-ink-subtle mt-1 block">
              Día en que se realiza el corte o finalización del ciclo.
            </span>
          </div>

          {/* Campo 2: Peso Estimado */}
          <div>
            <label
              htmlFor="harvest-weight-input"
              className="block text-xs font-bold text-ink mb-1.5 flex items-center gap-1.5"
            >
              <Scale className="w-4 h-4 text-warn-ink" />
              <span>Peso estimado de cosecha (gramos) *</span>
            </label>
            <div className="relative">
              <input
                id="harvest-weight-input"
                data-testid="harvest-weight-input"
                type="number"
                step="0.1"
                min="0.1"
                required
                placeholder="ej. 165.5"
                value={estimatedWeight}
                onChange={(e) =>
                  setEstimatedWeight(e.target.value === '' ? '' : parseFloat(e.target.value))
                }
                className="w-full px-4 py-2.5 rounded-2xl bg-warn-bg border border-warn-line text-ink text-base font-extrabold focus:outline-hidden focus:border-warn-line focus:bg-white transition-colors"
              />
              <span className="absolute right-4 top-2.5 text-xs font-bold text-ink-subtle">g</span>
            </div>
            {avgGramsPerPlant && (
              <span className="text-xs text-ok-ink font-medium mt-1 block">
                Promedio estimado: <strong>{avgGramsPerPlant} g</strong> por planta
              </span>
            )}
          </div>

          {/* Campo 3: Notas u Observaciones (Opcional) */}
          <div>
            <label
              htmlFor="harvest-notes-input"
              className="block text-xs font-semibold text-ink mb-1"
            >
              Notas de la cosecha (opcional)
            </label>
            <textarea
              id="harvest-notes-input"
              rows={2}
              placeholder="Aroma, compactación de cogollos, tricomas lechosos/ámbar..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 rounded-2xl bg-surface border border-line text-ink text-xs focus:outline-hidden focus:border-ok-line focus:bg-white transition-colors"
            />
          </div>

          {/* Acordeón Opcional: Opciones Avanzadas */}
          <div className="border border-line rounded-2xl p-2.5 bg-surface">
            <button
              type="button"
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="w-full flex items-center justify-between text-xs font-bold text-ink-muted hover:text-ink transition-colors py-1 px-1 cursor-pointer"
            >
              <span>Detalles adicionales (calificación y curado)</span>
              {showAdvancedOptions ? (
                <ChevronUp className="w-4 h-4 text-ink-subtle" />
              ) : (
                <ChevronDown className="w-4 h-4 text-ink-subtle" />
              )}
            </button>

            {showAdvancedOptions && (
              <div className="pt-3 space-y-3 border-t border-line mt-2 text-xs">
                <div>
                  <label className="block text-ink-muted font-semibold mb-1">
                    Peso Húmedo (opcional en g)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="ej. 600"
                    value={wetWeightGrams}
                    onChange={(e) =>
                      setWetWeightGrams(e.target.value === '' ? '' : parseFloat(e.target.value))
                    }
                    className="w-full px-3 py-1.5 rounded-xl bg-white border border-line text-xs text-ink"
                  />
                </div>

                <div>
                  <label className="block text-ink-muted font-semibold mb-1">
                    Calificación del cultivo
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating1To5(star)}
                        className="p-1 cursor-pointer"
                      >
                        <Star
                          className={`w-5 h-5 ${
                            star <= rating1To5
                              ? 'text-warn-ink fill-warn-line'
                              : 'text-ink-subtle'
                          }`}
                        />
                      </button>
                    ))}
                    <span className="text-xs text-ink-muted ml-1">{rating1To5} / 5</span>
                  </div>
                </div>

                <div>
                  <label className="block text-ink-muted font-semibold mb-1">
                    Condiciones de secado y curado
                  </label>
                  <input
                    type="text"
                    value={curingNotes}
                    onChange={(e) => setCuringNotes(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-white border border-line text-xs text-ink"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Aviso de actualización en Firestore */}
          <div className="p-3 rounded-2xl bg-icon-bg border border-chip-line text-brand text-xs leading-relaxed">
            Al confirmar, el cultivo queda con estado{' '}
            <strong className="text-brand">'cosechado'</strong>, la etapa se marcará como{' '}
            <strong className="text-brand">'Cosechado'</strong> y se archivará con su fecha final y peso estimado.
          </div>

          {/* Botones de acción */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold text-ink-muted hover:bg-track transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="submit-finalize-harvest-btn"
              data-testid="submit-finalize-harvest-btn"
              disabled={loading}
              className="px-6 py-2.5 rounded-full text-xs sm:text-sm font-bold bg-accent hover:bg-warn-line text-ink shadow-md transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-ink border-t-transparent rounded-full animate-spin" />
                  <span>Guardando…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Finalizar y marcar como cosechado</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
