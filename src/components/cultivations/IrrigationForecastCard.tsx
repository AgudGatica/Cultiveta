import React, { useMemo, useState } from 'react';
import { ChevronDown, Droplets } from 'lucide-react';
import type { Cultivation, EnvironmentRecord, Watering } from '../../types';
import { calculateIrrigationForecast } from '../../services/irrigationForecastService';
import { formatFriendlyDate } from '../../utils/growthStageUtils';

interface IrrigationForecastCardProps {
  cultivation: Cultivation;
  waterings: Watering[];
  envRecords: EnvironmentRecord[];
}

/**
 * Ventana para revisar la maceta. Solo formatea la salida de calculateIrrigationForecast
 * (no calcula nada nuevo). Antes estaba en el Inicio.
 */
export const IrrigationForecastCard: React.FC<IrrigationForecastCardProps> = ({ cultivation, waterings, envRecords }) => {
  const [showWhy, setShowWhy] = useState(false);

  const display = useMemo(() => {
    const f = calculateIrrigationForecast(cultivation, waterings, envRecords);
    if (!f) return null;

    const startPart = f.wateringWindowStart ? f.wateringWindowStart.split('T')[0] : '';
    const endPart = f.wateringWindowEnd ? f.wateringWindowEnd.split('T')[0] : '';
    const startTime = f.wateringWindowStart && f.wateringWindowStart.includes('T') ? f.wateringWindowStart.split('T')[1] : '';
    const endTime = f.wateringWindowEnd && f.wateringWindowEnd.includes('T') ? f.wateringWindowEnd.split('T')[1] : '';

    let windowText: string | null = null;
    if (startPart && endPart) {
      windowText =
        startPart === endPart
          ? `${formatFriendlyDate(startPart)}${startTime ? `, de ${startTime} a ${endTime} hs` : ''}`
          : `Entre ${formatFriendlyDate(startPart)}${startTime ? ` ${startTime} hs` : ''} y ${formatFriendlyDate(endPart)}${endTime ? ` ${endTime} hs` : ''}`;
    }

    let hint: string | null = null;
    if (f.confidence === 'low') {
      hint = f.lastWateringAt
        ? 'Anotá algunos riegos más para personalizar la ventana.'
        : 'Anotá un primer riego para que el pronóstico empiece a aprender.';
    }

    return {
      windowText,
      confidenceLabel: f.confidence === 'high' ? 'Alta' : f.confidence === 'medium' ? 'Media' : 'Baja',
      hint,
      missingSignals: f.missingSignals,
      factors: f.factors,
    };
  }, [cultivation, waterings, envRecords]);

  if (!display) return null;

  return (
    <section id="crop-irrigation-forecast" className="rounded-[28px] bg-brand-deep text-white p-5 sm:p-6 space-y-3 shadow-card">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs font-bold uppercase tracking-wider text-brand-soft flex items-center gap-1.5">
          <Droplets className="w-4 h-4" aria-hidden="true" />
          Ventana para revisar la maceta
        </span>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/10 text-brand-softer">
          Confianza: {display.confidenceLabel}
        </span>
      </div>

      <p className="text-lg font-extrabold leading-snug">{display.windowText ?? 'Todavía no hay una ventana estimada'}</p>

      {display.hint && <p className="text-sm text-brand-soft">{display.hint}</p>}

      {display.missingSignals.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-soft">Falta medir</p>
          <ul className="mt-1.5 space-y-1 text-sm text-brand-softer list-disc pl-5">
            {display.missingSignals.map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
        </div>
      )}

      {display.factors.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowWhy((prev) => !prev)}
            aria-expanded={showWhy}
            className="min-h-11 inline-flex items-center gap-1 text-sm font-bold text-accent hover:underline cursor-pointer"
          >
            {showWhy ? 'Ocultar el porqué' : '¿Por qué esta ventana?'}
            <ChevronDown aria-hidden="true" className={`w-4 h-4 transition-transform ${showWhy ? 'rotate-180' : ''}`} />
          </button>
          {showWhy && (
            <ul className="mt-1 space-y-1 text-sm text-brand-softer list-disc pl-5">
              {display.factors.map((factor, i) => (
                <li key={i}>{factor}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
