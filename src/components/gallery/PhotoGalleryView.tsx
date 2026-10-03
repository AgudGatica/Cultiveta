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
  Cloud,
  AlertTriangle,
  Download,
  RotateCcw,
  HardDrive,
  Activity,
  Copy,
  Check,
  X,
  FileText
} from 'lucide-react';
import { PhotoRecord, Cultivation, PhotoCategory } from '../../types';
import { PhotoCompareModal } from './PhotoCompareModal';
import { PhotoLightboxModal } from './PhotoLightboxModal';
import { PhotoImageView } from '../common/PhotoImageView';
import {
  photoOfflineQueue,
  QueuedOfflinePhoto,
  PhotoDiagnosticInfo
} from '../../services/photoOfflineQueue';

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

  // Estado del modal de diagnóstico
  const [diagnosticInfo, setDiagnosticInfo] = useState<PhotoDiagnosticInfo | null>(null);
  const [diagnosticModalOpen, setDiagnosticModalOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

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

  const handleManualSync = () => {
    // Dispara/reaviva el procesamiento asíncrono y devuelve inmediatamente el control de la interfaz
    photoOfflineQueue.triggerProcessing(cultivation.userId);
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

  const openDiagnostic = async (photoId: string) => {
    const info = await photoOfflineQueue.getDiagnostic(photoId);
    if (info) {
      setDiagnosticInfo(info);
      setDiagnosticModalOpen(true);
      setCopyFeedback(false);
    }
  };

  const handleCopyDiagnostic = async () => {
    if (!diagnosticInfo) return;
    try {
      const summary = await photoOfflineQueue.copyDiagnosticSummary(diagnosticInfo.photoId);
      await navigator.clipboard.writeText(summary);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (err) {
      console.warn('Error copiando diagnóstico:', err);
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

  // Crear mapa unificado entre las fotos de estado y los registros de la cola
  const queuedMap = new Map<string, QueuedOfflinePhoto>();
  queuedPhotos.forEach((q) => queuedMap.set(q.id, q));

  // Estados observables derivados de la cola real (FASE 3)
  const uploadingPhotos = queuedPhotos.filter((q) => q.status === 'uploading');
  const savingMetaPhotos = queuedPhotos.filter((q) => q.status === 'saving_metadata');
  const failedPhotos = queuedPhotos.filter((q) => q.status === 'failed' || q.unrecoverable);
  const waitingNetworkPhotos = queuedPhotos.filter((q) => q.status === 'waiting_network');

  const filteredPhotos = photos.filter((p) => {
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'hoja superior') {
      return p.category === 'hoja superior' || p.category === 'hoja inferior';
    }
    return p.category === selectedCategory;
  });

  return (
    <div className="space-y-6">
      {/* Banner de cuota excedida si aplica */}
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white rounded-3xl p-5 sm:p-6 border border-[#EFE3CF] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-base sm:text-lg text-[#29202F]">Galería Cronológica de Fotos 📸</h3>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#62B95B]/15 text-[#62B95B] border border-[#62B95B]/30">
              {photos.length}
            </span>
          </div>
          <p className="text-xs text-[#6E5D77] mt-0.5">
            Registro visual y cronológico de {cultivation.name}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {photos.length >= 2 && (
            <button
              type="button"
              id="open-photo-compare-btn"
              onClick={() => setIsCompareOpen(true)}
              className="px-3.5 py-2 rounded-2xl bg-[#6C45C7]/10 hover:bg-[#6C45C7]/20 text-[#6C45C7] border border-[#6C45C7]/30 text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer shadow-2xs"
            >
              <Scale className="w-3.5 h-3.5 text-[#6C45C7]" />
              <span>Comparar 2 Fotos</span>
            </button>
          )}

          <button
            type="button"
            id="gallery-add-photo-btn"
            onClick={onUploadClick}
            className="cultiveta-btn-primary text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Subir foto</span>
          </button>
        </div>
      </div>

      {/* Banner de cola offline con estados observables reales */}
      {queuedPhotos.length > 0 && (
        <div
          id="gallery-offline-queue-banner"
          className="bg-[#F3C843]/15 border border-[#F3C843]/40 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-[#29202F] shadow-xs"
        >
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#F3C843]/30 text-[#29202F] shrink-0">
              {uploadingPhotos.length > 0 || savingMetaPhotos.length > 0 ? (
                <Loader2 className="w-5 h-5 animate-spin text-[#6C45C7]" />
              ) : failedPhotos.length > 0 ? (
                <AlertTriangle className="w-5 h-5 text-[#EB7864]" />
              ) : (
                <HardDrive className="w-5 h-5 text-[#29202F]" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs sm:text-sm font-bold text-[#29202F]">
                  {queuedPhotos.length} fotografía{queuedPhotos.length === 1 ? '' : 's'} guardada{queuedPhotos.length === 1 ? '' : 's'} en este dispositivo
                </p>
                {failedPhotos.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EB7864]/20 text-[#EB7864] border border-[#EB7864]/30">
                    {failedPhotos.length} requiere atención
                  </span>
                )}
                {uploadingPhotos.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#6C45C7]/15 text-[#6C45C7] border border-[#6C45C7]/30 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Subiendo binario
                  </span>
                )}
                {savingMetaPhotos.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#62B95B]/20 text-[#62B95B] border border-[#62B95B]/30 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Confirmando en servidor
                  </span>
                )}
              </div>

              {/* Mensaje descriptivo derivado del estado real de la cola */}
              <p className="text-[11px] text-[#6E5D77] mt-0.5">
                {!isOnline || waitingNetworkPhotos.length > 0
                  ? 'Sin conexión a internet. Los archivos están a salvo en tu dispositivo y se sincronizarán al volver la red.'
                  : uploadingPhotos.length > 0
                  ? `Subiendo ${uploadingPhotos.length} imagen(es) a Storage... ${
                      uploadingPhotos[0]?.progressPercent
                        ? `(${uploadingPhotos[0].progressPercent}%)`
                        : ''
                    }`
                  : savingMetaPhotos.length > 0
                  ? 'Fotografía subida a Storage. Confirmando registro...'
                  : failedPhotos.length > 0
                  ? 'Algunas fotos no pudieron sincronizarse. Podés reintentar o exportar el archivo original.'
                  : 'Listo para sincronizar en segundo plano.'}
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
                className="px-4 py-2 rounded-2xl bg-[#6C45C7] hover:bg-[#5835ab] text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-[#FAF2E1] text-[#6E5D77] border border-[#EFE3CF] text-xs font-semibold">
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
            className={`px-3.5 py-1.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              selectedCategory === c.value
                ? 'bg-[#6C45C7] text-white shadow-xs'
                : 'bg-white border border-[#EFE3CF] text-[#6E5D77] hover:text-[#29202F] hover:bg-[#FAF2E1]'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Grid de Fotografías */}
      {filteredPhotos.length === 0 ? (
        <div className="bg-white rounded-3xl p-10 border border-[#EFE3CF] text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-[#6C45C7] flex items-center justify-center mx-auto">
            <Camera className="w-7 h-7" />
          </div>
          <h4 className="font-bold text-[#29202F] text-base">No hay fotografías registradas en esta categoría</h4>
          <p className="text-xs text-[#6E5D77] max-w-sm mx-auto">
            Documentá tu cultivo semana a semana con fotos fechadas para ver el avance botánico y diagnosticar carencias.
          </p>
          <button
            type="button"
            onClick={onUploadClick}
            className="mt-2 px-5 py-2.5 rounded-2xl bg-[#6C45C7] hover:bg-[#5835ab] text-white text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-2 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Subir primera foto</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredPhotos.map((photo) => {
            const queueItem = queuedMap.get(photo.id);
            const isUploading = photo.syncStatus === 'uploading' || queueItem?.status === 'uploading';
            const isSavingMeta =
              photo.syncStatus === 'saving_metadata' ||
              queueItem?.status === 'saving_metadata' ||
              (queueItem?.stagePending === 'firestore' && queueItem?.status !== 'failed');
            const isFailed = photo.syncStatus === 'error' || queueItem?.status === 'failed' || queueItem?.unrecoverable;
            const isWaitingNetwork = photo.syncStatus === 'waiting_network' || queueItem?.status === 'waiting_network';
            const isPending = photo.isPendingSync || !!queueItem;
            const isSynced = !isPending && (photo.syncStatus === 'synced' || photo.url?.startsWith('http'));

            return (
              <div
                key={photo.id}
                className="bg-white rounded-3xl overflow-hidden border border-[#EFE3CF] shadow-2xs hover:shadow-xs transition-all group flex flex-col justify-between"
              >
                {/* Photo Area */}
                <div
                  id={`photo-card-${photo.id}`}
                  onClick={() => openLightbox(photo.id)}
                  className="relative aspect-4/3 bg-[#FFFDF7] overflow-hidden cursor-pointer group/photo"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openLightbox(photo.id);
                    }
                  }}
                  title="Hacé clic para ampliar en pantalla completa"
                >
                  {/* Photo Image View con hook de vista previa durable desde IndexedDB */}
                  <PhotoImageView
                    photo={photo}
                    userId={cultivation.userId}
                    alt={photo.caption || 'Foto del cultivo'}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover/photo:scale-105"
                  />

                  {/* Day Badge */}
                  <div className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full bg-black/80 bg-white/90 backdrop-blur-xs text-[#29202F] text-[11px] font-bold shadow-xs border border-[#EFE3CF]">
                    Día {photo.dayOfCultivation}
                  </div>

                  {/* Badges de estado observable */}
                  {isSynced && (
                    <div
                      title="Fotografía confirmada en Storage y Firestore"
                      className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[#62B95B]/20 backdrop-blur-xs text-[#62B95B] border border-[#62B95B]/40 text-[10px] font-bold flex items-center gap-1 shadow-2xs"
                    >
                      <Cloud className="w-3 h-3 text-[#62B95B]" />
                      <span>Sincronizada</span>
                    </div>
                  )}

                  {isUploading && (
                    <div
                      title={`Subiendo archivo binario a Storage (${queueItem?.progressPercent || 0}%)...`}
                      className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[#6C45C7]/20 backdrop-blur-xs text-[#6C45C7] border border-[#6C45C7]/30 text-[10px] font-bold flex items-center gap-1 shadow-2xs animate-pulse"
                    >
                      <Loader2 className="w-3 h-3 text-[#6C45C7] animate-spin" />
                      <span>{queueItem?.progressPercent ? `${queueItem.progressPercent}%` : 'Subiendo...'}</span>
                    </div>
                  )}

                  {isSavingMeta && (
                    <div
                      title="Subida a Storage finalizada. Confirmando en servidor..."
                      className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[#62B95B]/20 backdrop-blur-xs text-[#62B95B] border border-[#62B95B]/30 text-[10px] font-bold flex items-center gap-1 shadow-2xs"
                    >
                      <Loader2 className="w-3 h-3 text-[#62B95B] animate-spin" />
                      <span>Pendiente de confirmación</span>
                    </div>
                  )}

                  {isWaitingNetwork && (
                    <div
                      title="Esperando conexión a internet para sincronizar"
                      className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[#F3C843]/30 backdrop-blur-xs text-[#29202F] border border-[#F3C843]/40 text-[10px] font-bold flex items-center gap-1 shadow-2xs"
                    >
                      <WifiOff className="w-3 h-3 text-[#29202F]" />
                      <span>Esperando red</span>
                    </div>
                  )}

                  {isFailed && (
                    <div
                      title={`Fallo de sincronización: ${queueItem?.lastError || photo.syncError || 'Desconocido'}`}
                      className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[#EB7864]/20 backdrop-blur-xs text-[#EB7864] border border-[#EB7864]/40 text-[10px] font-bold flex items-center gap-1 shadow-2xs"
                    >
                      <AlertTriangle className="w-3 h-3 text-[#EB7864]" />
                      <span>Requiere atención</span>
                    </div>
                  )}

                  {isPending && !isUploading && !isSavingMeta && !isFailed && !isWaitingNetwork && (
                    <div
                      title="Fotografía guardada en este dispositivo (IndexedDB). Pendiente de sincronización."
                      className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[#FAF2E1] backdrop-blur-xs text-[#6E5D77] border border-[#EFE3CF] text-[10px] font-bold flex items-center gap-1 shadow-2xs"
                    >
                      <HardDrive className="w-3 h-3 text-[#6E5D77]" />
                      <span>En dispositivo</span>
                    </div>
                  )}

                  {/* Category Pill */}
                  <div className="absolute bottom-2 left-2 px-2.5 py-0.5 rounded-full bg-white/90 backdrop-blur-xs text-[#6E5D77] border border-[#EFE3CF] text-[10px] font-bold uppercase tracking-wider shadow-2xs">
                    {photo.category}
                  </div>

                  {/* Quick hover overlay */}
                  <div className="absolute inset-0 bg-[#29202F]/40 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[1px]">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openLightbox(photo.id);
                      }}
                      className="p-2.5 rounded-2xl bg-white hover:bg-[#FAF2E1] text-[#29202F] border border-[#EFE3CF] transition-transform hover:scale-105 cursor-pointer flex items-center gap-1.5 text-xs font-bold shadow-xs"
                      title="Ver en pantalla completa"
                    >
                      <Maximize2 className="w-3.5 h-3.5 text-[#6C45C7]" />
                      <span>Ampliar</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAnalyzePhoto(photo);
                      }}
                      className="p-2.5 rounded-2xl bg-[#6C45C7] hover:bg-[#5835ab] text-white transition-transform hover:scale-105 cursor-pointer shadow-md"
                      title="Analizar con Cultiveta IA"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Metadata & Actions */}
                <div className="p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs text-[#6E5D77]">
                    <span className="font-bold text-[#29202F]">{photo.date}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-lg bg-[#FAF2E1] border border-[#EFE3CF] text-[#6E5D77] font-semibold">
                      {photo.stage}
                    </span>
                  </div>

                  {photo.caption && (
                    <p className="text-xs text-[#6E5D77] line-clamp-2 italic font-normal">
                      "{photo.caption}"
                    </p>
                  )}

                  {/* Si falló o está pendiente, mostrar opciones de reintento, diagnóstico y exportación */}
                  {isFailed && (
                    <div className="p-2 rounded-2xl bg-[#EB7864]/10 border border-[#EB7864]/20 text-[#EB7864] text-[11px] space-y-1.5">
                      <p className="line-clamp-1 font-mono text-[10px]">
                        {queueItem?.lastError || photo.syncError || 'Error de sincronización'}
                      </p>
                      <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleRetryPhoto(photo.id)}
                          className="px-2 py-1 rounded-lg bg-[#EB7864] hover:bg-[#d66450] text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reintentar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openDiagnostic(photo.id)}
                          className="px-2 py-1 rounded-lg bg-white hover:bg-[#FAF2E1] text-[#29202F] text-[10px] font-bold flex items-center gap-1 cursor-pointer border border-[#EFE3CF]"
                          title="Ver diagnóstico seguro"
                        >
                          <Activity className="w-3 h-3 text-[#F3C843]" />
                          <span>Diagnóstico</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportPhoto(photo.id)}
                          className="px-2 py-1 rounded-lg bg-white hover:bg-[#FAF2E1] text-[#29202F] text-[10px] font-bold flex items-center gap-1 cursor-pointer border border-[#EFE3CF]"
                        >
                          <Download className="w-3 h-3" />
                          <span>Exportar</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Card bottom actions */}
                  <div className="pt-2 border-t border-[#EFE3CF] flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onAnalyzePhoto(photo)}
                      className="text-xs font-bold text-[#6C45C7] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Diagnóstico IA</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      {isPending && (
                        <>
                          <button
                            type="button"
                            onClick={() => openDiagnostic(photo.id)}
                            className="text-[#9887A2] hover:text-[#6C45C7] transition-colors p-1 cursor-pointer"
                            title="Diagnóstico de sincronización"
                          >
                            <Activity className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportPhoto(photo.id)}
                            className="text-[#9887A2] hover:text-[#29202F] transition-colors p-1 cursor-pointer"
                            title="Descargar respaldo local (archivo original)"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </>
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
                          className="text-[#9887A2] hover:text-[#EB7864] transition-colors p-1 cursor-pointer"
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

      {/* Modal de Diagnóstico Seguro */}
      {diagnosticModalOpen && diagnosticInfo && (
        <div className="cultiveta-modal-overlay animate-in fade-in">
          <div className="cultiveta-modal-container max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#EFE3CF]">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-2xl bg-[#F3C843]/20 text-[#29202F]">
                  <Activity className="w-4 h-4 text-[#6C45C7]" />
                </div>
                <h4 className="font-extrabold text-sm text-[#29202F]">Diagnóstico de Fotografía</h4>
              </div>
              <button
                type="button"
                onClick={() => setDiagnosticModalOpen(false)}
                className="p-1.5 text-[#9887A2] hover:text-[#29202F] rounded-lg hover:bg-[#FAF2E1] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono bg-[#FFFDF7] p-3.5 rounded-2xl border border-[#EFE3CF] overflow-x-auto text-[#29202F] leading-relaxed">
              <div><span className="text-[#9887A2]">ID:</span> {diagnosticInfo.photoId}</div>
              <div><span className="text-[#9887A2]">Fase actual:</span> <span className="text-[#6C45C7] font-semibold">{diagnosticInfo.phase}</span></div>
              <div><span className="text-[#9887A2]">Estado:</span> {diagnosticInfo.status}</div>
              <div><span className="text-[#9887A2]">Progreso:</span> {diagnosticInfo.progressPercent}% ({diagnosticInfo.bytesTransferred} / {diagnosticInfo.totalBytes} B)</div>
              <div><span className="text-[#9887A2]">Último avance:</span> {diagnosticInfo.lastProgressAt || 'Ninguno'}</div>
              <div><span className="text-[#9887A2]">Tiempo activo:</span> {diagnosticInfo.elapsedSeconds ? `${diagnosticInfo.elapsedSeconds}s` : '0s'}</div>
              <div><span className="text-[#9887A2]">Intentos:</span> {diagnosticInfo.retryCount}</div>
              {diagnosticInfo.lastErrorCode && (
                <div><span className="text-[#9887A2]">Código SDK:</span> <span className="text-[#EB7864]">{diagnosticInfo.lastErrorCode}</span></div>
              )}
              {diagnosticInfo.lastError && (
                <div><span className="text-[#9887A2]">Mensaje:</span> <span className="text-[#EB7864]">{diagnosticInfo.lastError}</span></div>
              )}
              <div className="pt-2 border-t border-[#EFE3CF] mt-2 text-[11px] text-[#6E5D77] space-y-0.5">
                <div><span className="text-[#9887A2]">Proyecto:</span> {diagnosticInfo.effectiveProjectId}</div>
                <div><span className="text-[#9887A2]">Base Firestore:</span> {diagnosticInfo.effectiveDatabaseId}</div>
                <div><span className="text-[#9887A2]">Bucket Storage:</span> {diagnosticInfo.effectiveBucket}</div>
                <div><span className="text-[#9887A2]">Bloqueo:</span> {diagnosticInfo.lockActive ? `Activo (${diagnosticInfo.lockOwner})` : 'Inactivo'}</div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleCopyDiagnostic}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#FAF2E1] text-[#29202F] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-[#EFE3CF]"
              >
                {copyFeedback ? <Check className="w-3.5 h-3.5 text-[#62B95B]" /> : <Copy className="w-3.5 h-3.5 text-[#6C45C7]" />}
                <span>{copyFeedback ? 'Copiado al portapapeles' : 'Copiar Diagnóstico'}</span>
              </button>

              <button
                type="button"
                onClick={() => setDiagnosticModalOpen(false)}
                className="cultiveta-btn-primary text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
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
