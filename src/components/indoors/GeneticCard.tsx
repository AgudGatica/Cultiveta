import React from 'react';
import { ChevronRight, Dna, Home, Sun } from 'lucide-react';
import { harvestText, type GeneticEntry } from '../../utils/indoors';

const dateText = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return y ? new Date(y, m - 1, day).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '';
};

interface GeneticCardProps {
  entry: GeneticEntry;
  onOpen: (entry: GeneticEntry) => void;
  /** En el Jardín (pestaña Plantas): en qué ambiente está. */
  ambient?: { name: string; exterior: boolean } | null;
}

/** Una genética con su foto, sus plantas, la etapa y cuánto le falta para cortar. */
export const GeneticCard: React.FC<GeneticCardProps> = ({ entry: e, onOpen, ambient = null }) => (
  <button
    type="button"
    data-genetic-card={`${e.crop.id}_${e.index}`}
    onClick={() => onOpen(e)}
    className="cultiveta-card cultiveta-card-hover overflow-hidden text-left flex cursor-pointer min-h-[112px]"
    aria-label={`Abrir ${e.card.name}`}
  >
    <div className="w-28 shrink-0 bg-icon-bg relative">
      {e.card.photoUrl ? (
        <img src={e.card.photoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-brand">
          <Dna className="w-8 h-8 stroke-[1.5]" aria-hidden="true" />
        </div>
      )}
    </div>
    <div className="p-3 min-w-0 flex-1 space-y-1">
      <div className="flex items-start justify-between gap-1">
        <h3 className="text-sm font-extrabold text-ink leading-tight">{e.card.name}</h3>
        <ChevronRight className="w-4 h-4 text-ink-subtle shrink-0" aria-hidden="true" />
      </div>
      {e.card.seedBank && <p className="text-xs text-ink-muted truncate">{e.card.seedBank}</p>}
      <p className="text-xs font-semibold text-ink">
        {e.plants} planta{e.plants === 1 ? '' : 's'} · {e.stage}
      </p>
      <p className="genetic-harvest text-xs font-black text-brand">
        {harvestText(e.daysToHarvest)}
        {e.daysToHarvest > 0 && e.harvestDate ? ` · ${dateText(e.harvestDate)}` : ''}
      </p>
      {ambient && (
        <p className="genetic-ambient inline-flex items-center gap-1 text-[11px] font-bold text-ink-muted bg-track rounded-full px-2 py-0.5 max-w-full">
          {ambient.exterior ? <Sun className="w-3 h-3 shrink-0" aria-hidden="true" /> : <Home className="w-3 h-3 shrink-0" aria-hidden="true" />}
          <span className="truncate">{ambient.name}</span>
        </p>
      )}
    </div>
  </button>
);

export default GeneticCard;
