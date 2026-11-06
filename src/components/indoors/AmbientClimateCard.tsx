import React, { useState } from 'react';
import { ChevronDown, CloudSun, LineChart, MapPin, Pencil, Thermometer, Wifi } from 'lucide-react';
import { MANUAL_READING_TTL_MS, evaluateAmbient, type AmbientPoint, type AmbientTargets, type Level } from '../../utils/ambientEvaluation';
import { AmbientHistory } from './AmbientHistory';

export interface AmbientReading {
  temperatureC: number;
  humidityPct: number;
  /** Cuándo se midió (ms). */
  at: number;
  /** auto: clima de la zona, medido solo cada hora (exterior). */
  source: 'sensor' | 'manual' | 'auto';
  /** Sensor que midió (si es por sensor). */
  deviceName?: string;
  offline?: boolean;
}

interface AmbientClimateCardProps {
  reading: AmbientReading | null;
  targets: AmbientTargets;
  /** Guardar una lectura a mano (si se puede: hace falta algún cultivo adentro). */
  onSaveManual?: (r: { temperatureC: number; humidityPct: number }) => Promise<void>;
  /** Por qué no se puede anotar a mano (por ejemplo, el ambiente no tiene plantas). */
  manualBlockedReason?: string | null;
  onConnectSensor?: () => void;
  /** Lecturas del ambiente para el histórico desplegable (sin repetir). */
  history?: AmbientPoint[];
  /**
   * Exterior: el clima de la zona se mide solo cada hora (no hay sensor ni se anota a mano) y el gráfico se
   * ve de entrada. located: si sus plantas ya tienen la ubicación general; hasPlants: si tiene alguna.
   */
  outdoor?: { located: boolean; hasPlants: boolean; onUseLocation?: () => Promise<void> };
  now?: number;
  children?: React.ReactNode;
}

