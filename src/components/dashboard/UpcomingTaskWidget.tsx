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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoLogWatering, setAutoLogWatering] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAllTasksModal, setShowAllTasksModal] = useState(false);
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);

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
    return taskService.getTasksForDashboard(cultivations, waterings, envRecords, userId);
  }, [cultivations, waterings, envRecords, userId, tasksVersion]);

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
        className="relative overflow-hidden bg-gradient-to-r from-emerald-950/20 via-[#0F0F0F] to-[#0F0F0F] rounded-[28px] p-5 sm:p-6 border border-emerald-500/25 shadow-xl transition-all"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-emerald-400">
                  Estado Operativo
                </span>
                <span className="px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold">
                  Al Día
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white mt-0.5">
                ¡Todas las tareas críticas de hoy están completadas! 🌿
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                {lastDone
                  ? `Última tarea realizada: "${lastDone.title}" (${lastDone.cultivationName}). Tus cultivos están en seguimiento óptimo.`
                  : 'No tienes riegos pendientes ni alertas agronómicas para la fecha de hoy.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            {lastDone && (
              <button
                type="button"
                onClick={() => handleUncompleteTask(lastDone.id)}
                className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
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
                className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ListTodo className="w-3.5 h-3.5 text-emerald-400" />
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
      className={`relative overflow-hidden rounded-[28px] p-5 sm:p-6 border transition-all duration-300 shadow-xl ${
        activeTask.urgency === 'overdue'
          ? 'bg-gradient-to-r from-rose-950/25 via-[#0F0F0F] to-[#0F0F0F] border-rose-500/30'
          : activeTask.urgency === 'today'
          ? 'bg-gradient-to-r from-amber-950/20 via-[#0F0F0F] to-[#0F0F0F] border-amber-500/30'
          : 'bg-[#0F0F0F] border-zinc-800'
      }`}
    >
      {/* Background subtle radial glow */}
      <div
        className={`absolute -right-16 -top-16 w-64 h-64 rounded-full pointer-events-none blur-3xl opacity-20 ${
          activeTask.urgency === 'overdue'
            ? 'bg-rose-500'
            : activeTask.urgency === 'today'
            ? 'bg-amber-500'
            : 'bg-emerald-500'
        }`}
      />

      <div className="relative z-10 flex flex-col gap-4">
        {/* Header Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              {getTaskIcon(activeTask.type)}
            </div>
            <span className="text-[11px] font-mono font-bold uppercase tracking-[0.18em] text-zinc-400">
              {activeTask.categoryLabel}
            </span>
            <span className="text-zinc-600">·</span>
            {getUrgencyBadge(activeTask.urgency, activeTask.priority)}
          </div>

          {/* Stepper Navigation (if multiple tasks) */}
          <div className="flex items-center gap-2">
            {pendingTasks.length > 1 && (
              <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : pendingTasks.length - 1))}
                  className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Tarea anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 text-[10px] text-zinc-300 font-bold">
                  {currentIndex + 1} / {pendingTasks.length}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentIndex((prev) => (prev < pendingTasks.length - 1 ? prev + 1 : 0))}
                  className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Siguiente tarea"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowAllTasksModal(true)}
              className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs transition-colors cursor-pointer"
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
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                {activeTask.title}
              </h3>
              {targetCrop && (
                <button
                  type="button"
                  onClick={() => onSelectCultivation && onSelectCultivation(targetCrop)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors cursor-pointer"
                  title="Ver ficha de cultivo"
                >
                  <Sprout className="w-3 h-3" />
                  <span>{activeTask.cultivationName}</span>
                  {activeTask.stage && <span className="text-[10px] text-emerald-500 font-mono">({activeTask.stage})</span>}
                </button>
              )}
            </div>

            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              {activeTask.description}
            </p>

            {activeTask.actionHint && (
              <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-zinc-500" />
                <span>Fecha sugerida: <strong className="text-zinc-200 font-mono">{activeTask.dueDate}</strong></span>
              </div>
            )}
          </div>

          {/* Action Button Section */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-zinc-800">
            {/* Quick watering auto-log toggle for watering tasks */}
            {activeTask.type === 'watering' && (
              <label
                className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-300 cursor-pointer select-none px-2 py-1 bg-zinc-900/60 rounded-xl border border-zinc-800/80"
                title="Registrar automáticamente el riego en el historial con dosis y pH estándar"
              >
                <input
                  type="checkbox"
                  checked={autoLogWatering}
                  onChange={(e) => setAutoLogWatering(e.target.checked)}
                  className="rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
                />
                <span>Auto-registrar en bitácora</span>
              </label>
            )}

            {/* If user prefers detailed watering modal */}
            {activeTask.type === 'watering' && onOpenWateringModal && (
              <button
                type="button"
                onClick={() => onOpenWateringModal(targetCrop)}
                className="px-3.5 py-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                title="Abrir formulario completo para especificar nutrientes, pH medido y EC"
              >
                <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                <span>Detalle</span>
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
                  ? 'bg-emerald-500 text-black'
                  : activeTask.urgency === 'overdue'
                  ? 'bg-rose-500 hover:bg-rose-400 text-black shadow-rose-950/20'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-950/20'
              } disabled:opacity-50`}
            >
              {justCompletedId === activeTask.id ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>¡Completada!</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  <span>Marcar como completada</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Modal / Sheet showing all pending and completed tasks */}
      {showAllTasksModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-xl bg-[#0F0F0F] rounded-[32px] border border-zinc-800 shadow-2xl p-6 sm:p-7 space-y-5 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  <ListTodo className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Agenda de Tareas y Riegos</h3>
                  <p className="text-xs text-zinc-400">
                    {pendingTasks.length} pendiente{pendingTasks.length !== 1 ? 's' : ''} · {completedTasks.length} completada{completedTasks.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAllTasksModal(false)}
                className="p-2 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 pr-1 flex-1">
              {/* Pending Section */}
              <div className="space-y-2.5">
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-500 block">
                  Pendientes ({pendingTasks.length})
                </span>

                {pendingTasks.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 text-center text-xs text-zinc-400">
                    No hay tareas pendientes en este momento.
                  </div>
                ) : (
                  pendingTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                        task.urgency === 'overdue'
                          ? 'bg-rose-950/20 border-rose-500/30'
                          : task.urgency === 'today'
                          ? 'bg-amber-950/15 border-amber-500/30'
                          : 'bg-zinc-900 border-zinc-800'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-white">{task.title}</span>
                          <span className="text-[10px] text-emerald-400 font-mono">({task.cultivationName})</span>
                          {getUrgencyBadge(task.urgency, task.priority)}
                        </div>
                        <p className="text-[11px] text-zinc-300">{task.description}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCompleteTask(task)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 self-end sm:self-center"
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
                <div className="space-y-2.5 pt-2 border-t border-zinc-800">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-500 block">
                    Completadas Recientes ({completedTasks.length})
                  </span>
                  {completedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-3 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 flex items-center justify-between gap-3 opacity-75 hover:opacity-100 transition-opacity"
                    >
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        <div>
                          <div className="text-xs font-medium text-zinc-300 line-through">
                            {task.title} ({task.cultivationName})
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            {task.completedAt ? `Completada el ${new Date(task.completedAt).toLocaleDateString()}` : 'Completada'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUncompleteTask(task.id)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 text-xs transition-colors cursor-pointer"
                        title="Restaurar tarea a pendiente"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAllTasksModal(false)}
                className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition-colors cursor-pointer"
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
