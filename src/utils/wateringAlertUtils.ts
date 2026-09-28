import { Cultivation, Watering } from '../types';

export interface WateringAlertAnalysis {
  cultivationId: string;
  cultivationName: string;
  currentStage: string;
  recommendedIntervalDays: number;
  latestWateringDate: string | null;
  daysSinceWatering: number | null;
  isFinished: boolean;
  isOverdue: boolean;
  isDueToday: boolean;
  isUpcoming: boolean;
  isOptimal: boolean;
  daysOverdue: number;
  urgencyLevel: 'critical' | 'warning' | 'optimal' | 'finished';
  badgeText: string;
  dotClass: string;
  glowClass: string;
  badgeBg: string;
  textClass: string;
  pulse: boolean;
  label: string;
  alertTitle: string;
  alertMessage: string;
  notificationMessage: string;
}

/**
 * Retorna el intervalo recomendado de riego (en días) según la etapa fenológica del cultivo.
 * - Germinación / Plántula: 3 días (riego medido, sin asfixiar la raíz inicial)
 * - Vegetativo: 3 días (ciclo seco-húmedo óptimo para expansión radicular)
 * - Prefloración / Floración: 2 días (máxima tasa transpiratoria y demanda de agua/nutrientes)
 * - Maduración / Lavado: 2 días
 * - Cosechado / Secado / Curado: 0 días (no requiere riego)
 */
export function getRecommendedWateringIntervalDays(stage?: string): number {
  if (!stage) return 3;
  const s = stage.toLowerCase().trim();

  if (
    s.includes('cosech') ||
    s.includes('secad') ||
    s.includes('curad') ||
    s.includes('finaliz')
  ) {
    return 0;
  }

  // Etapas de alta demanda hídrica (Floración, Prefloración, Engorde)
  if (
    s.includes('flor') ||
    s.includes('preflor') ||
    s.includes('engorde') ||
    s.includes('stretch')
  ) {
    return 2;
  }

  // Maduración / Lavado
  if (s.includes('madur') || s.includes('lavad') || s.includes('flush')) {
    return 2;
  }

  // Germinación y Plántula
  if (s.includes('germin') || s.includes('semill') || s.includes('plánt') || s.includes('plant')) {
    return 3;
  }

  // Vegetativo y crecimiento
  if (s.includes('vege') || s.includes('crecim')) {
    return 3;
  }

  // Valor por defecto estándar en sustrato orgánico / inerte
  return 3;
}

/**
 * Analiza la fecha del último riego frente al período recomendado para la etapa actual del cultivo.
 * Si supera dicho período recomendado, marca el estado como 'Overdue'.
 */
