import React, { useState } from 'react';
import {
  ArrowLeft,
  Droplets,
  Thermometer,
  Camera,
  BookOpen,
  CheckCircle2,
  Calendar,
  Layers,
  Sun,
  Edit,
  Trash2,
  Award,
  Sparkles,
  FileText,
  AlertTriangle,
  Scale,
  ShieldAlert,
} from 'lucide-react';
import {
  Cultivation,
  CultivationGrowthStage,
  Watering,
  EnvironmentRecord,
  PhotoRecord,
  DiaryEntry,
  AIPhotoAnalysisResult,
  Harvest,
  WateringProductItem,
} from '../../types';
import { StatusPill } from '../common/StatusPill';
import { cultivationService } from '../../services/cultivationService';
import { harvestService } from '../../services/harvestService';
import { EditHarvestModal } from '../harvests/EditHarvestModal';
import { EnvironmentChart } from '../charts/EnvironmentChart';
import { WateringChart } from '../charts/WateringChart';
import { MeasurementsTableView } from '../logs/MeasurementsTableView';
import { PhotoGalleryView } from '../gallery/PhotoGalleryView';
import { FinalizeHarvestModal } from './FinalizeHarvestModal';
import { PhotoDiagnosisModal } from '../ai/PhotoDiagnosisModal';
import { GoogleCalendarModal } from '../calendar/GoogleCalendarModal';
import { FertilizationSectionView } from './FertilizationSectionView';
import { FlaskConical, Clock, Settings2, ChevronRight, ChevronDown, PlayCircle } from 'lucide-react';
import { CultivationTimelineView } from './timeline/CultivationTimelineView';
import { StageConfigModal } from './timeline/StageConfigModal';
import { StageTransitionModal } from './timeline/StageTransitionModal';
import {
  getStagesForCultivation,
  getNextStage,
  calculateTimelineMetrics,
  getStageIcon,
  formatFriendlyDate,
} from '../../utils/growthStageUtils';
import { analyzeWateringUrgency } from '../../utils/wateringAlertUtils';

interface CultivationDetailViewProps {
  cultivation: Cultivation;
  userId: string;
  waterings: Watering[];
  envRecords: EnvironmentRecord[];
  photos: PhotoRecord[];
  diaryEntries: DiaryEntry[];
  onBack: () => void;
  onEditCultivation: (cultivation: Cultivation) => void;
  onDeleteCultivation: (cultivationId: string) => void;
  onOpenWateringModal: () => void;
  onOpenEnvModal: () => void;
  onOpenPhotoModal: () => void;
  onOpenDiaryModal: () => void;
  onHarvestFinalized: (harvest: Harvest) => void;
  onDeletePhoto?: (photoId: string) => void;
  onOpenWateringModalWithRecipe?: (products: WateringProductItem[], defaultPh?: number, defaultEc?: number) => void;
  onWateringUpdated?: (updatedWatering: Watering) => void;
  onCultivationUpdated?: (updatedCultivation: Cultivation) => void;
}

