import React, { useEffect, useState } from 'react';

/**
 * Foto para genéticas sin foto real (la silueta con el signo de pregunta). Va en public/portadas: cuadrada,
 * 1200 × 1200 px, con el dibujo en el 60 % central, porque la tarjeta grande la recorta arriba y abajo.
 */
export const GENETIC_PLACEHOLDER = '/portadas/genetica-sin-foto.webp';

interface GeneticPhotoProps {
  src?: string | null;
  alt?: string;
  className?: string;
  /** Lo que se ve si tampoco está la foto por defecto (por ejemplo, el ícono de ADN). */
  fallback: React.ReactNode;
}

/** La foto de la genética; si no tiene o no carga, la foto por defecto; si esa tampoco está, el ícono. */
export const GeneticPhoto: React.FC<GeneticPhotoProps> = ({ src, alt = '', className = 'absolute inset-0 w-full h-full object-cover', fallback }) => {
  const [step, setStep] = useState<0 | 1 | 2>(src ? 0 : 1);
  useEffect(() => setStep(src ? 0 : 1), [src]);
  if (step === 2) return <>{fallback}</>;
  const url = step === 0 ? src! : GENETIC_PLACEHOLDER;
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      data-placeholder={step === 1 ? 'true' : undefined}
      onError={() => setStep(step === 0 ? 1 : 2)}
      className={className}
    />
  );
};
