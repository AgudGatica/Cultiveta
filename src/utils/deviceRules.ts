/**
 * Reglas de los equipos de clima y riego seguro (traído de Órbita). Lo usan el servidor (decide qué
 * prender) y la app (muestra y edita las reglas).
 *
 * - Equipos de clima: por sensor (prende al pasar un valor y apaga al volver, con margen para que no
 *   prenda y apague sin parar; opcional otro valor de noche), o siguiendo a la luz (o al revés).
 * - Riego: la bomba solo prende para regar, con la cuenta regresiva del propio enchufe (se apaga sola
 *   aunque se corte internet). Sin ese seguro, o fuera de los topes, no riega.
 */

export type ClimateRole = 'exhaust' | 'intake' | 'fan' | 'humidifier' | 'dehumidifier' | 'heater' | 'cooler';
export type ClimateMetric = 'temperature' | 'humidity' | 'vpd';
export type ClimateMode = 'sensor' | 'follow' | 'follow_inverted';

export interface ClimateRule {
  mode: ClimateMode;
  metric: ClimateMetric;
  on: number;
  off: number;
  /** Otros valores con la luz apagada (null = los mismos). */
  night: { on: number; off: number } | null;
  /** Si el sensor deja de mandar datos: apagar, prender o dejarlo como está. */
  sensorLoss: 'off' | 'on' | 'keep';
}

interface RoleInfo {
  label: string;
  metric?: ClimateMetric;
  /** Prende al SUBIR (above) o al BAJAR (below) el valor. */
  dir?: 'above' | 'below';
  on?: number;
  off?: number;
  /** No cambia lo que mide un sensor: por sensor quedaría prendido siempre. */
  noSensor?: boolean;
}

export const CLIMATE_ROLES: Record<ClimateRole, RoleInfo> = {
  exhaust: { label: 'Extractor', metric: 'temperature', dir: 'above', on: 27, off: 24 },
  intake: { label: 'Intracción', metric: 'temperature', dir: 'above', on: 27, off: 24 },
  fan: { label: 'Ventilador', noSensor: true },
  humidifier: { label: 'Humidificador', metric: 'humidity', dir: 'below', on: 45, off: 55 },
  dehumidifier: { label: 'Deshumidificador', metric: 'humidity', dir: 'above', on: 65, off: 57 },
  heater: { label: 'Calefactor', metric: 'temperature', dir: 'below', on: 18, off: 21 },
  cooler: { label: 'Refrigeración', metric: 'temperature', dir: 'above', on: 29, off: 26 },
};

export const CLIMATE_METRICS: Record<ClimateMetric, { label: string; unit: string; floor: number }> = {
  temperature: { label: 'Temperatura', unit: '°C', floor: 2 },
  humidity: { label: 'Humedad', unit: '%', floor: 5 },
  vpd: { label: 'VPD', unit: 'kPa', floor: 0.2 },
};

export const isClimateRole = (r: unknown): r is ClimateRole => typeof r === 'string' && r in CLIMATE_ROLES;

/** Dirección de la regla: depende del equipo (un humidificador prende al bajar la humedad). */
export function ruleDirection(role: ClimateRole, metric: ClimateMetric): 'above' | 'below' {
  const r = CLIMATE_ROLES[role];
  if (r.metric === metric && r.dir) return r.dir;
  // un humidificador que mira el VPD prende cuando el VPD SUBE (aire seco); el resto, como su métrica
  if (metric === 'vpd') return role === 'humidifier' ? 'above' : 'below';
  return r.dir || 'above';
}

export function defaultClimateRule(role: ClimateRole): ClimateRule {
  const r = CLIMATE_ROLES[role];
  if (r.noSensor) return { mode: 'follow', metric: 'temperature', on: 27, off: 24, night: null, sensorLoss: 'off' };
  return { mode: 'sensor', metric: r.metric || 'temperature', on: r.on ?? 27, off: r.off ?? 24, night: null, sensorLoss: 'off' };
}

