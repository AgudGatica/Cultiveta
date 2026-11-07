import React, { useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
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
  Plug,
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
  Genetics,
  GeneticsCatalogPhoto,
} from '../../types';
import { StatusPill } from '../common/StatusPill';
import { cultivationService } from '../../services/cultivationService';
import { indoorService, useIndoors } from '../../services/indoorService';
import { harvestService } from '../../services/harvestService';
import { EditHarvestModal } from '../harvests/EditHarvestModal';
import { EnvironmentChart } from '../charts/EnvironmentChart';
import { CropLifecycleCard } from './CropLifecycleCard';
import { IrrigationForecastCard } from './IrrigationForecastCard';
import { FeedTargetCard, LivingSoilCard } from './FeedTargetCard';
import { HydroTankCard } from './HydroTankCard';
import { tankStatus } from '../../utils/hydroTank';
import { feedTargetFor, livingSoilGuide } from '../../utils/feedTargets';
import { CropGeneticsSection } from './CropGeneticsSection';
import { PlantTimeline } from './PlantTimeline';
import { describePhotoperiod } from '../../utils/photoperiods';
import { WateringChart } from '../charts/WateringChart';
import { MeasurementsTableView } from '../logs/MeasurementsTableView';
import { PhotoGalleryView } from '../gallery/PhotoGalleryView';
import { FinalizeHarvestModal } from './FinalizeHarvestModal';
import { PhotoDiagnosisModal } from '../ai/PhotoDiagnosisModal';
import { GoogleCalendarModal } from '../calendar/GoogleCalendarModal';
import { FertilizationSectionView } from './FertilizationSectionView';
import { FloweringProgressSection } from '../dashboard/FloweringProgressSection';
import { HarvestProjectionSection } from '../dashboard/HarvestProjectionSection';
import { Clock, Settings2, ChevronRight, ChevronDown, PlayCircle, Home } from 'lucide-react';
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
import { calculateIrrigationForecast } from '../../services/irrigationForecastService';
import { evaluateEnvironmentReading } from '../../utils/agronomicThresholds';
import { resolveCultivationDisplayPhoto } from '../../utils/cultivationPhotoResolver';
import { isExteriorAmbient } from '../../utils/indoors';
import { useGeneticsCatalogPhotos } from '../../hooks/useGeneticsCatalogPhotos';
import { GeneticsHeaderPhoto } from './GeneticsHeaderPhoto';
import { LightCycleCard, type LightSchedule } from './LightCycleCard';
import { CropDevicesCard } from './CropDevicesCard';
import { useDevicesOverview, lightBindingFor, sensorBindingFor, pumpBindingFor } from '../../services/devicesService';
import { environmentService } from '../../services/environmentService';
import { dec } from '../../utils/formatNumber';
import { TransferCropModal } from '../indoors/TransferCropModal';

interface CultivationDetailViewProps {
  cultivation: Cultivation;
  userId: string;
  waterings: Watering[];
  envRecords: EnvironmentRecord[];
  photos: PhotoRecord[];
  diaryEntries: DiaryEntry[];
  geneticsList?: Genetics[];
  catalogPhotos?: Record<string, GeneticsCatalogPhoto>;
  onBack: () => void;
  /** Texto del botón de volver (Inicio para activos, Cultivos para terminados). */
  backLabel?: string;
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
  /** Abre Equipos para conectar un enchufe (luz), un sensor (ambiente) o una bomba o sonda (riego). */
  onOpenDevices?: (focus: 'luz' | 'ambiente' | 'riego') => void;
  /** Se regó con la bomba (queda anotado como un riego más). */
  onWateringAdded?: (watering: Watering) => void;
  /** Se guardó la hora de encendido de la luz. */
  onLightSaved?: (updatedCultivation: Cultivation) => void;
  /** Abre el indoor donde está el cultivo. */
  onOpenIndoor?: (indoorId: string) => void;
}

