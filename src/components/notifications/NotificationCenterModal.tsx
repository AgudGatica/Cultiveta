import React, { useEffect, useMemo, useState } from 'react';
import { X, Bell, AlertTriangle, CheckCircle2, RefreshCw, Settings } from 'lucide-react';
import { CultivationTask } from '../../types';
import { authFetch } from '../../services/apiClient';
import { PushSettingsSection } from '../user/PushSettingsSection';

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  onSelectCultivation?: (cultivationId: string) => void;
  onOpenPreferences?: () => void;
}

export interface AlertGroup {
  key: string;
  title: string;
  description: string;
  at: string;
  crops: Array<{ id: string; name: string }>;
}

/** La misma alerta del mismo día, en una sola tarjeta con todos sus cultivos (el clima es el mismo para todos). */
export function groupAlerts(alerts: CultivationTask[]): AlertGroup[] {
  const groups = new Map<string, AlertGroup>();
  for (const a of alerts) {
    const at = String(a.createdAt || a.dueDate || '');
    const key = `${a.title}|${at.slice(0, 10)}`;
    const group = groups.get(key) || { key, title: a.title, description: a.description, at, crops: [] };
    if (!group.crops.some((c) => c.id === a.cultivationId)) group.crops.push({ id: a.cultivationId, name: a.cultivationName });
    groups.set(key, group);
  }
  return [...groups.values()];
}

const whenText = (at: string) => {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '')}, ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
};

const MAX_CROP_BUTTONS = 4;

/**
 * La campana: activar los avisos en este celular y las últimas alertas de clima, agrupadas.
 * Activar es lo mismo que en Preferencias: la misma sección, que anota el celular de verdad.
 */
export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({ isOpen, onClose, userId, onSelectCultivation, onOpenPreferences }) => {
  const [recentAlerts, setRecentAlerts] = useState<CultivationTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const groups = useMemo(() => groupAlerts(recentAlerts), [recentAlerts]);

  const fetchRecentAlerts = async () => {
    setIsLoading(true);
    try {
      const res = await authFetch('/api/notifications/recent');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setRecentAlerts(data);
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

  const openCrop = (id: string) => {
    onSelectCultivation?.(id);
    onClose();
  };

  return (
    <div className="cultiveta-modal-overlay" role="presentation">
      <div
        id="notification-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-center-title"
        className="cultiveta-modal-container max-w-xl my-auto flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden animate-in fade-in"
      >
        {/* Cabecera */}
        <div className="p-5 sm:p-6 pb-4 border-b border-line flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-3 rounded-2xl bg-icon-bg text-brand shrink-0">
              <Bell className="w-6 h-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="notification-center-title" className="text-xl font-black text-ink">
                Avisos
              </h2>
              <p className="text-sm text-ink-muted">El clima de tus cultivos.</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onOpenPreferences && (
              <button
                type="button"
                id="modal-open-preferences-btn"
                onClick={onOpenPreferences}
                aria-label="Preferencias de avisos"
                className="min-h-11 min-w-11 flex items-center justify-center text-ink-muted hover:text-ink rounded-full hover:bg-track transition-colors cursor-pointer"
              >
                <Settings className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="min-h-11 min-w-11 flex items-center justify-center text-ink-muted hover:text-ink rounded-full hover:bg-track transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 min-h-0">
          <PushSettingsSection compact onOpenPreferences={onOpenPreferences} />

          <section aria-labelledby="notification-list-title" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 id="notification-list-title" className="text-sm font-bold text-ink">
                Últimas alertas
              </h3>
              <button type="button" onClick={fetchRecentAlerts} disabled={isLoading} className="min-h-11 px-2 text-xs font-bold text-brand flex items-center gap-1.5 cursor-pointer disabled:opacity-60">
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                Actualizar
              </button>
            </div>

            {groups.length === 0 ? (
              <div id="notification-empty" className="p-6 rounded-2xl bg-surface border border-line text-center space-y-1">
                <CheckCircle2 className="w-8 h-8 text-ok-ink mx-auto mb-2" aria-hidden="true" />
                <p className="text-sm font-bold text-ink">Sin alertas de clima recientes</p>
                <p className="text-xs text-ink-muted">Si algo se sale de rango, va a aparecer acá.</p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {groups.map((g) => {
                  const shown = g.crops.slice(0, MAX_CROP_BUTTONS);
                  const rest = g.crops.length - shown.length;
                  return (
                    <li key={g.key} data-alert-group={g.key} className="p-3.5 rounded-2xl bg-warn-bg border border-warn-line space-y-2.5">
                      <div className="flex items-start gap-3">
                        <span className="p-2 rounded-xl bg-white text-warn-ink shrink-0">
                          <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-ink">{g.title}</p>
                          <p className="text-xs text-ink mt-0.5">{g.description}</p>
                          <p className="text-xs font-semibold text-warn-ink mt-1">
                            {whenText(g.at)}
                            {g.crops.length > 1 ? ` · ${g.crops.length} cultivos` : ''}
                          </p>
                        </div>
                      </div>
                      {onSelectCultivation && (
                        <div className="flex flex-wrap items-center gap-2">
                          {shown.map((c) => (
                            <button key={c.id} type="button" onClick={() => openCrop(c.id)} aria-label={`Ver ${c.name}`} className="cultiveta-btn-secondary text-xs min-w-0">
                              <span className="truncate">{g.crops.length > 1 ? c.name : 'Ver cultivo'}</span>
                            </button>
                          ))}
                          {rest > 0 && <span className="text-xs font-semibold text-warn-ink">y {rest} más</span>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <p className="text-xs text-ink-muted">Revisamos el clima de tus cultivos de exterior e invernadero cada hora. Si algo se sale de rango, te avisamos.</p>
        </div>

        {/* Pie */}
        <div className="p-4 sm:p-5 border-t border-line flex justify-end">
          <button type="button" onClick={onClose} className="cultiveta-btn-secondary text-sm">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
