import React, { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { historyStats, type AmbientPoint, type AmbientTargets } from '../../utils/ambientEvaluation';

type Range = '7d' | '30d' | 'all';
type Metric = 'temp' | 'rh' | 'vpd';

const RANGES: Record<Range, string> = { '7d': '7 días', '30d': '30 días', all: 'Todo' };
const METRICS: Record<Metric, { label: string; unit: string; digits: number; color: string }> = {
  temp: { label: 'Temperatura', unit: ' °C', digits: 1, color: '#EB7864' },
  rh: { label: 'Humedad', unit: ' %', digits: 0, color: '#2B3C9E' },
  vpd: { label: 'VPD', unit: ' kPa', digits: 2, color: '#62B95B' },
};
const DAY_MS = 86_400_000;
const num = (v: number, d: number) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ',');
const dayLabel = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};
const fullLabel = (ms: number) =>
  new Date(ms).toLocaleString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

interface AmbientHistoryProps {
  /** Todas las lecturas del ambiente (sin repetir), de la más vieja a la más nueva. */
  points: AmbientPoint[];
  targets: AmbientTargets;
  now?: number;
}

/**
 * Histórico del clima del ambiente: los últimos 7 o 30 días (o todo), una medida por vez, con la franja
 * óptima de la etapa pintada de verde para ver de un vistazo cuándo se salió.
 */
export const AmbientHistory: React.FC<AmbientHistoryProps> = ({ points, targets, now = Date.now() }) => {
  const [range, setRange] = useState<Range>('7d');
  const [metric, setMetric] = useState<Metric>('temp');
  const m = METRICS[metric];
  const band = targets[metric];
  const shown = useMemo(() => (range === 'all' ? points : points.filter((p) => p.at >= now - (range === '7d' ? 7 : 30) * DAY_MS)), [points, range, now]);
  const stats = historyStats(
    shown.map((p) => p[metric]),
    band
  );
  const values = shown.map((p) => p[metric]);
  const lo = Math.min(band[0], ...values);
  const hi = Math.max(band[1], ...values);
  const pad = (hi - lo) * 0.15 || 1;

  return (
    <div id="ambient-history" className="space-y-3 pt-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Período" className="inline-flex p-1 rounded-2xl bg-track gap-1">
          {(Object.keys(RANGES) as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              data-range={r}
              aria-pressed={range === r}
              onClick={() => setRange(r)}
              className={`min-h-11 px-3 rounded-xl text-xs font-bold ${range === r ? 'bg-white text-ink shadow-2xs' : 'text-ink-muted'}`}
            >
              {RANGES[r]}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Medida" className="flex flex-wrap gap-1.5">
          {(Object.keys(METRICS) as Metric[]).map((k) => (
            <button
              key={k}
              type="button"
              data-metric={k}
              aria-pressed={metric === k}
              onClick={() => setMetric(k)}
              className={`min-h-11 px-3 rounded-full text-xs font-bold border ${metric === k ? 'bg-brand-deep text-white border-brand-deep' : 'bg-white text-ink-muted border-line'}`}
            >
              {METRICS[k].label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p id="ambient-history-empty" className="text-xs text-ink-muted rounded-2xl bg-surface border border-line p-4 text-center">
          No hay lecturas en {range === 'all' ? 'este ambiente' : `los últimos ${RANGES[range]}`}.
        </p>
      ) : (
        <>
          <div className="h-48 w-full" role="img" aria-label={`${m.label} de los últimos ${RANGES[range]}: de ${num(stats!.min, m.digits)} a ${num(stats!.max, m.digits)}${m.unit}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={shown} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E3F1F8" vertical={false} />
                <ReferenceArea y1={band[0]} y2={band[1]} fill="#BFE3BA" fillOpacity={0.45} stroke="none" ifOverflow="extendDomain" />
                <XAxis dataKey="at" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={dayLabel} tick={{ fontSize: 10, fill: '#6E5D77' }} stroke="#D5E8F2" minTickGap={18} />
                <YAxis domain={[Math.floor((lo - pad) * 10) / 10, Math.ceil((hi + pad) * 10) / 10]} tick={{ fontSize: 10, fill: '#6E5D77' }} stroke="#D5E8F2" width={44} tickFormatter={(v: number) => num(v, m.digits)} />
                <Tooltip
                  labelFormatter={(v) => fullLabel(Number(v))}
                  formatter={(v) => [`${num(Number(v), m.digits)}${m.unit}`, m.label]}
                  contentStyle={{ borderRadius: 14, border: '1px solid #D5E8F2', fontSize: 12 }}
                />
                <Line type="monotone" dataKey={metric} stroke={m.color} strokeWidth={2.5} dot={{ r: 3, fill: m.color }} activeDot={{ r: 5 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div id="ambient-history-stats" className="grid grid-cols-4 gap-2 text-center">
            {[
              ['Mín.', `${num(stats!.min, m.digits)}${m.unit}`],
              ['Prom.', `${num(stats!.avg, m.digits)}${m.unit}`],
              ['Máx.', `${num(stats!.max, m.digits)}${m.unit}`],
              ['En rango', `${stats!.inRangePct} %`],
            ].map(([l, v]) => (
              <div key={l} className="rounded-2xl bg-surface border border-line p-2">
                <b className="block text-sm font-black text-ink">{v}</b>
                <small className="text-[11px] font-semibold text-ink-muted">{l}</small>
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-subtle">
            {shown.length === 1 ? '1 lectura' : `${shown.length} lecturas`} · en verde, lo óptimo para {targets.label.toLowerCase()} ({num(band[0], m.digits)}–{num(band[1], m.digits)}
            {m.unit})
          </p>
        </>
      )}
    </div>
  );
};

export default AmbientHistory;
