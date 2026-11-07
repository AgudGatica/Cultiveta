import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Send, Smartphone } from 'lucide-react';
import { pushNotifications, pushSupport, type PushSettings, type PushStatus, type PushSupport } from '../../services/pushNotifications';
import { Toggle } from '../common/Toggle';

const CATEGORIES: Array<{ id: keyof Omit<PushSettings, 'summaryHour'>; label: string; desc: string }> = [
  { id: 'resumen', label: 'Resumen del día', desc: 'Riego, tanque, poda y cosecha: un aviso por día, solo si hay algo para hacer.' },
  { id: 'clima', label: 'Clima', desc: 'Temperatura y humedad fuera de rango: un solo aviso por todas tus plantas, como mucho uno por hora.' },
  { id: 'equipos', label: 'Equipos', desc: 'Si un equipo falla y cuando el riego automático riega.' },
  { id: 'comunidad', label: 'Comunidad', desc: 'Me gusta, comentarios y seguidores. No suenan de 23 a 8.' },
];

const HOURS = Array.from({ length: 24 }, (_, h) => h);

interface PushSettingsSectionProps {
  onShowToast?: (msg: string) => void;
  /** En la campana: solo activar; las categorías y la prueba quedan en Preferencias. */
  compact?: boolean;
  onOpenPreferences?: () => void;
}

/**
 * "Avisos al celular": activar este celular, qué avisos llegan, la hora del resumen y un aviso de prueba que
 * manda el servidor de verdad. En iPhone sin instalar explica cómo agregarla a la pantalla de inicio.
 * Es el único lugar que activa los avisos (Preferencias y la campana usan esta misma sección).
 */
export const PushSettingsSection: React.FC<PushSettingsSectionProps> = ({ onShowToast, compact = false, onOpenPreferences }) => {
  const [support] = useState<PushSupport>(() => pushSupport());
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    pushNotifications
      .status()
      .then((s) => alive && setStatus(s))
      .catch((e) => alive && setError(e?.message || 'No se pudo ver el estado de los avisos.'));
    return () => {
      alive = false;
    };
  }, []);

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message || 'No se pudo completar. Probá de nuevo.');
    } finally {
      setBusy(null);
    }
  };

  const enable = () =>
    run('enable', async () => {
      setStatus(await pushNotifications.enable());
      onShowToast?.('Avisos activados en este celular');
    });
  const disable = () =>
    run('disable', async () => {
      await pushNotifications.disable();
      setStatus((s) => (s ? { ...s, subscribed: false } : s));
    });
  const test = () =>
    run('test', async () => {
      await pushNotifications.test();
      onShowToast?.('Aviso de prueba enviado: tiene que llegar en unos segundos');
    });
  const save = (partial: Partial<PushSettings>) =>
    run('settings', async () => {
      setStatus((s) => (s ? { ...s, settings: { ...s.settings, ...partial } } : s));
      const settings = await pushNotifications.saveSettings(partial);
      setStatus((s) => (s ? { ...s, settings } : s));
    });

  const on = !!status?.subscribed;
  return (
    <section id="push-settings" data-support={support} data-subscribed={on} className="p-4 rounded-2xl bg-surface border border-line space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-brand" aria-hidden="true" />
          Avisos al celular
        </h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${on ? 'bg-ok-bg text-ok-ink border-ok-line' : 'bg-track text-ink-muted border-line'}`}>
          {on ? 'Activados' : 'Apagados'}
        </span>
      </div>
      <p className="text-xs text-ink-muted">Te avisamos aunque la app esté cerrada.</p>

      {support === 'ios_needs_install' && (
        <div id="push-ios-steps" className="rounded-xl bg-white border border-line p-3 text-xs text-ink space-y-1">
          <p className="font-bold">En iPhone, primero agregá Cultiveta a la pantalla de inicio:</p>
          <ol className="list-decimal pl-4 space-y-0.5">
            <li>Tocá Compartir (el cuadrado con la flecha).</li>
            <li>Elegí "Agregar a inicio".</li>
            <li>Abrí Cultiveta desde ese ícono y volvé acá para activar los avisos.</li>
          </ol>
          <p className="text-ink-muted">Hace falta iOS 16.4 o más nuevo.</p>
        </div>
      )}
      {support === 'unsupported' && <p className="text-xs text-ink">Este navegador no puede recibir avisos. En Android, abrí Cultiveta con Chrome.</p>}
      {support === 'denied' && (
        <p id="push-denied" className="text-xs text-ink">
          Bloqueaste los avisos de Cultiveta en este navegador. Para activarlos: tocá el candado junto a la dirección → Notificaciones → Permitir, y volvé acá.
        </p>
      )}
      {support === 'ok' && status && !status.configured && <p className="text-xs text-ink">Los avisos al celular todavía no están activos en Cultiveta.</p>}

      {support === 'ok' && status?.configured && !on && (
        <button type="button" id="push-enable" onClick={enable} disabled={busy === 'enable'} className="cultiveta-btn-primary text-sm w-full disabled:opacity-60">
          <Bell className="w-4 h-4" aria-hidden="true" />
          {busy === 'enable' ? 'Activando…' : 'Activar en este celular'}
        </button>
      )}

      {on && status && compact && onOpenPreferences && (
        <button type="button" id="push-open-preferences" onClick={onOpenPreferences} className="cultiveta-btn-secondary text-sm w-full">
          Elegir qué avisos llegan
        </button>
      )}

      {on && status && !compact && (
        <>
          <ul className="space-y-2">
            {CATEGORIES.map((c) => (
              <li key={c.id} className="rounded-xl bg-white border border-line p-3">
                <div className="flex items-start justify-between gap-3">
                  <label htmlFor={`push-toggle-${c.id}`} className="text-xs cursor-pointer">
                    <span className="block text-sm font-bold text-ink">{c.label}</span>
                    <span className="block text-ink-muted">{c.desc}</span>
                  </label>
                  <Toggle id={`push-toggle-${c.id}`} checked={status.settings[c.id]} onChange={(checked) => save({ [c.id]: checked })} />
                </div>
                {c.id === 'resumen' && status.settings.resumen && (
                  <label className="mt-2 flex items-center justify-between gap-2 text-xs font-semibold text-ink">
                    A qué hora
                    <select
                      id="push-summary-hour"
                      value={status.settings.summaryHour}
                      onChange={(e) => save({ summaryHour: Number(e.target.value) })}
                      className="min-h-11 px-2 rounded-xl bg-surface border border-line text-ink text-sm cursor-pointer"
                    >
                      {HOURS.map((h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, '0')}:00
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" id="push-test" onClick={test} disabled={busy === 'test'} className="cultiveta-btn-secondary text-sm flex-1 disabled:opacity-60">
              <Send className="w-4 h-4 text-brand" aria-hidden="true" />
              {busy === 'test' ? 'Enviando…' : 'Mandarme un aviso de prueba'}
            </button>
            <button
              type="button"
              id="push-disable"
              onClick={disable}
              disabled={busy === 'disable'}
              className="min-h-11 px-3 py-2 rounded-xl text-ink-muted hover:text-ink text-xs font-semibold cursor-pointer disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              <BellOff className="w-3.5 h-3.5" aria-hidden="true" />
              Desactivar en este celular
            </button>
          </div>
          {status.devices.length > 1 && <p className="text-xs text-ink-muted">Avisos activos en: {status.devices.join(', ')}.</p>}
        </>
      )}

      {error && (
        <p id="push-error" role="alert" className="text-xs font-semibold text-error">
          {error}
        </p>
      )}
    </section>
  );
};
