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
          className="inline-flex items-center gap-2 text-xs font-bold text-stone-600 hover:text-emerald-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a mis cultivos
        </button>

        <div className="flex items-center gap-2">
          {onEditHarvest && (
            <button
              type="button"
              onClick={() => onEditHarvest(harvest)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
              title="Editar cuánto se cosechó y notas finales"
            >
              <Pencil className="w-4 h-4" />
              Editar Cosecha
            </button>
          )}

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Imprimir / Guardar en PDF
          </button>
        </div>
      </div>

      {/* Printable Sheet */}
      <div
        id="harvest-report-sheet"
        className="bg-white rounded-3xl p-8 sm:p-12 border border-stone-200 shadow-md print:shadow-none print:border-none print:p-0 text-stone-800"
      >
        {/* Brand & Header */}
        <div className="flex items-start justify-between border-b-2 border-stone-100 pb-6 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🌱</span>
              <span className="text-2xl font-extrabold lowercase text-emerald-950">cultiveta</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 ml-2">
                Ficha Final de Cultivo
              </span>
            </div>
            <h1 className="text-3xl font-extrabold text-stone-900">{harvest.cultivationName}</h1>
            <p className="text-stone-500 text-sm font-medium mt-1">
              Genética: <span className="text-stone-800 font-bold">{harvest.geneticsName || 'Sin especificar'}</span>{' '}
              {harvest.seedBank && `(${harvest.seedBank})`}
            </p>
          </div>

          <div className="text-right">
            <div className="flex items-center justify-end gap-1 text-amber-400 mb-1">
              {[...Array(harvest.rating1To5)].map((_, i) => (
                <Star key={i} className="w-5 h-5 fill-amber-400" />
              ))}
            </div>
            <div className="text-xs text-stone-500 font-medium">Calificación: {harvest.rating1To5}/5</div>
            <div className="text-xs text-stone-400 mt-1">Cosechado: {harvest.harvestDate}</div>
          </div>
        </div>

        {/* Hero Metrics (Grams & Duration) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-6 rounded-3xl bg-emerald-50/60 border border-emerald-200/80 mb-8 text-center">
          <div>
            <div className="text-xs font-semibold text-emerald-800 mb-1">Rendimiento Seco</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-950">
              {harvest.finalDryWeightGrams} g
            </div>
            <div className="text-[11px] text-emerald-700 mt-0.5 font-medium">
              {harvest.gramsPerPlant} g / planta
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-emerald-800 mb-1">Duración Total</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-950">{harvest.totalDays}</div>
            <div className="text-[11px] text-emerald-700 mt-0.5 font-medium">Días desde germinación</div>
          </div>

          <div>
            <div className="text-xs font-semibold text-emerald-800 mb-1">Fase de Floración</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-950">
              {harvest.floweringDays || '—'}
            </div>
            <div className="text-[11px] text-emerald-700 mt-0.5 font-medium">Días de floración</div>
          </div>

          <div>
            <div className="text-xs font-semibold text-emerald-800 mb-1">Plantas Cultivadas</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-950">{harvest.plantCount}</div>
            <div className="text-[11px] text-emerald-700 mt-0.5 font-medium">
              {cultivation.substrate?.potVolumeLiters}L {cultivation.substrate?.potType}
            </div>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Setup specs */}
          <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-2 text-xs">
            <h3 className="font-bold text-stone-800 text-sm mb-3">Configuración del Ciclo</h3>
            <div className="flex justify-between py-1 border-b border-stone-200/60">
              <span className="text-stone-500">Entorno:</span>
              <span className="font-semibold text-stone-800">{cultivation.type}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-stone-200/60">
              <span className="text-stone-500">Iluminación:</span>
              <span className="font-semibold text-stone-800">
                {cultivation.lighting?.type || 'No especificada'} {cultivation.lighting?.usedWatts ? `(${cultivation.lighting.usedWatts}W)` : ''}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-stone-200/60">
              <span className="text-stone-500">Sustrato:</span>
              <span className="font-semibold text-stone-800">{cultivation.substrate?.type || 'No especificado'}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-stone-500">Fecha de Inicio:</span>
              <span className="font-semibold text-stone-800">{harvest.startDate}</span>
            </div>
          </div>

          {/* Organoleptic and final review */}
          <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-2 text-xs">
            <h3 className="font-bold text-stone-800 text-sm mb-3">Cata y Evaluación</h3>
            <div className="py-1">
              <span className="text-stone-500 font-semibold block mb-0.5">Perfil de Aroma:</span>
              <p className="text-stone-800 italic">{harvest.aromaReview || 'Sin registrar'}</p>
            </div>
            <div className="py-1 border-t border-stone-200/60">
              <span className="text-stone-500 font-semibold block mb-0.5">Perfil de Sabor:</span>
              <p className="text-stone-800 italic">{harvest.flavorReview || 'Sin registrar'}</p>
            </div>
            <div className="py-1 border-t border-stone-200/60">
              <span className="text-stone-500 font-semibold block mb-0.5">Estructura y Densidad:</span>
              <p className="text-stone-800 italic">{harvest.structureDensityReview || 'Sin registrar'}</p>
            </div>
          </div>
        </div>

        {/* Curing & Final Notes */}
        {(harvest.curingNotes || harvest.finalNotes) && (
          <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200/80 mb-8 space-y-3 text-xs">
            <h3 className="font-bold text-stone-800 text-sm">Secado, Curado y Conclusiones</h3>
            {harvest.curingNotes && (
              <div>
                <span className="font-semibold text-stone-600">Curado: </span>
                <span className="text-stone-700">{harvest.curingNotes}</span>
              </div>
            )}
            {harvest.finalNotes && (
              <div>
                <span className="font-semibold text-stone-600">Notas finales: </span>
                <span className="text-stone-700">{harvest.finalNotes}</span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="pt-6 border-t border-stone-100 flex items-center justify-between text-xs text-stone-400">
          <span>Cultiveta — Diario Inteligente de Cultivo</span>
          <span>Registro generado el {new Date().toLocaleDateString('es-ES')}</span>
        </div>
      </div>
    </div>
  );
};
