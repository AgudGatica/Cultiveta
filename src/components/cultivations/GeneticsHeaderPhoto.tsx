import React, { useState } from 'react';
import { Sparkles, Layers } from 'lucide-react';
import { CultivationPhotoResolution } from '../../utils/cultivationPhotoResolver';

interface GeneticsHeaderPhotoProps {
  resolution: CultivationPhotoResolution;
  cultivationName: string;
}

/**
 * Componente visual para la identidad fotográfica del cultivo en el Main Crop Header Card.
 * Cumple estrictamente:
 * - Aspect ratio: aspect-[295/176] (estándar visual del catálogo)
 * - w-full h-full object-cover
 * - Badge "✨ Foto de referencia" si proviene del catálogo o genética
 * - Si es coverPhotoUrl propia, NO muestra badge de referencia
 * - Manejo de error/carga limpia sin romper el layout
 * - Composición compacta con indicación clara si hay múltiples genéticas
 */
export const GeneticsHeaderPhoto: React.FC<GeneticsHeaderPhotoProps> = ({
  resolution,
  cultivationName,
}) => {
  const [hasError, setHasError] = useState(false);

  // Si no hay foto o hubo error de carga, mantener limpio sin placeholder invasivo
  if (!resolution.displayPhotoUrl || hasError) {
    return null;
  }

  const { displayPhotoUrl, isReferencePhoto, hasMultipleGenetics, individualGeneticsPhotos } = resolution;

  return (
    <div
      data-testid="cultivation-header-photo-container"
      className="w-full md:w-72 lg:w-80 shrink-0 self-center md:self-stretch"
    >
      <div className="relative w-full aspect-[295/176] rounded-2xl overflow-hidden bg-track border border-line shadow-xs group">
        {/* Si hay múltiples genéticas con varias fotos resueltas, composición de miniaturas */}
        {hasMultipleGenetics && individualGeneticsPhotos.length > 1 ? (
          <div className="w-full h-full grid grid-cols-2 gap-0.5 bg-line">
            {individualGeneticsPhotos.slice(0, 2).map((item, idx) => (
              <div key={idx} className="relative w-full h-full overflow-hidden bg-track">
                <img
                  src={item.photoUrl}
                  alt={`${item.name} (${item.seedBank || 'Genética'})`}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                  onError={() => setHasError(true)}
                />
                <div className="absolute bottom-1 inset-x-1 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-2xs text-[9px] font-bold text-white truncate">
                  {item.name}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <img
            src={displayPhotoUrl}
            alt={cultivationName}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={() => setHasError(true)}
          />
        )}

        {/* Badge '✨ Foto de referencia' solo para fotos de catálogo / no portada */}
        {isReferencePhoto && (
          <div
            data-testid="reference-photo-badge"
            className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-ink/85 backdrop-blur-xs text-white text-[10px] font-bold tracking-wide flex items-center gap-1 shadow-xs"
          >
            <Sparkles className="w-3 h-3 text-warn-line" />
            <span>Foto de referencia</span>
          </div>
        )}

        {/* Indicador de múltiples genéticas si aplica */}
        {hasMultipleGenetics && (
          <div
            data-testid="multiple-genetics-badge"
            className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-xs text-white text-[9px] font-bold flex items-center gap-1 shadow-xs"
          >
            <Layers className="w-3 h-3 text-ok" />
            <span>
              {individualGeneticsPhotos.length > 0
                ? `${individualGeneticsPhotos[0].name}${individualGeneticsPhotos.length > 1 ? ` +${resolution.totalGeneticsCount - 1}` : ''}`
                : 'Múltiples genéticas'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
