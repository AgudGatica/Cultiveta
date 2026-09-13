import React, { useState, useEffect } from 'react';
import { X, Droplets, Plus, Trash2, Save, Sparkles, FlaskConical } from 'lucide-react';
import { Cultivation, Watering, WateringProductItem, FertilizationSchedule } from '../../types';
import { wateringService } from '../../services/wateringService';
import { fertilizationService } from '../../services/fertilizationService';

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
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(
    new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  );
  const [volumeLiters, setVolumeLiters] = useState<number | ''>(5);
  const [phIn, setPhIn] = useState<number | ''>(initialPh ?? 6.2);
  const [ecIn, setEcIn] = useState<number | ''>(initialEc ?? 1.6);
  const [phRunoff, setPhRunoff] = useState<number | ''>('');
  const [ecRunoff, setEcRunoff] = useState<number | ''>('');
  const [waterTempC, setWaterTempC] = useState<number | ''>('');
  const [products, setProducts] = useState<WateringProductItem[]>(initialProducts || []);
  const [fertilizationWeekNumber, setFertilizationWeekNumber] = useState<number | undefined>(initialWeekNumber);
  const [newProductName, setNewProductName] = useState('');
  const [newProductBrand, setNewProductBrand] = useState('');
  const [newProductDosage, setNewProductDosage] = useState<number | ''>('');
  const [observations, setObservations] = useState('');
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
    }
    if (initialPh !== undefined) setPhIn(initialPh);
    if (initialEc !== undefined) setEcIn(initialEc);
    if (initialWeekNumber !== undefined) setFertilizationWeekNumber(initialWeekNumber);
  }, [initialProducts, initialPh, initialEc, initialWeekNumber]);

  const handleApplyScheduleWeek = (weekNumber: number) => {
    if (!cropSchedule) return;
    const week = cropSchedule.weeks.find((w) => w.weekNumber === weekNumber);
    if (!week) return;

    const vol = typeof volumeLiters === 'number' && volumeLiters > 0 ? volumeLiters : 5;
    const mapped: WateringProductItem[] = week.products.map((p) => ({
      name: p.name,
      brand: p.brand || cropSchedule.brand,
      dosageMlPerL: p.dosageMlPerL,
      category: p.category,
      totalAmountMl: Number((p.dosageMlPerL * vol).toFixed(1)),
    }));

    setProducts(mapped);
    setFertilizationWeekNumber(weekNumber);
    if (week.targetPh) setPhIn(week.targetPh);
    if (week.targetEc) setEcIn(week.targetEc);
  };

  const handleAddProduct = () => {
    if (!newProductName.trim()) return;
    const dosage = newProductDosage !== '' ? Number(newProductDosage) : undefined;
    const vol = typeof volumeLiters === 'number' && volumeLiters > 0 ? volumeLiters : 5;
    setProducts([
      ...products,
      {
        name: newProductName.trim(),
        brand: newProductBrand.trim() || undefined,
        dosageMlPerL: dosage,
        totalAmountMl: dosage ? Number((dosage * vol).toFixed(1)) : undefined,
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
      setError('Por favor selecciona un cultivo.');
      return;
    }
    if (!volumeLiters || Number(volumeLiters) <= 0) {
      setError('Por favor indica los litros de agua.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const targetCrop = cultivations.find((c) => c.id === cultivationId);
      const vol = Number(volumeLiters);

      // Recalculate totalAmountMl with the final volume
      const finalProducts = products.map((p) => ({
        ...p,
        totalAmountMl: p.dosageMlPerL ? Number((p.dosageMlPerL * vol).toFixed(1)) : undefined,
      }));

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
        waterTempC: waterTempC !== '' ? Number(waterTempC) : undefined,
        productsUsed: finalProducts.length > 0 ? finalProducts : undefined,
        fertilizationWeekNumber: fertilizationWeekNumber,
        observations: observations.trim() || undefined,
        isDemo: targetCrop?.isDemo,
      });

      onWateringAdded(newWatering);
      onClose();
    } catch (err: any) {
      console.error('Error adding watering', err);
      setError(err?.message || 'No se pudo guardar el registro de riego.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div
        id="watering-modal-box"
        className="w-full max-w-xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-stone-200 my-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-cyan-100 text-cyan-800">
              <Droplets className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">Registrar Riego 💧</h2>
              <p className="text-xs text-stone-500">Agrega mediciones de agua, nutrición y drenaje</p>
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
          {/* Crop Selector & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-3">
              <label className="block text-xs font-bold text-stone-700 mb-1">Cultivo *</label>
              <select
                id="watering-crop-select"
                value={cultivationId}
                onChange={(e) => setCultivationId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-sm focus:outline-hidden focus:border-cyan-500 focus:bg-white cursor-pointer"
              >
                {cultivations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.currentStage})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Fecha</label>
              <input
                id="watering-date-input"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-cyan-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Hora</label>
              <input
                id="watering-time-input"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-cyan-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Volumen (Litros) *</label>
              <input
                id="watering-volume-input"
                type="number"
                step="0.1"
                min="0.1"
                required
                placeholder="ej. 5.0"
                value={volumeLiters}
                onChange={(e) => setVolumeLiters(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="w-full px-3 py-2 rounded-2xl bg-cyan-50/50 border border-cyan-300 font-bold text-xs text-stone-900 focus:outline-hidden focus:border-cyan-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Water Input parameters */}
          <div className="p-4 rounded-2xl bg-stone-50/80 border border-stone-200/80 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-900">Agua de Entrada</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">pH de entrada</label>
                <input
                  id="watering-ph-in-input"
                  type="number"
                  step="0.05"
                  min="3"
                  max="9"
                  placeholder="ej. 6.2"
                  value={phIn}
                  onChange={(e) => setPhIn(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 text-xs text-stone-800 font-semibold focus:outline-hidden focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">EC (mS/cm)</label>
                <input
                  id="watering-ec-in-input"
                  type="number"
                  step="0.05"
                  min="0"
                  max="6"
                  placeholder="ej. 1.6"
                  value={ecIn}
                  onChange={(e) => setEcIn(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 text-xs text-stone-800 font-semibold focus:outline-hidden focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Temp Agua (°C)</label>
                <input
                  id="watering-temp-input"
                  type="number"
                  step="0.5"
                  placeholder="ej. 20"
                  value={waterTempC}
                  onChange={(e) => setWaterTempC(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Runoff Drainage (Optional) */}
          <div className="p-4 rounded-2xl bg-stone-50/80 border border-stone-200/80 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">Drenaje / Runoff (Opcional)</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">pH Drenaje</label>
                <input
                  id="watering-ph-runoff-input"
                  type="number"
                  step="0.05"
                  min="3"
                  max="9"
                  placeholder="ej. 6.4"
                  value={phRunoff}
                  onChange={(e) => setPhRunoff(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">EC Drenaje (mS/cm)</label>
                <input
                  id="watering-ec-runoff-input"
                  type="number"
                  step="0.05"
                  min="0"
                  max="6"
                  placeholder="ej. 1.9"
                  value={ecRunoff}
                  onChange={(e) => setEcRunoff(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Products & Fertilizers */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-stone-700">Productos o Fertilizantes aplicados</label>
              {fertilizationWeekNumber && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Receta Semana {fertilizationWeekNumber}
                </span>
              )}
            </div>

            {/* Quick load from fertilization schedule */}
            {cropSchedule && cropSchedule.weeks.length > 0 && (
              <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
                  <span className="flex items-center gap-1.5">
                    <FlaskConical className="w-4 h-4 text-emerald-600" />
                    Cargar desde Tabla ({cropSchedule.brand || cropSchedule.name}):
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cropSchedule.weeks.map((w) => (
                    <button
                      key={w.weekNumber}
                      type="button"
                      onClick={() => handleApplyScheduleWeek(w.weekNumber)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold transition-all cursor-pointer border ${
                        fertilizationWeekNumber === w.weekNumber && products.length > 0
                          ? 'bg-emerald-700 text-white border-emerald-800 shadow-2xs'
                          : 'bg-white text-stone-700 hover:bg-emerald-100/60 border-stone-200'
                      }`}
                    >
                      Sem {w.weekNumber}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {products.map((p, idx) => {
              const totalMl = p.dosageMlPerL && typeof volumeLiters === 'number' && volumeLiters > 0
                ? (p.dosageMlPerL * volumeLiters).toFixed(1)
                : null;

              return (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs">
                  <div>
                    <span className="font-semibold text-stone-800 block">
                      {p.name} {p.dosageMlPerL ? `(${p.dosageMlPerL} ml/L)` : ''}
                    </span>
                    {totalMl && (
                      <span className="text-[10px] text-emerald-800 font-medium">
                        Total para {volumeLiters}L: <strong>{totalMl} ml</strong>
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveProduct(idx)}
                    className="text-stone-400 hover:text-rose-600 cursor-pointer p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Nombre del producto (ej. CalMag, Bio Bloom)"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-cyan-500 focus:bg-white"
              />
              <input
                type="number"
                step="0.1"
                placeholder="ml/L"
                value={newProductDosage}
                onChange={(e) => setNewProductDosage(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="w-20 px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-cyan-500 focus:bg-white"
              />
              <button
                type="button"
                onClick={handleAddProduct}
                className="p-2 rounded-xl bg-cyan-100 text-cyan-800 hover:bg-cyan-200 transition-colors cursor-pointer"
                title="Agregar producto"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Observations */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Observaciones</label>
            <textarea
              id="watering-observations-input"
              rows={2}
              placeholder="Comportamiento del sustrato, porcentaje de drenaje, tiempo de absorción..."
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-cyan-500 focus:bg-white"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-full text-xs font-semibold text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="save-watering-btn"
              disabled={loading}
              className="px-6 py-2.5 rounded-full text-xs font-bold bg-cyan-600 hover:bg-cyan-700 text-white shadow-md shadow-cyan-600/20 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Guardar Riego</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
