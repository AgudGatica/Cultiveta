import React from 'react';
import { Clock, Image as ImageIcon, Scale, Sparkles } from 'lucide-react';

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
    <div className="group relative w-full aspect-[295/176] rounded-[24px] overflow-hidden bg-stone-100 border border-stone-200/60">
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={`${name} - ${seedBank}`}
          className="w-full h-full object-cover rounded-[24px] transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-stone-400 bg-stone-100 rounded-[24px]">
          <ImageIcon className="w-10 h-10 stroke-1 text-stone-400" />
          <span className="text-xs font-medium text-stone-500 mt-1">Sin fotografía</span>
        </div>
      )}

      <div className="absolute left-4 top-4 z-10 flex flex-col items-start gap-1 max-w-[85%] pointer-events-none">
        <h2 className="text-[18px] sm:text-[20px] font-black uppercase leading-none text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)] truncate max-w-full">
          {name}
        </h2>
        {seedBank && (
          <span className="inline-flex items-center rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-800 shadow-2xs">
            {seedBank}
          </span>
        )}
        {dominance && (
          <span className="inline-flex items-center rounded-full bg-[#FFF8EB] border border-amber-400 px-2.5 py-1 text-xs font-bold text-stone-800 shadow-2xs">
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
    <div className="rounded-[22px] border border-stone-200 bg-white p-4 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold uppercase tracking-wide text-stone-400">
        <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>AROMA Y GUSTO</span>
      </div>
      <p className="text-stone-700 font-medium italic leading-relaxed text-xs sm:text-sm">
        {organolepticProfile ? `"${organolepticProfile}"` : 'Sin perfil cargado.'}
      </p>
    </div>

    {children && (
      <>
        <div className="border-t border-stone-100 my-1" />
        {children}
      </>
    )}
  </article>
);
