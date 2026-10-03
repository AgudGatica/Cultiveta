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
  CheckCircle2,
  Info,
} from 'lucide-react';
import { Cultivation, GoogleCalendarEvent, CultivationCalendarPlan, Watering, Genetics } from '../../types';
import { calendarService } from '../../services/calendarService';
import { authService } from '../../services/authService';
import { getLocalTodayDateOnly, addDays } from '../../utils/growthStageUtils';

interface GoogleCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  cultivation: Cultivation;
  latestWatering?: Watering | null;
  geneticsList?: Genetics[];
  onEventSynced?: () => void;
}

export const GoogleCalendarModal: React.FC<GoogleCalendarModalProps> = ({
  isOpen,
  onClose,
  cultivation,
  latestWatering,
  geneticsList = [],
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

  // Delete confirmation dialog state
  const [eventToDelete, setEventToDelete] = useState<GoogleCalendarEvent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Custom Event Form State
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customDate, setCustomDate] = useState<string>(() => addDays(getLocalTodayDateOnly(), 1));
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
      setCustomDate(addDays(getLocalTodayDateOnly(), 1));
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

  // Suggested Plans strictly synchronized with single source of truth
  const suggestedPlans = useMemo(() => {
    return calendarService.generateSuggestedPlans(cultivation, latestWatering, geneticsList);
  }, [cultivation, latestWatering, geneticsList]);

  // Check which plans are already synced by stageId or title
  const planSyncMap = useMemo(() => {
    const map = new Map<string, GoogleCalendarEvent>();
    for (const plan of suggestedPlans) {
      const match = syncedEvents.find(
        (e) =>
          (plan.stageId && e.extendedProperties?.private?.stageId === plan.stageId) ||
          e.summary.toLowerCase().includes(plan.title.toLowerCase())
      );
      if (match) {
        map.set(plan.id, match);
      }
    }
    return map;
  }, [suggestedPlans, syncedEvents]);

  const [isSyncingStages, setIsSyncingStages] = useState(false);

  const stagePlans = useMemo(() => {
    return suggestedPlans.filter((p) => p.type === 'stage_change' || p.type === 'harvest' || p.type === 'post_harvest');
  }, [suggestedPlans]);

  const handleSyncAllStages = async () => {
    if (!token) {
      handleConnect();
      return;
    }
    setIsSyncingStages(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    let createdCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    try {
      for (const plan of stagePlans) {
        const existingEvent = syncedEvents.find(
          (e) =>
            (plan.stageId && e.extendedProperties?.private?.stageId === plan.stageId) ||
            e.summary.toLowerCase().includes(plan.title.toLowerCase())
        );

        if (existingEvent) {
          const existingDate = existingEvent.start.date || existingEvent.start.dateTime?.split('T')[0];
          if (existingDate !== plan.date) {
            await calendarService.updateCalendarEvent(token, existingEvent.id, cultivation, plan);
            updatedCount++;
          } else {
            unchangedCount++;
          }
        } else {
          await calendarService.createCalendarEvent(token, cultivation, plan);
          createdCount++;
        }
      }

      await loadEvents(token);

      const msgParts: string[] = [];
      if (createdCount > 0) msgParts.push(`${createdCount} etapa(s) agregada(s)`);
      if (updatedCount > 0) msgParts.push(`${updatedCount} reprogramada(s) con nueva fecha`);
      if (unchangedCount > 0) msgParts.push(`${unchangedCount} ya estaban al día`);

      setSuccessMsg(`Etapas sincronizadas con Google Calendar: ${msgParts.join(', ')}. Volvé a sincronizar si modificás las fechas del cultivo.`);
      if (onEventSynced) onEventSynced();
    } catch (err: any) {
      console.error('Error syncing stages with calendar:', err);
      setErrorMsg(err.message || 'Error al sincronizar etapas con Google Calendar.');
    } finally {
      setIsSyncingStages(false);
    }
  };

  const handleSyncPlan = async (plan: CultivationCalendarPlan, existingEventId?: string) => {
    if (!token) {
      handleConnect();
      return;
    }
    setSyncingItemId(plan.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      if (existingEventId) {
        const updated = await calendarService.updateCalendarEvent(token, existingEventId, cultivation, plan);
        setSyncedEvents((prev) => prev.map((e) => (e.id === existingEventId ? updated : e)));
        setSuccessMsg(`"${plan.title}" reprogramado exitosamente a la fecha ${plan.date}.`);
      } else {
        const created = await calendarService.createCalendarEvent(token, cultivation, plan);
        setSyncedEvents((prev) => [...prev, created]);
        setSuccessMsg(`"${plan.title}" añadido exitosamente a Google Calendar.`);
      }
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

  const confirmDeleteEvent = async () => {
    if (!token || !eventToDelete) return;
    setIsDeleting(true);
    setErrorMsg(null);
    try {
      await calendarService.deleteCalendarEvent(token, eventToDelete.id);
      setSyncedEvents((prev) => prev.filter((e) => e.id !== eventToDelete.id));
      setSuccessMsg('Evento eliminado de tu Google Calendar.');
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
        return <Droplets className="w-4 h-4 text-[#62B95B]" />;
      case 'stage_change':
        return <Flower2 className="w-4 h-4 text-[#6C45C7]" />;
      case 'defoliation':
        return <Scissors className="w-4 h-4 text-[#F3C843]" />;
      case 'flush':
        return <Droplets className="w-4 h-4 text-[#6C45C7]" />;
      case 'harvest':
        return <CalendarCheck className="w-4 h-4 text-[#EB7864]" />;
      case 'post_harvest':
        return <Scissors className="w-4 h-4 text-[#6E5D77]" />;
      default:
        return <Clock className="w-4 h-4 text-[#62B95B]" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#FFFDF7] border border-[#EFE3CF] rounded-[32px] w-full max-w-2xl overflow-hidden shadow-2xl my-6 relative flex flex-col max-h-[90vh] text-[#29202F]">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-[#EFE3CF] flex items-center justify-between bg-[#FFF8E8]">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-white border border-[#EFE3CF] text-[#6C45C7] flex items-center justify-center shadow-xs shrink-0">
              <CalendarIcon className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-lg text-[#29202F]">Sincronización con Google Calendar</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FAF2E1] text-[#6C45C7] border border-[#EFE3CF]">
                  {cultivation.name}
                </span>
              </div>
              <p className="text-xs text-[#6E5D77] mt-0.5">
                Sincroniza transiciones de ciclo, riegos y fecha estimada de corte con recordatorio 24h antes
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-2xl bg-white border border-[#EFE3CF] text-[#6E5D77] hover:text-[#29202F] hover:bg-[#FAF2E1] flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Notifications */}
          {errorMsg && (
            <div className="p-4 rounded-2xl bg-[#EB7864]/10 border border-[#EB7864]/30 text-[#EB7864] text-xs flex items-center gap-3">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#EB7864]" />
              <p className="flex-1 font-medium">{errorMsg}</p>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-[#EB7864] hover:underline font-bold text-xs cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          )}

          {successMsg && (
            <div className="p-4 rounded-2xl bg-[#62B95B]/15 border border-[#62B95B]/30 text-[#2D6B28] text-xs flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#2D6B28]" />
              <p className="flex-1 font-medium">{successMsg}</p>
              <button
                type="button"
                onClick={() => setSuccessMsg(null)}
                className="text-[#2D6B28] hover:underline font-bold text-xs cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          )}

          {/* Connection Status Card */}
          <div className="bg-white border border-[#EFE3CF] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-white border border-[#EFE3CF] flex items-center justify-center p-2 shadow-2xs shrink-0">
                <svg viewBox="0 0 48 48" className="w-full h-full">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-[#29202F]">Cuenta de Google</span>
                  {token ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#2D6B28] bg-[#62B95B]/15 px-2 py-0.5 rounded-full border border-[#62B95B]/30">
                      <ShieldCheck className="w-3 h-3" /> Conectada
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-[#735308] bg-[#F3C843]/20 px-2 py-0.5 rounded-full border border-[#F3C843]/40">
                      No conectada
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#6E5D77] mt-0.5">
                  {token
                    ? 'Los eventos se integran directamente en tu Google Calendar.'
                    : 'Conecta tu cuenta para sincronizar los hitos del ciclo botánico.'}
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
                  className="px-4 py-2 rounded-2xl bg-[#6C45C7] hover:bg-[#5835A8] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
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
                    className="p-2.5 rounded-2xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] text-[#6E5D77] transition-colors cursor-pointer shadow-2xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingEvents ? 'animate-spin' : ''}`} />
                  </button>
                  <a
                    href="https://calendar.google.com"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="px-3.5 py-2 rounded-2xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] text-[#29202F] text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
                  >
                    <span>Abrir Google</span>
                    <ExternalLink className="w-3 h-3 text-[#6E5D77]" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Section: Hitos Sugeridos del Cultivo */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#6C45C7]" />
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#29202F]">
                  Hitos Sugeridos para este Cultivo
                </h4>
              </div>
              <span className="text-[11px] text-[#9887A2]">
                Fuente de verdad única del ciclo
              </span>
            </div>

            {/* Banner y Acción: Sincronizar etapas con Google Calendar */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#FFF8E8] border border-[#DECDB3] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div className="space-y-0.5">
                <span className="text-xs font-extrabold text-[#29202F] block">
                  Sincronización de Etapas ({stagePlans.length} etapas planificadas)
                </span>
                <p className="text-[11px] text-[#6E5D77]">
                  Crea o reprograma las fechas de transición y corte en tu calendario con recordatorio 24h antes.
                </p>
                <p className="text-[10px] text-[#9887A2] italic pt-0.5 flex items-center gap-1">
                  <Info className="w-3 h-3 text-[#6C45C7]" />
                  <span>Volvé a sincronizar si modificás las fechas del cultivo.</span>
                </p>
              </div>

              <button
                type="button"
                id="sync-all-stages-calendar-btn"
                onClick={handleSyncAllStages}
                disabled={isSyncingStages}
                className="px-4 py-2.5 rounded-2xl bg-[#6C45C7] hover:bg-[#5835A8] text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isSyncingStages ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CalendarCheck className="w-3.5 h-3.5 stroke-[2.2]" />
                )}
                <span>Sincronizar etapas con Google Calendar</span>
              </button>
            </div>

            {/* List of Suggested Plans */}
            <div className="space-y-2.5">
              {suggestedPlans.map((plan) => {
                const syncedEvent = planSyncMap.get(plan.id);
                const isSyncing = syncingItemId === plan.id;
                const existingDate = syncedEvent?.start?.date || syncedEvent?.start?.dateTime?.split('T')[0];
                const dateHasChanged = Boolean(syncedEvent && existingDate && existingDate !== plan.date);

                return (
                  <div
                    key={plan.id}
                    className="bg-white border border-[#EFE3CF] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[#DECDB3] transition-all shadow-2xs"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#FAF2E1] border border-[#EFE3CF] flex items-center justify-center shrink-0 mt-0.5">
                        {getPlanIcon(plan.type)}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-xs text-[#29202F]">
                            {plan.title}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#FAF2E1] text-[#6E5D77] border border-[#EFE3CF]">
                            📅 {plan.date}
                          </span>
                          {syncedEvent && !dateHasChanged && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#62B95B]/15 text-[#2D6B28] border border-[#62B95B]/30">
                              <Check className="w-3 h-3" /> En tu calendario
                            </span>
                          )}
                          {dateHasChanged && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F3C843]/25 text-[#735308] border border-[#F3C843]/40">
                              ⚠️ En Calendar: {existingDate}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#6E5D77] leading-relaxed max-w-md">
                          {plan.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {dateHasChanged && syncedEvent ? (
                        <button
                          type="button"
                          onClick={() => handleSyncPlan(plan, syncedEvent.id)}
                          disabled={isSyncing}
                          className="px-3.5 py-1.5 rounded-xl bg-[#F3C843] hover:bg-[#E5BC3A] text-[#29202F] text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {isSyncing ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3 stroke-[2.2]" />
                          )}
                          <span>Reprogramar fecha</span>
                        </button>
                      ) : syncedEvent ? (
                        <a
                          href={syncedEvent.htmlLink || 'https://calendar.google.com'}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] text-[#6C45C7] text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
                        >
                          <span>Ver en Calendar</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSyncPlan(plan)}
                          disabled={isSyncing}
                          className="px-3.5 py-1.5 rounded-2xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] text-[#6C45C7] text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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

          {/* Section: Eventos Registrados en Google Calendar */}
          {token && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#29202F] flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4 text-[#6C45C7]" />
                  <span>Eventos Registrados en tu Google Calendar ({syncedEvents.length})</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setShowCustomForm(!showCustomForm)}
                  className="text-xs text-[#6C45C7] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showCustomForm ? 'Cancelar' : 'Añadir Recordatorio Propio'}</span>
                </button>
              </div>

              {/* Custom Event Form */}
              {showCustomForm && (
                <form
                  onSubmit={handleCreateCustomEvent}
                  className="bg-white border border-[#DECDB3] rounded-2xl p-5 space-y-3 shadow-sm animate-in fade-in"
                >
                  <span className="text-xs font-extrabold text-[#6C45C7] block">
                    Nuevo recordatorio personalizado en Google Calendar
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-bold text-[#6E5D77] uppercase block mb-1">
                        Título del recordatorio
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Aplicar aceite de Neem preventivo"
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        required
                        className="w-full px-3 py-2 rounded-xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs text-[#29202F] placeholder-[#9887A2] focus:outline-none focus:border-[#6C45C7]"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-[#6E5D77] uppercase block mb-1">
                        Fecha
                      </label>
                      <input
                        type="date"
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                        required
                        className="w-full px-3 py-2 rounded-xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-none focus:border-[#6C45C7]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-[#6E5D77] uppercase block mb-1">
                      Descripción u observaciones
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Dosificación 3ml/L al apagar las luces"
                      value={customDescription}
                      onChange={(e) => setCustomDescription(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs text-[#29202F] placeholder-[#9887A2] focus:outline-none focus:border-[#6C45C7]"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowCustomForm(false)}
                      className="px-3.5 py-1.5 rounded-xl bg-white border border-[#EFE3CF] text-[#6E5D77] text-xs font-bold hover:bg-[#FAF2E1] cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingCustom}
                      className="px-4 py-1.5 rounded-xl bg-[#6C45C7] hover:bg-[#5835A8] text-white text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
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
                <div className="p-8 text-center text-[#6E5D77] text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#6C45C7]" />
                  <span>Cargando eventos desde Google Calendar...</span>
                </div>
              ) : syncedEvents.length === 0 ? (
                <div className="p-6 rounded-2xl bg-white border border-[#EFE3CF] text-center space-y-1.5 shadow-2xs">
                  <CalendarIcon className="w-6 h-6 text-[#9887A2] mx-auto" />
                  <p className="text-xs font-bold text-[#29202F]">
                    Aún no hay eventos registrados para este cultivo en tu Google Calendar.
                  </p>
                  <p className="text-[11px] text-[#6E5D77]">
                    Usa los hitos sugeridos arriba o programa uno personalizado.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {syncedEvents.map((evt) => {
                    const dateStr = evt.start?.date || evt.start?.dateTime?.split('T')[0] || 'Fecha s/d';
                    return (
                      <div
                        key={evt.id}
                        className="bg-white border border-[#EFE3CF] rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-2xs hover:border-[#DECDB3] transition-all"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-[#29202F] truncate">
                              {evt.summary}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#FAF2E1] text-[#6E5D77] border border-[#EFE3CF] shrink-0">
                              {dateStr}
                            </span>
                          </div>
                          {evt.description && (
                            <p className="text-[11px] text-[#6E5D77] truncate mt-0.5">
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
                              className="p-2 rounded-xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] text-[#6C45C7] transition-colors shadow-2xs"
                              title="Abrir en Google Calendar"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setEventToDelete(evt)}
                            className="p-2 rounded-xl bg-white hover:bg-[#EB7864]/10 border border-[#EFE3CF] text-[#6E5D77] hover:text-[#EB7864] transition-colors cursor-pointer shadow-2xs"
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
        <div className="p-4 border-t border-[#EFE3CF] bg-[#FFF8E8] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-2xl bg-[#29202F] hover:bg-[#3D3046] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
          >
            Listo
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Deleting Events */}
      {eventToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border border-[#EFE3CF] rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-[#29202F]">
            <div className="w-12 h-12 rounded-2xl bg-[#EB7864]/15 border border-[#EB7864]/30 text-[#EB7864] flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6 stroke-[2.2]" />
            </div>

            <div className="text-center space-y-2">
              <h4 className="font-extrabold text-[#29202F] text-base">
                ¿Eliminar evento de Google Calendar?
              </h4>
              <p className="text-xs text-[#6E5D77] leading-relaxed">
                Estás a punto de borrar el evento{' '}
                <strong className="text-[#29202F]">"{eventToDelete.summary}"</strong> de tu cuenta de Google Calendar. Esta acción no se puede deshacer.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEventToDelete(null)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-2xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] text-[#6E5D77] text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteEvent}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-2xl bg-[#EB7864] hover:bg-[#D4604D] text-white text-xs font-bold transition-all shadow-md shadow-[#EB7864]/20 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Eliminar Evento</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
