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
import { FlaskConical, Clock, Settings2, ChevronRight, PlayCircle } from 'lucide-react';
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

  const stages = getStagesForCultivation(cultivation);
  const nextStage = getNextStage(cultivation, stages);
  const timelineMetrics = calculateTimelineMetrics(cultivation, stages);

  const totalDays = cultivationService.calculateDays(cultivation.startDate);
  const floweringDays = cultivationService.calculateFloweringDays(cultivation.floweringStartDate);
  const isFlowering = cultivation.currentStage === 'Floración';
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

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-bold text-stone-600 hover:text-emerald-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a mis cultivos
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            id="open-calendar-sync-btn"
            onClick={() => setIsCalendarModalOpen(true)}
            className="px-4 py-2 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs shadow-xs border border-zinc-700 transition-all flex items-center gap-2 cursor-pointer group"
          >
            <Calendar className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span>Google Calendar</span>
          </button>

          {!cultivation.isFinished ? (
            <button
              type="button"
              id="finalize-crop-btn"
              onClick={() => setIsHarvestModalOpen(true)}
              className="px-4 py-2 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Award className="w-4 h-4" />
              <span>Finalizar Cultivo</span>
            </button>
          ) : (
            <button
              type="button"
              id="edit-harvest-btn"
              onClick={async () => {
                const h = await harvestService.getHarvestByCultivationId(cultivation.id, userId);
                if (h) {
                  setHarvestToEdit(h);
                }
              }}
              className="px-4 py-2 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
              title="Editar cuánto se cosechó y ficha"
            >
              <Scale className="w-4 h-4 text-amber-700" />
              <span>Editar Cosecha</span>
            </button>
          )}

          <button
            type="button"
            id="edit-crop-btn"
            onClick={() => onEditCultivation(cultivation)}
            className="p-2 rounded-2xl bg-white border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50 transition-colors cursor-pointer shadow-2xs"
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
            className="p-2 rounded-2xl bg-white border border-stone-200 text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shadow-2xs"
            title="Eliminar cultivo"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Crop Header Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <StatusPill status={cultivation.status} />
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-stone-100 text-stone-700">
                {cultivation.type}
              </span>
              {cultivation.photoperiodType && (
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {cultivation.photoperiodType}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900">{cultivation.name}</h1>
            {cultivation.geneticsList && cultivation.geneticsList.length > 1 ? (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                  <Layers className="w-3.5 h-3.5" />
                  <span>{cultivation.geneticsList.length} Variedades en este cultivo:</span>
                  <span className="text-stone-500 font-normal">· {cultivation.plantCount} plantas totales</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {cultivation.geneticsList.map((g, idx) => (
                    <div
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-800 shadow-2xs"
                    >
                      <strong className="text-stone-900">{g.name || 'Sin nombre'}</strong>
                      {g.plantCount && (
                        <span className="text-emerald-800 font-bold bg-emerald-100/70 px-1.5 py-0.5 rounded text-[10px]">
                          {g.plantCount} {g.plantCount === 1 ? 'planta' : 'plantas'}
                        </span>
                      )}
                      {g.seedBank && <span className="text-stone-500 text-[11px]">({g.seedBank})</span>}
                      {g.photoperiodType && (
                        <span className="text-stone-400 text-[10px] font-semibold">· {g.photoperiodType}</span>
                      )}
                      {g.declaredFloweringWeeks && (
                        <span className="text-stone-400 text-[10px]">· {g.declaredFloweringWeeks} sem. flora</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-stone-600 font-medium flex items-center gap-2">
                <span>
                  Genética: <strong className="text-stone-900">{cultivation.geneticsName || 'No especificada'}</strong>
                </span>
                {cultivation.seedBank && (
                  <span className="text-emerald-700 font-semibold">({cultivation.seedBank})</span>
                )}
                <span>·</span>
                <span>{cultivation.plantCount} planta{cultivation.plantCount === 1 ? '' : 's'}</span>
              </p>
            )}
          </div>

          {/* Days / Stage Metric Card */}
          <div className="flex items-center gap-4 bg-stone-50 p-4 sm:p-5 rounded-3xl border border-stone-200/80 w-full md:w-auto justify-around md:justify-start">
            <div className="text-center">
              <span className="text-[11px] font-semibold text-stone-500 block">Edad Total</span>
              <div className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
                {totalDays} <span className="text-xs font-bold text-stone-500">días</span>
              </div>
            </div>

            <div className="h-10 w-px bg-stone-200" />

            <div className="text-center">
              <span className="text-[11px] font-semibold text-stone-500 block">Etapa Actual</span>
              <div className="text-lg sm:text-xl font-bold text-emerald-950">
                {cultivation.currentStage}
              </div>
              {isFlowering && floweringDays && (
                <span className="text-[11px] text-amber-700 font-bold block">
                  Día {floweringDays} de flora
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stage Progress & Mini Timeline Strip */}
        <div className="p-4 sm:p-5 rounded-2xl bg-stone-50/90 border border-stone-200/80 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">{getStageIcon(cultivation.currentStage)}</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-stone-900">
                    Etapa: {cultivation.currentStage}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                    Día {timelineMetrics.daysInActiveStage} de {timelineMetrics.activeStage.expectedDurationDays}d
                  </span>
                  <span className="text-[11px] text-stone-500 hidden sm:inline">
                    · {timelineMetrics.activeStageProgressPct}% de la etapa
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              {nextStage && !cultivation.isFinished && (
                <button
                  type="button"
                  id="advance-stage-quick-btn"
                  onClick={() => {
                    setStageForTransition(nextStage);
                    setIsTransitionModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                  title={`Avanzar cultivo a ${nextStage.name}`}
                >
                  <PlayCircle className="w-3.5 h-3.5 text-emerald-200" />
                  <span>Avanzar a {nextStage.name}</span>
                  <ChevronRight className="w-3 h-3 text-emerald-200" />
                </button>
              )}

              <button
                type="button"
                id="header-stage-config-btn"
                onClick={() => setIsStageConfigModalOpen(true)}
                className="px-2.5 py-1.5 rounded-xl bg-white border border-stone-200 text-stone-700 hover:text-emerald-700 hover:border-emerald-300 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                title="Definir duración y fotoperíodo de las etapas"
              >
                <Settings2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Definir Etapas</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('timeline')}
                className="px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 hover:bg-emerald-100 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
              >
                <Clock className="w-3.5 h-3.5 text-emerald-700" />
                <span>Ver Línea de Tiempo</span>
                <ChevronRight className="w-3 h-3 text-emerald-600" />
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
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs ring-1 ring-emerald-400'
                      : isCompleted
                      ? 'bg-stone-200/80 text-stone-800 border-stone-300'
                      : 'bg-white text-stone-400 border-stone-200 hover:border-stone-300'
                  }`}
                  title={`${st.name}: ${st.expectedDurationDays} días`}
                >
                  <div className="flex items-center gap-1 text-[11px] font-bold truncate">
                    <span>{icon}</span>
                    <span className="truncate">{st.name}</span>
                  </div>
                  <div className={`text-[9px] font-medium mt-0.5 ${isActive ? 'text-emerald-100' : 'text-stone-400'}`}>
                    {st.expectedDurationDays}d
                    {st.photoperiodHoursLight !== undefined && ` · ${st.photoperiodHoursLight}h`}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Flowering Progress Bar if in flower */}
          {isFlowering && (
            <div className="pt-2 border-t border-stone-200/60 space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-amber-950">
                <span>Progreso de Floración Estimada ({cultivation.declaredFloweringWeeks || 8} semanas)</span>
                <span>{progressPct}% completado</span>
              </div>
              <div className="w-full h-2 rounded-full bg-amber-200/60 overflow-hidden">
                <div
                  className="h-full bg-amber-600 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Quick Logging Action Buttons */}
        {!cultivation.isFinished && (
          <div className="pt-2 border-t border-stone-100 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              type="button"
              onClick={onOpenWateringModal}
              className="p-3 rounded-2xl bg-cyan-50 hover:bg-cyan-100 text-cyan-900 font-bold text-xs border border-cyan-200 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <Droplets className="w-4 h-4 text-cyan-600" />
              <span>Registrar Riego</span>
            </button>

            <button
              type="button"
              onClick={onOpenEnvModal}
              className="p-3 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs border border-amber-200 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <Thermometer className="w-4 h-4 text-amber-600" />
              <span>Medir Ambiente</span>
            </button>

            <button
              type="button"
              onClick={onOpenPhotoModal}
              className="p-3 rounded-2xl bg-blue-50 hover:bg-blue-100 text-blue-900 font-bold text-xs border border-blue-200 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <Camera className="w-4 h-4 text-blue-600" />
              <span>Subir Foto</span>
            </button>

            <button
              type="button"
              onClick={onOpenDiaryModal}
              className="p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-xs border border-emerald-200 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <BookOpen className="w-4 h-4 text-emerald-600" />
              <span>Nota de Diario</span>
            </button>
          </div>
        )}
      </div>

      {/* Internal Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-2 overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
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
              ? 'bg-stone-900 text-white shadow-xs'
              : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-emerald-600" />
          <span>⏱️ Línea de Tiempo y Etapas</span>
        </button>

        <button
          type="button"
          id="crop-fertilization-tab-btn"
          onClick={() => setActiveTab('fertilization')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'fertilization'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
          }`}
        >
          <FlaskConical className="w-3.5 h-3.5 text-emerald-600" />
          <span>🌱 Tabla de Fertilización</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('photos')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'photos'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
          }`}
        >
          📸 Galería ({cropPhotos.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('table')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'table'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
          }`}
        >
          📋 Tabla de Mediciones
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('diary')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'diary'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
          }`}
        >
          📝 Diario ({cropDiary.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('calendar')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'calendar'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 text-emerald-600" />
          <span>Google Calendar</span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW & CHARTS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs">
              <span className="text-xs font-semibold text-stone-500 block">Último Riego</span>
              <div className="text-lg font-extrabold text-stone-900 mt-1">
                {lastWatering ? `${lastWatering.volumeLiters} L` : 'Sin registros'}
              </div>
              <span className="text-[11px] text-stone-400 font-medium">
                {lastWatering ? `pH ${lastWatering.phIn || '—'} · EC ${lastWatering.ecIn || '—'}` : 'Agrega un riego'}
              </span>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs">
              <span className="text-xs font-semibold text-stone-500 block">Último Ambiente</span>
              <div className="text-lg font-extrabold text-stone-900 mt-1">
                {lastEnv ? `${lastEnv.temperatureC}°C | ${lastEnv.humidityPct}%` : 'Sin registros'}
              </div>
              <span className="text-[11px] text-stone-400 font-medium">
                {lastEnv?.vpdKPa ? `VPD: ${lastEnv.vpdKPa} kPa` : 'Registra temp y humedad'}
              </span>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs">
              <span className="text-xs font-semibold text-stone-500 block">Sustrato y Macetas</span>
              <div className="text-sm font-bold text-stone-900 mt-1 truncate">
                {cultivation.substrate?.potVolumeLiters}L {cultivation.substrate?.potType}
              </div>
              <span className="text-[11px] text-stone-400 font-medium truncate block">
                {cultivation.substrate?.type || 'Sustrato orgánico'}
              </span>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs relative group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-500 block">Iluminación</span>
                <button
                  type="button"
                  onClick={() => {
                    setStageForTransition(null);
                    setIsTransitionModalOpen(true);
                  }}
                  className="text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-200 transition-colors cursor-pointer flex items-center gap-1"
                  title="Ajustar fotoperíodo (12-12, 13-11, etc.) o etapa"
                >
                  <Sun className="w-3 h-3 text-amber-500" />
                  <span>Ajustar</span>
                </button>
              </div>
              <div className="text-sm font-bold text-stone-900 mt-1 truncate">
                {cultivation.lighting?.usedWatts ? `${cultivation.lighting.usedWatts}W` : ''} {cultivation.lighting?.type || 'No especificada'}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] font-bold text-amber-800">
                  {cultivation.lighting?.photoperiodHoursLight ?? 18}h luz / {cultivation.lighting?.photoperiodHoursDark ?? (24 - (cultivation.lighting?.photoperiodHoursLight ?? 18))}h osc.
                </span>
                {(cultivation.lighting?.photoperiodHoursLight === 13) && (
                  <span className="text-[9px] font-black bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded-md">
                    13/11
                  </span>
                )}
                {(cultivation.lighting?.photoperiodHoursLight === 12) && (
                  <span className="text-[9px] font-black bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-md">
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
          <div className="flex items-center justify-between bg-white rounded-3xl p-5 border border-stone-200 shadow-sm">
            <div>
              <h3 className="font-bold text-base text-stone-900">Diario de Seguimiento</h3>
              <p className="text-xs text-stone-500">Historial cronológico de notas, podas y observaciones</p>
            </div>
            <button
              type="button"
              onClick={onOpenDiaryModal}
              className="px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
            >
              Nueva Nota
            </button>
          </div>

          {cropDiary.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 border border-stone-200 text-center space-y-2">
              <BookOpen className="w-8 h-8 text-stone-400 mx-auto" />
              <p className="text-sm font-bold text-stone-700">Aún no hay notas en este cultivo.</p>
              <p className="text-xs text-stone-400">Registra podas, trasplantes y observaciones de rutina.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cropDiary.map((note) => (
                <div
                  key={note.id}
                  className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-stone-900">{note.date}</span>
                    {note.tags && (
                      <div className="flex gap-1">
                        {note.tags.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {note.title && <h4 className="font-bold text-sm text-stone-800">{note.title}</h4>}
                  <p className="text-xs text-stone-700 whitespace-pre-wrap leading-relaxed">
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
        <div className="bg-[#0F0F0F] rounded-3xl p-6 sm:p-8 border border-zinc-800 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-white">Sincronización con Google Calendar</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Conecta y programa recordatorios de riego, etapas y cosecha en tu calendario personal
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCalendarModalOpen(true)}
              className="px-5 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              <Calendar className="w-4 h-4 stroke-[2.5]" />
              <span>Gestionar Eventos en Calendar</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-1.5">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs">
                <Droplets className="w-4 h-4" />
                <span>Riegos y Nutrición</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Recordatorios de riego calculados cada 2-3 días o basados en la fecha del último riego registrado.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                <Layers className="w-4 h-4" />
                <span>Transición de Etapas</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Cambio de fotoperiodo 12/12, inicio de floración y poda de bajos programadas en tu agenda.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-1.5">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                <Award className="w-4 h-4" />
                <span>Flush y Cosecha</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
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
