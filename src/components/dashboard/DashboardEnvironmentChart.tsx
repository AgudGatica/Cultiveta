import React, { useState, useMemo, useEffect } from 'react';
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
  Activity,
  Plus,
  TrendingUp,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Sprout,
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
  // Default to the first active cultivation if available
  const [selectedCropId, setSelectedCropId] = useState<string>(() => {
    return activeCultivations.length > 0 ? activeCultivations[0].id : '';
  });

  const [timeRange, setTimeRange] = useState<'7d' | '14d' | '30d' | 'all'>('7d');
  const [showTemp, setShowTemp] = useState(true);
  const [showHumidity, setShowHumidity] = useState(true);
  const [showVpd, setShowVpd] = useState(false);

  // Keep selectedCropId in sync if activeCultivations change and current selection is missing
  useEffect(() => {
    if (activeCultivations.length > 0) {
      const exists = activeCultivations.some((c) => c.id === selectedCropId);
      if (!exists) {
        setSelectedCropId(activeCultivations[0].id);
      }
    }
  }, [activeCultivations, selectedCropId]);

  // Determine current active cultivation
  const activeCrop = useMemo(() => {
    if (activeCultivations.length === 0) return null;
    return activeCultivations.find((c) => c.id === selectedCropId) || activeCultivations[0];
  }, [activeCultivations, selectedCropId]);

  // Filter records specifically for the active cultivation
  const cropRecords = useMemo(() => {
    if (!activeCrop) return [];
    return envRecords
      .filter((r) => r.cultivationId === activeCrop.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [envRecords, activeCrop]);

  // Filter according to time range (last 7 days by default)
  const { filteredRecords, isUsingLatestFallback } = useMemo(() => {
    if (cropRecords.length === 0) {
      return { filteredRecords: [], isUsingLatestFallback: false };
    }

    const now = new Date();
    let daysCutoff = 0;
    if (timeRange === '7d') daysCutoff = 7;
    else if (timeRange === '14d') daysCutoff = 14;
    else if (timeRange === '30d') daysCutoff = 30;

    if (daysCutoff === 0) {
      return { filteredRecords: cropRecords, isUsingLatestFallback: false };
    }

    const cutoffDate = new Date(now.getTime() - daysCutoff * 24 * 60 * 60 * 1000);
    cutoffDate.setHours(0, 0, 0, 0);

    const withinWindow = cropRecords.filter((r) => {
      const recDate = new Date(r.date);
      return recDate >= cutoffDate;
    });

    // If no records fall within strict calendar days window (e.g. historical/demo data gap),
    // fallback gracefully to the most recent days recorded for this active crop
    if (withinWindow.length === 0 && cropRecords.length > 0) {
      const uniqueDates = Array.from(new Set(cropRecords.map((r) => r.date.split('T')[0]))).sort();
      const recentDates = new Set(uniqueDates.slice(-daysCutoff));
      const fallbackRecords = cropRecords.filter((r) => recentDates.has(r.date.split('T')[0]));
      return { filteredRecords: fallbackRecords, isUsingLatestFallback: true };
    }

    return { filteredRecords: withinWindow, isUsingLatestFallback: false };
  }, [cropRecords, timeRange]);

  // Prepare data points for Recharts
  const chartData = useMemo(() => {
    return filteredRecords.map((r, idx) => {
      const parsedDate = new Date(r.date);
      const isDateValid = !isNaN(parsedDate.getTime());

      const shortDay = isDateValid
        ? parsedDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
        : r.date;

      const weekday = isDateValid
        ? parsedDate.toLocaleDateString('es-ES', { weekday: 'short' })
        : '';

      const timeFormatted = r.time
        ? r.time
        : r.createdAt
        ? new Date(r.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        : '';

      return {
        id: r.id || `env_${idx}`,
        rawDate: r.date,
        displayDate: weekday ? `${weekday} ${shortDay}` : shortDay,
        shortDay,
        time: timeFormatted,
        temp: Number(r.temperatureC.toFixed(1)),
        humidity: Math.round(r.humidityPct),
        vpd: r.vpdKPa !== undefined && r.vpdKPa !== null ? Number(r.vpdKPa.toFixed(2)) : undefined,
        cropName: activeCrop?.name || 'Cultivo',
      };
    });
  }, [filteredRecords, activeCrop]);

  // Summary statistics for the active crop in the selected period
  const stats = useMemo(() => {
    if (chartData.length === 0) {
      return {
        avgTemp: null,
        minTemp: null,
        maxTemp: null,
        avgHum: null,
        minHum: null,
        maxHum: null,
        avgVpd: null,
        count: 0,
        isStable: true,
      };
    }

    const temps = chartData.map((d) => d.temp);
    const hums = chartData.map((d) => d.humidity);
    const vpds = chartData.filter((d) => d.vpd !== undefined).map((d) => d.vpd as number);

    const sumTemp = temps.reduce((a, b) => a + b, 0);
    const sumHum = hums.reduce((a, b) => a + b, 0);
    const sumVpd = vpds.reduce((a, b) => a + b, 0);

    const avgTemp = Number((sumTemp / temps.length).toFixed(1));
    const avgHum = Math.round(sumHum / hums.length);
    const avgVpd = vpds.length > 0 ? Number((sumVpd / vpds.length).toFixed(2)) : null;

    const minTemp = Math.min(...temps);
    const maxTemp = Math.max(...temps);
    const minHum = Math.min(...hums);
    const maxHum = Math.max(...hums);

    // Agronomic comfort assessment
    const isStable = avgTemp >= 18 && avgTemp <= 29 && avgHum >= 40 && avgHum <= 70;

    return {
      avgTemp,
      minTemp,
      maxTemp,
      avgHum,
      minHum,
      maxHum,
      avgVpd,
      count: chartData.length,
      isStable,
    };
  }, [chartData]);

  // Custom Dark Glassmorphism Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-zinc-950/95 backdrop-blur-md p-3.5 rounded-2xl border border-zinc-800 shadow-2xl text-xs space-y-2.5 min-w-[210px] pointer-events-none">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
            <div>
              <span className="font-bold text-white font-mono block text-xs">{data.displayDate}</span>
              {data.time && <span className="text-[10px] text-zinc-500 font-mono">{data.time} hs</span>}
            </div>
            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 truncate max-w-[110px]">
              {data.cropName}
            </span>
          </div>

          <div className="space-y-1.5 pt-0.5">
            {showTemp && data.temp !== undefined && (
              <div className="flex items-center justify-between text-amber-400">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                  Temperatura:
                </span>
                <span className="font-mono font-bold text-amber-300">{data.temp} °C</span>
              </div>
            )}

            {showHumidity && data.humidity !== undefined && (
              <div className="flex items-center justify-between text-cyan-400">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                  Humedad:
                </span>
                <span className="font-mono font-bold text-cyan-300">{data.humidity} % HR</span>
              </div>
            )}

            {showVpd && data.vpd !== undefined && (
              <div className="flex items-center justify-between text-purple-400">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <Gauge className="w-3.5 h-3.5 text-purple-400" />
                  Déficit (VPD):
                </span>
                <span className="font-mono font-bold text-purple-300">{data.vpd} kPa</span>
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
      className="bg-[#0F0F0F] text-white rounded-[32px] p-5 sm:p-7 border border-zinc-800 shadow-xl relative overflow-hidden space-y-6"
    >
      {/* Background ambient lighting */}
      <div className="absolute top-0 right-1/4 w-96 h-96 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-10 w-72 h-72 rounded-full bg-cyan-500/5 blur-3xl pointer-events-none" />

      {/* Header section with active crop information & controls */}
      <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Activity className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-emerald-400">
              Telemetría Botánica
            </span>

            {activeCrop && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-zinc-900 text-zinc-300 border border-zinc-800">
                <Sprout className="w-3 h-3 text-emerald-400" />
                Cultivo Activo: <strong className="text-white">{activeCrop.name}</strong>
                {activeCrop.currentStage && (
                  <span className="text-emerald-400/90 ml-0.5">({activeCrop.currentStage})</span>
                )}
              </span>
            )}
          </div>

          <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            Tendencia Ambiental (Últimos 7 Días)
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Curva de temperatura (°C) y humedad relativa (% HR) registrada en &apos;envRecords&apos; para el cultivo activo
          </p>
        </div>

        {/* Controls: Active Crop Dropdown, Time Range & Metric Toggles */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Active Cultivations Selector (when multiple active crops exist) */}
          {activeCultivations.length > 1 && (
            <div className="relative flex items-center bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-2xl text-xs font-semibold hover:border-zinc-700 transition-colors">
              <select
                id="crop-env-filter-select"
                value={selectedCropId}
                onChange={(e) => setSelectedCropId(e.target.value)}
                className="bg-transparent text-zinc-200 outline-none cursor-pointer pr-4 appearance-none text-xs font-medium"
                title="Seleccionar cultivo activo para visualizar tendencia"
              >
                {activeCultivations.map((crop) => (
                  <option key={crop.id} value={crop.id} className="bg-zinc-900 text-zinc-200">
                    🌱 {crop.name} ({crop.currentStage || 'Activo'})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 pointer-events-none" />
            </div>
          )}

          {/* Time Range Pills (7D is default) */}
          <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-2xl flex items-center gap-1 text-xs font-semibold">
            {(
              [
                { key: '7d', label: '7 Días' },
                { key: '14d', label: '14D' },
                { key: '30d', label: '30D' },
                { key: 'all', label: 'Todo' },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTimeRange(t.key)}
                className={`px-3 py-1 rounded-xl transition-all cursor-pointer ${
                  timeRange === t.key
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Metric Visibility Toggles */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowTemp(!showTemp)}
              className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                showTemp
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-xs'
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800 opacity-60'
              }`}
              title="Alternar curva de temperatura"
            >
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Temp (°C)
            </button>

            <button
              type="button"
              onClick={() => setShowHumidity(!showHumidity)}
              className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                showHumidity
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 shadow-xs'
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800 opacity-60'
              }`}
              title="Alternar curva de humedad"
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              Humedad (%)
            </button>

            <button
              type="button"
              onClick={() => setShowVpd(!showVpd)}
              className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                showVpd
                  ? 'bg-purple-500/10 text-purple-300 border-purple-500/30 shadow-xs'
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800 opacity-60'
              }`}
              title="Alternar curva de VPD"
            >
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              VPD
            </button>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards for Active Cultivation */}
      {stats.count > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Average Temperature */}
          <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                Temp. Promedio (7d)
              </span>
              <Thermometer className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-mono font-bold text-amber-400">
                {stats.avgTemp}
              </span>
              <span className="text-xs text-zinc-400 font-mono">°C</span>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono mt-1">
              Rango: {stats.minTemp}°C — {stats.maxTemp}°C
            </div>
          </div>

          {/* Average Humidity */}
          <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                Humedad Promedio (7d)
              </span>
              <Droplets className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-mono font-bold text-cyan-400">
                {stats.avgHum}
              </span>
              <span className="text-xs text-zinc-400 font-mono">% HR</span>
            </div>
            <div className="text-[10px] text-zinc-500 font-mono mt-1">
              Rango: {stats.minHum}% — {stats.maxHum}%
            </div>
          </div>

          {/* Estimated VPD or Stability Status */}
          <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                Estado Agronómico
              </span>
              {stats.isStable ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              )}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span
                className={`text-base sm:text-lg font-bold truncate ${
                  stats.isStable ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {stats.isStable ? 'Ambiente Óptimo' : 'Revisar Clima'}
              </span>
            </div>
            <div className="text-[10px] text-zinc-400 mt-1 truncate">
              {stats.avgVpd ? `VPD prom: ${stats.avgVpd} kPa` : 'Temp/Humedad dentro de rango'}
            </div>
          </div>

          {/* Sample count & quick action */}
          <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                Muestras en Período
              </span>
              <TrendingUp className="w-3.5 h-3.5 text-zinc-400" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-mono font-bold text-white">
                {stats.count}
              </span>
              <span className="text-xs text-zinc-400">lecturas</span>
            </div>
            {onOpenEnvModal && (
              <button
                type="button"
                onClick={() => onOpenEnvModal(activeCrop || undefined)}
                className="mt-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3 stroke-[2.5]" />
                <span>Nueva lectura</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Informational banner when fallback recent dates are shown */}
      {isUsingLatestFallback && chartData.length > 0 && (
        <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            Mostrando las 7 mediciones más recientes registradas para{' '}
            <strong className="text-zinc-200">{activeCrop?.name}</strong>.
          </span>
          <span className="text-[10px] font-mono text-zinc-500">Histórico de cultivo</span>
        </div>
      )}

      {/* Main Recharts Line Chart Container or Empty State */}
      {chartData.length === 0 ? (
        <div className="h-64 sm:h-72 flex flex-col items-center justify-center text-center p-8 bg-zinc-900/40 border border-zinc-800/60 rounded-2xl space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-800/70 border border-zinc-700/50 flex items-center justify-center text-zinc-400">
            <Activity className="w-6 h-6 text-zinc-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-zinc-200">
              No hay mediciones registradas en los últimos 7 días
              {activeCrop ? ` para ${activeCrop.name}` : ''}
            </p>
            <p className="text-xs text-zinc-500 max-w-md mx-auto mt-1">
              Registra temperatura y humedad para visualizar la tendencia ambiental de tu cultivo activo con Recharts.
            </p>
          </div>
          {onOpenEnvModal && (
            <button
              type="button"
              onClick={() => onOpenEnvModal(activeCrop || undefined)}
              className="mt-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Registrar Medición Ambiental</span>
            </button>
          )}
        </div>
      ) : (
        <div className="h-72 sm:h-80 w-full pt-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{
                top: 10,
                right: showHumidity ? 15 : 10,
                left: -15,
                bottom: 0,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />

              {/* X Axis: Display Date */}
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 11, fill: '#71717a' }}
                stroke="#3f3f46"
                tickLine={false}
              />

              {/* Left Y Axis: Temperature (°C) */}
              <YAxis
                yAxisId="tempAxis"
                orientation="left"
                domain={['auto', 'auto']}
                tick={{ fontSize: 11, fill: '#f59e0b' }}
                stroke="#3f3f46"
                tickLine={false}
                unit="°"
                hide={!showTemp}
              />

              {/* Right Y Axis: Humidity (% HR) */}
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

              {/* Third Y Axis for VPD if alone */}
              {showVpd && !showHumidity && (
                <YAxis
                  yAxisId="vpdAxis"
                  orientation="right"
                  domain={[0, 'auto']}
                  tick={{ fontSize: 11, fill: '#c084fc' }}
                  stroke="#3f3f46"
                  tickLine={false}
                  unit="kP"
                />
              )}

              <Tooltip content={<CustomTooltip />} />

              <Legend
                wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                iconType="circle"
              />

              {/* Temperature Trend Line */}
              {showTemp && (
                <Line
                  yAxisId="tempAxis"
                  type="monotone"
                  name="Temperatura (°C)"
                  dataKey="temp"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#f59e0b', stroke: '#18181b', strokeWidth: 2 }}
                />
              )}

              {/* Relative Humidity Trend Line */}
              {showHumidity && (
                <Line
                  yAxisId="humAxis"
                  type="monotone"
                  name="Humedad (% HR)"
                  dataKey="humidity"
                  stroke="#06b6d4"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#06b6d4', strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#06b6d4', stroke: '#18181b', strokeWidth: 2 }}
                />
              )}

              {/* Optional VPD Trend Line */}
              {showVpd && (
                <Line
                  yAxisId={showHumidity ? 'tempAxis' : 'vpdAxis'}
                  type="monotone"
                  name="Déficit VPD (kPa)"
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
