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
  ChevronRight,
  TrendingUp,
  Award,
  AlertCircle,
  Camera,
  Activity,
  Zap,
  Clock,
  FlaskConical,
  RefreshCw,
  AlertTriangle,
  Bean,
  Leaf,
  Flower2,
  Scissors,
} from 'lucide-react';
import { Cultivation, Watering, EnvironmentRecord, PhotoRecord } from '../../types';
import { CultivationCard } from '../cultivations/CultivationCard';
import { DashboardEnvironmentChart } from './DashboardEnvironmentChart';
import { UpcomingTaskWidget } from './UpcomingTaskWidget';
import {
  DashboardDateFilter,
  DateFilterState,
  normalizeDate,
  formatDateDisplay,
  getTodayString,
} from './DashboardDateFilter';
import { DashboardSkeleton } from './DashboardSkeleton';
import { aiService } from '../../services/aiService';
import { taskService } from '../../services/taskService';
import {
  getStagesForCultivation,
  calculateTimelineMetrics,
  getStageIcon,
  STAGE_PRESETS,
} from '../../utils/growthStageUtils';

interface DashboardOverviewProps {
  cultivations: Cultivation[];
  waterings: Watering[];
  envRecords: EnvironmentRecord[];
  photos: PhotoRecord[];
  userId?: string;
  isLoading?: boolean;
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
  if (lower.includes('preflor') || lower.includes('transic')) {
    return <Sparkles className={className} />;
  }
  if (lower.includes('flor')) {
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
  if (lower.includes('preflor') || lower.includes('transic')) return 'Prefloración y estiramiento';
  if (lower.includes('flor')) return 'Floración y formación de cogollos';
  if (lower.includes('madur') || lower.includes('lavad')) return 'Maduración de resina y lavado';
  if (lower.includes('cosech') || lower.includes('corte')) return 'Corte y cosecha final';
  return stageName;
};

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  cultivations,
  waterings,
  envRecords,
  photos,
  userId,
  isLoading = false,
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
  const [internalSimulateLoading, setInternalSimulateLoading] = useState(false);
  const [tasksVersion, setTasksVersion] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);

  // Detect scroll to trigger text-glow & light gradient on selected dashboard h1
  React.useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      setIsScrolled(scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Listen for local task update events to ensure real-time reactive border contrasts
  React.useEffect(() => {
    const handleTaskUpdated = () => {
      setTasksVersion((v) => v + 1);
    };
    window.addEventListener('cultiveta_task_updated', handleTaskUpdated);
    return () => {
      window.removeEventListener('cultiveta_task_updated', handleTaskUpdated);
    };
  }, []);

  const showSkeleton = Boolean(isLoading || internalSimulateLoading);

  const handleManualRefresh = () => {
    if (onRefreshData) {
      onRefreshData();
    } else {
      setInternalSimulateLoading(true);
      setTimeout(() => setInternalSimulateLoading(false), 1500);
    }
  };

  // Top Date Range / Single Day Filter State
  const [dateFilter, setDateFilter] = useState<DateFilterState>({
    preset: 'all',
    startDate: '',
    endDate: '',
  });

  const isDateFilterActive = dateFilter.preset !== 'all';

  // Filtered Waterings according to date range
  const filteredWaterings = useMemo(() => {
    if (!isDateFilterActive) return waterings;
    return waterings.filter((w) => {
      const d = normalizeDate(w.date);
      if (dateFilter.startDate && d < dateFilter.startDate) return false;
      if (dateFilter.endDate && d > dateFilter.endDate) return false;
      return true;
    });
  }, [waterings, isDateFilterActive, dateFilter.startDate, dateFilter.endDate]);

  // Filtered Environment Records according to date range
  const filteredEnvRecords = useMemo(() => {
    if (!isDateFilterActive) return envRecords;
    return envRecords.filter((e) => {
      const d = normalizeDate(e.date);
      if (dateFilter.startDate && d < dateFilter.startDate) return false;
      if (dateFilter.endDate && d > dateFilter.endDate) return false;
      return true;
    });
  }, [envRecords, isDateFilterActive, dateFilter.startDate, dateFilter.endDate]);

  // Filtered Photos according to date range
  const filteredPhotos = useMemo(() => {
    if (!isDateFilterActive) return photos;
    return photos.filter((p) => {
      const d = normalizeDate(p.date);
      if (dateFilter.startDate && d < dateFilter.startDate) return false;
      if (dateFilter.endDate && d > dateFilter.endDate) return false;
      return true;
    });
  }, [photos, isDateFilterActive, dateFilter.startDate, dateFilter.endDate]);

  const totalFilteredEvents = filteredWaterings.length + filteredEnvRecords.length + filteredPhotos.length;

  const activeCrops = cultivations.filter((c) => !c.isFinished);
  const totalPlants = activeCrops.reduce((acc, c) => acc + (c.plantCount || 1), 0);

  // Active Cultivations Lifecycle Progress metrics:
  // Calculates average elapsed days vs projected days across all active crops
  const activeLifecycleStats = useMemo(() => {
    if (activeCrops.length === 0) {
      return {
        hasActive: false,
        totalActive: 0,
        avgElapsedDays: 0,
        avgProjectedDays: 0,
        totalProgressPct: 0,
        cropsDetails: [] as Array<{
          crop: Cultivation;
          id: string;
          name: string;
          stage: string;
          elapsedDays: number;
          projectedDays: number;
          progressPct: number;
        }>,
      };
    }

    let sumElapsed = 0;
    let sumProjected = 0;

    const details = activeCrops.map((crop) => {
      const stages = getStagesForCultivation(crop);
      const metrics = calculateTimelineMetrics(crop, stages);
      sumElapsed += metrics.totalElapsedDays;
      sumProjected += metrics.totalCycleDays;
      return {
        crop,
        id: crop.id,
        name: crop.name,
        stage: crop.currentStage,
        elapsedDays: metrics.totalElapsedDays,
        projectedDays: metrics.totalCycleDays,
        progressPct: metrics.overallProgressPct,
      };
    });

    const avgElapsed = Math.round(sumElapsed / activeCrops.length);
    const avgProjected = Math.round(sumProjected / activeCrops.length);
    const totalProgressPct = avgProjected > 0
      ? Math.min(100, Math.max(0, Math.round((sumElapsed / sumProjected) * 100)))
      : 0;

    return {
      hasActive: true,
      totalActive: activeCrops.length,
      avgElapsedDays: avgElapsed,
      avgProjectedDays: avgProjected,
      totalProgressPct,
      cropsDetails: details,
    };
  }, [activeCrops]);

  // Smooth filling animation for progress counter when dashboard loads
  const [animatedProgressPct, setAnimatedProgressPct] = useState(0);

  useEffect(() => {
    const target = activeLifecycleStats.totalProgressPct;
    if (target === 0) {
      setAnimatedProgressPct(0);
      return;
    }

    let startTimestamp: number | null = null;
    const duration = 1200; // ms to match smooth bar fill
    let animFrameId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / duration, 1);
      // Smooth cubic ease-out curve
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setAnimatedProgressPct(Math.round(easeOut * target));

      if (progress < 1) {
        animFrameId = requestAnimationFrame(step);
      }
    };

    const timeoutId = setTimeout(() => {
      animFrameId = requestAnimationFrame(step);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if (animFrameId) cancelAnimationFrame(animFrameId);
    };
  }, [activeLifecycleStats.totalProgressPct]);

  // Stage Milestones calculation for the lifecycle progress bar:
  // Computes exact milestone positions (percentage of total duration), icons, and stage details
  const stageMilestones = useMemo(() => {
    let lifecycleStages: Array<{
      id?: string;
      name: string;
      expectedDurationDays: number;
    }> = [];

    if (activeCrops.length > 0) {
      const fullStages = getStagesForCultivation(activeCrops[0]);
      let harvestIdx = fullStages.findIndex(
        (s) => s.name === 'Cosecha' || s.name === 'Secado' || s.name === 'Finalizado'
      );
      if (harvestIdx === -1) harvestIdx = fullStages.length - 1;
      lifecycleStages = fullStages.slice(0, harvestIdx + 1).map((s) => ({
        id: s.id,
        name: s.name,
        expectedDurationDays: s.expectedDurationDays || 1,
      }));
    } else {
      const preset = STAGE_PRESETS[0];
      let harvestIdx = preset.stages.findIndex(
        (s) => s.name === 'Cosecha' || s.name === 'Secado' || s.name === 'Finalizado'
      );
      if (harvestIdx === -1) harvestIdx = preset.stages.length - 1;
      lifecycleStages = preset.stages.slice(0, harvestIdx + 1).map((s, idx) => ({
        id: `preset_stage_${idx}`,
        name: s.name,
        expectedDurationDays: s.expectedDurationDays || 1,
      }));
    }

    const totalCycleDays = lifecycleStages.reduce(
      (acc, s) => acc + (s.expectedDurationDays || 0),
      0
    ) || 90;

    let cumulativeDays = 0;
    const currentProgress = activeLifecycleStats.totalProgressPct;
    const activeStageName = (activeCrops[0]?.currentStage || '').toLowerCase();

    const milestones = lifecycleStages.map((st, idx) => {
      const duration = st.expectedDurationDays || 1;
      const startDay = cumulativeDays;
      const pct = Math.min(100, Math.max(0, Math.round((startDay / totalCycleDays) * 100)));
      const isReached = currentProgress >= pct;
      const isCurrent =
        activeStageName.length > 0 &&
        (activeStageName.includes(st.name.toLowerCase()) ||
          st.name.toLowerCase().includes(activeStageName));

      const lower = st.name.toLowerCase();
      let shortName = st.name;
      if (lower.includes('vege')) shortName = 'Vegetación';
      else if (lower.includes('germin')) shortName = 'Germ.';
      else if (lower.includes('plánt')) shortName = 'Plántula';
      else if (lower.includes('flor')) shortName = 'Floración';
      else if (lower.includes('madur')) shortName = 'Maduración';
      else if (lower.includes('cosech')) shortName = 'Cosecha';

      const isKeyMilestone =
        idx === 0 ||
        idx === lifecycleStages.length - 1 ||
        lower.includes('vege') ||
        lower.includes('flor') ||
        lower.includes('cosech');

      cumulativeDays += duration;

      return {
        id: st.id || `milestone_${idx}`,
        name: st.name,
        shortName,
        icon: getStageIcon(st.name),
        startDay,
        durationDays: duration,
        percent: pct,
        isReached,
        isCurrent,
        isKeyMilestone,
      };
    });

    return {
      milestones,
      totalCycleDays,
    };
  }, [activeCrops, activeLifecycleStats.totalProgressPct]);

  const getLatestWateringForCrop = (cropId: string): Watering | null => {
    const list = isDateFilterActive ? filteredWaterings : waterings;
    return (
      list
        .filter((w) => w.cultivationId === cropId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null
    );
  };

  const getLatestEnvForCrop = (cropId: string): EnvironmentRecord | null => {
    const list = isDateFilterActive ? filteredEnvRecords : envRecords;
    return (
      list
        .filter((e) => e.cultivationId === cropId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null
    );
  };

  // Waterings in last 7 days for summary prompt
  const now = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(now.getDate() - 7);
  const recentWateringsCount = waterings.filter((w) => new Date(w.date) >= sevenDaysAgo).length;

  // Environmental summary in active period
  const envAverages = useMemo(() => {
    if (filteredEnvRecords.length === 0) return null;
    const avgTemp = (
      filteredEnvRecords.reduce((acc, r) => acc + (r.temperatureC || 0), 0) / filteredEnvRecords.length
    ).toFixed(1);
    const avgHum = Math.round(
      filteredEnvRecords.reduce((acc, r) => acc + (r.humidityPct || 0), 0) / filteredEnvRecords.length
    );
    return { avgTemp, avgHum };
  }, [filteredEnvRecords]);

  const handleGenerateWeeklySummary = async () => {
    try {
      setLoadingSummary(true);
      const summary = await aiService.getWeeklySummary({
        cultivations: activeCrops.map((c) => ({
          name: c.name,
          stage: c.currentStage,
          genetics: c.geneticsName,
        })),
        wateringsCount: isDateFilterActive ? filteredWaterings.length : recentWateringsCount,
        recentEnvAvg: {
          tempC: envAverages ? parseFloat(envAverages.avgTemp) : 24.2,
          humidityPct: envAverages ? envAverages.avgHum : 56,
        },
      });
      setWeeklySummary(summary);
    } catch (err) {
      console.error('Error generating weekly summary', err);
      setWeeklySummary('Resumen agronómico: Tus cultivos se encuentran con parámetros estables. Mantén el monitoreo de humedad en floración.');
    } finally {
      setLoadingSummary(false);
    }
  };

  // Dynamic subtitle for range
  const getFilterSubtitle = (singular: string, plural: string) => {
    if (!isDateFilterActive) return plural;
    if (dateFilter.preset === 'today') return 'Registrados hoy';
    if (dateFilter.preset === 'single') return `En ${formatDateDisplay(dateFilter.startDate)}`;
    return 'En período filtrado';
  };

  // 1. Critical Stage Detection:
  // Detect active cultivations in critical phenological phases (Floración, Maduración, Cosecha, Secado, Prefloración, Germinación)
  // or marked with attention needed in health status
  const criticalStageKeywords = [
    'floración',
    'floracion',
    'maduración',
    'maduracion',
    'cosecha',
    'secado',
    'prefloración',
    'prefloracion',
    'germinación',
    'germinacion',
  ];

  const cropsInCriticalStage = useMemo(() => {
    return activeCrops.filter((crop) => {
      const stageLower = (crop.currentStage || '').toLowerCase();
      const isCriticalStageName = criticalStageKeywords.some((kw) => stageLower.includes(kw));
      const isAlertStatus = crop.status === 'ATENCION' || crop.status === 'REVISAR';
      return isCriticalStageName || isAlertStatus;
    });
  }, [activeCrops]);

  const hasCriticalStage = cropsInCriticalStage.length > 0;

  // 2. Overdue Watering Task Detection (> 24 hours pending):
  // Evaluates both taskService tasks (urgency overdue / past due date) and cultivation watering histories
  const cropsWithOverdueWatering = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const tasks = taskService.getTasksForDashboard(cultivations, waterings, envRecords, userId || '');
    const overdueCropIds = new Set<string>();

    tasks.forEach((t) => {
      if (t.type === 'watering' && !t.isCompleted) {
        if (t.urgency === 'overdue') {
          overdueCropIds.add(t.cultivationId);
        } else if (t.dueDate && t.dueDate < todayStr) {
          overdueCropIds.add(t.cultivationId);
        }
      }
    });

    const nowTime = new Date().getTime();
    activeCrops.forEach((crop) => {
      const cropWaterings = waterings
        .filter((w) => w.cultivationId === crop.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const latest = cropWaterings[0];
      const stageLower = (crop.currentStage || '').toLowerCase();
      const intervalDays = stageLower.includes('flor') ? 2 : 3;
      const thresholdHours = (intervalDays + 1) * 24; // scheduled interval + 24 hours overdue grace

      if (!latest) {
        const cropAgeHours = (nowTime - new Date(crop.startDate).getTime()) / (1000 * 60 * 60);
        if (cropAgeHours >= 24) {
          overdueCropIds.add(crop.id);
        }
      } else {
        const hoursSinceLast = (nowTime - new Date(latest.date).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLast >= thresholdHours) {
          overdueCropIds.add(crop.id);
        }
      }
    });

    return activeCrops.filter((c) => overdueCropIds.has(c.id));
  }, [cultivations, activeCrops, waterings, envRecords, userId, tasksVersion]);

  const hasOverdueWatering = cropsWithOverdueWatering.length > 0;
  const hasAlertCondition = hasCriticalStage || hasOverdueWatering;

  const summaryCards = [
    {
      id: 'stat-active-crops',
      label: 'Cultivos Activos',
      value: activeCrops.length,
      subtitle: hasCriticalStage
        ? `${cropsInCriticalStage.length} en etapa crítica (${cropsInCriticalStage.map((c) => c.currentStage).slice(0, 2).join(', ')})`
        : 'En seguimiento diario',
      icon: <Sprout className="w-4 h-4" />,
      iconStyle: hasCriticalStage
        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      valueColor: hasCriticalStage ? 'text-amber-300' : 'text-white',
      borderClass: hasCriticalStage
        ? 'summary-card-critical-border border-2 border-amber-400/90 shadow-[0_0_24px_-2px_rgba(251,191,36,0.3)]'
        : hasAlertCondition
        ? 'summary-card-elevated-contrast border border-zinc-700/80 hover:border-zinc-500'
        : 'border border-zinc-800 hover:border-zinc-700',
      alertBadge: hasCriticalStage ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-[10px] font-mono text-amber-300 font-bold uppercase tracking-wider">
          <Sparkles className="w-3 h-3 text-amber-400" />
          Fase Crítica
        </span>
      ) : null,
    },
    {
      id: 'stat-total-plants',
      label: 'Total Plantas',
      value: totalPlants,
      subtitle: 'Iluminación controlada',
      icon: <Layers className="w-4 h-4" />,
      iconStyle: 'bg-zinc-800 text-zinc-300 border-zinc-700',
      valueColor: 'text-white',
      borderClass: hasAlertCondition
        ? 'summary-card-elevated-contrast border border-zinc-700/80 hover:border-zinc-500'
        : 'border border-zinc-800 hover:border-zinc-700',
      alertBadge: null,
    },
    {
      id: 'stat-recent-waterings',
      label: isDateFilterActive ? 'Riegos (Período)' : 'Riegos (7 días)',
      value: isDateFilterActive ? filteredWaterings.length : recentWateringsCount,
      subtitle: hasOverdueWatering
        ? `⚠️ ${cropsWithOverdueWatering.length} cultivo(s) atrasados +24h`
        : getFilterSubtitle('Riego en fecha', 'Eventos nutricionales'),
      icon: <Droplets className="w-4 h-4" />,
      iconStyle: hasOverdueWatering
        ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
        : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      valueColor: hasOverdueWatering ? 'text-rose-400' : 'text-cyan-400',
      borderClass: hasOverdueWatering
        ? 'summary-card-overdue-border border-2 border-rose-500/90 shadow-[0_0_24px_-2px_rgba(244,63,94,0.35)]'
        : hasAlertCondition
        ? 'summary-card-elevated-contrast border border-zinc-700/80 hover:border-zinc-500'
        : 'border border-zinc-800 hover:border-zinc-700',
      alertBadge: hasOverdueWatering ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/50 text-[10px] font-mono text-rose-300 font-bold uppercase tracking-wider animate-pulse">
          <AlertTriangle className="w-3 h-3 text-rose-400" />
          Riego +24h
        </span>
      ) : null,
    },
    {
      id: 'stat-diary-photos',
      label: isDateFilterActive ? 'Fotos (Período)' : 'Fotos Bitácora',
      value: isDateFilterActive ? filteredPhotos.length : photos.length,
      subtitle: getFilterSubtitle('Foto en fecha', 'Historial cronológico'),
      icon: <Camera className="w-4 h-4" />,
      iconStyle: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      valueColor: 'text-white',
      borderClass: hasAlertCondition
        ? 'summary-card-elevated-contrast border border-zinc-700/80 hover:border-zinc-500'
        : 'border border-zinc-800 hover:border-zinc-700',
      alertBadge: null,
    },
  ];

  return (
    <div id="dashboard-overview" className="space-y-6 sm:space-y-8 dashboard-overview">
      {/* Top Bento Hero Banner */}
      <div className="relative overflow-hidden bg-[#0F0F0F] rounded-[32px] p-6 sm:p-8 lg:p-10 border border-zinc-800 shadow-2xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_0%_0%,#10b981_0%,transparent_60%)] pointer-events-none"></div>
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] font-mono font-bold uppercase tracking-[0.25em] text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Panel de Control Botánico
            </div>
            <h1
              id="dashboard-hero-title"
              className={`text-2xl sm:text-4xl font-extrabold tracking-tight transition-all duration-700 ease-out select-none dashboard-hero-h1 cursor-default inline-flex items-center gap-2.5 sm:gap-3 flex-wrap ${
                isScrolled
                  ? 'dashboard-h1-scrolled text-transparent bg-clip-text bg-gradient-to-r from-white via-emerald-200 to-emerald-400 drop-shadow-[0_0_18px_rgba(52,211,153,0.45)]'
                  : 'text-white'
              }`}
            >
              <span>Bienvenido a Cultiveta</span>
              <span
                id="dashboard-hero-plant-icon"
                className="dashboard-plant-icon inline-flex items-center justify-center p-1 sm:p-1.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/25 transition-all duration-500 ease-out"
                title="Cultiveta Botánica"
              >
                <Sprout className="w-6 h-6 sm:w-8 sm:h-8 stroke-[2.2] text-emerald-500 transition-colors duration-500" />
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-xl leading-relaxed">
              Monitoreo continuo de parámetros agronómicos, riegos con pH/EC, fotoperiodo y salud de tus plantas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              id="refresh-dashboard-btn"
              onClick={handleManualRefresh}
              disabled={showSkeleton}
              className="px-4 py-3 rounded-2xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
              title="Recargar datos de Firestore (Skeleton Loading)"
            >
              <RefreshCw className={`w-4 h-4 ${showSkeleton ? 'animate-spin text-emerald-400' : 'text-zinc-400'}`} />
              <span className="hidden sm:inline">{showSkeleton ? 'Cargando...' : 'Sincronizar'}</span>
            </button>

            <button
              type="button"
              id="quick-ai-btn"
              onClick={onOpenAIAssistant}
              className="px-5 py-3 rounded-2xl bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-500/30 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-violet-950/20"
            >
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span>Consultar IA</span>
            </button>

            <button
              type="button"
              id="create-crop-hero-btn"
              onClick={onCreateCultivationClick}
              className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-black stroke-[2.5]" />
              <span>Nuevo Cultivo</span>
            </button>
          </div>
        </div>
      </div>

      {/* Active Cultivations Lifecycle Progress Bar */}
      <div
        id="dashboard-lifecycle-progress"
        className="dashboard-lifecycle-progress bg-[#0F0F0F] rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-zinc-800 shadow-xl relative overflow-hidden transition-all duration-300"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs sm:text-sm font-bold text-white tracking-tight">
                  Ciclo de Vida de Cultivos Activos
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-zinc-900 text-emerald-400 border border-emerald-500/25">
                  {activeLifecycleStats.totalActive} {activeLifecycleStats.totalActive === 1 ? 'activo' : 'activos'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {activeLifecycleStats.hasActive ? (
                  <>
                    Promedio de{' '}
                    <span className="text-zinc-200 font-mono font-semibold">{activeLifecycleStats.avgElapsedDays} días</span> transcurridos de{' '}
                    <span className="text-zinc-200 font-mono font-semibold">{activeLifecycleStats.avgProjectedDays} días</span> proyectados
                  </>
                ) : (
                  'No hay cultivos activos en curso para calcular el ciclo de vida'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-baseline gap-1.5 self-end sm:self-auto shrink-0">
            <span className="text-xs text-zinc-400 font-medium">Completado:</span>
            <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400 tracking-tight">
              {animatedProgressPct}%
            </span>
          </div>
        </div>

        {/* Progress Track and Bar */}
        <div className="relative w-full h-7 sm:h-8 bg-zinc-900/90 rounded-full p-0.5 border border-zinc-800 shadow-inner group/track">
          {/* Inner clip container for progress fill */}
          <div className="absolute inset-0 rounded-full overflow-hidden">
            <motion.div
              id="lifecycle-progress-fill"
              className="h-full rounded-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-teal-300 relative shadow-[0_0_14px_rgba(52,211,153,0.45)]"
              initial={{ width: '0%' }}
              animate={{ width: `${Math.max(activeLifecycleStats.hasActive ? 2 : 0, activeLifecycleStats.totalProgressPct)}%` }}
              transition={{
                duration: 1.2,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.1,
              }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full pointer-events-none" />
            </motion.div>
          </div>

          {/* Interactive Milestone Botanical Markers positioned inside the bar */}
          <div className="absolute inset-0 pointer-events-none">
            {stageMilestones.milestones.map((m) => {
              const isStart = m.percent <= 2;
              const isEnd = m.percent >= 97;
              const leftStyle = isStart
                ? '6px'
                : isEnd
                ? 'calc(100% - 6px)'
                : `${m.percent}%`;
              const transformStyle = isStart
                ? 'translateY(-50%)'
                : isEnd
                ? 'translate(-100%, -50%)'
                : 'translate(-50%, -50%)';

              return (
                <div
                  key={`node-${m.id}`}
                  style={{
                    left: leftStyle,
                    top: '50%',
                    transform: transformStyle,
                  }}
                  className={`absolute z-20 pointer-events-auto flex items-center justify-center cursor-pointer group/milestone ${
                    m.isKeyMilestone ? 'flex' : 'hidden sm:flex'
                  }`}
                  title={`${m.name} (${m.percent}% del ciclo)`}
                >
                  {/* Milestone Icon Chip inside bar */}
                  <div
                    className={`w-5.5 h-5.5 sm:w-6.5 sm:h-6.5 rounded-full flex items-center justify-center transition-all duration-300 select-none shadow-md ${
                      m.isCurrent
                        ? 'bg-emerald-400 text-zinc-950 ring-2 ring-emerald-300 ring-offset-1 ring-offset-zinc-950 font-bold scale-110 shadow-[0_0_12px_rgba(52,211,153,0.8)]'
                        : m.isReached
                        ? 'bg-emerald-950/95 text-emerald-300 border border-emerald-400/60 hover:scale-125 hover:border-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.35)]'
                        : 'bg-zinc-850/90 text-zinc-400 border border-zinc-700/80 hover:scale-125 hover:text-zinc-200 hover:border-zinc-500'
                    }`}
                  >
                    {renderStageMilestoneIcon(m.name, 'w-3 h-3 sm:w-3.5 sm:h-3.5')}
                  </div>

                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover/milestone:opacity-100 pointer-events-none transition-all duration-200 z-40 whitespace-nowrap">
                    <div className="bg-zinc-950 text-white text-[11px] py-1.5 px-2.5 rounded-xl border border-zinc-700 shadow-xl flex flex-col items-center">
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className="text-emerald-400">{renderStageMilestoneIcon(m.name, 'w-3.5 h-3.5')}</span>
                        <span className="text-zinc-100">{m.name}</span>
                        <span className="text-emerald-400 font-mono text-[10px] font-extrabold">({m.percent}%)</span>
                      </div>
                      <span className="text-[10px] text-zinc-300 mt-0.5">
                        {getStageMilestoneDescription(m.name)}
                      </span>
                      <span className="text-[10px] text-zinc-500">
                        {m.percent === 0 ? 'Día 0 • Inicio' : `Día ${m.startDay} • Duración: ~${m.durationDays}d`}
                      </span>
                      {m.isCurrent && (
                        <span className="mt-1 px-1.5 py-0.2 rounded-md bg-emerald-500/25 text-emerald-300 text-[9px] font-bold border border-emerald-500/40">
                          Etapa en curso
                        </span>
                      )}
                      <div className="w-1.5 h-1.5 bg-zinc-950 border-b border-r border-zinc-700 transform rotate-45 -mb-1 mt-0.5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Milestone Stage Labels / Ruler below the bar */}
        <div className="mt-2.5 flex items-center justify-between text-[10px] sm:text-[11px] text-zinc-400 px-1 select-none">
          {stageMilestones.milestones
            .filter((m) => m.isKeyMilestone)
            .map((m) => (
              <div
                key={`legend-${m.id}`}
                className={`flex items-center gap-1.5 transition-colors ${
                  m.isCurrent
                    ? 'text-emerald-400 font-bold'
                    : m.isReached
                    ? 'text-zinc-300 font-medium'
                    : 'text-zinc-500'
                }`}
              >
                <span className={m.isCurrent ? 'text-emerald-400' : m.isReached ? 'text-emerald-300' : 'text-zinc-500'}>
                  {renderStageMilestoneIcon(m.name, 'w-3 h-3')}
                </span>
                <span className="hidden sm:inline">{m.shortName}</span>
                <span className="font-mono text-[9px] text-zinc-500">({m.percent}%)</span>
              </div>
            ))}
        </div>

        {/* Breakdown chips for active cultivations */}
        {activeLifecycleStats.cropsDetails.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-zinc-800/60 flex items-center gap-2 overflow-x-auto no-scrollbar text-[11px]">
            <span className="shrink-0 text-zinc-500 font-medium text-[10px] uppercase tracking-wider">Desglose:</span>
            {activeLifecycleStats.cropsDetails.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectCultivation(c.crop)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900/80 border border-zinc-800/90 shrink-0 hover:border-emerald-500/40 hover:bg-zinc-850 transition-all cursor-pointer text-left group"
                title={`${c.name} (${c.stage}): ${c.elapsedDays} días transcurridos / ${c.projectedDays} días proyectados (${c.progressPct}% completado) - Clic para ver detalles`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 group-hover:scale-125 transition-transform" />
                <span className="text-zinc-300 group-hover:text-white font-medium">{c.name}</span>
                <span className="text-zinc-500 font-mono text-[10px]">{c.elapsedDays}/{c.projectedDays}d</span>
                <span className="text-emerald-400 font-mono font-bold text-[10px]">({c.progressPct}%)</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {showSkeleton ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* Top Date Range / Single Day Filter Selector */}
      <DashboardDateFilter
        filter={dateFilter}
        onChangeFilter={setDateFilter}
        wateringsCount={filteredWaterings.length}
        envCount={filteredEnvRecords.length}
        photosCount={filteredPhotos.length}
        totalRecordsCount={totalFilteredEvents}
      />

      {/* Dynamic Next Watering / Critical Task Widget */}
      <UpcomingTaskWidget
        cultivations={cultivations}
        waterings={filteredWaterings}
        envRecords={filteredEnvRecords}
        userId={userId}
        onSelectCultivation={onSelectCultivation}
        onOpenWateringModal={onOpenWateringModal}
        onWateringAdded={onWateringAdded}
        onTaskCompletedFeedback={onTaskCompletedFeedback}
      />

      {/* Bento Stats Matrix with Progressive Fade-In-Up Animation & Dynamic Contrast Borders */}
      <div className="space-y-3">
        {hasAlertCondition && (
          <div
            id="summary-cards-alert-bar"
            className="p-3.5 sm:p-4 rounded-2xl bg-zinc-900/90 border border-amber-500/30 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs animate-fade-in-up"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <span className="font-semibold text-zinc-200">
                  Modo de Contraste Agronómico Activado:
                </span>{' '}
                <span className="text-zinc-300">
                  {hasOverdueWatering && (
                    <span className="text-rose-400 font-medium">
                      {cropsWithOverdueWatering.length} cultivo{cropsWithOverdueWatering.length > 1 ? 's' : ''} con riego pendiente desde hace más de 24h ({cropsWithOverdueWatering.map((c) => c.name).join(', ')})
                    </span>
                  )}
                  {hasOverdueWatering && hasCriticalStage && <span className="text-zinc-500"> • </span>}
                  {hasCriticalStage && (
                    <span className="text-amber-300 font-medium">
                      {cropsInCriticalStage.length} cultivo{cropsInCriticalStage.length > 1 ? 's' : ''} en etapa crítica ({cropsInCriticalStage.map((c) => `${c.name} [${c.currentStage}]`).join(', ')})
                    </span>
                  )}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 font-mono text-[10px] text-zinc-400 bg-zinc-950/70 px-2.5 py-1 rounded-full border border-zinc-800">
              <span className={`w-2 h-2 rounded-full ${hasOverdueWatering ? 'bg-rose-500' : 'bg-amber-400'} animate-ping`}></span>
              <span className="font-bold tracking-wider uppercase">BORDES DE ALTO CONTRASTE</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryCards.map((stat, idx) => (
            <div
              key={stat.id}
              id={stat.id}
              style={{
                animationDelay: `${idx * 100}ms`,
              }}
              className={`animate-fade-in-up bg-[#0F0F0F] rounded-[28px] p-5 sm:p-6 transition-all relative overflow-hidden flex flex-col justify-between ${stat.borderClass}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-500">
                  {stat.label}
                </span>
                <div className={`p-2 rounded-xl border ${stat.iconStyle}`}>
                  {stat.icon}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className={`text-3xl sm:text-4xl font-mono font-bold ${stat.valueColor}`}>
                    {stat.value}
                  </div>
                  {stat.alertBadge}
                </div>
                <span className="text-[11px] text-zinc-400">{stat.subtitle}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtered Environmental Micro-Averages Pill when records exist */}
      {isDateFilterActive && envAverages && (
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-zinc-300">
            <Thermometer className="w-4 h-4 text-emerald-400" />
            <span>
              Promedios ambientales registrados en el período:{' '}
              <strong className="text-white font-mono">{envAverages.avgTemp} °C</strong> temp |{' '}
              <strong className="text-white font-mono">{envAverages.avgHum}%</strong> humedad relativa
            </span>
          </div>
          <span className="text-[11px] text-zinc-500 font-mono">
            {filteredEnvRecords.length} muestra{filteredEnvRecords.length === 1 ? '' : 's'} tomadas
          </span>
        </div>
      )}

      {/* Environmental Progress Historical Line Chart (recharts) */}
      <DashboardEnvironmentChart
        activeCultivations={activeCrops}
        envRecords={filteredEnvRecords}
        onOpenEnvModal={onOpenEnvModal}
      />

      {/* Filtered Events Drawer / Activity Log when Date Filter is Active */}
      {isDateFilterActive && (
        <div id="filtered-events-section" className="bg-[#0F0F0F] rounded-[28px] p-5 sm:p-6 border border-zinc-800 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800/80">
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-emerald-400 block mb-0.5">
                Inspección Temporal de Eventos
              </span>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Eventos en la Fecha ({totalFilteredEvents})
              </h3>
            </div>
            <span className="text-xs text-zinc-400 font-mono">
              {dateFilter.startDate === dateFilter.endDate
                ? formatDateDisplay(dateFilter.startDate)
                : `${formatDateDisplay(dateFilter.startDate)} — ${formatDateDisplay(dateFilter.endDate)}`}
            </span>
          </div>

          {totalFilteredEvents === 0 ? (
            <div className="text-center py-8 px-4 bg-zinc-900/40 rounded-2xl border border-zinc-800/50 space-y-1">
              <Clock className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-zinc-300">No hay registros de riegos, mediciones o fotos en este período.</p>
              <p className="text-xs text-zinc-500">
                Selecciona otra fecha en el filtro superior o añade un registro rápido con el botón (+).
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Filtered Waterings */}
              {filteredWaterings.map((w) => {
                const crop = cultivations.find((c) => c.id === w.cultivationId);
                return (
                  <div
                    key={w.id}
                    className="p-3.5 rounded-2xl bg-zinc-900/80 border border-cyan-500/20 hover:border-cyan-500/40 transition-colors flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-white truncate">{crop?.name || 'Cultivo'}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                          Riego
                        </span>
                      </div>
                      <div className="text-xs text-zinc-300 space-y-1">
                        <div>
                          Volumen: <span className="font-mono text-cyan-300 font-bold">{w.volumeLiters} L</span>
                        </div>
                        {(w.phIn !== undefined || w.ecIn !== undefined) && (
                          <div className="text-[11px] text-zinc-400 font-mono">
                            {w.phIn !== undefined && `pH: ${w.phIn}`} {w.ecIn !== undefined && `| EC: ${w.ecIn} mS`}
                          </div>
                        )}
                        {w.observations && (
                          <div className="text-[11px] text-zinc-400 italic line-clamp-1">"{w.observations}"</div>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-3 font-mono pt-2 border-t border-zinc-800/80">
                      {formatDateDisplay(w.date)} {w.time || ''}
                    </div>
                  </div>
                );
              })}

              {/* Filtered Env Records */}
              {filteredEnvRecords.map((e) => {
                const crop = cultivations.find((c) => c.id === e.cultivationId);
                return (
                  <div
                    key={e.id}
                    className="p-3.5 rounded-2xl bg-zinc-900/80 border border-amber-500/20 hover:border-amber-500/40 transition-colors flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-white truncate">{crop?.name || 'Ambiente'}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          Ambiente
                        </span>
                      </div>
                      <div className="text-xs text-zinc-300 space-y-1">
                        <div>
                          Temp: <span className="font-mono text-amber-300 font-bold">{e.temperatureC}°C</span> | Hum:{' '}
                          <span className="font-mono text-amber-300 font-bold">{e.humidityPct}%</span>
                        </div>
                        {e.vpdKPa !== undefined && (
                          <div className="text-[11px] text-zinc-400 font-mono">VPD: {e.vpdKPa} kPa</div>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-3 font-mono pt-2 border-t border-zinc-800/80">
                      {formatDateDisplay(e.date)} {e.time || ''}
                    </div>
                  </div>
                );
              })}

              {/* Filtered Photos */}
              {filteredPhotos.map((p) => {
                const crop = cultivations.find((c) => c.id === p.cultivationId);
                return (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-2xl bg-zinc-900/80 border border-blue-500/20 hover:border-blue-500/40 transition-colors flex items-center gap-3"
                  >
                    <img
                      src={p.photoUrl}
                      alt="Foto bitácora"
                      className="w-14 h-14 rounded-xl object-cover bg-zinc-800 border border-zinc-700 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-bold text-white truncate">{crop?.name || 'Foto'}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          Foto
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate capitalize">{p.category || 'Bitácora'}</div>
                      <div className="text-[10px] text-zinc-500 font-mono mt-1">{formatDateDisplay(p.date)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bento AI Agronomic Assistant Box */}
      <div className="bg-[#0F0F0F] text-white rounded-[32px] p-6 sm:p-8 border border-zinc-800 relative overflow-hidden space-y-4 shadow-xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_100%_0%,#8b5cf6_0%,transparent_60%)] pointer-events-none"></div>

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3.5 rounded-2xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-violet-400 block mb-0.5">Gemini 2.5 Intelligence</span>
              <h3 className="font-bold text-base sm:text-lg text-white">Resumen Agronómico Semanal</h3>
              <p className="text-xs text-zinc-400">
                Análisis predictivo de salud, VPD y recomendaciones de riego
              </p>
            </div>
          </div>

          <button
            type="button"
            id="generate-summary-btn"
            onClick={handleGenerateWeeklySummary}
            disabled={loadingSummary}
            className="px-5 py-2.5 rounded-2xl bg-white hover:bg-zinc-200 text-black font-bold text-xs transition-colors shadow-md cursor-pointer disabled:opacity-50 shrink-0"
          >
            {loadingSummary ? 'Generando análisis...' : 'Generar Resumen'}
          </button>
        </div>

        {weeklySummary && (
          <div className="relative z-10 p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-xs sm:text-sm leading-relaxed text-zinc-200">
            {weeklySummary}
          </div>
        )}
      </div>

      {/* Active Crops Bento Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
            Cultivos en Curso ({activeCrops.length})
          </h2>
        </div>

        {activeCrops.length === 0 ? (
          <div className="bg-[#0F0F0F] rounded-[32px] p-12 border border-zinc-800 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 text-emerald-400 flex items-center justify-center mx-auto">
              <Sprout className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">No tienes cultivos activos</h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-1">
                Comienza registrando tu primera carpa o carga datos de demostración para explorar la plataforma.
              </p>
            </div>
            <button
              type="button"
              onClick={onCreateCultivationClick}
              className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all shadow-lg shadow-emerald-500/20 cursor-pointer inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              Crear Nuevo Cultivo
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeCrops.map((crop) => (
              <CultivationCard
                key={crop.id}
                cultivation={crop}
                latestWatering={getLatestWateringForCrop(crop.id)}
                latestEnv={getLatestEnvForCrop(crop.id)}
                onClick={() => onSelectCultivation(crop)}
                onQuickWater={() => onOpenWateringModal(crop)}
                onQuickPhoto={() => onOpenPhotoModal(crop)}
                onQuickAI={() => onOpenAIAssistant(crop)}
                onQuickCalendar={onOpenCalendarModal ? () => onOpenCalendarModal(crop) : undefined}
              />
            ))}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
};

