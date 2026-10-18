/**
 * Rutas de la app (URL por pantalla).
 */
export type AppView =
  | 'dashboard'
  | 'cultivations'
  | 'cultivation_detail'
  | 'genetics'
  | 'harvests'
  | 'compare_crops'
  | 'ai_assistant'
  | 'calculators';

const VIEW_PATHS: Record<Exclude<AppView, 'cultivation_detail'>, string> = {
  dashboard: '/',
  cultivations: '/cultivos',
  genetics: '/geneticas',
  harvests: '/cosechas',
  compare_crops: '/comparador',
  ai_assistant: '/ia',
  calculators: '/calculadoras',
};

/** URL de una pantalla (para el detalle de cultivo usar /cultivos/:id). Desconocida → Inicio. */
export function pathForView(view: string): string {
  return (VIEW_PATHS as Record<string, string>)[view] ?? '/';
}

/** Pantalla y cultivo a partir de la URL. Cualquier ruta desconocida muestra el Inicio. */
export function parseAppRoute(pathname: string): { view: AppView; cultivationId: string | null } {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const detail = /^\/cultivos\/([^/]+)$/.exec(clean);
  if (detail) {
    return { view: 'cultivation_detail', cultivationId: decodeURIComponent(detail[1]) };
  }
  const entry = Object.entries(VIEW_PATHS).find(([, path]) => path === clean);
  return { view: (entry ? entry[0] : 'dashboard') as AppView, cultivationId: null };
}
