import React, { useCallback, useEffect, useRef, useState } from 'react';
import { WATERING_TRANSITION_MS } from '../../hooks/useWateringTransition';

/**
 * Transición de agua al registrar un riego: llueve, baja una ola que cubre la pantalla y se va por abajo.
 * Dura 2 segundos, no tiene textos y no frena nada: la app sigue andando detrás.
 *
 * Los dibujos salen de Blender (arte/transicion-riego/agua_transicion.py). Hay dos formas de mostrarlos:
 *  - Video WebM con transparencia, donde el navegador la muestra bien (se comprueba una vez, no se supone).
 *  - Respaldo vectorial: las mismas formas, cuadro por cuadro, dibujadas en un canvas (Safari y iPhone).
 * Con "menos movimiento" activado en el celular no hay animación: solo un velo celeste que aparece y se va.
 */

export type WaterFormat = 'mobile' | 'desktop';
export type WaterMode = 'video' | 'vector' | 'reduced';

type StripLayer = { t: 'y' | 'xy'; c: number; f: Array<number[] | null> };
type BlobLayer = { t: 'b'; c: number; k: number; r: number[] };
export interface WaterBake {
  w: number;
  h: number;
  fps: number;
  frames: number;
  /** Colores: agua, agua secundaria, sombras, reflejos, contornos. */
  pal: string[];
  /** X de cada columna de las tiras "y". */
  x: number[];
  /** Capas de atrás hacia adelante. */
  layers: Array<StripLayer | BlobLayer>;
  /** Por figura y por cuadro: x, y, escala X ×100, escala Y ×100, giro en décimas de grado (o null si no se ve). */
  tracks: Array<Array<number[] | null>>;
}

// Vite los publica con nombre propio en /assets (el service worker los guarda para usarlos sin conexión).
const ASSETS: Record<WaterFormat, { webm: string; bake: string }> = {
  mobile: {
    webm: new URL('../../assets/transiciones/riego-mobile.webm', import.meta.url).href,
    bake: new URL('../../assets/transiciones/riego-mobile.bake.json', import.meta.url).href,
  },
  desktop: {
    webm: new URL('../../assets/transiciones/riego-desktop.webm', import.meta.url).href,
    bake: new URL('../../assets/transiciones/riego-desktop.bake.json', import.meta.url).href,
  },
};

const cache = {
  video: {} as Partial<Record<WaterFormat, string>>,
  bake: {} as Partial<Record<WaterFormat, WaterBake>>,
  /** ¿Este navegador muestra la transparencia del WebM? Se averigua mirando un cuadro vacío del video. */
  alpha: 'unknown' as 'unknown' | 'yes' | 'no',
  jobs: new Map<string, Promise<unknown>>(),
};

function once<T>(key: string, job: () => Promise<T>): Promise<T> {
  const running = cache.jobs.get(key) as Promise<T> | undefined;
  if (running) return running;
  const started = job().catch((err) => {
    cache.jobs.delete(key); // se puede volver a intentar (por ejemplo, al recuperar la señal)
    throw err;
  });
  cache.jobs.set(key, started);
  return started;
}

/** Pantalla parada: versión vertical. Pantalla acostada o de escritorio: versión horizontal. */
export const pickWaterFormat = (): WaterFormat => (window.innerWidth >= window.innerHeight ? 'desktop' : 'mobile');

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function canPlayWebm(): boolean {
  const probe = document.createElement('video');
  return typeof probe.canPlayType === 'function' && probe.canPlayType('video/webm; codecs="vp9"') !== '';
}

const loadVideo = (fmt: WaterFormat) =>
  once(`video:${fmt}`, async () => {
    const res = await fetch(ASSETS[fmt].webm);
    if (!res.ok) throw new Error(`No se pudo bajar el video (${res.status})`);
    // Se reproduce desde memoria: arranca al instante y no depende de la red en el momento del riego.
    const url = URL.createObjectURL(await res.blob());
    cache.video[fmt] = url;
    return url;
  });

const loadBake = (fmt: WaterFormat) =>
  once(`bake:${fmt}`, async () => {
    const res = await fetch(ASSETS[fmt].bake);
    if (!res.ok) throw new Error(`No se pudo bajar el respaldo (${res.status})`);
    const bake = (await res.json()) as WaterBake;
    cache.bake[fmt] = bake;
    return bake;
  });

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Los últimos cuadros del video están vacíos. Si el navegador respeta la transparencia, al dibujarlos en un
 * canvas quedan transparentes; si no (Safari), quedan negros y opacos: ahí se usa el respaldo vectorial.
 */
async function probeAlpha(src: string): Promise<boolean> {
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = src;
    const until = async (ready: () => boolean, ms: number) => {
      const t0 = Date.now();
      while (!ready() && !video.error && Date.now() - t0 < ms) await sleep(40);
      return ready();
    };
    if (!(await until(() => video.readyState >= 2, 4000))) return false;
    video.currentTime = Math.max(0, (video.duration || WATERING_TRANSITION_MS / 1000) - 0.02);
    if (!(await until(() => !video.seeking && video.readyState >= 2, 2500))) return false;
    await sleep(120);
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(video, 0, 0, 8, 8);
    const px = ctx.getImageData(0, 0, 8, 8).data;
    let maxAlpha = 0;
    for (let i = 3; i < px.length; i += 4) maxAlpha = Math.max(maxAlpha, px[i]);
    video.removeAttribute('src');
    video.load();
    return maxAlpha < 16;
  } catch {
    return false;
  }
}

