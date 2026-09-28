import React, { useState, useEffect } from 'react';
import {
  Camera,
  Plus,
  Scale,
  Sparkles,
  Trash2,
  Maximize2,
  WifiOff,
  RefreshCw,
  Loader2,
  Database,
  Cloud,
  CloudOff,
  AlertTriangle,
  Download,
  RotateCcw,
  CheckCircle2,
  HardDrive
} from 'lucide-react';
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
  const [quotaWarning, setQuotaWarning] = useState<string | null>(null);

  useEffect(() => {
    const unsub = photoOfflineQueue.subscribeQueue((items) => {
      const forThisCrop = items.filter((item) => item.cultivationId === cultivation.id);
      setQueuedPhotos(forThisCrop);
    }, cultivation.userId);

    const handleStatus = () => {
      setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    };

    const handleQuotaExceeded = (e: Event) => {
      const custom = e as CustomEvent<{ collectionName: string; error: string }>;
      setQuotaWarning(
        `Alerta de almacenamiento local: Se excedió la cuota en el navegador (${custom.detail?.collectionName || 'datos'}). Los registros se conservan en memoria e IndexedDB.`
      );
    };

    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    window.addEventListener('cultiveta_storage_quota_exceeded', handleQuotaExceeded);

    return () => {
      unsub();
      window.removeEventListener('online', handleStatus);
      window.removeEventListener('offline', handleStatus);
      window.removeEventListener('cultiveta_storage_quota_exceeded', handleQuotaExceeded);
    };
  }, [cultivation.id, cultivation.userId]);

  const handleManualSync = async () => {
    if (isSyncing) return;
    try {
      setIsSyncing(true);
      await photoOfflineQueue.syncPendingPhotos(cultivation.userId);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRetryPhoto = async (photoId: string) => {
    await photoOfflineQueue.retryPendingPhoto(photoId, cultivation.userId);
  };

  const handleExportPhoto = async (photoId: string) => {
    await photoOfflineQueue.triggerPhotoDownload(photoId);
  };

  const handleDeleteQueued = async (photoId: string) => {
    await photoOfflineQueue.deletePendingPhoto(photoId, cultivation.userId);
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

  // Crear mapa unificado entre las fotos de estado y los registros de la cola
  const queuedMap = new Map<string, QueuedOfflinePhoto>();
  queuedPhotos.forEach((q) => queuedMap.set(q.id, q));

  const filteredPhotos = photos.filter((p) => {
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'hoja superior') {
      return p.category === 'hoja superior' || p.category === 'hoja inferior';
    }
    return p.category === selectedCategory;
  });

  return (
    <div className="space-y-6">
      {/* Banner de cuota excedida si aplica (FASE 4) */}
      {quotaWarning && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{quotaWarning}</span>
          </div>
          <button
            type="button"
            onClick={() => setQuotaWarning(null)}
            className="text-xs text-rose-400 hover:underline ml-3"
          >
            Entendido
          </button>
        </div>
      )}

      {/* Gallery Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#0F0F0F] rounded-3xl p-5 sm:p-6 border border-zinc-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-base sm:text-lg text-zinc-100">Galería Cronológica de Evidencias 📸</h3>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {photos.length}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Registro visual y cronológico de {cultivation.name}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {photos.length >= 2 && (
            <button
              type="button"
              id="open-photo-compare-btn"
              onClick={() => setIsCompareOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-violet-950/30 hover:bg-violet-900/40 text-violet-300 border border-violet-500/30 text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Scale className="w-3.5 h-3.5 text-violet-400" />
              <span>Comparar 2 Fotos</span>
            </button>
          )}

          <button
            type="button"
            id="gallery-add-photo-btn"
            onClick={onUploadClick}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-black text-xs font-bold transition-all shadow-md shadow-emerald-950/20 flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Subir Evidencia</span>
          </button>
        </div>
      </div>

      {/* Banner de cola offline con estados explícitos (FASE 4) */}
      {queuedPhotos.length > 0 && (
        <div
          id="gallery-offline-queue-banner"
          className="bg-amber-950/20 border border-amber-500/30 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-amber-200 shadow-xs"
        >
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs sm:text-sm font-bold text-amber-200">
                  {queuedPhotos.length} fotografía{queuedPhotos.length === 1 ? '' : 's'} guardada{queuedPhotos.length === 1 ? '' : 's'} en este dispositivo
                </p>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Cola Local (IndexedDB)
                </span>
              </div>
              <p className="text-[11px] text-amber-300/80 mt-0.5">
                {isOnline
                  ? 'Sincronizando automáticamente con la nube en segundo plano...'
                  : 'Guardadas en tu equipo. Se respaldarán en Firebase Storage tan pronto se restablezca la conexión.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isOnline ? (
              <button
                type="button"
                id="gallery-manual-sync-btn"
                disabled={isSyncing}
                onClick={handleManualSync}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-black text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
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
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/20 text-xs font-semibold">
                <WifiOff className="w-3.5 h-3.5" />
                <span>Esperando red</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {categories.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setSelectedCategory(c.value)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              selectedCategory === c.value
                ? 'bg-emerald-600 text-black font-bold shadow-xs'
                : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Grid de Fotografías */}
      {filteredPhotos.length === 0 ? (
        <div className="bg-[#0F0F0F] rounded-3xl p-10 border border-zinc-800 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-500 flex items-center justify-center mx-auto">
            <Camera className="w-7 h-7" />
          </div>
          <h4 className="font-bold text-zinc-200 text-base">No hay fotografías registradas en esta categoría</h4>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            Documenta tu cultivo semana a semana con fotos fechadas para ver el avance botánico y diagnosticar carencias.
          </p>
          <button
            type="button"
            onClick={onUploadClick}
            className="mt-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-black text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Subir Primera Evidencia
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredPhotos.map((photo) => {
            const queueItem = queuedMap.get(photo.id);
            const isUploading = photo.syncStatus === 'uploading' || queueItem?.status === 'uploading';
            const isSavingMeta = photo.syncStatus === 'saving_metadata' || queueItem?.status === 'saving_metadata';
            const isFailed = photo.syncStatus === 'error' || queueItem?.status === 'failed';
            const isPending = photo.isPendingSync || !!queueItem;
            const isSynced = !isPending && (photo.syncStatus === 'synced' || photo.url?.startsWith('http'));

            return (
              <div
                key={photo.id}
                className="bg-[#0F0F0F] rounded-2xl overflow-hidden border border-zinc-800 shadow-sm hover:border-zinc-700 transition-all group flex flex-col justify-between"
              >
                {/* Photo Area */}
                <div
                  id={`photo-card-${photo.id}`}
                  onClick={() => openLightbox(photo.id)}
                  className="relative aspect-4/3 bg-zinc-900 overflow-hidden cursor-pointer group/photo"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openLightbox(photo.id);
                    }
                  }}
                  title="Haz clic para ampliar en pantalla completa"
                >
                  {photo.url ? (
                    <img
                      src={photo.url}
                      alt={photo.caption || 'Foto del cultivo'}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover/photo:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 gap-1 bg-zinc-950">
                      <Camera className="w-6 h-6 text-zinc-600" />
                      <span className="text-[10px]">Cargando imagen...</span>
                    </div>
                  )}

                  {/* Day Badge */}
                  <div className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full bg-black/80 backdrop-blur-xs text-zinc-200 text-[11px] font-bold shadow-xs border border-zinc-800">
                    Día {photo.dayOfCultivation}
                  </div>

                  {/* Explicit Status Badges (FASE 4: Sincronizada vs Subiendo vs En este dispositivo vs Error) */}
                  {isSynced && (
                    <div
                      title="Fotografía sincronizada y respaldada en Firebase Storage"
                      className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-emerald-950/80 backdrop-blur-xs text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 shadow-sm"
                    >
                      <Cloud className="w-3 h-3 text-emerald-400" />
                      <span>Sincronizada</span>
                    </div>
                  )}

                  {(isUploading || isSavingMeta) && (
                    <div
                      title="Subiendo imagen y metadatos a Firebase..."
                      className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-blue-950/80 backdrop-blur-xs text-blue-300 border border-blue-500/30 text-[10px] font-bold flex items-center gap-1 shadow-sm animate-pulse"
                    >
                      <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                      <span>Subiendo...</span>
                    </div>
                  )}

                  {isFailed && (
                    <div
                      title={`Error de sincronización: ${queueItem?.lastError || photo.syncError || 'Desconocido'}`}
                      className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-rose-950/90 backdrop-blur-xs text-rose-300 border border-rose-500/30 text-[10px] font-bold flex items-center gap-1 shadow-sm"
                    >
                      <AlertTriangle className="w-3 h-3 text-rose-400" />
                      <span>No se pudo guardar</span>
                    </div>
                  )}

                  {isPending && !isUploading && !isSavingMeta && !isFailed && (
                    <div
                      title="Fotografía guardada de forma segura en este dispositivo (IndexedDB). Pendiente de sincronización."
                      className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-amber-950/90 backdrop-blur-xs text-amber-300 border border-amber-500/30 text-[10px] font-bold flex items-center gap-1 shadow-sm"
                    >
                      <HardDrive className="w-3 h-3 text-amber-400" />
                      <span>En este dispositivo</span>
                    </div>
                  )}

                  {/* Category Pill */}
                  <div className="absolute bottom-2 left-2 px-2.5 py-0.5 rounded-full bg-black/80 backdrop-blur-xs text-zinc-300 border border-zinc-800 text-[10px] font-bold uppercase tracking-wider shadow-xs">
                    {photo.category}
                  </div>

                  {/* Quick hover overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[1px]">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openLightbox(photo.id);
                      }}
                      className="p-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 transition-transform hover:scale-105 cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                      title="Ver en pantalla completa"
                    >
                      <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Ampliar</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAnalyzePhoto(photo);
                      }}
                      className="p-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-transform hover:scale-105 cursor-pointer shadow-md"
                      title="Analizar con Cultiveta IA"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Metadata & Actions */}
                <div className="p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span className="font-semibold text-zinc-200">{photo.date}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400">
                      {photo.stage}
                    </span>
                  </div>

                  {photo.caption && (
                    <p className="text-xs text-zinc-300 line-clamp-2 italic font-normal">
                      "{photo.caption}"
                    </p>
                  )}

                  {/* Si falló, mostrar opciones de reintentar y exportar (FASE 3 & 4) */}
                  {isFailed && (
                    <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] space-y-1.5">
                      <p className="line-clamp-1 font-mono text-[10px]">
                        {queueItem?.lastError || photo.syncError || 'Error de sincronización'}
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleRetryPhoto(photo.id)}
                          className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reintentar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportPhoto(photo.id)}
                          className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>Exportar</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Card bottom actions */}
                  <div className="pt-2 border-t border-zinc-850 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onAnalyzePhoto(photo)}
                      className="text-xs font-bold text-violet-400 hover:text-violet-300 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Diagnóstico IA</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      {isPending && (
                        <button
                          type="button"
                          onClick={() => handleExportPhoto(photo.id)}
                          className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 cursor-pointer"
                          title="Descargar respaldo local"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {onDeletePhoto && (
                        <button
                          type="button"
                          onClick={() => {
                            if (isPending) {
                              handleDeleteQueued(photo.id);
                            }
                            onDeletePhoto(photo.id);
                          }}
                          className="text-zinc-500 hover:text-rose-400 transition-colors p-1 cursor-pointer"
                          title="Eliminar foto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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

      {/* Modern Lightbox Modal */}
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
