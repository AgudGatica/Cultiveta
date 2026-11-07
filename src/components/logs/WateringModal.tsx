import React, { useState, useEffect, useMemo } from 'react';
import { X, Droplets, Plus, Trash2, Save, FlaskConical, ChevronDown, Plug } from 'lucide-react';
import { Cultivation, Watering, WateringProductItem, FertilizationSchedule, PotLiftFeeling, DrainageLevel } from '../../types';
import { wateringService } from '../../services/wateringService';
import { fertilizationService } from '../../services/fertilizationService';
import { addDays, getLocalTodayDateOnly, parseLocalDate } from '../../utils/growthStageUtils';
import { checkReading, feedTargetFor, num, type FeedRange } from '../../utils/feedTargets';
import { growMethodOf } from '../../utils/growMethod';
import { FeedTableDetails } from '../cultivations/FeedTable';
import { dec } from '../../utils/formatNumber';

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
  /** Lleva a Equipos para conectar una bomba o una sonda de sustrato. */
  onConnectDevice?: () => void;
  /** Riegos anteriores (para avisar si el último drenaje salió salado). */
  waterings?: Watering[];
}

/** Debajo de pH o EC: si lo medido está en el rango recomendado. */
const ReadingHint: React.FC<{ id: string; value: number | ''; range: FeedRange }> = ({ id, value, range }) => {
  if (value === '' || !Number.isFinite(value)) return null;
  const c = checkReading(Number(value), range);
  return (
    <p id={id} data-check={c} className={`mt-1 text-xs font-bold ${c === 'bien' ? 'text-ok-ink' : 'text-error'}`}>
      {c === 'bien' ? 'Bien, está en el rango.' : `${c === 'alto' ? 'Alto' : 'Bajo'}: apuntá a ${num(range.target)}.`}
    </p>
  );
};