/**
 * Deja lista la animación antes de que haga falta (se llama al abrir el formulario de riego).
 * Devuelve con qué se va a mostrar, o null si no se pudo bajar nada (sin conexión la primera vez).
 */
export async function preloadWateringTransition(fmt: WaterFormat = pickWaterFormat()): Promise<WaterMode | null> {
  if (prefersReducedMotion()) return 'reduced';
  try {
    if (cache.alpha !== 'no' && canPlayWebm()) {
      const src = await loadVideo(fmt);
      if (cache.alpha === 'unknown') cache.alpha = (await once('probe', () => probeAlpha(src))) ? 'yes' : 'no';
      if (cache.alpha === 'yes') return 'video';
    } else {
      cache.alpha = 'no';
    }
  } catch {
    // Sin red o sin video: queda el respaldo vectorial
  }
  try {
    await loadBake(fmt);
    return 'vector';
  } catch {
    return null;
  }
}

/**
 * Dibuja un cuadro (1 a 48) del respaldo vectorial cubriendo todo el canvas, igual que el video con
 * `object-fit: cover`. Devuelve cuántas formas dibujó (0 = cuadro vacío).
 */
export function drawWaterFrame(ctx: CanvasRenderingContext2D, bake: WaterBake, frame: number, cw: number, ch: number): number {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const i = frame - 1;
  if (i < 0 || i >= bake.frames) return 0;
  const s = Math.max(cw / bake.w, ch / bake.h);
  const ox = (cw - bake.w * s) / 2;
  const oy = (ch - bake.h * s) / 2;
  const n = bake.x.length;
  let drawn = 0;

  for (const layer of bake.layers) {
    if (layer.t === 'b') {
      const tr = bake.tracks[layer.k]?.[i];
      if (!tr || tr[2] === 0 || tr[3] === 0) continue;
      ctx.setTransform(s, 0, 0, s, ox, oy);
      ctx.translate(tr[0], tr[1]);
      ctx.rotate((tr[4] * Math.PI) / 1800);
      ctx.scale(tr[2] / 100, tr[3] / 100);
      const r = layer.r;
      ctx.beginPath();
      ctx.moveTo(r[0] / 4, r[1] / 4);
      for (let j = 2; j < r.length; j += 2) ctx.lineTo(r[j] / 4, r[j + 1] / 4);
    } else {
      const d = layer.f[i];
      if (!d) continue;
      const xy = layer.t === 'xy';
      // Fila de arriba de izquierda a derecha y fila de abajo de vuelta, suavizadas (los puntos están cada 24 px)
      const px = (row: 0 | 1, j: number) => (xy ? d[row * 2 * n + 2 * j] : bake.x[j]);
      const py = (row: 0 | 1, j: number) => (xy ? d[row * 2 * n + 2 * j + 1] : d[row * n + j]);
      ctx.setTransform(s, 0, 0, s, ox, oy);
      ctx.beginPath();
      ctx.moveTo(px(0, 0), py(0, 0));
      for (let j = 1; j < n - 1; j++) ctx.quadraticCurveTo(px(0, j), py(0, j), (px(0, j) + px(0, j + 1)) / 2, (py(0, j) + py(0, j + 1)) / 2);
      ctx.lineTo(px(0, n - 1), py(0, n - 1));
      ctx.lineTo(px(1, n - 1), py(1, n - 1));
      for (let j = n - 2; j > 0; j--) ctx.quadraticCurveTo(px(1, j), py(1, j), (px(1, j) + px(1, j - 1)) / 2, (py(1, j) + py(1, j - 1)) / 2);
      ctx.lineTo(px(1, 0), py(1, 0));
    }
    ctx.closePath();
    ctx.fillStyle = bake.pal[layer.c];
    ctx.fill();
    drawn++;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return drawn;
}

const VideoWater: React.FC<{ src: string; onDone: () => void; onFail: () => void }> = ({ src, onDone, onFail }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return undefined;
    let started = false;
    const onPlaying = () => {
      started = true;
    };
    // Si en medio segundo no arrancó (el celular lo frenó), pasa al respaldo en vez de quedarse sin nada
    const watchdog = window.setTimeout(() => {
      if (!started) onFail();
    }, 500);
    video.muted = true;
    video.addEventListener('playing', onPlaying);
    video.addEventListener('ended', onDone);
    video.addEventListener('error', onFail);
    const playing = video.play();
    if (playing && typeof playing.catch === 'function') playing.catch(() => onFail());
    return () => {
      window.clearTimeout(watchdog);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('ended', onDone);
      video.removeEventListener('error', onFail);
      video.pause();
    };
  }, [onDone, onFail]);
  return <video ref={ref} src={src} muted playsInline preload="auto" disablePictureInPicture className="absolute inset-0 w-full h-full object-cover" />;
};

