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
        className="w-full h-full flex flex-col items-center justify-center text-ink-muted gap-1.5 bg-surface p-3 select-none"
        style={style}
      >
        <Loader2 className="w-5 h-5 text-ok-ink animate-spin" />
        <span className="text-[11px] text-ink-muted font-medium tracking-tight">Cargando evidencia...</span>
      </div>
    );
  }

  if (hasError || !imageUrl) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center text-ink-muted gap-2 bg-surface p-3 text-center border border-line select-none"
        style={style}
        onClick={onClick}
      >
        <div className="p-2 rounded-xl bg-error/10 text-error border border-error/30">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-ink">Imagen no disponible</p>
          {showFallbackDetails && errorMessage && (
            <p className="text-[11px] text-ink-muted max-w-[180px] truncate">{errorMessage}</p>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            reloadPreview();
          }}
          className="min-h-11 px-3 py-1 rounded-lg bg-surface hover:bg-track text-xs font-medium text-ink border border-line flex items-center gap-1 cursor-pointer transition-colors"
        >
          <RefreshCw className="w-3 h-3 text-ink-muted" />
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
