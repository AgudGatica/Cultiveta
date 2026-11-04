/**
 * Las tareas del día (riego o tanque, lavado, poda, tricomas, 12/12, alertas de clima) a partir de los cultivos,
 * los riegos y el ambiente. Sin navegador: la usan el Inicio (taskService) y el servidor (resumen diario por push).
 * completedMap: las tareas que la persona marcó como hechas (en el servidor no se conocen: {}).
 */
import { Cultivation, Watering, EnvironmentRecord, CultivationTask, TaskUrgency, TaskPriority, Genetics } from '../types';
import { analyzeWateringUrgency } from './wateringAlertUtils';
import { calculateIrrigationForecast } from '../services/irrigationForecastService';
import { buildCultivationStageSchedule, getLocalTodayDateOnly, parseLocalDate } from './growthStageUtils';
import { TEMP_HIGH_ALERT_C, FLOWER_HUMIDITY_HIGH_PCT, PH_TARGET_TEXT, isFlowerOrRipeningStage } from './agronomicThresholds';
import { CHECK_DUE_HOURS, tankStatus } from './hydroTank';
import { num } from './feedTargets';
import { growMethodOf } from './growMethod';

export type CompletedTaskMap = Record<string, { completedAt: string; note?: string }>;

export function buildDailyTasks(
  cultivations: Cultivation[],
  waterings: Watering[],
  envRecords: EnvironmentRecord[],
  completedMap: CompletedTaskMap = {},
  serverTasks: CultivationTask[] = [],
  geneticsList: Genetics[] = []
): CultivationTask[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = getLocalTodayDateOnly(today);

  const activeCrops = cultivations.filter((c) => !c.isFinished);
  const tasks: CultivationTask[] = [];

  for (const crop of activeCrops) {
    const schedule = buildCultivationStageSchedule(crop, geneticsList);
    // Find latest watering for this specific crop
    const cropWaterings = waterings
      .filter((w) => w.cultivationId === crop.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    const latestWatering = cropWaterings[0] || null;

    // Check if watered today
    const wateredToday = cropWaterings.some((w) => {
      const wDate = w.date.split('T')[0];
      return wDate === todayStr;
    });

    // 1. Hidroponía: no hay riegos. "Revisar el tanque" todos los días y "Cambiar la solución" cada 14 días.
    const tank = tankStatus(crop, cropWaterings);
    if (tank) {
      const checkTaskId = `tank_${crop.id}_${todayStr}`;
      const checkedToday = wateredToday || !!completedMap[checkTaskId];
      const late = tank.hoursSinceCheck === null || tank.hoursSinceCheck > CHECK_DUE_HOURS;
      const goal = `pH ${num(tank.target.ph.target)} y EC ${num(tank.target.ec.target)}`;
      tasks.push({
        id: checkTaskId,
        cultivationId: crop.id,
        cultivationName: crop.name,
        geneticsName: crop.geneticsName,
        stage: crop.currentStage,
        type: 'watering',
        title: checkedToday ? 'Tanque revisado hoy' : late ? '¡Revisá el tanque!' : 'Revisar el tanque',
        description: checkedToday
          ? tank.alert.text
          : late && tank.hoursSinceCheck !== null
            ? `Hace ${Math.round(tank.hoursSinceCheck / 24)} días sin control. Medí pH, EC y temperatura del agua (apuntá a ${goal}).`
            : `Medí pH, EC y temperatura del agua, a la misma hora todos los días (apuntá a ${goal}).`,
        dueDate: todayStr,
        urgency: !checkedToday && late && tank.hoursSinceCheck !== null ? 'overdue' : 'today',
        priority: checkedToday ? 'high' : 'critical',
        isCompleted: checkedToday,
        completedAt: completedMap[checkTaskId]?.completedAt,
        categoryLabel: '💧 Tanque & Nutrición',
        actionHint: checkedToday ? 'Completado' : 'Anotar control',
      });
      if (tank.changeInDays !== null && tank.changeInDays <= 1) {
        const changeTaskId = `solution_${crop.id}_${todayStr}`;
        const changedToday = !!completedMap[changeTaskId];
        const due = new Date(today);
        due.setDate(due.getDate() + tank.changeInDays);
        tasks.push({
          id: changeTaskId,
          cultivationId: crop.id,
          cultivationName: crop.name,
          geneticsName: crop.geneticsName,
          stage: crop.currentStage,
          type: 'watering',
          title: tank.changeInDays === 0 ? 'Cambiar la solución' : 'Cambio de solución (mañana)',
          description: `Pasaron ${tank.daysSinceChange} días: vaciá el tanque y prepará solución nueva a ${goal}. Anotalo con "Cambié toda la solución".`,
          dueDate: getLocalTodayDateOnly(due),
          urgency: tank.changeInDays === 0 ? 'today' : 'tomorrow',
          priority: tank.changeInDays === 0 ? 'critical' : 'high',
          isCompleted: changedToday,
          completedAt: completedMap[changeTaskId]?.completedAt,
          categoryLabel: '💧 Tanque & Nutrición',
          actionHint: changedToday ? 'Completado' : 'Anotar cambio',
        });
      }
    }

    // 1. Next Watering Event Task
    const wateringTaskId = `watering_${crop.id}_${todayStr}`;
    const isWateringManuallyCompleted = !!completedMap[wateringTaskId];
    const isWateringDone = wateredToday || isWateringManuallyCompleted;

    // "Atrasado" se decide con la ventana de calculateIrrigationForecast (no con un plazo fijo).
    const wateringAnalysis = analyzeWateringUrgency(
      crop,
      latestWatering || null,
      new Date(),
      calculateIrrigationForecast(crop, waterings, envRecords)
    );
    const intervalDays = wateringAnalysis.recommendedIntervalDays;

    let nextWateringDate = new Date(today);
    if (latestWatering?.date) {
      const lastDate = parseLocalDate(latestWatering.date) || new Date(today);
      nextWateringDate = new Date(lastDate);
      nextWateringDate.setDate(nextWateringDate.getDate() + intervalDays);
    }

    const nextWateringStr = getLocalTodayDateOnly(nextWateringDate);

    let wateringUrgency: TaskUrgency = 'upcoming';
    let wateringPriority: TaskPriority = 'medium';
    let wateringTitle = `Riego Programado`;
    let wateringDesc = `Comprobar humedad del sustrato y peso de la maceta.`;

    // Referencia orientativa (15 % del volumen de la maceta) solo si se conoce la maceta;
    // sin ese dato no se sugiere una cantidad.
    const litersHint = crop.substrate?.potVolumeLiters
      ? `, ~${Math.round(crop.substrate.potVolumeLiters * 0.15 * 10) / 10} L por planta como referencia`
      : '';

    // Living soil: solo agua, sin pH
    const living = growMethodOf(crop) === 'living_soil';
    const phHint = living ? '' : `pH recomendado ${PH_TARGET_TEXT}`;

    if (isWateringDone) {
      wateringUrgency = 'today';
      wateringPriority = 'high';
      wateringTitle = `Riego completado hoy`;
      wateringDesc = `Plantas hidratadas correctamente. Próximo riego estimado en ${intervalDays} días.`;
    } else if (wateringAnalysis.isOverdue) {
      wateringUrgency = 'overdue';
      wateringPriority = 'critical';
      wateringTitle = `¡Riego atrasado!`;
      wateringDesc = `${wateringAnalysis.alertMessage}${phHint || litersHint ? ` ${[phHint, litersHint.replace(/^, /, '')].filter(Boolean).join(', ')}` : ''}.`;
    } else if (!latestWatering || nextWateringDate <= today || wateringAnalysis.isDueToday) {
      wateringUrgency = 'today';
      wateringPriority = 'critical';
      wateringTitle = `Riego Programado para Hoy`;
      wateringDesc = `Revisá la maceta de ${crop.name} y regá si hace falta${phHint || litersHint ? ` (${[phHint, litersHint.replace(/^, /, '')].filter(Boolean).join(', ')})` : ''}.`;
    } else {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = getLocalTodayDateOnly(tomorrow);
      if (nextWateringStr === tomorrowStr) {
        wateringUrgency = 'tomorrow';
        wateringPriority = 'high';
        wateringTitle = `Riego Próximo (Mañana)`;
        wateringDesc = living ? `Dejá reposar el agua para mañana.` : `Dejar reposar agua para desclorar y preparar nutrientes para mañana.`;
      } else {
        wateringUrgency = 'upcoming';
        wateringPriority = 'medium';
        wateringTitle = `Próximo Riego`;
        wateringDesc = `Programado para el ${nextWateringStr}. Sustrato en ciclo de secado.`;
      }
    }

    // Cosechada, secando o curando: no se riega (antes salía "Riego programado para hoy" todos los días)
    if (!tank && !wateringAnalysis.isFinished) tasks.push({
      id: wateringTaskId,
      cultivationId: crop.id,
      cultivationName: crop.name,
      geneticsName: crop.geneticsName,
      stage: crop.currentStage,
      type: 'watering',
      title: wateringTitle,
      description: wateringDesc,
      dueDate: isWateringDone ? todayStr : nextWateringStr,
      urgency: wateringUrgency,
      priority: wateringPriority,
      isCompleted: isWateringDone,
      completedAt: completedMap[wateringTaskId]?.completedAt,
      categoryLabel: '💧 Riego & Nutrición',
      actionHint: isWateringDone ? 'Completado' : 'Registrar Riego',
    });

    // 2. Critical Stage Milestones based on days
    const startDate = parseLocalDate(crop.startDate) || new Date(today);
    const totalDays = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const floweringWeeks = crop.declaredFloweringWeeks || 9;

    // Milestone A: Flush (Lavado de raíces)
    if (crop.currentStage === 'Floración' || crop.currentStage === 'Maduración') {
      // día local (new Date("YYYY-MM-DD") lo toma en UTC y en Argentina suma un día de flora)
      const flowStart = (crop.floweringStartDate && parseLocalDate(crop.floweringStartDate)) || new Date(startDate);
      flowStart.setHours(0, 0, 0, 0);
      const flowDays = Math.floor((today.getTime() - flowStart.getTime()) / (1000 * 60 * 60 * 24));
      const totalFlowDaysExpected = floweringWeeks * 7;
      const flushStartDay = totalFlowDaysExpected - 12;

      if (!living && flowDays >= flushStartDay && flowDays <= totalFlowDaysExpected + 5) {
        const flushTaskId = `flush_${crop.id}_${todayStr}`;
        const isFlushCompleted = !!completedMap[flushTaskId];
        tasks.push({
          id: flushTaskId,
          cultivationId: crop.id,
          cultivationName: crop.name,
          geneticsName: crop.geneticsName,
          stage: crop.currentStage,
          type: 'flush',
          title: `Lavado de Raíces (Flush Crítico)`,
          description: tank
            ? `Día ${flowDays} de flora. Cambiá la solución del tanque por agua sola (con pH) hasta la cosecha.`
            : `Día ${flowDays} de flora. Comenzar riegos con agua desclorada pura sin abonos para metabolizar sales minerales residuales en las flores.`,
          dueDate: todayStr,
          urgency: 'today',
          priority: 'critical',
          isCompleted: isFlushCompleted,
          completedAt: completedMap[flushTaskId]?.completedAt,
          categoryLabel: '🚿 Lavado de Sales',
          actionHint: 'Marcar Lavado Realizado',
        });
      }

      // Milestone B: Defoliation & Lollipop in week 3 (days 19 to 23 of flower)
      if (flowDays >= 19 && flowDays <= 24) {
        const defolTaskId = `defol_${crop.id}_week3`;
        const isDefolCompleted = !!completedMap[defolTaskId];
        tasks.push({
          id: defolTaskId,
          cultivationId: crop.id,
          cultivationName: crop.name,
          geneticsName: crop.geneticsName,
          stage: crop.currentStage,
          type: 'defoliation',
          title: `Poda de Bajos y Defoliación (Semana 3 Floración)`,
          description: `Día ${flowDays} de floración. Retirar hojas que bloquean copas florales y brotes bajeros débiles para concentrar energía en los cogollos principales y prevenir hongos.`,
          dueDate: todayStr,
          urgency: 'today',
          priority: 'critical',
          isCompleted: isDefolCompleted,
          completedAt: completedMap[defolTaskId]?.completedAt,
          categoryLabel: '✂️ Poda & Defoliación',
          actionHint: 'Marcar Poda Realizada',
        });
      }

      // Milestone C: Trichome Inspection / Harvest
      // Aparece solamente cuando schedule.daysUntilHarvest >= 0 && schedule.daysUntilHarvest <= 2
      if (
        schedule.daysUntilHarvest !== undefined &&
        schedule.daysUntilHarvest >= 0 &&
        schedule.daysUntilHarvest <= 2
      ) {
        const harvestCheckTaskId = `harvest_check_${crop.id}`;
        const isHarvestCheckCompleted = !!completedMap[harvestCheckTaskId];
        const estimatedHarvest = schedule.estimatedHarvestDate || todayStr;
        tasks.push({
          id: harvestCheckTaskId,
          cultivationId: crop.id,
          cultivationName: crop.name,
          geneticsName: crop.geneticsName,
          stage: crop.currentStage,
          type: 'harvest',
          title: `Inspección de Tricomas (Cosecha Próxima)`,
          description: `Día ${flowDays} de flora (${floweringWeeks} semanas cumplidas). Cosecha estimada: ${estimatedHarvest} (${schedule.daysUntilHarvest === 0 ? 'hoy' : `en ${schedule.daysUntilHarvest} día(s)`}). Observar glándulas de resina con lupa 60x: buscar 70-80% lechosos y 10-20% ámbar.`,
          dueDate: estimatedHarvest,
          urgency: 'today',
          priority: 'critical',
          isCompleted: isHarvestCheckCompleted,
          completedAt: completedMap[harvestCheckTaskId]?.completedAt,
          categoryLabel: '🔍 Control de Tricomas',
          actionHint: 'Revisión Lista',
        });
      }
    }

    // Milestone D: Switch to 12/12 (Vegetative > 28 days for photoperiodics)
    if (
      crop.photoperiodType !== 'Automática' &&
      crop.currentStage === 'Vegetativo' &&
      totalDays >= 28
    ) {
      const switchTaskId = `switch_1212_${crop.id}`;
      const isSwitchCompleted = !!completedMap[switchTaskId];
      tasks.push({
        id: switchTaskId,
        cultivationId: crop.id,
        cultivationName: crop.name,
        geneticsName: crop.geneticsName,
        stage: crop.currentStage,
        type: 'stage_change',
        title: `Revisión para Cambio a 12/12 (Floración)`,
        description: `Lleva ${totalDays} días en vegetativo. Evaluar cobertura de canopia y cambiar temporizador de luz a 12h luz / 12h oscuridad cuando la carpa esté al 75% llena.`,
        dueDate: todayStr,
        urgency: 'today',
        priority: 'high',
        isCompleted: isSwitchCompleted,
        completedAt: completedMap[switchTaskId]?.completedAt,
        categoryLabel: '⏱️ Fotoperiodo',
        actionHint: 'Confirmar Fotoperiodo',
      });
    }

    // 3. Environmental Emergency Alerts (if recent record exists)
    const cropEnv = envRecords
      .filter((e) => e.cultivationId === crop.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    if (cropEnv) {
      // High humidity in flower risk (Botrytis alert)
      if (isFlowerOrRipeningStage(crop.currentStage) && cropEnv.humidityPct > FLOWER_HUMIDITY_HIGH_PCT) {
        const envHumTaskId = `env_hum_alert_${crop.id}_${todayStr}`;
        const isEnvHumCompleted = !!completedMap[envHumTaskId];
        tasks.push({
          id: envHumTaskId,
          cultivationId: crop.id,
          cultivationName: crop.name,
          geneticsName: crop.geneticsName,
          stage: crop.currentStage,
          type: 'env_alert',
          title: `Alerta Crítica: Humedad Peligrosa (${cropEnv.humidityPct}%)`,
          description: `Humedad muy elevada en floración. Aumentar ventilación y activar deshumidificador de inmediato para prevenir botrytis y oídio.`,
          dueDate: todayStr,
          urgency: 'today',
          priority: 'critical',
          isCompleted: isEnvHumCompleted,
          completedAt: completedMap[envHumTaskId]?.completedAt,
          categoryLabel: '⚠️ Alerta Climática',
          actionHint: 'Ajuste Realizado',
        });
      }

      // High temperature stress
      if (cropEnv.temperatureC > TEMP_HIGH_ALERT_C) {
        const envTempTaskId = `env_temp_alert_${crop.id}_${todayStr}`;
        const isEnvTempCompleted = !!completedMap[envTempTaskId];
        tasks.push({
          id: envTempTaskId,
          cultivationId: crop.id,
          cultivationName: crop.name,
          geneticsName: crop.geneticsName,
          stage: crop.currentStage,
          type: 'env_alert',
          title: `Alerta Crítica: Temperatura Alta (${cropEnv.temperatureC}°C)`,
          description: `Temperaturas sobre ${TEMP_HIGH_ALERT_C} °C evaporan terpenos y causan estrés por calor. Subí la luminaria o aumentá la extracción de aire.`,
          dueDate: todayStr,
          urgency: 'today',
          priority: 'critical',
          isCompleted: isEnvTempCompleted,
          completedAt: completedMap[envTempTaskId]?.completedAt,
          categoryLabel: '🌡️ Estrés Térmico',
          actionHint: 'Ventilación Ajustada',
        });
      }
    }
  }

  // 4. Incorporar alertas y tareas generadas en servidor por Sincronización Inversa
  if (serverTasks && serverTasks.length > 0) {
    for (const st of serverTasks) {
      // Evitar duplicados si ya existe en tasks
      if (tasks.some((t) => t.id === st.id)) continue;
      const isStCompleted = !!completedMap[st.id] || st.isCompleted;
      tasks.push({
        ...st,
        isCompleted: isStCompleted,
        completedAt: completedMap[st.id]?.completedAt || st.completedAt,
      });
    }
  }

  // Sort order:
  // 1. Pending tasks first, then completed
  // 2. Urgency: 'overdue' > 'today' > 'tomorrow' > 'upcoming'
  // 3. Priority: 'critical' > 'high' > 'medium'
  const urgencyWeight: Record<TaskUrgency, number> = {
    overdue: 4,
    today: 3,
    tomorrow: 2,
    upcoming: 1,
  };

  const priorityWeight: Record<TaskPriority, number> = {
    critical: 3,
    high: 2,
    medium: 1,
  };

  return tasks.sort((a, b) => {
    // Completed last
    if (a.isCompleted !== b.isCompleted) {
      return a.isCompleted ? 1 : -1;
    }
    // Urgency
    const uDiff = urgencyWeight[b.urgency] - urgencyWeight[a.urgency];
    if (uDiff !== 0) return uDiff;

    // Priority
    const pDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
    if (pDiff !== 0) return pDiff;

    // Due date
    return a.dueDate.localeCompare(b.dueDate);
  });
}
