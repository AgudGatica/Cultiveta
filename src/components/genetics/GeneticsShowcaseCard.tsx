import React from 'react';
import { ChevronDown, Clock, Dna, Heart, Image as ImageIcon, Scale, Sparkles } from 'lucide-react';

export interface GeneticsShowcaseCardProps {
  name: string;
  seedBank: string;
  dominance?: string | null;
  photoUrl?: string | null;
  /** Rendimiento estimado en g/m² (texto, por ejemplo "500 - 600"). */
  estimatedYield?: string | null;
  /** Días de floración (texto, por ejemplo "45 - 50"). */
  floweringDays?: string | null;
  organolepticProfile?: string | null;
  /** Parte de abajo (botones o datos propios de cada pantalla), debajo de un separador. */
  children?: React.ReactNode;
  id?: string;
}

export interface GeneticsCatalogRowProps {
  name: string;
  seedBank: string;
  dominance?: string | null;
  photoUrl?: string | null;
  estimatedYield?: string | number | null;
  floweringDays?: string | number | null;
  isFavorite?: boolean;
  open: boolean;
  onToggle: () => void;
}

/** Una genética del catálogo en una fila: al tocarla se abre su tarjeta grande. 100 variedades entran en pocas pantallas. */
export const GeneticsCatalogRow: React.FC<GeneticsCatalogRowProps> = ({ name, seedBank, dominance, photoUrl, estimatedYield, floweringDays, isFavorite = false, open, onToggle }) => (
  <button
    type="button"
    data-genetic-row={name}
    aria-expanded={open}
    aria-label={`${name}, ${seedBank}`}
    onClick={onToggle}
    className="cultiveta-card w-full flex items-center gap-3 p-2.5 text-left cursor-pointer"
  >
    <span className="relative w-16 h-16 rounded-2xl overflow-hidden bg-icon-bg shrink-0 flex items-center justify-center text-brand">
      {photoUrl ? <img src={photoUrl} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" /> : <Dna className="w-6 h-6 stroke-[1.5]" aria-hidden="true" />}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-extrabold text-ink truncate">{name}</span>
      <span className="block text-xs text-ink-muted truncate">{[seedBank, dominance].filter(Boolean).join(' · ')}</span>
      <span className="block text-xs font-semibold text-brand truncate">{[floweringDays ? `${floweringDays} d` : null, estimatedYield ? `${estimatedYield} g/m²` : null].filter(Boolean).join(' · ') || 'Sin datos de rinde'}</span>
    </span>
    {isFavorite && <Heart className="w-4 h-4 fill-error text-error shrink-0" aria-hidden="true" />}
    <ChevronDown className={`w-4 h-4 text-ink-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
  </button>
);

/**
 * Tarjeta de genética de la pantalla Genéticas: foto grande con nombre, banco y dominancia encima,
 * rendimiento y floración, y "Aroma y gusto". Se usa igual en el catálogo y dentro de cada cultivo.
 */
export const GeneticsShowcaseCard: React.FC<GeneticsShowcaseCardProps> = ({
  name,
  seedBank,
  dominance,
  photoUrl,
  estimatedYield,
  floweringDays,
  organolepticProfile,
  children,
  id,
}) => (
  <article id={id} className="bg-white rounded-[30px] border border-chip-line shadow-sm overflow-hidden p-4 space-y-4 w-full">
    {/* Foto grande con nombre, banco y dominancia encima */}
    <div className="group relative w-full aspect-[295/176] rounded-[24px] overflow-hidden bg-track border border-line">
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={`${name} - ${seedBank}`}
          className="w-full h-full object-cover rounded-[24px] transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-track rounded-[24px]">
          <ImageIcon className="w-10 h-10 stroke-1 text-ink-subtle" aria-hidden="true" />
          <span className="text-xs font-medium text-ink-muted mt-1">Sin fotografía</span>
        </div>
      )}

      <div className="absolute left-4 top-4 z-10 flex flex-col items-start gap-1 max-w-[85%] pointer-events-none">
        <h2 className={`text-[18px] sm:text-[20px] font-black uppercase leading-none truncate max-w-full ${photoUrl ? 'text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)]' : 'text-ink'}`}>
          {name}
        </h2>
        {seedBank && (
          <span className="inline-flex items-center rounded-lg bg-ok-bg border border-ok-line px-2.5 py-1 text-xs font-semibold text-ok-ink shadow-2xs">
            {seedBank}
          </span>
        )}
        {dominance && (
          <span className="inline-flex items-center rounded-full bg-warn-bg border border-warn-line px-2.5 py-1 text-xs font-bold text-ink shadow-2xs">
            {dominance}
          </span>
        )}
      </div>
    </div>

    {/* Rendimiento y floración */}
    <div className="grid grid-cols-2 gap-3">
      <div className="flex items-center justify-center gap-2 rounded-full bg-brand px-3 py-2 text-white font-semibold text-xs sm:text-sm shadow-sm">
        <Scale className="w-4 h-4 text-white shrink-0" />
        <span className="truncate">{estimatedYield ? `${estimatedYield} g/m²` : 'Rinde sin dato'}</span>
      </div>
      <div className="flex items-center justify-center gap-2 rounded-full bg-brand px-3 py-2 text-white font-semibold text-xs sm:text-sm shadow-sm">
        <Clock className="w-4 h-4 text-white shrink-0" />
        <span className="truncate">{floweringDays ? `${floweringDays} d` : 'Floración sin dato'}</span>
      </div>
    </div>

    {/* Aroma y gusto */}
    <div className="rounded-[22px] border border-line bg-white p-4 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold uppercase tracking-wide text-ink-muted">
        <Sparkles className="w-4 h-4 text-brand shrink-0" aria-hidden="true" />
        <span>AROMA Y GUSTO</span>
      </div>
      <p className="text-ink font-medium italic leading-relaxed text-xs sm:text-sm">
        {organolepticProfile ? `"${organolepticProfile}"` : 'Sin perfil cargado.'}
      </p>
    </div>

    {children && (
      <>
        <div className="border-t border-line my-1" />
        {children}
      </>
    )}
  </article>
);
