import React, { useState } from 'react';
import { X, Camera, Upload, Sparkles, Save, Image as ImageIcon } from 'lucide-react';
import { Cultivation, PhotoCategory, PhotoRecord } from '../../types';
import { photoService } from '../../services/photoService';
import { cultivationService } from '../../services/cultivationService';

interface PhotoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  cultivations: Cultivation[];
  defaultCultivationId?: string;
  onPhotoUploaded: (photo: PhotoRecord, triggerAI?: boolean) => void;
}

export const PhotoUploadModal: React.FC<PhotoUploadModalProps> = ({
  isOpen,
  onClose,
  userId,
  cultivations,
  defaultCultivationId,
  onPhotoUploaded,
}) => {
  const [cultivationId, setCultivationId] = useState(defaultCultivationId || (cultivations[0]?.id || ''));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [category, setCategory] = useState<PhotoCategory>('planta completa');
  const [caption, setCaption] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [analyzeWithAI, setAnalyzeWithAI] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCrop = cultivations.find((c) => c.id === cultivationId);

  const handleFileChange = async (file: File) => {
    setSelectedFile(file);
    const dataUrl = await photoService.compressAndReadFileAsDataUrl(file);
    setPreviewUrl(dataUrl);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cultivationId) {
      setError('Por favor selecciona un cultivo.');
      return;
    }
    if (!selectedFile && !previewUrl) {
      setError('Por favor selecciona una fotografía.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let finalUrl = previewUrl || '';
      if (selectedFile) {
        finalUrl = await photoService.uploadPhotoFile(userId, cultivationId, selectedFile);
      }

      const totalDays = selectedCrop ? cultivationService.calculateDays(selectedCrop.startDate) : 1;
      const stage = selectedCrop?.currentStage || 'Vegetativo';

      const newPhoto = await photoService.addPhotoRecord({
        userId,
        cultivationId,
        url: finalUrl,
        date,
        dayOfCultivation: totalDays,
        stage,
        category,
        caption: caption.trim() || undefined,
        isDemo: selectedCrop?.isDemo,
      });

      onPhotoUploaded(newPhoto, analyzeWithAI);
      onClose();
    } catch (err: any) {
      console.error('Error uploading photo', err);
      setError(err?.message || 'No se pudo guardar la fotografía.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div
        id="photo-upload-modal-box"
        className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-stone-200 my-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-blue-100 text-blue-800">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">Subir Fotografía 📸</h2>
              <p className="text-xs text-stone-500">Agrega fotos al historial cronológico de tu cultivo</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-700 rounded-full hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Crop selector & date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Cultivo *</label>
              <select
                id="photo-crop-select"
                value={cultivationId}
                onChange={(e) => setCultivationId(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-xs focus:outline-hidden focus:border-blue-500 focus:bg-white cursor-pointer"
              >
                {cultivations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.currentStage})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Fecha</label>
              <input
                id="photo-date-input"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-blue-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Photo Dropzone */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Fotografía *</label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-stone-300 rounded-3xl p-6 text-center hover:border-blue-500 hover:bg-blue-50/30 transition-all relative overflow-hidden bg-stone-50/50 cursor-pointer"
            >
              {previewUrl ? (
                <div className="flex flex-col items-center gap-3">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-52 rounded-2xl object-cover border border-stone-200 shadow-xs"
                  />
                  <span className="text-xs font-semibold text-blue-700 hover:underline">
                    Hacer clic para cambiar fotografía
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-stone-700">Arrastra una foto aquí o haz clic para buscar</p>
                  <p className="text-[11px] text-stone-400">JPG, PNG o WEBP de alta calidad</p>
                </div>
              )}
              <input
                id="photo-file-input"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Categoría de la foto</label>
            <select
              id="photo-category-select"
              value={category}
              onChange={(e) => setCategory(e.target.value as PhotoCategory)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-xs focus:outline-hidden focus:border-blue-500 focus:bg-white cursor-pointer"
            >
              <option value="planta completa">Planta completa</option>
              <option value="flor">Flor / Cogollo</option>
              <option value="hoja superior">Hoja superior</option>
              <option value="hoja inferior">Hoja inferior</option>
              <option value="tallo">Tallo y ramificación</option>
              <option value="sustrato">Sustrato y raíces</option>
              <option value="zona problemática">Zona problemática o síntoma</option>
              <option value="tricomas">Tricomas / Macro</option>
              <option value="otra">Otra</option>
            </select>
          </div>

          {/* Caption */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Descripción o pie de foto</label>
            <input
              id="photo-caption-input"
              type="text"
              placeholder="ej. Formación de pistilos y desarrollo de resina..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-blue-500 focus:bg-white"
            />
          </div>

          {/* Direct AI trigger checkbox */}
          <div className="p-3.5 rounded-2xl bg-violet-50/80 border border-violet-200/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-violet-600 shrink-0" />
              <div>
                <div className="text-xs font-bold text-violet-950">Analizar con Cultiveta IA</div>
                <div className="text-[11px] text-violet-700 leading-tight">
                  Abrir análisis inteligente con Gemini al guardar
                </div>
              </div>
            </div>
            <input
              id="analyze-with-ai-checkbox"
              type="checkbox"
              checked={analyzeWithAI}
              onChange={(e) => setAnalyzeWithAI(e.target.checked)}
              className="w-4 h-4 text-violet-600 rounded-md focus:ring-violet-500 cursor-pointer"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-full text-xs font-semibold text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="save-photo-btn"
              disabled={loading}
              className="px-6 py-2.5 rounded-full text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Subiendo...' : 'Guardar Fotografía'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
