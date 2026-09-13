import React from 'react';
import {
  Sprout,
  Calendar,
  Droplets,
  Thermometer,
  Sparkles,
  ChevronRight,
  Sun,
  Flame,
  Wind,
  Clock,
  Camera,
  AlertCircle,
} from 'lucide-react';
import { Cultivation, Watering, EnvironmentRecord } from '../../types';
import { cultivationService } from '../../services/cultivationService';
import { StatusPill } from '../common/StatusPill';

interface CultivationCardProps {
  cultivation: Cultivation;
  latestWatering?: Watering | null;
  latestEnv?: EnvironmentRecord | null;
  onClick?: () => void;
  onSelect?: (id: string) => void;
  onQuickWater?: (cultivation: Cultivation) => void;
  onQuickPhoto?: (cultivation: Cultivation) => void;
  onQuickAI?: (cultivation: Cultivation) => void;
  onQuickCalendar?: (cultivation: Cultivation) => void;
}

export const CultivationCard: React.FC<CultivationCardProps> = ({
  cultivation,
  latestWatering,
  latestEnv,
  onClick,
  onSelect,
  onQuickWater,
  onQuickPhoto,
  onQuickAI,
  onQuickCalendar,
}) => {
  const totalDays = cultivationService.calculateDays(cultivation.startDate);
  const stageDays = cultivationService.calculateStageDays(cultivation.stageStartDate);
  const floweringDays = cultivationService.calculateFloweringDays(cultivation.floweringStartDate);

  const health = cultivationService.computeHealthStatus(cultivation, latestWatering, latestEnv);

  // Calculate days since last watering
  const daysSinceWatering = React.useMemo(() => {
    if (!latestWatering?.date) return null;
    const dateStr = latestWatering.date;
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const waterDate = new Date(y, m, d);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diffMs = today.getTime() - waterDate.getTime();
      return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }
    const d = new Date(dateStr);
    const now = new Date();
    return Math.max(0, Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
  }, [latestWatering?.date]);

  // Watering Urgency Indicator (Verde / Naranja / Rojo) based on stage & recent history
  const wateringUrgency = React.useMemo(() => {
    if (cultivation.isFinished) {
      return {
        level: 'finished' as const,
        dotClass: 'bg-zinc-600',
        glowClass: '',
        badgeBg: 'bg-zinc-800 text-zinc-400 border-zinc-700',
        textClass: 'text-zinc-500',
        urgencyText: 'Finalizado',
        label: 'Cultivo completado / finalizado',
        pulse: false,
      };
    }

    const stageLower = (cultivation.currentStage || '').toLowerCase();
    const isFlower = stageLower.includes('flor') || stageLower.includes('madur');
    // Flowering/ripening: 2 days cycle; Vegetative/seedling: 3 days cycle
    const standardInterval = isFlower ? 2 : 3;

    // Without watering history
    if (daysSinceWatering === null) {
      if (totalDays >= 3) {
        return {
          level: 'red' as const,
          dotClass: 'bg-rose-500 dot-red',
          glowClass: 'shadow-[0_0_10px_rgba(244,63,94,0.7)]',
          badgeBg: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
          textClass: 'text-rose-400',
          urgencyText: 'Urgente',
          label: 'Riego urgente: sin registros recientes (>3 días)',
          pulse: true,
        };
      }
      return {
        level: 'orange' as const,
        dotClass: 'bg-amber-500 dot-orange',
        glowClass: 'shadow-[0_0_8px_rgba(245,158,11,0.6)]',
        badgeBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        textClass: 'text-amber-400',
        urgencyText: 'Atención',
        label: 'Primer riego pendiente de registrar',
        pulse: false,
      };
    }

    // Rojo (Urgente / Atrasado): > standard interval (e.g. >2 days in flora, >3 days in veg)
    if (daysSinceWatering > standardInterval) {
      return {
        level: 'red' as const,
        dotClass: 'bg-rose-500 dot-red',
        glowClass: 'shadow-[0_0_10px_rgba(244,63,94,0.7)]',
        badgeBg: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
        textClass: 'text-rose-400',
        urgencyText: 'Urgente',
        label: `Riego urgente atrasado: último riego hace ${daysSinceWatering} días`,
        pulse: true,
      };
    }

    // Naranja (Próximo / Atención): at standard interval boundary (e.g. 2 days in flora, 3 days in veg)
    if (daysSinceWatering === standardInterval) {
      return {
        level: 'orange' as const,
        dotClass: 'bg-amber-500 dot-orange',
        glowClass: 'shadow-[0_0_8px_rgba(245,158,11,0.6)]',
        badgeBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        textClass: 'text-amber-400',
        urgencyText: 'Próximo',
        label: `Riego próximo sugerido hoy o mañana (hace ${daysSinceWatering} días)`,
        pulse: false,
      };
    }

    // Verde (Al día / Óptimo): 0 days (today) or 1 day ago
    return {
      level: 'green' as const,
      dotClass: 'bg-emerald-500 dot-green',
      glowClass: 'shadow-[0_0_8px_rgba(16,185,129,0.6)]',
      badgeBg: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
      textClass: 'text-emerald-400',
      urgencyText: 'Al día',
      label: daysSinceWatering === 0 ? 'Riego al día (hidratado hoy)' : `Hidratación óptima (hace ${daysSinceWatering} día)`,
      pulse: false,
    };
  }, [cultivation.isFinished, cultivation.currentStage, daysSinceWatering, totalDays]);

  // Environment Urgency Evaluation (from latestEnv)
  const envUrgency = React.useMemo(() => {
    if (cultivation.isFinished || !latestEnv) {
      return {
        hasData: false,
        score: 0,
        level: 'none' as const,
        label: 'Sin registros ambientales recientes',
        tempAlert: false,
        humAlert: false,
      };
    }

    const temp = latestEnv.temperatureC;
    const hum = latestEnv.humidityPct;

    // Critical environmental conditions (< 16°C or > 32°C; humidity < 28% or > 80%)
    const tempCritical = temp !== undefined && (temp > 32 || temp < 16);
    const humCritical = hum !== undefined && (hum > 80 || hum < 28);

    // Warning conditions
    const tempWarning = temp !== undefined && ((temp >= 28 && temp <= 32) || (temp >= 16 && temp < 20));
    const humWarning = hum !== undefined && ((hum >= 72 && hum <= 80) || (hum >= 28 && hum < 38));

    if (tempCritical || humCritical) {
      const issues: string[] = [];
      if (tempCritical) issues.push(`Temp: ${temp}°C`);
      if (humCritical) issues.push(`Hum: ${hum}%`);
      return {
        hasData: true,
        score: 3,
        level: 'red' as const,
        label: `Ambiente crítico (${issues.join(', ')})`,
        tempAlert: tempCritical,
        humAlert: humCritical,
      };
    }

    if (tempWarning || humWarning) {
      const issues: string[] = [];
      if (tempWarning) issues.push(`Temp: ${temp}°C`);
      if (humWarning) issues.push(`Hum: ${hum}%`);
      return {
        hasData: true,
        score: 2,
        level: 'orange' as const,
        label: `Ambiente en alerta (${issues.join(', ')})`,
        tempAlert: tempWarning,
        humAlert: humWarning,
      };
    }

    return {
      hasData: true,
      score: 1,
      level: 'green' as const,
      label: `Ambiente óptimo (${temp !== undefined ? `${temp}°C` : ''}${temp !== undefined && hum !== undefined ? ', ' : ''}${hum !== undefined ? `${hum}%` : ''})`,
      tempAlert: false,
      humAlert: false,
    };
  }, [cultivation.isFinished, latestEnv]);

  // Combined Most Critical Metric between Watering and Environment
  const criticalMetric = React.useMemo(() => {
    if (cultivation.isFinished) {
      return {
        type: 'watering' as const,
        level: 'finished' as const,
        score: 0,
        icon: Droplets,
        dotClass: 'bg-zinc-700 text-zinc-400',
        glowClass: '',
        pulse: false,
        label: 'Cultivo finalizado',
        tooltip: 'Cultivo completado / finalizado',
      };
    }

    // Score watering urgency: 3 for red, 2 for orange, 1 for green
    let wateringScore = 1;
    if (wateringUrgency.level === 'red') wateringScore = 3;
    else if (wateringUrgency.level === 'orange') wateringScore = 2;

    const envScore = envUrgency.score;

    // Prioritize environment if its criticality score is strictly higher than watering score.
    // If scores are tied, watering takes natural precedence for crop hydration.
    const isEnvMostCritical = envScore > wateringScore;
    const maxScore = Math.max(wateringScore, envScore);
    const level = maxScore === 3 ? ('red' as const) : maxScore === 2 ? ('orange' as const) : ('green' as const);

    if (isEnvMostCritical) {
      return {
        type: 'env' as const,
        level,
        score: envScore,
        icon: Thermometer,
        dotClass:
          level === 'red'
            ? 'bg-rose-500 text-white dot-red'
            : level === 'orange'
            ? 'bg-amber-500 text-zinc-950 dot-orange'
            : 'bg-emerald-500 text-zinc-950 dot-green',
        glowClass:
          level === 'red'
            ? 'shadow-[0_0_12px_rgba(244,63,94,0.85)]'
            : level === 'orange'
            ? 'shadow-[0_0_10px_rgba(245,158,11,0.75)]'
            : 'shadow-[0_0_8px_rgba(16,185,129,0.7)]',
        pulse: level === 'red',
        label: envUrgency.label,
        tooltip: `Métrica más crítica: Ambiente — ${envUrgency.label}`,
      };
    }

    return {
      type: 'watering' as const,
      level,
      score: wateringScore,
      icon: Droplets,
      dotClass:
        level === 'red'
          ? 'bg-rose-500 text-white dot-red'
          : level === 'orange'
          ? 'bg-amber-500 text-zinc-950 dot-orange'
          : 'bg-emerald-500 text-zinc-950 dot-green',
      glowClass:
        level === 'red'
          ? 'shadow-[0_0_12px_rgba(244,63,94,0.85)]'
          : level === 'orange'
          ? 'shadow-[0_0_10px_rgba(245,158,11,0.75)]'
          : 'shadow-[0_0_8px_rgba(16,185,129,0.7)]',
      pulse: level === 'red',
      label: wateringUrgency.label,
      tooltip: `Métrica más crítica: Riego — ${wateringUrgency.label}`,
    };
  }, [cultivation.isFinished, wateringUrgency, envUrgency]);

  const isWateringPending = !cultivation.isFinished && (
    wateringUrgency.level === 'red' || wateringUrgency.level === 'orange'
  );

  const handleClick = () => {
    if (onClick) onClick();
    else if (onSelect) onSelect(cultivation.id);
  };

  return (
    <div
      id={`cultivation-card-${cultivation.id}`}
      onClick={handleClick}
      className={`cultivation-card group bg-[#0F0F0F] rounded-[32px] p-6 border transition-all duration-300 cursor-pointer flex flex-col justify-between relative overflow-hidden transform hover:scale-[1.02] will-change-transform ${
        criticalMetric.level === 'red'
          ? 'border-rose-500/50 hover:border-rose-400 hover:shadow-2xl hover:shadow-rose-950/20'
          : criticalMetric.level === 'orange'
          ? 'border-amber-500/40 hover:border-amber-400 hover:shadow-2xl hover:shadow-amber-950/20'
          : 'border-zinc-800 hover:border-emerald-500/40 hover:shadow-2xl hover:shadow-emerald-950/20'
      }`}
    >
      {/* Top Header */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative shrink-0">
              {cultivation.coverPhotoUrl ? (
                <img
                  src={cultivation.coverPhotoUrl}
                  alt={cultivation.name}
                  className="w-14 h-14 rounded-2xl object-cover border border-zinc-800 shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 text-emerald-400 flex items-center justify-center text-2xl shrink-0">
                  🌱
                </div>
              )}
              {/* Indicador circular dinámico con icono (gota para riego, termómetro para ambiente) según métrica más crítica */}
              <div
                id={`watering-urgency-dot-${cultivation.id}`}
                data-metric-type={criticalMetric.type}
                title={criticalMetric.tooltip}
                className="critical-metric-indicator absolute -top-1.5 -right-1.5 flex items-center justify-center z-10 cursor-help group/dot"
              >
                <span className="relative flex items-center justify-center">
                  {criticalMetric.pulse && (
                    <span
                      className={`absolute inline-flex h-full w-full rounded-full ${
                        criticalMetric.level === 'red' ? 'bg-rose-500' : 'bg-amber-500'
                      } opacity-75 animate-ping`}
                    />
                  )}
                  <span
                    className={`relative inline-flex items-center justify-center rounded-full w-5 h-5 sm:w-5.5 sm:h-5.5 ${criticalMetric.dotClass} border-2 border-[#0F0F0F] ${criticalMetric.glowClass} transition-transform duration-200 group-hover/dot:scale-110`}
                  >
                    <criticalMetric.icon className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[2.5]" />
                  </span>
                </span>
              </div>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-lg text-white group-hover:text-emerald-400 transition-colors line-clamp-1">
                {cultivation.name}
              </h3>
              <div className="text-xs text-zinc-400 font-medium line-clamp-1 mt-0.5 flex items-center gap-1.5">
                {cultivation.geneticsList && cultivation.geneticsList.length > 1 ? (
                  <>
                    <span className="text-emerald-400 font-semibold truncate">
                      {cultivation.geneticsList.map((g) => g.name || 's/d').join(', ')}
                    </span>
                    <span className="text-[10px] bg-emerald-950/70 text-emerald-300 border border-emerald-800/40 px-1.5 py-0.2 rounded font-medium shrink-0">
                      {cultivation.geneticsList.length} variedades
                    </span>
                  </>
                ) : (
                  <p className="truncate">
                    {cultivation.geneticsName || 'Genética sin especificar'}
                    {cultivation.seedBank ? ` · ${cultivation.seedBank}` : ''}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Badges: DEMO & Urgencia de Riego */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {cultivation.isDemo && (
              <span className="px-2.5 py-0.5 rounded-md bg-amber-500 text-black font-mono font-bold text-[10px] tracking-wider">
                DEMO
              </span>
            )}
            {!cultivation.isFinished && (
              <span
                id={`watering-urgency-badge-${cultivation.id}`}
                title={`Urgencia de próximo riego: ${wateringUrgency.label}`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${wateringUrgency.badgeBg}`}
              >
                <span className="relative flex h-2 w-2">
                  {wateringUrgency.pulse && (
                    <span className={`absolute inline-flex h-full w-full rounded-full ${wateringUrgency.dotClass} opacity-75 animate-ping`} />
                  )}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${wateringUrgency.dotClass} ${wateringUrgency.glowClass}`} />
                </span>
                <Droplets className="w-3 h-3" />
                <span>{wateringUrgency.urgencyText}</span>
              </span>
            )}
          </div>
        </div>

        {/* Stage & Days Badge row */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-white text-black shadow-xs">
            Día {totalDays}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-zinc-900 text-zinc-200 border border-zinc-800">
            {cultivation.currentStage} · Día {stageDays}
          </span>
          {floweringDays && cultivation.currentStage === 'Floración' && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
              🌸 Flora D{floweringDays}
            </span>
          )}
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-zinc-900 text-zinc-400 border border-zinc-800">
            {cultivation.type} · {cultivation.plantCount} {cultivation.plantCount === 1 ? 'planta' : 'plantas'}
          </span>
        </div>

        {/* Status & Latest Metrics Box */}
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 mb-5 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 font-medium">Estado Carpa:</span>
            <StatusPill status={health.status} />
          </div>

          <div className="flex items-center justify-between text-zinc-300">
            <span className="text-zinc-400 font-medium flex items-center gap-2">
              <span>Último riego:</span>
              {!cultivation.isFinished && (
                <span
                  id={`watering-urgency-tag-${cultivation.id}`}
                  title={`Urgencia de próximo riego: ${wateringUrgency.label}`}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border flex items-center gap-1.5 ${wateringUrgency.badgeBg}`}
                >
                  <span className="relative flex h-1.5 w-1.5">
                    {wateringUrgency.pulse && (
                      <span className={`absolute inline-flex h-full w-full rounded-full ${wateringUrgency.dotClass} opacity-75 animate-ping`} />
                    )}
                    <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${wateringUrgency.dotClass}`} />
                  </span>
                  <span>{wateringUrgency.urgencyText}</span>
                </span>
              )}
            </span>
            <span className={`font-mono ${wateringUrgency.textClass} font-bold`}>
              {daysSinceWatering === null
                ? 'Sin registrar'
                : daysSinceWatering === 0
                ? 'Hoy 💧'
                : `Hace ${daysSinceWatering} d`}
            </span>
          </div>

          {latestEnv && (
            <div className="flex items-center justify-between text-zinc-300">
              <span className="text-zinc-400 font-medium">Ambiente:</span>
              <span className="font-mono font-bold text-white">
                {latestEnv.temperatureC}°C · {latestEnv.humidityPct}% HR
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Quick actions bar */}
      <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-1">
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {onQuickWater && (
            <button
              type="button"
              onClick={() => onQuickWater(cultivation)}
              className={`p-2 rounded-xl border transition-all relative cursor-pointer ${
                wateringUrgency.level === 'red'
                  ? 'text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/40 shadow-sm shadow-rose-500/20'
                  : wateringUrgency.level === 'orange'
                  ? 'text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 shadow-sm shadow-amber-500/20'
                  : 'text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/20'
              }`}
              title={`Registrar riego (${wateringUrgency.label})`}
            >
              <Droplets className="w-4 h-4" />
              <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${wateringUrgency.dotClass} ${wateringUrgency.pulse ? 'animate-ping' : ''}`} />
              <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${wateringUrgency.dotClass} border border-[#0F0F0F]`} />
            </button>
          )}
          {onQuickPhoto && (
            <button
              type="button"
              onClick={() => onQuickPhoto(cultivation)}
              className="p-2 rounded-xl text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition-colors cursor-pointer"
              title="Subir foto"
            >
              <Camera className="w-4 h-4" />
            </button>
          )}
          {onQuickAI && (
            <button
              type="button"
              onClick={() => onQuickAI(cultivation)}
              className="p-2 rounded-xl text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 transition-colors cursor-pointer"
              title="Cultiveta IA"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          )}
          {onQuickCalendar && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickCalendar(cultivation);
              }}
              className="p-2 rounded-xl text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors cursor-pointer"
              title="Sincronizar Google Calendar"
            >
              <Calendar className="w-4 h-4" />
            </button>
          )}
        </div>

        <span className="text-xs font-semibold text-emerald-400 flex items-center group-hover:translate-x-1 transition-transform">
          Ver detalles
          <ChevronRight className="w-4 h-4 ml-0.5" />
        </span>
      </div>
    </div>
  );
};

