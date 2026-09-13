import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { Watering, Cultivation } from '../../types';
import { cultivationService } from '../../services/cultivationService';

interface WateringChartProps {
  cultivation: Cultivation;
  waterings: Watering[];
}

export const WateringChart: React.FC<WateringChartProps> = ({
  cultivation,
  waterings,
}) => {
  const chartData = waterings
    .slice()
    .reverse()
    .map((w) => {
      const day = cultivationService.calculateDays(cultivation.startDate, w.date);
      return {
        date: w.date.slice(5),
        day: `Día ${day}`,
        volume: w.volumeLiters,
        phIn: w.phIn,
        phRunoff: w.phRunoff,
        ecIn: w.ecIn,
        ecRunoff: w.ecRunoff,
      };
    });

  return (
    <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-4">
      <div className="pb-3 border-b border-stone-100">
        <h3 className="font-bold text-base text-stone-900">Evolución de pH y EC 💧</h3>
        <p className="text-xs text-stone-500">Comportamiento de la nutrición en riegos sucesivos</p>
      </div>

      {chartData.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-stone-400">
          <p className="text-sm font-medium">Aún no hay riegos registrados con valores de pH y EC.</p>
        </div>
      ) : (
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f0ee" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#78716c' }} stroke="#e7e5e4" />
              <YAxis yAxisId="ph" domain={[5, 8]} tick={{ fontSize: 11, fill: '#059669' }} stroke="#e7e5e4" />
              <YAxis yAxisId="ec" orientation="right" domain={[0, 3.5]} tick={{ fontSize: 11, fill: '#0284c7' }} stroke="#e7e5e4" />
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
                yAxisId="ph"
                type="monotone"
                name="pH Entrada"
                dataKey="phIn"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#10b981' }}
              />
              <Line
                yAxisId="ph"
                type="monotone"
                name="pH Drenaje"
                dataKey="phRunoff"
                stroke="#34d399"
                strokeWidth={2}
                strokeDasharray="3 3"
                dot={{ r: 3, fill: '#34d399' }}
              />
              <Line
                yAxisId="ec"
                type="monotone"
                name="EC Entrada (mS)"
                dataKey="ecIn"
                stroke="#0284c7"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#0284c7' }}
              />
              <Line
                yAxisId="ec"
                type="monotone"
                name="EC Drenaje (mS)"
                dataKey="ecRunoff"
                stroke="#38bdf8"
                strokeWidth={2}
                strokeDasharray="3 3"
                dot={{ r: 3, fill: '#38bdf8' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