/** Errores en castellano (vacío = la regla sirve). */
export function validateClimateRule(role: ClimateRole, rule: ClimateRule): string[] {
  const errs: string[] = [];
  const r = CLIMATE_ROLES[role];
  if (!['sensor', 'follow', 'follow_inverted'].includes(rule.mode)) return ['Elegí cómo se maneja el equipo.'];
  if (rule.mode !== 'sensor') return errs;
  if (r.noSensor) errs.push(`El ${r.label.toLowerCase()} no cambia la temperatura ni la humedad: por sensor quedaría prendido siempre. Usá "sigue a la luz".`);
  const m = CLIMATE_METRICS[rule.metric];
  if (!m) return [...errs, 'Elegí qué mide la regla.'];
  const dir = ruleDirection(role, rule.metric);
  const check = (on: number, off: number, tag: string) => {
    if (!Number.isFinite(on) || !Number.isFinite(off)) return errs.push(`Completá los valores${tag}.`);
    if (dir === 'above' && !(off < on)) errs.push(`${r.label} prende al SUBIR: el valor de apagado${tag} tiene que ser menor que el de encendido.`);
    if (dir === 'below' && !(off > on)) errs.push(`${r.label} prende al BAJAR: el valor de apagado${tag} tiene que ser mayor que el de encendido.`);
    if (Math.abs(on - off) + 1e-9 < m.floor) errs.push(`Dejá al menos ${m.floor} ${m.unit} entre prender y apagar${tag}: si no, el equipo prende y apaga sin parar.`);
    return 0;
  };
  check(rule.on, rule.off, '');
  if (rule.night) check(rule.night.on, rule.night.off, ' de noche');
  if (!['off', 'on', 'keep'].includes(rule.sensorLoss)) errs.push('Elegí qué hacer si el sensor deja de mandar datos.');
  return errs;
}

const svp = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
/** VPD del aire (kPa) a partir de temperatura y humedad. */
export const vpdAir = (t: number, rh: number) => Math.max(0, svp(t) * (1 - rh / 100));

export interface ClimateReadings {
  temperature: number | null;
  humidity: number | null;
}

const fmt = (v: number, unit: string) => `${String(Math.round(v * (unit === 'kPa' ? 100 : 10)) / (unit === 'kPa' ? 100 : 10)).replace('.', ',')} ${unit}`;

/**
 * ¿Va prendido el equipo? ctx.lightOn: luz del cultivo (null si no se sabe); ctx.currentOn: cómo está
 * ahora (entre el valor de encendido y el de apagado queda como está: así no prende y apaga sin parar).
 */
export function evaluateClimate(
  role: ClimateRole,
  rule: ClimateRule,
  ctx: { readings: ClimateReadings | null; lightOn: boolean | null; currentOn: boolean }
): { on: boolean; reason: string; sensorLost?: boolean } {
  if (rule.mode === 'follow' || rule.mode === 'follow_inverted') {
    if (ctx.lightOn == null) return { on: false, reason: 'sin horario de luz' };
    const on = rule.mode === 'follow' ? ctx.lightOn : !ctx.lightOn;
    return { on, reason: rule.mode === 'follow' ? 'sigue a la luz' : 'al revés de la luz' };
  }
  const r = ctx.readings;
  const value =
    rule.metric === 'vpd'
      ? r && r.temperature != null && r.humidity != null
        ? vpdAir(r.temperature, r.humidity)
        : null
      : r
        ? r[rule.metric]
        : null;
  if (value == null || !Number.isFinite(value)) {
    const on = rule.sensorLoss === 'on' ? true : rule.sensorLoss === 'keep' ? ctx.currentOn : false;
    return { on, reason: `sensor sin datos: ${rule.sensorLoss === 'on' ? 'prendido' : rule.sensorLoss === 'keep' ? 'queda como estaba' : 'apagado'}`, sensorLost: true };
  }
  const night = ctx.lightOn === false && !!rule.night;
  const th = night ? rule.night! : { on: rule.on, off: rule.off };
  const dir = ruleDirection(role, rule.metric);
  const on =
    dir === 'above' ? (value >= th.on ? true : value <= th.off ? false : ctx.currentOn) : value <= th.on ? true : value >= th.off ? false : ctx.currentOn;
  const unit = CLIMATE_METRICS[rule.metric].unit;
  return { on, reason: `${CLIMATE_METRICS[rule.metric].label.toLowerCase()} ${fmt(value, unit)}${night ? ' (noche)' : ''}` };
}

