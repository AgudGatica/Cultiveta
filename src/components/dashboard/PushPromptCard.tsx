import React, { useEffect, useState } from 'react';
import { BellRing, CheckCircle2 } from 'lucide-react';
import { pushNotifications, pushSupport, type PushSupport } from '../../services/pushNotifications';

/**
 * Inicio, una sola vez: "¿Te avisamos cuándo regar?". Activa los avisos al celular con un toque, o en iPhone sin
 * instalar dice cómo agregar Cultiveta a la pantalla de inicio. "Ahora no" la esconde para siempre (también se
 * activan desde Ajustes).
 */
export const PushPromptCard: React.FC = () => {
  const [support] = useState<PushSupport>(() => pushSupport());
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pushNotifications.promptDismissed()) return;
    if (support === 'ios_needs_install') {
      setShow(true);
      return;
    }
    if (support !== 'ok' || Notification.permission !== 'default') return;
    let alive = true;
    pushNotifications
      .status()
      .then((s) => alive && setShow(s.configured && !s.subscribed))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [support]);

  if (!show) return null;

  const dismiss = () => {
    pushNotifications.dismissPrompt();
    setShow(false);
  };
  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      await pushNotifications.enable();
      pushNotifications.dismissPrompt();
      setDone(true);
    } catch (e: any) {
      setError(e?.message || 'No se pudo activar. Probá desde Ajustes.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <section id="home-push-prompt" data-state="done" className="cultiveta-card p-4 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-ok-ink shrink-0" aria-hidden="true" />
        <p className="text-sm font-semibold text-ink flex-1">Listo: te vamos a avisar. Lo cambiás cuando quieras en Ajustes.</p>
        <button type="button" onClick={() => setShow(false)} className="text-xs font-bold text-ink-muted min-h-9 px-2">
          Cerrar
        </button>
      </section>
    );
  }

  const ios = support === 'ios_needs_install';
  return (
    <section id="home-push-prompt" data-state={ios ? 'ios' : 'ask'} aria-labelledby="home-push-title" className="cultiveta-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
          <BellRing className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="space-y-0.5">
          <h2 id="home-push-title" className="text-base font-extrabold text-ink">
            {ios ? 'Avisos en tu iPhone' : '¿Te avisamos cuándo regar?'}
          </h2>
          <p className="text-xs text-ink-muted">
            {ios
              ? 'Para recibirlos, agregá Cultiveta a la pantalla de inicio (Compartir → Agregar a inicio) y abrila desde ese ícono.'
              : 'Un aviso por día con lo que toca (riego, tanque, poda) y las alertas de clima, aunque la app esté cerrada.'}
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs font-semibold text-error">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        {!ios && (
          <button type="button" id="home-push-enable" onClick={enable} disabled={busy} className="cultiveta-btn-primary text-sm flex-1 justify-center disabled:opacity-60">
            {busy ? 'Activando…' : 'Activar'}
          </button>
        )}
        <button type="button" id="home-push-dismiss" onClick={dismiss} className={`cultiveta-btn-secondary text-sm justify-center ${ios ? 'flex-1' : ''}`}>
          {ios ? 'Entendido' : 'Ahora no'}
        </button>
      </div>
    </section>
  );
};
