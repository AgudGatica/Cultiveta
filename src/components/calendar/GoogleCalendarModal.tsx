import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  X,
  ExternalLink,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Clock,
  Sparkles,
  Droplets,
  Scissors,
  Flower2,
  RefreshCw,
  ShieldCheck,
  CalendarCheck,
  CheckCircle2
} from 'lucide-react';
import { Cultivation, GoogleCalendarEvent, CultivationCalendarPlan, Watering } from '../../types';
import { calendarService } from '../../services/calendarService';
import { authService } from '../../services/authService';

interface GoogleCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  cultivation: Cultivation;
  latestWatering?: Watering | null;
  onEventSynced?: () => void;
}

export const GoogleCalendarModal: React.FC<GoogleCalendarModalProps> = ({
  isOpen,
  onClose,
  cultivation,
  latestWatering,
  onEventSynced,
}) => {
  const [token, setToken] = useState<string | null>(authService.getAccessToken());
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [syncedEvents, setSyncedEvents] = useState<GoogleCalendarEvent[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Syncing state per item ID
  const [syncingItemId, setSyncingItemId] = useState<string | null>(null);

  // Delete confirmation dialog state (Mandatory requirement)
  const [eventToDelete, setEventToDelete] = useState<GoogleCalendarEvent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Custom Event Form State
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customDate, setCustomDate] = useState(
    new Date(Date.now() + 86400000).toISOString().split('T')[0]
  );
  const [customType, setCustomType] = useState<CultivationCalendarPlan['type']>('watering');
  const [customDescription, setCustomDescription] = useState('');
  const [isSubmittingCustom, setIsSubmittingCustom] = useState(false);

  // Refresh token on open
  useEffect(() => {
    if (isOpen) {
      const currentToken = authService.getAccessToken();
      setToken(currentToken);
      setErrorMsg(null);
      setSuccessMsg(null);
      if (currentToken) {
        loadEvents(currentToken);
      }
    }
  }, [isOpen, cultivation.id]);

  const loadEvents = async (accessToken: string) => {
    setIsLoadingEvents(true);
    setErrorMsg(null);
    try {
      const events = await calendarService.listCultivationEvents(accessToken, cultivation.id);
      setSyncedEvents(events);
    } catch (err: any) {
      console.error('Error fetching calendar events:', err);
      // If token expired or invalid
      if (err.message?.includes('401') || err.message?.includes('Invalid Credentials')) {
        authService.setAccessToken(null);
        setToken(null);
        setErrorMsg('La sesión con Google Calendar ha expirado. Por favor, vuelve a conectar.');
      } else {
        setErrorMsg(err.message || 'No se pudieron cargar los eventos de Google Calendar.');
      }
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setErrorMsg(null);
    try {
      const newToken = await authService.connectGoogleCalendar();
      setToken(newToken);
      setSuccessMsg('¡Conexión con Google Calendar exitosa!');
      await loadEvents(newToken);
    } catch (err: any) {
      console.error('Failed to connect Google Calendar:', err);
      setErrorMsg(err.message || 'Error al conectar con Google Calendar.');
    } finally {
      setIsConnecting(false);
    }
  };

  // Suggested Plans
  const suggestedPlans = useMemo(() => {
    return calendarService.generateSuggestedPlans(cultivation, latestWatering);
  }, [cultivation, latestWatering]);

  // Check which plans are already synced by title/date comparison
  const planSyncMap = useMemo(() => {
    const map = new Map<string, GoogleCalendarEvent>();
    for (const plan of suggestedPlans) {
      const match = syncedEvents.find(
        (e) =>
          e.summary.toLowerCase().includes(plan.title.toLowerCase()) ||
          e.extendedProperties?.private?.cropEventCategory === plan.type
      );
      if (match) {
        map.set(plan.id, match);
      }
    }
    return map;
  }, [suggestedPlans, syncedEvents]);

  const handleSyncPlan = async (plan: CultivationCalendarPlan) => {
    if (!token) {
      handleConnect();
      return;
    }
    setSyncingItemId(plan.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const created = await calendarService.createCalendarEvent(token, cultivation, plan);
      setSyncedEvents((prev) => [...prev, created]);
      setSuccessMsg(`"${plan.title}" añadido exitosamente a Google Calendar.`);
      if (onEventSynced) onEventSynced();
    } catch (err: any) {
      console.error('Error syncing plan:', err);
      setErrorMsg(err.message || 'Error al sincronizar evento con Google Calendar.');
    } finally {
      setSyncingItemId(null);
    }
  };

  const handleCreateCustomEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!customTitle.trim()) {
      setErrorMsg('Por favor ingresa un título para el evento.');
      return;
    }

    setIsSubmittingCustom(true);
    setErrorMsg(null);
    try {
      const plan: CultivationCalendarPlan = {
        id: `custom_${Date.now()}`,
        title: customTitle.trim(),
        date: customDate,
        type: customType,
        description: customDescription.trim() || `Recordatorio para ${cultivation.name}`,
      };

      const created = await calendarService.createCalendarEvent(token, cultivation, plan);
      setSyncedEvents((prev) => [...prev, created]);
      setSuccessMsg(`Evento "${customTitle}" programado en tu Google Calendar.`);
      setShowCustomForm(false);
      setCustomTitle('');
      setCustomDescription('');
      if (onEventSynced) onEventSynced();
    } catch (err: any) {
      console.error('Error creating custom event:', err);
      setErrorMsg(err.message || 'Error al crear el evento personalizado.');
    } finally {
      setIsSubmittingCustom(false);
    }
  };

  // Explicit confirmation dialog handler for deletion
  const confirmDeleteEvent = async () => {
    if (!token || !eventToDelete) return;
    setIsDeleting(true);
    setErrorMsg(null);
    try {
      await calendarService.deleteCalendarEvent(token, eventToDelete.id);
      setSyncedEvents((prev) => prev.filter((e) => e.id !== eventToDelete.id));
      setSuccessMsg(`Evento eliminado de tu Google Calendar.`);
      setEventToDelete(null);
    } catch (err: any) {
      console.error('Error deleting event:', err);
      setErrorMsg(err.message || 'Error al eliminar el evento de Google Calendar.');
    } finally {
      setIsDeleting(false);
    }
  };

  const getPlanIcon = (type: CultivationCalendarPlan['type']) => {
    switch (type) {
      case 'watering':
        return <Droplets className="w-4 h-4 text-cyan-400" />;
      case 'stage_change':
        return <Flower2 className="w-4 h-4 text-emerald-400" />;
      case 'defoliation':
        return <Scissors className="w-4 h-4 text-amber-400" />;
      case 'flush':
        return <Droplets className="w-4 h-4 text-blue-400" />;
      case 'harvest':
        return <CalendarCheck className="w-4 h-4 text-amber-400" />;
      default:
        return <Clock className="w-4 h-4 text-emerald-400" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#0F0F0F] border border-zinc-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl my-8 relative flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-white">Google Calendar Sync</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {cultivation.name}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Sincroniza riegos, cambios de ciclo y fechas de cosecha con tu cuenta
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Messages */}
          {errorMsg && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-3">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <p className="flex-1">{errorMsg}</p>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-rose-400 hover:text-white text-xs underline cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          )}

          {successMsg && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <p className="flex-1">{successMsg}</p>
              <button
                type="button"
                onClick={() => setSuccessMsg(null)}
                className="text-emerald-400 hover:text-white text-xs underline cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          )}

          {/* Connection Status Card */}
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center p-2 shadow-xs shrink-0">
                <svg viewBox="0 0 48 48" className="w-full h-full">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">Google Calendar</span>
                  {token ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      <ShieldCheck className="w-3 h-3" /> Conectado
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                      No conectado
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {token
                    ? 'Los eventos se sincronizan directamente en tu calendario principal.'
                    : 'Conecta tu cuenta para enviar recordatorios automáticos a tu calendario.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!token ? (
                <button
                  type="button"
                  id="connect-google-calendar-btn"
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isConnecting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  )}
                  <span>Conectar Google Calendar</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadEvents(token)}
                    disabled={isLoadingEvents}
                    title="Actualizar eventos"
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingEvents ? 'animate-spin' : ''}`} />
                  </button>
                  <a
                    href="https://calendar.google.com"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-all flex items-center gap-1.5"
                  >
                    <span>Abrir Google</span>
                    <ExternalLink className="w-3 h-3 text-zinc-400" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Section: Hitos y Recordatorios Sugeridos del Cultivo */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                  Hitos Sugeridos para este Cultivo
                </h4>
              </div>
              <span className="text-[11px] text-zinc-500">
                Calculados según etapa y ciclo
              </span>
            </div>

            <div className="space-y-2.5">
              {suggestedPlans.map((plan) => {
                const syncedEvent = planSyncMap.get(plan.id);
                const isSyncing = syncingItemId === plan.id;

                return (
                  <div
                    key={plan.id}
                    className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-zinc-700 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                        {getPlanIcon(plan.type)}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-white">
                            {plan.title}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">
                            📅 {plan.date}
                          </span>
                          {syncedEvent && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <Check className="w-3 h-3" /> En tu calendario
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-relaxed max-w-md">
                          {plan.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {syncedEvent ? (
                        <a
                          href={syncedEvent.htmlLink || 'https://calendar.google.com'}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        >
                          <span>Ver en Calendar</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSyncPlan(plan)}
                          disabled={isSyncing}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {isSyncing ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Plus className="w-3 h-3 stroke-[2.5]" />
                          )}
                          <span>Sincronizar</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section: Eventos Sincronizados Existentes en Google Calendar */}
          {token && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4 text-cyan-400" />
                  <span>Eventos Registrados en tu Google Calendar ({syncedEvents.length})</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setShowCustomForm(!showCustomForm)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showCustomForm ? 'Cancelar' : 'Añadir Recordatorio Propio'}</span>
                </button>
              </div>

              {/* Custom Event Form */}
              {showCustomForm && (
                <form
                  onSubmit={handleCreateCustomEvent}
                  className="bg-zinc-900/90 border border-emerald-500/30 rounded-2xl p-4 space-y-3 animate-in fade-in"
                >
                  <span className="text-[11px] font-bold text-emerald-400 block">
                    Nuevo recordatorio personalizado en Google Calendar
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-medium text-zinc-400 block mb-1">
                        Título del recordatorio
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Aplicar aceite de Neem preventivo"
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        required
                        className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-medium text-zinc-400 block mb-1">
                        Fecha
                      </label>
                      <input
                        type="date"
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                        required
                        className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-medium text-zinc-400 block mb-1">
                      Descripción u observaciones
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Dosificación 3ml/L al apagar las luces"
                      value={customDescription}
                      onChange={(e) => setCustomDescription(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowCustomForm(false)}
                      className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingCustom}
                      className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isSubmittingCustom ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                      <span>Programar en Google Calendar</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Event List */}
              {isLoadingEvents ? (
                <div className="p-8 text-center text-zinc-500 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Cargando eventos desde Google Calendar...</span>
                </div>
              ) : syncedEvents.length === 0 ? (
                <div className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-800 text-center space-y-2">
                  <CalendarIcon className="w-6 h-6 text-zinc-600 mx-auto" />
                  <p className="text-xs text-zinc-400">
                    Aún no hay eventos registrados para este cultivo en tu Google Calendar.
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    Usa los hitos sugeridos arriba o crea uno personalizado.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {syncedEvents.map((evt) => {
                    const dateStr = evt.start?.date || evt.start?.dateTime?.split('T')[0] || 'Fecha no fijada';
                    return (
                      <div
                        key={evt.id}
                        className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3.5 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-white truncate">
                              {evt.summary}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700 shrink-0">
                              {dateStr}
                            </span>
                          </div>
                          {evt.description && (
                            <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                              {evt.description.split('\n')[0]}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {evt.htmlLink && (
                            <a
                              href={evt.htmlLink}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                              title="Abrir en Google Calendar"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setEventToDelete(evt)}
                            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Eliminar de Google Calendar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Listo
          </button>
        </div>
      </div>

      {/* Mandatory Confirmation Modal for Deleting Events */}
      {eventToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#141414] border border-rose-500/30 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h4 className="font-bold text-white text-base">
                ¿Eliminar evento de Google Calendar?
              </h4>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Estás a punto de borrar el evento{' '}
                <strong className="text-white">"{eventToDelete.summary}"</strong> de tu cuenta de Google Calendar. Esta acción no se puede deshacer.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEventToDelete(null)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteEvent}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-lg shadow-rose-600/20 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Confirmar Eliminación</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
