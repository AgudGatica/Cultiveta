/**
 * Rutas de la app (URL por pantalla).
 */
export type AppView =
  | 'dashboard'
  | 'cultivations'
  | 'cultivation_detail'
  | 'indoor_detail'
  | 'genetic_detail'
  | 'genetics'
  | 'compare_crops'
  | 'ai_assistant'
  | 'calculators'
  | 'profile'
  | 'achievements'
  | 'devices';

const VIEW_PATHS: Record<Exclude<AppView, 'cultivation_detail' | 'indoor_detail' | 'genetic_detail'>, string> = {
  dashboard: '/',
  cultivations: '/cultivos',
  genetics: '/geneticas',
  compare_crops: '/comparador',
  ai_assistant: '/ia',
  calculators: '/calculadoras',
  profile: '/perfil',
  achievements: '/perfil/logros',
  devices: '/equipos',
};

/** Cosechas se unió con Cultivos: /cosechas es una dirección vieja que lleva a /cultivos. */
export function isLegacyHarvestsPath(pathname: string): boolean {
  return (pathname.replace(/\/+$/, '') || '/') === '/cosechas';
}

/** URL de una pantalla (cultivo: /cultivos/:id; ambiente: /ambientes/:id; genética: /ambientes/:id/geneticas/:cultivo/:n). Desconocida → Jardín. */
export function pathForView(view: string): string {
  if (view === 'harvests') return VIEW_PATHS.cultivations;
  return (VIEW_PATHS as Record<string, string>)[view] ?? '/';
}

/** Pantalla, cultivo, ambiente y genética a partir de la URL. Cualquier ruta desconocida muestra el Jardín. */
export function parseAppRoute(pathname: string): { view: AppView; cultivationId: string | null; indoorId: string | null; geneticIndex?: number | null } {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const detail = /^\/cultivos\/([^/]+)$/.exec(clean);
  if (detail) {
    return { view: 'cultivation_detail', cultivationId: decodeURIComponent(detail[1]), indoorId: null };
  }
  const genetic = /^\/ambientes\/([^/]+)\/geneticas\/([^/]+)\/(\d+)$/.exec(clean);
  if (genetic) {
    return { view: 'genetic_detail', cultivationId: decodeURIComponent(genetic[2]), indoorId: decodeURIComponent(genetic[1]), geneticIndex: Number(genetic[3]) };
  }
  // /indoors/:id es la dirección vieja de un ambiente
  const indoor = /^\/(?:ambientes|indoors)\/([^/]+)$/.exec(clean);
  if (indoor) {
    return { view: 'indoor_detail', cultivationId: null, indoorId: decodeURIComponent(indoor[1]) };
  }
  if (isLegacyHarvestsPath(clean)) {
    return { view: 'cultivations', cultivationId: null, indoorId: null };
  }
  const entry = Object.entries(VIEW_PATHS).find(([, path]) => path === clean);
  return { view: (entry ? entry[0] : 'dashboard') as AppView, cultivationId: null, indoorId: null };
}

/** URL de un ambiente. */
export const pathForIndoor = (id: string) => `/ambientes/${encodeURIComponent(id)}`;
/** URL de una genética (n: su posición en el cultivo) dentro de su ambiente. */
export const pathForGenetic = (ambientId: string, cropId: string, index: number) => `/ambientes/${encodeURIComponent(ambientId)}/geneticas/${encodeURIComponent(cropId)}/${index}`;
