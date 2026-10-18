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
    <div className="cultiveta-modal-overlay animate-in fade-in">
      <div
        id="associate-fertilization-modal"
        className="cultiveta-modal-container max-w-xl p-6 sm:p-8 my-auto space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-chip-line">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-ok/15 text-ok">
              <Droplets className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-ink">Asociar Productos al Riego</h2>
              <p className="text-xs text-ink/70">
                Riego del <strong className="text-ink">{watering.date}</strong> · {watering.volumeLiters} Litros
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-ink/40 hover:text-ink rounded-full hover:bg-surface transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-coral/10 border border-coral/30 text-coral text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Quick Load from Schedule */}
        {schedule && schedule.weeks.length > 0 && (
          <div className="p-4 rounded-2xl bg-surface border border-chip-line space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-ink flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-brand" />
                Cargar Receta de la Tabla de Fertilización:
              </span>
              <span className="text-[11px] font-bold text-brand">
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
                      ? 'bg-ok-ink text-white border-ok shadow-2xs font-black'
                      : 'bg-white text-ink hover:bg-surface border-chip-line'
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
              <label className="text-xs font-bold text-ink/80 uppercase tracking-wider">
                Productos Nutricionales ({products.length})
              </label>
              <span className="text-[11px] text-ink/60">
                Calculado para <strong className="text-ink">{watering.volumeLiters} L</strong> de solución
              </span>
            </div>

            {products.length === 0 ? (
              <div className="p-4 rounded-2xl bg-surface border border-dashed border-chip-line text-center text-xs text-ink/60">
                No hay productos asignados a este riego (Riego con solo agua).
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {products.map((p, idx) => {
                  const totalMl = p.dosageMlPerL ? (p.dosageMlPerL * watering.volumeLiters).toFixed(1) : '—';
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-2xl bg-surface border border-chip-line text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-ink">{p.name}</span>
                          {p.brand && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-surface border border-chip-line text-ink/70 font-medium">
                              {p.brand}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-ok font-semibold">
                          Total a preparar: <strong className="text-ink">{totalMl} ml</strong>
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
                            className="w-16 px-2 py-1 rounded-lg bg-white border border-chip-line text-xs font-bold text-ink text-center"
                          />
                          <span className="text-ink/50 text-[11px]">ml/L</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveProduct(idx)}
                          className="p-1.5 rounded-lg text-ink/40 hover:text-coral hover:bg-coral/10 transition-colors cursor-pointer"
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
          <div className="p-3.5 rounded-2xl bg-surface border border-chip-line space-y-2">
            <span className="text-[11px] font-bold text-ink/80 block">Agregar otro producto específico:</span>
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                placeholder="Nombre (ej. CalMag, Top Max)"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                className="flex-1 w-full sm:w-auto px-3 py-2 rounded-xl bg-white border border-chip-line text-xs text-ink focus:outline-hidden focus:border-brand"
              />
              <input
                type="text"
                placeholder="Marca (opcional)"
                value={newProductBrand}
                onChange={(e) => setNewProductBrand(e.target.value)}
                className="w-full sm:w-28 px-3 py-2 rounded-xl bg-white border border-chip-line text-xs text-ink focus:outline-hidden focus:border-brand"
              />
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="ml/L"
                  value={newProductDosage}
                  onChange={(e) => setNewProductDosage(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-20 px-3 py-2 rounded-xl bg-white border border-chip-line text-xs text-ink focus:outline-hidden focus:border-brand"
                />
                <button
                  type="button"
                  onClick={handleAddManualProduct}
                  className="px-3.5 py-2 rounded-xl bg-primary text-ink font-bold text-xs hover:brightness-95 transition-all flex items-center gap-1 cursor-pointer shrink-0"
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
              <label className="block text-xs font-semibold text-ink/80 mb-1">pH de Solución</label>
              <input
                type="number"
                step="0.05"
                min="3"
                max="9"
                placeholder="ej. 6.3"
                value={phIn}
                onChange={(e) => setPhIn(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-white border border-chip-line text-xs text-ink font-semibold focus:outline-hidden focus:border-brand"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink/80 mb-1">EC Solución (mS/cm)</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="6"
                placeholder="ej. 1.6"
                value={ecIn}
                onChange={(e) => setEcIn(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-white border border-chip-line text-xs text-ink font-semibold focus:outline-hidden focus:border-brand"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold text-ink/80 mb-1">Observaciones de Riego</label>
              <input
                type="text"
                placeholder="Reacción foliar, absorción, etc."
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-chip-line text-xs text-ink focus:outline-hidden focus:border-brand"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-chip-line flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="cultiveta-btn-secondary py-2.5 text-xs font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="cultiveta-btn-primary py-2.5 text-xs font-black flex items-center gap-2 disabled:opacity-50"
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
