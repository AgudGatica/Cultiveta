import React, { useState } from 'react';
import { X, Scale, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';
import { PhotoRecord, Cultivation } from '../../types';
import { aiService } from '../../services/aiService';

interface PhotoCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  photos: PhotoRecord[];
  cultivation: Cultivation;
}

export const PhotoCompareModal: React.FC<PhotoCompareModalProps> = ({
  isOpen,
  onClose,
  photos,
  cultivation,
}) => {
  const [photoAId, setPhotoAId] = useState(photos[photos.length - 1]?.id || '');
  const [photoBId, setPhotoBId] = useState(photos[0]?.id || '');
  const [analyzing, setAnalyzing] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<{
    visualChanges: string;
    structuralGrowth: string;
    healthNotes: string;
    confidence: 'Baja' | 'Media' | 'Alta';
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const photoA = photos.find((p) => p.id === photoAId);
  const photoB = photos.find((p) => p.id === photoBId);

  const handleRunComparison = async () => {
    if (!photoA || !photoB) return;
    try {
      setAnalyzing(true);
      setError(null);
      const res = await aiService.comparePhotos({
        photoA: { url: photoA.url, day: photoA.dayOfCultivation, stage: photoA.stage },
        photoB: { url: photoB.url, day: photoB.dayOfCultivation, stage: photoB.stage },
        geneticsName: cultivation.geneticsName,
      });
      setComparisonResult(res);
    } catch (err: any) {
      console.error('Error comparing photos', err);
      setError(err?.message || 'No se pudo realizar la comparación con IA.');
    } finally {
      setAnalyzing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/70 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div
        id="photo-compare-modal"
        className="w-full max-w-5xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-stone-200 my-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-violet-100 text-violet-800">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">Comparar Evolución Visual</h2>
              <p className="text-xs text-stone-500">
                Observa el desarrollo side-by-side de dos períodos en {cultivation.name}
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

        {/* Selector Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Fotografía A (Inicial / Anterior)</label>
            <select
              value={photoAId}
              onChange={(e) => {
                setPhotoAId(e.target.value);
                setComparisonResult(null);
              }}
              className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs font-semibold text-stone-800 focus:outline-hidden focus:border-violet-500 cursor-pointer"
            >
              {photos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.date} · Día {p.dayOfCultivation} ({p.stage} - {p.category})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Fotografía B (Posterior / Actual)</label>
            <select
              value={photoBId}
              onChange={(e) => {
                setPhotoBId(e.target.value);
                setComparisonResult(null);
              }}
              className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs font-semibold text-stone-800 focus:outline-hidden focus:border-violet-500 cursor-pointer"
            >
              {photos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.date} · Día {p.dayOfCultivation} ({p.stage} - {p.category})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Side-by-Side Images */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          {/* Photo A card */}
          {photoA && (
            <div className="bg-stone-50 rounded-3xl p-4 border border-stone-200 flex flex-col justify-between">
              <div className="relative rounded-2xl overflow-hidden mb-3 aspect-4/3 bg-stone-200">
                <img
                  src={photoA.url}
                  alt="Foto A"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 px-2.5 py-1 rounded-full bg-stone-900/80 text-white font-bold text-xs backdrop-blur-xs">
                  Foto A · Día {photoA.dayOfCultivation}
                </div>
              </div>
              <div className="text-xs space-y-1">
                <div className="flex justify-between text-stone-500 font-medium">
                  <span>{photoA.date}</span>
                  <span className="font-bold text-stone-800">{photoA.stage}</span>
                </div>
                {photoA.caption && <p className="text-stone-700 italic">"{photoA.caption}"</p>}
              </div>
            </div>
          )}

          {/* Photo B card */}
          {photoB && (
            <div className="bg-stone-50 rounded-3xl p-4 border border-stone-200 flex flex-col justify-between">
              <div className="relative rounded-2xl overflow-hidden mb-3 aspect-4/3 bg-stone-200">
                <img
                  src={photoB.url}
                  alt="Foto B"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 px-2.5 py-1 rounded-full bg-violet-900/80 text-white font-bold text-xs backdrop-blur-xs">
                  Foto B · Día {photoB.dayOfCultivation}
                </div>
              </div>
              <div className="text-xs space-y-1">
                <div className="flex justify-between text-stone-500 font-medium">
                  <span>{photoB.date}</span>
                  <span className="font-bold text-stone-800">{photoB.stage}</span>
                </div>
                {photoB.caption && <p className="text-stone-700 italic">"{photoB.caption}"</p>}
              </div>
            </div>
          )}
        </div>

        {/* AI Comparison Button & Results */}
        <div className="p-5 rounded-3xl bg-violet-50/70 border border-violet-200 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-700" />
              <div>
                <h4 className="font-bold text-sm text-violet-950">Análisis Comparativo con Cultiveta IA</h4>
                <p className="text-xs text-violet-700">Detecta cambios morfológicos y desarrollo botánico</p>
              </div>
            </div>
            <button
              type="button"
              id="run-ai-compare-btn"
              onClick={handleRunComparison}
              disabled={analyzing || !photoA || !photoB}
              className="px-5 py-2 rounded-full text-xs font-bold bg-violet-700 hover:bg-violet-800 text-white shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{analyzing ? 'Analizando diferencias...' : 'Analizar Evolución'}</span>
            </button>
          </div>

          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}

          {comparisonResult && (
            <div className="mt-4 pt-4 border-t border-violet-200/80 space-y-3 text-xs text-stone-800 bg-white/90 p-4 rounded-2xl">
              <div>
                <span className="font-bold text-violet-950 block mb-1">🌿 Cambios visuales observados:</span>
                <p className="leading-relaxed">{comparisonResult.visualChanges}</p>
              </div>
              <div>
                <span className="font-bold text-violet-950 block mb-1">📈 Desarrollo estructural y vegetativo:</span>
                <p className="leading-relaxed">{comparisonResult.structuralGrowth}</p>
              </div>
              <div>
                <span className="font-bold text-violet-950 block mb-1">🩺 Observaciones de salud foliar:</span>
                <p className="leading-relaxed">{comparisonResult.healthNotes}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
