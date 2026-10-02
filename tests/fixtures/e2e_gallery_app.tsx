import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Cultivation, PhotoRecord } from '../../src/types';
import { PhotoGalleryView } from '../../src/components/gallery/PhotoGalleryView';
import { PhotoUploadModal } from '../../src/components/logs/PhotoUploadModal';
import { localStore } from '../../src/services/localStore';
import '../../src/index.css';

const TEST_CROP: Cultivation = {
  id: 'crop_e2e_chrome_fixture',
  userId: 'user_e2e_chrome_fixture',
  name: 'Carpa Experimental E2E',
  currentStage: 'Floración',
  stageStartDate: '2026-09-01',
  startDate: '2026-09-01',
  plantCount: 2,
  type: 'Indoor',
  substrate: { type: 'Tierra', potVolumeLiters: 10, potType: 'Geotextil' },
  status: 'Óptimo',
  isFinished: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function E2EGalleryApp() {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Cargar fotos persistidas en IndexedDB para este cultivo
  const loadPhotos = async () => {
    try {
      const all = await localStore.getItems<PhotoRecord>('photos', TEST_CROP.userId);
      const cropPhotos = all.filter(
        (p) => p.userId === TEST_CROP.userId && p.cultivationId === TEST_CROP.id
      );
      setPhotos(cropPhotos);
    } catch (err) {
      console.error('Error cargando fotos de IDB:', err);
    }
  };

  useEffect(() => {
    loadPhotos();

    const handleSynced = () => {
      loadPhotos();
    };

    window.addEventListener('cultiveta_photos_synced', handleSynced);
    return () => {
      window.removeEventListener('cultiveta_photos_synced', handleSynced);
    };
  }, []);

  const handlePhotoUploaded = (newPhoto: PhotoRecord) => {
    setPhotos((prev) => [newPhoto, ...prev.filter((p) => p.id !== newPhoto.id)]);
    setIsUploadOpen(false);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-6">
      <div className="flex items-center justify-between bg-[#0F0F0F] p-6 rounded-3xl border border-zinc-800">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
            Entorno de Verificación E2E en Navegador Real
          </span>
          <h1 className="text-2xl font-bold text-white mt-1">{TEST_CROP.name}</h1>
        </div>
        <button
          type="button"
          id="e2e-open-upload-btn"
          onClick={() => setIsUploadOpen(true)}
          className="px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs shadow-lg transition-all cursor-pointer"
        >
          + Subir Foto
        </button>
      </div>

      <PhotoGalleryView
        cultivation={TEST_CROP}
        photos={photos}
        onUploadClick={() => setIsUploadOpen(true)}
        onAnalyzePhoto={() => {}}
      />

      <PhotoUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        userId={TEST_CROP.userId}
        cultivations={[TEST_CROP]}
        defaultCultivationId={TEST_CROP.id}
        onPhotoUploaded={handlePhotoUploaded}
      />
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<E2EGalleryApp />);
}
