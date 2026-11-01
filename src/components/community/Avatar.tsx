import React, { useState } from 'react';

/** Foto del grower o, si es incógnito (o la foto no carga), un círculo de color con su inicial. */
export const Avatar: React.FC<{ url: string | null | undefined; name: string; color: string; size?: number; className?: string }> = ({ url, name, color, size = 40, className = '' }) => {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (url && !failed) {
    return <img src={url} alt={name} referrerPolicy="no-referrer" onError={() => setFailed(true)} style={style} className={`rounded-full object-cover shrink-0 bg-track ${className}`} />;
  }
  return (
    <span aria-label={name} role="img" style={{ ...style, background: color }} className={`rounded-full shrink-0 inline-flex items-center justify-center text-white font-black uppercase ${className}`}>
      {(name.trim()[0] || '?').toUpperCase()}
    </span>
  );
};
