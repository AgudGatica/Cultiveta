import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Save,
  RotateCcw,
  Activity,
  Bot
} from 'lucide-react';
import { PhotoRecord, Cultivation, AIPhotoAnalysisResult } from '../../types';
import { aiService } from '../../services/aiService';
import { diaryService } from '../../services/diaryService';

interface PhotoDiagnosisModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  cultivation: Cultivation;
  photo: PhotoRecord;
  onAnalysisSaved?: (result: AIPhotoAnalysisResult) => void;
}

export const PhotoDiagnosisModal: React.FC<PhotoDiagnosisModalProps> = ({
  isOpen,
  onClose,
  userId,
  cultivation,
  photo,
  onAnalysisSaved,
}) => {
  const [analyzing, setAnalyzing] = useState(true);
  const [analysisResult, setAnalysisResult] = useState<AIPhotoAnalysisResult | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && photo) {
      runDiagnosis();
    }
  }, [isOpen, photo]);

  const runDiagnosis = async () => {
    try {
      setAnalyzing(true);
      setError(null);
      setNoteSaved(false);

      // Enviar identificadores estables y contexto verificado (FASE 5)
      const result = await aiService.analyzePlantPhoto({
        photoId: photo.id,
        cultivationId: cultivation.id,
        storagePath: photo.storagePath,
        photoUrl: photo.url,
        cultivationContext: {
          id: cultivation.id,
          name: cultivation.name,
          currentStage: photo.stage || cultivation.currentStage,
          dayOfCultivation: photo.dayOfCultivation,
          geneticsName: cultivation.geneticsName,
          substrate: cultivation.substrate?.type,
          lighting: cultivation.lighting?.type,
        },
      });

      setAnalysisResult(result);
      if (onAnalysisSaved) {
        onAnalysisSaved(result);
      }
    } catch (err: unknown) {
      console.error('Error al analizar foto con Cultiveta IA:', err);
      // FASE 5: No inventar diagnósticos de planta sana; mostrar error real
      const message = err instanceof Error ? err.message : 'No se pudo analizar la fotografía. Por favor verifica tu conexión e intenta nuevamente.';
      setError(message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveToDiary = async () => {
    if (!analysisResult) return;
    try {
      setSavingNote(true);
      const noteContent = `Diagnóstico IA: ${analysisResult.diagnosis} (Severidad: ${analysisResult.severity})\n\nHallazgos visuales: ${analysisResult.visualFindings}\n\nPlan de acción:\n${analysisResult.actionPlan.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

      await diaryService.addDiaryEntry({
        userId,
        cultivationId: cultivation.id,
        date: photo.date || new Date().toISOString().split('T')[0],
        title: `Diagnóstico IA: ${analysisResult.diagnosis}`,
        content: noteContent,
        tags: ['Diagnóstico IA', analysisResult.severity],
        photoUrls: photo.url ? [photo.url] : [],
        isDemo: cultivation.isDemo,
      });

      setNoteSaved(true);
    } catch (err: unknown) {
      console.error('Error guardando en diario:', err);
      setError('Error al guardar el diagnóstico en el diario.');
    } finally {
      setSavingNote(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cultiveta-modal-overlay animate-in fade-in">
      <div
        id="photo-diagnosis-modal"
        className="cultiveta-modal-container max-w-3xl p-6 sm:p-8 my-auto text-ink"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-line mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-brand/15 text-brand">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-ink">Diagnóstico Botánico con Cultiveta IA</h2>
              <p className="text-xs text-ink-muted">
                {cultivation.name} · Evidencia de {photo.category} (Día {photo.dayOfCultivation})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-ink-subtle hover:text-ink rounded-full hover:bg-track transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        {analyzing ? (
          <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-brand/15 border border-brand/30 text-brand flex items-center justify-center animate-pulse">
              <Sparkles className="w-8 h-8 animate-spin" />
            </div>
            <div>
              <h3 className="font-extrabold text-ink text-base">Analizando fotografía con IA botánica...</h3>
              <p className="text-xs text-ink-muted max-w-xs mx-auto mt-1">
                Inspeccionando coloración foliar, nervaduras, tallos y signos botánicos.
              </p>
            </div>
          </div>
        ) : error ? (
          /* Estado "No se pudo analizar" claro, con la foto conservada intacta */
          <div className="p-6 rounded-3xl bg-coral/10 border border-coral/30 text-center space-y-3.5 my-4">
            <div className="w-12 h-12 rounded-2xl bg-coral/20 text-coral flex items-center justify-center mx-auto border border-coral/30">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-ink text-sm">No se pudo analizar</h4>
              <p className="text-xs text-coral max-w-md mx-auto mt-1 font-semibold">{error}</p>
              <p className="text-[11px] text-ink-muted mt-2">
                Tu fotografía original está respaldada y se conserva en el historial. Podés reintentar el análisis en cualquier momento.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="cultiveta-btn-secondary text-xs"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={runDiagnosis}
                className="px-4 py-2.5 rounded-2xl bg-coral hover:bg-[#d66450] text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reintentar análisis</span>
              </button>
            </div>
          </div>
        ) : analysisResult ? (
          <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
            {/* Top Grid: Photo preview & Diagnosis Badge */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1 rounded-2xl overflow-hidden aspect-square bg-track border border-line">
                <img
                  src={photo.url}
                  alt="Evidencia fotográfica analizada"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="sm:col-span-2 p-5 rounded-2xl bg-surface border border-line flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-ink-subtle tracking-wider">
                      Diagnóstico Botánico
                    </span>
                    <span
                      className={`px-3 py-0.5 rounded-full text-xs font-extrabold ${
                        analysisResult.severity === 'Alta'
                          ? 'bg-coral/20 text-coral border border-coral/30'
                          : analysisResult.severity === 'Media'
                          ? 'bg-warn-line/30 text-ink border border-warn-line/50'
                          : 'bg-ok/20 text-ok border border-ok/30'
                      }`}
                    >
                      Severidad: {analysisResult.severity}
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-ink leading-snug">
                    {analysisResult.diagnosis}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-ink-muted">
                    <span>
                      Órgano: <strong className="text-ink">{analysisResult.affectedOrgan}</strong>
                    </span>
                    <span>·</span>
                    <span>
                      Confianza: <strong className="text-ink">{analysisResult.confidence}</strong>
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-line text-xs">
                  <span className="font-bold text-ink block mb-0.5">Hallazgos visuales:</span>
                  <p className="leading-relaxed text-ink-muted">{analysisResult.visualFindings}</p>
                </div>
              </div>
            </div>

            {/* Action Plan */}
            <div className="p-5 rounded-3xl bg-brand/10 border border-brand/25 space-y-3">
              <h4 className="font-bold text-xs uppercase tracking-wider text-brand flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-brand" />
                Plan de Acción Agronómico Recomendado
              </h4>

              <div className="space-y-2">
                {analysisResult.actionPlan.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 text-xs text-ink bg-white p-3 rounded-2xl border border-line shadow-2xs"
                  >
                    <span className="w-5 h-5 rounded-full bg-brand/20 text-brand font-bold flex items-center justify-center shrink-0 text-[11px]">
                      {idx + 1}
                    </span>
                    <p className="leading-relaxed pt-0.5">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-line flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleSaveToDiary}
                disabled={savingNote || noteSaved}
                className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                  noteSaved
                    ? 'bg-ok/20 text-ok border border-ok/30'
                    : 'bg-brand hover:bg-brand-deep text-white'
                }`}
              >
                {noteSaved ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-ok" />
                    <span>Guardado en el Diario de Cultivo</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{savingNote ? 'Guardando...' : 'Guardar en notas de diario'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="cultiveta-btn-secondary text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