export const CultivationDetailView: React.FC<CultivationDetailViewProps> = ({
  cultivation,
  userId,
  waterings,
  envRecords,
  photos,
  diaryEntries,
  geneticsList = [],
  catalogPhotos: catalogPhotosProp,
  onBack,
  backLabel = 'Volver al Jardín',
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
  onOpenDevices,
  onLightSaved,
  onWateringAdded,
  onOpenIndoor,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'fertilization' | 'photos' | 'table' | 'diary' | 'calendar'>('overview');
  // Ambiente donde está: si es interior, su luz es la del cultivo; la luz, el clima y el sensor se asignan al ambiente
  const ambients = useIndoors();
  const indoor = ambients.find((i) => i.id === cultivation.indoorId) || null;
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  // Equipos asignados a este cultivo (enchufe de la luz, sensor de ambiente y sonda de sustrato)
  const devicesOverview = useDevicesOverview();
  const lightDevice = lightBindingFor(devicesOverview, cultivation.id) || (indoor ? lightBindingFor(devicesOverview, indoor.id) : null);
  // En exterior no hay sensor de ambiente: el clima de la zona se mide solo cada hora
  const outdoor = indoor ? isExteriorAmbient(indoor) : cultivation.type !== 'Indoor';
  const envSensor = outdoor ? null : sensorBindingFor(devicesOverview, cultivation.id, 'sensor_th') || (indoor ? sensorBindingFor(devicesOverview, indoor.id, 'sensor_th') : null);
  const soilSensor = sensorBindingFor(devicesOverview, cultivation.id, 'sensor_soil');
  const sensorAgo = (ms: number | null) => {
    if (!ms) return '';
    const min = Math.max(0, Math.round((Date.now() - ms) / 60000));
    return min < 1 ? 'recién' : min < 60 ? `hace ${min} min` : `hace ${Math.round(min / 60)} h`;
  };
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
  const feedTarget = React.useMemo(() => feedTargetFor(cultivation, cropWaterings), [cultivation, cropWaterings]);
  const livingGuide = React.useMemo(() => livingSoilGuide(cultivation), [cultivation]);
  const tank = React.useMemo(() => tankStatus(cultivation, cropWaterings), [cultivation, cropWaterings]);

  const wateringAnalysis = React.useMemo(() => {
    return analyzeWateringUrgency(
      cultivation,
      lastWatering || null,
      new Date(),
      calculateIrrigationForecast(cultivation, waterings, envRecords)
    );
  }, [cultivation, lastWatering, waterings, envRecords]);

  const envCheck = lastEnv ? evaluateEnvironmentReading(lastEnv, cultivation.currentStage) : null;
  const isHealthy =
    !wateringAnalysis.isOverdue &&
    (!envCheck || !(envCheck.tempHigh || envCheck.tempLow || envCheck.humidityHigh || envCheck.humidityLow));
  const subscribedPhotos = useGeneticsCatalogPhotos();
  const effectiveCatalogPhotos = catalogPhotosProp || subscribedPhotos;
  const photoResolution = React.useMemo(() => {
    return resolveCultivationDisplayPhoto(cultivation, effectiveCatalogPhotos);
  }, [cultivation, effectiveCatalogPhotos]);

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Volver. Lo que se usa poco (calendario, terminar, editar, borrar) está al final de la pantalla */}
      <button type="button" id="crop-back-btn" onClick={onBack} className="cultiveta-back-pill">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        {backLabel}
      </button>

      {/* Main Crop Header Card with Progressive Disclosure */}
      <div className="bg-white rounded-[32px] p-6 sm:p-8 border border-line shadow-xs space-y-6">
        {/* Primera lectura: Qué cultivo, día/etapa y estado en 3 segundos */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-line">
          {/* Panel visual de identidad: Fotografía de portada / Foto de referencia del catálogo */}
          <GeneticsHeaderPhoto
            resolution={photoResolution}
            cultivationName={cultivation.name}
          />
          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <StatusPill status={isCosechado ? 'COSECHADO' : isHealthy ? 'ESTABLE' : 'REVISAR'} />
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-track text-ink border border-line">
                {cultivation.type}
              </span>
              {cultivation.photoperiodType && (
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-ok/10 text-ok-ink border border-ok/30">
                  {cultivation.photoperiodType}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">{cultivation.name}</h1>
            {indoor && (
              <button
                type="button"
                id="crop-indoor-chip"
                onClick={() => onOpenIndoor?.(indoor.id)}
                className="min-h-11 inline-flex items-center gap-1.5 px-3 rounded-full bg-brand/10 border border-brand/20 text-brand text-xs font-bold hover:bg-brand/15"
              >
                <Home className="w-3.5 h-3.5" aria-hidden="true" />
                En {indoor.name}
              </button>
            )}
            <p className="text-xs sm:text-sm text-ink-muted font-medium flex items-center gap-2">
              <span>
                Genética: <strong className="text-ink">{cultivation.geneticsName || (cultivation.geneticsList && cultivation.geneticsList[0]?.name) || 'No especificada'}</strong>
              </span>
              {cultivation.seedBank && (
                <span className="text-ok-ink font-semibold">({cultivation.seedBank})</span>
              )}
              <span>·</span>
              <span>{cultivation.plantCount} planta{cultivation.plantCount === 1 ? '' : 's'}</span>
            </p>
          </div>

          {/* Quick Health & Stage Status Badge */}
          <div className="flex items-center gap-4 bg-surface p-4 sm:p-5 rounded-2xl border border-line w-full md:w-auto justify-around md:justify-start shadow-xs">
            <div className="text-center sm:text-left">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle block">Estado</span>
              <div className={`text-lg sm:text-xl font-extrabold ${isHealthy ? 'text-ok-ink' : 'text-error'}`}>
                {isHealthy ?'Está joya ' : 'Hay algo para mirar '}
              </div>
            </div>

            <div className="h-10 w-px bg-line" />

            <div className="text-center sm:text-left">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle block">Tiempo</span>
              <div className="text-lg sm:text-xl font-black text-ink">
                Día {totalDays} · <span className="text-brand">{cultivation.currentStage}</span>
              </div>
              {isFlowering && floweringDays && (
                <span className="text-xs text-error font-bold block">
                  Día {floweringDays} de floración
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Lo que más se hace, primero */}
        {!cultivation.isFinished && (
          <div id="crop-quick-actions" className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button type="button" onClick={onOpenWateringModal} className="cultiveta-btn-primary text-sm">
              <Droplets className="w-4 h-4" aria-hidden="true" />
              {tank ? 'Control del tanque' : 'Anotar riego'}
            </button>
            <button type="button" onClick={onOpenEnvModal} className="cultiveta-btn-secondary text-sm">
              <Thermometer className="w-4 h-4 text-brand" aria-hidden="true" />
              Medir ambiente
            </button>
            <button type="button" onClick={onOpenPhotoModal} className="cultiveta-btn-secondary text-sm">
              <Camera className="w-4 h-4 text-brand" aria-hidden="true" />
              Subir foto
            </button>
            <button type="button" onClick={onOpenDiaryModal} className="cultiveta-btn-secondary text-sm">
              <BookOpen className="w-4 h-4 text-brand" aria-hidden="true" />
              Nota de diario
            </button>
          </div>
        )}

        {/* Hoy */}
        <div id="crop-today">
          {/* HOY */}
          <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-line flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle">Hoy</span>
                <Clock className="w-4 h-4 text-brand" />
              </div>
              <div className="space-y-1">
                {tank ? (
                  <>
                    <span id="detail-today-tank" className={`text-sm font-extrabold block ${tank.alert.kind === 'ok' ? 'text-ok-ink' : 'text-warn-ink'}`}>
                      {tank.alert.kind === 'ok' ? 'Tanque en rango' : tank.alert.kind === 'check' ? 'Revisá el tanque' : tank.alert.kind === 'change' ? 'Cambiá la solución' : 'Corregí el tanque'}
                    </span>
                    <span className="text-xs text-ink-muted block">{tank.alert.text}</span>
                  </>
                ) : wateringAnalysis.isOverdue ? (
                  <>
                    <span className="text-sm font-extrabold text-error block">
                      Revisá el riego (+{wateringAnalysis.daysOverdue} d)
                    </span>
                    <span className="text-xs text-ink-muted block">
                      Pasó la ventana estimada: revisá la maceta y regá si hace falta.
                    </span>
                  </>
                ) : wateringAnalysis.isDueToday ? (
                  <>
                    <span className="text-sm font-extrabold text-warn-ink block">
                      Revisá el riego hoy
                    </span>
                    <span className="text-xs text-ink-muted block">
                      {wateringAnalysis.daysSinceWatering !== null
                        ? `Último riego hace ${wateringAnalysis.daysSinceWatering} días.`
                        : 'Todavía no hay riegos anotados.'}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-extrabold text-ok-ink block">
                      Sin alertas pendientes
                    </span>
                    <span className="text-xs text-ink-muted block">
                      Todo tranqui por acá.
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-line">
              <span className="text-xs text-ink-subtle font-semibold">
                {tank ? 'pH y EC del tanque todos los días' : `Referencia de la etapa: cada ${wateringAnalysis.recommendedIntervalDays} d`}
              </span>
            </div>
          </div>

        </div>

        {/* Cosechado Banner */}
        {isCosechado && (
          <div className="p-4 rounded-2xl bg-brand/10 border border-brand/25 text-ink flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-brand/20 text-brand">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <div className="font-extrabold text-ink flex items-center gap-2">
                  <span>Cultivo cosechado</span>
                  <span className="px-2 py-0.5 rounded-full bg-brand/20 text-brand text-[11px] font-bold uppercase">
                    {cultivation.status || 'COSECHADO'}
                  </span>
                </div>
                <p className="text-ink-muted text-xs mt-0.5">
                  {cultivation.harvestDate || cultivation.endDate ? `Fecha de cosecha: ${formatFriendlyDate(cultivation.harvestDate || cultivation.endDate || '')}` : 'Cosecha registrada con éxito.'}
                  {(cultivation.estimatedWeight || cultivation.finalWeight) ? ` · Peso estimado: ${cultivation.estimatedWeight || cultivation.finalWeight} g` : ''}
                  {(cultivation.estimatedWeight || cultivation.finalWeight) && cultivation.plantCount ? ` (~${dec((cultivation.estimatedWeight || cultivation.finalWeight)! / cultivation.plantCount, 1)} g / planta)` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              id="edit-harvest-banner-btn"
              onClick={() => setIsHarvestModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-brand hover:bg-brand-deep text-white font-bold text-xs transition-colors shadow-2xs cursor-pointer shrink-0"
            >
              Modificar cosecha
            </button>
          </div>
        )}

        {/* Progressive Disclosure: Ver configuración técnica y etapas */}
        <div className="pt-2 border-t border-line">
          <button
            type="button"
            onClick={() => setShowAdvancedDetails((prev) => !prev)}
            className="w-full py-2.5 px-4 rounded-2xl bg-surface hover:bg-track border border-line text-brand font-bold text-xs transition-colors flex items-center justify-between cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-brand" />
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
              <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-line space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getStageIcon(cultivation.currentStage)}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-ink">
                          Etapa: {cultivation.currentStage}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-ok/15 text-ok-ink text-[11px] font-extrabold border border-ok/30">
                          Día {timelineMetrics.daysInActiveStage} de {timelineMetrics.activeStage.expectedDurationDays}d
                        </span>
                        <span className="text-xs text-ink-muted hidden sm:inline">
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
                        className="px-3 py-1.5 rounded-xl bg-primary hover:brightness-95 text-ink font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
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
                        className="px-2.5 py-1.5 rounded-xl bg-warn-line/20 hover:bg-warn-line/30 text-ink border border-warn-line/40 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="Finalizar cultivo y marcar como cosechado"
                      >
                        <Award className="w-3.5 h-3.5 text-ink" />
                        <span>Marcar como cosechado</span>
                      </button>
                    )}

                    <button
                      type="button"
                      id="header-stage-config-btn"
                      onClick={() => setIsStageConfigModalOpen(true)}
                      className="px-2.5 py-1.5 rounded-xl bg-white border border-line text-ink hover:bg-track transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                      title="Definir duración y fotoperíodo de las etapas"
                    >
                      <Settings2 className="w-3.5 h-3.5 text-brand" />
                      <span>Definir etapas</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('timeline')}
                      className="px-2.5 py-1.5 rounded-xl bg-brand/10 border border-brand/30 text-brand hover:bg-brand/20 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <Clock className="w-3.5 h-3.5 text-brand" />
                      <span>Ver línea de tiempo</span>
                      <ChevronRight className="w-3 h-3 text-brand" />
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
                            ? 'bg-ok-ink text-white border-ok shadow-2xs ring-2 ring-ok/40'
                            : isCompleted
                            ? 'bg-track text-ink border-line'
                            : 'bg-white text-ink-subtle border-line hover:border-line'
                        }`}
                        title={`${st.name}: ${st.expectedDurationDays} días`}
                      >
                        <div className="flex items-center gap-1 text-xs font-bold truncate">
                          <span>{icon}</span>
                          <span className="truncate">{st.name}</span>
                        </div>
                        <div className={`text-[11px] font-medium mt-0.5 ${isActive ? 'text-white/80' : 'text-ink-subtle'}`}>
                          {st.expectedDurationDays}d
                          {st.photoperiodHoursLight !== undefined && ` · ${st.photoperiodHoursLight}h`}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Flowering Progress Bar if in flower */}
                {isFlowering && (
                  <div className="pt-2 border-t border-line space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-ink">
                      <span>Progreso de Floración Estimada ({cultivation.declaredFloweringWeeks || 8} semanas)</span>
                      <span className="text-brand">{progressPct}% completado</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-track overflow-hidden">
                      <div
                        className="h-full bg-brand rounded-full transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Genetics breakdown if multiple */}
              {cultivation.geneticsList && cultivation.geneticsList.length > 1 && (
                <div className="p-4 rounded-2xl bg-surface border border-line space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-ok-ink">
                    <Layers className="w-3.5 h-3.5" />
                    <span>{cultivation.geneticsList.length} genéticas en este cultivo:</span>
                    <span className="text-ink-muted font-normal">· {cultivation.plantCount} plantas totales</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cultivation.geneticsList.map((g, idx) => (
                      <div
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-line text-xs text-ink shadow-2xs"
                      >
                        <strong className="text-ink">{g.name || 'Sin nombre'}</strong>
                        {g.plantCount && (
                          <span className="text-ok-ink font-bold bg-ok/15 px-1.5 py-0.5 rounded text-[11px]">
                            {g.plantCount} {g.plantCount === 1 ? 'planta' : 'plantas'}
                          </span>
                        )}
                        {g.seedBank && <span className="text-ink-muted text-xs">({g.seedBank})</span>}
                        {g.photoperiodType && (
                          <span className="text-ink-subtle text-[11px] font-semibold">· {g.photoperiodType}</span>
                        )}
                        {g.declaredFloweringWeeks && (
                          <span className="text-ink-subtle text-[11px]">· {g.declaredFloweringWeeks} sem. flora</span>
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

      {/* Secciones del cultivo: una sola línea, se desliza de costado */}
      <div id="crop-tabs" className="flex items-center gap-2 pb-2 overflow-x-auto scrollbar-none">
        {(
          [
            ['overview', undefined, 'Gráficos'],
            ['timeline', 'crop-timeline-tab-btn', 'Línea de tiempo'],
            ['fertilization', 'crop-fertilization-tab-btn', 'Fertilización'],
            ['photos', undefined, `Galería (${cropPhotos.length})`],
            ['table', undefined, 'Mediciones'],
            ['diary', undefined, `Diario (${cropDiary.length})`],
            ['calendar', undefined, 'Calendario'],
          ] as const
        ).map(([key, id, label]) => (
          <button
            key={key}
            type="button"
            id={id}
            aria-pressed={activeTab === key}
            onClick={() => setActiveTab(key)}
            className={`shrink-0 whitespace-nowrap min-h-11 px-4 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === key ? 'bg-brand-deep text-white shadow-xs' : 'bg-white text-ink hover:bg-track border border-line'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW & CHARTS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Genéticas del cultivo: con una sola y en un ambiente, su ficha ya está en la pantalla de la genética */}
          {(!indoor || (cultivation.geneticsList?.length ?? 0) > 1) && <CropGeneticsSection cultivation={cultivation} geneticsList={geneticsList} />}

          {/* Alerta de Riego Overdue si supera el período recomendado */}
          {wateringAnalysis.isOverdue && (
            <div
              id="detail-watering-overdue-alert"
              className="p-4 sm:p-5 rounded-[28px] bg-coral/10 border-2 border-coral flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
            >
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-coral/20 text-error border border-coral/30 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-error text-white font-bold text-[11px] tracking-wider uppercase">
                      ATRASADO
                    </span>
                    <h4 className="font-bold text-sm text-ink">
                      Alerta de Riego Atrasado (+{wateringAnalysis.daysOverdue}d)
                    </h4>
                  </div>
                  <p className="text-xs text-ink-muted mt-1">
                    {wateringAnalysis.alertMessage} Ciclo recomendado para {cultivation.currentStage}: cada {wateringAnalysis.recommendedIntervalDays} días.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onOpenWateringModal}
                className="px-5 py-2.5 rounded-2xl bg-error hover:brightness-95 text-white font-bold text-xs transition-all shadow-md shadow-coral/20 flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                <Droplets className="w-4 h-4" />
                <span>Regar ahora</span>
              </button>
            </div>
          )}

          {/* En un ambiente, la luz y el clima están en el ambiente, y la ventana de riego y pH y EC en la genética.
              Sin ambiente, este cultivo no tiene esas pantallas: se ven acá. */}
          {!isCosechado && !indoor && !tank && <IrrigationForecastCard cultivation={cultivation} waterings={waterings} envRecords={envRecords} />}
          {!isCosechado &&
            !indoor &&
            (tank ? <HydroTankCard status={tank} onCheck={onOpenWateringModal} /> : livingGuide ? <LivingSoilCard guide={livingGuide} /> : feedTarget && <FeedTargetCard target={feedTarget} />)}
          {!isCosechado && !indoor && cultivation.type === 'Indoor' && (
            <LightCycleCard
              cultivation={cultivation}
              onSaveSchedule={async (schedule: LightSchedule) => {
                const lighting = { ...(cultivation.lighting ?? { type: '' }), ...schedule };
                await indoorService.saveCropUpdates(cultivation, { lighting }, userId);
                onLightSaved?.({ ...cultivation, lighting });
              }}
              onConnectPlug={onOpenDevices ? () => onOpenDevices('luz') : undefined}
              device={lightDevice}
            />
          )}
          {!isCosechado && indoor && (
            <button
              type="button"
              id="crop-see-ambient"
              onClick={() => onOpenIndoor?.(indoor.id)}
              className="w-full min-h-11 px-5 py-3 rounded-[28px] bg-white border border-line shadow-2xs text-sm font-bold text-ink flex items-center justify-between gap-3 cursor-pointer hover:bg-surface"
            >
              <span className="min-w-0 truncate">Luz y clima: en {indoor.name}</span>
              <ChevronRight className="w-4 h-4 text-ink-muted shrink-0" aria-hidden="true" />
            </button>
          )}

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div
              className={`bg-white rounded-3xl p-5 border shadow-2xs relative ${
                wateringAnalysis.isOverdue ? 'border-coral ring-2 ring-coral/20' : 'border-line'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-xs font-semibold text-ink-subtle block">{tank ? 'Último control' : 'Último riego'}</span>
                {wateringAnalysis.isOverdue && (
                  <span className="px-2 py-0.5 rounded-full bg-coral/15 text-error font-bold text-[11px] tracking-wider uppercase">
                    ATRASADO
                  </span>
                )}
              </div>
              <div className="text-lg font-extrabold text-ink mt-1 flex items-baseline gap-2">
                <span>{lastWatering ? `${dec(lastWatering.volumeLiters)} L` : 'Sin registros'}</span>
                {wateringAnalysis.isOverdue && (
                  <span className="text-xs font-bold text-error">
                    Hace {wateringAnalysis.daysSinceWatering}d
                  </span>
                )}
              </div>
              <span className="text-xs text-ink-subtle font-medium">
                {lastWatering ? `pH ${dec(lastWatering.phIn)} · EC ${dec(lastWatering.ecIn)}` : 'Agregá un riego'}
                {lastWatering && wateringAnalysis.daysSinceWatering !== null && !wateringAnalysis.isOverdue && <span className="block">Hace {wateringAnalysis.daysSinceWatering} d</span>}
              </span>
              {soilSensor?.sensors?.soil != null && (
                <span id="soil-sensor-reading" className="mt-1 block text-xs font-bold text-brand">
                  Sustrato {soilSensor.sensors.soil}% · {sensorAgo(soilSensor.readAt)}
                </span>
              )}
              {onOpenDevices && !soilSensor && !pumpBindingFor(devicesOverview, cultivation.id) && (
                <button
                  type="button"
                  id="connect-irrigation-device"
                  onClick={() => onOpenDevices('riego')}
                  className="mt-2 min-h-11 text-xs font-bold text-brand hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plug className="w-3.5 h-3.5" aria-hidden="true" />
                  Conectar bomba o sonda
                </button>
              )}
            </div>

            <div className="bg-white rounded-3xl p-5 border border-line shadow-2xs relative group">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-xs font-semibold text-ink-subtle block">{outdoor ? 'Clima de tu zona' : envSensor ? 'Ambiente ahora' : 'Último ambiente'}</span>
                <button
                  type="button"
                  onClick={() => onEditCultivation(cultivation)}
                  className="min-h-11 text-xs font-bold text-error bg-coral/10 hover:bg-coral/20 px-2 rounded-lg border border-coral/30 transition-colors cursor-pointer flex items-center gap-1"
                  title="Configurar umbrales críticos de temperatura y humedad para alertas IA"
                >
                  <ShieldAlert className="w-3 h-3 text-error" />
                  <span>Umbrales IA</span>
                </button>
              </div>
              <div className="text-lg font-extrabold text-ink mt-1">
                {envSensor?.sensors && (envSensor.sensors.temperature != null || envSensor.sensors.humidity != null)
                  ? `${dec(envSensor.sensors.temperature)} °C | ${dec(envSensor.sensors.humidity)} %`
                  : lastEnv
                    ? `${dec(lastEnv.temperatureC)} °C | ${dec(lastEnv.humidityPct)} %`
                    : 'Sin registros'}
              </div>
              {outdoor && (
                <span id="env-auto-source" className="block text-xs font-bold text-brand">
                  {lastEnv?.isAutoLogged
                    ? `Se mide solo cada hora · ${sensorAgo(Date.parse(lastEnv.createdAt))}`
                    : cultivation.locationCoordinates
                      ? 'Se mide solo cada hora: la primera medición llega pronto'
                      : 'Se mide solo cada hora con la ubicación de tus plantas'}
                </span>
              )}
              {envSensor && (
                <span id="env-sensor-source" className="block text-xs font-bold text-brand">
                  {envSensor.online === false ? 'Sensor sin conexión' : `Medido por ${envSensor.deviceName} · ${sensorAgo(envSensor.readAt)}`}
                </span>
              )}
              <div className="flex items-center justify-between gap-1 text-xs text-ink-subtle font-medium mt-0.5">
                <span>
                  {envSensor?.sensors?.temperature != null && envSensor.sensors.humidity != null
                    ? `VPD: ${dec(environmentService.calculateVPD(envSensor.sensors.temperature, envSensor.sensors.humidity))} kPa`
                    : lastEnv?.vpdKPa
                      ? `VPD: ${dec(lastEnv.vpdKPa)} kPa`
                      : 'Temp y humedad'}
                </span>
                <span
                  className="text-[11px] text-ok-ink bg-ok/10 px-1.5 py-0.5 rounded border border-ok/30"
                  title="Rango térmico y de humedad seguro configurado para alertas automáticas"
                >
                  {cultivation.alertThresholds?.enabled
                    ? `${cultivation.alertThresholds.tempMinC ?? 11}°-${cultivation.alertThresholds.tempMaxC ?? 35}°C | ${cultivation.alertThresholds.humidityMinPct ?? 25}%-${cultivation.alertThresholds.humidityMaxPct ?? 75}%`
                    : '11°-35°C | 25-75%'}
                </span>
              </div>
              {onOpenDevices && !envSensor && !outdoor && (
                <button
                  type="button"
                  id="connect-env-sensor"
                  onClick={() => onOpenDevices('ambiente')}
                  className="mt-2 min-h-11 text-xs font-bold text-brand hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plug className="w-3.5 h-3.5" aria-hidden="true" />
                  Conectar mi sensor
                </button>
              )}
            </div>

            <div className="bg-white rounded-3xl p-5 border border-line shadow-2xs">
              <span className="text-xs font-semibold text-ink-subtle block">Sustrato y macetas</span>
              <div className="text-sm font-bold text-ink mt-1 truncate">
                {cultivation.substrate?.potVolumeLiters}L {cultivation.substrate?.potType}
              </div>
              <span className="text-xs text-ink-subtle font-medium truncate block">
                {cultivation.substrate?.type || 'Sustrato orgánico'}
              </span>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-line shadow-2xs relative group">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-xs font-semibold text-ink-subtle block">Iluminación</span>
                <button
                  type="button"
                  onClick={() => {
                    setStageForTransition(null);
                    setIsTransitionModalOpen(true);
                  }}
                  className="min-h-11 text-xs font-bold text-brand bg-brand/10 hover:bg-brand/20 px-2 rounded-lg border border-brand/30 transition-colors cursor-pointer flex items-center gap-1"
                  title="Ajustar fotoperíodo (12-12, 13-11, etc.) o etapa"
                >
                  <Sun className="w-3 h-3 text-warn-line" />
                  <span>Ajustar</span>
                </button>
              </div>
              <div className="text-sm font-bold text-ink mt-1 truncate">
                {cultivation.lighting?.usedWatts ? `${cultivation.lighting.usedWatts}W` : ''} {cultivation.lighting?.type || 'No especificada'}
              </div>
              {(() => {
                const pp = describePhotoperiod(
                  cultivation.lighting?.photoperiodHoursLight ?? 18,
                  cultivation.lighting?.photoperiodHoursDark
                );
                return (
                  <div id="detail-photoperiod" className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <span className="text-xs font-bold text-ink-muted">
                      {pp.light}h luz / {pp.dark}h osc.
                    </span>
                    {pp.name && (
                      <span className="text-[11px] font-black bg-ok/15 text-ok-ink px-1.5 py-0.5 rounded-md">{pp.name}</span>
                    )}
                    {pp.supercycle && (
                      <span className="text-[11px] font-black bg-warn-bg border border-warn-line text-warn-ink px-1.5 py-0.5 rounded-md uppercase">
                        Experimental
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Bomba de riego y equipos de clima asignados a este cultivo (si hay) */}
          {!isCosechado && (
            <CropDevicesCard
              cultivation={cultivation}
              userId={userId}
              onWateringAdded={onWateringAdded}
              onOpenDevices={onOpenDevices ? () => onOpenDevices('riego') : undefined}
            />
          )}

          {/* Ciclo del cultivo con hitos y desglose de etapas (antes en el Inicio) */}
          {!isCosechado && <CropLifecycleCard cultivation={cultivation} geneticsList={geneticsList} />}

          {/* Sección de Floración (solo si Prefloración, Floración, Maduración o tiene floweringStartDate) */}
          {(() => {
            const stageLower = (cultivation.currentStage || '').toLowerCase();
            const isFlora =
              stageLower.includes('flor') ||
              stageLower.includes('preflor') ||
              stageLower.includes('madur') ||
              Boolean(cultivation.floweringStartDate);

            return isFlora ? (
              <FloweringProgressSection
                cultivation={cultivation}
                geneticsList={geneticsList}
                onOpenWateringModal={onOpenWateringModal}
                onOpenPhotoModal={onOpenPhotoModal}
              />
            ) : null;
          })()}

          {/* Proyección del Ciclo y Cosecha */}
          <HarvestProjectionSection
            cultivation={cultivation}
            geneticsList={geneticsList}
            onOpenCalendarModal={() => setIsCalendarModalOpen(true)}
          />

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <EnvironmentChart cultivation={cultivation} envRecords={cropEnv} />
            <WateringChart cultivation={cultivation} waterings={cropWaterings} />
          </div>
        </div>
      )}

      {/* TAB: TIMELINE & GROWTH STAGES */}
      {activeTab === 'timeline' && (
        <div className="space-y-6">
          {/* Línea de tiempo con forma de planta: maceta abajo, lo más reciente arriba */}
          <PlantTimeline
            cultivation={cultivation}
            waterings={cropWaterings}
            diaryEntries={cropDiary}
            photos={cropPhotos}
            geneticsList={geneticsList}
            userId={userId}
          />
          <CultivationTimelineView
            cultivation={cultivation}
            userId={userId}
            geneticsList={geneticsList}
            onCultivationUpdated={onCultivationUpdated}
            onOpenCalendarModal={() => setIsCalendarModalOpen(true)}
          />
        </div>
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
          <div className="flex items-center justify-between bg-white rounded-3xl p-5 border border-line shadow-xs">
            <div>
              <h3 className="font-bold text-base text-ink">Diario de seguimiento</h3>
              <p className="text-xs text-ink-muted">Historial cronológico de notas, podas y observaciones</p>
            </div>
            <button
              type="button"
              onClick={onOpenDiaryModal}
              className="px-4 py-2 rounded-2xl bg-brand hover:bg-brand-deep text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              + Nueva Nota
            </button>
          </div>

          {cropDiary.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 border border-line text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-surface border border-line text-brand flex items-center justify-center mx-auto">
                <BookOpen className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-ink">Todavía no anotaste nada acá.</h4>
              <p className="text-xs text-ink-muted max-w-sm mx-auto">
                Registrá podas, trasplantes o cómo viste tus plantas hoy para tener el historial completo.
              </p>
              <button
                type="button"
                onClick={onOpenDiaryModal}
                className="mt-2 px-5 py-2.5 rounded-2xl bg-brand hover:bg-brand-deep text-white text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
              >
                <span>Anotar primera nota</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {cropDiary.map((note) => (
                <div
                  key={note.id}
                  className="bg-white rounded-3xl p-5 border border-line shadow-2xs space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-ink">{note.date}</span>
                    {note.tags && (
                      <div className="flex gap-1">
                        {note.tags.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-ok/10 text-ok-ink border border-ok/25"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {note.title && <h4 className="font-bold text-sm text-ink">{note.title}</h4>}
                  <p className="text-xs text-ink-muted whitespace-pre-wrap leading-relaxed">
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
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-line shadow-xs space-y-6 text-ink">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-brand/10 border border-brand/20 text-brand flex items-center justify-center">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-ink">Sincronización con Google Calendar</h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Conectá y programá recordatorios de riego, etapas y cosecha en tu calendario personal
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCalendarModalOpen(true)}
              className="px-5 py-2.5 rounded-2xl bg-brand hover:bg-brand-deep text-white font-bold text-xs transition-all shadow-md shadow-brand/20 flex items-center gap-2 cursor-pointer"
            >
              <Calendar className="w-4 h-4 stroke-[2.5]" />
              <span>Gestionar eventos en Calendar</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-surface border border-line space-y-1.5">
              <div className="flex items-center gap-2 text-ok-ink font-bold text-xs">
                <Droplets className="w-4 h-4" />
                <span>Riegos y nutrición</span>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">
                Recordatorios de riego calculados cada 2-3 días o basados en la fecha del último riego registrado.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-surface border border-line space-y-1.5">
              <div className="flex items-center gap-2 text-brand font-bold text-xs">
                <Layers className="w-4 h-4" />
                <span>Transición de etapas</span>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">
                Cambio de fotoperiodo 12/12, inicio de floración y poda de bajos programadas en tu agenda.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-surface border border-line space-y-1.5">
              <div className="flex items-center gap-2 text-error font-bold text-xs">
                <Award className="w-4 h-4" />
                <span>Lavado y cosecha</span>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">
                Alertas anticipadas para el lavado de raíces (10-14 días antes) y la ventana ideal de secado.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Lo que se usa poco: calendario, terminar el cultivo, editarlo o borrarlo */}
      {isTransferOpen && (
        <TransferCropModal
          crop={cultivation}
          ambients={ambients}
          userId={userId}
          plantName={cultivation.name}
          others={(cultivation.geneticsList || []).map((g) => g.name).filter((n) => n && n !== cultivation.name)}
          onClose={() => setIsTransferOpen(false)}
          onDone={(updated, _to, changeStage) => {
            setIsTransferOpen(false);
            onCultivationUpdated?.(updated);
            if (changeStage) {
              setStageForTransition(null);
              setIsTransitionModalOpen(true);
            }
          }}
        />
      )}

      <section id="crop-more-actions" aria-labelledby="crop-more-actions-title" className="bg-white rounded-[28px] p-5 border border-line shadow-2xs space-y-3">
        <h2 id="crop-more-actions-title" className="text-sm font-bold text-ink">
          Más acciones
        </h2>
        <div className="flex flex-wrap items-center gap-2">
        {!isCosechado && (
          <button type="button" id="crop-transfer-btn" onClick={() => setIsTransferOpen(true)} className="cultiveta-btn-secondary text-xs">
            <ArrowRightLeft className="w-4 h-4 text-brand" aria-hidden="true" />
            <span>Transferir a otro ambiente</span>
          </button>
        )}
        <button
          type="button"
          id="open-calendar-sync-btn"
          onClick={() => setIsCalendarModalOpen(true)}
          className="cultiveta-btn-secondary text-xs"
        >
          <Calendar className="w-4 h-4 text-brand" aria-hidden="true" />
          <span>Google Calendar</span>
        </button>

        {!isCosechado ? (
          <button
            type="button"
            id="finalize-crop-btn"
            data-testid="finalize-crop-btn"
            onClick={() => setIsHarvestModalOpen(true)}
            className="min-h-11 px-4 py-2 rounded-2xl bg-warn-line hover:brightness-95 text-ink font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            title="Terminar el cultivo y anotar la cosecha"
          >
            <Award className="w-4 h-4 text-ink" />
            <span>Finalizar cultivo (cosechar)</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              id="finalize-crop-btn"
              onClick={() => setIsHarvestModalOpen(true)}
              className="min-h-11 px-3.5 py-2 rounded-2xl bg-brand/10 hover:bg-brand/20 text-brand border border-brand/30 font-bold text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
              title="Editar fecha final y peso estimado"
            >
              <CheckCircle2 className="w-4 h-4 text-brand" />
              <span>Cosechado</span>
              {(cultivation.estimatedWeight || cultivation.finalWeight) ? (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-brand/20 text-brand text-[11px] font-bold">
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
              aria-label="Ficha completa de cosecha"
              className="min-h-11 min-w-11 flex items-center justify-center rounded-2xl bg-warn-bg hover:brightness-95 text-warn-ink border border-warn-line font-bold text-xs transition-all cursor-pointer"
              title="Ficha completa de cosecha"
            >
              <Scale className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <button
          type="button"
          id="edit-crop-btn"
          onClick={() => onEditCultivation(cultivation)}
          className="cultiveta-btn-secondary text-xs"
        >
          <Edit className="w-4 h-4" aria-hidden="true" />
          Editar
        </button>

        <button
          type="button"
          onClick={() => {
            if (window.confirm(`¿Estás seguro de eliminar el cultivo "${cultivation.name}"?`)) {
              onDeleteCultivation(cultivation.id);
            }
          }}
          id="delete-crop-btn"
          className="cultiveta-btn-danger text-xs"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
          Eliminar
        </button>
        </div>
      </section>

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
          geneticsList={geneticsList}
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
