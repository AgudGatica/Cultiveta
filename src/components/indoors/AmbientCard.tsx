import React, { useState } from 'react';
import { Leaf, Moon, Sprout, Sun } from 'lucide-react';
import type { Cultivation, Indoor } from '../../types';
import { cycleFromLighting, isDailyCycle, lightAnchor, lightState } from '../../utils/lightCycle';
import { INDOOR_KINDS, ambientCoverImage, indoorGenetics, indoorSizeText, isExteriorAmbient } from '../../utils/indoors';

interface AmbientCardProps {
  ambient: Indoor;
  /** Cultivos activos de adentro. */
  crops: Cultivation[];
  onOpen: (ambient: Indoor) => void;
  now?: number;
}

/**
 * Tarjeta de un ambiente en el Jardín: portada de interior o exterior, si la luz está prendida, las
 * plantas y las genéticas de adentro.
 */
export const AmbientCard: React.FC<AmbientCardProps> = ({ ambient, crops, onOpen, now = Date.now() }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const exterior = isExteriorAmbient(ambient);
  const cycle = cycleFromLighting(ambient.lighting);
  const anchor = exterior ? null : lightAnchor({ lightsOnTime: ambient.lighting?.lightsOnTime, lightsOnDate: isDailyCycle(cycle) ? '' : ambient.lighting?.lightsOnDate }, now);
  const state = anchor != null ? lightState(cycle, anchor, now) : null;
  const plants = crops.reduce((n, c) => n + (c.plantCount || 1), 0);
  const genetics = indoorGenetics(crops).map((g) => g.name);
  const size = indoorSizeText(ambient);

  return (
    <button
      type="button"
      data-ambient-card={ambient.id}
      onClick={() => onOpen(ambient)}
      aria-label={`Abrir ${ambient.name}`}
      className="cultiveta-card cultiveta-card-hover overflow-hidden text-left w-full flex flex-col cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
    >
      <div className="relative aspect-[2/1] w-full bg-icon-bg overflow-hidden" data-cover={exterior ? 'exterior' : 'interior'}>
        {!imageFailed ? (
          <img src={ambientCoverImage(ambient)} alt="" loading="lazy" onError={() => setImageFailed(true)} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-brand">
            <Sprout className="w-10 h-10 stroke-[1.5]" aria-hidden="true" />
          </div>
        )}
        <span className="absolute left-3 top-3 px-2.5 py-1 rounded-full bg-white/90 border border-line text-[11px] font-bold text-ink">
          {exterior ? 'Exterior' : 'Interior'} · {INDOOR_KINDS[ambient.kind] || 'Ambiente'}
        </span>
        {exterior ? (
          <span className="ambient-light-pill absolute right-3 bottom-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider bg-accent text-ink">
            <Sun className="w-3 h-3" aria-hidden="true" />
            LUZ NATURAL
          </span>
        ) : state?.started ? (
          <span
            className={`ambient-light-pill absolute right-3 bottom-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider ${
              state.on ? 'bg-accent text-ink' : 'bg-brand-deep text-white'
            }`}
          >
            {state.on ? <Sun className="w-3 h-3" aria-hidden="true" /> : <Moon className="w-3 h-3" aria-hidden="true" />}
            {state.on ? 'LUZ PRENDIDA' : 'LUZ APAGADA'}
          </span>
        ) : ambient.lighting?.photoperiodHoursLight ? (
          <span className="ambient-light-pill absolute right-3 bottom-3 px-2.5 py-1 rounded-full text-[10px] font-black bg-white/90 text-ink">
            {cycle.lightHours}/{cycle.darkHours}
          </span>
        ) : null}
      </div>
      <div className="p-4 space-y-1.5">
        <h3 className="text-base font-extrabold text-ink truncate">{ambient.name}</h3>
        {size && <p className="text-[11px] text-ink-muted">{size}</p>}
        <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
          <Leaf className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
          {plants
            ? `${plants} planta${plants === 1 ? '' : 's'} · ${genetics.length} genética${genetics.length === 1 ? '' : 's'}`
            : 'Sin plantas todavía'}
        </p>
        {genetics.length > 0 && (
          <p className="text-[11px] text-ink-muted truncate">
            {genetics.slice(0, 3).join(' · ')}
            {genetics.length > 3 ? ` y ${genetics.length - 3} más` : ''}
          </p>
        )}
      </div>
    </button>
  );
};

export default AmbientCard;
