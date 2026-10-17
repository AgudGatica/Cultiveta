import React, { useState, useEffect } from 'react';
import { X, Droplets, Plus, Trash2, Save, FlaskConical, ChevronDown } from 'lucide-react';
import { Cultivation, Watering, WateringProductItem, FertilizationSchedule, PotLiftFeeling, DrainageLevel } from '../../types';
import { wateringService } from '../../services/wateringService';
import { fertilizationService } from '../../services/fertilizationService';
import { getLocalTodayDateOnly } from '../../utils/growthStageUtils';

interface WateringModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  cultivations: Cultivation[];
  defaultCultivationId?: string;
  initialProducts?: WateringProductItem[];
  initialPh?: number;
  initialEc?: number;
  initialWeekNumber?: number;
  onWateringAdded: (watering: Watering) => void;
}

const DRAINAGE_OPTIONS: Array<{ value: DrainageLevel; label: string }> = [
  { value: 'none', label: 'No drenó' },
  { value: 'low', label: 'Poco' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Mucho' },
];

const POT_LIFT_OPTIONS: Array<{ value: PotLiftFeeling; testId: string; label: string; hint: string }> = [
  { value: 'heavy', testId: 'pot-lift-heavy', label: 'Pesada', hint: 'Todavía conserva bastante agua.' },
  { value: 'medium', testId: 'pot-lift-medium', label: 'Normal', hint: 'Perdió parte del agua, pero todavía pesa.' },
  { value: 'light', testId: 'pot-lift-light', label: 'Liviana', hint: 'Perdió buena parte del agua.' },
  { value: 'very_light', testId: 'pot-lift-very-light', label: 'Muy liviana', hint: 'El sustrato parece bastante seco.' },
];

const fieldClass =
  'w-full min-h-11 px-3.5 py-2.5 rounded-2xl bg-surface border border-line text-sm text-ink focus:outline-hidden focus:border-brand focus:bg-white';

const chipClass = (selected: boolean) =>
  `min-h-11 px-3 py-2 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
    selected ? 'bg-brand-deep text-white border-brand-deep' : 'bg-white text-ink border-chip-line hover:bg-surface'
  }`;

const parseNumber = (value: string): number | '' => (value === '' ? '' : parseFloat(value));

export const WateringModal: React.FC<WateringModalProps> = ({
  isOpen,
  onClose,
  userId,
  cultivations,
  defaultCultivationId,
  initialProducts,
  initialPh,
  initialEc,
  initialWeekNumber,
  onWateringAdded,
}) => {
  const [cultivationId, setCultivationId] = useState(defaultCultivationId || (cultivations[0]?.id || ''));
  const [date, setDate] = useState(getLocalTodayDateOnly());
  const [time, setTime] = useState(
    new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  );
  // Sin valores supuestos: todo arranca vacío y se guarda solo lo que la persona informa.
  const [volumeLiters, setVolumeLiters] = useState<number | ''>('');
  const [usedNutrients, setUsedNutrients] = useState<boolean>(Boolean(initialProducts && initialProducts.length > 0));
  const [phIn, setPhIn] = useState<number | ''>(initialPh ?? '');
  const [ecIn, setEcIn] = useState<number | ''>(initialEc ?? '');
  const [drainageLevel, setDrainageLevel] = useState<DrainageLevel | undefined>(undefined);
  const [potLiftBeforeWatering, setPotLiftBeforeWatering] = useState<PotLiftFeeling | undefined>(undefined);
  const [observations, setObservations] = useState('');
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [phRunoff, setPhRunoff] = useState<number | ''>('');
  const [ecRunoff, setEcRunoff] = useState<number | ''>('');
  const [runoffVolumeLiters, setRunoffVolumeLiters] = useState<number | ''>('');
  const [substrateMoistureBeforePct, setSubstrateMoistureBeforePct] = useState<number | ''>('');
  const [substrateMoistureAfterPct, setSubstrateMoistureAfterPct] = useState<number | ''>('');
  const [waterTempC, setWaterTempC] = useState<number | ''>('');
  const [products, setProducts] = useState<WateringProductItem[]>(initialProducts || []);
  const [fertilizationWeekNumber, setFertilizationWeekNumber] = useState<number | undefined>(initialWeekNumber);
  const [newProductName, setNewProductName] = useState('');
  const [newProductBrand, setNewProductBrand] = useState('');
  const [newProductDosage, setNewProductDosage] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropSchedule, setCropSchedule] = useState<FertilizationSchedule | null>(null);

  useEffect(() => {
    if (cultivationId) {
      fertilizationService.getScheduleByCultivation(cultivationId, userId).then((sched) => {
        setCropSchedule(sched);
      });
    }
  }, [cultivationId, userId]);

  useEffect(() => {
    if (initialProducts && initialProducts.length > 0) {
      setProducts(initialProducts);
      setUsedNutrients(true);
    }
    if (initialPh !== undefined) setPhIn(initialPh);
    if (initialEc !== undefined) setEcIn(initialEc);
    if (initialWeekNumber !== undefined) setFertilizationWeekNumber(initialWeekNumber);
  }, [initialProducts, initialPh, initialEc, initialWeekNumber]);

  const currentVolume = typeof volumeLiters === 'number' && volumeLiters > 0 ? volumeLiters : null;

  const handleApplyScheduleWeek = (weekNumber: number) => {
    if (!cropSchedule) return;
    const week = cropSchedule.weeks.find((w) => w.weekNumber === weekNumber);
    if (!week) return;

    const mapped: WateringProductItem[] = week.products.map((p) => ({
      name: p.name,
      brand: p.brand || cropSchedule.brand,
      dosageMlPerL: p.dosageMlPerL,
      category: p.category,
      totalAmountMl: currentVolume ? Number((p.dosageMlPerL * currentVolume).toFixed(1)) : undefined,
    }));

    setProducts(mapped);
    setUsedNutrients(true);
    setFertilizationWeekNumber(weekNumber);
    if (week.targetPh) setPhIn(week.targetPh);
    if (week.targetEc) setEcIn(week.targetEc);
  };

  const handleAddProduct = () => {
    if (!newProductName.trim()) return;
    const dosage = newProductDosage !== '' ? Number(newProductDosage) : undefined;
    setProducts([
      ...products,
      {
        name: newProductName.trim(),
        brand: newProductBrand.trim() || undefined,
        dosageMlPerL: dosage,
        totalAmountMl: dosage && currentVolume ? Number((dosage * currentVolume).toFixed(1)) : undefined,
      },
    ]);
    setNewProductName('');
    setNewProductBrand('');
    setNewProductDosage('');
  };

  const handleRemoveProduct = (index: number) => {
    setProducts(products.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cultivationId) {
      setError('Elegí un cultivo.');
      return;
    }
    if (!volumeLiters || Number(volumeLiters) <= 0) {
      setError('Indicá cuántos litros regaste.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const targetCrop = cultivations.find((c) => c.id === cultivationId);
      const vol = Number(volumeLiters);

      // Recalcular totalAmountMl con el volumen final
      const finalProducts = usedNutrients
        ? products.map((p) => ({
            ...p,
            totalAmountMl: p.dosageMlPerL ? Number((p.dosageMlPerL * vol).toFixed(1)) : undefined,
          }))
        : [];

      const newWatering = await wateringService.addWatering({
        userId,
        cultivationId,
        date,
        time: time || undefined,
        volumeLiters: vol,
        phIn: phIn !== '' ? Number(phIn) : undefined,
        ecIn: ecIn !== '' ? Number(ecIn) : undefined,
        phRunoff: phRunoff !== '' ? Number(phRunoff) : undefined,
        ecRunoff: ecRunoff !== '' ? Number(ecRunoff) : undefined,
        drainageLevel,
        runoffVolumeLiters: runoffVolumeLiters !== '' ? Number(runoffVolumeLiters) : undefined,
        potLiftBeforeWatering: potLiftBeforeWatering || undefined,
        potWeightBeforeWateringKg: undefined,
        potWeightAfterWateringKg: undefined,
        substrateMoistureBeforePct: substrateMoistureBeforePct !== '' ? Number(substrateMoistureBeforePct) : undefined,
        substrateMoistureAfterPct: substrateMoistureAfterPct !== '' ? Number(substrateMoistureAfterPct) : undefined,
        waterTempC: waterTempC !== '' ? Number(waterTempC) : undefined,
        productsUsed: finalProducts.length > 0 ? finalProducts : undefined,
        fertilizationWeekNumber: usedNutrients ? fertilizationWeekNumber : undefined,
        observations: observations.trim() || undefined,
        isDemo: targetCrop?.isDemo,
      });

      onWateringAdded(newWatering);
      onClose();
    } catch (err: any) {
      console.error('Error adding watering', err);
      setError(err?.message || 'No se pudo guardar el riego.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cultiveta-modal-overlay animate-in fade-in" role="presentation">
      <div
        id="watering-modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="watering-modal-title"
        className="cultiveta-modal-container max-w-xl p-6 sm:p-8 my-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-line mb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-icon-bg text-brand">
              <Droplets className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h2 id="watering-modal-title" className="text-xl font-black text-ink">Anotá el riego</h2>
              <p className="text-sm text-ink-muted">Cargá solo lo que mediste u observaste.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="min-h-11 min-w-11 flex items-center justify-center text-ink-muted hover:text-ink rounded-full hover:bg-track transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-4 p-3.5 rounded-2xl bg-error/10 border border-error/30 text-error text-sm font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto pr-1" noValidate>
          {/* Cultivo, fecha y hora */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="watering-crop-select" className="block text-sm font-bold text-ink mb-1">
                Cultivo
              </label>
              <select
                id="watering-crop-select"
                value={cultivationId}
                onChange={(e) => setCultivationId(e.target.value)}
                required
                className={`${fieldClass} cursor-pointer font-medium`}
              >
                {cultivations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.currentStage})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="watering-date-input" className="block text-sm font-bold text-ink mb-1">
                Fecha
              </label>
              <input
                id="watering-date-input"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="watering-time-input" className="block text-sm font-bold text-ink mb-1">
                Hora
              </label>
              <input
                id="watering-time-input"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>

          {/* Cantidad */}
          <div>
            <label htmlFor="watering-volume-input" className="block text-sm font-bold text-ink mb-1">
              Cantidad (litros)
            </label>
            <input
              id="watering-volume-input"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0.1"
              required
              value={volumeLiters}
              onChange={(e) => setVolumeLiters(parseNumber(e.target.value))}
              className={`${fieldClass} font-black`}
            />
          </div>

          {/* Con qué */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold text-ink mb-1">¿Con qué regaste?</legend>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={!usedNutrients}
                onClick={() => setUsedNutrients(false)}
                className={chipClass(!usedNutrients)}
              >
                Agua sola
              </button>
              <button
                type="button"
                aria-pressed={usedNutrients}
                onClick={() => setUsedNutrients(true)}
                className={chipClass(usedNutrients)}
              >
                Con nutrientes
              </button>
            </div>

            {usedNutrients && (
              <div className="p-4 rounded-2xl bg-surface border border-line space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-ink">Productos</span>
                  {fertilizationWeekNumber && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-ok-bg text-ok-ink border border-ok-line">
                      Tabla, semana {fertilizationWeekNumber}
                    </span>
                  )}
                </div>

                {cropSchedule && cropSchedule.weeks.length > 0 && (
                  <div className="space-y-2">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
                      <FlaskConical className="w-4 h-4 text-brand" aria-hidden="true" />
                      Cargar desde la tabla ({cropSchedule.brand || cropSchedule.name}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {cropSchedule.weeks.map((w) => (
                        <button
                          key={w.weekNumber}
                          type="button"
                          aria-pressed={fertilizationWeekNumber === w.weekNumber && products.length > 0}
                          onClick={() => handleApplyScheduleWeek(w.weekNumber)}
                          className={chipClass(fertilizationWeekNumber === w.weekNumber && products.length > 0)}
                        >
                          Sem {w.weekNumber}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {products.map((p, idx) => {
                  const totalMl = p.dosageMlPerL && currentVolume ? (p.dosageMlPerL * currentVolume).toFixed(1) : null;
                  return (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-line text-sm">
                      <div>
                        <span className="font-bold text-ink block">
                          {p.name} {p.dosageMlPerL ? `(${p.dosageMlPerL} ml/L)` : ''}
                        </span>
                        {totalMl && (
                          <span className="text-xs text-ok-ink font-semibold">
                            Total para {currentVolume} L: <strong>{totalMl} ml</strong>
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveProduct(idx)}
                        aria-label={`Quitar ${p.name}`}
                        className="min-h-11 min-w-11 flex items-center justify-center text-ink-muted hover:text-error cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}

                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label htmlFor="watering-new-product-name" className="block text-xs font-bold text-ink mb-1">
                      Producto
                    </label>
                    <input
                      id="watering-new-product-name"
                      type="text"
                      value={newProductName}
                      onChange={(e) => setNewProductName(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                  <div className="w-24">
                    <label htmlFor="watering-new-product-dosage" className="block text-xs font-bold text-ink mb-1">
                      ml/L
                    </label>
                    <input
                      id="watering-new-product-dosage"
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      value={newProductDosage}
                      onChange={(e) => setNewProductDosage(parseNumber(e.target.value))}
                      className={fieldClass}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddProduct}
                    aria-label="Agregar producto"
                    className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-primary text-ink hover:brightness-95 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </fieldset>

          {/* pH y EC opcionales */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { id: 'watering-ph-in-input', label: 'pH', value: phIn, set: setPhIn, step: '0.05', min: '3', max: '9' },
              { id: 'watering-ec-in-input', label: 'EC (mS/cm)', value: ecIn, set: setEcIn, step: '0.05', min: '0', max: '6' },
            ].map((f) => (
              <div key={f.id}>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor={f.id} className="block text-sm font-bold text-ink">
                    {f.label} <span className="font-semibold text-ink-muted">(opcional)</span>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id={f.id}
                    type="number"
                    inputMode="decimal"
                    step={f.step}
                    min={f.min}
                    max={f.max}
                    value={f.value}
                    onChange={(e) => f.set(parseNumber(e.target.value))}
                    className={fieldClass}
                  />
                  <button
                    type="button"
                    aria-pressed={f.value === ''}
                    onClick={() => f.set('')}
                    className={`${chipClass(f.value === '')} shrink-0 whitespace-nowrap`}
                  >
                    Sin medir
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Drenaje */}
          <fieldset>
            <legend className="text-sm font-bold text-ink mb-1">
              Drenaje <span className="font-semibold text-ink-muted">(opcional)</span>
            </legend>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" id="drainage-options-group">
              {DRAINAGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  data-testid={`drainage-${opt.value}`}
                  aria-pressed={drainageLevel === opt.value}
                  onClick={() => setDrainageLevel(drainageLevel === opt.value ? undefined : opt.value)}
                  className={chipClass(drainageLevel === opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Peso de la maceta antes de regar (percepción a mano, sin balanza) */}
          <fieldset>
            <legend className="text-sm font-bold text-ink mb-1">
              Peso de la maceta antes de regar <span className="font-semibold text-ink-muted">(opcional)</span>
            </legend>
            <p className="text-xs text-ink-muted mb-2">Levantala a mano y comparala con cómo se siente recién regada.</p>
            <div className="grid grid-cols-2 gap-2" id="pot-lift-options-group">
              {POT_LIFT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  data-testid={opt.testId}
                  aria-pressed={potLiftBeforeWatering === opt.value}
                  onClick={() => setPotLiftBeforeWatering(potLiftBeforeWatering === opt.value ? undefined : opt.value)}
                  className={`${chipClass(potLiftBeforeWatering === opt.value)} text-left`}
                >
                  <span className="block">{opt.label}</span>
                  <span
                    className={`block text-xs font-medium mt-0.5 ${
                      potLiftBeforeWatering === opt.value ? 'text-brand-soft' : 'text-ink-muted'
                    }`}
                  >
                    {opt.hint}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          {/* Notas */}
          <div>
            <label htmlFor="watering-observations-input" className="block text-sm font-bold text-ink mb-1">
              Notas <span className="font-semibold text-ink-muted">(opcional)</span>
            </label>
            <textarea
              id="watering-observations-input"
              rows={2}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              className={fieldClass}
            />
          </div>

          {/* Más datos técnicos (campos existentes, todos opcionales) */}
          <div className="border border-line rounded-2xl overflow-hidden bg-surface">
            <button
              type="button"
              onClick={() => setShowTechnicalDetails((prev) => !prev)}
              aria-expanded={showTechnicalDetails}
              className="w-full min-h-11 p-4 flex items-center justify-between text-left text-sm font-bold text-brand hover:bg-track transition-colors cursor-pointer"
            >
              <span>Más datos técnicos (drenaje medido, temperatura, sensor)</span>
              <ChevronDown
                aria-hidden="true"
                className={`w-4 h-4 transition-transform duration-200 ${showTechnicalDetails ? 'rotate-180' : ''}`}
              />
            </button>

            {showTechnicalDetails && (
              <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in duration-200">
                {[
                  { id: 'watering-runoff-volume-input', label: 'Drenaje medido (L)', value: runoffVolumeLiters, set: setRunoffVolumeLiters, step: '0.05' },
                  { id: 'watering-ph-runoff-input', label: 'pH del drenaje', value: phRunoff, set: setPhRunoff, step: '0.05' },
                  { id: 'watering-ec-runoff-input', label: 'EC del drenaje (mS/cm)', value: ecRunoff, set: setEcRunoff, step: '0.05' },
                  { id: 'watering-temp-input', label: 'Temperatura del agua (°C)', value: waterTempC, set: setWaterTempC, step: '0.5' },
                  { id: 'watering-moisture-before-input', label: 'Humedad del sustrato antes (%)', value: substrateMoistureBeforePct, set: setSubstrateMoistureBeforePct, step: '1' },
                  { id: 'watering-moisture-after-input', label: 'Humedad del sustrato después (%)', value: substrateMoistureAfterPct, set: setSubstrateMoistureAfterPct, step: '1' },
                ].map((f) => (
                  <div key={f.id}>
                    <label htmlFor={f.id} className="block text-xs font-bold text-ink mb-1">
                      {f.label}
                    </label>
                    <input
                      id={f.id}
                      type="number"
                      inputMode="decimal"
                      step={f.step}
                      value={f.value}
                      onChange={(e) => f.set(parseNumber(e.target.value))}
                      className={`${fieldClass} bg-white`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Acciones */}
          <div className="pt-3 border-t border-line flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="cultiveta-btn-secondary text-sm">
              Cancelar
            </button>
            <button type="submit" id="save-watering-btn" disabled={loading} className="cultiveta-btn-primary text-sm disabled:opacity-50">
              <Save className="w-4 h-4" aria-hidden="true" />
              <span>Guardar riego</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
