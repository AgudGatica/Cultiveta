import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Maximize2,
  Minimize2,
  Trash2,
  Calendar,
  Tag,
  ExternalLink,
  Info,
} from 'lucide-react';
import { PhotoRecord, Cultivation } from '../../types';

interface PhotoLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  photos: PhotoRecord[];
  initialPhotoId?: string;
  cultivation: Cultivation;
  onAnalyzePhoto?: (photo: PhotoRecord) => void;
  onDeletePhoto?: (photoId: string) => void;
}

export const PhotoLightboxModal: React.FC<PhotoLightboxModalProps> = ({
  isOpen,
  onClose,
  photos,
  initialPhotoId,
  cultivation,
  onAnalyzePhoto,
  onDeletePhoto,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showMetadata, setShowMetadata] = useState<boolean>(true);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const thumbnailStripRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync initial photo when opened
  useEffect(() => {
    if (isOpen && initialPhotoId && photos.length > 0) {
      const idx = photos.findIndex((p) => p.id === initialPhotoId);
      if (idx !== -1) {
        setCurrentIndex(idx);
      } else {
        setCurrentIndex(0);
      }
      setZoomLevel(1);
    }
  }, [isOpen, initialPhotoId, photos]);

  const currentPhoto: PhotoRecord | undefined = photos[currentIndex];

  const handlePrev = useCallback(() => {
    if (photos.length <= 1) return;
    setZoomLevel(1);
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  }, [photos.length]);

  const handleNext = useCallback(() => {
    if (photos.length <= 1) return;
    setZoomLevel(1);
    setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
  }, [photos.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === '+' || e.key === '=') {
        setZoomLevel((z) => Math.min(z + 0.5, 3));
      } else if (e.key === '-') {
        setZoomLevel((z) => Math.max(z - 0.5, 1));
      } else if (e.key === '0') {
        setZoomLevel(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePrev, handleNext, onClose]);

  // Scroll active thumbnail into center view
  useEffect(() => {
    if (!isOpen || !thumbnailStripRef.current) return;
    const activeThumb = thumbnailStripRef.current.children[currentIndex] as HTMLElement | undefined;
    if (activeThumb) {
      activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentIndex, isOpen]);

  // Touch swipe support
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (diff > 50) {
      handleNext();
    } else if (diff < -50) {
      handlePrev();
    }
    setTouchStartX(null);
  };

  const handleZoomToggle = () => {
    setZoomLevel((prev) => (prev === 1 ? 2 : prev === 2 ? 3 : 1));
  };

  if (!isOpen || !currentPhoto) return null;

  return (
    <div
      ref={containerRef}
      id="photo-lightbox-modal"
      className="fixed inset-0 z-50 flex flex-col bg-stone-950/95 backdrop-blur-md select-none animate-in fade-in duration-200"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Header Bar */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 bg-stone-900/90 border-b border-stone-800/80 z-20 text-white">
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base text-stone-100 truncate max-w-[180px] sm:max-w-xs">
                {cultivation.name}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30">
                Día {currentPhoto.dayOfCultivation}
              </span>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-md bg-stone-800 text-stone-300 text-xs font-medium border border-stone-700">
                {currentPhoto.stage}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-stone-400 mt-0.5">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-stone-400" />
                {currentPhoto.date}
              </span>
              <span className="flex items-center gap-1 uppercase tracking-wider text-[10px] text-stone-400">
                <Tag className="w-2.5 h-2.5 text-stone-400" />
                {currentPhoto.category}
              </span>
            </div>
          </div>
        </div>

        {/* Counter & Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Photo Counter */}
          <div className="px-2.5 py-1 rounded-full bg-stone-800 text-stone-300 text-xs font-semibold border border-stone-700 mr-1 sm:mr-2">
            {currentIndex + 1} / {photos.length}
          </div>

          {/* AI Analysis Quick Trigger */}
          {onAnalyzePhoto && (
            <button
              type="button"
              id="lightbox-analyze-btn"
              onClick={() => {
                const target = currentPhoto;
                onClose();
                onAnalyzePhoto(target);
              }}
              className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
              title="Diagnosticar con Cultiveta IA"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Diagnóstico IA</span>
            </button>
          )}

          {/* Zoom controls */}
          <button
            type="button"
            id="lightbox-zoom-btn"
            onClick={handleZoomToggle}
            className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 transition-colors cursor-pointer border border-stone-700/60"
            title={zoomLevel > 1 ? `Zoom ${zoomLevel}x (clic para reiniciar)` : 'Ampliar zoom'}
          >
            {zoomLevel > 1 ? <ZoomOut className="w-4 h-4 text-emerald-400" /> : <ZoomIn className="w-4 h-4" />}
          </button>

          {/* Metadata Toggle */}
          <button
            type="button"
            onClick={() => setShowMetadata(!showMetadata)}
            className={`p-2 rounded-xl transition-colors cursor-pointer border ${
              showMetadata
                ? 'bg-stone-800 text-stone-200 border-stone-700/60'
                : 'bg-stone-900/60 text-stone-500 border-transparent hover:text-stone-300'
            }`}
            title="Alternar notas y detalles"
          >
            <Info className="w-4 h-4" />
          </button>

          {/* Open full resolution image */}
          <a
            href={currentPhoto.url}
            target="_blank"
            rel="noreferrer noopener"
            className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 transition-colors cursor-pointer border border-stone-700/60 hidden sm:flex items-center justify-center"
            title="Abrir imagen original"
          >
            <ExternalLink className="w-4 h-4" />
          </a>

          {/* Delete Photo Button */}
          {onDeletePhoto && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('¿Seguro que deseas eliminar esta fotografía del cultivo?')) {
                  const targetId = currentPhoto.id;
                  if (photos.length === 1) {
                    onClose();
                  } else {
                    handleNext();
                  }
                  onDeletePhoto(targetId);
                }
              }}
              className="p-2 rounded-xl bg-stone-800 hover:bg-rose-950/70 text-stone-400 hover:text-rose-400 transition-colors cursor-pointer border border-stone-700/60"
              title="Eliminar foto"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Close Button */}
          <button
            type="button"
            id="lightbox-close-btn"
            onClick={onClose}
            className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white transition-colors cursor-pointer border border-stone-700/60 ml-1"
            title="Cerrar (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Image Stage */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden p-2 sm:p-6">
        {/* Previous Button */}
        {photos.length > 1 && (
          <button
            type="button"
            id="lightbox-prev-btn"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="absolute left-2 sm:left-6 z-30 p-3 sm:p-3.5 rounded-full bg-stone-900/80 hover:bg-stone-800 text-white backdrop-blur-md border border-stone-700/70 transition-all hover:scale-105 cursor-pointer shadow-lg active:scale-95 group"
            title="Foto anterior (Flecha izquierda)"
          >
            <ChevronLeft className="w-6 h-6 transition-transform group-hover:-translate-x-0.5" />
          </button>
        )}

        {/* Central Display */}
        <div
          className="relative max-w-full max-h-full flex items-center justify-center transition-transform duration-200 cursor-zoom-in overflow-auto"
          onClick={handleZoomToggle}
        >
          <img
            src={currentPhoto.url}
            alt={currentPhoto.caption || `Fotografía día ${currentPhoto.dayOfCultivation}`}
            style={{
              transform: `scale(${zoomLevel})`,
              transition: 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)',
            }}
            className="max-h-[68vh] sm:max-h-[72vh] max-w-[92vw] sm:max-w-[85vw] object-contain rounded-xl shadow-2xl pointer-events-auto"
          />
        </div>

        {/* Next Button */}
        {photos.length > 1 && (
          <button
            type="button"
            id="lightbox-next-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="absolute right-2 sm:right-6 z-30 p-3 sm:p-3.5 rounded-full bg-stone-900/80 hover:bg-stone-800 text-white backdrop-blur-md border border-stone-700/70 transition-all hover:scale-105 cursor-pointer shadow-lg active:scale-95 group"
            title="Siguiente foto (Flecha derecha)"
          >
            <ChevronRight className="w-6 h-6 transition-transform group-hover:translate-x-0.5" />
          </button>
        )}

        {/* Caption & Observation Overlay */}
        {showMetadata && currentPhoto.caption && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 max-w-lg w-[90%] sm:w-auto bg-stone-900/85 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-stone-700/70 shadow-lg text-center">
            <p className="text-xs sm:text-sm text-stone-200 italic font-normal">
              "{currentPhoto.caption}"
            </p>
          </div>
        )}
      </div>

      {/* Bottom Thumbnail Strip (Filmstrip) */}
      {photos.length > 1 && (
        <footer className="px-4 py-2.5 bg-stone-900/90 border-t border-stone-800/80 z-20">
          <div
            ref={thumbnailStripRef}
            className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-thin scrollbar-thumb-stone-700 max-w-4xl mx-auto px-2"
          >
            {photos.map((photo, index) => {
              const isActive = index === currentIndex;
              return (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => {
                    setZoomLevel(1);
                    setCurrentIndex(index);
                  }}
                  className={`relative shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                    isActive
                      ? 'border-emerald-500 ring-2 ring-emerald-500/40 scale-105 shadow-md'
                      : 'border-stone-700 opacity-60 hover:opacity-100 hover:border-stone-500'
                  }`}
                  title={`Día ${photo.dayOfCultivation} - ${photo.date}`}
                >
                  <img
                    src={photo.url}
                    alt={`Miniatura ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0 inset-x-0 bg-stone-950/80 text-[9px] font-bold text-stone-200 text-center py-0.5 leading-none">
                    D{photo.dayOfCultivation}
                  </div>
                </button>
              );
            })}
          </div>
        </footer>
      )}
    </div>
  );
};
