import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Sprout,
  Plus,
  Droplets,
  Thermometer,
  Sparkles,
  Calendar,
  Layers,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  Camera,
  Clock,
  FlaskConical,
  RefreshCw,
  Bean,
  Leaf,
  Flower2,
  Scissors,
  CheckCircle2,
  Check,
  Activity,
  Flame,
  Gauge,
  Sun,
  BookOpen,
} from 'lucide-react';
import { Cultivation, Watering, EnvironmentRecord, PhotoRecord, Genetics, UserProfile } from '../../types';
import { CultivationCard } from '../cultivations/CultivationCard';
import { DashboardEnvironmentChart } from './DashboardEnvironmentChart';
import { UpcomingTaskWidget } from './UpcomingTaskWidget';
import { DashboardSkeleton } from './DashboardSkeleton';
import { aiService } from '../../services/aiService';
import { taskService } from '../../services/taskService';
import { getOverdueCultivations, analyzeWateringUrgency } from '../../utils/wateringAlertUtils';
import { browserNotificationService } from '../../services/browserNotificationService';
import {
  getStagesForCultivation,
  calculateTimelineMetrics,
  getStageIcon,
  STAGE_PRESETS,
  buildCultivationStageSchedule,
  formatFriendlyDate,
  isFloweringStage,
  isPreFloweringStage,
} from '../../utils/growthStageUtils';
import { calculateIrrigationForecast } from '../../services/irrigationForecastService';
import { cultivationService } from '../../services/cultivationService';

interface DashboardOverviewProps {
  cultivations: Cultivation[];
  waterings: Watering[];
  envRecords: EnvironmentRecord[];
  photos: PhotoRecord[];
  geneticsList?: Genetics[];
  userProfile?: UserProfile | null;
  userId?: string;
  isLoading?: boolean;
  isSyncing?: boolean;
  syncError?: string | null;
  onRefreshData?: () => void;
  onSelectCultivation: (cultivation: Cultivation) => void;
  onCreateCultivationClick: () => void;
  onOpenWateringModal: (cultivation?: Cultivation) => void;
  onOpenEnvModal: (cultivation?: Cultivation) => void;
  onOpenPhotoModal: (cultivation?: Cultivation) => void;
  onOpenAIAssistant: (cultivation?: Cultivation) => void;
  onOpenCalendarModal?: (cultivation: Cultivation) => void;
  onWateringAdded?: (watering: Watering) => void;
  onTaskCompletedFeedback?: (message: string) => void;
}

export const renderStageMilestoneIcon = (stageName: string, className = 'w-3 h-3 sm:w-3.5 sm:h-3.5') => {
  const lower = stageName.toLowerCase();
  if (lower.includes('germin') || lower.includes('semill')) {
    return <Bean className={className} />;
  }
  if (lower.includes('plánt') || lower.includes('plant') || lower.includes('brote')) {
    return <Sprout className={className} />;
  }
  if (lower.includes('vege') || lower.includes('crecim')) {
    return <Leaf className={className} />;
  }
  if (isPreFloweringStage(stageName) || lower.includes('transic')) {
    return <Sparkles className={className} />;
  }
  if (isFloweringStage(stageName)) {
    return <Flower2 className={className} />;
  }
  if (lower.includes('madur') || lower.includes('lavad')) {
    return <Droplets className={className} />;
  }
  if (lower.includes('cosech') || lower.includes('corte')) {
    return <Scissors className={className} />;
  }
  return <Leaf className={className} />;
};

