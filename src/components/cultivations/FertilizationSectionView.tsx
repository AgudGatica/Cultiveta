import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Droplets,
  Plus,
  Edit,
  RotateCcw,
  CheckCircle2,
  Calendar,
  Layers,
  HelpCircle,
  FlaskConical,
  Beaker,
  Calculator,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { Cultivation, Watering, FertilizationSchedule, FertilizationWeek, WateringProductItem } from '../../types';
import { fertilizationService } from '../../services/fertilizationService';
import { AssociateFertilizationModal } from './AssociateFertilizationModal';
import { EditScheduleModal } from './EditScheduleModal';

interface FertilizationSectionViewProps {
  cultivation: Cultivation;
  userId: string;
  waterings: Watering[];
  onOpenWateringModalWithProducts?: (products: WateringProductItem[], defaultPh?: number, defaultEc?: number) => void;
  onWateringUpdated?: (updatedWatering: Watering) => void;
}

export const FertilizationSectionView: React.FC<FertilizationSectionViewProps> = ({
  cultivation,
  userId,
  waterings,
  onOpenWateringModalWithProducts,
  onWateringUpdated,
}) => {
  const [schedule, setSchedule] = useState<FertilizationSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeWeekTab, setActiveWeekTab] = useState<number>(1);
  const [solutionVolumeLiters, setSolutionVolumeLiters] = useState<number>(5);
  const [filterMode, setFilterMode] = useState<'all' | 'fertilized' | 'water_only'>('all');

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [wateringToAssociate, setWateringToAssociate] = useState<Watering | null>(null);

  // Load schedule for this cultivation
  useEffect(() => {
    let mounted = true;
    const fetchSchedule = async () => {
      setLoading(true);
      try {
        const found = await fertilizationService.getScheduleByCultivation(cultivation.id, userId);
        if (mounted) {
          if (found) {
            setSchedule(found);
            const calculatedWeek = fertilizationService.calculateCurrentWeek(cultivation);
            setActiveWeekTab(Math.min(calculatedWeek, found.weeks.length || 1));
          } else {
            // Auto initialize with Biobizz or general preset if demo or none exists
            const defaultSched = fertilizationService.getPresetSchedule(
              'biobizz_organic',
              cultivation.id,
              userId
            );
            defaultSched.isDemo = cultivation.isDemo;
            setSchedule(defaultSched);
            const calculatedWeek = fertilizationService.calculateCurrentWeek(cultivation);
            setActiveWeekTab(Math.min(calculatedWeek, defaultSched.weeks.length || 1));
            fertilizationService.saveSchedule(defaultSched);
          }
        }
      } catch (err) {
        console.error('Error fetching fertilization schedule:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchSchedule();
    return () => {
      mounted = false;
    };
  }, [cultivation.id, userId]);

  const currentCropWeek = fertilizationService.calculateCurrentWeek(cultivation);
  const activeWeekData = schedule?.weeks.find((w) => w.weekNumber === activeWeekTab) || schedule?.weeks[0];
  const currentWeekData = schedule?.weeks.find((w) => w.weekNumber === currentCropWeek) || activeWeekData;

  const handleSelectPreset = async (presetId: string) => {
    if (!schedule) return;
    const newSched = fertilizationService.getPresetSchedule(presetId, cultivation.id, userId);
    newSched.id = schedule.id;
    newSched.isDemo = cultivation.isDemo;
    setSchedule(newSched);
    await fertilizationService.saveSchedule(newSched);
  };

  const handleSaveUpdatedSchedule = async (updated: FertilizationSchedule) => {
    setSchedule(updated);
    await fertilizationService.saveSchedule(updated);
  };

  const handleApplyCurrentRecipeToNewWatering = () => {
    if (!currentWeekData || !onOpenWateringModalWithProducts) return;
    const mappedProducts: WateringProductItem[] = currentWeekData.products.map((p) => ({
      name: p.name,
      brand: p.brand || schedule?.brand,
      dosageMlPerL: p.dosageMlPerL,
      category: p.category,
      totalAmountMl: Number((p.dosageMlPerL * solutionVolumeLiters).toFixed(1)),
    }));
    onOpenWateringModalWithProducts(
      mappedProducts,
      currentWeekData.targetPh,
      currentWeekData.targetEc
    );
  };

  // Filter waterings for this cultivation
  const cropWaterings = waterings.filter((w) => w.cultivationId === cultivation.id);
  const filteredWaterings = cropWaterings.filter((w) => {
    const hasProducts = w.productsUsed && w.productsUsed.length > 0;
    if (filterMode === 'fertilized') return hasProducts;
    if (filterMode === 'water_only') return !hasProducts;
    return true;
  });

  const totalFertilizations = cropWaterings.filter((w) => w.productsUsed && w.productsUsed.length > 0).length;
  const totalWaterOnly = cropWaterings.length - totalFertilizations;

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* Top Banner & Active Schedule Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5" />
                Programa Nutricional Activo
              </span>
              {schedule?.brand && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-700">
                  {schedule.brand}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-extrabold text-stone-900 tracking-tight">
              {schedule?.name || 'Tabla de Fertilización'}
            </h2>
            <p className="text-xs text-stone-500 max-w-xl">
              {schedule?.notes || 'Gestiona la dosificación semanal y asocia los nutrientes aplicados a cada riego.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative group">
              <button
                type="button"
                className="px-3.5 py-2 rounded-2xl bg-stone-50 hover:bg-stone-100 text-stone-700 font-bold text-xs border border-stone-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Cambiar Plan / Preset</span>
              </button>
              <div className="absolute right-0 top-full mt-1.5 hidden group-hover:block bg-white rounded-2xl shadow-xl border border-stone-200 p-2 z-20 w-64 space-y-1">
                <button
                  type="button"
                  onClick={() => handleSelectPreset('biobizz_organic')}
                  className="w-full text-left p-2 rounded-xl text-xs font-semibold hover:bg-emerald-50 hover:text-emerald-900 transition-colors block cursor-pointer"
                >
                  <strong className="block text-stone-900">Biobizz 100% Orgánico</strong>
                  <span className="text-[10px] text-stone-500">All-Mix / Light-Mix (10 sem)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset('top_crop_line')}
                  className="w-full text-left p-2 rounded-xl text-xs font-semibold hover:bg-emerald-50 hover:text-emerald-900 transition-colors block cursor-pointer"
                >
                  <strong className="block text-stone-900">Top Crop Nutrición</strong>
                  <span className="text-[10px] text-stone-500">Mineral + Bioestimulantes (9 sem)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset('advanced_nutrients_ph_perfect')}
                  className="w-full text-left p-2 rounded-xl text-xs font-semibold hover:bg-emerald-50 hover:text-emerald-900 transition-colors block cursor-pointer"
                >
                  <strong className="block text-stone-900">Advanced Nutrients pH Perfect</strong>
                  <span className="text-[10px] text-stone-500">Sensi Series Autoestabilizante (9 sem)</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>Personalizar Tabla</span>
            </button>
          </div>
        </div>

        {/* Current Active Week Recommendation Card */}
        {currentWeekData && (
          <div className="p-5 rounded-3xl bg-linear-to-br from-emerald-950 via-emerald-900 to-zinc-900 text-white shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 font-bold text-[11px] border border-emerald-400/30 uppercase tracking-wide">
                    Etapa Actual: Semana {currentWeekData.weekNumber}
                  </span>
                  <span className="text-xs text-emerald-200/80 font-medium">
                    · {currentWeekData.stage}
                  </span>
                </div>
                <h3 className="text-xl font-extrabold text-white">
                  {currentWeekData.title}
                </h3>
              </div>

              <div className="flex items-center gap-4 bg-black/30 backdrop-blur-xs px-4 py-2 rounded-2xl border border-white/10">
                <div className="text-center">
                  <span className="text-[10px] uppercase font-bold text-emerald-300/80 block">Target pH</span>
                  <span className="text-base font-extrabold text-white">{currentWeekData.targetPh || '6.2 - 6.5'}</span>
                </div>
                <div className="h-6 w-px bg-white/15" />
                <div className="text-center">
                  <span className="text-[10px] uppercase font-bold text-emerald-300/80 block">Target EC</span>
                  <span className="text-base font-extrabold text-white">{currentWeekData.targetEc ? `${currentWeekData.targetEc} mS` : '1.4 - 1.8'}</span>
                </div>
              </div>
            </div>

            {/* Product Recipes List for Current Week */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
              {currentWeekData.products.length === 0 ? (
                <div className="col-span-full p-4 rounded-2xl bg-white/5 border border-white/10 text-center text-xs text-emerald-200/70">
                  Esta semana corresponde a riego sin fertilizantes (Lavado de raíces o descanso hídrico).
                </div>
              ) : (
                currentWeekData.products.map((p, pIdx) => {
                  const calculatedMl = (p.dosageMlPerL * solutionVolumeLiters).toFixed(1);
                  return (
                    <div
                      key={pIdx}
                      className="p-3.5 rounded-2xl bg-white/10 border border-white/10 backdrop-blur-xs flex items-center justify-between"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white">{p.name}</span>
                          {p.brand && (
                            <span className="text-[10px] text-emerald-300/70 font-medium">
                              {p.brand}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-emerald-200 font-semibold block">
                          Dosis: {p.dosageMlPerL} ml / Litro
                        </span>
                        {p.notes && (
                          <span className="text-[10px] text-white/60 line-clamp-1">{p.notes}</span>
                        )}
                      </div>

                      <div className="text-right pl-3 border-l border-white/10">
                        <span className="text-[10px] font-semibold text-emerald-300 block uppercase tracking-wider">
                          Para {solutionVolumeLiters}L
                        </span>
                        <div className="text-lg font-black text-amber-300">
                          {calculatedMl} <span className="text-xs font-bold text-emerald-200">ml</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Interactive Volume Calculator & Action Button */}
            <div className="pt-3 border-t border-white/15 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-emerald-200/90 flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-emerald-400" />
                  Calcular para tanque de:
                </span>
                <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-xl border border-white/10">
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="500"
                    value={solutionVolumeLiters}
                    onChange={(e) => setSolutionVolumeLiters(parseFloat(e.target.value) || 1)}
                    className="w-14 bg-transparent text-white font-extrabold text-sm text-center focus:outline-hidden"
                  />
                  <span className="text-xs font-bold text-emerald-300">Litros</span>
                </div>
                <div className="hidden sm:flex gap-1">
                  {[2, 5, 10, 20].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSolutionVolumeLiters(v)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        solutionVolumeLiters === v
                          ? 'bg-emerald-500 text-black shadow-xs'
                          : 'bg-white/10 hover:bg-white/20 text-white/80'
                      }`}
                    >
                      {v}L
                    </button>
                  ))}
                </div>
              </div>

              {onOpenWateringModalWithProducts && (
                <button
                  type="button"
                  onClick={handleApplyCurrentRecipeToNewWatering}
                  className="px-5 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-black text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer group"
                >
                  <Droplets className="w-4 h-4 text-stone-950 group-hover:scale-110 transition-transform" />
                  <span>Registrar Riego con esta Receta</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Week-by-Week Program Matrix */}
      {schedule && schedule.weeks.length > 0 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-stone-900">Tabla Nutricional Semana a Semana</h3>
              <p className="text-xs text-stone-500">
                Visualiza los objetivos agronómicos y productos prescritos para cada etapa del cultivo
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1.5 cursor-pointer"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>Editar Dosis de la Tabla</span>
            </button>
          </div>

          {/* Week Selector Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {schedule.weeks.map((w) => {
              const isCurrent = w.weekNumber === currentCropWeek;
              const isSelected = w.weekNumber === activeWeekTab;

              return (
                <button
                  key={w.weekNumber}
                  type="button"
                  onClick={() => setActiveWeekTab(w.weekNumber)}
                  className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 border ${
                    isSelected
                      ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                      : isCurrent
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300 font-extrabold'
                      : 'bg-stone-50 text-stone-600 hover:bg-stone-100 border-stone-200'
                  }`}
                >
                  <span>Sem. {w.weekNumber}</span>
                  {isCurrent && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Semana Actual" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Selected Week Details Card */}
          {activeWeekData && (
            <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="px-2.5 py-1 rounded-xl bg-white border border-stone-200 text-xs font-black text-stone-800 shadow-2xs">
                    Semana {activeWeekData.weekNumber}
                  </span>
                  <h4 className="font-extrabold text-stone-900 text-base">
                    {activeWeekData.title}
                  </h4>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900">
                    {activeWeekData.stage}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="text-stone-600">
                    Target pH: <strong className="text-stone-900">{activeWeekData.targetPh || '—'}</strong>
                  </span>
                  <span>·</span>
                  <span className="text-stone-600">
                    Target EC: <strong className="text-stone-900">{activeWeekData.targetEc ? `${activeWeekData.targetEc} mS/cm` : '—'}</strong>
                  </span>
                </div>
              </div>

              {activeWeekData.observations && (
                <p className="text-xs text-stone-600 italic bg-white p-3 rounded-xl border border-stone-200/80">
                  "{activeWeekData.observations}"
                </p>
              )}

              {/* Products in selected week */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 block">
                  Productos y Dosis Prescritas:
                </span>

                {activeWeekData.products.length === 0 ? (
                  <div className="p-4 rounded-xl bg-white border border-dashed border-stone-200 text-center text-xs text-stone-500">
                    Solo agua desclorada (Flush o etapa sin fertilización).
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {activeWeekData.products.map((prod, pIdx) => (
                      <div
                        key={pIdx}
                        className="p-3 rounded-xl bg-white border border-stone-200 flex items-center justify-between shadow-2xs"
                      >
                        <div>
                          <span className="font-bold text-xs text-stone-900 block">{prod.name}</span>
                          <span className="text-[10px] text-stone-500 font-medium">
                            {prod.brand || schedule.brand || 'Nutriente'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-extrabold text-emerald-800 block">
                            {prod.dosageMlPerL} ml/L
                          </span>
                          <span className="text-[10px] text-stone-400">
                            {(prod.dosageMlPerL * solutionVolumeLiters).toFixed(1)} ml ({solutionVolumeLiters}L)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Riegos Realizados y Productos Asociados */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-stone-900">Historial de Riegos y Nutrición Aplicada</h3>
              <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-xs font-semibold">
                {cropWaterings.length} riegos
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Revisa los productos específicos añadidos en cada fecha o asocia nutrientes a riegos pasados
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-stone-100 border border-stone-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Todos ({cropWaterings.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('fertilized')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                filterMode === 'fertilized'
                  ? 'bg-white text-emerald-900 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <FlaskConical className="w-3 h-3 text-emerald-600" />
              <span>Con Nutrición ({totalFertilizations})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('water_only')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                filterMode === 'water_only'
                  ? 'bg-white text-cyan-900 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <Droplets className="w-3 h-3 text-cyan-600" />
              <span>Solo Agua ({totalWaterOnly})</span>
            </button>
          </div>
        </div>

        {/* Waterings list */}
        {filteredWaterings.length === 0 ? (
          <div className="p-8 rounded-3xl bg-stone-50 border border-dashed border-stone-200 text-center space-y-2">
            <Droplets className="w-8 h-8 text-stone-400 mx-auto" />
            <p className="text-sm font-bold text-stone-700">No hay registros de riego en esta categoría.</p>
            <p className="text-xs text-stone-400">
              Registra un riego desde la botonera superior o asocia productos a tus riegos anteriores.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredWaterings.map((watering) => {
              const hasProducts = watering.productsUsed && watering.productsUsed.length > 0;

              return (
                <div
                  key={watering.id}
                  className="p-4 sm:p-5 rounded-2xl bg-white border border-stone-200 shadow-2xs hover:border-emerald-200 transition-all space-y-3"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                          hasProducts
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-cyan-100 text-cyan-800'
                        }`}
                      >
                        {hasProducts ? (
                          <FlaskConical className="w-5 h-5" />
                        ) : (
                          <Droplets className="w-5 h-5" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-stone-900">
                            {watering.date}
                          </span>
                          {watering.time && (
                            <span className="text-xs text-stone-400">· {watering.time}</span>
                          )}
                          {watering.fertilizationWeekNumber && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Semana {watering.fertilizationWeekNumber}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-stone-600 mt-0.5">
                          <span>
                            Volumen: <strong className="text-stone-900">{watering.volumeLiters} L</strong>
                          </span>
                          <span>·</span>
                          <span>
                            pH entrada: <strong className="text-stone-900">{watering.phIn ?? '—'}</strong>
                          </span>
                          <span>·</span>
                          <span>
                            EC entrada: <strong className="text-stone-900">{watering.ecIn ? `${watering.ecIn} mS` : '—'}</strong>
                          </span>
                          {watering.ecRunoff && (
                            <>
                              <span>·</span>
                              <span className="text-amber-700">
                                EC Drenaje: <strong>{watering.ecRunoff} mS</strong>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setWateringToAssociate(watering)}
                      className="px-3.5 py-1.5 rounded-xl bg-stone-50 hover:bg-emerald-50 hover:text-emerald-900 text-stone-700 font-bold text-xs border border-stone-200 hover:border-emerald-300 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs self-end sm:self-center"
                    >
                      <Plus className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{hasProducts ? 'Editar Nutrición' : 'Asociar Productos'}</span>
                    </button>
                  </div>

                  {/* Products applied breakdown */}
                  <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold text-stone-500">
                      Nutrición aplicada:
                    </span>
                    {!hasProducts ? (
                      <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-600">
                        💧 Solo Agua (Sin fertilizantes)
                      </span>
                    ) : (
                      watering.productsUsed!.map((prod, pIdx) => (
                        <div
                          key={pIdx}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50/80 border border-emerald-200/90 text-xs text-emerald-950 font-semibold"
                        >
                          <span className="font-bold">{prod.name}</span>
                          {prod.dosageMlPerL && (
                            <span className="text-emerald-700 text-[10px] font-bold bg-white px-1.5 py-0.5 rounded">
                              {prod.dosageMlPerL} ml/L
                            </span>
                          )}
                          {prod.dosageMlPerL && (
                            <span className="text-stone-400 text-[10px]">
                              ({(prod.dosageMlPerL * watering.volumeLiters).toFixed(1)} ml)
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {watering.observations && (
                    <p className="text-[11px] text-stone-500 italic bg-stone-50/60 p-2 rounded-xl">
                      Observación: {watering.observations}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Schedule Modal */}
      {isEditModalOpen && schedule && (
        <EditScheduleModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          schedule={schedule}
          onSaveSchedule={handleSaveUpdatedSchedule}
        />
      )}

      {/* Associate Products to Watering Modal */}
      {wateringToAssociate && (
        <AssociateFertilizationModal
          isOpen={!!wateringToAssociate}
          onClose={() => setWateringToAssociate(null)}
          watering={wateringToAssociate}
          schedule={schedule}
          userId={userId}
          onWateringUpdated={(updated) => {
            if (onWateringUpdated) {
              onWateringUpdated(updated);
            }
            setWateringToAssociate(null);
          }}
        />
      )}
    </div>
  );
};
