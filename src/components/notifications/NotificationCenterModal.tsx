import React, { useState, useEffect } from 'react';
import {
  X,
  Bell,
  BellRing,
  BellOff,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Sparkles,
  Volume2,
  RefreshCw,
  Send,
  ShieldCheck,
  Droplets,
  Thermometer,
} from 'lucide-react';
import { CultivationTask } from '../../types';
import { browserNotificationService } from '../../services/browserNotificationService';
import { Settings } from 'lucide-react';

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  onSelectCultivation?: (cultivationId: string) => void;
  onOpenPreferences?: () => void;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  onClose,
  userId,
  onSelectCultivation,
  onOpenPreferences,
}) => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [recentAlerts, setRecentAlerts] = useState<CultivationTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [cronTriggered, setCronTriggered] = useState(false);

  useEffect(() => {
    if (browserNotificationService.isSupported()) {
      setPermission(browserNotificationService.getPermission());
    }
  }, [isOpen]);

  const fetchRecentAlerts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/notifications/recent${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        setRecentAlerts(data);
      }
    } catch (e) {
      console.warn('Error fetching recent alerts:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRecentAlerts();
    }
  }, [isOpen, userId]);

  // Escuchar nuevas alertas en tiempo real
  useEffect(() => {
    const handleNewAlert = (e: Event) => {
      const customEvent = e as CustomEvent<{ task: CultivationTask }>;
      if (customEvent.detail?.task) {
        setRecentAlerts((prev) => [customEvent.detail.task, ...prev.filter((t) => t.id !== customEvent.detail.task.id)]);
      }
    };

    window.addEventListener('cultiveta_env_alert_received', handleNewAlert);
    return () => {
      window.removeEventListener('cultiveta_env_alert_received', handleNewAlert);
    };
  }, []);

  if (!isOpen) return null;

  const handleRequestPermission = async () => {
    const result = await browserNotificationService.requestPermission();
    setPermission(result);
  };

  const handleSendLocalTest = async () => {
    const success = await browserNotificationService.sendTestNotification();
    if (success) {
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);
    }
  };

  const handleTriggerServerCronAlert = async () => {
    setCronTriggered(true);
    try {
      const res = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        setTimeout(() => setCronTriggered(false), 3500);
      }
    } catch {
      setCronTriggered(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0F0F0F] rounded-[32px] border border-zinc-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Notificaciones de Alertas Climáticas
              </h2>
              <p className="text-xs text-zinc-400">
                Avisos en tiempo real para eventos de temperatura y humedad generados por el cron job
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenPreferences && (
              <button
                type="button"
                id="modal-open-preferences-btn"
                onClick={onOpenPreferences}
                className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Configurar qué tipos de alertas recibir"
              >
                <Settings className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Configurar Alertas</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Permission Status Box */}
          <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {permission === 'granted' ? (
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                ) : permission === 'denied' ? (
                  <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                    <BellOff className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                    <Bell className="w-5 h-5 animate-pulse" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-white">
                      Estado en el Navegador:
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        permission === 'granted'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : permission === 'denied'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {permission === 'granted'
                        ? 'Activadas'
                        : permission === 'denied'
                        ? 'Bloqueadas'
                        : 'Pendiente de Activar'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {permission === 'granted'
                      ? 'Las notificaciones del sistema operativo y Service Worker están habilitadas. Recibirás alertas incluso con la pestaña en segundo plano.'
                      : permission === 'denied'
                      ? 'Las notificaciones están bloqueadas en tu navegador. Puedes desbloquearlas haciendo clic en el icono de candado/ajustes de la barra de direcciones.'
                      : 'Permite las notificaciones para que el sistema te envíe alertas críticas de botrytis, calor extremo o heladas automáticamente.'}
                  </p>
                </div>
              </div>

              {permission !== 'granted' && (
                <button
                  type="button"
                  onClick={handleRequestPermission}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs shadow-md shadow-emerald-500/20 transition-all cursor-pointer shrink-0"
                >
                  Activar Notificaciones
                </button>
              )}
            </div>

            {/* Test Actions */}
            {permission === 'granted' && (
              <div className="pt-3 border-t border-zinc-800 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSendLocalTest}
                  disabled={testSent}
                  className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{testSent ? '¡Notificación enviada!' : 'Probar Notificación Local'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleTriggerServerCronAlert}
                  disabled={cronTriggered}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  title="Simula la emisión de un 'env_alert' desde el cron job del servidor hacia el stream SSE"
                >
                  <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                  <span>{cronTriggered ? 'Alerta SSE emitida...' : 'Simular Alerta del Cron Job (SSE)'}</span>
                </button>

                <span className="text-[11px] text-zinc-500 flex items-center gap-1 ml-auto">
                  <Volume2 className="w-3.5 h-3.5" />
                  Sonido sintético activado
                </span>
              </div>
            )}
          </div>

          {/* Cron Job Info Banner */}
          <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800 text-xs text-zinc-300 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-white">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span>Funcionamiento del Cron Job de Alertas Climáticas</span>
            </div>
            <p className="text-zinc-400 leading-relaxed">
              El servidor ejecuta un proceso programado (<code className="text-emerald-400 font-mono">* * * * *</code>) que monitorea los parámetros de tus cultivos de exterior e invernadero. Al detectar condiciones críticas (ej. humedad &gt; 75% en floración, temperatura &gt; 35°C o &lt; 11°C), genera automáticamente una tarea de tipo <strong className="text-zinc-200 font-mono">&apos;env_alert&apos;</strong> y la difunde vía Service Worker y Server-Sent Events (SSE).
            </p>
          </div>

          {/* Recent Alerts List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <span>Historial Reciente de Alertas &apos;env_alert&apos;</span>
                <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 text-[10px]">
                  {recentAlerts.length}
                </span>
              </h3>
              <button
                type="button"
                onClick={fetchRecentAlerts}
                disabled={isLoading}
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Actualizar</span>
              </button>
            </div>

            {recentAlerts.length === 0 ? (
              <div className="p-8 rounded-2xl bg-zinc-900/30 border border-zinc-800 text-center text-xs text-zinc-500 space-y-1">
                <CheckCircle2 className="w-8 h-8 text-emerald-500/40 mx-auto mb-2" />
                <p className="text-zinc-400 font-medium">No se registran alertas climáticas críticas pendientes.</p>
                <p>Las plantas se encuentran dentro de los parámetros recomendados para su etapa.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {recentAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-4 rounded-2xl bg-zinc-900/70 border border-rose-500/30 hover:border-rose-500/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 shrink-0">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono font-bold text-[10px]">
                            {alert.categoryLabel || '🚨 Alerta Climática'}
                          </span>
                          <span className="font-bold text-white">{alert.title}</span>
                        </div>
                        <p className="text-zinc-400 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-3 text-[11px] text-zinc-500 mt-1 font-mono">
                          <span>Cultivo: <strong className="text-zinc-300">{alert.cultivationName}</strong></span>
                          {alert.stage && <span>Etapa: <strong className="text-zinc-300">{alert.stage}</strong></span>}
                          {alert.createdAt && <span>{new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                        </div>
                      </div>
                    </div>

                    {onSelectCultivation && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectCultivation(alert.cultivationId);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold shrink-0 cursor-pointer transition-colors"
                      >
                        Ver Cultivo
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between text-xs text-zinc-500">
          <span>Notificaciones compatibles con Chrome, Edge, Firefox, Brave y Android PWA.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
