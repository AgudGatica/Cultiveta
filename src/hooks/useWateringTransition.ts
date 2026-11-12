import { useCallback, useEffect, useRef, useState } from 'react';

/** La transición de agua dura 2 segundos (48 cuadros a 24 por segundo). */
export const WATERING_TRANSITION_MS = 2000;
/** Lo único que se "dice" al registrar un riego: lo lee el lector de pantalla, no se ve. */
export const WATERING_ANNOUNCEMENT = 'Riego registrado.';

/**
 * Estado de la transición de agua que se ve al registrar un riego.
 *
 * - `play()` se llama recién cuando el riego quedó anotado (no al abrir el formulario, ni si falló o se canceló).
 * - `playKey` cambia en cada riego: se usa como `key` para que la animación arranque de cero una sola vez.
 * - `announcement` va en una región `aria-live` oculta: confirma sin mostrar texto en pantalla.
 */
export function useWateringTransition() {
  const [playKey, setPlayKey] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const seq = useRef(0);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  /** Termina la animación `key` (si ya arrancó otra más nueva, esa sigue). */
  const finish = useCallback((key?: number) => {
    setPlayKey((current) => (key === undefined || key === current ? 0 : current));
  }, []);

  const play = useCallback(() => {
    clearTimers();
    seq.current += 1;
    const key = seq.current;
    setPlayKey(key);
    // Se vacía y se vuelve a escribir: así el lector de pantalla lo anuncia también en riegos seguidos.
    setAnnouncement('');
    timers.current.push(window.setTimeout(() => setAnnouncement(WATERING_ANNOUNCEMENT), 60));
    timers.current.push(window.setTimeout(() => setAnnouncement(''), 6000));
    // Si la animación no se pudo bajar o mostrar, igual se da por terminada.
    timers.current.push(window.setTimeout(() => finish(key), WATERING_TRANSITION_MS + 2500));
  }, [finish]);

  return { playKey, isPlaying: playKey > 0, play, finish, announcement };
}
