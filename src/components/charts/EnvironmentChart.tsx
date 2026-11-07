import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { EnvironmentRecord, Cultivation } from '../../types';
import { cultivationService } from '../../services/cultivationService';
import { dayMonth } from '../../utils/formatNumber';

interface EnvironmentChartProps {
  cultivation: Cultivation;
  envRecords: EnvironmentRecord[];
}

export const EnvironmentChart: React.FC<EnvironmentChartProps> = ({
  cultivation,
  envRecords,
}) => {
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('7d');
  const [showVpd, setShowVpd] = useState(false);

  // Filter records by date range
  const now = new Date();
  const filtered = envRecords.filter((r) => {
    if (range === 'all') return true;
    const daysAgo = range === '7d' ? 7 : 30;
    const cutOff = new Date(now);
    cutOff.setDate(cutOff.getDate() - daysAgo);
    return new Date(r.date) >= cutOff;
  });

  const chartData = [...filtered].sort((a, b) => a.date.localeCompare(b.date)).map((r) => {
    const day = cultivationService.calculateDays(cultivation.startDate, r.date);
    return {
      date: dayMonth(r.date),
      day: `Día ${day}`,
      temp: r.temperatureC,
      humidity: r.humidityPct,
      vpd: r.vpdKPa,
      ppfd: r.ppfd,
    };
  });

  return (
    <div className="bg-white rounded-3xl p-6 border border-line shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-line">
        <div>
          <h3 className="font-bold text-base text-ink">Evolución del ambiente</h3>
          <p className="text-xs text-ink-muted">Histórico de temperatura, humedad relativa y VPD</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowVpd(!showVpd)}
            className={`min-h-11 px-3 rounded-full text-xs font-bold transition-colors cursor-pointer border ${
              showVpd
                ? 'bg-icon-bg text-brand border-chip-line'
                : 'bg-surface text-ink-muted border-line hover:bg-track'
            }`}
          >
            VPD ({showVpd ? 'Activo' : 'Oculto'})
          </button>

          <div className="bg-track p-1 rounded-2xl flex items-center gap-1 text-xs font-semibold text-ink-muted">
            <button
              type="button"
              onClick={() => setRange('7d')}
              className={`min-h-11 px-3 rounded-xl transition-all cursor-pointer ${
                range === '7d' ? 'bg-white text-ink shadow-2xs font-bold' : 'hover:text-ink'
              }`}
            >
              7 días
            </button>
            <button
              type="button"
              onClick={() => setRange('30d')}
              className={`min-h-11 px-3 rounded-xl transition-all cursor-pointer ${
                range === '30d' ? 'bg-white text-ink shadow-2xs font-bold' : 'hover:text-ink'
              }`}
            >
              30 días
            </button>
            <button
              type="button"
              onClick={() => setRange('all')}
              className={`min-h-11 px-3 rounded-xl transition-all cursor-pointer ${
                range === 'all' ? 'bg-white text-ink shadow-2xs font-bold' : 'hover:text-ink'
              }`}
            >
              Ciclo
            </button>
          </div>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-ink-subtle">
          <p className="text-sm font-medium">Aún no hay mediciones ambientales en este período.</p>
          <p className="text-xs mt-1">Registrá temperatura y humedad para ver los gráficos.</p>
        </div>
      ) : (
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ee" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#78716c' }} stroke="#e7e5e4" />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#78716c' }} stroke="#e7e5e4" />
              {showVpd && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#9333ea' }}
                  stroke="#e7e5e4"
                />
              )}
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderRadius: '1rem',
                  border: '1px solid #e7e5e4',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} formatter={(value) => <span style={{ color: 'var(--color-ink)' }}>{value}</span>} />
              <Line
                yAxisId="left"
                type="monotone"
                name="Temperatura (°C)"
                dataKey="temp"
                stroke="#f97316"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#f97316' }}
                activeDot={{ r: 5 }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                name="Humedad (% HR)"
                dataKey="humidity"
                stroke="#06b6d4"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#06b6d4' }}
                activeDot={{ r: 5 }}
              />
              {showVpd && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  name="VPD (kPa)"
                  dataKey="vpd"
                  stroke="#9333ea"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: '#9333ea' }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