const VectorWater: React.FC<{ bake: WaterBake; onDone: () => void }> = ({ bake, onDone }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      onDone();
      return undefined;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    canvas.width = cw;
    canvas.height = ch;
    let raf = 0;
    let last = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const frame = Math.floor(((now - t0) / 1000) * bake.fps) + 1;
      if (frame > bake.frames) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        onDone();
        return;
      }
      if (frame !== last) {
        drawWaterFrame(ctx, bake, frame, cw, ch);
        last = frame;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [bake, onDone]);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full" />;
};

/** Con "menos movimiento": nada se desplaza, solo un velo del color del agua que aparece y se va. */
const ReducedWater: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') {
      const t = window.setTimeout(onDone, 50);
      return () => window.clearTimeout(t);
    }
    const fade = el.animate([{ opacity: 0 }, { opacity: 0.4 }, { opacity: 0 }], { duration: 650, easing: 'ease-in-out' });
    fade.onfinish = onDone;
    return () => fade.cancel();
  }, [onDone]);
  return <div ref={ref} className="absolute inset-0" style={{ backgroundColor: '#39C9E7', opacity: 0 }} />;
};

type Phase = { kind: 'wait' } | { kind: 'video'; src: string } | { kind: 'vector'; bake: WaterBake } | { kind: 'reduced' };

function initialPhase(fmt: WaterFormat, forced?: WaterMode): Phase {
  if (forced === 'reduced' || (!forced && prefersReducedMotion())) return { kind: 'reduced' };
  const video = cache.video[fmt];
  const bake = cache.bake[fmt];
  if (forced !== 'vector' && video && (forced === 'video' || cache.alpha === 'yes')) return { kind: 'video', src: video };
  if (forced !== 'video' && bake) return { kind: 'vector', bake };
  return { kind: 'wait' };
}

interface WateringTransitionProps {
  /** Se llama una sola vez, cuando terminó (o si no se pudo mostrar): ahí se desmonta. */
  onDone: () => void;
  /** Solo para pruebas: obliga una forma de mostrarla. */
  mode?: WaterMode;
  /** Solo para pruebas: obliga el formato. */
  format?: WaterFormat;
}

export const WateringTransition: React.FC<WateringTransitionProps> = ({ onDone, mode, format }) => {
  const [fmt] = useState<WaterFormat>(() => format ?? pickWaterFormat());
  const [phase, setPhase] = useState<Phase>(() => initialPhase(fmt, mode));
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  }, []);

  // Pase lo que pase, no queda colgada sobre la app
  useEffect(() => {
    const t = window.setTimeout(finish, WATERING_TRANSITION_MS + 1800);
    return () => window.clearTimeout(t);
  }, [finish]);

  // Todavía no hay nada listo: se espera un momento; si no llega, no se muestra nada
  useEffect(() => {
    if (phase.kind !== 'wait') return undefined;
    let alive = true;
    const giveUp = window.setTimeout(() => alive && finish(), 1200);
    const job: Promise<Phase | null> =
      mode === 'vector'
        ? loadBake(fmt).then((bake) => ({ kind: 'vector', bake }))
        : mode === 'video'
        ? loadVideo(fmt).then((src) => ({ kind: 'video', src }))
        : preloadWateringTransition(fmt).then((ready) =>
            ready === 'video' && cache.video[fmt]
              ? { kind: 'video', src: cache.video[fmt]! }
              : ready === 'vector' && cache.bake[fmt]
              ? { kind: 'vector', bake: cache.bake[fmt]! }
              : null
          );
    job
      .then((next) => {
        if (!alive) return;
        window.clearTimeout(giveUp);
        if (next) setPhase(next);
        else finish();
      })
      .catch(() => alive && finish());
    return () => {
      alive = false;
      window.clearTimeout(giveUp);
    };
  }, [phase.kind, mode, fmt, finish]);

  // El video no pudo arrancar: mismo dibujo con el respaldo vectorial
  const videoFailed = useCallback(() => {
    const bake = cache.bake[fmt];
    if (bake) {
      setPhase({ kind: 'vector', bake });
      return;
    }
    loadBake(fmt)
      .then((loaded) => {
        if (!doneRef.current) setPhase({ kind: 'vector', bake: loaded });
      })
      .catch(finish);
  }, [fmt, finish]);

  return (
    <div
      data-testid="watering-transition"
      data-mode={phase.kind}
      data-format={fmt}
      aria-hidden="true"
      // z-[65]: por encima de la app y de los formularios, por debajo de los avisos de XP y festejos (z-[70])
      className="fixed inset-0 z-[65] pointer-events-none overflow-hidden select-none"
    >
      {phase.kind === 'video' && <VideoWater src={phase.src} onDone={finish} onFail={videoFailed} />}
      {phase.kind === 'vector' && <VectorWater bake={phase.bake} onDone={finish} />}
      {phase.kind === 'reduced' && <ReducedWater onDone={finish} />}
    </div>
  );
};
