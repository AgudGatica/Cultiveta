import React, { useState } from 'react';
import { ChevronDown, Table2 } from 'lucide-react';
import { feedTable, num, type FeedMedium, type FeedPhase } from '../../utils/feedTargets';

const MEDIUMS: Array<{ id: FeedMedium; label: string }> = [
  { id: 'tierra', label: 'Tierra' },
  { id: 'coco', label: 'Coco o sustrato' },
  { id: 'hidro', label: 'Hidroponía' },
];

const shortDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '');
};

/**
 * Opción avanzada, cerrada de entrada: la tabla completa de pH y EC por etapa. Arranca en el medio del cultivo
 * (se puede mirar otro), marca la etapa de ahora y la próxima, y dice desde cuándo vienen las que faltan.
 */
export const FeedTableDetails: React.FC<{
  idPrefix: string;
  medium: FeedMedium;
  phase: FeedPhase | null;
  auto: boolean;
  starts?: Partial<Record<FeedPhase, string>>;
}> = ({ idPrefix, medium, phase, auto, starts = {} }) => {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<FeedMedium>(medium);
  const rows = feedTable(shown, auto, phase, starts);
  return (
    <div className="border-t border-line pt-1">
      <button
        type="button"
        id={`${idPrefix}-table-toggle`}
        aria-expanded={open}
        aria-controls={`${idPrefix}-table`}
        onClick={() => setOpen((o) => !o)}
        className="w-full min-h-11 flex items-center justify-between text-xs font-bold text-ink-muted min-h-11"
      >
        <span className="flex items-center gap-1">
          <Table2 className="w-3.5 h-3.5" aria-hidden="true" />
          Tabla de pH y EC por etapa
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div id={`${idPrefix}-table`} className="space-y-2 pt-1">
          <div className="flex gap-1.5" role="group" aria-label="Medio">
            {MEDIUMS.map((m) => (
              <button
                key={m.id}
                type="button"
                data-medium={m.id}
                aria-pressed={shown === m.id}
                onClick={() => setShown(m.id)}
                className={`flex-1 min-h-11 px-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                  shown === m.id ? 'bg-brand-deep text-white border-brand-deep' : 'bg-white text-ink border-chip-line hover:bg-surface'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[11px] font-semibold text-ink-muted">
                <th scope="col" className="py-1 font-semibold">Etapa</th>
                <th scope="col" className="py-1 font-semibold text-center w-16">pH</th>
                <th scope="col" className="py-1 font-semibold text-center w-20">EC</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const now = r.when === 'ahora';
                return (
                  <tr key={r.phase} data-phase={r.phase} data-when={r.when} className={`border-t border-line ${now ? 'bg-ok-bg' : ''} ${r.when === 'antes' ? 'text-ink-subtle' : 'text-ink'}`}>
                    <th scope="row" className="py-1.5 pl-1.5 pr-1 font-semibold align-top">
                      {r.label}
                      {now && <span className="block text-[11px] font-bold text-ok-ink">Ahora</span>}
                      {r.when === 'proxima' && <span className="block text-[11px] font-bold text-brand">Próxima{r.from ? ` · desde el ${shortDate(r.from)}` : ''}</span>}
                      {r.when === 'despues' && r.from && <span className="block text-[11px] font-semibold text-ink-muted">desde el {shortDate(r.from)}</span>}
                    </th>
                    <td className="py-1.5 text-center align-top">
                      <b className="block">{num(r.ph.target)}</b>
                      <small className="text-[11px] text-ink-muted">
                        {num(r.ph.min)}–{num(r.ph.max)}
                      </small>
                    </td>
                    <td className="py-1.5 text-center align-top">
                      <b className="block">{num(r.ec.target)}</b>
                      <small className="text-[11px] text-ink-muted">
                        {num(r.ec.min)}–{num(r.ec.max)}
                      </small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-ink-muted">
            El pH es el mismo en todo el ciclo. EC total, con el agua, en mS/cm{auto ? '; automática: un 20 % menos' : ''}. Las fechas son aproximadas, según el
            calendario del cultivo. Si la marca de tu fertilizante indica otra EC, seguí la de la marca.
          </p>
        </div>
      )}
    </div>
  );
};
