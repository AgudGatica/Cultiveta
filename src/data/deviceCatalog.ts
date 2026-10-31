/**
 * Equipos inteligentes (traído de la app de referencia Órbita): las marcas que Cultiveta va a poder
 * conectar y la guía de "Qué comprar" para quien todavía no tiene ninguno.
 * Los precios son orientativos (Argentina, 2026) y los botones abren una búsqueda en Mercado Libre.
 */

export type DeviceBrandId = 'tuya' | 'ewelink' | 'shelly';

export interface DeviceBrand {
  id: DeviceBrandId;
  label: string;
  /** La app del fabricante donde se agregan los equipos. */
  app: string;
  description: string;
}

export const DEVICE_BRANDS: DeviceBrand[] = [
  {
    id: 'tuya',
    label: 'Smart Life / Tuya',
    app: 'Smart Life',
    description: 'Enchufes, zapatillas y sensores de la app Smart Life o Tuya Smart. Muchas marcas genéricas usan Smart Life por dentro.',
  },
  {
    id: 'ewelink',
    label: 'Sonoff / eWeLink',
    app: 'eWeLink',
    description: 'Relés, enchufes y sensores Sonoff (TH, SNZB-02) de la app eWeLink.',
  },
  {
    id: 'shelly',
    label: 'Shelly',
    app: 'Shelly',
    description: 'Enchufes, relés y sensores Shelly, conectados por la nube de Shelly.',
  },
];

/** Para qué sirve cada tipo de equipo dentro de un cultivo. */
export type DeviceUse = 'luz' | 'ambiente' | 'riego';

export const DEVICE_USES: Array<{ id: DeviceUse; title: string; text: string }> = [
  {
    id: 'luz',
    title: 'Enchufe para la luz',
    text: 'La luz se prende y se apaga sola con el horario del cultivo, y ves si está prendida y cuánto falta para el próximo cambio. Con enchufe se pueden usar los superciclos.',
  },
  {
    id: 'ambiente',
    title: 'Sensor de temperatura y humedad',
    text: 'El ambiente se mide solo, todo el día, sin cargarlo a mano. Puede prender el extractor o el humidificador según lo que mide.',
  },
  {
    id: 'riego',
    title: 'Bomba de riego o sonda de sustrato',
    text: 'Riega los segundos que elijas y se apaga sola. Con la sonda ves cuánta agua tiene la maceta y puede regar cuando se seca.',
  },
];

export type ShopSection = 'enchufes' | 'sensores' | 'riego';

export interface ShopItem {
  id: string;
  section: ShopSection;
  brand: string;
  name: string;
  why: string;
  /** Búsqueda en Mercado Libre. */
  query: string;
  /** Precio orientativo en pesos [desde, hasta]. */
  ars: [number, number];
  install: 'Enchufar y usar' | 'Cableado básico';
  /** Ideal para empezar. */
  recommended?: boolean;
}

export const SHOP_SECTIONS: Record<ShopSection, string> = {
  enchufes: 'Enchufes y relés',
  sensores: 'Sensores',
  riego: 'Riego',
};

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'enchufe-medicion', section: 'enchufes', brand: 'Smart Life', name: 'Enchufe Wi-Fi con medición', why: 'Prende la luz y te dice cuánto consume. El más simple para empezar.', query: 'enchufe inteligente wifi medidor consumo', ars: [26000, 32000], install: 'Enchufar y usar', recommended: true },
  { id: 'sonoff-mini', section: 'enchufes', brand: 'Sonoff', name: 'Sonoff Basic / Mini / S31', why: 'Barato y confiable. El S31 es enchufe; el Basic y el Mini se cablean.', query: 'sonoff basic r4 mini s31 enchufe wifi', ars: [12000, 20000], install: 'Cableado básico', recommended: true },
  { id: 'shelly-plug', section: 'enchufes', brand: 'Shelly', name: 'Shelly Plug S', why: 'Enchufe con medición y muy buena terminación.', query: 'shelly plug s enchufe wifi medicion', ars: [18000, 26000], install: 'Enchufar y usar' },
  { id: 'zapatilla', section: 'enchufes', brand: 'Smart Life', name: 'Zapatilla Wi-Fi de 4 tomas', why: 'Cuatro equipos (luz, extractor, humidificador, bomba) en un solo aparato.', query: 'zapatilla regleta wifi inteligente medidor', ars: [60000, 80000], install: 'Enchufar y usar' },
  { id: 'sensor-th', section: 'sensores', brand: 'Smart Life', name: 'Sensor de temperatura y humedad Wi-Fi', why: 'Lo mínimo para ver el ambiente sin cargarlo a mano.', query: 'sensor temperatura humedad tuya wifi', ars: [25000, 35000], install: 'Enchufar y usar', recommended: true },
  { id: 'sonoff-th', section: 'sensores', brand: 'Sonoff', name: 'Sonoff TH Elite / SNZB-02', why: 'Buena precisión; algunos traen relé incorporado.', query: 'sonoff th elite sensor temperatura humedad', ars: [18000, 30000], install: 'Enchufar y usar' },
  { id: 'sensor-sustrato', section: 'sensores', brand: 'Smart Life', name: 'Sensor de humedad del sustrato', why: 'Muestra cuánta agua tiene la maceta; necesario para regar por humedad.', query: 'sensor humedad sustrato suelo tuya', ars: [14000, 20000], install: 'Enchufar y usar' },
  { id: 'bomba-enchufe', section: 'riego', brand: 'Shelly', name: 'Enchufe con medición para la bomba', why: 'Con medición detecta si la bomba trabaja en seco.', query: 'shelly plug s enchufe wifi medicion', ars: [18000, 26000], install: 'Enchufar y usar', recommended: true },
  { id: 'valvula', section: 'riego', brand: 'Sonoff', name: 'Válvula de riego Wi-Fi', why: 'Corta sola: el riego no queda abierto si se cae el Wi-Fi.', query: 'sonoff swv valvula riego inteligente', ars: [26000, 34000], install: 'Enchufar y usar' },
];

/** Búsqueda en Mercado Libre Argentina ("enchufe wifi" → listado.mercadolibre.com.ar/enchufe-wifi). */
export function mercadoLibreUrl(query: string): string {
  const slug = query.trim().toLowerCase().replace(/\s+/g, '-');
  return `https://listado.mercadolibre.com.ar/${encodeURIComponent(slug).replace(/%2D/gi, '-')}`;
}

export const formatArs = (n: number): string => `$${Math.round(n).toLocaleString('es-AR')}`;
