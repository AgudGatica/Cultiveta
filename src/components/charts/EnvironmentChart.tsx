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

  const chartData = filtered.map((r) => {
    const day = cultivationService.calculateDays(cultivation.startDate, r.date);
    return {
      date: r.date.slice(5), // MM-DD
      day: `Día ${day}`,
      temp: r.temperatureC,
      humidity: r.humidityPct,
      vpd: r.vpdKPa,
      ppfd: r.ppfd,
    };
  });

  return (
    <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
        <div>
          <h3 className="font-bold text-base text-stone-900">Evolución Ambiental 🌡️</h3>
          <p className="text-xs text-stone-500">Histórico de temperatura, humedad relativa y VPD</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowVpd(!showVpd)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer border ${
              showVpd
                ? 'bg-purple-100 text-purple-900 border-purple-300'
                : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
            }`}
          >
            VPD ({showVpd ? 'Activo' : 'Oculto'})
          </button>

          <div className="bg-stone-100 p-1 rounded-2xl flex items-center gap-1 text-xs font-semibold text-stone-600">
            <button
              type="button"
              onClick={() => setRange('7d')}
              className={`px-2.5 py-1 rounded-xl transition-all cursor-pointer ${
                range === '7d' ? 'bg-white text-stone-900 shadow-2xs font-bold' : 'hover:text-stone-900'
              }`}
            >
              7 Días
            </button>
            <button
              type="button"
              onClick={() => setRange('30d')}
              className={`px-2.5 py-1 rounded-xl transition-all cursor-pointer ${
                range === '30d' ? 'bg-white text-stone-900 shadow-2xs font-bold' : 'hover:text-stone-900'
              }`}
            >
              30 Días
            </button>
            <button
              type="button"
              onClick={() => setRange('all')}
              className={`px-2.5 py-1 rounded-xl transition-all cursor-pointer ${
                range === 'all' ? 'bg-white text-stone-900 shadow-2xs font-bold' : 'hover:text-stone-900'
              }`}
            >
              Ciclo
            </button>
          </div>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-stone-400">
          <p className="text-sm font-medium">Aún no hay mediciones ambientales en este período.</p>
          <p className="text-xs mt-1">Registra temperatura y humedad para ver los gráficos.</p>
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
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
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
