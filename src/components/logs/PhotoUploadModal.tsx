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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div
        id="photo-upload-modal-box"
        className="w-full max-w-lg bg-[#0F0F0F] rounded-3xl p-6 sm:p-8 shadow-2xl border border-zinc-800 text-zinc-100 my-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-100">Guardar Evidencia Fotográfica 📸</h2>
              <p className="text-xs text-zinc-400">Registra fotos con fecha comprobable para tu cultivo</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-200 rounded-full hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
          {/* Cultivo y Fecha de Evidencia */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">Cultivo *</label>
              <select
                id="photo-crop-select"
                value={cultivationId}
                onChange={(e) => setCultivationId(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700/80 text-zinc-200 text-xs focus:outline-hidden focus:border-emerald-500 cursor-pointer"
              >
                {cultivations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.currentStage})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Fecha de la foto * <span className="text-[11px] text-emerald-400 font-semibold">(Día {computedDay})</span>
              </label>
              <div className="relative">
                <input
                  id="photo-date-input"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700/80 text-xs text-zinc-200 focus:outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {dateWarning && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>{dateWarning}</span>
            </div>
          )}

          {/* Etapa fenológica específica para esta fotografía histórica o actual */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Etapa en esta fecha *
              </label>
              <select
                id="photo-stage-select"
                value={stage}
                onChange={(e) => setStage(e.target.value as CultivationStageName)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700/80 text-zinc-200 text-xs focus:outline-hidden focus:border-emerald-500 cursor-pointer"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">Categoría</label>
              <select
                id="photo-category-select"
                value={category}
                onChange={(e) => setCategory(e.target.value as PhotoCategory)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700/80 text-zinc-200 text-xs focus:outline-hidden focus:border-emerald-500 cursor-pointer"
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
            <label className="block text-xs font-bold text-zinc-300 mb-1">Archivo de Imagen *</label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-zinc-700 hover:border-emerald-500 rounded-2xl p-5 text-center transition-all relative overflow-hidden bg-zinc-900/60 cursor-pointer group"
            >
              {validatingImage ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2">
                  <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                  <p className="text-xs text-zinc-400">Verificando resolución y formato...</p>
                </div>
              ) : previewUrl ? (
                <div className="flex flex-col items-center gap-2">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-52 rounded-xl object-contain border border-zinc-700 shadow-md"
                  />
                  <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{selectedFile?.name} ({(selectedFile ? selectedFile.size / 1024 : 0).toFixed(0)} KB)</span>
                  </div>
                  <span className="text-[11px] text-zinc-400 group-hover:text-emerald-400 transition-colors">
                    Hacer clic o arrastrar para cambiar foto
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-zinc-200">Arrastra una fotografía aquí o haz clic para explorar</p>
                  <p className="text-[11px] text-zinc-500">Formatos soportados: JPG, PNG, WEBP (hasta 15 MB)</p>
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
            <label className="block text-xs font-bold text-zinc-300 mb-1">Notas o descripción</label>
            <input
              id="photo-caption-input"
              type="text"
              placeholder="ej. Desarrollo foliar homogéneo, pistilos blancos en ramas bajas..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-700/80 text-xs text-zinc-200 focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          {/* Checkbox para análisis opcional e independiente con IA */}
          <div className="p-3.5 rounded-2xl bg-violet-950/20 border border-violet-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-violet-400 shrink-0" />
              <div>
                <div className="text-xs font-bold text-violet-200">Analizar con Cultiveta IA</div>
                <div className="text-[11px] text-violet-400/80">
                  La foto se conservará segura aunque el análisis con IA falle o se posponga.
                </div>
              </div>
            </div>
            <input
              id="analyze-with-ai-checkbox"
              type="checkbox"
              checked={analyzeWithAI}
              onChange={(e) => setAnalyzeWithAI(e.target.checked)}
              className="w-4 h-4 text-emerald-500 rounded-md focus:ring-emerald-500 cursor-pointer accent-emerald-500"
            />
          </div>

          {/* Indicador de red */}
          {!isOnline && (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
              <WifiOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Sin conexión a internet: </span>
                <span>
                  La foto quedará guardada de forma segura en este dispositivo (IndexedDB) y se subirá automáticamente a Firebase Storage al restablecer la red.
                </span>
              </div>
            </div>
          )}

          {/* Botones de acción */}
          <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="save-photo-btn"
              disabled={loading || validatingImage || !selectedFile}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-black shadow-lg shadow-emerald-950/30 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Guardando...' : 'Guardar Evidencia'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
