import React, { useState, useMemo } from 'react';
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
import {
  Thermometer,
  Droplets,
  Gauge,
  Calendar,
  Filter,
  Activity,
  Plus,
} from 'lucide-react';
import { Cultivation, EnvironmentRecord } from '../../types';

interface DashboardEnvironmentChartProps {
  activeCultivations: Cultivation[];
  envRecords: EnvironmentRecord[];
  onOpenEnvModal?: (cultivation?: Cultivation) => void;
}

export const DashboardEnvironmentChart: React.FC<DashboardEnvironmentChartProps> = ({
  activeCultivations,
  envRecords,
  onOpenEnvModal,
}) => {
  const [selectedCropId, setSelectedCropId] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<'7d' | '14d' | '30d' | 'all'>('7d');
  const [showTemp, setShowTemp] = useState(true);
  const [showHumidity, setShowHumidity] = useState(true);
  const [showVpd, setShowVpd] = useState(false);

  // Active crop IDs map
  const activeCropIds = useMemo(
    () => new Set(activeCultivations.map((c) => c.id)),
    [activeCultivations]
  );

  const cropNameMap = useMemo(() => {
    const map = new Map<string, string>();
    activeCultivations.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [activeCultivations]);

  // Filter records belonging to active cultivations and within date range
  const filteredRecords = useMemo(() => {
    const now = new Date();
    let daysCutoff = 0;
    if (timeRange === '7d') daysCutoff = 7;
    else if (timeRange === '14d') daysCutoff = 14;
    else if (timeRange === '30d') daysCutoff = 30;

    const cutoffDate = daysCutoff > 0 ? new Date(now.getTime() - daysCutoff * 24 * 60 * 60 * 1000) : null;

    return envRecords
      .filter((r) => {
        // Must belong to active crops
        if (!activeCropIds.has(r.cultivationId)) return false;

        // Must match selected crop filter if not 'all'
        if (selectedCropId !== 'all' && r.cultivationId !== selectedCropId) return false;

        // Date range
        if (cutoffDate) {
          const recDate = new Date(r.date);
          if (recDate < cutoffDate) return false;
        }

        return true;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [envRecords, activeCropIds, selectedCropId, timeRange]);

  // Aggregate into chart data points
  // If 'all' is selected and multiple crops have measurements on same date/time, we group or display points
  const chartData = useMemo(() => {
    return filteredRecords.map((r) => {
      const parsedDate = new Date(r.date);
      const formattedDate = isNaN(parsedDate.getTime())
        ? r.date
        : parsedDate.toLocaleDateString('es-ES', {
            month: 'short',
            day: 'numeric',
          });

      const cropName = cropNameMap.get(r.cultivationId) || 'Cultivo';

      return {
        id: r.id,
        rawDate: r.date,
        displayDate: formattedDate,
        time: r.time || '',
        cropName,
        temperature: Number(r.temperatureC.toFixed(1)),
        humidity: Math.round(r.humidityPct),
        vpd: r.vpdKPa !== undefined && r.vpdKPa !== null ? Number(r.vpdKPa.toFixed(2)) : undefined,
        ppfd: r.ppfd,
      };
    });
  }, [filteredRecords, cropNameMap]);

  // Summary stats
  const stats = useMemo(() => {
    if (chartData.length === 0) {
      return { avgTemp: null, avgHum: null, avgVpd: null, count: 0 };
    }
    const sumTemp = chartData.reduce((acc, d) => acc + d.temperature, 0);
    const sumHum = chartData.reduce((acc, d) => acc + d.humidity, 0);
    const withVpd = chartData.filter((d) => d.vpd !== undefined);
    const sumVpd = withVpd.reduce((acc, d) => acc + (d.vpd || 0), 0);

    return {
      avgTemp: (sumTemp / chartData.length).toFixed(1),
      avgHum: Math.round(sumHum / chartData.length),
      avgVpd: withVpd.length > 0 ? (sumVpd / withVpd.length).toFixed(2) : null,
      count: chartData.length,
    };
  }, [chartData]);

  // Custom Dark Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-zinc-950/95 backdrop-blur-md p-3.5 rounded-2xl border border-zinc-800 shadow-2xl text-xs space-y-2 min-w-[190px]">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-1.5">
            <span className="font-bold text-white font-mono">{data.displayDate}</span>
            <span className="text-[10px] text-zinc-400 truncate max-w-[100px]">{data.cropName}</span>
          </div>

          <div className="space-y-1.5 pt-0.5">
            {showTemp && data.temperature !== undefined && (
              <div className="flex items-center justify-between text-amber-400">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                  Temperatura:
                </span>
                <span className="font-mono font-bold">{data.temperature} °C</span>
              </div>
            )}

            {showHumidity && data.humidity !== undefined && (
              <div className="flex items-center justify-between text-cyan-400">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                  Humedad:
                </span>
                <span className="font-mono font-bold">{data.humidity} %</span>
              </div>
            )}

            {showVpd && data.vpd !== undefined && (
              <div className="flex items-center justify-between text-purple-400">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <Gauge className="w-3.5 h-3.5 text-purple-400" />
                  VPD:
                </span>
                <span className="font-mono font-bold">{data.vpd} kPa</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      id="dashboard-environment-chart-card"
      className="bg-[#0F0F0F] text-white rounded-[32px] p-6 sm:p-8 border border-zinc-800 shadow-xl relative overflow-hidden space-y-6"
    >
      {/* Background subtle radial glow */}
      <div className="absolute top-0 right-1/4 w-96 h-96 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none"></div>

      {/* Header with Title and Filtering Controls */}
      <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Activity className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-emerald-400">
              Telemetría Botánica
            </span>
          </div>
          <h2 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            Progreso Histórico Ambiental
          </h2>
          <p className="text-xs text-zinc-400">
            Monitoreo comparativo de temperatura (°C), humedad relativa (% HR) y déficit de presión (VPD)
          </p>
        </div>

        {/* Controls: Crop Selector, Time Range & Metric Toggles */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Crop Dropdown Selector */}
          {activeCultivations.length > 1 && (
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-2xl text-xs font-semibold">
              <Filter className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <select
                id="crop-env-filter-select"
                value={selectedCropId}
                onChange={(e) => setSelectedCropId(e.target.value)}
                className="bg-transparent text-zinc-200 outline-none cursor-pointer text-xs"
              >
                <option value="all" className="bg-zinc-900 text-zinc-200">
                  Todos los cultivos ({activeCultivations.length})
                </option>
                {activeCultivations.map((crop) => (
                  <option key={crop.id} value={crop.id} className="bg-zinc-900 text-zinc-200">
                    {crop.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Time Range Pills */}
          <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-2xl flex items-center gap-1 text-xs font-semibold">
            {(
              [
                { key: '7d', label: '7D' },
                { key: '14d', label: '14D' },
                { key: '30d', label: '30D' },
                { key: 'all', label: 'Todos' },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTimeRange(t.key)}
                className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                  timeRange === t.key
                    ? 'bg-zinc-800 text-white font-bold shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Metric Toggles */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowTemp(!showTemp)}
              className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                showTemp
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800 opacity-60'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              Temp (°C)
            </button>

            <button
              type="button"
              onClick={() => setShowHumidity(!showHumidity)}
              className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                showHumidity
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800 opacity-60'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              Humedad (%)
            </button>

            <button
              type="button"
              onClick={() => setShowVpd(!showVpd)}
              className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                showVpd
                  ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800 opacity-60'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-purple-400"></span>
              VPD
            </button>
          </div>
        </div>
      </div>

      {/* Summary KPI Pills */}
      {stats.count > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-3.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-0.5">
              Temp. Promedio
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-mono font-bold text-amber-400">{stats.avgTemp}</span>
              <span className="text-xs text-zinc-400 font-mono">°C</span>
            </div>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-3.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-0.5">
              Humedad Promedio
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-mono font-bold text-cyan-400">{stats.avgHum}</span>
              <span className="text-xs text-zinc-400 font-mono">% HR</span>
            </div>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-3.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-0.5">
              VPD Promedio
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-mono font-bold text-purple-400">
                {stats.avgVpd ? stats.avgVpd : '—'}
              </span>
              <span className="text-xs text-zinc-400 font-mono">kPa</span>
            </div>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-3.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block mb-0.5">
              Lecturas Registradas
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-mono font-bold text-white">{stats.count}</span>
              <span className="text-xs text-zinc-400">muestras</span>
            </div>
          </div>
        </div>
      )}

      {/* Chart Canvas or Empty State */}
      {chartData.length === 0 ? (
        <div className="h-64 sm:h-72 flex flex-col items-center justify-center text-center p-8 bg-zinc-900/40 border border-zinc-800/60 rounded-2xl space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-800/70 border border-zinc-700/50 flex items-center justify-center text-zinc-400">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-200">No hay registros ambientales en este rango</p>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-0.5">
              Registra temperatura y humedad en tus cultivos para visualizar las curvas agronómicas históricas.
            </p>
          </div>
          {onOpenEnvModal && (
            <button
              type="button"
              onClick={() => onOpenEnvModal()}
              className="mt-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Registrar Medición</span>
            </button>
          )}
        </div>
      ) : (
        <div className="h-72 sm:h-80 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: showVpd || showHumidity ? 20 : 10, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />

              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 11, fill: '#71717a' }}
                stroke="#3f3f46"
                tickLine={false}
              />

              {/* Left Y Axis: Temperature */}
              <YAxis
                yAxisId="tempAxis"
                orientation="left"
                domain={['auto', 'auto']}
                tick={{ fontSize: 11, fill: '#f59e0b' }}
                stroke="#3f3f46"
                tickLine={false}
                unit="°C"
                hide={!showTemp}
              />

              {/* Right Y Axis: Humidity */}
              <YAxis
                yAxisId="humAxis"
                orientation="right"
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: '#06b6d4' }}
                stroke="#3f3f46"
                tickLine={false}
                unit="%"
                hide={!showHumidity}
              />

              {/* Third Y Axis for VPD if VPD is on and humidity is off */}
              {showVpd && (
                <YAxis
                  yAxisId="vpdAxis"
                  orientation="right"
                  domain={[0, 'auto']}
                  tick={{ fontSize: 11, fill: '#c084fc' }}
                  stroke="#3f3f46"
                  tickLine={false}
                  unit="kPa"
                  hide={!showVpd || showHumidity}
                />
              )}

              <Tooltip content={<CustomTooltip />} />

              <Legend
                wrapperStyle={{ fontSize: '11px', paddingTop: '12px' }}
                iconType="circle"
              />

              {showTemp && (
                <Line
                  yAxisId="tempAxis"
                  type="monotone"
                  name="Temperatura (°C)"
                  dataKey="temperature"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: '#f59e0b', strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#f59e0b', stroke: '#18181b', strokeWidth: 2 }}
                />
              )}

              {showHumidity && (
                <Line
                  yAxisId="humAxis"
                  type="monotone"
                  name="Humedad (% HR)"
                  dataKey="humidity"
                  stroke="#06b6d4"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: '#06b6d4', strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#06b6d4', stroke: '#18181b', strokeWidth: 2 }}
                />
              )}

              {showVpd && (
                <Line
                  yAxisId={showHumidity ? 'tempAxis' : 'vpdAxis'}
                  type="monotone"
                  name="VPD (kPa)"
                  dataKey="vpd"
                  stroke="#a855f7"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: '#a855f7', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#a855f7' }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
