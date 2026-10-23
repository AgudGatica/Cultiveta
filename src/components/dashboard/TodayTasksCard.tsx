import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Droplets,
  Flower2,
  Scissors,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type { Cultivation, CultivationTask, EnvironmentRecord, Watering } from '../../types';
import { taskService } from '../../services/taskService';
import { selectTodayTasks } from '../../utils/cropCardInfo';
import { formatFriendlyDate } from '../../utils/growthStageUtils';

interface TodayTasksCardProps {
  cultivations: Cultivation[];
  waterings: Watering[];
  envRecords: EnvironmentRecord[];
  userId?: string;
  onSelectCultivation?: (cultivation: Cultivation) => void;
  onOpenWateringModal?: (cultivation?: Cultivation) => void;
  onTaskCompletedFeedback?: (message: string) => void;
}

const VISIBLE_TASKS = 4;

const TASK_ICONS: Record<CultivationTask['type'], { icon: LucideIcon; tone: string }> = {
  watering: { icon: Droplets, tone: 'bg-icon-bg text-brand' },
  flush: { icon: Droplets, tone: 'bg-icon-bg text-brand' },
  defoliation: { icon: Scissors, tone: 'bg-ok-bg text-ok-ink' },
  stage_change: { icon: Flower2, tone: 'bg-ok-bg text-ok-ink' },
  harvest: { icon: Sparkles, tone: 'bg-warn-bg text-warn-ink' },
  env_alert: { icon: AlertTriangle, tone: 'bg-warn-bg text-warn-ink' },
  custom: { icon: Clock, tone: 'bg-track text-ink-muted' },
};

/**
 * "Para hoy": tareas pendientes de hoy y atrasadas (mismas reglas que taskService.getTasksForDashboard),
 * con botón para marcarlas hechas. Al marcar un riego se abre el formulario para anotar sus datos.
 */
export const TodayTasksCard: React.FC<TodayTasksCardProps> = ({
  cultivations,
  waterings,
  envRecords,
  userId = 'default_user',
  onSelectCultivation,
  onOpenWateringModal,
  onTaskCompletedFeedback,
}) => {
  const [tasksVersion, setTasksVersion] = useState(0);
  const [serverTasks, setServerTasks] = useState<CultivationTask[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Tareas del servidor (por ejemplo, alertas del clima exterior)
  useEffect(() => {
    let isMounted = true;
    taskService.fetchServerTasks(userId).then((fetched) => {
      if (isMounted && Array.isArray(fetched)) setServerTasks(fetched);
    });
    return () => {
      isMounted = false;
    };
  }, [userId, tasksVersion]);

  useEffect(() => {
    const handleTaskUpdated = () => setTasksVersion((v) => v + 1);
    window.addEventListener('cultiveta_task_updated', handleTaskUpdated);
    return () => window.removeEventListener('cultiveta_task_updated', handleTaskUpdated);
  }, []);

  const todayTasks = useMemo(
    () => selectTodayTasks(taskService.getTasksForDashboard(cultivations, waterings, envRecords, userId, serverTasks)),
    // tasksVersion vuelve a leer las tareas marcadas en este dispositivo
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cultivations, waterings, envRecords, userId, serverTasks, tasksVersion]
  );

  const visible = showAll ? todayTasks : todayTasks.slice(0, VISIBLE_TASKS);
  const hiddenCount = todayTasks.length - VISIBLE_TASKS;

  const handleComplete = async (task: CultivationTask) => {
    setProcessingId(task.id);
    try {
      await taskService.completeTask(task, userId);
      setTasksVersion((v) => v + 1);
      const crop = cultivations.find((c) => c.id === task.cultivationId);
      // El riego se guarda solo con los datos que carga la persona: se abre el formulario vacío.
      if (task.type === 'watering' && onOpenWateringModal) {
        onOpenWateringModal(crop);
        onTaskCompletedFeedback?.(`Tarea marcada. Anotá los datos del riego de "${task.cultivationName}".`);
      } else {
        onTaskCompletedFeedback?.(`Listo: "${task.title}".`);
      }
    } finally {
      setProcessingId(null);
    }
  };

  if (todayTasks.length === 0) {
    return (
      <section id="home-today-card" data-state="empty" className="cultiveta-card p-5 flex items-center gap-3.5">
        <div className="w-11 h-11 rounded-2xl bg-ok-bg text-ok-ink border border-ok-line flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-extrabold text-ink">Todo al día</h2>
          <p className="text-xs text-ink-muted">No hay tareas pendientes para hoy.</p>
        </div>
      </section>
    );
  }

  return (
    <section id="home-today-card" aria-labelledby="home-today-title" className="cultiveta-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-today-title" className="text-base font-extrabold text-ink flex items-center gap-2">
          <Bell className="w-4 h-4 text-brand" aria-hidden="true" />
          Para hoy
        </h2>
        <span className="text-[11px] font-bold text-ink-muted">
          {todayTasks.length === 1 ? '1 tarea' : `${todayTasks.length} tareas`}
        </span>
      </div>

      <ul className="space-y-2">
        {visible.map((task) => {
          const { icon: Icon, tone } = TASK_ICONS[task.type] || TASK_ICONS.custom;
          const isLate = task.urgency === 'overdue';
          const crop = cultivations.find((c) => c.id === task.cultivationId);
          const when = isLate
            ? `atrasada${task.dueDate ? ` desde el ${formatFriendlyDate(task.dueDate, { includeYear: false })}` : ''}`
            : 'hoy';
          return (
            <li
              key={task.id}
              data-task-id={task.id}
              className={`flex items-center gap-3 p-2.5 rounded-2xl border ${
                isLate ? 'bg-warn-bg border-warn-line' : 'bg-surface border-line'
              }`}
            >
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
                <Icon className="w-5 h-5" aria-hidden="true" />
              </span>
              <button
                type="button"
                onClick={() => crop && onSelectCultivation?.(crop)}
                className="min-w-0 flex-1 text-left cursor-pointer min-h-11 py-0.5"
              >
                <span className="block text-sm font-bold text-ink leading-snug line-clamp-2">{task.title}</span>
                <span className={`block text-xs leading-snug ${isLate ? 'text-warn-ink font-semibold' : 'text-ink-muted'}`}>
                  {task.cultivationName} · {when}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleComplete(task)}
                disabled={processingId === task.id}
                aria-label={`Marcar hecha: ${task.title} (${task.cultivationName})`}
                className="w-11 h-11 rounded-full border-2 border-ok text-ok-ink hover:bg-ok hover:text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors disabled:opacity-50"
              >
                <Check className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      {hiddenCount > 0 && (
        <button
          type="button"
          id="home-today-toggle-btn"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="min-h-11 text-sm font-bold text-brand hover:underline cursor-pointer"
        >
          {showAll ? 'Ver menos' : `Ver ${hiddenCount} más`}
        </button>
      )}
    </section>
  );
};
