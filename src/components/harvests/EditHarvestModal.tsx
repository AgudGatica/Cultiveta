import React, { useState, useEffect } from 'react';
import {
  X,
  Scale,
  Star,
  Calendar,
  Sparkles,
  Check,
  Droplets,
  Layers,
  Award,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { Harvest } from '../../types';
import { harvestService } from '../../services/harvestService';

interface EditHarvestModalProps {
  isOpen: boolean;
  onClose: () => void;
  harvest: Harvest | null;
  userId?: string;
  onHarvestUpdated?: (updated: Harvest) => void;
}

export const EditHarvestModal: React.FC<EditHarvestModalProps> = ({
  isOpen,
  onClose,
  harvest,
  userId,
  onHarvestUpdated,
}) => {
  const [harvestDate, setHarvestDate] = useState('');
  const [finalDryWeightGrams, setFinalDryWeightGrams] = useState<number | ''>('');
  const [wetWeightGrams, setWetWeightGrams] = useState<number | ''>('');
  const [plantCount, setPlantCount] = useState<number>(1);
  const [rating1To5, setRating1To5] = useState(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [aromaReview, setAromaReview] = useState('');
  const [flavorReview, setFlavorReview] = useState('');
  const [structureDensityReview, setStructureDensityReview] = useState('');
  const [curingNotes, setCuringNotes] = useState('');
  const [finalNotes, setFinalNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    if (harvest) {
      setHarvestDate(harvest.harvestDate || new Date().toISOString().split('T')[0]);
      setFinalDryWeightGrams(harvest.finalDryWeightGrams ?? '');
      setWetWeightGrams(harvest.wetWeightGrams ?? '');
      setPlantCount(harvest.plantCount || 1);
      setRating1To5(harvest.rating1To5 || 5);
      setAromaReview(harvest.aromaReview || '');
      setFlavorReview(harvest.flavorReview || '');
      setStructureDensityReview(harvest.structureDensityReview || '');
      setCuringNotes(harvest.curingNotes || '');
      setFinalNotes(harvest.finalNotes || '');
      setError(null);
      setShowConfirmModal(false);
    }
  }, [harvest]);

  if (!isOpen || !harvest) return null;

  const currentDry = typeof finalDryWeightGrams === 'number' ? finalDryWeightGrams : 0;
  const currentWet = typeof wetWeightGrams === 'number' ? wetWeightGrams : 0;
  const currentPlants = Math.max(1, plantCount || 1);
  const calculatedGramsPerPlant = (currentDry / currentPlants).toFixed(1);
  const retentionPct = currentWet > 0 && currentDry > 0 ? ((currentDry / currentWet) * 100).toFixed(1) : null;
  const dryDiff = currentDry - (harvest.finalDryWeightGrams || 0);

  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (finalDryWeightGrams === '' || Number(finalDryWeightGrams) <= 0) {
      setError('Por favor indica un peso seco final válido mayor a 0 gramos.');
      return;
    }
    setError(null);
    setShowConfirmModal(true);
  };

  const handleExecuteSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const dry = Number(finalDryWeightGrams);
      const wet = wetWeightGrams !== '' && Number(wetWeightGrams) > 0 ? Number(wetWeightGrams) : undefined;
      const plants = Math.max(1, Number(plantCount) || 1);
      const gramsPerPlant = Number((dry / plants).toFixed(1));

      const updates: Partial<Harvest> = {
        harvestDate: harvestDate || harvest.harvestDate,
        finalDryWeightGrams: dry,
        wetWeightGrams: wet,
        plantCount: plants,
        gramsPerPlant,
        rating1To5,
        aromaReview: aromaReview.trim() || undefined,
        flavorReview: flavorReview.trim() || undefined,
        structureDensityReview: structureDensityReview.trim() || undefined,
        curingNotes: curingNotes.trim() || undefined,
        finalNotes: finalNotes.trim() || undefined,
      };

      const updated = await harvestService.updateHarvest(harvest.id, updates, userId || harvest.userId);

      if (onHarvestUpdated) {
        onHarvestUpdated(updated);
      }
      setShowConfirmModal(false);
      onClose();
    } catch (err: any) {
      console.error('Error updating harvest:', err);
      setError(err?.message || 'Error al actualizar la cosecha. Inténtalo de nuevo.');
      setShowConfirmModal(false);
    } finally {
      setSaving(false);
    }
  };

  const getRatingLabel = (val: number) => {
    switch (val) {
      case 5:
        return '5/5 · Excepcional / Calidad de Copa';
      case 4:
        return '4/5 · Muy Buena / Flores Premium';
      case 3:
        return '3/5 · Buena / Estándar';
      case 2:
        return '2/5 · Regular / Mejorable';
      case 1:
        return '1/5 · Baja Calidad';
      default:
        return `${val}/5`;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div
        id="edit-harvest-modal"
        className="w-full max-w-xl bg-zinc-950 rounded-3xl p-6 sm:p-8 shadow-2xl border border-zinc-800 text-zinc-100 my-auto relative overflow-hidden"
      >
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-6 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Editar Cosecha</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-zinc-900 text-emerald-400 border border-emerald-500/30">
                  {harvest.cultivationName}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Modifica el peso cosechado, rendimiento por planta y notas finales
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowConfirmModal(false);
              onClose();
            }}
            className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-900 transition-colors cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3.5 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs font-medium relative z-10">
            {error}
          </div>
        )}

        <form onSubmit={handlePreSubmit} className="space-y-5 max-h-[72vh] overflow-y-auto pr-1 relative z-10">
          {/* Section: Cuánto se cosechó (Weights and Yield) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Scale className="w-4 h-4" />
                Cantidad Cosechada y Rendimiento
              </span>
              <span className="text-[11px] text-zinc-500 font-mono">Gramos secos / húmedos</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Peso Seco Final (Requerido) */}
              <div>
                <label className="block text-xs font-bold text-zinc-200 mb-1.5 flex items-center justify-between">
                  <span>Peso Seco Final (g) *</span>
                  <span className="text-[10px] text-emerald-400 font-normal">Obligatorio</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    required
                    value={finalDryWeightGrams}
                    onChange={(e) => setFinalDryWeightGrams(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Ej. 125.5"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700 hover:border-zinc-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-white font-mono text-base font-bold outline-none transition-all pl-3.5 pr-10"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-zinc-400">
                    g
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Flores manicuradas tras el periodo de secado</p>
              </div>

              {/* Peso Húmedo (Opcional) */}
              <div>
                <label className="block text-xs font-bold text-zinc-200 mb-1.5 flex items-center justify-between">
                  <span>Peso Húmedo Inicial (g)</span>
                  <span className="text-[10px] text-zinc-500 font-normal">Opcional</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={wetWeightGrams}
                    onChange={(e) => setWetWeightGrams(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Ej. 550"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700 hover:border-zinc-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-white font-mono text-base font-bold outline-none transition-all pl-3.5 pr-10"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-zinc-400">
                    g
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Peso inmediatamente después del corte</p>
              </div>
            </div>

            {/* Cantidad de Plantas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-zinc-200 mb-1.5">Cantidad de Plantas</label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={plantCount}
                    onChange={(e) => setPlantCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-700 focus:border-emerald-500 text-white font-mono text-sm outline-none transition-all pr-16"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400">plantas</span>
                </div>
              </div>

              {/* Dynamic Live Calculated Metric Chips */}
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 flex flex-col justify-center gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Rendimiento por planta:</span>
                  <span className="font-mono font-bold text-emerald-400">{calculatedGramsPerPlant} g/planta</span>
                </div>
                {retentionPct && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Retención de secado:</span>
                    <span className="font-mono font-medium text-teal-300">{retentionPct}% (seco/húmedo)</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section: Fecha de Cosecha & Calificación */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                Fecha de Cosecha
              </label>
              <input
                type="date"
                required
                value={harvestDate}
                onChange={(e) => setHarvestDate(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-emerald-500 text-white font-mono text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  Calificación Global
                </span>
                <span className="text-[10px] text-amber-400 font-mono font-semibold">
                  {hoverRating !== null ? getRatingLabel(hoverRating) : getRatingLabel(rating1To5)}
                </span>
              </label>
              <div className="flex items-center gap-2 py-1">
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = (hoverRating !== null ? hoverRating : rating1To5) >= star;
                  return (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating1To5(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(null)}
                      className="p-1 text-zinc-600 hover:scale-125 transition-transform cursor-pointer"
                      title={`${star} estrellas`}
                    >
                      <Star
                        className={`w-5 h-5 ${active ? 'fill-amber-400 text-amber-400' : 'text-zinc-700'}`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section: Tasting & Organoleptic Notes */}
          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/90 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Perfil Organoléptico y Cata
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-300 mb-1">Perfil de Aroma</label>
                <input
                  type="text"
                  value={aromaReview}
                  onChange={(e) => setAromaReview(e.target.value)}
                  placeholder="Ej. Cítrico intenso, pino, combustible diésel..."
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 focus:border-emerald-500 text-xs text-white placeholder-zinc-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-300 mb-1">Perfil de Sabor</label>
                <input
                  type="text"
                  value={flavorReview}
                  onChange={(e) => setFlavorReview(e.target.value)}
                  placeholder="Ej. Terroso dulce, toques especiados y lima..."
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 focus:border-emerald-500 text-xs text-white placeholder-zinc-600 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-300 mb-1">Estructura y Densidad de Flores</label>
              <input
                type="text"
                value={structureDensityReview}
                onChange={(e) => setStructureDensityReview(e.target.value)}
                placeholder="Ej. Flores compactas como piedra, cálices inflados, gran cobertura de tricomas..."
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 focus:border-emerald-500 text-xs text-white placeholder-zinc-600 outline-none"
              />
            </div>
          </div>

          {/* Section: Secado, Curado y Conclusiones */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">Condiciones de Secado y Curado</label>
              <textarea
                rows={2}
                value={curingNotes}
                onChange={(e) => setCuringNotes(e.target.value)}
                placeholder="Ej. 14 días a 18°C y 55% HR. Curado en frascos de vidrio herméticos con Boveda 62%."
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-emerald-500 text-xs text-white placeholder-zinc-600 outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">Notas y Conclusiones Finales</label>
              <textarea
                rows={2}
                value={finalNotes}
                onChange={(e) => setFinalNotes(e.target.value)}
                placeholder="Ej. Excelente resistencia a plagas, cogollos centrales de gran calibre. Repetir genética."
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-emerald-500 text-xs text-white placeholder-zinc-600 outline-none resize-none"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => {
                setShowConfirmModal(false);
                onClose();
              }}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Guardar Cambios</span>
            </button>
          </div>
        </form>
      </div>

      {/* Explicit Confirmation Dialog before saving historical changes */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div
            id="confirm-edit-harvest-modal"
            className="w-full max-w-lg bg-zinc-950 rounded-3xl p-6 sm:p-7 shadow-2xl border border-amber-500/30 text-zinc-100 animate-in zoom-in-95 duration-150 relative overflow-hidden"
          >
            {/* Ambient amber glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />

            {/* Header */}
            <div className="flex items-start justify-between gap-4 mb-4 relative z-10">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                    ¿Confirmar cambios en la cosecha histórica?
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Cultivo: <span className="text-white font-semibold">{harvest.cultivationName}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-300 mb-4 leading-relaxed relative z-10">
              Estás a punto de modificar un registro histórico de cosecha ya finalizada. Esta acción actualizará los rendimientos globales, promedios acumulados y fichas impresas.
            </p>

            {/* Comparison summary card */}
            <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-3 mb-5 relative z-10">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5" />
                <span>Resumen de Modificaciones</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/90">
                  <span className="text-[10px] text-zinc-400 block mb-1 font-medium">Peso Seco Total</span>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 line-through font-mono text-xs">
                      {harvest.finalDryWeightGrams} g
                    </span>
                    <ArrowRight className="w-3 h-3 text-zinc-500 shrink-0" />
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {Number(finalDryWeightGrams)} g
                    </span>
                  </div>
                  {dryDiff !== 0 && (
                    <span
                      className={`text-[10px] font-mono font-semibold block mt-0.5 ${
                        dryDiff > 0 ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {dryDiff > 0 ? `+${dryDiff.toFixed(1)} g` : `${dryDiff.toFixed(1)} g`}
                    </span>
                  )}
                </div>

                <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/90">
                  <span className="text-[10px] text-zinc-400 block mb-1 font-medium">Por Planta</span>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 line-through font-mono text-xs">
                      {harvest.gramsPerPlant} g
                    </span>
                    <ArrowRight className="w-3 h-3 text-zinc-500 shrink-0" />
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {calculatedGramsPerPlant} g
                    </span>
                  </div>
                </div>
              </div>

              {(harvest.rating1To5 !== rating1To5 || (harvest.harvestDate && harvest.harvestDate !== harvestDate)) && (
                <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap gap-3 text-[11px] text-zinc-300">
                  {harvest.rating1To5 !== rating1To5 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-500">Calificación:</span>
                      <span className="text-zinc-400 line-through">{harvest.rating1To5} ⭐</span>
                      <ArrowRight className="w-2.5 h-2.5 text-zinc-500" />
                      <span className="text-amber-400 font-bold">{rating1To5} ⭐</span>
                    </div>
                  )}
                  {harvest.harvestDate && harvest.harvestDate !== harvestDate && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-500">Fecha:</span>
                      <span className="text-zinc-400 line-through">{harvest.harvestDate}</span>
                      <ArrowRight className="w-2.5 h-2.5 text-zinc-500" />
                      <span className="text-white font-mono">{harvestDate}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 relative z-10">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer border border-zinc-800"
              >
                Cancelar / Seguir editando
              </button>
              <button
                type="button"
                onClick={handleExecuteSave}
                disabled={saving}
                className="px-5 py-2.5 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>Guardando cambios...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>Sí, guardar cambios</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

