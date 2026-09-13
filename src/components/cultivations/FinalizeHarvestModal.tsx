import React, { useState } from 'react';
import { X, CheckCircle2, Award, Scale, Star, Sparkles, FileText } from 'lucide-react';
import { Cultivation, Harvest } from '../../types';
import { harvestService } from '../../services/harvestService';
import { cultivationService } from '../../services/cultivationService';

interface FinalizeHarvestModalProps {
  isOpen: boolean;
  onClose: () => void;
  cultivation: Cultivation;
  userId: string;
  onHarvestFinalized: (harvest: Harvest) => void;
}

export const FinalizeHarvestModal: React.FC<FinalizeHarvestModalProps> = ({
  isOpen,
  onClose,
  cultivation,
  userId,
  onHarvestFinalized,
}) => {
  const totalDays = cultivationService.calculateDays(cultivation.startDate);
  const floweringDays = cultivationService.calculateFloweringDays(cultivation.floweringStartDate);

  const [harvestDate, setHarvestDate] = useState(new Date().toISOString().split('T')[0]);
  const [finalDryWeightGrams, setFinalDryWeightGrams] = useState<number | ''>('');
  const [wetWeightGrams, setWetWeightGrams] = useState<number | ''>('');
  const [rating1To5, setRating1To5] = useState(5);
  const [aromaReview, setAromaReview] = useState('');
  const [flavorReview, setFlavorReview] = useState('');
  const [structureDensityReview, setStructureDensityReview] = useState('');
  const [curingNotes, setCuringNotes] = useState('Secado 14 días a 18°C y 55% HR. Curado en frascos de vidrio con Boveda 62%.');
  const [finalNotes, setFinalNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalDryWeightGrams || Number(finalDryWeightGrams) <= 0) {
      setError('Por favor indica el peso seco final obtenido en gramos.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const dryGrams = Number(finalDryWeightGrams);
      const plantCount = cultivation.plantCount || 1;
      const gramsPerPlant = Number((dryGrams / plantCount).toFixed(1));

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
        finalDryWeightGrams: dryGrams,
        gramsPerPlant,
        rating1To5,
        aromaReview: aromaReview.trim() || undefined,
        flavorReview: flavorReview.trim() || undefined,
        structureDensityReview: structureDensityReview.trim() || undefined,
        curingNotes: curingNotes.trim() || undefined,
        finalNotes: finalNotes.trim() || undefined,
        isDemo: cultivation.isDemo,
      });

      onHarvestFinalized(newHarvest);
      onClose();
    } catch (err: any) {
      console.error('Error recording harvest', err);
      setError(err?.message || 'No se pudo registrar la finalización del cultivo.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div
        id="finalize-harvest-modal"
        className="w-full max-w-xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-stone-200 my-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-100 text-amber-800">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">Finalizar Cultivo y Cosecha 🏁</h2>
              <p className="text-xs text-stone-500">
                Registra los resultados finales de {cultivation.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-700 rounded-full hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          {/* Summary Box */}
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 text-xs grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-stone-400">Duración total</div>
              <div className="text-base font-bold text-stone-800">{totalDays} días</div>
            </div>
            <div>
              <div className="text-stone-400">Floración</div>
              <div className="text-base font-bold text-amber-700">{floweringDays || 'N/A'} días</div>
            </div>
            <div>
              <div className="text-stone-400">Plantas</div>
              <div className="text-base font-bold text-stone-800">{cultivation.plantCount}</div>
            </div>
          </div>

          {/* Grams Registration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1 flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-emerald-600" />
                Peso Seco Final (Gramos) *
              </label>
              <input
                id="harvest-dry-weight-input"
                type="number"
                step="0.1"
                min="0.1"
                required
                placeholder="ej. 145.5"
                value={finalDryWeightGrams}
                onChange={(e) => setFinalDryWeightGrams(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="w-full px-4 py-2.5 rounded-2xl bg-emerald-50/50 border border-emerald-300 text-stone-900 text-base font-bold focus:outline-hidden focus:border-emerald-500 focus:bg-white"
              />
              <span className="text-[10px] text-stone-400 mt-1 block">
                {finalDryWeightGrams && cultivation.plantCount
                  ? `Promedio: ${(Number(finalDryWeightGrams) / cultivation.plantCount).toFixed(1)} g / planta`
                  : 'Obligatorio para tus estadísticas históricas'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Peso Húmedo (opcional en g)</label>
              <input
                id="harvest-wet-weight-input"
                type="number"
                step="0.5"
                min="0"
                placeholder="ej. 680"
                value={wetWeightGrams}
                onChange={(e) => setWetWeightGrams(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-sm focus:outline-hidden focus:border-emerald-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Rating */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-2">Calificación personal del cultivo</label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating1To5(star)}
                  className="p-1 text-2xl transition-transform hover:scale-110 cursor-pointer"
                >
                  <Star
                    className={`w-7 h-7 ${
                      star <= rating1To5 ? 'text-amber-400 fill-amber-400' : 'text-stone-300'
                    }`}
                  />
                </button>
              ))}
              <span className="text-xs font-bold text-stone-600 ml-2">{rating1To5} de 5 estrellas</span>
            </div>
          </div>

          {/* Organoleptic Notes */}
          <div className="space-y-3 pt-2 border-t border-stone-100">
            <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">Cata y Evaluación Final</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Aroma final</label>
                <input
                  type="text"
                  placeholder="ej. Dulce, terroso, pino, combustible"
                  value={aromaReview}
                  onChange={(e) => setAromaReview(e.target.value)}
                  className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Sabor final</label>
                <input
                  type="text"
                  placeholder="ej. Cítrico, mentolado, suave"
                  value={flavorReview}
                  onChange={(e) => setFlavorReview(e.target.value)}
                  className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Estructura y densidad</label>
              <input
                type="text"
                placeholder="ej. Cogollos compactos, excelente relación cáliz/hoja"
                value={structureDensityReview}
                onChange={(e) => setStructureDensityReview(e.target.value)}
                className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">Secado y Curado</label>
              <textarea
                rows={2}
                value={curingNotes}
                onChange={(e) => setCuringNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full text-sm font-semibold text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="finalize-harvest-submit-btn"
              disabled={loading}
              className="px-6 py-2.5 rounded-full text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Finalizar y Archivar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
