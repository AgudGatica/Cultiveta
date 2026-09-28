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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div
        id="photo-diagnosis-modal"
        className="w-full max-w-3xl bg-[#0F0F0F] rounded-3xl p-6 sm:p-8 shadow-2xl border border-zinc-800 text-zinc-100 my-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-violet-950/40 text-violet-400 border border-violet-500/30">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-zinc-100">Diagnóstico Botánico con Cultiveta IA</h2>
              <p className="text-xs text-zinc-400">
                {cultivation.name} · Evidencia de {photo.category} (Día {photo.dayOfCultivation})
              </p>
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

        {/* Content Body */}
        {analyzing ? (
          <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-violet-950/30 border border-violet-500/20 text-violet-400 flex items-center justify-center animate-pulse">
              <Sparkles className="w-8 h-8 animate-spin" />
            </div>
            <div>
              <h3 className="font-bold text-zinc-100 text-base">Analizando fotografía con Gemini...</h3>
              <p className="text-xs text-zinc-400 max-w-xs mx-auto mt-1">
                Inspeccionando coloración foliar, nervaduras, tallos y signos botánicos reales.
              </p>
            </div>
          </div>
        ) : error ? (
          /* FASE 5: Estado "No se pudo analizar" claro, con la foto conservada intacta */
          <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-center space-y-3.5 my-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/30">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-rose-200 text-sm">No se pudo analizar</h4>
              <p className="text-xs text-rose-300/90 max-w-md mx-auto mt-1">{error}</p>
              <p className="text-[11px] text-zinc-500 mt-2">
                Tu fotografía original está respaldada y se conserva en el historial. Puedes reintentar el análisis en cualquier momento.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold border border-zinc-700 transition-colors cursor-pointer"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={runDiagnosis}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reintentar Análisis</span>
              </button>
            </div>
          </div>
        ) : analysisResult ? (
          <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
            {/* Top Grid: Photo preview & Diagnosis Badge */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1 rounded-2xl overflow-hidden aspect-square bg-zinc-900 border border-zinc-800">
                <img
                  src={photo.url}
                  alt="Evidencia fotográfica analizada"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="sm:col-span-2 p-5 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                      Diagnóstico Botánico
                    </span>
                    <span
                      className={`px-3 py-0.5 rounded-full text-xs font-extrabold ${
                        analysisResult.severity === 'Alta'
                          ? 'bg-rose-950 text-rose-300 border border-rose-500/30'
                          : analysisResult.severity === 'Media'
                          ? 'bg-amber-950 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      Severidad: {analysisResult.severity}
                    </span>
                  </div>
                  <h3 className="text-lg font-extrabold text-zinc-100 leading-snug">
                    {analysisResult.diagnosis}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-zinc-400">
                    <span>
                      Órgano: <strong className="text-zinc-200">{analysisResult.affectedOrgan}</strong>
                    </span>
                    <span>·</span>
                    <span>
                      Confianza: <strong className="text-zinc-200">{analysisResult.confidence}</strong>
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-800 text-xs text-zinc-300">
                  <span className="font-bold text-zinc-100 block mb-0.5">Hallazgos visuales:</span>
                  <p className="leading-relaxed text-zinc-400">{analysisResult.visualFindings}</p>
                </div>
              </div>
            </div>

            {/* Action Plan */}
            <div className="p-5 rounded-3xl bg-violet-950/20 border border-violet-500/30 space-y-3">
              <h4 className="font-bold text-xs uppercase tracking-wider text-violet-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-violet-400" />
                Plan de Acción Agronómico Recomendado
              </h4>

              <div className="space-y-2">
                {analysisResult.actionPlan.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 text-xs text-zinc-200 bg-zinc-900/90 p-3 rounded-2xl border border-zinc-800"
                  >
                    <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 font-bold flex items-center justify-center shrink-0 text-[11px]">
                      {idx + 1}
                    </span>
                    <p className="leading-relaxed pt-0.5">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleSaveToDiary}
                disabled={savingNote || noteSaved}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  noteSaved
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100'
                }`}
              >
                {noteSaved ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Guardado en el Diario de Cultivo</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{savingNote ? 'Guardando...' : 'Guardar en Notas de Diario'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 transition-colors cursor-pointer"
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