/** Texto corto de la regla: "prende ≥ 27 °C, apaga ≤ 24 °C". */
export function describeClimateRule(role: ClimateRole, rule: ClimateRule): string {
  if (rule.mode === 'follow') return 'prende y apaga con la luz';
  if (rule.mode === 'follow_inverted') return 'prende cuando la luz se apaga';
  const unit = CLIMATE_METRICS[rule.metric].unit;
  const dir = ruleDirection(role, rule.metric);
  const base = `prende ${dir === 'above' ? '≥' : '≤'} ${fmt(rule.on, unit)}, apaga ${dir === 'above' ? '≤' : '≥'} ${fmt(rule.off, unit)}`;
  return rule.night ? `${base} (de noche ${fmt(rule.night.on, unit)} / ${fmt(rule.night.off, unit)})` : base;
}

// ---------- riego seguro ----------

export interface PumpConfig {
  /** Caudal total (goteros × litros por hora de cada uno). */
  flowLph: number;
  /** Tope por riego, en segundos. */
  maxSeconds: number;
  /** Tope de litros por riego. */
  maxLiters: number;
}

export const DEFAULT_PUMP: PumpConfig = { flowLph: 8, maxSeconds: 300, maxLiters: 20 };

export function validatePump(cfg: PumpConfig): string[] {
  const errs: string[] = [];
  if (!(cfg.flowLph >= 0.1 && cfg.flowLph <= 2000)) errs.push('Caudal: entre 0,1 y 2000 litros por hora.');
  if (!(cfg.maxSeconds >= 10 && cfg.maxSeconds <= 1800)) errs.push('Tope por riego: entre 10 segundos y 30 minutos.');
  if (!(cfg.maxLiters >= 0.1 && cfg.maxLiters <= 500)) errs.push('Tope de litros: entre 0,1 y 500.');
  return errs;
}

export const secondsToLiters = (s: number, cfg: PumpConfig) => (s * cfg.flowLph) / 3600;
export const litersToSeconds = (l: number, cfg: PumpConfig) => (l / cfg.flowLph) * 3600;

/** Filtro de órdenes de riego: rechaza (no recorta) lo que esté fuera de rango. Sin seguro, no riega. */
export function checkWaterOrder(
  seconds: number,
  cfg: PumpConfig,
  pump: { online: boolean; hasCountdown: boolean }
): { ok: true; seconds: number; liters: number } | { ok: false; text: string } {
  if (!pump.online) return { ok: false, text: 'El enchufe de la bomba no responde: no se riega sin confirmación del equipo.' };
  if (!pump.hasCountdown) return { ok: false, text: 'Este toma no se apaga solo: sin ese seguro no se usa para regar.' };
  if (!Number.isFinite(seconds) || seconds <= 0) return { ok: false, text: 'Duración inválida.' };
  if (seconds > cfg.maxSeconds) return { ok: false, text: `Pediste ${Math.round(seconds)} s y el tope por riego es ${cfg.maxSeconds} s.` };
  const liters = secondsToLiters(seconds, cfg);
  if (liters > cfg.maxLiters) return { ok: false, text: `Serían ${fmt(liters, 'L')} y el tope por riego es ${String(cfg.maxLiters).replace('.', ',')} L.` };
  return { ok: true, seconds: Math.round(seconds), liters };
}

// ---------- riego automático ----------

export interface AutoIrrigation {
  mode: 'off' | 'scheduled' | 'wetdry';
  /** Programado: atado a la luz (después de prender / antes de apagar) o a una hora fija; uno o varios pulsos. */
  scheduled: { when: 'light' | 'fixed'; trigger: 'after_on' | 'before_off'; offsetMin: number; fixedTime: string; shotS: number; pulses: number; pauseMin: number };
  /** Por humedad: riega al llegar a "seco" y sigue (con pausas) hasta "húmedo"; de noche no. */
  wetdry: { dry: number; wet: number; shotS: number; pauseMin: number; maxShots: number };
  /** Zona horaria de la persona (para la hora fija y para contar los riegos de cada día). */
  timeZone: string;
}

