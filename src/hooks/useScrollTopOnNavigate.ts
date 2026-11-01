import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router';

/** Lleva la página arriba de todo (la que scrollea es la ventana, no el <main>). */
export function scrollToTop(smooth = false) {
  try {
    window.scrollTo({ top: 0, left: 0, behavior: smooth ? 'smooth' : 'auto' });
  } catch {
    // jsdom y navegadores viejos: sin opciones
    window.scrollTo(0, 0);
  }
}

/**
 * Cada pantalla arranca arriba de todo. Sin esto, al pasar de una pestaña a otra (o volver con
 * "atrás") quedaba el scroll que tenía la anterior. El navegador tampoco restaura el scroll al
 * volver: lo decide la app.
 */
export function useScrollTopOnNavigate() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);
  useLayoutEffect(() => {
    scrollToTop();
  }, [pathname]);
}