export const getStageMilestoneDescription = (stageName: string) => {
  const lower = stageName.toLowerCase();
  if (lower.includes('germin') || lower.includes('semill')) return 'Semilla en germinación';
  if (lower.includes('plánt') || lower.includes('plant')) return 'Plántula y brote inicial';
  if (lower.includes('vege') || lower.includes('crecim')) return 'Hojas y crecimiento vegetativo';
  if (isPreFloweringStage(stageName) || lower.includes('transic')) return 'Prefloración y estiramiento';
  if (isFloweringStage(stageName)) return 'Floración y formación de cogollos';
  if (lower.includes('madur') || lower.includes('lavad')) return 'Maduración de resina y lavado';
  if (lower.includes('cosech') || lower.includes('corte')) return 'Corte y cosecha final';
  return stageName;
};

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  cultivations,
  waterings,
  envRecords,
  photos,
  geneticsList = [],
  userProfile,
  userId,
  isLoading = false,
  isSyncing = false,
  syncError = null,
  onRefreshData,
  onSelectCultivation,
  onCreateCultivationClick,
  onOpenWateringModal,
  onOpenEnvModal,
  onOpenPhotoModal,
  onOpenAIAssistant,
  onOpenCalendarModal,
  onWateringAdded,
  onTaskCompletedFeedback,
}) => {
  const [weeklySummary, setWeeklySummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [selectedCropId, setSelectedCropId] = useState<string | null>(null);

  // Progressive Disclosure Expanders
  const [showEnvDetails, setShowEnvDetails] = useState(false);
  const [showWateringDetails, setShowWateringDetails] = useState(false);
  const [showFullClimateChart, setShowFullClimateChart] = useState(false);
  const [showLifecycleDetails, setShowLifecycleDetails] = useState(false);
  const [showWhyForecast, setShowWhyForecast] = useState(false);

  // Active Crops
  const activeCrops = useMemo(() => cultivations.filter((c) => !c.isFinished), [cultivations]);
  const totalPlants = activeCrops.reduce((acc, c) => acc + (c.plantCount || 1), 0);

  // Default selected main crop
  useEffect(() => {
    if (activeCrops.length > 0) {
      if (!selectedCropId || !activeCrops.some((c) => c.id === selectedCropId)) {
        setSelectedCropId(activeCrops[0].id);
      }
    } else {
      setSelectedCropId(null);
    }
  }, [activeCrops, selectedCropId]);

  const primaryCrop = useMemo(() => {
    if (!selectedCropId) return activeCrops[0] || null;
    return activeCrops.find((c) => c.id === selectedCropId) || activeCrops[0] || null;
  }, [activeCrops, selectedCropId]);

  // Greetings logic in Argentine Spanish
  const greetingData = useMemo(() => {
    const rawName = userProfile?.displayName || userProfile?.name || 'Cultivador';
    const firstName = rawName.split(' ')[0] || 'Cultivador';
    const hour = new Date().getHours();
    let timeGreeting = 'Buen día';
    if (hour >= 13 && hour < 20) {
      timeGreeting = 'Buenas tardes';
    } else if (hour >= 20 || hour < 6) {
      timeGreeting = 'Buenas noches';
    }
    return { firstName, timeGreeting };
  }, [userProfile]);

  // Latest records for primary crop
  const latestWateringForPrimary = useMemo(() => {
    if (!primaryCrop) return null;
    return (
      waterings
        .filter((w) => w.cultivationId === primaryCrop.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null
    );
  }, [waterings, primaryCrop]);

  const latestEnvForPrimary = useMemo(() => {
    if (!primaryCrop) return null;
    return (
      envRecords
        .filter((e) => e.cultivationId === primaryCrop.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null
    );
  }, [envRecords, primaryCrop]);

  const latestPhotoForPrimary = useMemo(() => {
    if (!primaryCrop) return null;
    return (
      photos
        .filter((p) => p.cultivationId === primaryCrop.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null
    );
  }, [photos, primaryCrop]);

  // Days calculations
  const primaryCropDays = useMemo(() => {
    if (!primaryCrop) return 0;
    return cultivationService.calculateDays(primaryCrop.startDate);
  }, [primaryCrop]);

  // Waterings in last 7 days
  const now = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(now.getDate() - 7);
  const recentWateringsCount = waterings.filter((w) => new Date(w.date) >= sevenDaysAgo).length;

  // Overdue watering detection
  const isWateringAlertsEnabled = userProfile?.preferences?.alertTypes?.wateringAlerts ?? true;
  const overdueCultivationsList = useMemo(() => {
    if (!isWateringAlertsEnabled) return [];
    return getOverdueCultivations(cultivations, waterings);
  }, [cultivations, waterings, isWateringAlertsEnabled]);

  const primaryCropOverdueInfo = useMemo(() => {
    if (!primaryCrop) return null;
    return overdueCultivationsList.find((o) => o.cultivation.id === primaryCrop.id) || null;
  }, [primaryCrop, overdueCultivationsList]);

  // Days since watering formatted in Argentine Spanish
  const wateringTimeAgo = useMemo(() => {
    if (!latestWateringForPrimary) return 'Sin registros';
    const dateStr = latestWateringForPrimary.date.split('T')[0];
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const waterDate = new Date(y, m, d);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diffDays = Math.floor((today.getTime() - waterDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return 'Hoy';
      if (diffDays === 1) return 'Ayer';
      return `Hace ${diffDays} días`;
    }
    return dateStr;
  }, [latestWateringForPrimary, now]);

  // Environment status calculation (Está joya vs Hay algo para mirar)
  const envCondition = useMemo(() => {
    if (!latestEnvForPrimary) {
      return {
        label: 'Sin mediciones',
        isGood: true,
        shortDesc: 'Anotá temperatura y humedad para ver el estado',
        alertMsg: null,
      };
    }
    const temp = latestEnvForPrimary.temperature ?? latestEnvForPrimary.temperatureC ?? 24;
    const hum = latestEnvForPrimary.humidity ?? latestEnvForPrimary.humidityPct ?? 55;
    const isFlower =
      isFloweringStage(primaryCrop?.currentStage) ||
      primaryCrop?.currentStage?.toLowerCase().includes('madur');

    if (isFlower && hum > 68) {
      return {
        label: 'Humedad alta en floración',
        isGood: false,
        shortDesc: `${temp} °C · ${hum} %`,
        alertMsg: 'Humedad alta en floración. Conviene revisarla ahora para prevenir hongos.',
      };
    }
    if (temp > 31) {
      return {
        label: 'Temperatura elevada',
        isGood: false,
        shortDesc: `${temp} °C · ${hum} %`,
        alertMsg: `Temperatura en ${temp} °C. Conviene mejorar la extracción de aire.`,
      };
    }
    if (temp < 17) {
      return {
        label: 'Temperatura baja',
        isGood: false,
        shortDesc: `${temp} °C · ${hum} %`,
        alertMsg: `Temperatura en ${temp} °C. Muy baja para desarrollo óptimo.`,
      };
    }
    return {
      label: 'Está joya',
      isGood: true,
      shortDesc: `${temp} °C · ${hum} %`,
      alertMsg: null,
    };
  }, [latestEnvForPrimary, primaryCrop]);

  // Overall crop state: 3-second glance test!
  const cropOverallState = useMemo(() => {
    if (!primaryCrop) {
      return {
        title: 'Todavía no tenés cultivos activos',
        subtitle: 'Creá tu primera carpa para comenzar el seguimiento.',
        isAlert: false,
        alertType: 'none',
      };
    }
    if (primaryCropOverdueInfo) {
      return {
        title: 'Hay algo para mirar',
        subtitle: `Riego atrasado (+${primaryCropOverdueInfo.analysis.daysOverdue}d). Conviene regar hoy.`,
        isAlert: true,
        alertType: 'watering',
      };
    }
    if (!envCondition.isGood && envCondition.alertMsg) {
      return {
        title: 'Hay algo para mirar',
        subtitle: envCondition.alertMsg,
        isAlert: true,
        alertType: 'env',
      };
    }
    return {
      title: 'Todo tranqui por acá',
      subtitle: 'No hay nada urgente para revisar.',
      isAlert: false,
      alertType: 'none',
    };
  }, [primaryCrop, primaryCropOverdueInfo, envCondition]);

  // Quick tasks for today
  const todayTasksList = useMemo(() => {
    const list: Array<{ id: string; text: string; action: () => void; isUrgent?: boolean }> = [];
    if (!primaryCrop) return list;

    if (primaryCropOverdueInfo) {
      list.push({
        id: 'task-water',
        text: `Revisar riego (+${primaryCropOverdueInfo.analysis.daysOverdue}d)`,
        action: () => onOpenWateringModal(primaryCrop),
        isUrgent: true,
      });
    }

    // Weekly photo reminder
    let daysSincePhoto = 999;
    if (latestPhotoForPrimary?.date) {
      const pDate = new Date(latestPhotoForPrimary.date).getTime();
      daysSincePhoto = Math.floor((Date.now() - pDate) / (1000 * 60 * 60 * 24));
    }
    if (daysSincePhoto >= 7) {
      list.push({
        id: 'task-photo',
        text: 'Sacar foto semanal de seguimiento',
        action: () => onOpenPhotoModal(primaryCrop),
      });
    }

    if (list.length === 0) {
      list.push({
        id: 'task-check',
        text: 'Revisar parámetros y salud general',
        action: () => onOpenEnvModal(primaryCrop),
      });
    }

    return list;
  }, [primaryCrop, primaryCropOverdueInfo, latestPhotoForPrimary, onOpenWateringModal, onOpenPhotoModal, onOpenEnvModal]);

  // Timeline and Lifecycle calculations EXCLUSIVELY for primaryCrop
  const primaryCropTimeline = useMemo(() => {
    if (!primaryCrop) return null;
    const schedule = buildCultivationStageSchedule(primaryCrop, geneticsList);
    const stages = getStagesForCultivation(primaryCrop);
    const metrics = calculateTimelineMetrics(primaryCrop, stages, geneticsList);

    let harvestIdx = schedule.stages.findIndex(
      (s) => s.name === 'Cosecha' || s.name === 'Secado' || s.name === 'Finalizado'
    );
    if (harvestIdx === -1) harvestIdx = schedule.stages.length - 1;
    const lifecycleStages = schedule.stages.slice(0, harvestIdx + 1);

    const totalExpectedCycleDays = lifecycleStages.reduce(
      (acc, s) => acc + (s.expectedDurationDays || 7),
      0
    ) || 1;
    const baseCycleDays = schedule.totalCycleDays || totalExpectedCycleDays;

    let cumulativeDays = 0;
    const milestones = lifecycleStages.map((st, idx) => {
      const duration = st.expectedDurationDays || 1;
      const startDay = cumulativeDays;
      const pct = Math.min(100, Math.max(0, Math.round((startDay / baseCycleDays) * 100)));
      const isReached = schedule.overallProgressPct !== null
        ? schedule.overallProgressPct >= pct
        : idx < schedule.activeStageIndex;
      const isCurrent = idx === schedule.activeStageIndex;
      cumulativeDays += duration;

      return {
        id: st.id || `stage_${idx}`,
        name: st.name,
        icon: getStageIcon(st.name),
        startDay,
        durationDays: duration,
        percent: pct,
        isReached,
        isCurrent,
        startDate: st.startDate,
        endDate: st.endDate,
        isActual: st.isActual,
        isProjected: st.isProjected,
        dateKnowledge: st.dateKnowledge,
        isUnknown: Boolean(st.isUnknown || st.dateKnowledge === 'unknown'),
        startIsReal: st.startIsReal,
        endIsReal: st.endIsReal,
        actualStartDate: st.actualStartDate,
        actualEndDate: st.actualEndDate,
      };
    });

    const vegeStage = schedule.stages.find((s) => s.name.toLowerCase().includes('vege'));
    const floraStage = schedule.floweringStage || schedule.stages.find((s) => isFloweringStage(s.name));

    return {
      schedule,
      stages,
      metrics,
      milestones,
      progressPct: schedule.overallProgressPct,
      roadmapProgressPct: schedule.roadmapProgressPct,
      isCycleStartKnown: schedule.isCycleStartKnown,
      activeStageElapsedDays: schedule.activeStageElapsedDays,
      elapsedDays: schedule.totalElapsedDays,
      totalCycleDays: schedule.totalCycleDays,
      currentStageName: primaryCrop.currentStage || schedule.activeStage?.name || 'Vegetativo',
      vegeDates: vegeStage
        ? `${formatFriendlyDate(vegeStage.startDate)} → ${formatFriendlyDate(vegeStage.endDate, { isProjected: vegeStage.isProjected })}`
        : null,
      floraDates: floraStage
        ? `${formatFriendlyDate(floraStage.startDate, { isProjected: !floraStage.isActual })} → ${formatFriendlyDate(floraStage.endDate, { isProjected: true })}`
        : null,
      harvestDate: formatFriendlyDate(schedule.estimatedHarvestDate, { isProjected: true }),
      startDateFormatted: formatFriendlyDate(schedule.cropStartDate),
    };
  }, [primaryCrop, geneticsList]);

  // Deterministic Irrigation Forecast for primary crop
  const primaryCropIrrigationForecast = useMemo(() => {
    if (!primaryCrop) return null;
    return calculateIrrigationForecast(primaryCrop, waterings, envRecords);
  }, [primaryCrop, waterings, envRecords]);

  const forecastDisplay = useMemo(() => {
    if (!primaryCropIrrigationForecast) return null;
    const f = primaryCropIrrigationForecast;
    if (f.confidence === 'low') {
      if (!f.lastWateringAt) {
        return {
          title: 'Estimación inicial',
          text: 'Registrá un primer riego para activar el aprendizaje.',
          isLowConfidence: true,
        };
      }
      return {
        title: 'Estimación por etapa',
        text: 'Registrá algunos riegos más para personalizar la ventana.',
        isLowConfidence: true,
      };
    }

    const startPart = f.wateringWindowStart ? f.wateringWindowStart.split('T')[0] : '';
    const endPart = f.wateringWindowEnd ? f.wateringWindowEnd.split('T')[0] : '';
    const startTime = f.wateringWindowStart && f.wateringWindowStart.includes('T') ? f.wateringWindowStart.split('T')[1] : '';
    const endTime = f.wateringWindowEnd && f.wateringWindowEnd.includes('T') ? f.wateringWindowEnd.split('T')[1] : '';

    return {
      title: 'Ventana de revisión',
      text: startPart === endPart
        ? `Revisá la maceta el ${formatFriendlyDate(startPart)}${startTime ? ` (${startTime}–${endTime} hs)` : ''}`
        : `Revisá la maceta entre ${formatFriendlyDate(startPart)} y ${formatFriendlyDate(endPart)}`,
      isLowConfidence: false,
    };
  }, [primaryCropIrrigationForecast]);

  // AI Weekly Summary
  const handleGenerateWeeklySummary = async () => {
    try {
      setLoadingSummary(true);
      const res = await aiService.getWeeklySummary({
        cultivations: activeCrops.map((c) => ({
          name: c.name,
          stage: c.currentStage,
          genetics: c.genetics,
        })),
        wateringsCount: waterings.length,
        recentEnvAvg: {
          tempC: latestEnvForPrimary?.temperature ?? latestEnvForPrimary?.temperatureC ?? 24,
          humidityPct: latestEnvForPrimary?.humidity ?? latestEnvForPrimary?.humidityPct ?? 58,
        },
      });
      setWeeklySummary(res);
    } catch (err: any) {
      console.error('Error generating summary:', err);
      setWeeklySummary('No pudimos generar el resumen botánico en este momento. Reintentá en un ratito.');
    } finally {
      setLoadingSummary(false);
    }
  };

  const isInitialLoading = Boolean(
    isLoading &&
    cultivations.length === 0 &&
    waterings.length === 0 &&
    envRecords.length === 0
  );

  return (
    <div id="dashboard-overview" className="space-y-6 sm:space-y-8 dashboard-overview">
      {/* 1. Header con Saludo Cercano y Acciones Rápidas */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#29202F] tracking-tight">
            {greetingData.timeGreeting}, {greetingData.firstName} 🌱
          </h1>
          <p className="text-sm font-semibold text-[#6C45C7] mt-0.5">
            ¿Cómo viene el cultivo?
          </p>
        </div>

        {/* Botones de acción directos */}
        <div className="flex items-center gap-2.5 self-stretch sm:self-auto shrink-0 flex-wrap">
          {onRefreshData && (
            <button
              type="button"
              id="refresh-dashboard-btn"
              onClick={onRefreshData}
              disabled={isSyncing}
              className="p-3 rounded-2xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] text-[#6E5D77] hover:text-[#29202F] transition-all cursor-pointer shadow-xs disabled:opacity-50"
              title="Sincronizar datos"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-[#62B95B]' : ''}`} />
            </button>
          )}

          <button
            type="button"
            id="quick-ai-btn"
            onClick={() => onOpenAIAssistant(primaryCrop || undefined)}
            className="flex-1 sm:flex-initial px-4 py-3 rounded-2xl bg-[#6C45C7]/10 hover:bg-[#6C45C7]/20 text-[#6C45C7] border border-[#6C45C7]/25 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <Sparkles className="w-4 h-4" />
            <span>Preguntale a Cultiveta</span>
          </button>

          <button
            type="button"
            id="create-crop-hero-btn"
            onClick={onCreateCultivationClick}
            className="flex-1 sm:flex-initial px-4 py-3 rounded-2xl bg-[#62B95B] hover:bg-[#52A54C] text-white text-xs font-bold transition-all shadow-md shadow-[#62B95B]/20 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Nuevo Cultivo</span>
          </button>
        </div>
      </div>

      {/* Sync Error Banner if any */}
      {syncError && (
        <div className="p-3.5 rounded-2xl bg-[#EB7864]/10 border border-[#EB7864]/30 text-[#29202F] text-xs flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#EB7864] shrink-0" />
            <span>{syncError}</span>
          </div>
          {onRefreshData && (
            <button
              type="button"
              onClick={onRefreshData}
              disabled={isSyncing}
              className="px-3 py-1.5 rounded-xl bg-[#EB7864] hover:bg-[#d96551] text-white font-bold cursor-pointer text-xs transition-colors shrink-0 disabled:opacity-50"
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      {isInitialLoading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* 2. Tarjeta Cultivo Principal (Responde: ¿Cómo está mi cultivo? ¿Qué tengo que hacer hoy? ¿Hay algo que mirar?) */}
          {activeCrops.length === 0 ? (
            <div className="bg-white rounded-[32px] p-8 sm:p-12 border border-[#EFE3CF] text-center space-y-4 shadow-xs">
              <div className="w-16 h-16 rounded-2xl bg-[#FAF2E1] border border-[#EFE3CF] text-[#62B95B] flex items-center justify-center mx-auto">
                <Sprout className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-extrabold text-[#29202F] text-lg">Todavía no anotaste ningún cultivo 🌱</h3>
                <p className="text-xs text-[#6E5D77] max-w-sm mx-auto mt-1">
                  Creá tu primera carpa o planta para empezar a registrar riegos, parámetros ambientales y fotos.
                </p>
              </div>
              <button
                type="button"
                onClick={onCreateCultivationClick}
                className="px-6 py-3 rounded-2xl bg-[#62B95B] hover:bg-[#52A54C] text-white font-bold text-xs transition-all shadow-md shadow-[#62B95B]/20 cursor-pointer inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                Crear Nuevo Cultivo
              </button>
            </div>
          ) : (
            primaryCrop && (
              <div
                id="main-crop-hero-card"
                className="bg-white rounded-[32px] p-6 sm:p-8 border border-[#EFE3CF] shadow-xs relative overflow-hidden space-y-6"
              >
                {/* 4 Mini-Stats en la parte superior izquierda, antes del selector Cultivos */}
                <div className="grid grid-cols-2 sm:flex sm:flex-row sm:items-center gap-2">
                  <div
                    id="stat-active-crops"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-[#FAF2E1]/70 border border-[#EFE3CF]"
                  >
                    <div className="p-1.5 rounded-xl bg-[#62B95B]/15 text-[#62B95B] shrink-0">
                      <Sprout className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-lg sm:text-xl font-black text-[#29202F] leading-none block">
                        {activeCrops.length}
                      </span>
                      <span className="text-[10px] font-bold text-[#6E5D77] uppercase tracking-wider block mt-0.5">
                        Cultivos
                      </span>
                    </div>
                  </div>

                  <div
                    id="stat-total-plants"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-[#FAF2E1]/70 border border-[#EFE3CF]"
                  >
                    <div className="p-1.5 rounded-xl bg-[#FAF2E1] text-[#29202F] shrink-0">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-lg sm:text-xl font-black text-[#29202F] leading-none block">
                        {totalPlants}
                      </span>
                      <span className="text-[10px] font-bold text-[#6E5D77] uppercase tracking-wider block mt-0.5">
                        Plantas
                      </span>
                    </div>
                  </div>

                  <div
                    id="stat-recent-waterings"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-[#FAF2E1]/70 border border-[#EFE3CF]"
                  >
                    <div className="p-1.5 rounded-xl bg-[#6C45C7]/15 text-[#6C45C7] shrink-0">
                      <Droplets className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-lg sm:text-xl font-black text-[#6C45C7] leading-none block">
                        {recentWateringsCount}
                      </span>
                      <span className="text-[10px] font-bold text-[#6E5D77] uppercase tracking-wider block mt-0.5">
                        Riegos (7d)
                      </span>
                    </div>
                  </div>

                  <div
                    id="stat-diary-photos"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-[#FAF2E1]/70 border border-[#EFE3CF]"
                  >
                    <div className="p-1.5 rounded-xl bg-[#F3C843]/25 text-[#29202F] shrink-0">
                      <Camera className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-lg sm:text-xl font-black text-[#29202F] leading-none block">
                        {photos.length}
                      </span>
                      <span className="text-[10px] font-bold text-[#6E5D77] uppercase tracking-wider block mt-0.5">
                        Fotos
                      </span>
                    </div>
                  </div>
                </div>

                {/* Selector rápido entre carpas activas (si hay más de 1) */}
                {activeCrops.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                    <span className="text-[11px] font-bold text-[#9887A2] uppercase tracking-wider shrink-0 mr-1">
                      Cultivos:
                    </span>
                    {activeCrops.map((crop) => (
                      <button
                        key={crop.id}
                        type="button"
                        onClick={() => setSelectedCropId(crop.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                          crop.id === primaryCrop.id
                            ? 'bg-[#6C45C7] text-white shadow-xs'
                            : 'bg-[#FAF2E1] text-[#6E5D77] hover:bg-[#EFE3CF]'
                        }`}
                      >
                        {crop.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Cabecera del Cultivo: Nombre, Día, Etapa */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#EFE3CF]">
                  <div>
                    <h2
                      onClick={() => onSelectCultivation(primaryCrop)}
                      className="text-2xl sm:text-3xl font-black text-[#29202F] tracking-tight hover:text-[#6C45C7] transition-colors cursor-pointer inline-flex items-center gap-2"
                      title="Ver detalle del cultivo"
                    >
                      <span>{primaryCrop.name}</span>
                      <ChevronRight className="w-5 h-5 text-[#9887A2]" />
                    </h2>
                    {/* Metadatos sin cajas píldora */}
                    <div className="flex items-center gap-2 text-xs text-[#6E5D77] mt-1 flex-wrap">
                      {primaryCropTimeline?.schedule.isCycleStartKnown ? (
                        <>
                          <span className="font-bold text-[#29202F]">Día {primaryCropDays}</span>
                          <span aria-hidden="true" className="text-[#DECDB3]">·</span>
                          <span className="font-semibold text-[#6C45C7]">{primaryCrop.currentStage || 'Vegetativo'}</span>
                        </>
                      ) : (
                        <span className="font-bold text-[#29202F]">
                          Día {primaryCropTimeline?.schedule.activeStageElapsedDays || 1} de {primaryCrop.currentStage || primaryCropTimeline?.schedule.activeStage?.name || 'Floración'}
                        </span>
                      )}
                      {primaryCrop.geneticsName && (
                        <>
                          <span aria-hidden="true" className="text-[#DECDB3]">·</span>
                          <span>{primaryCrop.geneticsName}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Estado global comprensible en 3 segundos */}
                  <div
                    className={`px-4 py-2.5 rounded-2xl flex items-center gap-3 shrink-0 ${
                      cropOverallState.isAlert
                        ? 'bg-[#EB7864]/10 border border-[#EB7864]/30'
                        : 'bg-[#62B95B]/10 border border-[#62B95B]/25'
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full shrink-0 ${
                        cropOverallState.isAlert ? 'bg-[#EB7864] animate-pulse' : 'bg-[#62B95B]'
                      }`}
                    />
                    <div>
                      <span
                        className={`text-sm font-extrabold block leading-tight ${
                          cropOverallState.isAlert ? 'text-[#EB7864]' : 'text-[#62B95B]'
                        }`}
                      >
                        &quot;{cropOverallState.title}&quot;
                      </span>
                      <span className="text-[11px] text-[#6E5D77] block mt-0.5">
                        {cropOverallState.subtitle}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Grid de 3 Capas: Hoy, Ambiente, Último Riego */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Columna 1: Hoy */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#9887A2]">
                          Hoy
                        </span>
                        <Calendar className="w-4 h-4 text-[#6C45C7]" />
                      </div>

                      <div className="space-y-2">
                        {todayTasksList.map((task) => (
                          <div
                            key={task.id}
                            className="flex items-start gap-2 text-xs font-semibold text-[#29202F]"
                          >
                            <span className="text-[#62B95B] mt-0.5">•</span>
                            <span className="flex-1">{task.text}</span>
                          </div>
                        ))}
                      </div>

                      {/* Próximo Riego Forecast (Discreto en bloque Hoy) */}
                      {forecastDisplay && (
                        <div className="pt-2 border-t border-[#EFE3CF]/60 space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-[#6E5D77] flex items-center gap-1">
                              <Droplets className="w-3 h-3 text-[#62B95B]" />
                              <span>{forecastDisplay.title}</span>
                            </span>
                            {!forecastDisplay.isLowConfidence && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#62B95B]/15 text-[#2D6B28]">
                                {primaryCropIrrigationForecast?.confidence === 'high' ? 'Alta conf.' : 'Media conf.'}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-[#29202F]">
                            {forecastDisplay.text}
                          </p>
                          {showWhyForecast ? (
                            <div className="p-2 rounded-xl bg-[#FAF2E1] border border-[#EFE3CF] text-[10px] text-[#6E5D77] space-y-1">
                              {primaryCropIrrigationForecast?.factors.slice(0, 3).map((f, i) => (
                                <p key={i}>• {f}</p>
                              ))}
                              <button
                                type="button"
                                onClick={() => setShowWhyForecast(false)}
                                className="text-[#6C45C7] font-bold hover:underline cursor-pointer pt-0.5 block"
                              >
                                Cerrar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setShowWhyForecast(true)}
                              className="text-[10px] text-[#6C45C7] hover:underline font-semibold cursor-pointer inline-flex items-center gap-0.5"
                            >
                              <span>¿Por qué?</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-[#EFE3CF]">
                      <button
                        type="button"
                        onClick={() => onOpenWateringModal(primaryCrop)}
                        className="flex-1 py-2 px-2.5 rounded-xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] text-[#29202F] font-bold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Droplets className="w-3.5 h-3.5 text-[#62B95B]" />
                        <span>Regar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenPhotoModal(primaryCrop)}
                        className="flex-1 py-2 px-2.5 rounded-xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] text-[#29202F] font-bold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5 text-[#6C45C7]" />
                        <span>Foto</span>
                      </button>
                    </div>
                  </div>

                  {/* Columna 2: Ambiente (Progressive Disclosure) */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#9887A2]">
                          Ambiente
                        </span>
                        <Thermometer className="w-4 h-4 text-[#EB7864]" />
                      </div>

                      <div className="space-y-1">
                        <span
                          className={`text-sm font-extrabold block ${
                            envCondition.isGood ? 'text-[#62B95B]' : 'text-[#EB7864]'
                          }`}
                        >
                          &quot;{envCondition.label}&quot;
                        </span>
                        <span className="text-lg font-black text-[#29202F] block">
                          {envCondition.shortDesc}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#EFE3CF]">
                      <button
                        type="button"
                        onClick={() => setShowEnvDetails((prev) => !prev)}
                        className="w-full py-2 px-2.5 rounded-xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] text-[#6C45C7] font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>{showEnvDetails ? 'Ocultar detalles' : 'Ver detalles de ambiente'}</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${
                            showEnvDetails ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Columna 3: Último Riego (Progressive Disclosure) */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#9887A2]">
                          Último Riego
                        </span>
                        <Droplets className="w-4 h-4 text-[#62B95B]" />
                      </div>

                      <div className="space-y-1">
                        <span className="text-sm font-extrabold text-[#29202F] block">
                          {wateringTimeAgo}
                        </span>
                        <span className="text-lg font-black text-[#29202F] block">
                          {latestWateringForPrimary
                            ? `${latestWateringForPrimary.volumeLiters || 1.5} L`
                            : 'Anotá tu primer riego'}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#EFE3CF]">
                      <button
                        type="button"
                        onClick={() => setShowWateringDetails((prev) => !prev)}
                        className="w-full py-2 px-2.5 rounded-xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] text-[#6C45C7] font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>{showWateringDetails ? 'Ocultar' : 'Ver pH, EC y productos'}</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${
                            showWateringDetails ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Detalles Expandidos de Ambiente */}
                {showEnvDetails && (
                  <div className="p-5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] space-y-4 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between pb-2 border-b border-[#EFE3CF]">
                      <h4 className="text-sm font-extrabold text-[#29202F]">
                        Parámetros Ambientales Detallados
                      </h4>
                      <button
                        type="button"
                        onClick={() => onOpenEnvModal(primaryCrop)}
                        className="text-xs font-bold text-[#6C45C7] hover:underline cursor-pointer"
                      >
                        + Medir ahora
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-white border border-[#EFE3CF]">
                        <span className="text-[10px] text-[#9887A2] block">Temperatura</span>
                        <span className="text-base font-black text-[#29202F] block mt-0.5">
                          {latestEnvForPrimary?.temperature ?? latestEnvForPrimary?.temperatureC ?? '--'} °C
                        </span>
                        <span className="text-[10px] text-[#6E5D77] block mt-0.5">Óptimo: 20-27 °C</span>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-[#EFE3CF]">
                        <span className="text-[10px] text-[#9887A2] block">Humedad Relativa</span>
                        <span className="text-base font-black text-[#29202F] block mt-0.5">
                          {latestEnvForPrimary?.humidity ?? latestEnvForPrimary?.humidityPct ?? '--'} %
                        </span>
                        <span className="text-[10px] text-[#6E5D77] block mt-0.5">Óptimo: 45-65 %</span>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-[#EFE3CF]">
                        <span className="text-[10px] text-[#9887A2] block">VPD Estimado</span>
                        <span className="text-base font-black text-[#6C45C7] block mt-0.5">
                          {latestEnvForPrimary?.vpdKPa ?? latestEnvForPrimary?.vpd ?? '--'} kPa
                        </span>
                        <span className="text-[10px] text-[#6E5D77] block mt-0.5">Déficit de presión</span>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-[#EFE3CF]">
                        <span className="text-[10px] text-[#9887A2] block">Luz / PPFD</span>
                        <span className="text-base font-black text-[#29202F] block mt-0.5">
                          {latestEnvForPrimary?.ppfdUmols ?? '--'} µmol
                        </span>
                        <span className="text-[10px] text-[#6E5D77] block mt-0.5">Intensidad lumínica</span>
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => setShowFullClimateChart((prev) => !prev)}
                        className="text-xs font-bold text-[#6C45C7] hover:underline cursor-pointer inline-flex items-center gap-1"
                      >
                        <span>{showFullClimateChart ? 'Ocultar gráfico climático' : 'Ver curvas y gráficos completos'}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Detalles Expandidos de Último Riego */}
                {showWateringDetails && (
                  <div className="p-5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] space-y-4 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between pb-2 border-b border-[#EFE3CF]">
                      <h4 className="text-sm font-extrabold text-[#29202F]">
                        Detalle del Último Riego
                      </h4>
                      <button
                        type="button"
                        onClick={() => onOpenWateringModal(primaryCrop)}
                        className="text-xs font-bold text-[#62B95B] hover:underline cursor-pointer"
                      >
                        + Nuevo riego
                      </button>
                    </div>

                    {latestWateringForPrimary ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-white border border-[#EFE3CF]">
                          <span className="text-[10px] text-[#9887A2] block">Volumen</span>
                          <span className="text-base font-black text-[#29202F] block mt-0.5">
                            {latestWateringForPrimary.volumeLiters} L
                          </span>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-[#EFE3CF]">
                          <span className="text-[10px] text-[#9887A2] block">pH Entrada</span>
                          <span className="text-base font-black text-[#6C45C7] block mt-0.5">
                            {latestWateringForPrimary.phIn || 's/d'}
                          </span>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-[#EFE3CF]">
                          <span className="text-[10px] text-[#9887A2] block">EC Entrada</span>
                          <span className="text-base font-black text-[#62B95B] block mt-0.5">
                            {latestWateringForPrimary.ecIn ? `${latestWateringForPrimary.ecIn} mS` : 's/d'}
                          </span>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-[#EFE3CF]">
                          <span className="text-[10px] text-[#9887A2] block">Fertilizantes</span>
                          <span className="text-xs font-semibold text-[#29202F] block mt-0.5 truncate">
                            {latestWateringForPrimary.products && latestWateringForPrimary.products.length > 0
                              ? latestWateringForPrimary.products.map((p) => p.productName).join(', ')
                              : 'Solo agua regulada'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-[#6E5D77]">
                        Aún no anotaste ningún riego para este cultivo. Tocá &quot;+ Nuevo riego&quot; para registrar el primero.
                      </p>
                    )}
                  </div>
                )}

                {/* 4ta Capa: Ciclo del Cultivo del primaryCrop seleccionado */}
                {primaryCropTimeline && (
                  <div id="crop-lifecycle-card-section" className="pt-5 border-t border-[#EFE3CF] space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-extrabold text-[#29202F]">
                          Ciclo del cultivo
                        </h3>
                        {primaryCropTimeline.progressPct !== null ? (
                          <span className="text-xs font-bold text-[#62B95B]">
                            {primaryCropTimeline.progressPct}% del ciclo estimado
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-[#6C45C7]">
                            Inicio de ciclo no registrado
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        {primaryCropTimeline.elapsedDays !== null && primaryCropTimeline.totalCycleDays !== null ? (
                          <span className="text-xs text-[#6E5D77] font-semibold">
                            Día {primaryCropTimeline.elapsedDays} de ~{primaryCropTimeline.totalCycleDays}
                          </span>
                        ) : (
                          <span className="text-xs text-[#6E5D77] font-semibold">
                            Día {primaryCropTimeline.activeStageElapsedDays} en {primaryCropTimeline.currentStageName}
                          </span>
                        )}
                        <button
                          type="button"
                          id="toggle-lifecycle-details-btn"
                          onClick={() => setShowLifecycleDetails((prev) => !prev)}
                          className="text-xs font-bold text-[#6C45C7] hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <span>{showLifecycleDetails ? 'Ocultar etapas' : 'Ver etapas'}</span>
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${
                              showLifecycleDetails ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Barra de progreso visual orgánica */}
                    <div className="relative w-full h-3 bg-[#FAF2E1] rounded-full overflow-hidden border border-[#EFE3CF]">
                      <motion.div
                        key={`cycle-progress-bar-${primaryCrop.id}`}
                        id="cycle-progress-bar-fill"
                        className="h-full bg-gradient-to-r from-[#62B95B] via-[#F3C843] to-[#6C45C7] rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${primaryCropTimeline.roadmapProgressPct}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>

                    {/* Hitos botánicos principales: Siembra, Vegetativo, Floración, Cosecha */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-semibold text-[#6E5D77] pt-1 px-0.5">
                      <div className="text-left">
                        <span className="block font-bold text-[#29202F]">Siembra</span>
                        <span className="text-[10px] text-[#9887A2] block mt-0.5">
                          {primaryCropTimeline.isCycleStartKnown ? primaryCropTimeline.startDateFormatted : 'Sin fecha registrada'}
                        </span>
                      </div>
                      <div className="text-left sm:text-center">
                        <span className="block font-bold text-[#29202F]">Vegetativo</span>
                        {primaryCropTimeline.vegeDates && (
                          <span className="text-[10px] text-[#9887A2] block mt-0.5 truncate">
                            {primaryCropTimeline.vegeDates}
                          </span>
                        )}
                      </div>
                      <div className="text-left sm:text-center">
                        <span className="block font-bold text-[#29202F]">Floración</span>
                        {primaryCropTimeline.floraDates && (
                          <span className="text-[10px] text-[#9887A2] block mt-0.5 truncate">
                            {primaryCropTimeline.floraDates}
                          </span>
                        )}
                      </div>
                      <div className="text-left sm:text-right">
                        <span className="block font-bold text-[#29202F]">Cosecha</span>
                        <span className="text-[10px] text-[#9887A2] block mt-0.5">
                          {primaryCropTimeline.harvestDate}
                        </span>
                      </div>
                    </div>

                    {/* Progressive disclosure: Desglose detallado de etapas configuradas para primaryCrop */}
                    {showLifecycleDetails && (
                      <div id="crop-lifecycle-stage-breakdown" className="pt-3 border-t border-[#EFE3CF] grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs animate-in fade-in duration-200">
                        {primaryCropTimeline.milestones.map((m, mIdx) => {
                          let tag = 'Estimada';
                          if (m.isCurrent || mIdx === primaryCropTimeline.schedule.activeStageIndex) {
                            tag = 'Actual';
                          } else if (mIdx < primaryCropTimeline.schedule.activeStageIndex) {
                            if (m.dateKnowledge === 'unknown' || m.isUnknown || !m.startDate) {
                              tag = 'Anterior · Sin fecha';
                            } else if (m.dateKnowledge === 'actual' || (m.startIsReal && m.endIsReal)) {
                              tag = 'Anterior · Real';
                            } else {
                              tag = 'Anterior · Parcial';
                            }
                          } else {
                            tag = 'Estimada';
                          }

                          const dateText = (m.dateKnowledge === 'unknown' || m.isUnknown || !m.startDate)
                            ? 'Sin fecha registrada'
                            : `${formatFriendlyDate(m.startDate, { isProjected: !m.isActual })} → ${formatFriendlyDate(m.endDate, { isProjected: m.isProjected })}`;

                          return (
                            <div
                              key={m.id}
                              className={`p-3 rounded-xl border transition-all ${
                                m.isCurrent
                                  ? 'bg-[#62B95B]/10 border-[#62B95B]/40 text-[#29202F] font-bold shadow-2xs'
                                  : m.isReached
                                  ? 'bg-[#FAF2E1] border-[#EFE3CF] text-[#29202F]'
                                  : 'bg-white border-[#EFE3CF] text-[#9887A2]'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] text-[#9887A2] uppercase tracking-wider block">
                                  {tag}
                                </span>
                                {m.isCurrent && (
                                  <span className="w-2 h-2 rounded-full bg-[#62B95B] animate-pulse" title="Etapa actual" />
                                )}
                              </div>
                              <span className="block font-bold truncate">{m.name}</span>
                              <span className="text-[10px] text-[#6E5D77] block mt-0.5">
                                {dateText}
                              </span>
                              <span className="text-[10px] text-[#9887A2] block mt-0.5">
                                {m.durationDays} días
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          )}

          {/* 3. Tareas Críticas del Cultivo (UpcomingTaskWidget con estilo cálido) */}
          <UpcomingTaskWidget
            cultivations={cultivations}
            waterings={waterings}
            envRecords={envRecords}
            userId={userId}
            onSelectCultivation={onSelectCultivation}
            onOpenWateringModal={onOpenWateringModal}
            onWateringAdded={onWateringAdded}
            onTaskCompletedFeedback={onTaskCompletedFeedback}
          />

          {/* 4. Curvas Climáticas Históricas (DashboardEnvironmentChart desplegable) */}
          {showFullClimateChart && (
            <div className="animate-in fade-in duration-200">
              <DashboardEnvironmentChart
                activeCultivations={activeCrops}
                envRecords={envRecords}
                onOpenEnvModal={onOpenEnvModal}
              />
            </div>
          )}

          {/* 9. Asistente Botánico: Preguntale a Cultiveta */}
          <div className="bg-white rounded-[32px] p-6 sm:p-8 border border-[#EFE3CF] shadow-xs relative overflow-hidden space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="p-3.5 rounded-2xl bg-[#6C45C7]/15 text-[#6C45C7]">
                  <Sparkles className="w-6 h-6 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-[#29202F]">
                    Preguntale a Cultiveta ✨
                  </h3>
                  <p className="text-xs text-[#6E5D77]">
                    Análisis botánico inteligente de tu cultivo, salud foliar y recomendaciones
                  </p>
                </div>
              </div>

              <button
                type="button"
                id="generate-summary-btn"
                onClick={handleGenerateWeeklySummary}
                disabled={loadingSummary}
                className="px-5 py-2.5 rounded-2xl bg-[#6C45C7] hover:bg-[#5835ab] text-white font-bold text-xs transition-colors shadow-md shadow-[#6C45C7]/20 cursor-pointer disabled:opacity-50 shrink-0"
              >
                {loadingSummary ? 'Consultando a Cultiveta...' : 'Generar Resumen Semanal'}
              </button>
            </div>

            {weeklySummary && (
              <div className="p-5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs sm:text-sm leading-relaxed text-[#29202F]">
                {weeklySummary}
              </div>
            )}
          </div>

          {/* 10. Listado de Cultivos en Curso */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-extrabold text-[#29202F] flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#62B95B]" />
                <span>Cultivos en Curso ({activeCrops.length})</span>
              </h2>

              <button
                type="button"
                onClick={onCreateCultivationClick}
                className="text-xs font-bold text-[#62B95B] hover:underline cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Sumar cultivo</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeCrops.map((crop) => (
                <CultivationCard
                  key={crop.id}
                  cultivation={crop}
                  latestWatering={
                    waterings
                      .filter((w) => w.cultivationId === crop.id)
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null
                  }
                  latestEnv={
                    envRecords
                      .filter((e) => e.cultivationId === crop.id)
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null
                  }
                  onClick={() => onSelectCultivation(crop)}
                  onQuickWater={() => onOpenWateringModal(crop)}
                  onQuickPhoto={() => onOpenPhotoModal(crop)}
                  onQuickAI={() => onOpenAIAssistant(crop)}
                  onQuickCalendar={onOpenCalendarModal ? () => onOpenCalendarModal(crop) : undefined}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
