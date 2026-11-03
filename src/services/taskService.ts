import { Cultivation, Watering, EnvironmentRecord, CultivationTask, Genetics } from '../types';
import { authFetch } from './apiClient';
import { buildDailyTasks } from '../utils/dailyTasks';

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
   * Fetch server-generated tasks (e.g. Sincronización Inversa / Alertas Climáticas de Gemini)
   */
  async fetchServerTasks(userId?: string): Promise<CultivationTask[]> {
    try {
      // El servidor toma el usuario del token, no del parámetro.
      if (!userId) return [];
      const response = await authFetch('/api/outdoor/tasks');
      if (!response.ok) return [];
      return await response.json();
    } catch {
      return [];
    }
  },

  /**
   * Las tareas del día para el Inicio (el cálculo vive en utils/dailyTasks.ts, que usa también el servidor).
   */
  getTasksForDashboard(
    cultivations: Cultivation[],
    waterings: Watering[],
    envRecords: EnvironmentRecord[],
    userId: string,
    serverTasks: CultivationTask[] = [],
    geneticsList: Genetics[] = []
  ): CultivationTask[] {
    return buildDailyTasks(cultivations, waterings, envRecords, this.getCompletedTaskMap(userId), serverTasks, geneticsList);
  },

  /**
   * Marca una tarea como completada desde el widget.
   * No crea registros de riego: un riego solo se guarda con los datos que informa la persona
   * en el formulario de riego (sin volumen, pH ni EC supuestos).
   */
  async completeTask(task: CultivationTask, userId: string): Promise<{ success: boolean }> {
    this.saveCompletedTask(task.id, userId);
    return { success: true };
  },

  /**
   * Revert/Undo completion of a task
   */
  uncompleteTask(taskId: string, userId: string): void {
    this.removeCompletedTask(taskId, userId);
  },
};
