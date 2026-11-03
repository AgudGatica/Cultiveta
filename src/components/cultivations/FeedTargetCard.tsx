import React, { useState } from 'react';
import { ChevronDown, Droplets, Info } from 'lucide-react';
import type { FeedTarget } from '../../utils/feedTargets';
import { num } from '../../utils/feedTargets';

/**
 * "Próximo riego": a qué pH y EC apuntar según la etapa y el sustrato, con el rango y, si hace falta, un
 * aviso del último drenaje. "¿De dónde sale?" lo explica en dos líneas.
 */
export const FeedTargetCard: React.FC<{ target: FeedTarget; className?: string }> = ({ target, className = '' }) => {
  const [why, setWhy] = useState(false);
  return (
    <section id="feed-target" data-phase={target.phase} data-medium={target.medium} className={`bg-white rounded-[28px] p-5 border border-line shadow-2xs space-y-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
          <Droplets className="w-4 h-4 text-brand" aria-hidden="true" />
          Próximo riego
        </span>
        <small className="text-[11px] font-semibold text-ink-subtle text-right">
          {target.label}
          {target.auto ? ' · automática' : ''}
        </small>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-2xl bg-surface border border-line p-2.5">
          <small className="block text-[10px] font-semibold text-ink-muted">pH</small>
          <b id="feed-ph" className="block text-2xl font-black text-ink leading-tight">
            {num(target.ph.target)}
          </b>
          <small className="block text-[11px] text-ink-muted">
            entre {num(target.ph.min)} y {num(target.ph.max)}
          </small>
        </div>
        <div className="rounded-2xl bg-surface border border-line p-2.5">
          <small className="block text-[10px] font-semibold text-ink-muted">EC (mS/cm)</small>
          <b id="feed-ec" className="block text-2xl font-black text-ink leading-tight">
            {num(target.ec.target)}
          </b>
          <small className="block text-[11px] text-ink-muted">
            entre {num(target.ec.min)} y {num(target.ec.max)}
          </small>
        </div>
      </div>
      {target.note && (
        <p id="feed-note" className="text-xs font-semibold text-warn-ink bg-warn-bg border border-warn-line rounded-2xl p-2.5">
          {target.note}
        </p>
      )}
      {target.soilNote && <p className="text-[11px] text-ink-muted">{target.soilNote}</p>}
      <button type="button" id="feed-why" aria-expanded={why} onClick={() => setWhy((w) => !w)} className="w-full flex items-center justify-between text-xs font-bold text-ink-muted min-h-9">
        <span className="flex items-center gap-1">
          <Info className="w-3.5 h-3.5" aria-hidden="true" />
          ¿De dónde sale?
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform motion-reduce:transition-none ${why ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {why && (
        <div id="feed-why-text" className="text-[11px] text-ink-muted space-y-1.5">
          <p>
            pH: el rango donde la planta toma mejor los nutrientes en {target.medium === 'tierra' ? 'tierra' : target.medium === 'coco' ? 'coco y sustratos sin tierra' : 'hidroponía'}. Los ensayos lo mantienen igual en todo el ciclo.
          </p>
          <p>
            EC: estudios de las universidades de Guelph y Utah (2021–2025) vieron que en floración alcanza con 1,9–2 y que más no da más cosecha. Plántula y final de floración siguen la práctica de cultivo
            {target.auto ? '; en automáticas, un 20 % menos' : ''}.
          </p>
          <p>Es la EC total, con el agua. Si la marca de tu fertilizante indica otra, seguí la de la marca.</p>
        </div>
      )}
    </section>
  );
};
