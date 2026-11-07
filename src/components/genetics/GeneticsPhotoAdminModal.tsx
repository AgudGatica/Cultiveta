import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  X,
  Search,
  Upload,
  Camera,
  Image as ImageIcon,
  Trash2,
  RefreshCw,
  Check,
  AlertCircle,
  ShieldCheck,
  ArrowLeft,
  Sparkles,
  Filter,
  Lock,
  Globe,
} from 'lucide-react';
import { GENETICS_DATABASE, PredefinedGenetic } from '../../data/predefinedGenetics';
import {
  geneticsCatalogPhotoService,
  validateGeneticsImageFile,
  fileToDataUrl,
  getGeneticsPhotoKey,
  StorageStatusResult,
} from '../../services/geneticsCatalogPhotoService';
import { GeneticsCatalogPhoto } from '../../types';
import { dec } from '../../utils/formatNumber';

interface GeneticsPhotoAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoSaved?: (geneticName: string) => void;
}

export const GeneticsPhotoAdminModal: React.FC<GeneticsPhotoAdminModalProps> = ({
  isOpen,
  onClose,
  onPhotoSaved,
}) => {
  const [catalogPhotos, setCatalogPhotos] = useState<Record<string, GeneticsCatalogPhoto>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeedBank, setSelectedSeedBank] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'all' | 'with_photo' | 'without_photo'>('all');

  // Estado del servicio de almacenamiento
  const [storageStatus, setStorageStatus] = useState<StorageStatusResult | null>(null);
  const [isCheckingStorage, setIsCheckingStorage] = useState(false);

  // Estado para la subida manual de una genética seleccionada
  const [selectedGeneticForUpload, setSelectedGeneticForUpload] = useState<PredefinedGenetic | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDimensions, setPreviewDimensions] = useState<{ width: number; height: number } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingKey, setIsDeletingKey] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Metadata de la fuente y trazabilidad
  const [photoSourceName, setPhotoSourceName] = useState('');
  const [photoSourceUrl, setPhotoSourceUrl] = useState('');
  const [photoAttribution, setPhotoAttribution] = useState('');
  const [photoLicense, setPhotoLicense] = useState('');
  const [photoRightsStatus, setPhotoRightsStatus] = useState<
    'official-source' | 'permission-granted' | 'licensed' | 'owned' | 'unknown'
  >('official-source');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Verificar estado de almacenamiento y suscribirse a las fotos oficiales
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function checkStorage() {
      setIsCheckingStorage(true);
      try {
        const res = await geneticsCatalogPhotoService.checkStorageStatus();
        if (isMounted) {
          setStorageStatus(res);
        }
      } catch {
        if (isMounted) {
          setStorageStatus({
            available: false,
            message: 'El almacenamiento de imágenes todavía no está habilitado.',
          });
        }
      } finally {
        if (isMounted) setIsCheckingStorage(false);
      }
    }
    checkStorage();

    const unsub = geneticsCatalogPhotoService.subscribeCatalogPhotos((photos) => {
      setCatalogPhotos(photos);
    });
    return () => {
      isMounted = false;
      unsub();
    };
  }, [isOpen]);

  // Lista única de bancos de semillas para filtrar
  const seedBanks = useMemo(() => {
    const set = new Set<string>();
    GENETICS_DATABASE.forEach((g) => set.add(g.seedBank));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, []);

  // Filtrado reactivo por nombre, banco y estado
  const filteredGenetics = useMemo(() => {
    return GENETICS_DATABASE.filter((item) => {
      if (selectedSeedBank !== 'ALL' && item.seedBank !== selectedSeedBank) {
        return false;
      }

      const key = getGeneticsPhotoKey(item.seedBank, item.name);
      const hasPhoto = Boolean(catalogPhotos[key]?.photoUrl);

      if (statusFilter === 'with_photo' && !hasPhoto) return false;
      if (statusFilter === 'without_photo' && hasPhoto) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesBank = item.seedBank.toLowerCase().includes(q);
        if (!matchesName && !matchesBank) return false;
      }

      return true;
    });
  }, [searchTerm, selectedSeedBank, statusFilter, catalogPhotos]);

  // Iniciar subida preparando metadata
  const handleStartUpload = (genetic: PredefinedGenetic) => {
    setSelectedGeneticForUpload(genetic);
    setSelectedFile(null);
    setPreviewUrl(null);
    setPreviewDimensions(null);
    setValidationError(null);

    const key = getGeneticsPhotoKey(genetic.seedBank, genetic.name);
    const existing = catalogPhotos[key];
    if (existing) {
      setPhotoSourceName(existing.photoSourceName || genetic.seedBank);
      setPhotoSourceUrl(existing.photoSourceUrl || '');
      setPhotoAttribution(existing.photoAttribution || `Fotografía oficial cortesía de ${genetic.seedBank}`);
      setPhotoLicense(existing.photoLicense || 'Uso editorial / Prensa oficial');
      setPhotoRightsStatus(existing.photoRightsStatus || 'unknown');
    } else {
      setPhotoSourceName(genetic.seedBank);
      setPhotoSourceUrl('');
      setPhotoAttribution('');
      setPhotoLicense('');
      setPhotoRightsStatus('unknown');
    }
  };

  // Manejador al seleccionar un archivo de imagen en el subpanel
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setValidationError(null);
    setFeedbackMessage(null);

    // Validación minuciosa de tipo, tamaño y dimensiones
    const validation = await validateGeneticsImageFile(file);
    if (!validation.valid) {
      setValidationError(validation.error || 'Archivo inválido.');
      setSelectedFile(null);
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setPreviewDimensions(null);
      return;
    }

    // Generar vista previa con Object URL seguro
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(objectUrl);
    setPreviewDimensions(validation.dimensions || null);
  };

  // Guardar manualmente la foto representativa
  const handleSavePhoto = async () => {
    if (!selectedGeneticForUpload || !selectedFile) {
      setValidationError('Por favor selecciona una imagen antes de guardar.');
      return;
    }

    if (storageStatus && !storageStatus.available) {
      setValidationError(
        storageStatus.message || 'El almacenamiento de imágenes todavía no está habilitado.'
      );
      return;
    }

    setIsSaving(true);
    setValidationError(null);

    try {
      await geneticsCatalogPhotoService.uploadPhoto({
        seedBank: selectedGeneticForUpload.seedBank,
        name: selectedGeneticForUpload.name,
        file: selectedFile,
        photoSourceName,
        photoSourceUrl,
        photoAttribution,
        photoLicense,
        photoRightsStatus,
      });

      setFeedbackMessage({
        type: 'success',
        text: `Fotografía oficial de "${selectedGeneticForUpload.name}" guardada.`,
      });

      if (onPhotoSaved) {
        onPhotoSaved(selectedGeneticForUpload.name);
      }

      // Cerrar subpanel y resetear estados
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
      setSelectedGeneticForUpload(null);
      setSelectedFile(null);
      setPreviewUrl(null);
      setPreviewDimensions(null);
    } catch (err: any) {
      setValidationError(err?.message || 'Error al guardar la fotografía.');
    } finally {
      setIsSaving(false);
    }
  };

  // Cancelar la selección/subida actual
  const handleCancelUpload = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedGeneticForUpload(null);
    setSelectedFile(null);
    setPreviewUrl(null);
    setPreviewDimensions(null);
    setValidationError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Eliminar fotografía oficial
  const handleDeletePhoto = async (genetic: PredefinedGenetic) => {
    const key = getGeneticsPhotoKey(genetic.seedBank, genetic.name);
    const confirmed = window.confirm(
      `¿Eliminás la fotografía oficial de "${genetic.name}" (${genetic.seedBank})?\nLa genética volverá a mostrarse en estado "Sin foto".`
    );

    if (!confirmed) return;

    setIsDeletingKey(key);
    try {
      await geneticsCatalogPhotoService.deletePhoto(genetic.seedBank, genetic.name);
      setFeedbackMessage({
        type: 'success',
        text: `Fotografía de "${genetic.name}" eliminada correctamente.`,
      });
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err?.message || 'No se pudo eliminar la fotografía.',
      });
    } finally {
      setIsDeletingKey(null);
    }
  };

  if (!isOpen) return null;

  const isStorageBlocked = Boolean(storageStatus && !storageStatus.available);

  return (
    <div
      role="dialog"
      aria-modal="true"
      id="genetics-photo-admin-modal"
      className="cultiveta-modal-overlay animate-in fade-in"
    >
      <div className="cultiveta-modal-container my-auto max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header Modal */}
        <div className="p-5 sm:p-6 border-b border-line flex items-start justify-between gap-4 bg-surface">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-icon-bg text-brand">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-ink">
                    Administración de fotos de genéticas
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-icon-bg text-brand border border-chip-line">
                    Creador / Admin
                  </span>
                </div>
                <p className="text-xs text-ink-muted mt-0.5">
                  Cargá a mano la foto oficial de cada genética del catálogo
                </p>
              </div>
            </div>
          </div>

          <button aria-label="Cerrar"
            type="button"
            id="close-admin-photo-modal-btn"
            onClick={onClose}
            className="p-2 text-ink-subtle hover:text-ink rounded-xl hover:bg-line transition-colors cursor-pointer"
            title="Cerrar panel de administración"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Advertencia de Storage No Habilitado */}
        {isStorageBlocked && (
          <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-warn-bg border border-warn-line text-warn-ink text-xs font-semibold flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-warn-ink shrink-0" />
            <span>
              {storageStatus?.message || 'El almacenamiento de imágenes todavía no está habilitado.'}
            </span>
          </div>
        )}

        {/* Notificación Feedback temporal */}
        {feedbackMessage && (
          <div
            className={`mx-6 mt-4 p-3 rounded-2xl flex items-center justify-between gap-2 text-xs font-semibold ${
              feedbackMessage.type === 'success'
                ? 'bg-ok-bg text-ok-ink border border-ok-line'
                : 'bg-error/10 text-error border border-error/30'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedbackMessage.type === 'success' ? (
                <Check className="w-4 h-4 text-ok-ink" />
              ) : (
                <AlertCircle className="w-4 h-4 text-error" />
              )}
              <span>{feedbackMessage.text}</span>
            </div>
            <button aria-label="Cerrar"
              type="button"
              onClick={() => setFeedbackMessage(null)}
              className="p-1 hover:bg-black/5 rounded-lg text-ink-subtle hover:text-ink cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Contenido Principal */}
        {selectedGeneticForUpload ? (
          /* =========================================================================
             SUBPANEL: CARGA MANUAL Y PREVIEW DE LA GENÉTICA SELECCIONADA
             ========================================================================= */
          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            <div className="flex items-center justify-between pb-4 border-b border-line">
              <button
                type="button"
                onClick={handleCancelUpload}
                className="flex items-center gap-1.5 text-xs font-bold text-ink-muted hover:text-ink px-3 py-1.5 rounded-xl hover:bg-track transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver al listado</span>
              </button>

              <div className="text-right">
                <span className="text-xs font-semibold text-ok-ink bg-ok-bg px-2.5 py-1 rounded-full border border-ok-line">
                  {selectedGeneticForUpload.seedBank}
                </span>
              </div>
            </div>

            <div>
              <h4 className="text-base font-bold text-ink">
                Cargar foto de {selectedGeneticForUpload.name}
              </h4>
              <p className="text-xs text-ink-muted mt-1">
                Elegí una imagen representativa (JPG, JPEG, PNG o WEBP). Comprobá la previsualización y registra la fuente antes de guardar.
              </p>
            </div>

            {/* Error de validación */}
            {validationError && (
              <div className="p-3.5 rounded-2xl bg-error/10 border border-error/30 text-error text-xs font-medium flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                <span>{validationError}</span>
              </div>
            )}

            {/* Selector de Archivo e Información */}
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                id="genetics-admin-file-input"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />

              {!previewUrl ? (
                /* Zona Drop / Selección */
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-line hover:border-ok-line rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all bg-surface hover:bg-ok-bg group"
                >
                  <div className="w-16 h-16 rounded-2xl bg-white shadow-xs border border-line flex items-center justify-center mx-auto text-ink-subtle group-hover:text-ok-ink group-hover:scale-105 transition-all">
                    <Upload className="w-8 h-8" />
                  </div>
                  <h5 className="mt-4 font-bold text-ink text-sm">
                    Seleccionar imagen representativa
                  </h5>
                  <p className="text-xs text-ink-muted mt-1 max-w-sm mx-auto">
                    Formatos admitidos: JPG, JPEG, PNG, WEBP. Tamaño máximo: 10 MB.
                  </p>
                  <button
                    type="button"
                    className="mt-4 px-4 py-2 rounded-xl bg-brand-deep hover:bg-brand-deep text-white text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Examinar archivo</span>
                  </button>
                </div>
              ) : (
                /* Preview antes de guardar */
                <div className="space-y-4">
                  <div className="bg-surface p-4 rounded-3xl border border-line space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-ok-ink" />
                        <span>Previsualización antes de guardar</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs font-semibold text-ok-ink hover:underline cursor-pointer"
                      >
                        Cambiar imagen
                      </button>
                    </div>

                    <div className="relative w-full max-h-72 sm:max-h-80 rounded-2xl overflow-hidden bg-brand-deep flex items-center justify-center border border-line">
                      <img
                        src={previewUrl}
                        alt={`Preview de ${selectedGeneticForUpload.name}`}
                        className="max-h-72 sm:max-h-80 w-auto object-contain"
                      />
                    </div>

                    {/* Metadata del archivo */}
                    {selectedFile && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
                        <div className="bg-white p-2.5 rounded-xl border border-line">
                          <span className="text-ink-subtle block text-[11px]">Nombre de archivo</span>
                          <span className="font-semibold text-ink truncate block" title={selectedFile.name}>
                            {selectedFile.name}
                          </span>
                        </div>
                        <div className="bg-white p-2.5 rounded-xl border border-line">
                          <span className="text-ink-subtle block text-[11px]">Tamaño</span>
                          <span className="font-semibold text-ink">
                            {dec(selectedFile.size / (1024 * 1024))} MB
                          </span>
                        </div>
                        {previewDimensions && (
                          <div className="bg-white p-2.5 rounded-xl border border-line col-span-2 sm:col-span-1">
                            <span className="text-ink-subtle block text-[11px]">Dimensiones</span>
                            <span className="font-semibold text-ink">
                              {previewDimensions.width} × {previewDimensions.height} px
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Formulario de Metadatos de la Fuente y Derechos */}
            <div className="bg-surface p-5 rounded-3xl border border-line space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-brand" />
                <h5 className="font-bold text-xs text-ink">
                  Datos de la fuente y derechos de la fotografía
                </h5>
              </div>
              <p className="text-xs text-ink-muted">
                Información administrativa para mantener la trazabilidad del banco de semillas u origen.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Fuente / Breeder
                  </label>
                  <input
                    type="text"
                    value={photoSourceName}
                    onChange={(e) => setPhotoSourceName(e.target.value)}
                    placeholder="Ej: Sensi Seeds, Dutch Passion..."
                    className="w-full px-3 py-2 rounded-xl bg-white border border-line text-xs text-ink focus:outline-hidden focus:border-chip-line"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    URL de la fuente (página web oficial)
                  </label>
                  <input
                    type="url"
                    value={photoSourceUrl}
                    onChange={(e) => setPhotoSourceUrl(e.target.value)}
                    placeholder="https://sensiseeds.com/es/..."
                    className="w-full px-3 py-2 rounded-xl bg-white border border-line text-xs text-ink focus:outline-hidden focus:border-chip-line"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Atribución / Crédito
                  </label>
                  <input
                    type="text"
                    value={photoAttribution}
                    onChange={(e) => setPhotoAttribution(e.target.value)}
                    placeholder="Ej: Fotografía oficial cortesía de Sensi Seeds"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-line text-xs text-ink focus:outline-hidden focus:border-chip-line"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Estado de derechos
                  </label>
                  <select
                    value={photoRightsStatus}
                    onChange={(e: any) => setPhotoRightsStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-line text-xs text-ink focus:outline-hidden focus:border-chip-line"
                  >
                    <option value="official-source">Fuente oficial del breeder</option>
                    <option value="permission-granted">Permiso otorgado</option>
                    <option value="licensed">Con licencia</option>
                    <option value="owned">Propia de Cultiveta</option>
                    <option value="unknown">Sin especificar / Desconocida</option>
                  </select>
                  <p className="text-[11px] text-ink-muted mt-1 leading-tight">
                    Que una foto provenga de una web oficial no implica automáticamente permiso de reutilización. Registrá el estado real de derechos antes de publicarla.
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-ink mb-1">
                    Licencia / Términos de uso
                  </label>
                  <input
                    type="text"
                    value={photoLicense}
                    onChange={(e) => setPhotoLicense(e.target.value)}
                    placeholder="Ej: Uso oficial de catálogo / Permiso de prensa"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-line text-xs text-ink focus:outline-hidden focus:border-chip-line"
                  />
                </div>
              </div>
            </div>

            {/* Botones de Acción de Carga */}
            <div className="pt-4 border-t border-line flex items-center justify-end gap-3">
              <button
                type="button"
                id="cancel-photo-upload-btn"
                onClick={handleCancelUpload}
                disabled={isSaving}
                className="px-5 py-2.5 rounded-2xl bg-track hover:bg-line text-ink text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="save-photo-upload-btn"
                onClick={handleSavePhoto}
                disabled={!selectedFile || isSaving || isStorageBlocked}
                className="px-6 py-2.5 rounded-2xl bg-brand-deep hover:bg-brand-deep text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando fotografía...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Guardar foto</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* =========================================================================
             VISTA 1: LISTADO Y BUSCADOR DE GENÉTICAS CON ESTADO DE FOTO
             ========================================================================= */
          <>
            {/* Barra de Búsqueda y Filtros */}
            <div className="p-4 sm:p-5 border-b border-line bg-surface space-y-3">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                {/* Input Búsqueda por Nombre o Banco */}
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 text-ink-subtle absolute left-3.5 top-3" />
                  <input
                    type="text"
                    id="admin-search-genetics-input"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre de genética o banco (ej: Skunk, Amnesia Haze)..."
                    className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-white border border-line text-xs text-ink placeholder-ink-subtle focus:outline-hidden focus:border-chip-line focus:ring-1 focus:ring-brand transition-all"
                  />
                  {searchTerm && (
                    <button aria-label="Borrar búsqueda"
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3.5 top-3 text-ink-subtle hover:text-ink-muted"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Filtro por Banco de Semillas */}
                <div className="w-full sm:w-auto">
                  <select
                    id="admin-filter-seedbank-select"
                    value={selectedSeedBank}
                    onChange={(e) => setSelectedSeedBank(e.target.value)}
                    className="w-full sm:w-48 px-3 py-2.5 rounded-2xl bg-white border border-line text-xs text-ink font-semibold focus:outline-hidden focus:border-chip-line cursor-pointer"
                  >
                    <option value="ALL">Todos los bancos ({seedBanks.length})</option>
                    {seedBanks.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Filtro por Estado de Fotografía */}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <span className="text-ink-subtle text-xs font-semibold flex items-center gap-1">
                  <Filter className="w-3 h-3" />
                  <span>Estado:</span>
                </span>
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-brand-deep text-white shadow-xs'
                      : 'bg-white text-ink-muted hover:bg-track border border-line'
                  }`}
                >
                  Todas ({GENETICS_DATABASE.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('with_photo')}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    statusFilter === 'with_photo'
                      ? 'bg-brand-deep text-white shadow-xs'
                      : 'bg-white text-ink-muted hover:bg-track border border-line'
                  }`}
                >
                  Con foto (
                  {
                    GENETICS_DATABASE.filter(
                      (g) => catalogPhotos[getGeneticsPhotoKey(g.seedBank, g.name)]?.photoUrl
                    ).length
                  }
                  )
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('without_photo')}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    statusFilter === 'without_photo'
                      ? 'bg-brand-deep text-white shadow-xs'
                      : 'bg-white text-ink-muted hover:bg-track border border-line'
                  }`}
                >
                  Sin foto (
                  {
                    GENETICS_DATABASE.filter(
                      (g) => !catalogPhotos[getGeneticsPhotoKey(g.seedBank, g.name)]?.photoUrl
                    ).length
                  }
                  )
                </button>
              </div>
            </div>

            {/* Listado de Genéticas */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3">
              {filteredGenetics.length === 0 ? (
                <div className="text-center py-16 px-4">
                  <div className="w-14 h-14 rounded-2xl bg-track flex items-center justify-center mx-auto text-ink-subtle mb-3">
                    <Search className="w-7 h-7" />
                  </div>
                  <h4 className="font-bold text-ink text-sm">No se encontraron genéticas</h4>
                  <p className="text-xs text-ink-muted mt-1 max-w-sm mx-auto">
                    Prueba modificando los filtros de búsqueda o el banco de semillas seleccionado.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredGenetics.map((item) => {
                    const key = getGeneticsPhotoKey(item.seedBank, item.name);
                    const photoRecord = catalogPhotos[key];
                    const hasPhoto = Boolean(photoRecord?.photoUrl);
                    const isDeleting = isDeletingKey === key;

                    return (
                      <div
                        key={`${item.seedBank}-${item.name}`}
                        className="bg-white rounded-2xl p-4 border border-line shadow-2xs hover:shadow-xs transition-all flex items-start gap-4 justify-between"
                      >
                        {/* Miniatura de la fotografía actual */}
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-track border border-line shrink-0 relative flex items-center justify-center">
                          {hasPhoto ? (
                            <img
                              src={photoRecord!.photoUrl}
                              alt={`${item.name} - ${item.seedBank}`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center text-ink-subtle p-2 text-center">
                              <ImageIcon className="w-6 h-6 stroke-1" />
                              <span className="text-[11px] font-medium mt-1">Sin foto</span>
                            </div>
                          )}
                        </div>

                        {/* Datos de la genética */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <h4 className="font-bold text-sm text-ink truncate" title={item.name}>
                            {item.name}
                          </h4>
                          <p className="text-xs font-semibold text-ok-ink truncate" title={item.seedBank}>
                            {item.seedBank}
                          </p>

                          {/* Estado de Fotografía */}
                          <div className="pt-1">
                            {hasPhoto ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-ok-bg text-ok-ink border border-ok-line">
                                <Check className="w-3 h-3 text-ok-ink" />
                                <span>Foto cargada</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-track text-ink-muted border border-line">
                                <span>Sin foto</span>
                              </span>
                            )}
                          </div>

                          {/* Acciones */}
                          <div className="pt-2 flex flex-wrap items-center gap-2">
                            {!hasPhoto ? (
                              <button
                                type="button"
                                id={`load-photo-btn-${key}`}
                                onClick={() => handleStartUpload(item)}
                                className="px-3.5 py-1.5 rounded-xl bg-brand-deep hover:bg-brand-deep text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                              >
                                <Camera className="w-3.5 h-3.5" />
                                <span>Cargar foto</span>
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  id={`replace-photo-btn-${key}`}
                                  onClick={() => handleStartUpload(item)}
                                  className="px-3 py-1.5 rounded-xl bg-track hover:bg-line text-ink text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                                  title="Reemplazar por una nueva imagen"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  <span>Reemplazar</span>
                                </button>

                                <button
                                  type="button"
                                  id={`delete-photo-btn-${key}`}
                                  onClick={() => handleDeletePhoto(item)}
                                  disabled={isDeleting}
                                  className="px-2.5 py-1.5 rounded-xl bg-error/10 hover:bg-error/10 text-error border border-error/30 text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  title="Eliminar fotografía oficial"
                                >
                                  <Trash2 className="w-3 h-3 text-error" />
                                  <span>{isDeleting ? '...' : 'Eliminar'}</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer Informativo */}
            <div className="p-4 border-t border-line bg-surface flex items-center justify-between text-xs text-ink-muted">
              <span>
                Mostrando {filteredGenetics.length} de {GENETICS_DATABASE.length} genéticas del catálogo
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-line hover:bg-chip-line text-ink font-bold transition-all cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
