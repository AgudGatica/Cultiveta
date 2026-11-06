import React, { useState, useEffect } from 'react';
import { X, Thermometer, Droplets, CalendarCheck, Volume2, VolumeX, Save, RotateCcw, Settings } from 'lucide-react';
import { UserProfile, UserPreferences, UserAlertPreferences } from '../../types';
import { authService } from '../../services/authService';
import { browserNotificationService } from '../../services/browserNotificationService';
import { PushSettingsSection } from './PushSettingsSection';
import { Toggle } from '../common/Toggle';

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

/** Una opción con su interruptor. */
const ToggleRow: React.FC<{
  id: string;
  cardId?: string;
  icon: React.ElementType;
  title: string;
  desc?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ id, cardId, icon: Icon, title, desc, checked, onChange }) => (
  <div id={cardId} className="p-3 rounded-2xl bg-surface border border-line flex items-center gap-3">
    <span className="p-2 rounded-xl bg-icon-bg text-brand shrink-0">
      <Icon className="w-5 h-5" aria-hidden="true" />
    </span>
    <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
      <span className="block text-sm font-bold text-ink">{title}</span>
      {desc && <span className="block text-xs text-ink-muted">{desc}</span>}
    </label>
    <Toggle id={id} checked={checked} onChange={onChange} />
  </div>
);

/** Dos opciones, una elegida. */
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; text: string }>; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <div className="flex gap-1 p-1 rounded-2xl bg-track shrink-0" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`min-h-11 min-w-11 px-3 rounded-xl text-sm font-bold transition-colors cursor-pointer ${value === o.value ? 'bg-brand-deep text-white' : 'text-ink-muted hover:text-ink'}`}
          >
            {o.text}
          </button>
        ))}
      </div>
    </div>
  );
}

export const UserPreferencesModal: React.FC<UserPreferencesModalProps> = ({ isOpen, onClose, userProfile, onPreferencesUpdated, onShowToast }) => {
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
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [isSaving, setIsSaving] = useState(false);

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

  const handleResetDefaults = () => {
    setClimateAlerts(DEFAULT_ALERT_PREFERENCES.climateAlerts);
    setWateringAlerts(DEFAULT_ALERT_PREFERENCES.wateringAlerts);
    setCalendarReminders(DEFAULT_ALERT_PREFERENCES.calendarReminders);
    setSoundEnabled(DEFAULT_ALERT_PREFERENCES.soundEnabled ?? true);
    setTempUnit('C');
    setVolumeUnit('L');
    setAdvancedMode(false);
    onShowToast?.('Volvimos a los valores recomendados. Tocá Guardar para dejarlos.');
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
      onShowToast?.('Preferencias guardadas');
      onClose();
    } catch (err) {
      console.error('Error al guardar preferencias de usuario:', err);
      onShowToast?.('No se pudieron guardar las preferencias. Probá de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="user-preferences-title" id="user-preferences-modal" className="cultiveta-modal-overlay animate-fade-in">
      <div className="cultiveta-modal-container max-w-xl my-auto flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden">
        {/* Cabecera */}
        <div className="p-5 sm:p-6 pb-4 border-b border-line flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-3 rounded-2xl bg-icon-bg text-brand shrink-0">
              <Settings className="w-6 h-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="user-preferences-title" className="text-xl font-black text-ink">
                Preferencias
              </h2>
              <p className="text-sm text-ink-muted">Qué te avisamos y cómo.</p>
            </div>
          </div>
          <button
            type="button"
            id="close-user-preferences-btn"
            onClick={onClose}
            aria-label="Cerrar"
            className="min-h-11 min-w-11 flex items-center justify-center text-ink-muted hover:text-ink rounded-full hover:bg-track transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Contenido desplazable */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 min-h-0">
          {/* Avisos al celular (los manda el servidor aunque la app esté cerrada) */}
          <PushSettingsSection onShowToast={onShowToast} />

          {/* Mensajes mientras se usa la app */}
          <section aria-labelledby="pref-inapp-title" className="space-y-2">
            <div>
              <h3 id="pref-inapp-title" className="text-sm font-bold text-ink">
                Dentro de la app
              </h3>
              <p className="text-xs text-ink-muted">Lo que ves mientras usás Cultiveta.</p>
            </div>
            <ToggleRow
              id="toggle-climate-alerts"
              cardId="pref-card-climate-alerts"
              icon={Thermometer}
              title="Clima"
              desc="Un mensaje si la temperatura o la humedad se salen de rango."
              checked={climateAlerts}
              onChange={setClimateAlerts}
            />
            <ToggleRow
              id="toggle-watering-alerts"
              cardId="pref-card-watering-alerts"
              icon={Droplets}
              title="Riego atrasado"
              desc="Un mensaje si un cultivo pasó su ventana de riego."
              checked={wateringAlerts}
              onChange={setWateringAlerts}
            />
            <ToggleRow
              id="toggle-calendar-reminders"
              cardId="pref-card-calendar-reminders"
              icon={CalendarCheck}
              title="Calendario"
              desc="Cambio de luz, podas, lavado de raíces y cosecha."
              checked={calendarReminders}
              onChange={setCalendarReminders}
            />
            <ToggleRow id="toggle-sound-alerts" icon={soundEnabled ? Volume2 : VolumeX} title="Sonido en las alertas" checked={soundEnabled} onChange={setSoundEnabled} />
          </section>

          {/* Unidades y detalle */}
          <section aria-labelledby="pref-units-title" className="space-y-2">
            <h3 id="pref-units-title" className="text-sm font-bold text-ink">
              Unidades y detalle
            </h3>
            <div className="p-3 rounded-2xl bg-surface border border-line space-y-3">
              <Segmented<'C' | 'F'>
                label="Temperatura"
                value={tempUnit}
                onChange={setTempUnit}
                options={[
                  { value: 'C', text: '°C' },
                  { value: 'F', text: '°F' },
                ]}
              />
              <Segmented<'L' | 'gal'>
                label="Volumen"
                value={volumeUnit}
                onChange={setVolumeUnit}
                options={[
                  { value: 'L', text: 'Litros' },
                  { value: 'gal', text: 'Galones' },
                ]}
              />
            </div>
            <div className="p-3 rounded-2xl bg-surface border border-line flex items-center gap-3">
              <label htmlFor="toggle-advanced-mode" className="min-w-0 flex-1 cursor-pointer">
                <span className="block text-sm font-bold text-ink">Modo avanzado</span>
                <span className="block text-xs text-ink-muted">VPD, EC y pH con más detalle en los registros.</span>
              </label>
              <Toggle id="toggle-advanced-mode" checked={advancedMode} onChange={setAdvancedMode} />
            </div>
          </section>

          <button
            type="button"
            id="reset-preferences-btn"
            onClick={handleResetDefaults}
            className="min-h-11 px-2 text-xs font-bold text-ink-muted hover:text-ink transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Volver a los valores recomendados
          </button>
        </div>

        {/* Pie: siempre a la vista */}
        <div className="p-4 sm:p-5 border-t border-line flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="cultiveta-btn-secondary text-sm">
            Cancelar
          </button>
          <button type="button" id="save-preferences-btn" onClick={handleSavePreferences} disabled={isSaving} className="cultiveta-btn-primary text-sm flex-1 sm:flex-none disabled:opacity-50">
            <Save className="w-4 h-4" aria-hidden="true" />
            <span>{isSaving ? 'Guardando…' : 'Guardar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
