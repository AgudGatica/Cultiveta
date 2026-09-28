import React from 'react';
import { Camera, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { PhotoRecord } from '../../types';
import { usePhotoPreview } from '../../hooks/usePhotoPreview';

interface PhotoImageViewProps {
  photo: PhotoRecord | undefined;
  userId?: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  showFallbackDetails?: boolean;
}

/**
 * Componente visual de alto rendimiento para representar fotografías de Cultiveta.
 * Gestiona automáticamente vistas previas durables desde IndexedDB, URLs de Storage,
 * y manejo de errores sin bloquear la interfaz ni dejar "Cargando imagen..." indefinidamente.
 */
export const PhotoImageView: React.FC<PhotoImageViewProps> = ({
  photo,
  userId,
  alt = 'Fotografía de cultivo',
  className = 'w-full h-full object-cover',
  style,
  onClick,
  showFallbackDetails = false,
}) => {
  const { imageUrl, isLoading, hasError, errorMessage, handleImageError, reloadPreview } = usePhotoPreview(
    photo,
    userId || photo?.userId
  );

  if (isLoading) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center text-zinc-500 gap-1.5 bg-zinc-950/80 p-3 select-none"
        style={style}
      >
        <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
        <span className="text-[10px] text-zinc-400 font-medium tracking-tight">Cargando evidencia...</span>
      </div>
    );
  }

  if (hasError || !imageUrl) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center text-zinc-400 gap-2 bg-zinc-950 p-3 text-center border border-zinc-800/80 select-none"
        style={style}
        onClick={onClick}
      >
        <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold text-zinc-300">Imagen no disponible</p>
          {showFallbackDetails && errorMessage && (
            <p className="text-[10px] text-zinc-500 max-w-[180px] truncate">{errorMessage}</p>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            reloadPreview();
          }}
          className="px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-[10px] font-medium text-zinc-300 border border-zinc-700/60 flex items-center gap-1 cursor-pointer transition-colors"
        >
          <RefreshCw className="w-3 h-3 text-zinc-400" />
          <span>Reintentar</span>
        </button>
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      className={className}
      style={style}
      onClick={onClick}
      onError={handleImageError}
      loading="lazy"
    />
  );
};
