import React, { useState, useEffect, useMemo } from 'react';
import {
  Droplets,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Clock,
  Scissors,
  Flower2,
  RotateCcw,
  Check,
  Sprout,
  Flame,
  ArrowRight,
  ListTodo,
} from 'lucide-react';
import { Cultivation, Watering, EnvironmentRecord, CultivationTask } from '../../types';
import { taskService } from '../../services/taskService';

interface UpcomingTaskWidgetProps {
  cultivations: Cultivation[];
  waterings: Watering[];
  envRecords: EnvironmentRecord[];
  userId?: string;
  onSelectCultivation?: (cultivation: Cultivation) => void;
  onOpenWateringModal?: (cultivation?: Cultivation) => void;
  onWateringAdded?: (watering: Watering) => void;
  onTaskCompletedFeedback?: (message: string) => void;
}

export const UpcomingTaskWidget: React.FC<UpcomingTaskWidgetProps> = ({
  cultivations,
  waterings,
  envRecords,
  userId = 'default_user',
  onSelectCultivation,
  onOpenWateringModal,
  onWateringAdded,
  onTaskCompletedFeedback,
}) => {
  const [tasksVersion, setTasksVersion] = useState(0);
  const [serverTasks, setServerTasks] = useState<CultivationTask[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoLogWatering, setAutoLogWatering] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAllTasksModal, setShowAllTasksModal] = useState(false);
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);

  // Fetch server-generated tasks (e.g. Alertas climáticas de Sincronización Inversa)
  useEffect(() => {
    let isMounted = true;
    taskService.fetchServerTasks(userId).then((fetched) => {
      if (isMounted && Array.isArray(fetched)) {
        setServerTasks(fetched);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [userId, tasksVersion]);

  // Listen for local task update events
  useEffect(() => {
    const handleTaskUpdated = () => {
      setTasksVersion((v) => v + 1);
    };
    window.addEventListener('cultiveta_task_updated', handleTaskUpdated);
    return () => {
      window.removeEventListener('cultiveta_task_updated', handleTaskUpdated);
    };
  }, []);

  // Compute tasks
  const allTasks = useMemo(() => {
    return taskService.getTasksForDashboard(cultivations, waterings, envRecords, userId, serverTasks);
  }, [cultivations, waterings, envRecords, userId, tasksVersion, serverTasks]);

  // Separate pending vs completed
  const pendingTasks = useMemo(() => allTasks.filter((t) => !t.isCompleted), [allTasks]);
  const completedTasks = useMemo(() => allTasks.filter((t) => t.isCompleted), [allTasks]);

  // Make sure currentIndex stays within pendingTasks range (or fallback to 0)
  const activeTask: CultivationTask | undefined = pendingTasks[currentIndex] || pendingTasks[0] || allTasks[0];

  const targetCrop = useMemo(() => {
    if (!activeTask) return undefined;
    return cultivations.find((c) => c.id === activeTask.cultivationId);
  }, [activeTask, cultivations]);

  // If activeIndex went out of bounds after completion
  useEffect(() => {
    if (currentIndex >= pendingTasks.length && pendingTasks.length > 0) {
      setCurrentIndex(0);
    }
  }, [pendingTasks.length, currentIndex]);

  const handleCompleteTask = async (task: CultivationTask) => {
    setIsProcessing(true);
    setJustCompletedId(task.id);
    try {
      const res = await taskService.completeTask(task, userId, {
        logWateringRecord: autoLogWatering && task.type === 'watering',
        potSizeLiters: targetCrop?.substrate?.potVolumeLiters,
        stage: targetCrop?.currentStage,
      });

      if (res.wateringCreated && onWateringAdded) {
        onWateringAdded(res.wateringCreated);
      }

      setTasksVersion((v) => v + 1);

      if (onTaskCompletedFeedback) {
        const msg =
          task.type === 'watering' && autoLogWatering
            ? `¡Riego completado y registrado para "${task.cultivationName}"!`
            : `¡Tarea "${task.title}" marcada como completada!`;
        onTaskCompletedFeedback(msg);
      }
    } catch (err) {
      console.error('Error completing task:', err);
    } finally {
      setIsProcessing(false);
      setTimeout(() => {
        setJustCompletedId(null);
      }, 1800);
    }
  };

  const handleUncompleteTask = (taskId: string) => {
    taskService.uncompleteTask(taskId, userId);
    setTasksVersion((v) => v + 1);
    if (onTaskCompletedFeedback) {
      onTaskCompletedFeedback('Tarea restaurada a pendiente.');
    }
  };

  // If no active cultivations
  if (cultivations.filter((c) => !c.isFinished).length === 0) {
    return null;
  }

  const getTaskIcon = (type: CultivationTask['type']) => {
    switch (type) {
      case 'watering':
        return <Droplets className="w-4 h-4 text-cyan-400" />;
      case 'flush':
        return <Droplets className="w-4 h-4 text-blue-400" />;
      case 'defoliation':
        return <Scissors className="w-4 h-4 text-amber-400" />;
      case 'stage_change':
        return <Flower2 className="w-4 h-4 text-emerald-400" />;
      case 'harvest':
        return <Sparkles className="w-4 h-4 text-amber-400" />;
      case 'env_alert':
        return <AlertTriangle className="w-4 h-4 text-rose-400" />;
      default:
        return <Clock className="w-4 h-4 text-emerald-400" />;
    }
  };

  const getUrgencyBadge = (urgency: CultivationTask['urgency'], priority: CultivationTask['priority']) => {
    if (urgency === 'overdue') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[10px] font-bold uppercase tracking-wider animate-pulse">
          <Flame className="w-3 h-3" />
          Atrasada
        </span>
      );
    }
    if (urgency === 'today') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold uppercase tracking-wider">
          <Sparkles className="w-3 h-3" />
          Para Hoy
        </span>
      );
    }
    if (urgency === 'tomorrow') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 text-[10px] font-bold uppercase tracking-wider">
          <Calendar className="w-3 h-3" />
          Mañana
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 text-[10px] font-bold uppercase tracking-wider">
        <Clock className="w-3 h-3" />
        Próximamente
      </span>
    );
  };

  // State A: All tasks completed for today
  if (pendingTasks.length === 0 && allTasks.length > 0) {
    const lastDone = completedTasks[0];
    return (
      <div
        id="dashboard-upcoming-task-widget"
        className="relative overflow-hidden bg-white rounded-[28px] p-5 sm:p-6 border border-[#EFE3CF] shadow-xs transition-all"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-[#62B95B]/15 text-[#62B95B] border border-[#62B95B]/30 shrink-0">
              <CheckCircle2 className="w-5 h-5 text-[#62B95B] stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#62B95B]">
                  Estado del Día
                </span>
                <span className="px-2 py-0.2 rounded-full bg-[#62B95B]/15 text-[#62B95B] text-[10px] font-extrabold">
                  Al día
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-extrabold text-[#29202F] mt-0.5">
                ¡Todas las tareas de hoy están completadas! 🌿
              </h3>
              <p className="text-xs text-[#6E5D77] mt-0.5">
                {lastDone
                  ? `Última tarea realizada: "${lastDone.title}" (${lastDone.cultivationName}). Todo tranqui por acá.`
                  : 'No tenés riegos pendientes ni alertas para la fecha de hoy.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            {lastDone && (
              <button
                type="button"
                onClick={() => handleUncompleteTask(lastDone.id)}
                className="px-3 py-1.5 rounded-xl bg-[#FAF2E1] border border-[#EFE3CF] hover:bg-[#EFE3CF] text-[#6E5D77] hover:text-[#29202F] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Deshacer última tarea marcada"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Deshacer</span>
              </button>
            )}

            {completedTasks.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAllTasksModal(true)}
                className="px-3 py-1.5 rounded-xl bg-[#FAF2E1] border border-[#EFE3CF] hover:bg-[#EFE3CF] text-[#29202F] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ListTodo className="w-3.5 h-3.5 text-[#6C45C7]" />
                <span>Ver Historial ({completedTasks.length})</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!activeTask) return null;

  return (
    <div
      id="dashboard-upcoming-task-widget"
      className={`relative overflow-hidden rounded-[28px] p-5 sm:p-6 border transition-all duration-300 shadow-xs ${
        activeTask.urgency === 'overdue'
          ? 'bg-[#EB7864]/10 border-[#EB7864]/40'
          : activeTask.urgency === 'today'
          ? 'bg-[#F3C843]/15 border-[#F3C843]/40'
          : 'bg-white border-[#EFE3CF]'
      }`}
    >
      <div className="relative z-10 flex flex-col gap-4">
        {/* Header Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#FFFDF7] border border-[#EFE3CF] flex items-center justify-center">
              {getTaskIcon(activeTask.type)}
            </div>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#6E5D77]">
              {activeTask.categoryLabel}
            </span>
            <span className="text-[#DECDB3]">·</span>
            {getUrgencyBadge(activeTask.urgency, activeTask.priority)}
          </div>

          {/* Stepper Navigation (if multiple tasks) */}
          <div className="flex items-center gap-2">
            {pendingTasks.length > 1 && (
              <div className="flex items-center bg-[#FFFDF7] border border-[#EFE3CF] rounded-xl p-0.5 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : pendingTasks.length - 1))}
                  className="p-1 text-[#6E5D77] hover:text-[#29202F] rounded-lg hover:bg-[#FAF2E1] transition-colors cursor-pointer"
                  title="Tarea anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 text-[10px] text-[#29202F] font-bold">
                  {currentIndex + 1} / {pendingTasks.length}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentIndex((prev) => (prev < pendingTasks.length - 1 ? prev + 1 : 0))}
                  className="p-1 text-[#6E5D77] hover:text-[#29202F] rounded-lg hover:bg-[#FAF2E1] transition-colors cursor-pointer"
                  title="Siguiente tarea"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowAllTasksModal(true)}
              className="p-1.5 rounded-xl bg-[#FFFDF7] border border-[#EFE3CF] hover:bg-[#FAF2E1] text-[#6E5D77] hover:text-[#29202F] text-xs transition-colors cursor-pointer"
              title="Ver todas las tareas"
            >
              <ListTodo className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base sm:text-lg font-extrabold text-[#29202F] tracking-tight">
                {activeTask.title}
              </h3>
              {targetCrop && (
                <button
                  type="button"
                  onClick={() => onSelectCultivation && onSelectCultivation(targetCrop)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#6C45C7]/10 border border-[#6C45C7]/20 text-[#6C45C7] text-xs font-semibold hover:bg-[#6C45C7]/20 transition-colors cursor-pointer"
                  title="Ver ficha de cultivo"
                >
                  <Sprout className="w-3 h-3 text-[#62B95B]" />
                  <span>{activeTask.cultivationName}</span>
                  {activeTask.stage && <span className="text-[10px] text-[#6E5D77]">({activeTask.stage})</span>}
                </button>
              )}
            </div>

            <p className="text-xs sm:text-sm text-[#6E5D77] leading-relaxed">
              {activeTask.description}
            </p>

            {activeTask.actionHint && (
              <div className="text-[11px] text-[#6E5D77] flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-[#9887A2]" />
                <span>Fecha sugerida: <strong className="text-[#29202F]">{activeTask.dueDate}</strong></span>
              </div>
            )}
          </div>

          {/* Action Button Section */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-[#EFE3CF]">
            {/* Quick watering auto-log toggle for watering tasks */}
            {activeTask.type === 'watering' && (
              <label
                className="flex items-center gap-1.5 text-[11px] text-[#6E5D77] hover:text-[#29202F] cursor-pointer select-none px-2.5 py-1.5 bg-[#FFFDF7] rounded-xl border border-[#EFE3CF]"
                title="Registrar automáticamente el riego en el historial con dosis y pH estándar"
              >
                <input
                  type="checkbox"
                  checked={autoLogWatering}
                  onChange={(e) => setAutoLogWatering(e.target.checked)}
                  className="rounded border-[#DECDB3] text-[#62B95B] focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
                />
                <span>Auto-anotar en bitácora</span>
              </label>
            )}

            {/* If user prefers detailed watering modal */}
            {activeTask.type === 'watering' && onOpenWateringModal && (
              <button
                type="button"
                onClick={() => onOpenWateringModal(targetCrop)}
                className="px-3.5 py-2.5 rounded-2xl bg-[#FFFDF7] hover:bg-[#FAF2E1] text-[#29202F] border border-[#EFE3CF] text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                title="Abrir formulario completo para especificar nutrientes, pH medido y EC"
              >
                <Droplets className="w-3.5 h-3.5 text-[#6C45C7]" />
                <span>Ver Detalles</span>
              </button>
            )}

            {/* Primary Direct Completion Button */}
            <button
              type="button"
              id="complete-task-btn"
              onClick={() => handleCompleteTask(activeTask)}
              disabled={isProcessing || justCompletedId === activeTask.id}
              className={`px-5 py-2.5 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                justCompletedId === activeTask.id
                  ? 'bg-[#62B95B] text-white'
                  : activeTask.urgency === 'overdue'
                  ? 'bg-[#EB7864] hover:bg-[#d96551] text-white shadow-[#EB7864]/20'
                  : 'bg-[#62B95B] hover:bg-[#52A54C] text-white shadow-[#62B95B]/20'
              } disabled:opacity-50`}
            >
              {justCompletedId === activeTask.id ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>¡Listo!</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  <span>Marcar como hecha</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Modal / Sheet showing all pending and completed tasks */}
      {showAllTasksModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#29202F]/40 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-xl bg-white rounded-[32px] border border-[#EFE3CF] shadow-2xl p-6 sm:p-7 space-y-5 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#EFE3CF]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#62B95B]/15 text-[#62B95B] border border-[#62B95B]/20">
                  <ListTodo className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#29202F]">Agenda de Tareas y Riegos</h3>
                  <p className="text-xs text-[#6E5D77]">
                    {pendingTasks.length} pendiente{pendingTasks.length !== 1 ? 's' : ''} · {completedTasks.length} completada{completedTasks.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAllTasksModal(false)}
                className="p-2 rounded-xl bg-[#FAF2E1] text-[#6E5D77] hover:text-[#29202F] hover:bg-[#EFE3CF] transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 pr-1 flex-1">
              {/* Pending Section */}
              <div className="space-y-2.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#9887A2] block">
                  Pendientes ({pendingTasks.length})
                </span>

                {pendingTasks.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-center text-xs text-[#6E5D77]">
                    No hay tareas pendientes en este momento. ¡Todo tranqui! 🌱
                  </div>
                ) : (
                  pendingTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                        task.urgency === 'overdue'
                          ? 'bg-[#EB7864]/10 border-[#EB7864]/30'
                          : task.urgency === 'today'
                          ? 'bg-[#F3C843]/15 border-[#F3C843]/30'
                          : 'bg-[#FFFDF7] border-[#EFE3CF]'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-[#29202F]">{task.title}</span>
                          <span className="text-[10px] text-[#6C45C7] font-semibold">({task.cultivationName})</span>
                          {getUrgencyBadge(task.urgency, task.priority)}
                        </div>
                        <p className="text-[11px] text-[#6E5D77]">{task.description}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCompleteTask(task)}
                        className="px-3 py-1.5 rounded-xl bg-[#62B95B] hover:bg-[#52A54C] text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 self-end sm:self-center shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Completar</span>
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Completed Section */}
              {completedTasks.length > 0 && (
                <div className="space-y-2.5 pt-2 border-t border-[#EFE3CF]">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#9887A2] block">
                    Completadas Recientes ({completedTasks.length})
                  </span>
                  {completedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-3 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] flex items-center justify-between gap-3 opacity-80 hover:opacity-100 transition-opacity"
                    >
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-[#62B95B] shrink-0" />
                        <div>
                          <div className="text-xs font-medium text-[#6E5D77] line-through">
                            {task.title} ({task.cultivationName})
                          </div>
                          <div className="text-[10px] text-[#9887A2]">
                            {task.completedAt ? `Completada el ${new Date(task.completedAt).toLocaleDateString()}` : 'Completada'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUncompleteTask(task.id)}
                        className="p-1.5 rounded-lg text-[#9887A2] hover:text-[#29202F] hover:bg-[#FAF2E1] text-xs transition-colors cursor-pointer"
                        title="Restaurar tarea a pendiente"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#EFE3CF] flex justify-end">
              <button
                type="button"
                onClick={() => setShowAllTasksModal(false)}
                className="px-5 py-2 rounded-xl bg-[#FAF2E1] hover:bg-[#EFE3CF] text-[#29202F] text-xs font-bold transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
