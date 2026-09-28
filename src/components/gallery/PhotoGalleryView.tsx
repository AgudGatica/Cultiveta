import React, { useState, useEffect } from 'react';
import { Camera, Plus, Scale, Sparkles, Filter, Calendar, Tag, Trash2, Maximize2, WifiOff, RefreshCw, Loader2, Database, ShieldCheck } from 'lucide-react';
import { PhotoRecord, Cultivation, PhotoCategory } from '../../types';
import { PhotoCompareModal } from './PhotoCompareModal';
import { PhotoLightboxModal } from './PhotoLightboxModal';
import { photoOfflineQueue, QueuedOfflinePhoto } from '../../services/photoOfflineQueue';

interface PhotoGalleryViewProps {
  cultivation: Cultivation;
  photos: PhotoRecord[];
  onUploadClick: () => void;
  onAnalyzePhoto: (photo: PhotoRecord) => void;
  onDeletePhoto?: (photoId: string) => void;
}

export const PhotoGalleryView: React.FC<PhotoGalleryViewProps> = ({
  cultivation,
  photos,
  onUploadClick,
  onAnalyzePhoto,
  onDeletePhoto,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxInitialPhotoId, setLightboxInitialPhotoId] = useState<string | undefined>(undefined);
  const [queuedPhotos, setQueuedPhotos] = useState<QueuedOfflinePhoto[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [cleanSuccessMsg, setCleanSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsub = photoOfflineQueue.subscribeQueue((items) => {
      // Filtrar por este cultivo si aplica
      const forThisCrop = items.filter((item) => item.cultivationId === cultivation.id);
      setQueuedPhotos(forThisCrop);
    });

    const handleStatus = () => {
      setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    };
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);

    return () => {
      unsub();
      window.removeEventListener('online', handleStatus);
      window.removeEventListener('offline', handleStatus);
    };
  }, [cultivation.id]);

  const handleManualSync = async () => {
    if (isSyncing) return;
    try {
      setIsSyncing(true);
      await photoOfflineQueue.syncPendingPhotos();
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePurgeStorage = async () => {
    try {
      const res = await photoOfflineQueue.purgeSyncedAndStaleQueue(cultivation.userId);
      setCleanSuccessMsg(
        res.deletedCount > 0
          ? `Almacenamiento optimizado: ${res.deletedCount} foto(s) purgada(s) (~${res.freedEstimatedKB} KB liberados).`
          : 'Almacenamiento IndexedDB limpio y sin residuos huérfanos.'
      );
      setTimeout(() => setCleanSuccessMsg(null), 3500);
    } catch {
      // ignore
    }
  };

  const openLightbox = (photoId: string) => {
    setLightboxInitialPhotoId(photoId);
    setIsLightboxOpen(true);
  };

  const categories: { label: string; value: string }[] = [
    { label: 'Todas las fotos', value: 'all' },
    { label: '🌺 Flor / Cogollo', value: 'flor' },
    { label: '🔍 Tricomas', value: 'tricomas' },
    { label: '🌿 Planta completa', value: 'planta completa' },
    { label: '🍃 Hojas', value: 'hoja superior' },
    { label: '⚠️ Problemas / Plagas', value: 'zona problemática' },
  ];

  const filteredPhotos = photos.filter((p) => {
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'hoja superior') {
      return p.category === 'hoja superior' || p.category === 'hoja inferior';
    }
    return p.category === selectedCategory;
  });

  return (
    <div className="space-y-6">
      {/* Gallery Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white rounded-3xl p-6 border border-stone-200 shadow-sm">
        <div>
          <h3 className="font-bold text-lg text-stone-900">Galería Cronológica 📸</h3>
          <p className="text-xs text-stone-500">
            {photos.length} fotografía{photos.length === 1 ? '' : 's'} registradas en {cultivation.name}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {photos.length >= 2 && (
            <button
              type="button"
              id="open-photo-compare-btn"
              onClick={() => setIsCompareOpen(true)}
              className="px-4 py-2 rounded-2xl bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Scale className="w-3.5 h-3.5 text-violet-600" />
              <span>Comparar 2 Fotos</span>
            </button>
          )}

          <button
            type="button"
            id="gallery-add-photo-btn"
            onClick={onUploadClick}
            className="px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Subir Foto</span>
          </button>
        </div>
      </div>

      {/* Offline Queue Sync Banner */}
      {queuedPhotos.length > 0 && (
        <div
          id="gallery-offline-queue-banner"
          className="bg-amber-50 border border-amber-200 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-amber-950 shadow-xs"
        >
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-800 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs sm:text-sm font-bold">
                  {queuedPhotos.length} foto{queuedPhotos.length === 1 ? '' : 's'} en caché local (IndexedDB)
                </p>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900">
                  Cola sin conexión
                </span>
              </div>
              <p className="text-[11px] text-amber-800/90 mt-0.5">
                {isOnline
                  ? 'Conexión restablecida. Sincronizando con Firebase en segundo plano...'
                  : 'Guardadas en tu dispositivo. Se subirán automáticamente a Firebase al recuperar la conexión.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              id="gallery-purge-cache-btn"
              onClick={handlePurgeStorage}
              title="Comprueba y purga fotos sincronizadas de la memoria IndexedDB"
              className="px-3 py-2 rounded-2xl bg-amber-100/90 hover:bg-amber-200 text-amber-900 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-amber-700" />
              <span className="hidden sm:inline">Limpiar caché</span>
            </button>

            {isOnline ? (
              <button
                type="button"
                id="gallery-manual-sync-btn"
                disabled={isSyncing}
                onClick={handleManualSync}
                className="px-4 py-2 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sincronizando...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Sincronizar ahora</span>
                  </>
                )}
              </button>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-amber-100 text-amber-800 text-xs font-semibold">
                <WifiOff className="w-3.5 h-3.5" />
                <span>Esperando red...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Feedback message for storage cleanup */}
      {cleanSuccessMsg && (
        <div
          id="gallery-cleanup-feedback"
          className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2.5 shadow-xs transition-all"
        >
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{cleanSuccessMsg}</span>
        </div>
      )}

      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {categories.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setSelectedCategory(c.value)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              selectedCategory === c.value
                ? 'bg-stone-900 text-white shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Grid of Photos */}
      {filteredPhotos.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 border border-stone-200 text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
            <Camera className="w-8 h-8" />
          </div>
          <h4 className="font-bold text-stone-800 text-base">No hay fotografías en esta categoría</h4>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            Documenta tu cultivo semana a semana para ver el progreso y diagnosticar posibles carencias con IA.
          </p>
          <button
            type="button"
            onClick={onUploadClick}
            className="mt-2 px-5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Subir Primera Foto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredPhotos.map((photo) => (
            <div
              key={photo.id}
              className="bg-white rounded-3xl overflow-hidden border border-stone-200/90 shadow-2xs hover:shadow-md transition-all group flex flex-col justify-between"
            >
              {/* Photo Area with Lightbox click */}
              <div
                id={`photo-card-${photo.id}`}
                onClick={() => openLightbox(photo.id)}
                className="relative aspect-4/3 bg-stone-100 overflow-hidden cursor-pointer group/photo"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openLightbox(photo.id);
                  }
                }}
                title="Haz clic para ver en pantalla completa"
              >
                <img
                  src={photo.url}
                  alt={photo.caption || 'Foto de cultivo'}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover/photo:scale-105"
                />

                {/* Day Badge */}
                <div className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full bg-stone-900/80 backdrop-blur-xs text-white text-[11px] font-bold shadow-xs">
                  Día {photo.dayOfCultivation}
                </div>

                {/* Pending Sync Badge (IndexedDB Cache) */}
                {photo.isPendingSync && (
                  <div
                    title="Fotografía encolada en caché local (IndexedDB) pendiente de sincronización con Firebase"
                    className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-amber-600/90 backdrop-blur-xs text-white text-[10px] font-bold flex items-center gap-1 shadow-md"
                  >
                    <WifiOff className="w-2.5 h-2.5" />
                    <span>En caché local</span>
                  </div>
                )}

                {/* Category Badge */}
                <div className="absolute bottom-2 left-2 px-2.5 py-0.5 rounded-full bg-white/95 backdrop-blur-xs text-stone-800 text-[10px] font-bold uppercase tracking-wider shadow-xs">
                  {photo.category}
                </div>

                {/* Quick overlay buttons */}
                <div className="absolute inset-0 bg-stone-950/40 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center gap-2.5 backdrop-blur-[1px]">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openLightbox(photo.id);
                    }}
                    className="p-3 rounded-full bg-white hover:bg-stone-100 text-stone-900 transition-transform hover:scale-110 cursor-pointer shadow-lg flex items-center gap-1.5 text-xs font-bold px-3.5"
                    title="Ver en pantalla completa"
                  >
                    <Maximize2 className="w-4 h-4 text-emerald-700" />
                    <span>Ampliar</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAnalyzePhoto(photo);
                    }}
                    className="p-3 rounded-full bg-violet-600 hover:bg-violet-700 text-white transition-transform hover:scale-110 cursor-pointer shadow-lg"
                    title="Analizar con Cultiveta IA"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Card Meta */}
              <div className="p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-500">
                  <span className="font-semibold text-stone-700">{photo.date}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 font-medium">
                    {photo.stage}
                  </span>
                </div>

                {photo.caption && (
                  <p className="text-xs text-stone-700 line-clamp-2 italic font-normal">
                    "{photo.caption}"
                  </p>
                )}

                {/* Bottom action */}
                <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onAnalyzePhoto(photo)}
                    className="text-xs font-bold text-violet-700 hover:text-violet-900 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Diagnóstico IA</span>
                  </button>

                  {onDeletePhoto && (
                    <button
                      type="button"
                      onClick={() => onDeletePhoto(photo.id)}
                      className="text-stone-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                      title="Eliminar foto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Comparison Modal */}
      {isCompareOpen && (
        <PhotoCompareModal
          isOpen={isCompareOpen}
          onClose={() => setIsCompareOpen(false)}
          photos={photos}
          cultivation={cultivation}
        />
      )}

      {/* Modern Lightbox Modal with Fullscreen Navigation Controls */}
      <PhotoLightboxModal
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
        photos={filteredPhotos.length > 0 ? filteredPhotos : photos}
        initialPhotoId={lightboxInitialPhotoId}
        cultivation={cultivation}
        onAnalyzePhoto={onAnalyzePhoto}
        onDeletePhoto={onDeletePhoto}
      />
    </div>
  );
};
