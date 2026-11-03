import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Send, Smartphone } from 'lucide-react';
import { pushNotifications, pushSupport, type PushSettings, type PushStatus, type PushSupport } from '../../services/pushNotifications';

const CATEGORIES: Array<{ id: keyof Omit<PushSettings, 'summaryHour'>; label: string; desc: string }> = [
  { id: 'resumen', label: 'Resumen del día', desc: 'Riego, tanque, poda y cosecha: un aviso por día, solo si hay algo para hacer.' },
  { id: 'clima', label: 'Clima', desc: 'Alertas de temperatura y humedad, al momento.' },
  { id: 'equipos', label: 'Equipos', desc: 'Si un equipo falla y cuando el riego automático riega.' },
  { id: 'comunidad', label: 'Comunidad', desc: 'Me gusta, comentarios y seguidores. No suenan de 23 a 8.' },
];

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/**
 * Ajustes → "Avisos al celular": activar este celular, qué avisos llegan, la hora del resumen y un aviso de
 * prueba que manda el servidor de verdad. En iPhone sin instalar explica cómo agregarla a la pantalla de inicio.
 */
export const PushSettingsSection: React.FC<{ onShowToast?: (msg: string) => void }> = ({ onShowToast }) => {
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
    <section id="push-settings" data-support={support} data-subscribed={on} className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold font-mono uppercase tracking-[0.18em] text-zinc-400 flex items-center gap-2">
          <Smartphone className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
          Avisos al celular
        </span>
        <span
          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
            on ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-zinc-800 text-zinc-400 border-zinc-700'
          }`}
        >
          {on ? 'Activados' : 'Apagados'}
        </span>
      </div>
      <p className="text-xs text-zinc-400">Te avisamos aunque la app esté cerrada.</p>

      {support === 'ios_needs_install' && (
        <div id="push-ios-steps" className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-3 text-xs text-zinc-300 space-y-1">
          <p className="font-bold text-zinc-100">En iPhone, primero agregá Cultiveta a la pantalla de inicio:</p>
          <ol className="list-decimal pl-4 space-y-0.5">
            <li>Tocá Compartir (el cuadrado con la flecha).</li>
            <li>Elegí "Agregar a inicio".</li>
            <li>Abrí Cultiveta desde ese ícono y volvé acá para activar los avisos.</li>
          </ol>
          <p className="text-zinc-500">Hace falta iOS 16.4 o más nuevo.</p>
        </div>
      )}
      {support === 'unsupported' && <p className="text-xs text-zinc-300">Este navegador no puede recibir avisos. En Android, abrí Cultiveta con Chrome.</p>}
      {support === 'denied' && (
        <p id="push-denied" className="text-xs text-zinc-300">
          Bloqueaste los avisos de Cultiveta en este navegador. Para activarlos: tocá el candado junto a la dirección → Notificaciones → Permitir, y volvé acá.
        </p>
      )}
      {support === 'ok' && status && !status.configured && <p className="text-xs text-zinc-300">Los avisos al celular todavía no están activos en Cultiveta.</p>}

      {support === 'ok' && status?.configured && !on && (
        <button
          type="button"
          id="push-enable"
          onClick={enable}
          disabled={busy === 'enable'}
          className="w-full min-h-11 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <Bell className="w-4 h-4" aria-hidden="true" />
          {busy === 'enable' ? 'Activando…' : 'Activar en este celular'}
        </button>
      )}

      {on && status && (
        <>
          <ul className="space-y-2">
            {CATEGORIES.map((c) => (
              <li key={c.id} className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-3">
                <div className="flex items-start justify-between gap-3">
                  <label htmlFor={`push-toggle-${c.id}`} className="text-xs cursor-pointer">
                    <span className="block font-bold text-zinc-100">{c.label}</span>
                    <span className="block text-zinc-400">{c.desc}</span>
                  </label>
                  {/* label: tocar el interruptor también lo cambia (y el área de toque llega a 44 px) */}
                  <label className="relative inline-flex items-center justify-center shrink-0 min-h-11 min-w-11 -my-2 cursor-pointer">
                    <input
                      type="checkbox"
                      id={`push-toggle-${c.id}`}
                      checked={status.settings[c.id]}
                      onChange={(e) => save({ [c.id]: e.target.checked })}
                      className="sr-only peer"
                    />
                    <span
                      aria-hidden="true"
                      className="relative w-11 h-6 bg-zinc-800 rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400 peer-checked:bg-emerald-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"
                    />
                  </label>
                </div>
                {c.id === 'resumen' && status.settings.resumen && (
                  <label className="mt-2 flex items-center justify-between gap-2 text-xs text-zinc-300">
                    A qué hora
                    <select
                      id="push-summary-hour"
                      value={status.settings.summaryHour}
                      onChange={(e) => save({ summaryHour: Number(e.target.value) })}
                      className="min-h-11 px-2 rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-100 text-xs cursor-pointer"
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
            <button
              type="button"
              id="push-test"
              onClick={test}
              disabled={busy === 'test'}
              className="flex-1 min-h-11 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
              {busy === 'test' ? 'Enviando…' : 'Mandarme un aviso de prueba'}
            </button>
            <button
              type="button"
              id="push-disable"
              onClick={disable}
              disabled={busy === 'disable'}
              className="min-h-11 px-3 py-2 rounded-xl text-zinc-400 hover:text-zinc-200 text-xs font-semibold cursor-pointer disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              <BellOff className="w-3.5 h-3.5" aria-hidden="true" />
              Desactivar en este celular
            </button>
          </div>
          {status.devices.length > 1 && <p className="text-[11px] text-zinc-500">Avisos activos en: {status.devices.join(', ')}.</p>}
        </>
      )}

      {error && (
        <p id="push-error" role="alert" className="text-xs font-semibold text-rose-400">
          {error}
        </p>
      )}
    </section>
  );
};
