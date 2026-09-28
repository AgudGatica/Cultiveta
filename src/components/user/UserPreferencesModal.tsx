import React, { useState, useEffect } from 'react';
import {
  X,
  Bell,
  Thermometer,
  Droplets,
  CalendarCheck,
  Volume2,
  VolumeX,
  CheckCircle2,
  Save,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Send,
  Sliders,
  Settings,
  AlertTriangle,
  User as UserIcon,
} from 'lucide-react';
import { UserProfile, UserPreferences, UserAlertPreferences } from '../../types';
import { authService } from '../../services/authService';
import { browserNotificationService } from '../../services/browserNotificationService';

export interface UserPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile | null;
  onPreferencesUpdated?: (newPreferences: UserPreferences) => void;
  onShowToast?: (message: string) => void;
}

const DEFAULT_ALERT_PREFERENCES: UserAlertPreferences = {
  climateAlerts: true,
  wateringAlerts: true,
  calendarReminders: true,
  soundEnabled: true,
};

export const UserPreferencesModal: React.FC<UserPreferencesModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  onPreferencesUpdated,
  onShowToast,
}) => {
  // Estado local para tipos de alertas
  const [climateAlerts, setClimateAlerts] = useState<boolean>(true);
  const [wateringAlerts, setWateringAlerts] = useState<boolean>(true);
  const [calendarReminders, setCalendarReminders] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Preferencias generales
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');
  const [volumeUnit, setVolumeUnit] = useState<'L' | 'gal'>('L');
  const [advancedMode, setAdvancedMode] = useState<boolean>(false);

  // Estado de permisos de notificación
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>('default');
  const [isSaving, setIsSaving] = useState(false);
  const [testSent, setTestSent] = useState(false);

  // Cargar preferencias existentes del perfil
  useEffect(() => {
    if (isOpen) {
      const prefs = userProfile?.preferences;
      const alerts = prefs?.alertTypes;

      setClimateAlerts(alerts?.climateAlerts ?? DEFAULT_ALERT_PREFERENCES.climateAlerts);
      setWateringAlerts(alerts?.wateringAlerts ?? DEFAULT_ALERT_PREFERENCES.wateringAlerts);
      setCalendarReminders(alerts?.calendarReminders ?? DEFAULT_ALERT_PREFERENCES.calendarReminders);
      setSoundEnabled(alerts?.soundEnabled ?? DEFAULT_ALERT_PREFERENCES.soundEnabled ?? true);

      setTempUnit(prefs?.tempUnit || 'C');
      setVolumeUnit(prefs?.volumeUnit || 'L');
      setAdvancedMode(Boolean(prefs?.advancedMode));

      if (browserNotificationService.isSupported()) {
        setNotificationPermission(browserNotificationService.getPermission());
      }
    }
  }, [isOpen, userProfile]);

  // Manejo de tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleRequestPermission = async () => {
    const res = await browserNotificationService.requestPermission();
    setNotificationPermission(res);
    if (res === 'granted') {
      onShowToast?.('🔔 Permiso de notificaciones activado en tu navegador');
    }
  };

  const handleSendTestNotification = async () => {
    setTestSent(true);
    await browserNotificationService.sendTestNotification();
    onShowToast?.('🔔 Notificación de prueba enviada al sistema');
    setTimeout(() => setTestSent(false), 2500);
  };

  const handleResetDefaults = () => {
    setClimateAlerts(DEFAULT_ALERT_PREFERENCES.climateAlerts);
    setWateringAlerts(DEFAULT_ALERT_PREFERENCES.wateringAlerts);
    setCalendarReminders(DEFAULT_ALERT_PREFERENCES.calendarReminders);
    setSoundEnabled(DEFAULT_ALERT_PREFERENCES.soundEnabled ?? true);
    setTempUnit('C');
    setVolumeUnit('L');
    setAdvancedMode(false);
    onShowToast?.('🔄 Valores de alertas restablecidos a valores recomendados');
  };

  const handleSavePreferences = async () => {
    if (!userProfile?.uid) {
      onClose();
      return;
    }

    setIsSaving(true);
    const updatedAlertTypes: UserAlertPreferences = {
      climateAlerts,
      wateringAlerts,
      calendarReminders,
      soundEnabled,
    };

    const updatedPreferences: UserPreferences = {
      advancedMode,
      tempUnit,
      volumeUnit,
      notificationsEnabled: notificationPermission === 'granted',
      alertTypes: updatedAlertTypes,
    };

    try {
      await authService.updateUserPreferences(userProfile.uid, updatedPreferences);
      onPreferencesUpdated?.(updatedPreferences);
      onShowToast?.('✅ Preferencias de alertas guardadas correctamente');
      onClose();
    } catch (err) {
      console.error('Error al guardar preferencias de usuario:', err);
      onShowToast?.('⚠️ Ocurrió un error al guardar las preferencias');
    } finally {
      setIsSaving(false);
    }
  };

  const activeAlertsCount = [climateAlerts, wateringAlerts, calendarReminders].filter(Boolean).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      id="user-preferences-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-fade-in"
    >
      <div className="bg-[#0F0F0F] rounded-[32px] border border-zinc-800 shadow-2xl w-full max-w-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Cabecera del Modal */}
        <div className="p-5 sm:p-6 border-b border-zinc-800 flex items-center justify-between relative bg-gradient-to-r from-zinc-900/80 via-zinc-900/40 to-transparent">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 via-amber-500/15 to-purple-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-sm shadow-emerald-950/40">
              <Settings className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-emerald-400">
                  Configuración de Usuario
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px] font-mono font-bold">
                  {activeAlertsCount} de 3 Alertas Activas
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white mt-0.5">
                Preferencias & Gestión de Alertas
              </h2>
            </div>
          </div>

          <button
            type="button"
            id="close-user-preferences-btn"
            onClick={onClose}
            className="p-2 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer"
            title="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido desplazable */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* Tarjeta de Información de Usuario */}
          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {userProfile?.photoURL ? (
                <img
                  src={userProfile.photoURL}
                  alt="Avatar"
                  className="w-11 h-11 rounded-2xl object-cover border border-zinc-700 shrink-0"
                />
              ) : (
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-base shrink-0">
                  {userProfile?.displayName?.[0]?.toUpperCase() || <UserIcon className="w-5 h-5" />}
                </div>
              )}
              <div className="min-w-0">
                <span className="text-sm font-bold text-white block truncate">
                  {userProfile?.displayName || 'Cultivador'}
                </span>
                <span className="text-xs text-zinc-400 block truncate">
                  {userProfile?.email || 'Sin correo asociado'}
                </span>
              </div>
            </div>

            <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-xl bg-zinc-950 text-zinc-400 border border-zinc-800 shrink-0 self-start sm:self-auto flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Sincronizado con Firestore
            </span>
          </div>

          {/* SECCIÓN PRINCIPAL: Selección de Tipos de Alertas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold font-mono uppercase tracking-[0.18em] text-zinc-400">
                  Tipos de Alertas que Deseas Recibir
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Elige qué categorías de notificaciones y avisos automáticos mostrará la plataforma.
                </p>
              </div>
              <span className="text-[11px] text-zinc-400 font-mono hidden sm:inline">
                Filtro en tiempo real
              </span>
            </div>

            <div className="space-y-3">
              {/* Opción 1: Alertas Climáticas (Temperatura & Humedad) */}
              <div
                id="pref-card-climate-alerts"
                className={`p-4 rounded-2xl border transition-all ${
                  climateAlerts
                    ? 'bg-amber-500/5 border-amber-500/40 shadow-xs'
                    : 'bg-zinc-900/40 border-zinc-800/80 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`p-2.5 rounded-2xl border shrink-0 transition-colors ${
                        climateAlerts
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                      }`}
                    >
                      <Thermometer className="w-5 h-5 stroke-[2]" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">
                          Alertas Climáticas (Temperatura & Humedad)
                        </span>
                        <span
                          className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                            climateAlerts
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          Motor Cron + Gemini IA
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Avisos inmediatos si las condiciones ambientales superan los umbrales críticos de temperatura (&lt;11°C o &gt;35°C) o humedad excesiva (&gt;75% HR en floración, riesgo inminente de botrytis y pudrición de cogollos).
                      </p>
                      {climateAlerts && (
                        <p className="text-[11px] text-amber-300/90 pt-0.5">
                          ✓ Genera diagnósticos de contingencia técnica mediante Cultiveta IA ante cambios climáticos bruscos.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Switch Toggle */}
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      type="checkbox"
                      id="toggle-climate-alerts"
                      checked={climateAlerts}
                      onChange={(e) => setClimateAlerts(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>
              </div>

              {/* Opción 2: Alertas de Riego Agronómico */}
              <div
                id="pref-card-watering-alerts"
                className={`p-4 rounded-2xl border transition-all ${
                  wateringAlerts
                    ? 'bg-cyan-500/5 border-cyan-500/40 shadow-xs'
                    : 'bg-zinc-900/40 border-zinc-800/80 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`p-2.5 rounded-2xl border shrink-0 transition-colors ${
                        wateringAlerts
                          ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                          : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                      }`}
                    >
                      <Droplets className="w-5 h-5 stroke-[2]" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">
                          Alertas de Riego (Riegos Pendientes & Overdue)
                        </span>
                        <span
                          className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                            wateringAlerts
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          Ciclo Fenológico
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Avisos cuando un cultivo supera el ciclo de secado óptimo de sustrato según su fase fenológica (plántula, vegetativo o floración) para evitar deshidratación y retrasos en el crecimiento.
                      </p>
                      {wateringAlerts && (
                        <p className="text-[11px] text-cyan-300/90 pt-0.5">
                          ✓ Muestra el banner rojo de alto contraste y la tarjeta de urgencia en el Dashboard con acceso directo a regar.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Switch Toggle */}
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      type="checkbox"
                      id="toggle-watering-alerts"
                      checked={wateringAlerts}
                      onChange={(e) => setWateringAlerts(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                  </label>
                </div>
              </div>

              {/* Opción 3: Recordatorios de Calendario y Tareas */}
              <div
                id="pref-card-calendar-reminders"
                className={`p-4 rounded-2xl border transition-all ${
                  calendarReminders
                    ? 'bg-emerald-500/5 border-emerald-500/40 shadow-xs'
                    : 'bg-zinc-900/40 border-zinc-800/80 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`p-2.5 rounded-2xl border shrink-0 transition-colors ${
                        calendarReminders
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                      }`}
                    >
                      <CalendarCheck className="w-5 h-5 stroke-[2]" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">
                          Recordatorios de Calendario & Tareas Agronómicas
                        </span>
                        <span
                          className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                            calendarReminders
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          Agenda de Cultivo
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        Avisos de hitos programados en el calendario: cambio de fotoperiodo a 12/12, inicio de tablas de fertilización por semana, podas apicales, lavado de raíces y fecha estimada de cosecha.
                      </p>
                      {calendarReminders && (
                        <p className="text-[11px] text-emerald-300/90 pt-0.5">
                          ✓ Sincronizado con la fecha de inicio y la proyección recalculada por genética.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Switch Toggle */}
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      type="checkbox"
                      id="toggle-calendar-reminders"
                      checked={calendarReminders}
                      onChange={(e) => setCalendarReminders(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* CANALES Y NOTIFICACIONES DEL SISTEMA */}
          <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-mono uppercase tracking-[0.18em] text-zinc-400 flex items-center gap-2">
                <Bell className="w-3.5 h-3.5 text-zinc-400" />
                Canales de Entrega & Sistema
              </span>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                  notificationPermission === 'granted'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : notificationPermission === 'denied'
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}
              >
                {notificationPermission === 'granted'
                  ? 'Permitidas en Navegador'
                  : notificationPermission === 'denied'
                  ? 'Bloqueadas en Navegador'
                  : 'Pendiente de Permiso'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
              <div className="text-xs text-zinc-400">
                {notificationPermission === 'granted' ? (
                  <span>
                    El navegador tiene permisos activos para mostrar alertas de escritorio incluso en segundo plano.
                  </span>
                ) : (
                  <span>
                    Activa los permisos del navegador para recibir avisos acústicos y notificaciones fuera de la pestaña.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {notificationPermission !== 'granted' && (
                  <button
                    type="button"
                    id="request-permission-btn"
                    onClick={handleRequestPermission}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-colors cursor-pointer"
                  >
                    Activar en Navegador
                  </button>
                )}
                {notificationPermission === 'granted' && (
                  <button
                    type="button"
                    id="send-test-alert-btn"
                    onClick={handleSendTestNotification}
                    disabled={testSent}
                    className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3 h-3 text-emerald-400" />
                    <span>{testSent ? 'Enviada' : 'Probar Alerta'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Sonido de Alertas Acústico */}
            <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-zinc-300">
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-zinc-500" />
                )}
                <span>Sonido acústico para alertas críticas inmediatas</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  id="toggle-sound-alerts"
                  checked={soundEnabled}
                  onChange={(e) => setSoundEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>
          </div>

          {/* UNIDADES DE MEDIDA Y VISUALIZACIÓN */}
          <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800 space-y-3">
            <span className="text-xs font-bold font-mono uppercase tracking-[0.18em] text-zinc-400 block">
              Unidades de Medida y Métricas
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Unidad de Temperatura */}
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
                <span className="text-zinc-300">Unidad de Temperatura:</span>
                <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setTempUnit('C')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      tempUnit === 'C' ? 'bg-emerald-500 text-black shadow-xs' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    °C
                  </button>
                  <button
                    type="button"
                    onClick={() => setTempUnit('F')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      tempUnit === 'F' ? 'bg-emerald-500 text-black shadow-xs' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    °F
                  </button>
                </div>
              </div>

              {/* Unidad de Volumen */}
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between">
                <span className="text-zinc-300">Unidad de Volumen:</span>
                <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setVolumeUnit('L')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      volumeUnit === 'L' ? 'bg-emerald-500 text-black shadow-xs' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Litros (L)
                  </button>
                  <button
                    type="button"
                    onClick={() => setVolumeUnit('gal')}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      volumeUnit === 'gal' ? 'bg-emerald-500 text-black shadow-xs' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Galones
                  </button>
                </div>
              </div>
            </div>

            {/* Modo Avanzado */}
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex items-center justify-between text-xs">
              <div>
                <span className="text-white font-bold block">Modo Cultivador Avanzado</span>
                <span className="text-zinc-400 text-[11px]">
                  Muestra cálculos de VPD (Déficit de Presión de Vapor), EC y pH detallados en bitácoras.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
                <input
                  type="checkbox"
                  id="toggle-advanced-mode"
                  checked={advancedMode}
                  onChange={(e) => setAdvancedMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Footer con Acciones */}
        <div className="p-4 sm:p-5 border-t border-zinc-800 bg-zinc-950 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            id="reset-preferences-btn"
            onClick={handleResetDefaults}
            className="px-3.5 py-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-900 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restablecer</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              id="save-preferences-btn"
              onClick={handleSavePreferences}
              disabled={isSaving}
              className="px-5 py-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-colors shadow-lg shadow-emerald-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Guardando...' : 'Guardar Preferencias'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
