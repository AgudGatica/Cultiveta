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
    return getOverdueCultivations(cultivations, waterings, new Date(), (crop) =>
      calculateIrrigationForecast(crop, waterings, envRecords)
    );
  }, [cultivations, waterings, envRecords, isWateringAlertsEnabled]);

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

  // Lista para "¿Hay algo que requiere atención?": reúne alertas ya calculadas arriba (sin reglas nuevas).
  const attentionItems = useMemo(() => {
    const items: Array<{ id: string; text: string }> = [];
    if (primaryCrop && primaryCropOverdueInfo) {
      items.push({
        id: `overdue-${primaryCrop.id}`,
        text: `${primaryCrop.name}: riego atrasado (+${primaryCropOverdueInfo.analysis.daysOverdue} d).`,
      });
    }
    if (primaryCrop && !envCondition.isGood && envCondition.alertMsg) {
      items.push({ id: `env-${primaryCrop.id}`, text: `${primaryCrop.name}: ${envCondition.alertMsg}` });
    }
    overdueCultivationsList
      .filter((o) => !primaryCrop || o.cultivation.id !== primaryCrop.id)
      .forEach((o) => {
        items.push({
          id: `overdue-${o.cultivation.id}`,
          text: `${o.cultivation.name}: riego atrasado (+${o.analysis.daysOverdue} d).`,
        });
      });
    return items;
  }, [primaryCrop, primaryCropOverdueInfo, envCondition, overdueCultivationsList]);

  // Quick tasks for today
  const todayTasksList = useMemo(() => {
    const list: Array<{ id: string; text: string; action: () => void; isUrgent?: boolean }> = [];
    if (!primaryCrop) return list;

    if (primaryCropOverdueInfo) {
      list.push({
        id: 'task-water',
        text: `Revisá el riego (+${primaryCropOverdueInfo.analysis.daysOverdue} d)`,
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
        text: 'Sacá la foto semanal de seguimiento',
        action: () => onOpenPhotoModal(primaryCrop),
      });
    }

    if (list.length === 0) {
      list.push({
        id: 'task-check',
        text: 'Revisá parámetros y salud general',
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

  // Presentación del pronóstico: solo formatea la salida de calculateIrrigationForecast (no calcula nada nuevo).
  const forecastDisplay = useMemo(() => {
    if (!primaryCropIrrigationForecast) return null;
    const f = primaryCropIrrigationForecast;

    const startPart = f.wateringWindowStart ? f.wateringWindowStart.split('T')[0] : '';
    const endPart = f.wateringWindowEnd ? f.wateringWindowEnd.split('T')[0] : '';
    const startTime = f.wateringWindowStart && f.wateringWindowStart.includes('T') ? f.wateringWindowStart.split('T')[1] : '';
    const endTime = f.wateringWindowEnd && f.wateringWindowEnd.includes('T') ? f.wateringWindowEnd.split('T')[1] : '';

    let windowText: string | null = null;
    if (startPart && endPart) {
      windowText = startPart === endPart
        ? `${formatFriendlyDate(startPart)}${startTime ? `, de ${startTime} a ${endTime} hs` : ''}`
        : `Entre ${formatFriendlyDate(startPart)}${startTime ? ` ${startTime} hs` : ''} y ${formatFriendlyDate(endPart)}${endTime ? ` ${endTime} hs` : ''}`;
    }

    const confidenceLabel = f.confidence === 'high' ? 'Alta' : f.confidence === 'medium' ? 'Media' : 'Baja';

    let hint: string | null = null;
    if (f.confidence === 'low') {
      hint = f.lastWateringAt
        ? 'Anotá algunos riegos más para personalizar la ventana.'
        : 'Anotá un primer riego para que el pronóstico empiece a aprender.';
    }

    return {
      windowText,
      confidenceLabel,
      hint,
      missingSignals: f.missingSignals,
      factors: f.factors,
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
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {greetingData.timeGreeting}, {greetingData.firstName}
          </h1>
        </div>

        {/* Botones de acción directos */}
        <div className="flex items-center gap-2.5 self-stretch sm:self-auto shrink-0 flex-wrap">
          {onRefreshData && (
            <button
              type="button"
              id="refresh-dashboard-btn"
              onClick={onRefreshData}
              disabled={isSyncing}
              className="min-h-11 min-w-11 p-3 rounded-2xl bg-white hover:bg-track border border-chip-line text-ink-muted hover:text-ink transition-all cursor-pointer shadow-xs disabled:opacity-50 flex items-center justify-center"
              title="Sincronizar datos"
              aria-label="Sincronizar datos"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-ok-ink' : ''}`} />
            </button>
          )}

          <button
            type="button"
            id="quick-ai-btn"
            onClick={() => onOpenAIAssistant(primaryCrop || undefined)}
            className="flex-1 sm:flex-initial min-h-11 px-4 py-3 rounded-2xl bg-white hover:bg-surface text-brand border border-chip-line text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <Sparkles className="w-4 h-4" />
            <span>Preguntale a Cultiveta</span>
          </button>

          <button
            type="button"
            id="create-crop-hero-btn"
            onClick={onCreateCultivationClick}
            className="flex-1 sm:flex-initial min-h-11 px-4 py-3 rounded-2xl bg-primary hover:brightness-95 text-ink text-xs font-bold transition-all shadow-md shadow-primary/20 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
            <span>Nuevo cultivo</span>
          </button>
        </div>
      </div>

      {/* Sync Error Banner if any */}
      {syncError && (
        <div className="p-3.5 rounded-2xl bg-coral/10 border border-coral/30 text-ink text-xs flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-error shrink-0" />
            <span>{syncError}</span>
          </div>
          {onRefreshData && (
            <button
              type="button"
              onClick={onRefreshData}
              disabled={isSyncing}
              className="px-3 py-1.5 rounded-xl bg-coral hover:bg-[#d96551] text-white font-bold cursor-pointer text-xs transition-colors shrink-0 disabled:opacity-50"
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
            <div className="cultiveta-card p-8 sm:p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-icon-bg text-brand flex items-center justify-center mx-auto">
                <Sprout className="w-8 h-8" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-extrabold text-ink text-lg">Todavía no anotaste ningún cultivo</h2>
                <p className="text-sm text-ink-muted max-w-sm mx-auto mt-1">
                  Creá tu primera carpa o planta para empezar a anotar riegos, ambiente y fotos.
                </p>
              </div>
              <button
                type="button"
                onClick={onCreateCultivationClick}
                className="min-h-11 px-6 py-3 rounded-2xl bg-primary hover:brightness-95 text-ink font-bold text-sm transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
                Creá tu primer cultivo
              </button>
            </div>
          ) : (
            primaryCrop && (
              <>
              {/* Bloque 1: ¿Cómo está mi cultivo? */}
              <section
                id="main-crop-hero-card"
                aria-labelledby="home-block-status-title"
                className="cultiveta-card p-6 sm:p-8 relative overflow-hidden space-y-6"
              >
                <h2 id="home-block-status-title" className="text-lg font-extrabold text-ink">
                  ¿Cómo está mi cultivo?
                </h2>
                {/* 4 Mini-Stats en la parte superior izquierda, antes del selector Cultivos */}
                <div className="grid grid-cols-2 sm:flex sm:flex-row sm:items-center gap-2">
                  <div
                    id="stat-active-crops"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-track/70 border border-chip-line"
                  >
                    <div className="p-1.5 rounded-xl bg-ok/15 text-ok-ink shrink-0">
                      <Sprout className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-lg sm:text-xl font-black text-ink leading-none block">
                        {activeCrops.length}
                      </span>
                      <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block mt-0.5">
                        Cultivos
                      </span>
                    </div>
                  </div>

                  <div
                    id="stat-total-plants"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-track/70 border border-chip-line"
                  >
                    <div className="p-1.5 rounded-xl bg-track text-ink shrink-0">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-lg sm:text-xl font-black text-ink leading-none block">
                        {totalPlants}
                      </span>
                      <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block mt-0.5">
                        Plantas
                      </span>
                    </div>
                  </div>

                  <div
                    id="stat-recent-waterings"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-track/70 border border-chip-line"
                  >
                    <div className="p-1.5 rounded-xl bg-brand/15 text-brand shrink-0">
                      <Droplets className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-lg sm:text-xl font-black text-brand leading-none block">
                        {recentWateringsCount}
                      </span>
                      <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block mt-0.5">
                        Riegos (7d)
                      </span>
                    </div>
                  </div>

                  <div
                    id="stat-diary-photos"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-track/70 border border-chip-line"
                  >
                    <div className="p-1.5 rounded-xl bg-warn-line/25 text-ink shrink-0">
                      <Camera className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-lg sm:text-xl font-black text-ink leading-none block">
                        {photos.length}
                      </span>
                      <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block mt-0.5">
                        Fotos
                      </span>
                    </div>
                  </div>
                </div>

                {/* Selector rápido entre carpas activas (si hay más de 1) */}
                {activeCrops.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1" role="group" aria-label="Elegí el cultivo">
                    <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wider shrink-0 mr-1">
                      Cultivos:
                    </span>
                    {activeCrops.map((crop) => (
                      <button
                        key={crop.id}
                        type="button"
                        onClick={() => setSelectedCropId(crop.id)}
                        aria-pressed={crop.id === primaryCrop.id}
                        className={`min-h-11 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 border ${
                          crop.id === primaryCrop.id
                            ? 'bg-brand-deep text-white border-brand-deep shadow-xs'
                            : 'bg-white text-ink-muted border-chip-line hover:bg-surface'
                        }`}
                      >
                        {crop.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Cabecera del Cultivo: Nombre, Día, Etapa */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-line">
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">
                      <button
                        type="button"
                        onClick={() => onSelectCultivation(primaryCrop)}
                        className="min-h-11 inline-flex items-center gap-2 hover:text-brand transition-colors cursor-pointer rounded-xl text-left"
                        title="Ver detalle del cultivo"
                      >
                        <span>{primaryCrop.name}</span>
                        <ChevronRight className="w-5 h-5 text-ink-muted" aria-hidden="true" />
                      </button>
                    </h3>
                    {/* Metadatos sin cajas píldora */}
                    <div className="flex items-center gap-2 text-xs text-ink-muted mt-1 flex-wrap">
                      {primaryCropTimeline?.schedule.isCycleStartKnown ? (
                        <>
                          <span className="font-bold text-ink">Día {primaryCropDays}</span>
                          <span aria-hidden="true" className="text-line">·</span>
                          <span className="font-semibold text-brand">{primaryCrop.currentStage || 'Vegetativo'}</span>
                        </>
                      ) : (
                        <span className="font-bold text-ink">
                          Día {primaryCropTimeline?.schedule.activeStageElapsedDays || 1} de {primaryCrop.currentStage || primaryCropTimeline?.schedule.activeStage?.name || 'Floración'}
                        </span>
                      )}
                      {primaryCrop.geneticsName && (
                        <>
                          <span aria-hidden="true" className="text-line">·</span>
                          <span>{primaryCrop.geneticsName}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Estado global comprensible en 3 segundos (el detalle está en "¿Hay algo que requiere atención?") */}
                  <div
                    className={`px-4 py-2.5 rounded-2xl flex items-center gap-3 shrink-0 border ${
                      cropOverallState.isAlert ? 'bg-warn-bg border-warn-line' : 'bg-ok-bg border-ok-line'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`w-3 h-3 rounded-full shrink-0 ${cropOverallState.isAlert ? 'bg-warn-line' : 'bg-ok'}`}
                    />
                    <span
                      className={`text-sm font-extrabold leading-tight ${
                        cropOverallState.isAlert ? 'text-warn-ink' : 'text-ok-ink'
                      }`}
                    >
                      {cropOverallState.title}
                    </span>
                  </div>
                </div>

                {/* Ambiente y último riego */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Columna 2: Ambiente (Progressive Disclosure) */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-chip-line flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                          Ambiente
                        </span>
                        <Thermometer className="w-4 h-4 text-error" />
                      </div>

                      <div className="space-y-1">
                        <span
                          className={`text-sm font-extrabold block ${
                            envCondition.isGood ? 'text-ok-ink' : 'text-error'
                          }`}
                        >
                          &quot;{envCondition.label}&quot;
                        </span>
                        <span className="text-lg font-black text-ink block">
                          {envCondition.shortDesc}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-chip-line">
                      <button
                        type="button"
                        onClick={() => setShowEnvDetails((prev) => !prev)}
                        className="w-full min-h-11 py-2 px-2.5 rounded-xl bg-white hover:bg-track border border-chip-line text-brand font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
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
                  <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-chip-line flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                          Último Riego
                        </span>
                        <Droplets className="w-4 h-4 text-ok-ink" />
                      </div>

                      <div className="space-y-1">
                        <span className="text-sm font-extrabold text-ink block">
                          {wateringTimeAgo}
                        </span>
                        <span className="text-lg font-black text-ink block">
                          {latestWateringForPrimary
                            ? `${latestWateringForPrimary.volumeLiters || 1.5} L`
                            : 'Anotá tu primer riego'}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-chip-line">
                      <button
                        type="button"
                        onClick={() => setShowWateringDetails((prev) => !prev)}
                        className="w-full min-h-11 py-2 px-2.5 rounded-xl bg-white hover:bg-track border border-chip-line text-brand font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
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
                  <div className="p-5 rounded-2xl bg-surface border border-chip-line space-y-4 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between pb-2 border-b border-chip-line">
                      <h4 className="text-sm font-extrabold text-ink">
                        Parámetros Ambientales Detallados
                      </h4>
                      <button
                        type="button"
                        onClick={() => onOpenEnvModal(primaryCrop)}
                        className="min-h-11 inline-flex items-center text-xs font-bold text-brand hover:underline cursor-pointer"
                      >
                        + Medir ahora
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-white border border-chip-line">
                        <span className="text-[10px] text-ink-muted block">Temperatura</span>
                        <span className="text-base font-black text-ink block mt-0.5">
                          {latestEnvForPrimary?.temperature ?? latestEnvForPrimary?.temperatureC ?? '--'} °C
                        </span>
                        <span className="text-[10px] text-ink-muted block mt-0.5">Óptimo: 20-27 °C</span>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-chip-line">
                        <span className="text-[10px] text-ink-muted block">Humedad Relativa</span>
                        <span className="text-base font-black text-ink block mt-0.5">
                          {latestEnvForPrimary?.humidity ?? latestEnvForPrimary?.humidityPct ?? '--'} %
                        </span>
                        <span className="text-[10px] text-ink-muted block mt-0.5">Óptimo: 45-65 %</span>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-chip-line">
                        <span className="text-[10px] text-ink-muted block">VPD Estimado</span>
                        <span className="text-base font-black text-brand block mt-0.5">
                          {latestEnvForPrimary?.vpdKPa ?? latestEnvForPrimary?.vpd ?? '--'} kPa
                        </span>
                        <span className="text-[10px] text-ink-muted block mt-0.5">Déficit de presión</span>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-chip-line">
                        <span className="text-[10px] text-ink-muted block">Luz / PPFD</span>
                        <span className="text-base font-black text-ink block mt-0.5">
                          {latestEnvForPrimary?.ppfdUmols ?? '--'} µmol
                        </span>
                        <span className="text-[10px] text-ink-muted block mt-0.5">Intensidad lumínica</span>
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => setShowFullClimateChart((prev) => !prev)}
                        className="min-h-11 text-xs font-bold text-brand hover:underline cursor-pointer inline-flex items-center gap-1"
                      >
                        <span>{showFullClimateChart ? 'Ocultar gráfico climático' : 'Ver curvas y gráficos completos'}</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Detalles Expandidos de Último Riego */}
                {showWateringDetails && (
                  <div className="p-5 rounded-2xl bg-surface border border-chip-line space-y-4 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between pb-2 border-b border-chip-line">
                      <h4 className="text-sm font-extrabold text-ink">
                        Detalle del Último Riego
                      </h4>
                      <button
                        type="button"
                        onClick={() => onOpenWateringModal(primaryCrop)}
                        className="min-h-11 inline-flex items-center text-xs font-bold text-ok-ink hover:underline cursor-pointer"
                      >
                        + Nuevo riego
                      </button>
                    </div>

                    {latestWateringForPrimary ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-white border border-chip-line">
                          <span className="text-[10px] text-ink-muted block">Volumen</span>
                          <span className="text-base font-black text-ink block mt-0.5">
                            {latestWateringForPrimary.volumeLiters} L
                          </span>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-chip-line">
                          <span className="text-[10px] text-ink-muted block">pH Entrada</span>
                          <span className="text-base font-black text-brand block mt-0.5">
                            {latestWateringForPrimary.phIn || 's/d'}
                          </span>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-chip-line">
                          <span className="text-[10px] text-ink-muted block">EC Entrada</span>
                          <span className="text-base font-black text-ok-ink block mt-0.5">
                            {latestWateringForPrimary.ecIn ? `${latestWateringForPrimary.ecIn} mS` : 's/d'}
                          </span>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-chip-line">
                          <span className="text-[10px] text-ink-muted block">Fertilizantes</span>
                          <span className="text-xs font-semibold text-ink block mt-0.5 truncate">
                            {latestWateringForPrimary.products && latestWateringForPrimary.products.length > 0
                              ? latestWateringForPrimary.products.map((p) => p.productName).join(', ')
                              : 'Solo agua regulada'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-ink-muted">
                        Aún no anotaste ningún riego para este cultivo. Tocá &quot;+ Nuevo riego&quot; para registrar el primero.
                      </p>
                    )}
                  </div>
                )}

                {/* 4ta Capa: Ciclo del Cultivo del primaryCrop seleccionado */}
                {primaryCropTimeline && (
                  <div id="crop-lifecycle-card-section" className="pt-5 border-t border-chip-line space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-extrabold text-ink">
                          Ciclo del cultivo
                        </h3>
                        {primaryCropTimeline.progressPct !== null ? (
                          <span className="text-xs font-bold text-ok-ink">
                            {primaryCropTimeline.progressPct}% del ciclo estimado
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-brand">
                            Inicio de ciclo no registrado
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        {primaryCropTimeline.elapsedDays !== null && primaryCropTimeline.totalCycleDays !== null ? (
                          <span className="text-xs text-ink-muted font-semibold">
                            Día {primaryCropTimeline.elapsedDays} de ~{primaryCropTimeline.totalCycleDays}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-muted font-semibold">
                            Día {primaryCropTimeline.activeStageElapsedDays} en {primaryCropTimeline.currentStageName}
                          </span>
                        )}
                        <button
                          type="button"
                          id="toggle-lifecycle-details-btn"
                          onClick={() => setShowLifecycleDetails((prev) => !prev)}
                          className="min-h-11 text-xs font-bold text-brand hover:underline cursor-pointer flex items-center gap-1"
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
                    <div className="relative w-full h-3 bg-track rounded-full overflow-hidden">
                      <motion.div
                        key={`cycle-progress-bar-${primaryCrop.id}`}
                        id="cycle-progress-bar-fill"
                        className="h-full cultiveta-stage-progress rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${primaryCropTimeline.roadmapProgressPct}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>

                    {/* Hitos botánicos principales: Siembra, Vegetativo, Floración, Cosecha */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-semibold text-ink-muted pt-1 px-0.5">
                      <div className="text-left">
                        <span className="block font-bold text-ink">Siembra</span>
                        <span className="text-[10px] text-ink-muted block mt-0.5">
                          {primaryCropTimeline.isCycleStartKnown ? primaryCropTimeline.startDateFormatted : 'Sin fecha registrada'}
                        </span>
                      </div>
                      <div className="text-left sm:text-center">
                        <span className="block font-bold text-ink">Vegetativo</span>
                        {primaryCropTimeline.vegeDates && (
                          <span className="text-[10px] text-ink-muted block mt-0.5 truncate">
                            {primaryCropTimeline.vegeDates}
                          </span>
                        )}
                      </div>
                      <div className="text-left sm:text-center">
                        <span className="block font-bold text-ink">Floración</span>
                        {primaryCropTimeline.floraDates && (
                          <span className="text-[10px] text-ink-muted block mt-0.5 truncate">
                            {primaryCropTimeline.floraDates}
                          </span>
                        )}
                      </div>
                      <div className="text-left sm:text-right">
                        <span className="block font-bold text-ink">Cosecha</span>
                        <span className="text-[10px] text-ink-muted block mt-0.5">
                          {primaryCropTimeline.harvestDate}
                        </span>
                      </div>
                    </div>

                    {/* Progressive disclosure: Desglose detallado de etapas configuradas para primaryCrop */}
                    {showLifecycleDetails && (
                      <div id="crop-lifecycle-stage-breakdown" className="pt-3 border-t border-chip-line grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs animate-in fade-in duration-200">
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
                                  ? 'bg-ok/10 border-ok/40 text-ink font-bold shadow-2xs'
                                  : m.isReached
                                  ? 'bg-track border-chip-line text-ink'
                                  : 'bg-white border-chip-line text-ink-muted'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] text-ink-muted uppercase tracking-wider block">
                                  {tag}
                                </span>
                                {m.isCurrent && (
                                  <span className="w-2 h-2 rounded-full bg-ok animate-pulse" title="Etapa actual" />
                                )}
                              </div>
                              <span className="block font-bold truncate">{m.name}</span>
                              <span className="text-[10px] text-ink-muted block mt-0.5">
                                {dateText}
                              </span>
                              <span className="text-[10px] text-ink-muted block mt-0.5">
                                {m.durationDays} días
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Bloque 2: ¿Qué tengo que hacer hoy? */}
<section aria-labelledby="home-block-today-title" className="space-y-4">
                <div className="cultiveta-card p-6 sm:p-8 space-y-5">
                  <h2 id="home-block-today-title" className="text-lg font-extrabold text-ink">
                    ¿Qué tengo que hacer hoy?
                  </h2>

                  <ul className="space-y-2">
                    {todayTasksList.map((task) => (
                      <li
                        key={task.id}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm font-semibold ${
                          task.isUrgent ? 'bg-warn-bg border-warn-line text-warn-ink' : 'bg-surface border-line text-ink'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`w-2 h-2 rounded-full shrink-0 ${task.isUrgent ? 'bg-warn-line' : 'bg-ok'}`}
                        />
                        <span className="flex-1">{task.text}</span>
                      </li>
                    ))}
                  </ul>

                  {forecastDisplay && (
                    <div id="home-irrigation-forecast" className="rounded-2xl bg-brand-deep text-white p-5 space-y-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <span className="text-xs font-bold uppercase tracking-wider text-brand-soft flex items-center gap-1.5">
                          <Droplets className="w-4 h-4" aria-hidden="true" />
                          Ventana para revisar la maceta
                        </span>
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/10 text-brand-softer">
                          Confianza: {forecastDisplay.confidenceLabel}
                        </span>
                      </div>

                      <p className="text-lg font-extrabold leading-snug">
                        {forecastDisplay.windowText ?? 'Todavía no hay una ventana estimada'}
                      </p>

                      {forecastDisplay.hint && (
                        <p className="text-sm text-brand-soft">{forecastDisplay.hint}</p>
                      )}

                      {forecastDisplay.missingSignals.length > 0 && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-brand-soft">Falta medir</p>
                          <ul className="mt-1.5 space-y-1 text-sm text-brand-softer list-disc pl-5">
                            {forecastDisplay.missingSignals.map((signal) => (
                              <li key={signal}>{signal}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {forecastDisplay.factors.length > 0 && (
                        <div>
                          <button
                            type="button"
                            onClick={() => setShowWhyForecast((prev) => !prev)}
                            aria-expanded={showWhyForecast}
                            className="min-h-11 inline-flex items-center gap-1 text-sm font-bold text-accent hover:underline cursor-pointer"
                          >
                            {showWhyForecast ? 'Ocultar el porqué' : '¿Por qué esta ventana?'}
                            <ChevronDown
                              aria-hidden="true"
                              className={`w-4 h-4 transition-transform ${showWhyForecast ? 'rotate-180' : ''}`}
                            />
                          </button>
                          {showWhyForecast && (
                            <ul className="mt-1 space-y-1 text-sm text-brand-softer list-disc pl-5">
                              {forecastDisplay.factors.map((factor, i) => (
                                <li key={i}>{factor}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => onOpenWateringModal(primaryCrop)}
                      className="min-h-11 py-2.5 px-3 rounded-2xl bg-primary hover:brightness-95 text-ink font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Droplets className="w-4 h-4" aria-hidden="true" />
                      <span>Anotá un riego</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenPhotoModal(primaryCrop)}
                      className="min-h-11 py-2.5 px-3 rounded-2xl bg-white hover:bg-surface border border-chip-line text-ink font-bold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Camera className="w-4 h-4 text-brand" aria-hidden="true" />
                      <span>Sacá una foto</span>
                    </button>
                  </div>
                </div>

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
              </section>

              {/* Bloque 3: ¿Hay algo que requiere atención? */}
<section
                id="home-attention-block"
                aria-labelledby="home-block-attention-title"
                className="cultiveta-card p-6 sm:p-8 space-y-4"
              >
                <h2 id="home-block-attention-title" className="text-lg font-extrabold text-ink">
                  ¿Hay algo que requiere atención?
                </h2>
                {attentionItems.length === 0 ? (
                  <p className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-ok-bg border border-ok-line text-ok-ink text-sm font-semibold">
                    <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                    No hay nada urgente para revisar.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {attentionItems.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start gap-2 px-4 py-3 rounded-2xl bg-warn-bg border border-warn-line text-warn-ink text-sm font-semibold"
                      >
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              </>
            )
          )}

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
          <div className="cultiveta-card p-6 sm:p-8 relative overflow-hidden space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="p-3.5 rounded-2xl bg-icon-bg text-brand">
                  <Sparkles className="w-6 h-6 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-ink">
                    Preguntale a Cultiveta
                  </h3>
                  <p className="text-xs text-ink-muted">
                    Análisis botánico inteligente de tu cultivo, salud foliar y recomendaciones
                  </p>
                </div>
              </div>

              <button
                type="button"
                id="generate-summary-btn"
                onClick={handleGenerateWeeklySummary}
                disabled={loadingSummary}
                className="min-h-11 px-5 py-2.5 rounded-2xl bg-primary hover:brightness-95 text-ink font-bold text-sm transition-all cursor-pointer disabled:opacity-50 shrink-0"
              >
                {loadingSummary ? 'Consultando a Cultiveta...' : 'Generá el resumen semanal'}
              </button>
            </div>

            {weeklySummary && (
              <div className="p-5 rounded-2xl bg-surface border border-chip-line text-xs sm:text-sm leading-relaxed text-ink">
                {weeklySummary}
              </div>
            )}
          </div>

          {/* 10. Listado de Cultivos en Curso */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full bg-logo-dot" />
                <span>Cultivos en Curso ({activeCrops.length})</span>
              </h2>

              <button
                type="button"
                onClick={onCreateCultivationClick}
                className="min-h-11 text-sm font-bold text-white hover:underline cursor-pointer flex items-center gap-1"
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
