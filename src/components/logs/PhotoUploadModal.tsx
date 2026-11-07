import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Camera,
  Image as ImageIcon,
  Sparkles,
  Save,
  WifiOff,
  AlertTriangle,
  Info,
  CheckCircle2
} from 'lucide-react';
import { Cultivation, PhotoCategory, PhotoRecord, CultivationStageName } from '../../types';
import { photoService } from '../../services/photoService';
import { PhotoPrepError, preparePhoto } from '../../services/imagePrep';
import { parseLocalDate } from '../../utils/growthStageUtils';

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
  'Floración',
  'Cosecha',
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
    // el día local de inicio ("2026-09-01" con new Date queda el 31/8 en Argentina)
    const cropStartDate = parseLocalDate(selectedCrop.startDate) || new Date(NaN);

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
          `Evidencia histórica: Fijate de indicar la etapa que la planta tenía en esa fecha (${date}).`
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

  /**
   * La foto de la cámara o de la galería se prepara antes de mostrarla: se abre en cualquier formato del
   * celular (también HEIC), se achica si es enorme y pierde los datos internos. Si no se puede, el error
   * dice por qué (en vez de "puede estar dañado").
   */
  const handleFileChange = async (file: File) => {
    setError(null);
    const token = ++currentTokenRef.current;
    setValidatingImage(true);
    try {
      const prepared = await preparePhoto(file);
      if (currentTokenRef.current !== token) return; // eligió otra mientras tanto
      cleanupObjectUrl();
      const objUrl = URL.createObjectURL(prepared.file);
      activeObjectUrlRef.current = objUrl;
      setSelectedFile(prepared.file);
      setPreviewUrl(objUrl);
    } catch (err) {
      if (currentTokenRef.current !== token) return;
      console.warn('[Fotos] No se pudo preparar la foto:', { name: file.name, type: file.type, size: file.size, kind: (err as PhotoPrepError)?.kind, error: (err as Error)?.message });
      setError(err instanceof PhotoPrepError ? err.message : 'No se pudo abrir la foto. Probá con otra o sacala con el botón Cámara.');
      cleanupObjectUrl();
      setSelectedFile(null);
      setPreviewUrl(null);
    } finally {
      if (currentTokenRef.current === token) setValidatingImage(false);
    }
  };

  /** Al elegir (o sacar) una foto; se limpia el campo para poder volver a elegir la misma. */
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) handleFileChange(file);
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

      // medianoche local del día de inicio (new Date("YYYY-MM-DD") daba un día de más en Argentina)
      const startLocal = parseLocalDate(selectedCrop.startDate);
      if (!startLocal) return 1;

      const diffDays = Math.round((evidenceLocal.getTime() - startLocal.getTime()) / (1000 * 60 * 60 * 24)) + 1;
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
        <div className="flex items-center justify-between pb-4 border-b border-line mb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-brand/15 text-brand">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-ink">Subir foto de seguimiento</h2>
              <p className="text-xs text-ink-muted">Sacá una foto para ver la evolución de tus cogollos y hojas</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="min-h-11 min-w-11 flex items-center justify-center text-ink-muted hover:text-ink rounded-full hover:bg-track transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3.5 rounded-2xl bg-coral/10 border border-coral/30 text-error text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-error" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
          {/* Cultivo y Fecha de Evidencia */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-ink mb-1">Cultivo *</label>
              <select
                id="photo-crop-select"
                value={cultivationId}
                onChange={(e) => setCultivationId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-2xl bg-surface border border-line text-ink text-xs focus:outline-hidden focus:border-brand cursor-pointer font-medium"
              >
                {cultivations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.currentStage})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-1">
                Fecha de la foto * <span className="text-xs text-ok-ink font-bold">(Día {computedDay})</span>
              </label>
              <div className="relative">
                <input
                  id="photo-date-input"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-surface border border-line text-xs text-ink focus:outline-hidden focus:border-brand font-medium"
                />
              </div>
            </div>
          </div>

          {dateWarning && (
            <div className="p-3 rounded-2xl bg-warn-line/20 border border-warn-line/40 text-ink text-xs font-medium flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-ink shrink-0 mt-0.5" />
              <span>{dateWarning}</span>
            </div>
          )}

          {/* Etapa fenológica específica para esta fotografía */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-ink mb-1">
                Etapa en esta fecha *
              </label>
              <select
                id="photo-stage-select"
                value={stage}
                onChange={(e) => setStage(e.target.value as CultivationStageName)}
                className="w-full px-3.5 py-2 rounded-2xl bg-surface border border-line text-ink text-xs focus:outline-hidden focus:border-brand cursor-pointer font-medium"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-1">Categoría</label>
              <select
                id="photo-category-select"
                value={category}
                onChange={(e) => setCategory(e.target.value as PhotoCategory)}
                className="w-full px-3.5 py-2 rounded-2xl bg-surface border border-line text-ink text-xs focus:outline-hidden focus:border-brand cursor-pointer font-medium"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Foto: sacarla con la cámara o elegirla de la galería (en la compu, también arrastrarla) */}
          <div>
            <span className="block text-xs font-bold text-ink mb-1">Foto *</span>
            <div
              id="photo-drop-zone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-line rounded-3xl p-4 text-center bg-surface space-y-3"
            >
              {validatingImage ? (
                <div className="py-6 flex flex-col items-center justify-center gap-2">
                  <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
                  <p className="text-xs text-ink-muted">Preparando la foto…</p>
                </div>
              ) : previewUrl ? (
                <div className="flex flex-col items-center gap-2">
                  <img id="photo-preview" src={previewUrl} alt="Foto elegida" className="max-h-52 rounded-2xl object-contain border border-line shadow-xs" />
                  <div className="flex items-center gap-2 text-xs font-bold text-ok-ink">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Lista para guardar ({(selectedFile ? selectedFile.size / 1024 : 0).toFixed(0)} KB)</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-ink-muted py-1">Sacá una foto ahora o elegí una de la galería.</p>
              )}
              {/* un label por botón: abre la cámara o la galería sin depender de JavaScript (anda en todos los celulares) */}
              <div className="grid grid-cols-2 gap-2">
                <label htmlFor="photo-camera-input" id="photo-camera-btn" className="cultiveta-btn-primary text-xs justify-center cursor-pointer min-h-11">
                  <Camera className="w-4 h-4" aria-hidden="true" />
                  <span>{previewUrl ? 'Sacar otra' : 'Sacar foto'}</span>
                </label>
                <label htmlFor="photo-file-input" id="photo-gallery-btn" className="cultiveta-btn-secondary text-xs justify-center cursor-pointer min-h-11">
                  <ImageIcon className="w-4 h-4" aria-hidden="true" />
                  <span>{previewUrl ? 'Elegir otra' : 'Galería'}</span>
                </label>
              </div>
              <input id="photo-camera-input" type="file" accept="image/*" capture="environment" onChange={onPick} className="sr-only" tabIndex={-1} />
              <input id="photo-file-input" type="file" accept="image/*" onChange={onPick} className="sr-only" />
              <p className="text-xs text-ink-subtle">JPG, PNG, WebP o HEIC. Las fotos grandes se achican solas y se guardan sin la ubicación del celular.</p>
            </div>
          </div>

          {/* Pie de foto / notas */}
          <div>
            <label className="block text-xs font-bold text-ink mb-1">Notas o descripción</label>
            <input
              id="photo-caption-input"
              type="text"
              placeholder="ej. Desarrollo foliar homogéneo, pistilos blancos en ramas bajas..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-surface border border-line text-xs text-ink focus:outline-hidden focus:border-brand font-medium"
            />
          </div>

          {/* Checkbox para análisis opcional e independiente con IA */}
          <div className="p-3.5 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-brand shrink-0" />
              <div>
                <div className="text-xs font-bold text-ink">Diagnóstico con Cultiveta IA</div>
                <div className="text-xs text-ink-muted">
                  Evaluá la salud de la planta y detectá carencias o plagas automáticamente.
                </div>
              </div>
            </div>
            <input
              id="analyze-with-ai-checkbox"
              type="checkbox"
              checked={analyzeWithAI}
              onChange={(e) => setAnalyzeWithAI(e.target.checked)}
              className="w-4 h-4 text-brand rounded-md focus:ring-brand cursor-pointer accent-brand"
            />
          </div>

          {/* Indicador de red */}
          {!isOnline && (
            <div className="p-3 rounded-2xl bg-warn-line/20 border border-warn-line/40 text-ink text-xs flex items-start gap-2.5">
              <WifiOff className="w-4 h-4 text-ink shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Sin conexión a internet: </span>
                <span>
                  La foto quedará guardada de forma segura en este dispositivo y se subirá automáticamente al volver la red.
                </span>
              </div>
            </div>
          )}

          {/* Botones de acción */}
          <div className="pt-3 border-t border-line flex items-center justify-end gap-3">
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
