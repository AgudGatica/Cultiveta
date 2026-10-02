import React, { useState } from 'react';
import { X, Plus, Trash2, Save, Sparkles, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { FertilizationSchedule, FertilizationWeek, FertilizationProductDosage } from '../../types';
import { fertilizationService, PRESET_FEEDING_SCHEDULES } from '../../services/fertilizationService';

interface EditScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: FertilizationSchedule;
  onSaveSchedule: (updatedSchedule: FertilizationSchedule) => void;
}

export const EditScheduleModal: React.FC<EditScheduleModalProps> = ({
  isOpen,
  onClose,
  schedule,
  onSaveSchedule,
}) => {
  const [name, setName] = useState(schedule.name);
  const [brand, setBrand] = useState(schedule.brand || '');
  const [substrateType, setSubstrateType] = useState(schedule.substrateType || 'Tierra / Sustrato');
  const [notes, setNotes] = useState(schedule.notes || '');
  const [weeks, setWeeks] = useState<FertilizationWeek[]>(
    schedule.weeks.map((w) => ({
      ...w,
      products: w.products.map((p) => ({ ...p })),
    }))
  );
  const [expandedWeekIdx, setExpandedWeekIdx] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApplyPreset = (presetId: string) => {
    const preset = PRESET_FEEDING_SCHEDULES[presetId];
    if (!preset) return;

    setName(preset.name);
    setBrand(preset.brand);
    setSubstrateType(preset.substrateType);
    setNotes(preset.description);
    setWeeks(
      preset.weeks.map((w, idx) => ({
        ...w,
        weekNumber: idx + 1,
        products: w.products.map((p) => ({ ...p, id: `p_${idx}_${Math.random().toString(36).substring(2, 6)}` })),
      }))
    );
    setExpandedWeekIdx(0);
  };

  const handleAddWeek = () => {
    const nextWeekNum = weeks.length + 1;
    const newWeek: FertilizationWeek = {
      weekNumber: nextWeekNum,
      stage: nextWeekNum <= 3 ? 'Vegetativo' : nextWeekNum >= 9 ? 'Lavado' : 'Floración',
      title: `Semana ${nextWeekNum}`,
      targetPh: 6.3,
      targetEc: 1.5,
      products: [],
    };
    setWeeks([...weeks, newWeek]);
    setExpandedWeekIdx(weeks.length);
  };

  const handleRemoveWeek = (weekIdx: number) => {
    if (weeks.length <= 1) {
      setError('Debes mantener al menos una semana en la tabla.');
      return;
    }
    const updated = weeks
      .filter((_, idx) => idx !== weekIdx)
      .map((w, idx) => ({ ...w, weekNumber: idx + 1 }));
    setWeeks(updated);
    setExpandedWeekIdx(Math.max(0, weekIdx - 1));
  };

  const handleWeekFieldChange = (
    weekIdx: number,
    field: keyof FertilizationWeek,
    val: any
  ) => {
    const updated = [...weeks];
    updated[weekIdx] = { ...updated[weekIdx], [field]: val };
    setWeeks(updated);
  };

  const handleAddProductToWeek = (weekIdx: number) => {
    const updated = [...weeks];
    const newProd: FertilizationProductDosage = {
      id: `p_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      name: 'Nuevo Nutriente',
      brand: brand || undefined,
      dosageMlPerL: 2.0,
      category: 'floracion',
    };
    updated[weekIdx].products.push(newProd);
    setWeeks(updated);
  };

  const handleProductChange = (
    weekIdx: number,
    prodIdx: number,
    field: keyof FertilizationProductDosage,
    val: any
  ) => {
    const updated = [...weeks];
    const prod = { ...updated[weekIdx].products[prodIdx], [field]: val };
    updated[weekIdx].products[prodIdx] = prod;
    setWeeks(updated);
  };

  const handleRemoveProductFromWeek = (weekIdx: number, prodIdx: number) => {
    const updated = [...weeks];
    updated[weekIdx].products = updated[weekIdx].products.filter((_, idx) => idx !== prodIdx);
    setWeeks(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Por favor indica un nombre para el plan de fertilización.');
      return;
    }

    const updatedSchedule: FertilizationSchedule = {
      ...schedule,
      name: name.trim(),
      brand: brand.trim() || undefined,
      substrateType: substrateType.trim() || undefined,
      notes: notes.trim() || undefined,
      weeks,
      updatedAt: new Date().toISOString(),
    };

    onSaveSchedule(updatedSchedule);
    onClose();
  };

  return (
    <div className="cultiveta-modal-overlay animate-in fade-in">
      <div
        id="edit-schedule-modal"
        className="cultiveta-modal-container max-w-2xl p-6 sm:p-8 my-auto space-y-6"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#EFE3CF]">
          <div>
            <h2 className="text-xl font-black text-[#29202F]">Editar Tabla de Fertilización</h2>
            <p className="text-xs text-[#29202F]/70">
              Personaliza las semanas del ciclo, objetivos de pH/EC y dosificación (ml/L)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#29202F]/40 hover:text-[#29202F] rounded-full hover:bg-[#FFF8E8] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-[#EB7864]/10 border border-[#EB7864]/30 text-[#EB7864] text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Quick Presets selector */}
        <div className="p-4 rounded-2xl bg-[#FFF8E8] border border-[#EFE3CF] space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-[#29202F]">
            <span className="flex items-center gap-1.5 text-[#6C45C7]">
              <Sparkles className="w-4 h-4 text-[#6C45C7]" />
              Cargar Plantilla Comercial Prediseñada:
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleApplyPreset('biobizz_organic')}
              className="px-3 py-1.5 rounded-xl bg-white border border-[#EFE3CF] text-xs font-semibold text-[#29202F] hover:bg-[#62B95B]/15 hover:border-[#62B95B]/50 transition-all cursor-pointer shadow-2xs"
            >
              🌱 Biobizz 100% Orgánico
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('top_crop_line')}
              className="px-3 py-1.5 rounded-xl bg-white border border-[#EFE3CF] text-xs font-semibold text-[#29202F] hover:bg-[#62B95B]/15 hover:border-[#62B95B]/50 transition-all cursor-pointer shadow-2xs"
            >
              ⚡ Top Crop Nutrición
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('advanced_nutrients_ph_perfect')}
              className="px-3 py-1.5 rounded-xl bg-white border border-[#EFE3CF] text-xs font-semibold text-[#29202F] hover:bg-[#62B95B]/15 hover:border-[#62B95B]/50 transition-all cursor-pointer shadow-2xs"
            >
              🧪 Advanced Nutrients pH Perfect
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* General Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-[#29202F]/80 mb-1">Nombre de la Tabla *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej. Biobizz Orgánico - Tierra"
                className="w-full px-3.5 py-2 rounded-2xl bg-white border border-[#EFE3CF] text-xs font-semibold text-[#29202F] focus:outline-hidden focus:border-[#6C45C7]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#29202F]/80 mb-1">Marca / Línea</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="ej. Biobizz, Top Crop..."
                className="w-full px-3.5 py-2 rounded-2xl bg-white border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#6C45C7]"
              />
            </div>
          </div>

          {/* Weeks Accordion List */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#29202F]/80">
                Semanas del Programa ({weeks.length})
              </span>
              <button
                type="button"
                onClick={handleAddWeek}
                className="px-3 py-1.5 rounded-xl bg-[#62B95B]/15 border border-[#62B95B]/30 text-[#2d6b28] text-xs font-bold hover:bg-[#62B95B]/25 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Añadir Semana</span>
              </button>
            </div>

            {weeks.map((week, wIdx) => {
              const isExpanded = expandedWeekIdx === wIdx;
              return (
                <div
                  key={wIdx}
                  className="rounded-2xl border border-[#EFE3CF] overflow-hidden bg-[#FFFDF7]"
                >
                  {/* Accordion header */}
                  <div
                    onClick={() => setExpandedWeekIdx(isExpanded ? -1 : wIdx)}
                    className="p-3 bg-white flex items-center justify-between cursor-pointer hover:bg-[#FFF8E8] transition-colors select-none"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-xl bg-[#6C45C7]/15 text-[#6C45C7] font-black text-xs flex items-center justify-center">
                        {week.weekNumber}
                      </span>
                      <div>
                        <span className="text-xs font-bold text-[#29202F] block">{week.title}</span>
                        <span className="text-[10px] text-[#29202F]/60">
                          {week.stage} · {week.products.length} productos · EC {week.targetEc || '—'} · pH {week.targetPh || '—'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveWeek(wIdx);
                        }}
                        className="p-1.5 text-[#29202F]/40 hover:text-[#EB7864] rounded-lg transition-colors cursor-pointer"
                        title="Eliminar semana"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-[#29202F]/40" /> : <ChevronDown className="w-4 h-4 text-[#29202F]/40" />}
                    </div>
                  </div>

                  {/* Expanded Body */}
                  {isExpanded && (
                    <div className="p-4 space-y-3 bg-[#FFFDF7] border-t border-[#EFE3CF]">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-semibold text-[#29202F]/70 mb-1">Título de la semana</label>
                          <input
                            type="text"
                            value={week.title}
                            onChange={(e) => handleWeekFieldChange(wIdx, 'title', e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-[#EFE3CF] text-xs text-[#29202F]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-[#29202F]/70 mb-1">Etapa</label>
                          <select
                            value={week.stage}
                            onChange={(e) => handleWeekFieldChange(wIdx, 'stage', e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-[#EFE3CF] text-xs font-medium text-[#29202F] cursor-pointer"
                          >
                            <option value="Plántula">Plántula</option>
                            <option value="Vegetativo">Vegetativo</option>
                            <option value="Prefloración">Prefloración</option>
                            <option value="Floración">Floración</option>
                            <option value="Maduración">Maduración</option>
                            <option value="Lavado">Lavado</option>
                          </select>
                        </div>

                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="block text-[11px] font-semibold text-[#29202F]/70 mb-1">Target pH</label>
                            <input
                              type="number"
                              step="0.05"
                              value={week.targetPh || ''}
                              onChange={(e) => handleWeekFieldChange(wIdx, 'targetPh', parseFloat(e.target.value) || undefined)}
                              className="w-full px-2 py-1.5 rounded-xl bg-white border border-[#EFE3CF] text-xs text-[#29202F]"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-[11px] font-semibold text-[#29202F]/70 mb-1">Target EC</label>
                            <input
                              type="number"
                              step="0.05"
                              value={week.targetEc || ''}
                              onChange={(e) => handleWeekFieldChange(wIdx, 'targetEc', parseFloat(e.target.value) || undefined)}
                              className="w-full px-2 py-1.5 rounded-xl bg-white border border-[#EFE3CF] text-xs text-[#29202F]"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Products in this week */}
                      <div className="space-y-2 pt-2 border-t border-[#EFE3CF]">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-[#29202F]/80 uppercase tracking-wider">
                            Productos en esta semana
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAddProductToWeek(wIdx)}
                            className="text-[11px] font-bold text-[#6C45C7] hover:text-[#5835ab] flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Añadir Producto</span>
                          </button>
                        </div>

                        {week.products.length === 0 ? (
                          <p className="text-[11px] text-[#29202F]/50 italic">
                            Sin productos (Semana de solo agua o flush).
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {week.products.map((prod, pIdx) => (
                              <div
                                key={prod.id || pIdx}
                                className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2 rounded-xl bg-white border border-[#EFE3CF] text-xs"
                              >
                                <input
                                  type="text"
                                  placeholder="Nombre del producto"
                                  value={prod.name}
                                  onChange={(e) => handleProductChange(wIdx, pIdx, 'name', e.target.value)}
                                  className="flex-1 px-2.5 py-1 rounded-lg bg-[#FFFDF7] border border-[#EFE3CF] text-xs font-semibold text-[#29202F]"
                                />

                                <input
                                  type="text"
                                  placeholder="Marca (opcional)"
                                  value={prod.brand || ''}
                                  onChange={(e) => handleProductChange(wIdx, pIdx, 'brand', e.target.value)}
                                  className="w-24 px-2 py-1 rounded-lg bg-[#FFFDF7] border border-[#EFE3CF] text-xs text-[#29202F]"
                                />

                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    value={prod.dosageMlPerL}
                                    onChange={(e) => handleProductChange(wIdx, pIdx, 'dosageMlPerL', parseFloat(e.target.value) || 0)}
                                    className="w-16 px-2 py-1 rounded-lg bg-[#FFFDF7] border border-[#EFE3CF] text-xs font-bold text-center text-[#29202F]"
                                  />
                                  <span className="text-[10px] text-[#29202F]/60">ml/L</span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleRemoveProductFromWeek(wIdx, pIdx)}
                                  className="p-1 text-[#29202F]/40 hover:text-[#EB7864] transition-colors cursor-pointer"
                                  title="Quitar"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer actions */}
          <div className="pt-4 border-t border-[#EFE3CF] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="cultiveta-btn-secondary py-2.5 text-xs font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="cultiveta-btn-primary py-2.5 text-xs font-black flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>Guardar Tabla</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
