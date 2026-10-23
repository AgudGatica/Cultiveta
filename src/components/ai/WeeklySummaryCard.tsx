import React, { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import type { Cultivation, EnvironmentRecord, Watering } from '../../types';
import { aiService } from '../../services/aiService';
import { isCropFinished } from '../../utils/cropCardInfo';
import { parseLocalDate } from '../../utils/growthStageUtils';
import { SafeMarkdown } from './SafeMarkdown';

interface WeeklySummaryCardProps {
  cultivations: Cultivation[];
  waterings: Watering[];
  envRecords: EnvironmentRecord[];
}

/** Resumen semanal de los cultivos activos generado con IA (antes estaba en el Inicio). */
export const WeeklySummaryCard: React.FC<WeeklySummaryCardProps> = ({ cultivations, waterings, envRecords }) => {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    const activeCrops = cultivations.filter((c) => !isCropFinished(c));
    const activeIds = new Set(activeCrops.map((c) => c.id));
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setHours(0, 0, 0, 0);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    // Fechas en hora local (new Date('YYYY-MM-DD') usaría UTC)
    const wateringsCount = waterings.filter((w) => {
      const d = parseLocalDate(w.date);
      return activeIds.has(w.cultivationId) && d !== null && d >= sevenDaysAgo;
    }).length;
    const latestEnv = envRecords
      .filter((e) => activeIds.has(e.cultivationId))
      .sort((a, b) => `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`))[0];

    try {
      setLoading(true);
      const res = await aiService.getWeeklySummary({
        cultivations: activeCrops.map((c) => ({ name: c.name, stage: c.currentStage, genetics: c.geneticsName })),
        wateringsCount,
        // Sin medición no se envía un valor supuesto: el servidor muestra "N/D"
        recentEnvAvg: {
          tempC: typeof latestEnv?.temperatureC === 'number' ? latestEnv.temperatureC : null,
          humidityPct: typeof latestEnv?.humidityPct === 'number' ? latestEnv.humidityPct : null,
        },
      });
      setSummary(res);
    } catch (err) {
      console.error('Error generating summary:', err);
      setSummary('No pudimos generar el resumen en este momento. Probá de nuevo en un ratito.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="weekly-summary-card" className="cultiveta-card p-4 sm:p-5 space-y-3">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-icon-bg text-brand shrink-0">
            <CalendarRange className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-ink">Resumen semanal</h2>
            <p className="text-xs text-ink-muted">Cómo vienen tus cultivos activos en los últimos 7 días</p>
          </div>
        </div>
        <button
          type="button"
          id="generate-summary-btn"
          onClick={handleGenerate}
          disabled={loading}
          className="cultiveta-btn-primary text-xs w-full sm:w-auto disabled:opacity-50"
        >
          {loading ? 'Consultando a Cultiveta…' : summary ? 'Generar de nuevo' : 'Generá el resumen semanal'}
        </button>
      </div>
      {summary && (
        <div className="p-4 rounded-2xl bg-surface border border-chip-line text-sm leading-relaxed text-ink">
          <SafeMarkdown text={summary} />
        </div>
      )}
    </section>
  );
};
