import React from 'react';
import { ArrowLeft, Printer, Star, Scale, Calendar, Sprout, Award, Download, Pencil } from 'lucide-react';
import { Cultivation, Harvest } from '../../types';

interface HarvestReportViewProps {
  cultivation: Cultivation;
  harvest: Harvest;
  onBack: () => void;
  onEditHarvest?: (harvest: Harvest) => void;
}

export const HarvestReportView: React.FC<HarvestReportViewProps> = ({
  cultivation,
  harvest,
  onBack,
  onEditHarvest,
}) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12 animate-in fade-in">
      {/* Top action toolbar */}
      <div className="flex items-center justify-between no-print">
        <button
          type="button"
          onClick={onBack}
          className="cultiveta-back-pill"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a mis cultivos
        </button>

        <div className="flex items-center gap-2">
          {onEditHarvest && (
            <button
              type="button"
              onClick={() => onEditHarvest(harvest)}
              className="inline-flex items-center gap-2 px-4 py-2 min-h-11 rounded-2xl bg-accent hover:bg-warn-line text-ink font-bold text-xs shadow-sm transition-colors cursor-pointer"
              title="Editar cuánto se cosechó y notas finales"
            >
              <Pencil className="w-4 h-4" />
              Editar cosecha
            </button>
          )}

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-brand-deep hover:bg-brand-deep text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Imprimir / Guardar en PDF
          </button>
        </div>
      </div>

      {/* Printable Sheet */}
      <div
        id="harvest-report-sheet"
        className="bg-white rounded-3xl p-8 sm:p-12 border border-line shadow-md print:shadow-none print:border-none print:p-0 text-ink"
      >
        {/* Brand & Header */}
        <div className="flex items-start justify-between border-b-2 border-line pb-6 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl font-extrabold lowercase text-ok-ink">cultiveta</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-ok-bg text-ok-ink ml-2">
                Ficha final de cultivo
              </span>
            </div>
            <h1 className="text-3xl font-extrabold text-ink">{harvest.cultivationName}</h1>
            <p className="text-ink-muted text-sm font-medium mt-1">
              Genética: <span className="text-ink font-bold">{harvest.geneticsName || 'Sin especificar'}</span>{' '}
              {harvest.seedBank && `(${harvest.seedBank})`}
            </p>
          </div>

          <div className="text-right">
            <div className="flex items-center justify-end gap-1 text-warn-ink mb-1">
              {[...Array(harvest.rating1To5)].map((_, i) => (
                <Star key={i} className="w-5 h-5 fill-warn-line" />
              ))}
            </div>
            <div className="text-xs text-ink-muted font-medium">Calificación: {harvest.rating1To5}/5</div>
            <div className="text-xs text-ink-subtle mt-1">Cosechado: {harvest.harvestDate}</div>
          </div>
        </div>

        {/* Hero Metrics (Grams & Duration) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-6 rounded-3xl bg-ok-bg border border-ok-line mb-8 text-center">
          <div>
            <div className="text-xs font-semibold text-ok-ink mb-1">Rendimiento seco</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-ok-ink">
              {harvest.finalDryWeightGrams} g
            </div>
            <div className="text-xs text-ok-ink mt-0.5 font-medium">
              {harvest.gramsPerPlant} g / planta
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-ok-ink mb-1">Duración total</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-ok-ink">{harvest.totalDays}</div>
            <div className="text-xs text-ok-ink mt-0.5 font-medium">Días desde germinación</div>
          </div>

          <div>
            <div className="text-xs font-semibold text-ok-ink mb-1">Fase de floración</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-ok-ink">
              {harvest.floweringDays || '—'}
            </div>
            <div className="text-xs text-ok-ink mt-0.5 font-medium">Días de floración</div>
          </div>

          <div>
            <div className="text-xs font-semibold text-ok-ink mb-1">Plantas cultivadas</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-ok-ink">{harvest.plantCount}</div>
            <div className="text-xs text-ok-ink mt-0.5 font-medium">
              {cultivation.substrate?.potVolumeLiters}L {cultivation.substrate?.potType}
            </div>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Setup specs */}
          <div className="p-5 rounded-2xl bg-surface border border-line space-y-2 text-xs">
            <h3 className="font-bold text-ink text-sm mb-3">Configuración del ciclo</h3>
            <div className="flex justify-between py-1 border-b border-line">
              <span className="text-ink-muted">Entorno:</span>
              <span className="font-semibold text-ink">{cultivation.type}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-line">
              <span className="text-ink-muted">Iluminación:</span>
              <span className="font-semibold text-ink">
                {cultivation.lighting?.type || 'No especificada'} {cultivation.lighting?.usedWatts ? `(${cultivation.lighting.usedWatts}W)` : ''}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-line">
              <span className="text-ink-muted">Sustrato:</span>
              <span className="font-semibold text-ink">{cultivation.substrate?.type || 'No especificado'}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-ink-muted">Fecha de inicio:</span>
              <span className="font-semibold text-ink">{harvest.startDate}</span>
            </div>
          </div>

          {/* Organoleptic and final review */}
          <div className="p-5 rounded-2xl bg-surface border border-line space-y-2 text-xs">
            <h3 className="font-bold text-ink text-sm mb-3">Cata y evaluación</h3>
            <div className="py-1">
              <span className="text-ink-muted font-semibold block mb-0.5">Perfil de aroma:</span>
              <p className="text-ink italic">{harvest.aromaReview || 'Sin registrar'}</p>
            </div>
            <div className="py-1 border-t border-line">
              <span className="text-ink-muted font-semibold block mb-0.5">Perfil de sabor:</span>
              <p className="text-ink italic">{harvest.flavorReview || 'Sin registrar'}</p>
            </div>
            <div className="py-1 border-t border-line">
              <span className="text-ink-muted font-semibold block mb-0.5">Estructura y densidad:</span>
              <p className="text-ink italic">{harvest.structureDensityReview || 'Sin registrar'}</p>
            </div>
          </div>
        </div>

        {/* Curing & Final Notes */}
        {(harvest.curingNotes || harvest.finalNotes) && (
          <div className="p-5 rounded-2xl bg-surface border border-line mb-8 space-y-3 text-xs">
            <h3 className="font-bold text-ink text-sm">Secado, curado y conclusiones</h3>
            {harvest.curingNotes && (
              <div>
                <span className="font-semibold text-ink-muted">Curado: </span>
                <span className="text-ink">{harvest.curingNotes}</span>
              </div>
            )}
            {harvest.finalNotes && (
              <div>
                <span className="font-semibold text-ink-muted">Notas finales: </span>
                <span className="text-ink">{harvest.finalNotes}</span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="pt-6 border-t border-line flex items-center justify-between text-xs text-ink-subtle">
          <span>Cultiveta — diario inteligente de cultivo</span>
          <span>Registro generado el {new Date().toLocaleDateString('es-ES')}</span>
        </div>
      </div>
    </div>
  );
};
