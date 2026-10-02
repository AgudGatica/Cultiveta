import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Camera,
  Upload,
  Sparkles,
  Save,
  WifiOff,
  AlertTriangle,
  Info,
  Calendar,
  Layers,
  Tag,
  CheckCircle2
} from 'lucide-react';
import { Cultivation, PhotoCategory, PhotoRecord, CultivationStageName } from '../../types';
import { photoService } from '../../services/photoService';

interface PhotoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  cultivations: Cultivation[];
  defaultCultivationId?: string;
  onPhotoUploaded: (photo: PhotoRecord, triggerAI?: boolean) => void;
}

const STAGES: CultivationStageName[] = [
  'Germinación',
  'Plántula',
  'Vegetativo',
  'Prefloración',
  'Floración',
  'Maduración',
  'Secado',
  'Curado',
];

const CATEGORIES: { label: string; value: PhotoCategory }[] = [
  { label: '🌿 Planta completa', value: 'planta completa' },
  { label: '🌺 Flor / Cogollo', value: 'flor' },
  { label: '🍃 Hoja superior', value: 'hoja superior' },
  { label: '🍂 Hoja inferior', value: 'hoja inferior' },
  { label: '🪵 Tallo y ramas', value: 'tallo' },
  { label: '🪴 Sustrato y raíces', value: 'sustrato' },
  { label: '⚠️ Zona con problemas / Plaga', value: 'zona problemática' },
  { label: '🔍 Tricomas / Macro', value: 'tricomas' },
  { label: '📸 Otra', value: 'otra' },
];

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
  // Fecha local de la evidencia (YYYY-MM-DD)
  const [date, setDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [stage, setStage] = useState<CultivationStageName>('Vegetativo');
  const [analyzeWithAI, setAnalyzeWithAI] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validatingImage, setValidatingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateWarning, setDateWarning] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Referencias para manejo seguro de Object URLs y prevención de condiciones de carrera (FASE 4)
  const currentTokenRef = useRef(0);
  const activeObjectUrlRef = useRef<string | null>(null);

  // Limpieza de Object URLs para evitar fugas de memoria
  const cleanupObjectUrl = () => {
    if (activeObjectUrlRef.current) {
      URL.revokeObjectURL(activeObjectUrlRef.current);
      activeObjectUrlRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cleanupObjectUrl();
    };
  }, []);

  const selectedCrop = cultivations.find((c) => c.id === cultivationId);

  // Al cambiar de cultivo, predeterminar etapa y cultivo
  useEffect(() => {
    if (selectedCrop?.currentStage) {
      setStage(selectedCrop.currentStage);
    }
  }, [cultivationId, selectedCrop?.currentStage]);

  // Validar coherencia de fechas entre la evidencia y el inicio del cultivo (FASE 4)
  useEffect(() => {
    if (!selectedCrop?.startDate || !date) {
      setDateWarning(null);
      return;
    }
    const [ey, em, ed] = date.split('-').map(Number);
    const evidenceDate = new Date(ey, em - 1, ed);
    const cropStartRaw = new Date(selectedCrop.startDate);
    const cropStartDate = new Date(cropStartRaw.getFullYear(), cropStartRaw.getMonth(), cropStartRaw.getDate());

    if (isNaN(evidenceDate.getTime())) {
      setDateWarning('La fecha seleccionada no es válida.');
    } else if (evidenceDate.getTime() < cropStartDate.getTime()) {
      setDateWarning(
        `Nota: La fecha seleccionada (${date}) es anterior al inicio registrado de este cultivo (${selectedCrop.startDate.split('T')[0]}). Se registrará como Día 1 del historial.`
      );
    } else {
      const today = new Date();
      const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      if (evidenceDate.getTime() < todayMidnight.getTime()) {
        setDateWarning(
          `Evidencia histórica: Asegúrate de indicar la etapa que la planta tenía en esa fecha (${date}).`
        );
      } else {
        setDateWarning(null);
      }
    }
  }, [date, selectedCrop?.startDate]);

  useEffect(() => {
    const handleStatus = () => {
      setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    };
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    return () => {
      window.removeEventListener('online', handleStatus);
      window.removeEventListener('offline', handleStatus);
    };
  }, []);

  // Validación rigurosa de tipo, decodificación y dimensiones de la imagen (FASE 4)
  const handleFileChange = async (file: File) => {
    setError(null);
    const token = ++currentTokenRef.current;

    // 1. Validar extensiones y tipo MIME
    const fileName = file.name.toLowerCase();
    const isHeic = fileName.endsWith('.heic') || fileName.endsWith('.heif') || file.type === 'image/heic';
    if (isHeic) {
      setError(
        'El formato HEIC/HEIF de Apple no puede procesarse directamente en el navegador. Por favor conviértelo a JPEG, PNG o WebP antes de cargarlo.'
      );
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const hasValidMime = validTypes.includes(file.type);
    const hasValidExt = /\.(jpe?g|png|webp)$/i.test(fileName);

    if (!hasValidMime && !hasValidExt) {
      setError('Formato no soportado. Por favor selecciona una imagen en formato JPG, PNG o WebP.');
      return;
    }

    // 2. Límite de tamaño: 15 MB
    const maxBytes = 15 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(
        `La imagen es demasiado pesada (${(file.size / (1024 * 1024)).toFixed(1)} MB). El límite máximo es de 15 MB.`
      );
      return;
    }

    // 3. Validación de decodificación y dimensiones reales
    setValidatingImage(true);
    cleanupObjectUrl();

    const objUrl = URL.createObjectURL(file);
    activeObjectUrlRef.current = objUrl;

    const img = new Image();
    img.src = objUrl;

    img.onload = () => {
      if (currentTokenRef.current !== token) return; // Evitar carrera con selección posterior
      setValidatingImage(false);

      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        setError('El archivo parece estar corrupto o no contiene píxeles legibles.');
        cleanupObjectUrl();
        setSelectedFile(null);
        setPreviewUrl(null);
        return;
      }

      setSelectedFile(file);
      setPreviewUrl(objUrl);
    };

    img.onerror = () => {
      if (currentTokenRef.current !== token) return;
      setValidatingImage(false);
      setError('No se pudo decodificar el archivo como imagen. Verifica que el archivo no esté dañado.');
      cleanupObjectUrl();
      setSelectedFile(null);
      setPreviewUrl(null);
    };
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Cálculo preciso de dayOfCultivation usando la fecha de la evidencia, no hoy (FASE 4)
  const calculateEvidenceDay = (): number => {
    if (!selectedCrop?.startDate || !date) return 1;
    try {
      const [ey, em, ed] = date.split('-').map(Number);
      if (!ey || !em || !ed) return 1;
      const evidenceLocal = new Date(ey, em - 1, ed);

      const start = new Date(selectedCrop.startDate);
      if (isNaN(start.getTime())) return 1;

      const startLocal = new Date(start.getFullYear(), start.getMonth(), start.getDate());

      const diffDays = Math.floor((evidenceLocal.getTime() - startLocal.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return Math.max(1, diffDays);
    } catch {
      return 1;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cultivationId) {
      setError('Por favor selecciona un cultivo.');
      return;
    }
    if (!selectedFile) {
      setError('Por favor selecciona una fotografía.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const dayOfCultivation = calculateEvidenceDay();

      // Guardar de forma resiliente separando Storage, Firestore, IndexedDB y UI.
      // NO se envía el Object URL efímero del modal para no persistir URLs blob: que se revocarán al cerrar.
      const result = await photoService.savePhotoWithOfflineFallback({
        userId,
        cultivationId,
        file: selectedFile,
        date,
        dayOfCultivation,
        stage,
        category,
        caption: caption.trim() || undefined,
        isDemo: selectedCrop?.isDemo,
      });

      onPhotoUploaded(result.photo, analyzeWithAI);
      onClose();
    } catch (err: unknown) {
      console.error('Error al guardar fotografía:', err);
      const message = err instanceof Error ? err.message : 'No se pudo guardar la fotografía.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const computedDay = calculateEvidenceDay();

  return (
    <div className="cultiveta-modal-overlay animate-in fade-in">
      <div
        id="photo-upload-modal-box"
        className="cultiveta-modal-container max-w-lg p-6 sm:p-8 my-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#EFE3CF] mb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-[#6C45C7]/15 text-[#6C45C7]">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#29202F]">Subir foto de seguimiento 📸</h2>
              <p className="text-xs text-[#6E5D77]">Sacá una foto para ver la evolución de tus cogollos y hojas</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#9887A2] hover:text-[#29202F] rounded-full hover:bg-[#FAF2E1] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3.5 rounded-2xl bg-[#EB7864]/10 border border-[#EB7864]/30 text-[#EB7864] text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-[#EB7864]" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
          {/* Cultivo y Fecha de Evidencia */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#29202F] mb-1">Cultivo *</label>
              <select
                id="photo-crop-select"
                value={cultivationId}
                onChange={(e) => setCultivationId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-[#29202F] text-xs focus:outline-hidden focus:border-[#6C45C7] cursor-pointer font-medium"
              >
                {cultivations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.currentStage})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#29202F] mb-1">
                Fecha de la foto * <span className="text-[11px] text-[#62B95B] font-bold">(Día {computedDay})</span>
              </label>
              <div className="relative">
                <input
                  id="photo-date-input"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#6C45C7] font-medium"
                />
              </div>
            </div>
          </div>

          {dateWarning && (
            <div className="p-3 rounded-2xl bg-[#F3C843]/20 border border-[#F3C843]/40 text-[#29202F] text-[11px] font-medium flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-[#29202F] shrink-0 mt-0.5" />
              <span>{dateWarning}</span>
            </div>
          )}

          {/* Etapa fenológica específica para esta fotografía */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#29202F] mb-1">
                Etapa en esta fecha *
              </label>
              <select
                id="photo-stage-select"
                value={stage}
                onChange={(e) => setStage(e.target.value as CultivationStageName)}
                className="w-full px-3.5 py-2 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-[#29202F] text-xs focus:outline-hidden focus:border-[#6C45C7] cursor-pointer font-medium"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#29202F] mb-1">Categoría</label>
              <select
                id="photo-category-select"
                value={category}
                onChange={(e) => setCategory(e.target.value as PhotoCategory)}
                className="w-full px-3.5 py-2 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-[#29202F] text-xs focus:outline-hidden focus:border-[#6C45C7] cursor-pointer font-medium"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dropzone de fotografía con previsualización segura */}
          <div>
            <label className="block text-xs font-bold text-[#29202F] mb-1">Archivo de imagen *</label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-[#DECDB3] hover:border-[#6C45C7] rounded-3xl p-5 text-center transition-all relative overflow-hidden bg-[#FFFDF7] cursor-pointer group"
            >
              {validatingImage ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2">
                  <div className="w-8 h-8 rounded-full border-2 border-[#6C45C7] border-t-transparent animate-spin" />
                  <p className="text-xs text-[#6E5D77]">Verificando resolución y formato...</p>
                </div>
              ) : previewUrl ? (
                <div className="flex flex-col items-center gap-2">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-52 rounded-2xl object-contain border border-[#EFE3CF] shadow-xs"
                  />
                  <div className="flex items-center gap-2 text-xs font-bold text-[#62B95B]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{selectedFile?.name} ({(selectedFile ? selectedFile.size / 1024 : 0).toFixed(0)} KB)</span>
                  </div>
                  <span className="text-[11px] text-[#6E5D77] group-hover:text-[#6C45C7] transition-colors">
                    Hacé clic o arrastrá para cambiar la foto
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#6C45C7]/10 text-[#6C45C7] flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-[#29202F]">Arrastrá una foto acá o hacé clic para explorar</p>
                  <p className="text-[11px] text-[#9887A2]">Formatos soportados: JPG, PNG, WEBP (hasta 15 MB)</p>
                </div>
              )}
              <input
                id="photo-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>
          </div>

          {/* Pie de foto / notas */}
          <div>
            <label className="block text-xs font-bold text-[#29202F] mb-1">Notas o descripción</label>
            <input
              id="photo-caption-input"
              type="text"
              placeholder="ej. Desarrollo foliar homogéneo, pistilos blancos en ramas bajas..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#6C45C7] font-medium"
            />
          </div>

          {/* Checkbox para análisis opcional e independiente con IA */}
          <div className="p-3.5 rounded-2xl bg-[#6C45C7]/10 border border-[#6C45C7]/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-[#6C45C7] shrink-0" />
              <div>
                <div className="text-xs font-bold text-[#29202F]">Diagnóstico con Cultiveta IA</div>
                <div className="text-[11px] text-[#6E5D77]">
                  Evaluá la salud de la planta y detectá carencias o plagas automáticamente.
                </div>
              </div>
            </div>
            <input
              id="analyze-with-ai-checkbox"
              type="checkbox"
              checked={analyzeWithAI}
              onChange={(e) => setAnalyzeWithAI(e.target.checked)}
              className="w-4 h-4 text-[#6C45C7] rounded-md focus:ring-[#6C45C7] cursor-pointer accent-[#6C45C7]"
            />
          </div>

          {/* Indicador de red */}
          {!isOnline && (
            <div className="p-3 rounded-2xl bg-[#F3C843]/20 border border-[#F3C843]/40 text-[#29202F] text-xs flex items-start gap-2.5">
              <WifiOff className="w-4 h-4 text-[#29202F] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Sin conexión a internet: </span>
                <span>
                  La foto quedará guardada de forma segura en este dispositivo y se subirá automáticamente al volver la red.
                </span>
              </div>
            </div>
          )}

          {/* Botones de acción */}
          <div className="pt-3 border-t border-[#EFE3CF] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="cultiveta-btn-secondary text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="save-photo-btn"
              disabled={loading || validatingImage || !selectedFile}
              className="cultiveta-btn-primary text-xs disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Guardando...' : 'Guardar foto'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
