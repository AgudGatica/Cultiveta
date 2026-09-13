import React, { useState } from 'react';
import { X, Droplets, Plus, Trash2, Check, Sparkles, AlertCircle, Save } from 'lucide-react';
import { Watering, FertilizationSchedule, WateringProductItem } from '../../types';
import { wateringService } from '../../services/wateringService';

interface AssociateFertilizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  watering: Watering;
  schedule: FertilizationSchedule | null;
  userId: string;
  onWateringUpdated: (updatedWatering: Watering) => void;
}

export const AssociateFertilizationModal: React.FC<AssociateFertilizationModalProps> = ({
  isOpen,
  onClose,
  watering,
  schedule,
  userId,
  onWateringUpdated,
}) => {
  const [products, setProducts] = useState<WateringProductItem[]>(
    watering.productsUsed ? [...watering.productsUsed] : []
  );
  const [selectedWeekNum, setSelectedWeekNum] = useState<number>(
    watering.fertilizationWeekNumber || 1
  );
  const [phIn, setPhIn] = useState<number | ''>(watering.phIn ?? '');
  const [ecIn, setEcIn] = useState<number | ''>(watering.ecIn ?? '');
  const [observations, setObservations] = useState<string>(watering.observations || '');

  const [newProductName, setNewProductName] = useState('');
  const [newProductBrand, setNewProductBrand] = useState('');
  const [newProductDosage, setNewProductDosage] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApplyWeekFromSchedule = (weekNumber: number) => {
    if (!schedule) return;
    const week = schedule.weeks.find((w) => w.weekNumber === weekNumber);
    if (!week) return;

    const mappedProducts: WateringProductItem[] = week.products.map((p) => ({
      name: p.name,
      brand: p.brand || schedule.brand,
      dosageMlPerL: p.dosageMlPerL,
      category: p.category,
      totalAmountMl: Number((p.dosageMlPerL * watering.volumeLiters).toFixed(1)),
    }));

    setProducts(mappedProducts);
    setSelectedWeekNum(weekNumber);
    if (week.targetPh && (phIn === '' || phIn === undefined)) {
      setPhIn(week.targetPh);
    }
    if (week.targetEc && (ecIn === '' || ecIn === undefined)) {
      setEcIn(week.targetEc);
    }
  };

  const handleAddManualProduct = () => {
    if (!newProductName.trim()) return;
    const dosage = newProductDosage !== '' ? Number(newProductDosage) : 1;
    setProducts([
      ...products,
      {
        name: newProductName.trim(),
        brand: newProductBrand.trim() || undefined,
        dosageMlPerL: dosage,
        totalAmountMl: Number((dosage * watering.volumeLiters).toFixed(1)),
      },
    ]);
    setNewProductName('');
    setNewProductBrand('');
    setNewProductDosage('');
  };

  const handleRemoveProduct = (index: number) => {
    setProducts(products.filter((_, i) => i !== index));
  };

  const handleDosageChange = (index: number, newDosage: number) => {
    const updated = [...products];
    updated[index] = {
      ...updated[index],
      dosageMlPerL: newDosage,
      totalAmountMl: Number((newDosage * watering.volumeLiters).toFixed(1)),
    };
    setProducts(updated);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      const updated = await wateringService.updateWatering(
        watering.id,
        {
          productsUsed: products,
          fertilizationWeekNumber: selectedWeekNum || undefined,
          phIn: phIn !== '' ? Number(phIn) : undefined,
          ecIn: ecIn !== '' ? Number(ecIn) : undefined,
          observations: observations.trim() || undefined,
        },
        userId
      );

      if (updated) {
        onWateringUpdated(updated);
      }
      onClose();
    } catch (err: any) {
      console.error('Error updating watering products', err);
      setError(err?.message || 'Error al guardar los productos del riego.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div
        id="associate-fertilization-modal"
        className="w-full max-w-xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-stone-200 my-auto space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-800">
              <Droplets className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">Asociar Productos al Riego</h2>
              <p className="text-xs text-stone-500">
                Riego del <strong className="text-stone-800">{watering.date}</strong> · {watering.volumeLiters} Litros
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
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Quick Load from Schedule */}
        {schedule && schedule.weeks.length > 0 && (
          <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                Cargar Receta de la Tabla de Fertilización:
              </span>
              <span className="text-[11px] font-semibold text-emerald-800">
                {schedule.brand || schedule.name}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {schedule.weeks.map((w) => (
                <button
                  key={w.weekNumber}
                  type="button"
                  onClick={() => handleApplyWeekFromSchedule(w.weekNumber)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 border ${
                    selectedWeekNum === w.weekNumber && products.length > 0
                      ? 'bg-emerald-700 text-white border-emerald-800 shadow-2xs'
                      : 'bg-white text-stone-700 hover:bg-emerald-100/60 border-stone-200'
                  }`}
                >
                  <span>Semana {w.weekNumber}</span>
                  {selectedWeekNum === w.weekNumber && products.length > 0 && (
                    <Check className="w-3.5 h-3.5" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          {/* Products List with Dosages and Total ml calculation */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                Productos Nutricionales ({products.length})
              </label>
              <span className="text-[11px] text-stone-500">
                Calculado para <strong>{watering.volumeLiters} L</strong> de solución
              </span>
            </div>

            {products.length === 0 ? (
              <div className="p-4 rounded-2xl bg-stone-50 border border-dashed border-stone-200 text-center text-xs text-stone-500">
                No hay productos asignados a este riego (Riego con solo agua).
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {products.map((p, idx) => {
                  const totalMl = p.dosageMlPerL ? (p.dosageMlPerL * watering.volumeLiters).toFixed(1) : '—';
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-2xl bg-stone-50 border border-stone-200 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-stone-900">{p.name}</span>
                          {p.brand && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-stone-200/70 text-stone-600 font-medium">
                              {p.brand}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-emerald-800 font-semibold">
                          Total a preparar: <strong className="text-emerald-950">{totalMl} ml</strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={p.dosageMlPerL || ''}
                            onChange={(e) => handleDosageChange(idx, parseFloat(e.target.value) || 0)}
                            className="w-16 px-2 py-1 rounded-lg bg-white border border-stone-300 text-xs font-bold text-stone-800 text-center"
                          />
                          <span className="text-stone-400 text-[11px]">ml/L</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveProduct(idx)}
                          className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Quitar producto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add Product Line */}
          <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
            <span className="text-[11px] font-bold text-stone-600 block">Agregar otro producto específico:</span>
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                placeholder="Nombre (ej. CalMag, Top Max)"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                className="flex-1 w-full sm:w-auto px-3 py-1.5 rounded-xl bg-white border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500"
              />
              <input
                type="text"
                placeholder="Marca (opcional)"
                value={newProductBrand}
                onChange={(e) => setNewProductBrand(e.target.value)}
                className="w-full sm:w-28 px-3 py-1.5 rounded-xl bg-white border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500"
              />
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="ml/L"
                  value={newProductDosage}
                  onChange={(e) => setNewProductDosage(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-20 px-3 py-1.5 rounded-xl bg-white border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={handleAddManualProduct}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Añadir</span>
                </button>
              </div>
            </div>
          </div>

          {/* Target pH / EC and Observations */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">pH de Solución</label>
              <input
                type="number"
                step="0.05"
                min="3"
                max="9"
                placeholder="ej. 6.3"
                value={phIn}
                onChange={(e) => setPhIn(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-800 font-semibold focus:outline-hidden focus:border-emerald-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-600 mb-1">EC Solución (mS/cm)</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="6"
                placeholder="ej. 1.6"
                value={ecIn}
                onChange={(e) => setEcIn(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-800 font-semibold focus:outline-hidden focus:border-emerald-500 focus:bg-white"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold text-stone-600 mb-1">Observaciones de Riego</label>
              <input
                type="text"
                placeholder="Reacción foliar, absorción, etc."
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-stone-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-xs font-semibold text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-full text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Guardar Nutrición en Riego</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
