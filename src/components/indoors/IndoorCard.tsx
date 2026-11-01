import React from 'react';
import { Home, Leaf, Moon, Sun } from 'lucide-react';
import type { Cultivation, Indoor } from '../../types';
import { cycleFromLighting, isDailyCycle, lightAnchor, lightState } from '../../utils/lightCycle';
import { INDOOR_KINDS, indoorGenetics, indoorSizeText } from '../../utils/indoors';

interface IndoorCardProps {
  indoor: Indoor;
  /** Cultivos activos de adentro. */
  crops: Cultivation[];
  onOpen: (indoor: Indoor) => void;
  now?: number;
}

/** Tarjeta de un indoor en el Inicio: luz (prendida o apagada), cultivos, plantas y genéticas de adentro. */
export const IndoorCard: React.FC<IndoorCardProps> = ({ indoor, crops, onOpen, now = Date.now() }) => {
  const cycle = cycleFromLighting(indoor.lighting);
  const anchor = lightAnchor({ lightsOnTime: indoor.lighting?.lightsOnTime, lightsOnDate: isDailyCycle(cycle) ? '' : indoor.lighting?.lightsOnDate }, now);
  const state = anchor != null ? lightState(cycle, anchor, now) : null;
  const plants = crops.reduce((n, c) => n + (c.plantCount || 1), 0);
  const genetics = indoorGenetics(crops).map((g) => g.name);
  const size = indoorSizeText(indoor);

  return (
    <button
      type="button"
      data-indoor-card={indoor.id}
      onClick={() => onOpen(indoor)}
      aria-label={`Abrir ${indoor.name}`}
      className="cultiveta-card cultiveta-card-hover text-left w-full p-4 space-y-2 cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="p-2 rounded-xl bg-brand/10 text-brand shrink-0">
            <Home className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-ink truncate">{indoor.name}</h3>
            <p className="text-[11px] text-ink-muted truncate">
              {INDOOR_KINDS[indoor.kind] || 'Indoor'}
              {size ? ` · ${size}` : ''}
            </p>
          </div>
        </div>
        {state?.started ? (
          <span className={`indoor-light-pill shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider ${state.on ? 'bg-accent text-ink' : 'bg-brand-deep text-white'}`}>
            {state.on ? <Sun className="w-3 h-3" aria-hidden="true" /> : <Moon className="w-3 h-3" aria-hidden="true" />}
            {state.on ? 'LUZ PRENDIDA' : 'LUZ APAGADA'}
          </span>
        ) : indoor.lighting?.photoperiodHoursLight ? (
          <span className="indoor-light-pill shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface border border-line text-ink-muted">
            {cycle.lightHours}/{cycle.darkHours}
          </span>
        ) : null}
      </div>
      <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
        <Leaf className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
        {crops.length ? `${crops.length} cultivo${crops.length === 1 ? '' : 's'} · ${plants} planta${plants === 1 ? '' : 's'}` : 'Sin cultivos todavía'}
      </p>
      {genetics.length > 0 && (
        <p className="text-[11px] text-ink-muted truncate">
          {genetics.slice(0, 3).join(' · ')}
          {genetics.length > 3 ? ` y ${genetics.length - 3} más` : ''}
        </p>
      )}
    </button>
  );
};

export default IndoorCard;