export const CultivationDetailView: React.FC<CultivationDetailViewProps> = ({
  cultivation,
  userId,
  waterings,
  envRecords,
  photos,
  diaryEntries,
  onBack,
  onEditCultivation,
  onDeleteCultivation,
  onOpenWateringModal,
  onOpenEnvModal,
  onOpenPhotoModal,
  onOpenDiaryModal,
  onHarvestFinalized,
  onDeletePhoto,
  onOpenWateringModalWithRecipe,
  onWateringUpdated,
  onCultivationUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'fertilization' | 'photos' | 'table' | 'diary' | 'calendar'>('overview');
  const [isHarvestModalOpen, setIsHarvestModalOpen] = useState(false);
  const [harvestToEdit, setHarvestToEdit] = useState<Harvest | null>(null);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isStageConfigModalOpen, setIsStageConfigModalOpen] = useState(false);
  const [isTransitionModalOpen, setIsTransitionModalOpen] = useState(false);
  const [stageForTransition, setStageForTransition] = useState<CultivationGrowthStage | null>(null);
  const [photoToDiagnose, setPhotoToDiagnose] = useState<PhotoRecord | null>(null);
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);

  const stages = getStagesForCultivation(cultivation);
  const nextStage = getNextStage(cultivation, stages);
  const timelineMetrics = calculateTimelineMetrics(cultivation, stages);

  const totalDays = cultivationService.calculateDays(cultivation.startDate);
  const floweringDays = cultivationService.calculateFloweringDays(cultivation.floweringStartDate);
  const isFlowering = cultivation.currentStage === 'Floración';
  const isCosechado = Boolean(
    cultivation.isFinished ||
      cultivation.status?.toLowerCase() === 'cosechado' ||
      cultivation.currentStage?.toLowerCase() === 'cosechado'
  );
  const progressPct = cultivationService.calculateFloweringProgress(
    cultivation.floweringStartDate,
    cultivation.declaredFloweringWeeks
  );

  const cropWaterings = waterings.filter((w) => w.cultivationId === cultivation.id);
  const cropEnv = envRecords.filter((e) => e.cultivationId === cultivation.id);
  const cropPhotos = photos.filter((p) => p.cultivationId === cultivation.id);
  const cropDiary = diaryEntries.filter((d) => d.cultivationId === cultivation.id);

  const lastWatering = cropWaterings[0];
  const lastEnv = cropEnv[0];

  const wateringAnalysis = React.useMemo(() => {
    return analyzeWateringUrgency(cultivation, lastWatering || null);
  }, [cultivation, lastWatering]);

  const isHealthy = !wateringAnalysis.isOverdue && (!lastEnv || (lastEnv.temperatureC >= 18 && lastEnv.temperatureC <= 29 && lastEnv.humidityPct >= 40 && lastEnv.humidityPct <= 70));

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-bold text-[#6E5D77] hover:text-[#6C45C7] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a mis cultivos
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            id="open-calendar-sync-btn"
            onClick={() => setIsCalendarModalOpen(true)}
            className="px-4 py-2 rounded-2xl bg-white hover:bg-[#FAF2E1] text-[#29202F] font-bold text-xs shadow-xs border border-[#EFE3CF] transition-all flex items-center gap-2 cursor-pointer group"
          >
            <Calendar className="w-4 h-4 text-[#6C45C7] group-hover:scale-110 transition-transform" />
            <span>Google Calendar</span>
          </button>

          {!isCosechado ? (
            <button
              type="button"
              id="finalize-crop-btn"
              data-testid="finalize-crop-btn"
              onClick={() => setIsHarvestModalOpen(true)}
              className="px-4 py-2 rounded-2xl bg-[#F3C843] hover:bg-[#e4ba35] text-[#29202F] font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Finalizar cultivo y marcar como cosechado en Firestore"
            >
              <Award className="w-4 h-4 text-[#29202F]" />
              <span>Finalizar Cultivo (Cosechar)</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                id="finalize-crop-btn"
                onClick={() => setIsHarvestModalOpen(true)}
                className="px-3.5 py-2 rounded-2xl bg-[#6C45C7]/10 hover:bg-[#6C45C7]/20 text-[#6C45C7] border border-[#6C45C7]/30 font-bold text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                title="Editar fecha final y peso estimado"
              >
                <CheckCircle2 className="w-4 h-4 text-[#6C45C7]" />
                <span>Cosechado</span>
                {(cultivation.estimatedWeight || cultivation.finalWeight) ? (
                  <span className="ml-1 px-1.5 py-0.5 rounded bg-[#6C45C7]/20 text-[#6C45C7] text-[10px] font-mono font-bold">
                    {cultivation.estimatedWeight || cultivation.finalWeight}g
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                id="edit-harvest-btn"
                onClick={async () => {
                  const h = await harvestService.getHarvestByCultivationId(cultivation.id, userId);
                  if (h) {
                    setHarvestToEdit(h);
                  } else {
                    setIsHarvestModalOpen(true);
                  }
                }}
                className="p-2 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                title="Ficha completa de cosecha"
              >
                <Scale className="w-4 h-4 text-amber-700" />
              </button>
            </div>
          )}

          <button
            type="button"
            id="edit-crop-btn"
            onClick={() => onEditCultivation(cultivation)}
            className="p-2 rounded-2xl bg-white border border-[#EFE3CF] text-[#6E5D77] hover:text-[#29202F] hover:bg-[#FAF2E1] transition-colors cursor-pointer shadow-2xs"
            title="Editar configuración"
          >
            <Edit className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (window.confirm(`¿Estás seguro de eliminar el cultivo "${cultivation.name}"?`)) {
                onDeleteCultivation(cultivation.id);
              }
            }}
            className="p-2 rounded-2xl bg-white border border-[#EFE3CF] text-[#EB7864] hover:bg-[#EB7864]/10 transition-colors cursor-pointer shadow-2xs"
            title="Eliminar cultivo"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Crop Header Card with Progressive Disclosure */}
      <div className="bg-white rounded-[32px] p-6 sm:p-8 border border-[#EFE3CF] shadow-xs space-y-6">
        {/* Primera lectura: Qué cultivo, día/etapa y estado en 3 segundos */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-[#EFE3CF]">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <StatusPill status={cultivation.status} />
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#FAF2E1] text-[#29202F] border border-[#EFE3CF]">
                {cultivation.type}
              </span>
              {cultivation.photoperiodType && (
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#62B95B]/10 text-[#62B95B] border border-[#62B95B]/30">
                  {cultivation.photoperiodType}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-[#29202F] tracking-tight">{cultivation.name}</h1>
            <p className="text-xs sm:text-sm text-[#6E5D77] font-medium flex items-center gap-2">
              <span>
                Genética: <strong className="text-[#29202F]">{cultivation.geneticsName || (cultivation.geneticsList && cultivation.geneticsList[0]?.name) || 'No especificada'}</strong>
              </span>
              {cultivation.seedBank && (
                <span className="text-[#62B95B] font-semibold">({cultivation.seedBank})</span>
              )}
              <span>·</span>
              <span>{cultivation.plantCount} planta{cultivation.plantCount === 1 ? '' : 's'}</span>
            </p>
          </div>

          {/* Quick Health & Stage Status Badge */}
          <div className="flex items-center gap-4 bg-[#FFFDF7] p-4 sm:p-5 rounded-2xl border border-[#EFE3CF] w-full md:w-auto justify-around md:justify-start shadow-xs">
            <div className="text-center sm:text-left">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#9887A2] block">Estado</span>
              <div className={`text-lg sm:text-xl font-extrabold ${isHealthy ? 'text-[#62B95B]' : 'text-[#EB7864]'}`}>
                {isHealthy ? 'Está joya 🌱' : 'Hay algo para mirar ⚠️'}
              </div>
            </div>

            <div className="h-10 w-px bg-[#EFE3CF]" />

            <div className="text-center sm:text-left">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#9887A2] block">Tiempo</span>
              <div className="text-lg sm:text-xl font-black text-[#29202F]">
                Día {totalDays} · <span className="text-[#6C45C7]">{cultivation.currentStage}</span>
              </div>
              {isFlowering && floweringDays && (
                <span className="text-[11px] text-[#EB7864] font-bold block">
                  Día {floweringDays} de floración
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 3-Column Summary Cards: HOY / Último Riego / Ambiente */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* HOY */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#9887A2]">Hoy</span>
                <Clock className="w-4 h-4 text-[#6C45C7]" />
              </div>
              <div className="space-y-1">
                {wateringAnalysis.isOverdue ? (
                  <>
                    <span className="text-sm font-extrabold text-[#EB7864] block">
                      Revisar riego (+{wateringAnalysis.daysOverdue}d)
                    </span>
                    <span className="text-xs text-[#6E5D77] block">
                      Conviene regar ahora para no estresar las raíces.
                    </span>
                  </>
                ) : wateringAnalysis.urgency === 'soon' ? (
                  <>
                    <span className="text-sm font-extrabold text-[#F3C843] block">
                      Revisar riego pronto
                    </span>
                    <span className="text-xs text-[#6E5D77] block">
                      Último riego hace {wateringAnalysis.daysSinceWatering} días.
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-extrabold text-[#62B95B] block">
                      Sin alertas pendientes
                    </span>
                    <span className="text-xs text-[#6E5D77] block">
                      Todo tranqui por acá.
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-[#EFE3CF]">
              <span className="text-[11px] text-[#9887A2] font-semibold">
                Ciclo sugerido: cada {wateringAnalysis.recommendedIntervalDays}d
              </span>
            </div>
          </div>

          {/* Último Riego */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#9887A2]">Último Riego</span>
                <Droplets className="w-4 h-4 text-[#62B95B]" />
              </div>
              <div className="space-y-1">
                <span className="text-sm font-extrabold text-[#29202F] block">
                  {lastWatering ? `${lastWatering.volumeLiters} L` : 'Sin registros aún'}
                </span>
                <span className="text-xs text-[#6E5D77] block">
                  {lastWatering
                    ? `pH ${lastWatering.phIn || '—'} · EC ${lastWatering.ecIn || '—'} · Hace ${wateringAnalysis.daysSinceWatering}d`
                    : 'Anotá el primer riego'}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#EFE3CF] flex items-center justify-between">
              <button
                type="button"
                onClick={onOpenWateringModal}
                className="text-xs font-bold text-[#6C45C7] hover:underline cursor-pointer flex items-center gap-1"
              >
                <span>+ Regar ahora</span>
              </button>
            </div>
          </div>

          {/* Ambiente */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#9887A2]">Ambiente</span>
                <Thermometer className="w-4 h-4 text-[#EB7864]" />
              </div>
              <div className="space-y-1">
                <span className="text-sm font-extrabold text-[#29202F] block">
                  {lastEnv ? `${lastEnv.temperatureC}°C · ${lastEnv.humidityPct}% HR` : 'Sin medición'}
                </span>
                <span className="text-xs text-[#6E5D77] block">
                  {lastEnv?.vpdKPa ? `VPD: ${lastEnv.vpdKPa} kPa` : 'Dentro de rango'}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#EFE3CF] flex items-center justify-between">
              <button
                type="button"
                onClick={onOpenEnvModal}
                className="text-xs font-bold text-[#6C45C7] hover:underline cursor-pointer flex items-center gap-1"
              >
                <span>+ Medir ambiente</span>
              </button>
            </div>
          </div>
        </div>

        {/* Quick Action Buttons */}
        {!cultivation.isFinished && (
          <div className="pt-2 border-t border-[#EFE3CF] grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              type="button"
              onClick={onOpenWateringModal}
              className="p-3 rounded-2xl bg-[#62B95B]/10 hover:bg-[#62B95B]/20 text-[#29202F] font-bold text-xs border border-[#62B95B]/30 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <Droplets className="w-4 h-4 text-[#62B95B]" />
              <span>Registrar Riego</span>
            </button>

            <button
              type="button"
              onClick={onOpenEnvModal}
              className="p-3 rounded-2xl bg-[#F3C843]/15 hover:bg-[#F3C843]/25 text-[#29202F] font-bold text-xs border border-[#F3C843]/40 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <Thermometer className="w-4 h-4 text-[#EB7864]" />
              <span>Medir Ambiente</span>
            </button>

            <button
              type="button"
              onClick={onOpenPhotoModal}
              className="p-3 rounded-2xl bg-[#6C45C7]/10 hover:bg-[#6C45C7]/20 text-[#29202F] font-bold text-xs border border-[#6C45C7]/30 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <Camera className="w-4 h-4 text-[#6C45C7]" />
              <span>Subir Foto</span>
            </button>

            <button
              type="button"
              onClick={onOpenDiaryModal}
              className="p-3 rounded-2xl bg-white hover:bg-[#FAF2E1] text-[#29202F] font-bold text-xs border border-[#EFE3CF] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <BookOpen className="w-4 h-4 text-[#6E5D77]" />
              <span>Nota de Diario</span>
            </button>
          </div>
        )}

        {/* Cosechado Banner */}
        {isCosechado && (
          <div className="p-4 rounded-2xl bg-[#6C45C7]/10 border border-[#6C45C7]/25 text-[#29202F] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#6C45C7]/20 text-[#6C45C7]">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <div className="font-extrabold text-[#29202F] flex items-center gap-2">
                  <span>Cultivo Finalizado y Cosechado 🏁</span>
                  <span className="px-2 py-0.5 rounded-full bg-[#6C45C7]/20 text-[#6C45C7] text-[10px] font-mono font-bold uppercase">
                    {cultivation.status || 'COSECHADO'}
                  </span>
                </div>
                <p className="text-[#6E5D77] text-xs mt-0.5">
                  {cultivation.harvestDate || cultivation.endDate ? `Fecha de cosecha: ${formatFriendlyDate(cultivation.harvestDate || cultivation.endDate || '')}` : 'Cosecha registrada con éxito.'}
                  {(cultivation.estimatedWeight || cultivation.finalWeight) ? ` · Peso estimado: ${cultivation.estimatedWeight || cultivation.finalWeight} g` : ''}
                  {(cultivation.estimatedWeight || cultivation.finalWeight) && cultivation.plantCount ? ` (~${((cultivation.estimatedWeight || cultivation.finalWeight)! / cultivation.plantCount).toFixed(1)} g / planta)` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              id="edit-harvest-banner-btn"
              onClick={() => setIsHarvestModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-[#6C45C7] hover:bg-[#5835ab] text-white font-bold text-xs transition-colors shadow-2xs cursor-pointer shrink-0"
            >
              Modificar Cosecha
            </button>
          </div>
        )}

        {/* Progressive Disclosure: Ver configuración técnica y etapas */}
        <div className="pt-2 border-t border-[#EFE3CF]">
          <button
            type="button"
            onClick={() => setShowAdvancedDetails((prev) => !prev)}
            className="w-full py-2.5 px-4 rounded-2xl bg-[#FFFDF7] hover:bg-[#FAF2E1] border border-[#EFE3CF] text-[#6C45C7] font-bold text-xs transition-colors flex items-center justify-between cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-[#6C45C7]" />
              <span>{showAdvancedDetails ? 'Ocultar detalles avanzados y etapas' : 'Ver detalles avanzados, genética y etapas'}</span>
            </span>
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${
                showAdvancedDetails ? 'rotate-180' : ''
              }`}
            />
          </button>

          {showAdvancedDetails && (
            <div className="mt-4 space-y-4 animate-in fade-in duration-200">
              {/* Stage Progress & Mini Timeline Strip */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getStageIcon(cultivation.currentStage)}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-[#29202F]">
                          Etapa: {cultivation.currentStage}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-[#62B95B]/15 text-[#62B95B] text-[10px] font-extrabold border border-[#62B95B]/30">
                          Día {timelineMetrics.daysInActiveStage} de {timelineMetrics.activeStage.expectedDurationDays}d
                        </span>
                        <span className="text-[11px] text-[#6E5D77] hidden sm:inline">
                          · {timelineMetrics.activeStageProgressPct}% de la etapa
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                    {nextStage && !isCosechado && (
                      <button
                        type="button"
                        id="advance-stage-quick-btn"
                        onClick={() => {
                          setStageForTransition(nextStage);
                          setIsTransitionModalOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#62B95B] hover:bg-[#52a44b] text-white font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                        title={`Avanzar cultivo a ${nextStage.name}`}
                      >
                        <PlayCircle className="w-3.5 h-3.5 text-white" />
                        <span>Avanzar a {nextStage.name}</span>
                        <ChevronRight className="w-3 h-3 text-white" />
                      </button>
                    )}

                    {!isCosechado && (
                      <button
                        type="button"
                        id="harvest-crop-quick-btn"
                        onClick={() => setIsHarvestModalOpen(true)}
                        className="px-2.5 py-1.5 rounded-xl bg-[#F3C843]/20 hover:bg-[#F3C843]/30 text-[#29202F] border border-[#F3C843]/40 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="Finalizar cultivo y marcar como cosechado"
                      >
                        <Award className="w-3.5 h-3.5 text-[#29202F]" />
                        <span>Marcar Cosechado</span>
                      </button>
                    )}

                    <button
                      type="button"
                      id="header-stage-config-btn"
                      onClick={() => setIsStageConfigModalOpen(true)}
                      className="px-2.5 py-1.5 rounded-xl bg-white border border-[#EFE3CF] text-[#29202F] hover:bg-[#FAF2E1] transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                      title="Definir duración y fotoperíodo de las etapas"
                    >
                      <Settings2 className="w-3.5 h-3.5 text-[#6C45C7]" />
                      <span>Definir Etapas</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('timeline')}
                      className="px-2.5 py-1.5 rounded-xl bg-[#6C45C7]/10 border border-[#6C45C7]/30 text-[#6C45C7] hover:bg-[#6C45C7]/20 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <Clock className="w-3.5 h-3.5 text-[#6C45C7]" />
                      <span>Ver Línea de Tiempo</span>
                      <ChevronRight className="w-3 h-3 text-[#6C45C7]" />
                    </button>
                  </div>
                </div>

                {/* Mini stage progression nodes */}
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-1.5 pt-1">
                  {stages.map((st, idx) => {
                    const isActive = st.name === cultivation.currentStage;
                    const isCompleted = st.isCompleted || idx < timelineMetrics.activeStageIndex;
                    const icon = getStageIcon(st.name);

                    return (
                      <button
                        key={st.id || idx}
                        type="button"
                        onClick={() => {
                          setStageForTransition(st);
                          setIsTransitionModalOpen(true);
                        }}
                        className={`px-2 py-1.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#62B95B] text-white border-[#62B95B] shadow-2xs ring-2 ring-[#62B95B]/40'
                            : isCompleted
                            ? 'bg-[#FAF2E1] text-[#29202F] border-[#EFE3CF]'
                            : 'bg-white text-[#9887A2] border-[#EFE3CF] hover:border-[#DECDB3]'
                        }`}
                        title={`${st.name}: ${st.expectedDurationDays} días`}
                      >
                        <div className="flex items-center gap-1 text-[11px] font-bold truncate">
                          <span>{icon}</span>
                          <span className="truncate">{st.name}</span>
                        </div>
                        <div className={`text-[9px] font-medium mt-0.5 ${isActive ? 'text-white/80' : 'text-[#9887A2]'}`}>
                          {st.expectedDurationDays}d
                          {st.photoperiodHoursLight !== undefined && ` · ${st.photoperiodHoursLight}h`}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Flowering Progress Bar if in flower */}
                {isFlowering && (
                  <div className="pt-2 border-t border-[#EFE3CF] space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-[#29202F]">
                      <span>Progreso de Floración Estimada ({cultivation.declaredFloweringWeeks || 8} semanas)</span>
                      <span className="text-[#6C45C7]">{progressPct}% completado</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#FAF2E1] overflow-hidden">
                      <div
                        className="h-full bg-[#6C45C7] rounded-full transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Genetics breakdown if multiple */}
              {cultivation.geneticsList && cultivation.geneticsList.length > 1 && (
                <div className="p-4 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#62B95B]">
                    <Layers className="w-3.5 h-3.5" />
                    <span>{cultivation.geneticsList.length} Variedades en este cultivo:</span>
                    <span className="text-[#6E5D77] font-normal">· {cultivation.plantCount} plantas totales</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cultivation.geneticsList.map((g, idx) => (
                      <div
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#EFE3CF] text-xs text-[#29202F] shadow-2xs"
                      >
                        <strong className="text-[#29202F]">{g.name || 'Sin nombre'}</strong>
                        {g.plantCount && (
                          <span className="text-[#62B95B] font-bold bg-[#62B95B]/15 px-1.5 py-0.5 rounded text-[10px]">
                            {g.plantCount} {g.plantCount === 1 ? 'planta' : 'plantas'}
                          </span>
                        )}
                        {g.seedBank && <span className="text-[#6E5D77] text-[11px]">({g.seedBank})</span>}
                        {g.photoperiodType && (
                          <span className="text-[#9887A2] text-[10px] font-semibold">· {g.photoperiodType}</span>
                        )}
                        {g.declaredFloweringWeeks && (
                          <span className="text-[#9887A2] text-[10px]">· {g.declaredFloweringWeeks} sem. flora</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Internal Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#EFE3CF] pb-2 overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-[#6C45C7] text-white shadow-xs'
              : 'bg-white text-[#6E5D77] hover:bg-[#FAF2E1] border border-[#EFE3CF]'
          }`}
        >
          📊 Gráficos y Métricas
        </button>

        <button
          type="button"
          id="crop-timeline-tab-btn"
          onClick={() => setActiveTab('timeline')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'timeline'
              ? 'bg-[#6C45C7] text-white shadow-xs'
              : 'bg-white text-[#6E5D77] hover:bg-[#FAF2E1] border border-[#EFE3CF]'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-[#62B95B]" />
          <span>⏱️ Línea de Tiempo y Etapas</span>
        </button>

        <button
          type="button"
          id="crop-fertilization-tab-btn"
          onClick={() => setActiveTab('fertilization')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'fertilization'
              ? 'bg-[#6C45C7] text-white shadow-xs'
              : 'bg-white text-[#6E5D77] hover:bg-[#FAF2E1] border border-[#EFE3CF]'
          }`}
        >
          <FlaskConical className="w-3.5 h-3.5 text-[#62B95B]" />
          <span>🌱 Tabla de Fertilización</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('photos')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'photos'
              ? 'bg-[#6C45C7] text-white shadow-xs'
              : 'bg-white text-[#6E5D77] hover:bg-[#FAF2E1] border border-[#EFE3CF]'
          }`}
        >
          📸 Galería ({cropPhotos.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('table')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'table'
              ? 'bg-[#6C45C7] text-white shadow-xs'
              : 'bg-white text-[#6E5D77] hover:bg-[#FAF2E1] border border-[#EFE3CF]'
          }`}
        >
          📋 Tabla de Mediciones
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('diary')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'diary'
              ? 'bg-[#6C45C7] text-white shadow-xs'
              : 'bg-white text-[#6E5D77] hover:bg-[#FAF2E1] border border-[#EFE3CF]'
          }`}
        >
          📝 Diario ({cropDiary.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('calendar')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'calendar'
              ? 'bg-[#6C45C7] text-white shadow-xs'
              : 'bg-white text-[#6E5D77] hover:bg-[#FAF2E1] border border-[#EFE3CF]'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 text-[#62B95B]" />
          <span>Google Calendar</span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW & CHARTS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Alerta de Riego Overdue si supera el período recomendado */}
          {wateringAnalysis.isOverdue && (
            <div
              id="detail-watering-overdue-alert"
              className="p-4 sm:p-5 rounded-[28px] bg-[#EB7864]/10 border-2 border-[#EB7864] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
            >
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-[#EB7864]/20 text-[#EB7864] border border-[#EB7864]/30 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-[#EB7864] text-white font-mono font-bold text-[10px] tracking-wider uppercase">
                      OVERDUE
                    </span>
                    <h4 className="font-bold text-sm text-[#29202F]">
                      Alerta de Riego Atrasado (+{wateringAnalysis.daysOverdue}d)
                    </h4>
                  </div>
                  <p className="text-xs text-[#6E5D77] mt-1">
                    {wateringAnalysis.alertMessage} Ciclo recomendado para {cultivation.currentStage}: cada {wateringAnalysis.recommendedIntervalDays} días.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onOpenWateringModal}
                className="px-5 py-2.5 rounded-2xl bg-[#EB7864] hover:bg-[#d66450] text-white font-bold text-xs transition-all shadow-md shadow-[#EB7864]/20 flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                <Droplets className="w-4 h-4" />
                <span>Regar Ahora</span>
              </button>
            </div>
          )}

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div
              className={`bg-white rounded-3xl p-5 border shadow-2xs relative ${
                wateringAnalysis.isOverdue ? 'border-[#EB7864] ring-2 ring-[#EB7864]/20' : 'border-[#EFE3CF]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9887A2] block">Último Riego</span>
                {wateringAnalysis.isOverdue && (
                  <span className="px-2 py-0.5 rounded-full bg-[#EB7864]/15 text-[#EB7864] font-mono font-bold text-[10px] tracking-wider uppercase">
                    OVERDUE
                  </span>
                )}
              </div>
              <div className="text-lg font-extrabold text-[#29202F] mt-1 flex items-baseline gap-2">
                <span>{lastWatering ? `${lastWatering.volumeLiters} L` : 'Sin registros'}</span>
                {wateringAnalysis.isOverdue && (
                  <span className="text-xs font-mono font-bold text-[#EB7864]">
                    Hace {wateringAnalysis.daysSinceWatering}d
                  </span>
                )}
              </div>
              <span className="text-[11px] text-[#9887A2] font-medium">
                {lastWatering ? `pH ${lastWatering.phIn || '—'} · EC ${lastWatering.ecIn || '—'}` : 'Agregá un riego'}
              </span>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-[#EFE3CF] shadow-2xs relative group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9887A2] block">Último Ambiente</span>
                <button
                  type="button"
                  onClick={() => onEditCultivation(cultivation)}
                  className="text-[10px] font-bold text-[#EB7864] bg-[#EB7864]/10 hover:bg-[#EB7864]/20 px-2 py-0.5 rounded-lg border border-[#EB7864]/30 transition-colors cursor-pointer flex items-center gap-1"
                  title="Configurar umbrales críticos de temperatura y humedad para alertas IA"
                >
                  <ShieldAlert className="w-3 h-3 text-[#EB7864]" />
                  <span>Umbrales IA</span>
                </button>
              </div>
              <div className="text-lg font-extrabold text-[#29202F] mt-1">
                {lastEnv ? `${lastEnv.temperatureC}°C | ${lastEnv.humidityPct}%` : 'Sin registros'}
              </div>
              <div className="flex items-center justify-between gap-1 text-[11px] text-[#9887A2] font-medium mt-0.5">
                <span>{lastEnv?.vpdKPa ? `VPD: ${lastEnv.vpdKPa} kPa` : 'Temp y humedad'}</span>
                <span
                  className="text-[10px] font-mono text-[#62B95B] bg-[#62B95B]/10 px-1.5 py-0.5 rounded border border-[#62B95B]/30"
                  title="Rango térmico y de humedad seguro configurado para alertas automáticas"
                >
                  {cultivation.alertThresholds?.enabled
                    ? `${cultivation.alertThresholds.tempMinC ?? 11}°-${cultivation.alertThresholds.tempMaxC ?? 35}°C | ${cultivation.alertThresholds.humidityMinPct ?? 25}%-${cultivation.alertThresholds.humidityMaxPct ?? 75}%`
                    : '11°-35°C | 25-75%'}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-[#EFE3CF] shadow-2xs">
              <span className="text-xs font-semibold text-[#9887A2] block">Sustrato y Macetas</span>
              <div className="text-sm font-bold text-[#29202F] mt-1 truncate">
                {cultivation.substrate?.potVolumeLiters}L {cultivation.substrate?.potType}
              </div>
              <span className="text-[11px] text-[#9887A2] font-medium truncate block">
                {cultivation.substrate?.type || 'Sustrato orgánico'}
              </span>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-[#EFE3CF] shadow-2xs relative group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9887A2] block">Iluminación</span>
                <button
                  type="button"
                  onClick={() => {
                    setStageForTransition(null);
                    setIsTransitionModalOpen(true);
                  }}
                  className="text-[10px] font-bold text-[#6C45C7] bg-[#6C45C7]/10 hover:bg-[#6C45C7]/20 px-2 py-0.5 rounded-lg border border-[#6C45C7]/30 transition-colors cursor-pointer flex items-center gap-1"
                  title="Ajustar fotoperíodo (12-12, 13-11, etc.) o etapa"
                >
                  <Sun className="w-3 h-3 text-[#F3C843]" />
                  <span>Ajustar</span>
                </button>
              </div>
              <div className="text-sm font-bold text-[#29202F] mt-1 truncate">
                {cultivation.lighting?.usedWatts ? `${cultivation.lighting.usedWatts}W` : ''} {cultivation.lighting?.type || 'No especificada'}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] font-bold text-[#6E5D77]">
                  {cultivation.lighting?.photoperiodHoursLight ?? 18}h luz / {cultivation.lighting?.photoperiodHoursDark ?? (24 - (cultivation.lighting?.photoperiodHoursLight ?? 18))}h osc.
                </span>
                {(cultivation.lighting?.photoperiodHoursLight === 13) && (
                  <span className="text-[9px] font-black bg-[#F3C843]/20 text-[#29202F] px-1.5 py-0.2 rounded-md">
                    13/11
                  </span>
                )}
                {(cultivation.lighting?.photoperiodHoursLight === 12) && (
                  <span className="text-[9px] font-black bg-[#62B95B]/20 text-[#62B95B] px-1.5 py-0.2 rounded-md">
                    12/12
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <EnvironmentChart cultivation={cultivation} envRecords={cropEnv} />
            <WateringChart cultivation={cultivation} waterings={cropWaterings} />
          </div>
        </div>
      )}

      {/* TAB: TIMELINE & GROWTH STAGES */}
      {activeTab === 'timeline' && (
        <CultivationTimelineView
          cultivation={cultivation}
          userId={userId}
          onCultivationUpdated={onCultivationUpdated}
        />
      )}

      {/* TAB 2: FERTILIZATION & NUTRIENT TABLES */}
      {activeTab === 'fertilization' && (
        <FertilizationSectionView
          cultivation={cultivation}
          userId={userId}
          waterings={waterings}
          onOpenWateringModalWithProducts={onOpenWateringModalWithRecipe}
          onWateringUpdated={onWateringUpdated}
        />
      )}

      {/* TAB 3: PHOTOS */}
      {activeTab === 'photos' && (
        <PhotoGalleryView
          cultivation={cultivation}
          photos={cropPhotos}
          onUploadClick={onOpenPhotoModal}
          onAnalyzePhoto={(p) => setPhotoToDiagnose(p)}
          onDeletePhoto={onDeletePhoto}
        />
      )}

      {/* TAB 3: MEASUREMENTS TABLE */}
      {activeTab === 'table' && (
        <MeasurementsTableView
          cultivation={cultivation}
          waterings={cropWaterings}
          envRecords={cropEnv}
        />
      )}

      {/* TAB 4: DIARY */}
      {activeTab === 'diary' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white rounded-3xl p-5 border border-[#EFE3CF] shadow-xs">
            <div>
              <h3 className="font-bold text-base text-[#29202F]">Diario de Seguimiento</h3>
              <p className="text-xs text-[#6E5D77]">Historial cronológico de notas, podas y observaciones</p>
            </div>
            <button
              type="button"
              onClick={onOpenDiaryModal}
              className="px-4 py-2 rounded-2xl bg-[#6C45C7] hover:bg-[#5835ab] text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              + Nueva Nota
            </button>
          </div>

          {cropDiary.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 border border-[#EFE3CF] text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-[#6C45C7] flex items-center justify-center mx-auto">
                <BookOpen className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-[#29202F]">Todavía no anotaste nada acá.</h4>
              <p className="text-xs text-[#6E5D77] max-w-sm mx-auto">
                Registrá podas, trasplantes o cómo viste tus plantas hoy para tener el historial completo.
              </p>
              <button
                type="button"
                onClick={onOpenDiaryModal}
                className="mt-2 px-5 py-2.5 rounded-2xl bg-[#6C45C7] hover:bg-[#5835ab] text-white text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
              >
                <span>Anotar primera nota</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {cropDiary.map((note) => (
                <div
                  key={note.id}
                  className="bg-white rounded-3xl p-5 border border-[#EFE3CF] shadow-2xs space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#29202F]">{note.date}</span>
                    {note.tags && (
                      <div className="flex gap-1">
                        {note.tags.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#62B95B]/10 text-[#62B95B] border border-[#62B95B]/25"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {note.title && <h4 className="font-bold text-sm text-[#29202F]">{note.title}</h4>}
                  <p className="text-xs text-[#6E5D77] whitespace-pre-wrap leading-relaxed">
                    {note.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: GOOGLE CALENDAR */}
      {activeTab === 'calendar' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#EFE3CF] shadow-xs space-y-6 text-[#29202F]">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#6C45C7]/10 border border-[#6C45C7]/20 text-[#6C45C7] flex items-center justify-center">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-[#29202F]">Sincronización con Google Calendar</h3>
                <p className="text-xs text-[#6E5D77] mt-0.5">
                  Conectá y programá recordatorios de riego, etapas y cosecha en tu calendario personal
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCalendarModalOpen(true)}
              className="px-5 py-2.5 rounded-2xl bg-[#6C45C7] hover:bg-[#5835ab] text-white font-bold text-xs transition-all shadow-md shadow-[#6C45C7]/20 flex items-center gap-2 cursor-pointer"
            >
              <Calendar className="w-4 h-4 stroke-[2.5]" />
              <span>Gestionar Eventos en Calendar</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] space-y-1.5">
              <div className="flex items-center gap-2 text-[#62B95B] font-bold text-xs">
                <Droplets className="w-4 h-4" />
                <span>Riegos y Nutrición</span>
              </div>
              <p className="text-[11px] text-[#6E5D77] leading-relaxed">
                Recordatorios de riego calculados cada 2-3 días o basados en la fecha del último riego registrado.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] space-y-1.5">
              <div className="flex items-center gap-2 text-[#6C45C7] font-bold text-xs">
                <Layers className="w-4 h-4" />
                <span>Transición de Etapas</span>
              </div>
              <p className="text-[11px] text-[#6E5D77] leading-relaxed">
                Cambio de fotoperiodo 12/12, inicio de floración y poda de bajos programadas en tu agenda.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] space-y-1.5">
              <div className="flex items-center gap-2 text-[#EB7864] font-bold text-xs">
                <Award className="w-4 h-4" />
                <span>Flush y Cosecha</span>
              </div>
              <p className="text-[11px] text-[#6E5D77] leading-relaxed">
                Alertas anticipadas para el lavado de raíces (10-14 días antes) y la ventana ideal de secado.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Harvest Finalization Modal */}
      {isHarvestModalOpen && (
        <FinalizeHarvestModal
          isOpen={isHarvestModalOpen}
          onClose={() => setIsHarvestModalOpen(false)}
          cultivation={cultivation}
          userId={userId}
          onHarvestFinalized={onHarvestFinalized}
          onCultivationUpdated={onCultivationUpdated}
        />
      )}

      {/* Edit Harvest Modal */}
      {harvestToEdit && (
        <EditHarvestModal
          isOpen={!!harvestToEdit}
          harvest={harvestToEdit}
          userId={userId}
          onClose={() => setHarvestToEdit(null)}
          onHarvestUpdated={(updated) => {
            setHarvestToEdit(null);
            if (onHarvestFinalized) {
              onHarvestFinalized(updated);
            }
          }}
        />
      )}

      {/* AI Photo Diagnosis Modal */}
      {photoToDiagnose && (
        <PhotoDiagnosisModal
          isOpen={!!photoToDiagnose}
          onClose={() => setPhotoToDiagnose(null)}
          userId={userId}
          cultivation={cultivation}
          photo={photoToDiagnose}
        />
      )}

      {/* Google Calendar Sync Modal */}
      {isCalendarModalOpen && (
        <GoogleCalendarModal
          isOpen={isCalendarModalOpen}
          onClose={() => setIsCalendarModalOpen(false)}
          cultivation={cultivation}
          latestWatering={lastWatering}
        />
      )}

      {/* Stage Configuration & Definition Modal */}
      {isStageConfigModalOpen && (
        <StageConfigModal
          isOpen={isStageConfigModalOpen}
          onClose={() => setIsStageConfigModalOpen(false)}
          cultivation={cultivation}
          userId={userId}
          initialStages={stages}
          onStagesUpdated={(updated) => {
            if (onCultivationUpdated) {
              onCultivationUpdated(updated);
            }
          }}
        />
      )}

      {/* Stage Transition / Advance Modal */}
      {isTransitionModalOpen && (
        <StageTransitionModal
          isOpen={isTransitionModalOpen}
          onClose={() => setIsTransitionModalOpen(false)}
          cultivation={cultivation}
          initialSelectedStage={stageForTransition}
          stages={stages}
          userId={userId}
          onStageChanged={(updated) => {
            if (onCultivationUpdated) {
              onCultivationUpdated(updated);
            }
          }}
        />
      )}
    </div>
  );
};
