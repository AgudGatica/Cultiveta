import React from 'react';

/**
 * Carga diferida: lo que no hace falta para abrir la app (modales, pantallas) se baja aparte, la primera vez
 * que se usa o un rato después de entrar. Así el celular descarga menos JavaScript al abrir Cultiveta.
 */

/** React.lazy de un componente exportado con nombre; `preload()` lo descarga antes de que haga falta. */
export function lazyNamed<M extends Record<K, React.ComponentType<any>>, K extends keyof M>(load: () => Promise<M>, name: K) {
  return Object.assign(
    React.lazy(() => load().then((m) => ({ default: m[name] }))),
    { preload: load }
  );
}

/**
 * Baja en segundo plano, un rato después de entrar, lo que se abre seguido: así abre al instante y también sin
 * conexión (el service worker guarda los /assets/ que pasan por la red). Sin conexión no se intenta: el
 * navegador recuerda una descarga fallida y eso no abriría ni al volver la señal (hasta recargar la app).
 */
export function preloadWhenIdle(loaders: ReadonlyArray<() => Promise<unknown>>, delayMs = 3000): () => void {
  let idleId: number | null = null;
  const run = () => {
    if (!navigator.onLine) return;
    loaders.forEach((load) => load().catch(() => undefined));
  };
  const timer = window.setTimeout(() => {
    if (typeof window.requestIdleCallback === 'function') idleId = window.requestIdleCallback(run, { timeout: 4000 });
    else run();
  }, delayMs);
  return () => {
    window.clearTimeout(timer);
    if (idleId !== null) window.cancelIdleCallback(idleId);
  };
}

/**
 * true desde la primera vez que `open` es true. Para modales que antes quedaban siempre montados: se bajan
 * recién cuando se abren y después siguen montados como antes (conservan lo que tenían adentro).
 */
export function useOpenedOnce(open: boolean): boolean {
  const [opened, setOpened] = React.useState(open);
  if (open && !opened) setOpened(true);
  return opened || open;
}

interface LazyBoundaryProps {
  children: React.ReactNode;
  /** Lo que se muestra si no se pudo (sin conexión, o la app se actualizó y ya no está el archivo viejo). */
  fallback: React.ReactNode;
  /** Si cambia (por ejemplo, la pantalla), se vuelve a intentar mostrar el contenido. */
  resetKey?: unknown;
}

/** Si una parte de la app no se pudo bajar o mostrar, avisa en ese lugar en vez de dejar todo en blanco. */
export class LazyBoundary extends React.Component<LazyBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev: LazyBoundaryProps) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const reloadApp = () => window.location.reload();

/** Aviso en el lugar de una pantalla que no se pudo abrir. */
export const ViewLoadError: React.FC = () => (
  <div role="alert" className="cultiveta-card p-8 text-center space-y-3">
    <p className="text-sm font-bold text-ink">No se pudo abrir esta pantalla.</p>
    <p className="text-xs text-ink-muted">Revisá la conexión y volvé a cargar la app.</p>
    <button type="button" onClick={reloadApp} className="cultiveta-btn-secondary text-sm">
      Volver a cargar
    </button>
  </div>
);

/** Mientras se baja un modal (solo si no se bajó antes): un "Cargando…" encima de todo. */
const ModalLoading: React.FC = () => (
  <div role="status" className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div className="cultiveta-card px-5 py-3 text-sm font-semibold text-ink-muted shadow-xl">Cargando…</div>
  </div>
);

const ModalLoadError: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div role="alertdialog" aria-modal="true" aria-label="No se pudo abrir" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40">
    <div className="cultiveta-card p-6 w-full max-w-sm text-center space-y-3">
      <p className="text-sm font-bold text-ink">No se pudo abrir.</p>
      <p className="text-xs text-ink-muted">Revisá la conexión y volvé a cargar la app.</p>
      <div className="flex justify-center gap-2">
        <button type="button" onClick={onClose} className="cultiveta-btn-secondary text-sm">
          Cerrar
        </button>
        <button type="button" onClick={reloadApp} className="cultiveta-btn-primary text-sm">
          Volver a cargar
        </button>
      </div>
    </div>
  </div>
);

/**
 * Envuelve un modal con carga diferida: "Cargando…" mientras se baja y, si no se pudo, un aviso para cerrarlo
 * o volver a cargar la app. `open` es para los modales que quedan montados cerrados (ver useOpenedOnce).
 */
export const LazyModal: React.FC<{ open?: boolean; onClose: () => void; children: React.ReactNode }> = ({
  open = true,
  onClose,
  children,
}) => (
  <LazyBoundary fallback={open ? <ModalLoadError onClose={onClose} /> : null}>
    <React.Suspense fallback={open ? <ModalLoading /> : null}>{children}</React.Suspense>
  </LazyBoundary>
);
