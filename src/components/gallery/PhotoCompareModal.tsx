import React, { useState } from 'react';
import { X, Scale, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';
import { PhotoRecord, Cultivation } from '../../types';
import { aiService } from '../../services/aiService';
import { PhotoImageView } from '../common/PhotoImageView';

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
    <div className="cultiveta-modal-overlay animate-in fade-in">
      <div
        id="photo-compare-modal"
        className="cultiveta-modal-container max-w-5xl p-6 sm:p-8 my-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-line mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-brand/15 text-brand">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-ink">Comparar evolución visual</h2>
              <p className="text-xs text-ink-muted">
                Observá el desarrollo de tus plantas lado a lado entre dos períodos en {cultivation.name}
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

        {/* Selector Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-ink mb-1">Fotografía A (Inicial / Anterior)</label>
            <select
              value={photoAId}
              onChange={(e) => {
                setPhotoAId(e.target.value);
                setComparisonResult(null);
              }}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-surface border border-line text-xs font-bold text-ink focus:outline-hidden focus:border-brand cursor-pointer"
            >
              {photos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.date} · Día {p.dayOfCultivation} ({p.stage} - {p.category})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink mb-1">Fotografía B (Posterior / Actual)</label>
            <select
              value={photoBId}
              onChange={(e) => {
                setPhotoBId(e.target.value);
                setComparisonResult(null);
              }}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-surface border border-line text-xs font-bold text-ink focus:outline-hidden focus:border-brand cursor-pointer"
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
            <div className="bg-surface rounded-3xl p-4 border border-line flex flex-col justify-between shadow-2xs">
              <div className="relative rounded-2xl overflow-hidden mb-3 aspect-4/3 bg-track">
                <PhotoImageView
                  photo={photoA}
                  userId={cultivation.userId}
                  alt="Foto A"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 px-2.5 py-1 rounded-full bg-white/90 text-ink font-bold text-xs backdrop-blur-xs border border-line shadow-xs">
                  Foto A · Día {photoA.dayOfCultivation}
                </div>
              </div>
              <div className="text-xs space-y-1">
                <div className="flex justify-between text-ink-muted font-medium">
                  <span className="font-bold text-ink">{photoA.date}</span>
                  <span className="font-bold text-brand bg-brand/10 px-2 py-0.5 rounded-md border border-brand/20">{photoA.stage}</span>
                </div>
                {photoA.caption && <p className="text-ink-muted italic">"{photoA.caption}"</p>}
              </div>
            </div>
          )}

          {/* Photo B card */}
          {photoB && (
            <div className="bg-surface rounded-3xl p-4 border border-line flex flex-col justify-between shadow-2xs">
              <div className="relative rounded-2xl overflow-hidden mb-3 aspect-4/3 bg-track">
                <PhotoImageView
                  photo={photoB}
                  userId={cultivation.userId}
                  alt="Foto B"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 px-2.5 py-1 rounded-full bg-brand text-white font-bold text-xs backdrop-blur-xs shadow-xs">
                  Foto B · Día {photoB.dayOfCultivation}
                </div>
              </div>
              <div className="text-xs space-y-1">
                <div className="flex justify-between text-ink-muted font-medium">
                  <span className="font-bold text-ink">{photoB.date}</span>
                  <span className="font-bold text-ok bg-ok/10 px-2 py-0.5 rounded-md border border-ok/20">{photoB.stage}</span>
                </div>
                {photoB.caption && <p className="text-ink-muted italic">"{photoB.caption}"</p>}
              </div>
            </div>
          )}
        </div>

        {/* AI Comparison Button & Results */}
        <div className="p-5 rounded-3xl bg-brand/10 border border-brand/25 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand" />
              <div>
                <h4 className="font-black text-sm text-ink">Análisis Comparativo con Cultiveta IA</h4>
                <p className="text-xs text-ink-muted">Detectá cambios morfológicos y desarrollo botánico</p>
              </div>
            </div>
            <button
              type="button"
              id="run-ai-compare-btn"
              onClick={handleRunComparison}
              disabled={analyzing || !photoA || !photoB}
              className="cultiveta-btn-primary text-xs disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{analyzing ? 'Analizando diferencias...' : 'Analizar evolución'}</span>
            </button>
          </div>

          {error && <p className="text-xs text-coral font-semibold">{error}</p>}

          {comparisonResult && (
            <div className="mt-4 pt-4 border-t border-brand/20 space-y-3 text-xs text-ink bg-white p-4 sm:p-5 rounded-2xl border border-line">
              <div>
                <span className="font-bold text-brand block mb-1">🌿 Cambios visuales observados:</span>
                <p className="leading-relaxed text-ink-muted">{comparisonResult.visualChanges}</p>
              </div>
              <div>
                <span className="font-bold text-ok block mb-1">📈 Desarrollo estructural y vegetativo:</span>
                <p className="leading-relaxed text-ink-muted">{comparisonResult.structuralGrowth}</p>
              </div>
              <div>
                <span className="font-bold text-coral block mb-1">🩺 Observaciones de salud foliar:</span>
                <p className="leading-relaxed text-ink-muted">{comparisonResult.healthNotes}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
