import React, { useState, useEffect } from 'react';
import { X, Droplets, Plus, Trash2, Save, Sparkles, FlaskConical, ChevronDown } from 'lucide-react';
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
  const [usedNutrients, setUsedNutrients] = useState<boolean>(Boolean(initialProducts && initialProducts.length > 0));
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(Boolean(initialPh !== undefined || initialEc !== undefined));
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
      setUsedNutrients(true);
    }
    if (initialPh !== undefined) {
      setPhIn(initialPh);
      setShowTechnicalDetails(true);
    }
    if (initialEc !== undefined) {
      setEcIn(initialEc);
      setShowTechnicalDetails(true);
    }
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
    setUsedNutrients(true);
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
      setError('Por favor seleccioná un cultivo.');
      return;
    }
    if (!volumeLiters || Number(volumeLiters) <= 0) {
      setError('Por favor indicá los litros de agua.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const targetCrop = cultivations.find((c) => c.id === cultivationId);
      const vol = Number(volumeLiters);

      // Recalculate totalAmountMl with the final volume
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
      setError(err?.message || 'No se pudo guardar el registro de riego.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cultiveta-modal-overlay animate-in fade-in">
      <div
        id="watering-modal-box"
        className="cultiveta-modal-container max-w-xl p-6 sm:p-8 my-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#EFE3CF] mb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-[#62B95B]/15 text-[#62B95B]">
              <Droplets className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#29202F]">¿Regaste? 💧</h2>
              <p className="text-xs text-[#6E5D77]">Anotá el riego para llevar el control de tus plantas</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#9887A2] hover:text-[#29202F] rounded-full hover:bg-[#FAF2E1] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3.5 rounded-2xl bg-[#EB7864]/10 border border-[#EB7864]/30 text-[#EB7864] text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          {/* Crop Selector & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-3">
              <label className="block text-xs font-bold text-[#29202F] mb-1">Cultivo *</label>
              <select
                id="watering-crop-select"
                value={cultivationId}
                onChange={(e) => setCultivationId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-[#29202F] text-sm focus:outline-hidden focus:border-[#62B95B] focus:bg-white cursor-pointer font-medium"
              >
                {cultivations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.currentStage})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#29202F] mb-1">Fecha</label>
              <input
                id="watering-date-input"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#62B95B] focus:bg-white font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#29202F] mb-1">Hora</label>
              <input
                id="watering-time-input"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#62B95B] focus:bg-white font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#29202F] mb-1">¿Cuánto regaste? *</label>
              <div className="relative">
                <input
                  id="watering-volume-input"
                  type="number"
                  step="0.1"
                  min="0.1"
                  required
                  placeholder="ej. 5.0"
                  value={volumeLiters}
                  onChange={(e) => setVolumeLiters(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-2xl bg-[#62B95B]/10 border border-[#62B95B]/40 font-black text-sm text-[#29202F] focus:outline-hidden focus:border-[#62B95B] focus:bg-white pr-8"
                />
                <span className="absolute right-3 top-2 text-xs font-bold text-[#62B95B]">L</span>
              </div>
            </div>
          </div>

          {/* Nutrientes Toggle */}
          <div className="p-4 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-extrabold text-[#29202F] block">¿Usaste nutrientes?</span>
                <span className="text-[11px] text-[#6E5D77] block">Fertilizantes, estimuladores o aditivos</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-[#EFE3CF]">
                <button
                  type="button"
                  onClick={() => setUsedNutrients(false)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !usedNutrients
                      ? 'bg-[#29202F] text-white shadow-2xs'
                      : 'text-[#6E5D77] hover:text-[#29202F]'
                  }`}
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => setUsedNutrients(true)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    usedNutrients
                      ? 'bg-[#62B95B] text-white shadow-2xs'
                      : 'text-[#6E5D77] hover:text-[#29202F]'
                  }`}
                >
                  Sí
                </button>
              </div>
            </div>

            {/* Products & Fertilizers if used */}
            {usedNutrients && (
              <div className="pt-3 border-t border-[#EFE3CF] space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-[#29202F]">Productos aplicados</label>
                  {fertilizationWeekNumber && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#62B95B]/15 text-[#62B95B] border border-[#62B95B]/30">
                      Receta Semana {fertilizationWeekNumber}
                    </span>
                  )}
                </div>

                {/* Quick load from fertilization schedule */}
                {cropSchedule && cropSchedule.weeks.length > 0 && (
                  <div className="p-3 rounded-2xl bg-[#62B95B]/10 border border-[#62B95B]/25 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-[#29202F]">
                      <span className="flex items-center gap-1.5">
                        <FlaskConical className="w-4 h-4 text-[#62B95B]" />
                        Cargar desde Tabla ({cropSchedule.brand || cropSchedule.name}):
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {cropSchedule.weeks.map((w) => (
                        <button
                          key={w.weekNumber}
                          type="button"
                          onClick={() => handleApplyScheduleWeek(w.weekNumber)}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer border ${
                            fertilizationWeekNumber === w.weekNumber && products.length > 0
                              ? 'bg-[#62B95B] text-white border-[#62B95B] shadow-2xs'
                              : 'bg-white text-[#29202F] hover:bg-[#FAF2E1] border-[#EFE3CF]'
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
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-[#EFE3CF] text-xs shadow-2xs">
                      <div>
                        <span className="font-bold text-[#29202F] block">
                          {p.name} {p.dosageMlPerL ? `(${p.dosageMlPerL} ml/L)` : ''}
                        </span>
                        {totalMl && (
                          <span className="text-[10px] text-[#62B95B] font-semibold">
                            Total para {volumeLiters}L: <strong>{totalMl} ml</strong>
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveProduct(idx)}
                        className="text-[#9887A2] hover:text-[#EB7864] cursor-pointer p-1"
                        title="Quitar producto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Nombre (ej. CalMag, Flora)"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-white border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#62B95B]"
                  />
                  <input
                    type="number"
                    step="0.1"
                    placeholder="ml/L"
                    value={newProductDosage}
                    onChange={(e) => setNewProductDosage(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-20 px-3 py-2 rounded-xl bg-white border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#62B95B]"
                  />
                  <button
                    type="button"
                    onClick={handleAddProduct}
                    className="p-2 rounded-xl bg-[#62B95B] text-white hover:bg-[#52a44b] transition-colors cursor-pointer"
                    title="Agregar producto"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Progressive Disclosure: Agregar datos técnicos */}
          <div className="border border-[#EFE3CF] rounded-2xl overflow-hidden bg-[#FFFDF7]">
            <button
              type="button"
              onClick={() => setShowTechnicalDetails((prev) => !prev)}
              className="w-full p-4 flex items-center justify-between text-left text-xs font-bold text-[#6C45C7] hover:bg-[#FAF2E1] transition-colors cursor-pointer"
            >
              <span>{showTechnicalDetails ? 'Ocultar datos técnicos' : 'Agregar datos técnicos (pH, EC, drenaje, temp)'}</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  showTechnicalDetails ? 'rotate-180' : ''
                }`}
              />
            </button>

            {showTechnicalDetails && (
              <div className="p-4 pt-0 space-y-4 animate-in fade-in duration-200">
                {/* Water Input parameters */}
                <div className="p-3.5 rounded-xl bg-white border border-[#EFE3CF] space-y-2.5">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#6E5D77]">Agua de Entrada</h4>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#6E5D77] mb-1">pH entrada</label>
                      <input
                        id="watering-ph-in-input"
                        type="number"
                        step="0.05"
                        min="3"
                        max="9"
                        placeholder="ej. 6.2"
                        value={phIn}
                        onChange={(e) => setPhIn(e.target.value === '' ? '' : parseFloat(e.target.value))}
                        className="w-full px-3 py-1.5 rounded-xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs text-[#29202F] font-semibold focus:outline-hidden focus:border-[#62B95B]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[#6E5D77] mb-1">EC (mS/cm)</label>
                      <input
                        id="watering-ec-in-input"
                        type="number"
                        step="0.05"
                        min="0"
                        max="6"
                        placeholder="ej. 1.6"
                        value={ecIn}
                        onChange={(e) => setEcIn(e.target.value === '' ? '' : parseFloat(e.target.value))}
                        className="w-full px-3 py-1.5 rounded-xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs text-[#29202F] font-semibold focus:outline-hidden focus:border-[#62B95B]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[#6E5D77] mb-1">Temp (°C)</label>
                      <input
                        id="watering-temp-input"
                        type="number"
                        step="0.5"
                        placeholder="ej. 20"
                        value={waterTempC}
                        onChange={(e) => setWaterTempC(e.target.value === '' ? '' : parseFloat(e.target.value))}
                        className="w-full px-3 py-1.5 rounded-xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#62B95B]"
                      />
                    </div>
                  </div>
                </div>

                {/* Runoff Drainage */}
                <div className="p-3.5 rounded-xl bg-white border border-[#EFE3CF] space-y-2.5">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#6E5D77]">Drenaje / Runoff</h4>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#6E5D77] mb-1">pH Drenaje</label>
                      <input
                        id="watering-ph-runoff-input"
                        type="number"
                        step="0.05"
                        min="3"
                        max="9"
                        placeholder="ej. 6.4"
                        value={phRunoff}
                        onChange={(e) => setPhRunoff(e.target.value === '' ? '' : parseFloat(e.target.value))}
                        className="w-full px-3 py-1.5 rounded-xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#62B95B]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[#6E5D77] mb-1">EC Drenaje (mS/cm)</label>
                      <input
                        id="watering-ec-runoff-input"
                        type="number"
                        step="0.05"
                        min="0"
                        max="6"
                        placeholder="ej. 1.9"
                        value={ecRunoff}
                        onChange={(e) => setEcRunoff(e.target.value === '' ? '' : parseFloat(e.target.value))}
                        className="w-full px-3 py-1.5 rounded-xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#62B95B]"
                      />
                    </div>
                  </div>
                </div>

                {/* Observations */}
                <div>
                  <label className="block text-xs font-bold text-[#29202F] mb-1">Observaciones</label>
                  <textarea
                    id="watering-observations-input"
                    rows={2}
                    placeholder="Absorción del sustrato, escurrimiento, respuesta de la planta..."
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    className="w-full px-3 py-2 rounded-2xl bg-white border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#62B95B]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-[#EFE3CF] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="cultiveta-btn-secondary text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="save-watering-btn"
              disabled={loading}
              className="cultiveta-btn-green text-xs disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>Guardar riego</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

