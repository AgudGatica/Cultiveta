import { Cultivation, Watering, EnvironmentRecord, CultivationTask, TaskUrgency, TaskPriority } from '../types';
import { wateringService } from './wateringService';
import { localStore } from './localStore';

const COMPLETED_TASKS_KEY_PREFIX = 'cultiveta_completed_tasks_';

export const taskService = {
  getStorageKey(userId: string): string {
    return `${COMPLETED_TASKS_KEY_PREFIX}${userId || 'default_user'}`;
  },

  getCompletedTaskMap(userId: string): Record<string, { completedAt: string; note?: string }> {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(this.getStorageKey(userId));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  },

  saveCompletedTask(taskId: string, userId: string, note?: string): void {
    if (typeof window === 'undefined') return;
    try {
      const map = this.getCompletedTaskMap(userId);
      map[taskId] = {
        completedAt: new Date().toISOString(),
        note,
      };
      localStorage.setItem(this.getStorageKey(userId), JSON.stringify(map));
      window.dispatchEvent(new CustomEvent('cultiveta_task_updated', { detail: { taskId, completed: true } }));
    } catch (err) {
      console.warn('Error saving completed task to localStorage', err);
    }
  },

  removeCompletedTask(taskId: string, userId: string): void {
    if (typeof window === 'undefined') return;
    try {
      const map = this.getCompletedTaskMap(userId);
      delete map[taskId];
      localStorage.setItem(this.getStorageKey(userId), JSON.stringify(map));
      window.dispatchEvent(new CustomEvent('cultiveta_task_updated', { detail: { taskId, completed: false } }));
    } catch (err) {
      console.warn('Error removing completed task from localStorage', err);
    }
  },

  /**
   * Generates dynamic actionable tasks based on current date, cultivation stage,
   * last watering timestamps, and environment conditions.
   */
  getTasksForDashboard(
    cultivations: Cultivation[],
    waterings: Watering[],
    envRecords: EnvironmentRecord[],
    userId: string
  ): CultivationTask[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const completedMap = this.getCompletedTaskMap(userId);
    const activeCrops = cultivations.filter((c) => !c.isFinished);
    const tasks: CultivationTask[] = [];

    for (const crop of activeCrops) {
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

      // 1. Next Watering Event Task
      const wateringTaskId = `watering_${crop.id}_${todayStr}`;
      const isWateringManuallyCompleted = !!completedMap[wateringTaskId];
      const isWateringDone = wateredToday || isWateringManuallyCompleted;

      let daysSinceLast = 999;
      let nextWateringDate = new Date(today);

      if (latestWatering?.date) {
        const lastDate = new Date(latestWatering.date);
        lastDate.setHours(0, 0, 0, 0);
        const diffMs = today.getTime() - lastDate.getTime();
        daysSinceLast = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        // Interval: 2 days in flower/preflower, 3 days in vegetative
        const intervalDays = crop.currentStage === 'Floración' || crop.currentStage === 'Prefloración' ? 2 : 3;
        nextWateringDate = new Date(lastDate);
        nextWateringDate.setDate(nextWateringDate.getDate() + intervalDays);
      } else {
        // No watering recorded: due today immediately
        nextWateringDate = new Date(today);
      }

      const nextWateringStr = nextWateringDate.toISOString().split('T')[0];

      let wateringUrgency: TaskUrgency = 'upcoming';
      let wateringPriority: TaskPriority = 'medium';
      let wateringTitle = `Riego Programado`;
      let wateringDesc = `Comprobar humedad del sustrato y peso de la maceta.`;

      const estimatedLiters = crop.substrate?.potVolumeLiters
        ? Math.round(crop.substrate.potVolumeLiters * 0.15 * 10) / 10
        : 2;

      const targetPh = crop.currentStage === 'Floración' ? '6.2 - 6.5' : '5.8 - 6.2';

      if (isWateringDone) {
        wateringUrgency = 'today';
        wateringPriority = 'high';
        wateringTitle = `Riego completado hoy`;
        wateringDesc = `Plantas hidratadas correctamente. Próximo riego estimado en 2-3 días.`;
      } else if (!latestWatering || nextWateringDate <= today) {
        if (daysSinceLast >= 4 && latestWatering) {
          wateringUrgency = 'overdue';
          wateringPriority = 'critical';
          wateringTitle = `¡Riego Urgente Atrasado!`;
          wateringDesc = `Hace ${daysSinceLast} días del último riego. El sustrato puede estar deshidratado. Regar con pH ${targetPh} (~${estimatedLiters}L/planta).`;
        } else {
          wateringUrgency = 'today';
          wateringPriority = 'critical';
          wateringTitle = `Riego Programado para Hoy`;
          wateringDesc = `Toca hidratación para ${crop.name}. Preparar solución nutritiva (pH ${targetPh}, ~${estimatedLiters}L/planta).`;
        }
      } else {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        if (nextWateringStr === tomorrowStr) {
          wateringUrgency = 'tomorrow';
          wateringPriority = 'high';
          wateringTitle = `Riego Próximo (Mañana)`;
          wateringDesc = `Dejar reposar agua para desclorar y preparar nutrientes para mañana.`;
        } else {
          wateringUrgency = 'upcoming';
          wateringPriority = 'medium';
          wateringTitle = `Próximo Riego`;
          wateringDesc = `Programado para el ${nextWateringStr}. Sustrato en ciclo de secado.`;
        }
      }

      tasks.push({
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
      const startDate = new Date(crop.startDate);
      startDate.setHours(0, 0, 0, 0);
      const totalDays = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const floweringWeeks = crop.declaredFloweringWeeks || 9;

      // Milestone A: Flush (Lavado de raíces)
      if (crop.currentStage === 'Floración' || crop.currentStage === 'Maduración') {
        const flowStart = crop.floweringStartDate ? new Date(crop.floweringStartDate) : new Date(startDate);
        flowStart.setHours(0, 0, 0, 0);
        const flowDays = Math.floor((today.getTime() - flowStart.getTime()) / (1000 * 60 * 60 * 24));
        const totalFlowDaysExpected = floweringWeeks * 7;
        const flushStartDay = totalFlowDaysExpected - 12;

        if (flowDays >= flushStartDay && flowDays <= totalFlowDaysExpected + 5) {
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
            description: `Día ${flowDays} de flora. Comenzar riegos con agua desclorada pura sin abonos para metabolizar sales minerales residuales en las flores.`,
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
        if (flowDays >= totalFlowDaysExpected - 3) {
          const harvestCheckTaskId = `harvest_check_${crop.id}`;
          const isHarvestCheckCompleted = !!completedMap[harvestCheckTaskId];
          tasks.push({
            id: harvestCheckTaskId,
            cultivationId: crop.id,
            cultivationName: crop.name,
            geneticsName: crop.geneticsName,
            stage: crop.currentStage,
            type: 'harvest',
            title: `Inspección de Tricomas (Cosecha Próxima)`,
            description: `Día ${flowDays} de flora (${floweringWeeks} semanas cumplidas). Observar glándulas de resina con lupa 60x: buscar 70-80% lechosos y 10-20% ámbar.`,
            dueDate: todayStr,
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
        if (crop.currentStage === 'Floración' && cropEnv.humidityPct >= 65) {
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
        if (cropEnv.temperatureC >= 29) {
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
            description: `Temperaturas sobre 28°C evaporan terpenos y causan estrés por calor. Elevar luminaria o aumentar extracción de aire.`,
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
  },

  /**
   * Completes a task directly from the widget.
   * If it's a watering task and logWateringRecord is true, it automatically saves a watering record.
   */
  async completeTask(
    task: CultivationTask,
    userId: string,
    options?: {
      logWateringRecord?: boolean;
      potSizeLiters?: number;
      stage?: string;
    }
  ): Promise<{ success: boolean; wateringCreated?: Watering }> {
    this.saveCompletedTask(task.id, userId);

    let wateringCreated: Watering | undefined;

    if (task.type === 'watering' && options?.logWateringRecord) {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const defaultVolume = options.potSizeLiters
          ? Math.round(options.potSizeLiters * 0.15 * 10) / 10
          : 2;
        const defaultPh = task.stage === 'Floración' ? 6.4 : 6.0;

        wateringCreated = await wateringService.addWatering({
          userId,
          cultivationId: task.cultivationId,
          date: todayStr,
          time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          volumeLiters: defaultVolume,
          phIn: defaultPh,
          ecIn: 1.2,
          observations: 'Riego completado directamente desde el widget de tareas del Dashboard.',
        });
      } catch (err) {
        console.warn('Could not auto-log watering record for completed task:', err);
      }
    }

    return { success: true, wateringCreated };
  },

  /**
   * Revert/Undo completion of a task
   */
  uncompleteTask(taskId: string, userId: string): void {
    this.removeCompletedTask(taskId, userId);
  },
};