const ago = (ms: number, now: number) => {
  const min = Math.max(0, Math.round((now - ms) / 60000));
  return min < 1 ? 'recién' : min < 60 ? `hace ${min} min` : min < 48 * 60 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} días`;
};
const LEVEL_TEXT: Record<Level, string> = { baja: 'BAJA', bien: 'BIEN', alta: 'ALTA' };
/** El clima de exterior llega cada hora: más viejo que esto, algo se atrasó. */
export const AUTO_READING_TTL_MS = 3 * 60 * 60 * 1000;
const levelClass = (l: Level) => (l === 'bien' ? 'text-ok-ink' : 'text-error');
const num = (v: number, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ',');

/**
 * Clima del ambiente (como en Órbita): temperatura, humedad y VPD con la franja "húmedo / óptimo /
 * seco" de la etapa. Con sensor, lo que mide; sin sensor, lo último anotado a mano (sirve 12 horas).
 * En exterior, el clima de la zona que se mide solo cada hora, con el gráfico a la vista.
 */
export const AmbientClimateCard: React.FC<AmbientClimateCardProps> = ({ reading, targets, onSaveManual, manualBlockedReason = null, onConnectSensor, history = [], outdoor, now = Date.now(), children }) => {
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(Boolean(outdoor));
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [form, setForm] = useState({ t: '', h: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const evalr = reading && !reading.offline ? evaluateAmbient(reading, targets) : null;
  const stale = reading?.source === 'manual' ? now - reading.at > MANUAL_READING_TTL_MS : reading?.source === 'auto' ? now - reading.at > AUTO_READING_TTL_MS : false;

  const useLocation = async () => {
    if (!outdoor?.onUseLocation) return;
    setLocating(true);
    setLocError(null);
    try {
      await outdoor.onUseLocation();
    } catch (e: any) {
      setLocError(e?.message || 'No se pudo tomar la ubicación.');
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    const t = Number(form.t.replace(',', '.'));
    const h = Number(form.h.replace(',', '.'));
    if (!(t > -10 && t < 60) || !(h >= 0 && h <= 100)) return setError('Poné la temperatura (°C) y la humedad (%) que marca tu termómetro.');
    setSaving(true);
    setError(null);
    try {
      await onSaveManual?.({ temperatureC: t, humidityPct: h });
      setEditing(false);
      setForm({ t: '', h: '' });
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="ambient-climate" className="bg-white rounded-[28px] p-5 sm:p-6 border border-line shadow-2xs space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
          <Thermometer className="w-4 h-4 text-brand" aria-hidden="true" />
          Clima · {targets.label}
        </span>
        {outdoor && !evalr && (
          <span id="ambient-auto-badge" className="px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider bg-surface border border-line text-ink-muted">
            AUTOMÁTICO
          </span>
        )}
        {evalr && stale ? (
          <span id="ambient-band" className="px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider bg-surface border border-line text-ink-muted">
            ÚLTIMA LECTURA
          </span>
        ) : evalr ? (
          <span id="ambient-band" className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider ${evalr.band === 'optimo' ? 'bg-ok-bg text-ok-ink border border-ok-line' : 'bg-coral/15 text-error'}`}>
            {evalr.band === 'optimo' ? 'EN BANDA' : evalr.band === 'seco' ? 'AIRE SECO' : 'AIRE HÚMEDO'}
          </span>
        ) : outdoor ? null : (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider bg-surface border border-line text-ink-muted">SIN DATOS</span>
        )}
      </div>

      {reading && evalr ? (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-surface border border-line p-2.5">
              <b className="block text-xl font-black text-ink">{num(reading.temperatureC)}<small className="text-xs"> °C</small></b>
              <span className={`text-[10px] font-black ${levelClass(evalr.temp)}`}>TEMP. {LEVEL_TEXT[evalr.temp]}</span>
            </div>
            <div className="rounded-2xl bg-surface border border-line p-2.5">
              <b className="block text-xl font-black text-ink">{num(reading.humidityPct, 0)}<small className="text-xs"> %</small></b>
              <span className={`text-[10px] font-black ${levelClass(evalr.rh)}`}>HUMEDAD {LEVEL_TEXT[evalr.rh]}</span>
            </div>
            <div className="rounded-2xl bg-surface border border-line p-2.5">
              <b className="block text-xl font-black text-ink">{num(evalr.vpd, 2)}<small className="text-xs"> kPa</small></b>
              <span className="text-[10px] font-black text-ink-muted">VPD</span>
            </div>
          </div>
          <div aria-label={`VPD ${num(evalr.vpd, 2)} kPa: ${evalr.band === 'optimo' ? 'óptimo' : evalr.band}`}>
            <div className="relative h-3 rounded-full overflow-hidden bg-surface border border-line">
              <span className="absolute inset-y-0 left-0 bg-sky-300/70" style={{ width: `${evalr.bar.optStart}%` }} />
              <span className="absolute inset-y-0 bg-ok-line" style={{ left: `${evalr.bar.optStart}%`, width: `${evalr.bar.optEnd - evalr.bar.optStart}%` }} />
              <span className="absolute inset-y-0 right-0 bg-amber-300/70" style={{ left: `${evalr.bar.optEnd}%` }} />
              <em id="ambient-marker" className="absolute -top-0.5 w-1.5 h-4 rounded-full bg-ink" style={{ left: `calc(${evalr.bar.marker}% - 3px)` }} />
            </div>
            <div className="flex justify-between text-[10px] font-bold text-ink-muted mt-1">
              <span>húmedo</span>
              <span>óptimo</span>
              <span>seco</span>
            </div>
          </div>
          <p id="ambient-reading-source" className="text-[11px] text-ink-subtle flex items-center gap-1">
            {reading.source === 'sensor' ? <Wifi className="w-3 h-3" aria-hidden="true" /> : reading.source === 'auto' ? <CloudSun className="w-3 h-3" aria-hidden="true" /> : <Pencil className="w-3 h-3" aria-hidden="true" />}
            {reading.source === 'sensor'
              ? `Medido por ${reading.deviceName || 'el sensor'} · ${ago(reading.at, now)}`
              : reading.source === 'auto'
                ? `Clima de tu zona, medido solo cada hora · ${ago(reading.at, now)}`
                : `Anotado a mano ${ago(reading.at, now)}`}
          </p>
          {stale && (
            <p className="text-[11px] text-ink-muted">
              {reading.source === 'auto' ? 'La medición se atrasó: la próxima llega sola.' : 'Es lo último que anotaste. Para saber cómo está ahora, cargá lo que marca el termómetro.'}
            </p>
          )}
        </>
      ) : reading?.offline ? (
        <p className="text-xs text-error font-bold">El sensor {reading.deviceName} no responde.</p>
      ) : outdoor ? (
        <div id="ambient-auto-empty" className="space-y-2">
          <p className="text-xs text-ink-muted flex gap-1.5">
            <CloudSun className="w-4 h-4 text-brand shrink-0" aria-hidden="true" />
            {!outdoor.hasPlants
              ? 'En exterior el clima se mide solo, cada hora, con el de tu zona. Empieza cuando sumes plantas.'
              : outdoor.located
                ? 'En exterior el clima se mide solo, cada hora, con el de tu zona. La primera medición llega en menos de una hora.'
                : 'En exterior el clima se mide solo, cada hora, con el de tu zona. Para eso Cultiveta necesita saber en qué zona están tus plantas.'}
          </p>
          {outdoor.hasPlants && !outdoor.located && outdoor.onUseLocation && (
            <button type="button" id="ambient-use-location" disabled={locating} onClick={useLocation} className="cultiveta-btn-primary text-xs disabled:opacity-50">
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
              {locating ? 'Buscando…' : 'Usar mi ubicación'}
            </button>
          )}
          {outdoor.hasPlants && !outdoor.located && <p className="text-[11px] text-ink-subtle">Se guarda solo la zona (no la dirección) y nunca se publica.</p>}
          {locError && <p className="text-[11px] font-bold text-error">{locError}</p>}
        </div>
      ) : (
        <p className="text-xs text-ink-muted">Sin datos de temperatura y humedad. Conectá un sensor o cargá lo que marca tu termómetro: Cultiveta no inventa valores.</p>
      )}

      {outdoor ? null : editing ? (
        <div id="ambient-manual-form" className="rounded-2xl bg-surface border border-line p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-semibold text-ink-muted space-y-1">
              <span>Temperatura (°C)</span>
              <input id="ambient-manual-temp" inputMode="decimal" value={form.t} onChange={(e) => setForm({ ...form, t: e.target.value })} className="w-full min-h-10 px-3 rounded-xl bg-white border border-line text-sm text-ink" />
            </label>
            <label className="text-[11px] font-semibold text-ink-muted space-y-1">
              <span>Humedad (%)</span>
              <input id="ambient-manual-rh" inputMode="decimal" value={form.h} onChange={(e) => setForm({ ...form, h: e.target.value })} className="w-full min-h-10 px-3 rounded-xl bg-white border border-line text-sm text-ink" />
            </label>
          </div>
          {error && <p className="text-[11px] font-bold text-error">{error}</p>}
          <div className="flex gap-2">
            <button type="button" id="ambient-manual-save" disabled={saving} onClick={save} className="cultiveta-btn-primary text-xs disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="cultiveta-btn-secondary text-xs">
              Cancelar
            </button>
          </div>
          <p className="text-[11px] text-ink-subtle">Vale para todas las plantas del ambiente.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {onSaveManual && reading?.source !== 'sensor' && (
            <button type="button" id="ambient-manual-open" disabled={!!manualBlockedReason} onClick={() => setEditing(true)} className="cultiveta-btn-primary text-xs disabled:opacity-50">
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              Anotar a mano
            </button>
          )}
          {onConnectSensor && reading?.source !== 'sensor' && (
            <button type="button" onClick={onConnectSensor} className="cultiveta-btn-secondary text-xs">
              <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
              Conectar mi sensor
            </button>
          )}
        </div>
      )}
      {!outdoor && manualBlockedReason && !editing && reading?.source !== 'sensor' && <p className="text-[11px] text-ink-subtle">{manualBlockedReason}</p>}
      {children}
      <div className="border-t border-line pt-2">
        <button
          type="button"
          id="ambient-history-toggle"
          aria-expanded={historyOpen}
          aria-controls="ambient-history"
          onClick={() => setHistoryOpen((o) => !o)}
          className="w-full min-h-11 flex items-center justify-between gap-2 text-sm font-bold text-ink"
        >
          <span className="flex items-center gap-1.5">
            <LineChart className="w-4 h-4 text-brand" aria-hidden="true" />
            Histórico
            {history.length > 0 && <small className="text-[11px] font-semibold text-ink-subtle">· {history.length === 1 ? '1 lectura' : `${history.length} lecturas`}</small>}
          </span>
          <ChevronDown className={`w-5 h-5 text-ink-muted transition-transform motion-reduce:transition-none ${historyOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {historyOpen && <AmbientHistory points={history} targets={targets} now={now} />}
      </div>
    </section>
  );
};

export default AmbientClimateCard;