export function analyzeWateringUrgency(
  cultivation: Cultivation,
  latestWatering: Watering | null,
  currentDate: Date = new Date()
): WateringAlertAnalysis {
  const isFinished =
    Boolean(cultivation.isFinished) ||
    (cultivation.status || '').toLowerCase() === 'cosechado' ||
    (cultivation.currentStage || '').toLowerCase().includes('cosech') ||
    (cultivation.currentStage || '').toLowerCase().includes('secad');

  const stage = cultivation.currentStage || 'Vegetativo';
  const recommendedInterval = getRecommendedWateringIntervalDays(stage);

  // Si el cultivo está finalizado / cosechado
  if (isFinished || recommendedInterval === 0) {
    return {
      cultivationId: cultivation.id,
      cultivationName: cultivation.name,
      currentStage: stage,
      recommendedIntervalDays: 0,
      latestWateringDate: latestWatering?.date || null,
      daysSinceWatering: null,
      isFinished: true,
      isOverdue: false,
      isDueToday: false,
      isUpcoming: false,
      isOptimal: true,
      daysOverdue: 0,
      urgencyLevel: 'finished',
      badgeText: 'Cosechado',
      dotClass: 'bg-purple-600',
      glowClass: '',
      badgeBg: 'bg-purple-950/40 text-purple-300 border-purple-800/60',
      textClass: 'text-purple-400',
      pulse: false,
      label: 'Cultivo cosechado o finalizado (sin riego pendiente)',
      alertTitle: 'Cultivo Cosechado',
      alertMessage: 'Este cultivo ya fue cosechado. No requiere riegos activos.',
      notificationMessage: `Cultivo ${cultivation.name} finalizado.`,
    };
  }

  // Cálculo de días desde el último riego
  let daysSinceWatering: number | null = null;
  if (latestWatering?.date) {
    const lastDate = new Date(latestWatering.date);
    const diffMs = currentDate.getTime() - lastDate.getTime();
    daysSinceWatering = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }

  // Caso: Sin registros de riego históricos
  if (daysSinceWatering === null) {
    const startDate = new Date(cultivation.startDate);
    const diffMs = currentDate.getTime() - startDate.getTime();
    const daysSinceStart = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

    // Si pasaron más días que el período recomendado sin registrar ningún riego: OVERDUE
    if (daysSinceStart >= recommendedInterval) {
      const daysOverdue = daysSinceStart - recommendedInterval + 1;
      return {
        cultivationId: cultivation.id,
        cultivationName: cultivation.name,
        currentStage: stage,
        recommendedIntervalDays: recommendedInterval,
        latestWateringDate: null,
        daysSinceWatering: null,
        isFinished: false,
        isOverdue: true,
        isDueToday: false,
        isUpcoming: false,
        isOptimal: false,
        daysOverdue,
        urgencyLevel: 'critical',
        badgeText: 'Overdue',
        dotClass: 'bg-rose-500 dot-red',
        glowClass: 'shadow-[0_0_12px_rgba(244,63,94,0.85)]',
        badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/50',
        textClass: 'text-rose-400',
        pulse: true,
        label: `Riego Overdue: Sin registros desde el inicio (${daysSinceStart} días sin riego). Recomendado cada ${recommendedInterval} días en ${stage}.`,
        alertTitle: `¡Alerta de Riego Overdue! (${cultivation.name})`,
        alertMessage: `El cultivo "${cultivation.name}" no tiene riegos registrados y lleva ${daysSinceStart} días activo. El período recomendado para ${stage} es de ${recommendedInterval} días.`,
        notificationMessage: `⚠️ Alerta Overdue: "${cultivation.name}" supera el período de riego recomendado (${recommendedInterval} días en ${stage}).`,
      };
    }

    // Aún en rango inicial
    return {
      cultivationId: cultivation.id,
      cultivationName: cultivation.name,
      currentStage: stage,
      recommendedIntervalDays: recommendedInterval,
      latestWateringDate: null,
      daysSinceWatering: null,
      isFinished: false,
      isOverdue: false,
      isDueToday: daysSinceStart === recommendedInterval - 1,
      isUpcoming: true,
      isOptimal: false,
      daysOverdue: 0,
      urgencyLevel: 'warning',
      badgeText: 'Pendiente',
      dotClass: 'bg-amber-500 dot-orange',
      glowClass: 'shadow-[0_0_8px_rgba(245,158,11,0.6)]',
      badgeBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      textClass: 'text-amber-400',
      pulse: false,
      label: `Primer riego pendiente de registrar (iniciado hace ${daysSinceStart} d)`,
      alertTitle: `Primer riego pendiente (${cultivation.name})`,
      alertMessage: `Registra el primer riego para ${cultivation.name}. Ciclo recomendado: cada ${recommendedInterval} días.`,
      notificationMessage: `Pendiente de primer riego en "${cultivation.name}".`,
    };
  }

  // Caso: Con historial de riego
  // Condición de OVERDUE: días transcurridos supera estrictamente el intervalo recomendado para la etapa
  if (daysSinceWatering > recommendedInterval) {
    const daysOverdue = daysSinceWatering - recommendedInterval;
    return {
      cultivationId: cultivation.id,
      cultivationName: cultivation.name,
      currentStage: stage,
      recommendedIntervalDays: recommendedInterval,
      latestWateringDate: latestWatering.date,
      daysSinceWatering,
      isFinished: false,
      isOverdue: true,
      isDueToday: false,
      isUpcoming: false,
      isOptimal: false,
      daysOverdue,
      urgencyLevel: 'critical',
      badgeText: 'Overdue',
      dotClass: 'bg-rose-500 dot-red',
      glowClass: 'shadow-[0_0_12px_rgba(244,63,94,0.85)]',
      badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/50',
      textClass: 'text-rose-400',
      pulse: true,
      label: `Riego Overdue: último riego hace ${daysSinceWatering} días. Período recomendado para ${stage}: cada ${recommendedInterval} días (${daysOverdue} d atrasado).`,
      alertTitle: `¡Riego Overdue en ${cultivation.name}!`,
      alertMessage: `El último riego fue hace ${daysSinceWatering} días. Para la etapa de ${stage} se recomienda regar cada ${recommendedInterval} días. ¡Atrasado por ${daysOverdue} día${daysOverdue > 1 ? 's' : ''}!`,
      notificationMessage: `⚠️ Alerta Overdue en "${cultivation.name}": último riego hace ${daysSinceWatering} días (recomendado: ${recommendedInterval} días en ${stage}).`,
    };
  }

  // Toca hoy: exactamente en el intervalo recomendado
  if (daysSinceWatering === recommendedInterval) {
    return {
      cultivationId: cultivation.id,
      cultivationName: cultivation.name,
      currentStage: stage,
      recommendedIntervalDays: recommendedInterval,
      latestWateringDate: latestWatering.date,
      daysSinceWatering,
      isFinished: false,
      isOverdue: false,
      isDueToday: true,
      isUpcoming: false,
      isOptimal: false,
      daysOverdue: 0,
      urgencyLevel: 'warning',
      badgeText: 'Toca Hoy',
      dotClass: 'bg-amber-500 dot-orange',
      glowClass: 'shadow-[0_0_8px_rgba(245,158,11,0.6)]',
      badgeBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      textClass: 'text-amber-400',
      pulse: false,
      label: `Riego programado para hoy: último riego hace ${daysSinceWatering} días (ciclo de ${recommendedInterval} días en ${stage}).`,
      alertTitle: `Riego Programado para Hoy (${cultivation.name})`,
      alertMessage: `Hoy se cumple el ciclo recomendado de ${recommendedInterval} días en etapa de ${stage}.`,
      notificationMessage: `💧 Toca regar hoy "${cultivation.name}" (${stage}).`,
    };
  }

  // Riego al día (óptimo): daysSinceWatering < recommendedInterval
  return {
    cultivationId: cultivation.id,
    cultivationName: cultivation.name,
    currentStage: stage,
    recommendedIntervalDays: recommendedInterval,
    latestWateringDate: latestWatering.date,
    daysSinceWatering,
    isFinished: false,
    isOverdue: false,
    isDueToday: false,
    isUpcoming: true,
    isOptimal: true,
    daysOverdue: 0,
    urgencyLevel: 'optimal',
    badgeText: 'Al día',
    dotClass: 'bg-emerald-500 dot-green',
    glowClass: 'shadow-[0_0_8px_rgba(16,185,129,0.6)]',
    badgeBg: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    textClass: 'text-emerald-400',
    pulse: false,
    label:
      daysSinceWatering === 0
        ? `Riego al día (hidratado hoy, prox en ${recommendedInterval} d)`
        : `Hidratación óptima (hace ${daysSinceWatering} d, recomendado cada ${recommendedInterval} d)`,
    alertTitle: `Hidratación Óptima (${cultivation.name})`,
    alertMessage: `El sustrato se encuentra en ciclo de secado normal.`,
    notificationMessage: `Riego al día en "${cultivation.name}".`,
  };
}

/**
 * Escanea y obtiene todos los cultivos activos que se encuentren con el riego 'Overdue'.
 */
export function getOverdueCultivations(
  cultivations: Cultivation[],
  waterings: Watering[],
  currentDate: Date = new Date()
): Array<{
  cultivation: Cultivation;
  analysis: WateringAlertAnalysis;
  latestWatering: Watering | null;
}> {
  const activeCrops = cultivations.filter(
    (c) => !c.isFinished && (c.status || '').toLowerCase() !== 'cosechado'
  );

  const results: Array<{
    cultivation: Cultivation;
    analysis: WateringAlertAnalysis;
    latestWatering: Watering | null;
  }> = [];

  for (const crop of activeCrops) {
    const cropWaterings = waterings
      .filter((w) => w.cultivationId === crop.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const latest = cropWaterings[0] || null;
    const analysis = analyzeWateringUrgency(crop, latest, currentDate);

    if (analysis.isOverdue) {
      results.push({
        cultivation: crop,
        analysis,
        latestWatering: latest,
      });
    }
  }

  return results;
}
