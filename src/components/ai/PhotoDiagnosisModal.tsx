import React, { useState, useEffect } from 'react';
import { X, Sparkles, AlertTriangle, CheckCircle2, Save, ArrowRight, ShieldAlert, Activity } from 'lucide-react';
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

      const result = await aiService.analyzePlantPhoto({
        photoUrl: photo.url,
        cultivationContext: {
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
    } catch (err: any) {
      console.error('Error running AI photo analysis', err);
      setError(err?.message || 'No se pudo completar el análisis fotográfico con IA.');
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
        date: new Date().toISOString().split('T')[0],
        title: `Diagnóstico IA: ${analysisResult.diagnosis}`,
        content: noteContent,
        tags: ['Diagnóstico IA', analysisResult.severity],
        isDemo: cultivation.isDemo,
      });

      setNoteSaved(true);
    } catch (err: any) {
      console.error('Error saving note', err);
      setError('Error al guardar en el diario.');
    } finally {
      setSavingNote(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/70 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div
        id="photo-diagnosis-modal"
        className="w-full max-w-3xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-stone-200 my-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-violet-100 text-violet-800">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">Diagnóstico Fotográfico con Cultiveta IA</h2>
              <p className="text-xs text-stone-500">
                {cultivation.name} · Foto de {photo.category} (Día {photo.dayOfCultivation})
              </p>
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

        {/* Content Body */}
        {analyzing ? (
          <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-violet-50 text-violet-600 flex items-center justify-center animate-pulse">
              <Sparkles className="w-8 h-8 animate-spin" />
            </div>
            <div>
              <h3 className="font-bold text-stone-900 text-base">Analizando fotografía con Gemini...</h3>
              <p className="text-xs text-stone-500 max-w-xs mx-auto mt-1">
                Inspeccionando coloración foliar, nervaduras, tallos, posibles patógenos y madurez botánica.
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-3">
            <p className="text-xs font-semibold text-rose-700">{error}</p>
            <button
              type="button"
              onClick={runDiagnosis}
              className="px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Reintentar Análisis
            </button>
          </div>
        ) : analysisResult ? (
          <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
            {/* Top Grid: Photo preview & Diagnosis Badge */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1 rounded-2xl overflow-hidden aspect-square bg-stone-100 border border-stone-200">
                <img
                  src={photo.url}
                  alt="Foto analizada"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="sm:col-span-2 p-5 rounded-2xl bg-stone-50 border border-stone-200/80 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-stone-500">Diagnóstico Principal</span>
                    <span
                      className={`px-3 py-0.5 rounded-full text-xs font-extrabold ${
                        analysisResult.severity === 'Alta'
                          ? 'bg-rose-100 text-rose-800'
                          : analysisResult.severity === 'Media'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      Severidad: {analysisResult.severity}
                    </span>
                  </div>
                  <h3 className="text-lg font-extrabold text-stone-900 leading-snug">
                    {analysisResult.diagnosis}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-stone-500">
                    <span>Órgano: <strong className="text-stone-700">{analysisResult.affectedOrgan}</strong></span>
                    <span>·</span>
                    <span>Confianza: <strong className="text-stone-700">{analysisResult.confidence}</strong></span>
                  </div>
                </div>

                <div className="pt-2 border-t border-stone-200/60 text-xs text-stone-700">
                  <span className="font-bold text-stone-900 block mb-0.5">Hallazgos visuales:</span>
                  <p className="leading-relaxed">{analysisResult.visualFindings}</p>
                </div>
              </div>
            </div>

            {/* Action Plan */}
            <div className="p-5 rounded-3xl bg-violet-50/70 border border-violet-200 space-y-3">
              <h4 className="font-bold text-xs uppercase tracking-wider text-violet-950 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-violet-600" />
                Plan de Acción Recomendado Paso a Paso
              </h4>

              <div className="space-y-2">
                {analysisResult.actionPlan.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 text-xs text-stone-800 bg-white/80 p-3 rounded-2xl border border-violet-100">
                    <span className="w-5 h-5 rounded-full bg-violet-200 text-violet-800 font-bold flex items-center justify-center shrink-0 text-[11px]">
                      {idx + 1}
                    </span>
                    <p className="leading-relaxed pt-0.5">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleSaveToDiary}
                disabled={savingNote || noteSaved}
                className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  noteSaved
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-stone-900 hover:bg-stone-800 text-white'
                }`}
              >
                {noteSaved ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
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
                className="px-6 py-2.5 rounded-full text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors cursor-pointer"
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