export const DEFAULT_AUTO_IRRIGATION: AutoIrrigation = {
  mode: 'off',
  scheduled: { when: 'light', trigger: 'after_on', offsetMin: 30, fixedTime: '09:00', shotS: 60, pulses: 1, pauseMin: 30 },
  wetdry: { dry: 40, wet: 65, shotS: 30, pauseMin: 15, maxShots: 6 },
  timeZone: 'America/Argentina/Buenos_Aires',
};

const inRange = (v: number, a: number, b: number) => Number.isFinite(v) && v >= a && v <= b;
/** La revisión del servidor pasa cada 5 min: pausas más cortas no se podrían respetar. */
export const MIN_PAUSE_MIN = 10;

/** Errores en castellano (vacío = sirve). maxSeconds: el tope por riego de la bomba. */
export function validateAutoIrrigation(a: AutoIrrigation, maxSeconds: number): string[] {
  const errs: string[] = [];
  if (!['off', 'scheduled', 'wetdry'].includes(a.mode)) return ['Elegí cómo riega solo.'];
  if (a.mode === 'scheduled') {
    const s = a.scheduled;
    if (!['light', 'fixed'].includes(s.when)) errs.push('Elegí cuándo riega.');
    if (s.when === 'light' && !inRange(s.offsetMin, 0, 480)) errs.push('Minutos respecto de la luz: entre 0 y 480.');
    if (s.when === 'fixed' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.fixedTime)) errs.push('Elegí la hora del riego.');
    if (!inRange(s.shotS, 5, 600)) errs.push('Segundos por riego: entre 5 y 600.');
    if (s.shotS > maxSeconds) errs.push(`Cada riego (${s.shotS} s) pasa el tope de la bomba (${maxSeconds} s).`);
    if (!inRange(s.pulses, 1, 10) || !Number.isInteger(s.pulses)) errs.push('Pulsos: entre 1 y 10.');
    if (s.pulses > 1 && !inRange(s.pauseMin, MIN_PAUSE_MIN, 180)) errs.push(`Pausa entre pulsos: entre ${MIN_PAUSE_MIN} y 180 minutos.`);
  }
  if (a.mode === 'wetdry') {
    const w = a.wetdry;
    if (!inRange(w.dry, 5, 95)) errs.push('Seco: entre 5 y 95 %.');
    if (!inRange(w.wet, 10, 100)) errs.push('Húmedo: entre 10 y 100 %.');
    if (!(w.wet > w.dry)) errs.push('El valor húmedo tiene que ser mayor que el seco.');
    else if (w.wet - w.dry < 10) errs.push('Dejá al menos 10 puntos entre seco y húmedo: si no, riega todo el día y la raíz no busca agua.');
    if (!inRange(w.shotS, 5, 600)) errs.push('Segundos por riego: entre 5 y 600.');
    if (w.shotS > maxSeconds) errs.push(`Cada riego (${w.shotS} s) pasa el tope de la bomba (${maxSeconds} s).`);
    if (!inRange(w.pauseMin, MIN_PAUSE_MIN, 180)) errs.push(`Pausa entre riegos: entre ${MIN_PAUSE_MIN} y 180 minutos.`);
    if (!inRange(w.maxShots, 1, 20) || !Number.isInteger(w.maxShots)) errs.push('Riegos por día: entre 1 y 20.');
  }
  return errs;
}

/** "30 min después de prender la luz · 60 s" / "por humedad: riega con ≤ 40 % hasta 65 %". */
export function describeAutoIrrigation(a: AutoIrrigation | null | undefined): string {
  if (!a || a.mode === 'off') return 'Solo a mano';
  if (a.mode === 'wetdry') {
    const w = a.wetdry;
    return `Por humedad: riega ${w.shotS} s con el sustrato en ${w.dry} % o menos, hasta ${w.wet} % (pausas de ${w.pauseMin} min, hasta ${w.maxShots} por día, de día)`;
  }
  const s = a.scheduled;
  const when = s.when === 'fixed' ? `todos los días a las ${s.fixedTime}` : `${s.offsetMin} min ${s.trigger === 'after_on' ? 'después de prender' : 'antes de apagar'} la luz`;
  return `Programado: ${when} · ${s.pulses > 1 ? `${s.pulses} pulsos de ${s.shotS} s cada ${s.pauseMin} min` : `${s.shotS} s`}`;
}