const DRAINAGE_OPTIONS: Array<{ value: DrainageLevel; label: string }> = [
  { value: 'none', label: 'No drenó' },
  { value: 'low', label: 'Poco' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Mucho' },
];

// Tres niveles (decisión del 2026-10-17). 'very_light' sigue siendo un valor válido en registros
// anteriores y el motor lo interpreta, pero ya no se ofrece al cargar un riego nuevo.
const POT_LIFT_OPTIONS: Array<{ value: PotLiftFeeling; testId: string; label: string; hint: string }> = [
  { value: 'light', testId: 'pot-lift-light', label: 'Liviana', hint: 'Perdió buena parte del agua.' },
  { value: 'medium', testId: 'pot-lift-medium', label: 'Normal', hint: 'Perdió parte del agua, pero todavía pesa.' },
  { value: 'heavy', testId: 'pot-lift-heavy', label: 'Pesada', hint: 'Todavía conserva bastante agua.' },
];

const fieldClass =
  'w-full min-h-11 px-3.5 py-2.5 rounded-2xl bg-surface border border-line text-sm text-ink focus:outline-hidden focus:border-brand focus:bg-white';

const chipClass = (selected: boolean) =>
  `min-h-11 px-3 py-2 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
    selected ? 'bg-brand-deep text-white border-brand-deep' : 'bg-white text-ink border-chip-line hover:bg-surface'
  }`;

const parseNumber = (value: string): number | '' => (value === '' ? '' : parseFloat(value));

/** "Hoy, 19:41", "Ayer, 10:00" o "3 nov, 10:00". */
export function whenText(date: string, time: string, today: string = getLocalTodayDateOnly()): string {
  const day =
    date === today
      ? 'Hoy'
      : date === addDays(today, -1)
      ? 'Ayer'
      : date
      ? parseLocalDate(date)?.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '') || date
      : 'Sin fecha';
  return time ? `${day}, ${time}` : day;
}

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
  onConnectDevice,
  waterings = [],
}) => {
  const [cultivationId, setCultivationId] = useState(defaultCultivationId || (cultivations[0]?.id || ''));
  const [date, setDate] = useState(getLocalTodayDateOnly());
  // Casi siempre se anota en el momento: fecha y hora quedan en una línea, y se abren si hace falta
  const [editingWhen, setEditingWhen] = useState(false);
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
  // pH y EC recomendados para este riego, según la etapa y el sustrato del cultivo
  const selectedCrop = cultivations.find((c) => c.id === cultivationId);
  const feed = useMemo(() => (selectedCrop ? feedTargetFor(selectedCrop, waterings) : null), [selectedCrop, waterings]);
  // Living soil: solo agua (pH y EC, si se quiere, aparte). Hidroponía: control del tanque en vez de riego.
  const method = selectedCrop ? growMethodOf(selectedCrop) : 'tierra';
  const living = method === 'living_soil';
  const tank = method === 'hidro';
  const [measureAnyway, setMeasureAnyway] = useState(false);
  const [solutionChange, setSolutionChange] = useState(false);
  const showPhEc = !living || measureAnyway;

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
    if (!tank && (!volumeLiters || Number(volumeLiters) <= 0)) {
      setError('Indicá cuántos litros regaste.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const targetCrop = cultivations.find((c) => c.id === cultivationId);
      const vol = Number(volumeLiters) || 0;

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
        drainageLevel: tank ? undefined : drainageLevel,
        runoffVolumeLiters: runoffVolumeLiters !== '' ? Number(runoffVolumeLiters) : undefined,
        potLiftBeforeWatering: tank ? undefined : potLiftBeforeWatering || undefined,
        kind: tank ? 'tanque' : undefined,
        solutionChange: tank && solutionChange ? true : undefined,
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
              <h2 id="watering-modal-title" className="text-xl font-black text-ink">{tank ? 'Control del tanque' : 'Anotá el riego'}</h2>
              <p className="text-sm text-ink-muted">{tank ? 'pH, EC y temperatura del tanque, y lo que agregaste.' : 'Cargá solo lo que mediste u observaste.'}</p>
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
          {/* Cultivo */}
          <div>
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

          {/* Cantidad */}
          <div>
            <label htmlFor="watering-volume-input" className="block text-sm font-bold text-ink mb-1">
              {tank ? (
                <>
                  Litros que agregaste <span className="font-semibold text-ink-muted">(opcional)</span>
                </>
              ) : (
                'Cantidad (litros)'
              )}
            </label>
            <input
              id="watering-volume-input"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={tank ? '0' : '0.1'}
              required={!tank}
              value={volumeLiters}
              onChange={(e) => setVolumeLiters(parseNumber(e.target.value))}
              className={`${fieldClass} font-black`}
            />
          </div>

          {/* Cuándo: en una línea, salvo que se quiera cambiar */}
          <div className="space-y-2">
            <div id="watering-when" className="flex items-center justify-between gap-2 min-h-11 pl-3.5 pr-1 rounded-2xl bg-surface border border-line">
              <span className="text-sm text-ink min-w-0 truncate">
                <span className="font-bold">Cuándo:</span> {whenText(date, time)}
              </span>
              <button
                type="button"
                id="watering-when-toggle"
                aria-expanded={editingWhen}
                aria-controls="watering-when-fields"
                onClick={() => setEditingWhen((v) => !v)}
                className="min-h-11 px-3 text-sm font-bold text-brand shrink-0 cursor-pointer"
              >
                {editingWhen ? 'Listo' : 'Cambiar'}
              </button>
            </div>
            <div id="watering-when-fields" hidden={!editingWhen} className={editingWhen ? 'grid grid-cols-2 gap-3' : undefined}>
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
          </div>

          {/* Con qué */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold text-ink mb-1">{tank ? '¿Con qué repusiste?' : '¿Con qué regaste?'}</legend>
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
                {living ? 'Con té o enmienda' : tank ? 'Solución (con nutrientes)' : 'Con nutrientes'}
              </button>
            </div>
            {tank && (
              <button
                type="button"
                id="watering-solution-change"
                aria-pressed={solutionChange}
                onClick={() => setSolutionChange((v) => !v)}
                className={`${chipClass(solutionChange)} w-full`}
              >
                Cambié toda la solución
              </button>
            )}

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
                  const totalMl = p.dosageMlPerL && currentVolume ? dec(p.dosageMlPerL * currentVolume, 1) : null;
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

          {/* Living soil: solo agua. pH y EC, solo si se quieren medir igual */}
          {living && (
            <div id="watering-living-note" className="rounded-2xl bg-ok-bg border border-ok-line p-3 space-y-1">
              <p className="text-xs text-ink">
                <b>Living soil:</b> solo agua, sin corregir pH ni medir EC.
              </p>
              {!measureAnyway && (
                <button type="button" id="watering-measure-anyway" onClick={() => setMeasureAnyway(true)} className="text-xs font-bold text-brand underline">
                  Medir pH y EC igual (opcional)
                </button>
              )}
            </div>
          )}

          {/* pH y EC opcionales, con lo recomendado para la etapa */}
          {feed && (
            <div id="watering-feed-guide" className="rounded-2xl bg-surface border border-line p-3 space-y-1">
              <p className="text-xs text-ink">
                <b>{tank ? 'El tanque' : 'Para este riego'}</b> <span className="text-ink-muted">({feed.label.toLowerCase()})</span>: pH {num(feed.ph.target)}
                {usedNutrients || tank ? ` · EC ${num(feed.ec.target)}` : ''}
              </p>
              <p className="text-xs text-ink-muted">
                pH entre {num(feed.ph.min)} y {num(feed.ph.max)}
                {tank
                  ? ` · EC entre ${num(feed.ec.min)} y ${num(feed.ec.max)} · agua a 18–22 °C`
                  : usedNutrients
                  ? ` · EC entre ${num(feed.ec.min)} y ${num(feed.ec.max)} mS/cm (con el agua)`
                  : ' · con agua sola, la EC es la de tu agua'}
              </p>
              {feed.note && usedNutrients && !tank && <p className="text-xs font-semibold text-warn-ink">{feed.note}</p>}
              <FeedTableDetails key={cultivationId} idPrefix="watering-feed" medium={feed.medium} phase={feed.phase} auto={feed.auto} starts={feed.starts} />
            </div>
          )}
          {showPhEc && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { id: 'watering-ph-in-input', label: tank ? 'pH del tanque' : 'pH', value: phIn, set: setPhIn, step: '0.05', min: '3', max: '9' },
              { id: 'watering-ec-in-input', label: tank ? 'EC del tanque (mS/cm)' : 'EC (mS/cm)', value: ecIn, set: setEcIn, step: '0.05', min: '0', max: '6' },
              ...(tank ? [{ id: 'watering-tank-temp-input', label: 'Temperatura del agua (°C)', value: waterTempC, set: setWaterTempC, step: '0.5', min: '0', max: '40' }] : []),
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
                {feed && f.id === 'watering-ph-in-input' && <ReadingHint id="watering-ph-check" value={f.value} range={feed.ph} />}
                {feed && (usedNutrients || tank) && f.id === 'watering-ec-in-input' && <ReadingHint id="watering-ec-check" value={f.value} range={feed.ec} />}
                {f.id === 'watering-tank-temp-input' && <ReadingHint id="watering-temp-check" value={f.value} range={{ min: 18, max: 22, target: 20 }} />}
              </div>
            ))}
          </div>
          )}

          {/* Drenaje */}
          {!tank && (
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
          )}

          {/* Peso de la maceta antes de regar (percepción a mano, sin balanza) */}
          {!tank && (
          <fieldset>
            <legend className="text-sm font-bold text-ink mb-1">
              Peso de la maceta antes de regar <span className="font-semibold text-ink-muted">(opcional)</span>
            </legend>
            <p className="text-xs text-ink-muted mb-2">Levantala a mano y comparala con cómo se siente recién regada.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" id="pot-lift-options-group">
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
          )}

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

          {/* Más datos técnicos (campos existentes, todos opcionales). En el tanque, la temperatura ya está arriba */}
          {!tank && (
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
          )}

          {onConnectDevice && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onConnectDevice();
              }}
              className="w-full min-h-11 rounded-2xl border border-dashed border-line text-xs font-bold text-brand hover:bg-track transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Plug className="w-4 h-4" aria-hidden="true" />
              Conectar bomba o sonda
              <span className="font-medium text-ink-subtle">· riega y mide solo</span>
            </button>
          )}

          {/* Acciones: siempre a la vista, aunque la lista de campos sea larga */}
          <div id="watering-actions" className="sticky bottom-0 z-10 -mx-1 px-1 pt-3 pb-1 bg-card border-t border-line flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="cultiveta-btn-secondary text-sm">
              Cancelar
            </button>
            <button type="submit" id="save-watering-btn" disabled={loading} className="cultiveta-btn-primary text-sm flex-1 sm:flex-none disabled:opacity-50">
              <Save className="w-4 h-4" aria-hidden="true" />
              <span>{tank ? 'Guardar control' : 'Guardar riego'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
