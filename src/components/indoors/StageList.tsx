import React from 'react';
import type { StageScheduleItem } from '../../utils/growthStageUtils';

export const dateText = (d?: string, month: 'long' | 'short' = 'long') => {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return y ? new Date(y, m - 1, day).toLocaleDateString('es-AR', { day: 'numeric', month }) : '';
};

/** Qué dice cada etapa: sus fechas y cuánto duró (o cuánto se espera). */
export function stageLine(s: StageScheduleItem, activeDay: number): { when: string; pill: string } {
  const days = s.actualDurationDays ?? s.expectedDurationDays;
  if (s.status === 'completed') {
    return { when: s.startDate && s.endDate ? `${dateText(s.startDate, 'short')} – ${dateText(s.endDate, 'short')}` : 'Sin fechas anotadas', pill: days ? `${days} d` : '' };
  }
  if (s.status === 'active') return { when: s.startDate ? `Desde el ${dateText(s.startDate, 'short')} · actual` : 'Actual', pill: `día ${Math.max(1, activeDay)}` };
  return { when: s.startDate ? `Estimada: ${dateText(s.startDate, 'short')}` : 'Más adelante', pill: s.expectedDurationDays ? `${s.expectedDurationDays} d` : '' };
}

/** Las etapas por las que pasó (y las que vienen), como una línea con puntos. */
export const StageList: React.FC<{ stages: StageScheduleItem[]; activeDay: number; id?: string; className?: string }> = ({ stages, activeDay, id, className = '' }) => (
  <section id={id} className={className}>
    <ol className="relative">
      {stages.map((s, i) => {
        const { when, pill } = stageLine(s, activeDay);
        const last = i === stages.length - 1;
        return (
          <li key={s.id} data-stage-status={s.status} className="genetic-stage relative flex gap-3 pb-4 last:pb-0">
            {!last && <span className={`absolute left-[9px] top-5 bottom-0 w-0.5 ${s.status === 'completed' ? 'bg-ok' : 'bg-line'}`} aria-hidden="true" />}
            <span
              className={`relative z-10 mt-0.5 w-5 h-5 rounded-full shrink-0 border-[3px] ${
                s.status === 'completed' ? 'bg-ok border-ok' : s.status === 'active' ? 'bg-primary border-brand-deep' : 'bg-white border-line border-dashed'
              }`}
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <b className={`block text-sm ${s.status === 'upcoming' ? 'text-ink-muted font-bold' : 'text-ink font-extrabold'}`}>{s.name}</b>
              <small className="text-xs text-ink-muted">{when}</small>
            </div>
            {pill && (
              <span className={`self-start shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-black ${s.status === 'active' ? 'bg-brand-deep text-white' : 'bg-track text-ink-muted'}`}>
                {pill}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  </section>
);
