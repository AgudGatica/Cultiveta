/**
 * "Para hoy" agrupado: la misma tarea en varias plantas del mismo ambiente es una sola fila
 * ("Poda de bajos · Carpa 120 · 2 genéticas"). Módulo puro (sin React ni Firebase).
 */
import type { Cultivation, CultivationTask } from '../types';

export interface TodayTaskGroup {
  /** Id de la primera tarea del grupo. */
  id: string;
  tasks: CultivationTask[];
  title: string;
  /** Ambiente donde están (null: cultivo sin ambiente). */
  indoorId: string | null;
  isLate: boolean;
}

/** El riego se anota cultivo por cultivo, cada uno con sus litros: no se junta. */
const GROUPABLE: ReadonlySet<CultivationTask['type']> = new Set(['flush', 'defoliation', 'stage_change', 'harvest', 'env_alert', 'custom']);

export function groupTodayTasks(tasks: CultivationTask[], cultivations: Pick<Cultivation, 'id' | 'indoorId'>[]): TodayTaskGroup[] {
  const indoorOf = new Map(cultivations.map((c) => [c.id, c.indoorId || null]));
  const groups: TodayTaskGroup[] = [];
  const byKey = new Map<string, TodayTaskGroup>();
  for (const task of tasks) {
    const indoorId = indoorOf.get(task.cultivationId) || null;
    const isLate = task.urgency === 'overdue';
    const key = indoorId && GROUPABLE.has(task.type) ? [task.type, task.title, indoorId, isLate].join('|') : null;
    const existing = key ? byKey.get(key) : undefined;
    if (existing) {
      existing.tasks.push(task);
      continue;
    }
    const group: TodayTaskGroup = { id: task.id, tasks: [task], title: task.title, indoorId, isLate };
    groups.push(group);
    if (key) byKey.set(key, group);
  }
  return groups;
}
