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
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#EFE3CF] shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-[#62B95B]/15 text-[#62B95B] border border-[#62B95B]/30 text-xs font-bold flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5" />
                Programa Nutricional Activo
              </span>
              {schedule?.brand && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#FAF2E1] text-[#29202F]">
                  {schedule.brand}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-black text-[#29202F] tracking-tight">
              {schedule?.name || 'Tabla de Fertilización'}
            </h2>
            <p className="text-xs text-[#6E5D77] max-w-xl">
              {schedule?.notes || 'Gestioná la dosificación semanal y asociá los nutrientes aplicados a cada riego.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative group">
              <button
                type="button"
                className="px-3.5 py-2 rounded-2xl bg-[#FFFDF7] hover:bg-[#FAF2E1] text-[#29202F] font-bold text-xs border border-[#EFE3CF] transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#F3C843]" />
                <span>Cambiar Plan / Preset</span>
              </button>
              <div className="absolute right-0 top-full mt-1.5 hidden group-hover:block bg-white rounded-2xl shadow-xl border border-[#EFE3CF] p-2 z-20 w-64 space-y-1">
                <button
                  type="button"
                  onClick={() => handleSelectPreset('biobizz_organic')}
                  className="w-full text-left p-2 rounded-xl text-xs font-semibold hover:bg-[#FAF2E1] hover:text-[#6C45C7] transition-colors block cursor-pointer"
                >
                  <strong className="block text-[#29202F]">Biobizz 100% Orgánico</strong>
                  <span className="text-[10px] text-[#6E5D77]">All-Mix / Light-Mix (10 sem)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset('top_crop_line')}
                  className="w-full text-left p-2 rounded-xl text-xs font-semibold hover:bg-[#FAF2E1] hover:text-[#6C45C7] transition-colors block cursor-pointer"
                >
                  <strong className="block text-[#29202F]">Top Crop Nutrición</strong>
                  <span className="text-[10px] text-[#6E5D77]">Mineral + Bioestimulantes (9 sem)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset('advanced_nutrients_ph_perfect')}
                  className="w-full text-left p-2 rounded-xl text-xs font-semibold hover:bg-[#FAF2E1] hover:text-[#6C45C7] transition-colors block cursor-pointer"
                >
                  <strong className="block text-[#29202F]">Advanced Nutrients pH Perfect</strong>
                  <span className="text-[10px] text-[#6E5D77]">Sensi Series Autoestabilizante (9 sem)</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="cultiveta-btn-primary text-xs"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>Personalizar Tabla</span>
            </button>
          </div>
        </div>

        {/* Current Active Week Recommendation Card */}
        {currentWeekData && (
          <div className="p-6 rounded-3xl bg-linear-to-br from-[#6C45C7] via-[#5835ab] to-[#29202F] text-white shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white font-bold text-[11px] border border-white/30 uppercase tracking-wide">
                    Etapa Actual: Semana {currentWeekData.weekNumber}
                  </span>
                  <span className="text-xs text-white/80 font-medium">
                    · {currentWeekData.stage}
                  </span>
                </div>
                <h3 className="text-xl font-black text-white">
                  {currentWeekData.title}
                </h3>
              </div>

              <div className="flex items-center gap-4 bg-white/10 backdrop-blur-xs px-4 py-2 rounded-2xl border border-white/20">
                <div className="text-center">
                  <span className="text-[10px] uppercase font-bold text-white/80 block">Target pH</span>
                  <span className="text-base font-black text-white">{currentWeekData.targetPh || '6.2 - 6.5'}</span>
                </div>
                <div className="h-6 w-px bg-white/20" />
                <div className="text-center">
                  <span className="text-[10px] uppercase font-bold text-white/80 block">Target EC</span>
                  <span className="text-base font-black text-[#F3C843]">{currentWeekData.targetEc ? `${currentWeekData.targetEc} mS` : '1.4 - 1.8'}</span>
                </div>
              </div>
            </div>

            {/* Product Recipes List for Current Week */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
              {currentWeekData.products.length === 0 ? (
                <div className="col-span-full p-4 rounded-2xl bg-white/10 border border-white/20 text-center text-xs text-white/80 font-medium">
                  Esta semana corresponde a riego sin fertilizantes (Lavado de raíces o descanso hídrico).
                </div>
              ) : (
                currentWeekData.products.map((p, pIdx) => {
                  const calculatedMl = (p.dosageMlPerL * solutionVolumeLiters).toFixed(1);
                  return (
                    <div
                      key={pIdx}
                      className="p-3.5 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-xs flex items-center justify-between"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-white">{p.name}</span>
                          {p.brand && (
                            <span className="text-[10px] text-[#F3C843] font-bold">
                              {p.brand}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-white/90 font-bold block">
                          Dosis: {p.dosageMlPerL} ml / Litro
                        </span>
                        {p.notes && (
                          <span className="text-[10px] text-white/70 line-clamp-1">{p.notes}</span>
                        )}
                      </div>

                      <div className="text-right pl-3 border-l border-white/20">
                        <span className="text-[10px] font-bold text-white/80 block uppercase tracking-wider">
                          Para {solutionVolumeLiters}L
                        </span>
                        <div className="text-lg font-black text-[#F3C843]">
                          {calculatedMl} <span className="text-xs font-bold text-white">ml</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Interactive Volume Calculator & Action Button */}
            <div className="pt-3 border-t border-white/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-white/90 flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-[#F3C843]" />
                  Calcular para tanque de:
                </span>
                <div className="flex items-center gap-1.5 bg-black/25 px-3 py-1.5 rounded-2xl border border-white/20">
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="500"
                    value={solutionVolumeLiters}
                    onChange={(e) => setSolutionVolumeLiters(parseFloat(e.target.value) || 1)}
                    className="w-14 bg-transparent text-white font-black text-sm text-center focus:outline-hidden"
                  />
                  <span className="text-xs font-bold text-[#F3C843]">Litros</span>
                </div>
                <div className="hidden sm:flex gap-1">
                  {[2, 5, 10, 20].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSolutionVolumeLiters(v)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                        solutionVolumeLiters === v
                          ? 'bg-[#F3C843] text-[#29202F] shadow-xs'
                          : 'bg-white/10 hover:bg-white/20 text-white'
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
                  className="px-5 py-2.5 rounded-2xl bg-[#F3C843] hover:bg-[#e4ba35] text-[#29202F] font-black text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer group active:scale-95"
                >
                  <Droplets className="w-4 h-4 text-[#29202F] group-hover:scale-110 transition-transform" />
                  <span>Registrar Riego con esta Receta</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Week-by-Week Program Matrix */}
      {schedule && schedule.weeks.length > 0 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#EFE3CF] shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-[#29202F]">Tabla Nutricional Semana a Semana</h3>
              <p className="text-xs text-[#29202F]/70">
                Visualiza los objetivos agronómicos y productos prescritos para cada etapa del cultivo
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="text-xs font-bold text-[#6C45C7] hover:text-[#5835ab] flex items-center gap-1.5 cursor-pointer"
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
                      ? 'bg-[#6C45C7] text-white border-[#6C45C7] shadow-xs'
                      : isCurrent
                      ? 'bg-[#62B95B]/15 text-[#2d6b28] border-[#62B95B] font-extrabold'
                      : 'bg-[#FFFDF7] text-[#29202F]/70 hover:bg-[#FFF8E8] border-[#EFE3CF]'
                  }`}
                >
                  <span>Sem. {w.weekNumber}</span>
                  {isCurrent && (
                    <span className="w-2 h-2 rounded-full bg-[#62B95B] animate-pulse" title="Semana Actual" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Selected Week Details Card */}
          {activeWeekData && (
            <div className="p-5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="px-2.5 py-1 rounded-xl bg-white border border-[#EFE3CF] text-xs font-black text-[#29202F] shadow-2xs">
                    Semana {activeWeekData.weekNumber}
                  </span>
                  <h4 className="font-extrabold text-[#29202F] text-base">
                    {activeWeekData.title}
                  </h4>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#62B95B]/15 text-[#2d6b28] border border-[#62B95B]/30">
                    {activeWeekData.stage}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="text-[#29202F]/70">
                    Target pH: <strong className="text-[#29202F]">{activeWeekData.targetPh || '—'}</strong>
                  </span>
                  <span>·</span>
                  <span className="text-[#29202F]/70">
                    Target EC: <strong className="text-[#29202F]">{activeWeekData.targetEc ? `${activeWeekData.targetEc} mS/cm` : '—'}</strong>
                  </span>
                </div>
              </div>

              {activeWeekData.observations && (
                <p className="text-xs text-[#29202F]/80 italic bg-white p-3 rounded-xl border border-[#EFE3CF]">
                  "{activeWeekData.observations}"
                </p>
              )}

              {/* Products in selected week */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#29202F]/60 block">
                  Productos y Dosis Prescritas:
                </span>

                {activeWeekData.products.length === 0 ? (
                  <div className="p-4 rounded-xl bg-white border border-dashed border-[#EFE3CF] text-center text-xs text-[#29202F]/60">
                    Solo agua desclorada (Flush o etapa sin fertilización).
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {activeWeekData.products.map((prod, pIdx) => (
                      <div
                        key={pIdx}
                        className="p-3 rounded-xl bg-white border border-[#EFE3CF] flex items-center justify-between shadow-2xs"
                      >
                        <div>
                          <span className="font-bold text-xs text-[#29202F] block">{prod.name}</span>
                          <span className="text-[10px] text-[#29202F]/60 font-medium">
                            {prod.brand || schedule.brand || 'Nutriente'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-extrabold text-[#62B95B] block">
                            {prod.dosageMlPerL} ml/L
                          </span>
                          <span className="text-[10px] text-[#29202F]/50">
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
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#EFE3CF] shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-[#29202F]">Historial de Riegos y Nutrición Aplicada</h3>
              <span className="px-2 py-0.5 rounded-full bg-[#FFF8E8] text-[#29202F] text-xs font-semibold border border-[#EFE3CF]">
                {cropWaterings.length} riegos
              </span>
            </div>
            <p className="text-xs text-[#29202F]/70 mt-0.5">
              Revisa los productos específicos añadidos en cada fecha o asocia nutrientes a riegos pasados
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#FFF8E8] border border-[#EFE3CF] text-xs font-bold">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-white text-[#29202F] shadow-2xs font-black'
                  : 'text-[#29202F]/60 hover:text-[#29202F]'
              }`}
            >
              Todos ({cropWaterings.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('fertilized')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                filterMode === 'fertilized'
                  ? 'bg-white text-[#62B95B] shadow-2xs font-black'
                  : 'text-[#29202F]/60 hover:text-[#29202F]'
              }`}
            >
              <FlaskConical className="w-3 h-3 text-[#62B95B]" />
              <span>Con Nutrición ({totalFertilizations})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('water_only')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                filterMode === 'water_only'
                  ? 'bg-white text-[#6C45C7] shadow-2xs font-black'
                  : 'text-[#29202F]/60 hover:text-[#29202F]'
              }`}
            >
              <Droplets className="w-3 h-3 text-[#6C45C7]" />
              <span>Solo Agua ({totalWaterOnly})</span>
            </button>
          </div>
        </div>

        {/* Waterings list */}
        {filteredWaterings.length === 0 ? (
          <div className="p-8 rounded-3xl bg-[#FFFDF7] border border-dashed border-[#EFE3CF] text-center space-y-2">
            <Droplets className="w-8 h-8 text-[#29202F]/30 mx-auto" />
            <p className="text-sm font-bold text-[#29202F]">No hay registros de riego en esta categoría.</p>
            <p className="text-xs text-[#29202F]/60">
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
                  className="p-4 sm:p-5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] shadow-2xs hover:border-[#6C45C7]/40 transition-all space-y-3"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                          hasProducts
                            ? 'bg-[#62B95B]/15 text-[#62B95B]'
                            : 'bg-[#6C45C7]/15 text-[#6C45C7]'
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
                          <span className="font-extrabold text-sm text-[#29202F]">
                            {watering.date}
                          </span>
                          {watering.time && (
                            <span className="text-xs text-[#29202F]/50">· {watering.time}</span>
                          )}
                          {watering.fertilizationWeekNumber && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#62B95B]/15 text-[#2d6b28] border border-[#62B95B]/30">
                              Semana {watering.fertilizationWeekNumber}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-[#29202F]/70 mt-0.5">
                          <span>
                            Volumen: <strong className="text-[#29202F]">{watering.volumeLiters} L</strong>
                          </span>
                          <span>·</span>
                          <span>
                            pH entrada: <strong className="text-[#29202F]">{watering.phIn ?? '—'}</strong>
                          </span>
                          <span>·</span>
                          <span>
                            EC entrada: <strong className="text-[#29202F]">{watering.ecIn ? `${watering.ecIn} mS` : '—'}</strong>
                          </span>
                          {watering.ecRunoff && (
                            <>
                              <span>·</span>
                              <span className="text-[#EB7864]">
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
                      className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-[#62B95B]/15 hover:text-[#2d6b28] text-[#29202F] font-bold text-xs border border-[#EFE3CF] hover:border-[#62B95B]/50 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs self-end sm:self-center"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#62B95B]" />
                      <span>{hasProducts ? 'Editar Nutrición' : 'Asociar Productos'}</span>
                    </button>
                  </div>

                  {/* Products applied breakdown */}
                  <div className="pt-2 border-t border-[#EFE3CF]/60 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold text-[#29202F]/60">
                      Nutrición aplicada:
                    </span>
                    {!hasProducts ? (
                      <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-white border border-[#EFE3CF] text-[#29202F]/70">
                        💧 Solo Agua (Sin fertilizantes)
                      </span>
                    ) : (
                      watering.productsUsed!.map((prod, pIdx) => (
                        <div
                          key={pIdx}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-[#62B95B]/30 text-xs text-[#29202F] font-semibold"
                        >
                          <span className="font-bold">{prod.name}</span>
                          {prod.dosageMlPerL && (
                            <span className="text-[#62B95B] text-[10px] font-black bg-[#62B95B]/10 px-1.5 py-0.5 rounded">
                              {prod.dosageMlPerL} ml/L
                            </span>
                          )}
                          {prod.dosageMlPerL && (
                            <span className="text-[#29202F]/50 text-[10px]">
                              ({(prod.dosageMlPerL * watering.volumeLiters).toFixed(1)} ml)
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {watering.observations && (
                    <p className="text-[11px] text-[#29202F]/70 italic bg-white p-2 rounded-xl border border-[#EFE3CF]/60">
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
