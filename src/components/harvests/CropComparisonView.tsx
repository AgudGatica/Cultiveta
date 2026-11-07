import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Scale,
  Thermometer,
  Droplets,
  Gauge,
  Calendar,
  Zap,
  Award,
  Sparkles,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Star,
  Sprout,
  BarChart3,
  Layers,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  Lightbulb,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { Cultivation, Harvest, EnvironmentRecord, Watering } from '../../types';
import { parseLocalDate } from '../../utils/growthStageUtils';
import { dec } from '../../utils/formatNumber';

interface CropComparisonViewProps {
  cultivations: Cultivation[];
  harvests: Harvest[];
  envRecords: EnvironmentRecord[];
  waterings?: Watering[];
  onBack: () => void;
  initialCropAId?: string;
  initialCropBId?: string;
  onSeedDemoData?: () => void;
}

export const CropComparisonView: React.FC<CropComparisonViewProps> = ({
  cultivations,
  harvests,
  envRecords,
  waterings = [],
  onBack,
  initialCropAId,
  initialCropBId,
  onSeedDemoData,
}) => {
  // 1. Gather all finished cultivations or harvests
  const finishedCultivations = useMemo(() => {
    // Map existing finished cultivations or synthesize from harvest if cultivation is missing
    const list: Cultivation[] = [];
    const seenIds = new Set<string>();

    cultivations.forEach((c) => {
      if (
        c.isFinished ||
        c.currentStage === 'Finalizado' ||
        c.currentStage === 'Cosecha' ||
        c.currentStage === 'Curado' ||
        harvests.some((h) => h.cultivationId === c.id)
      ) {
        list.push(c);
        seenIds.add(c.id);
      }
    });

    // Also include any harvest that might not have a full cultivation record
    harvests.forEach((h) => {
      if (!seenIds.has(h.cultivationId)) {
        list.push({
          id: h.cultivationId,
          userId: h.userId,
          name: h.cultivationName,
          startDate: h.startDate,
          type: 'Indoor',
          plantCount: h.plantCount,
          geneticsName: h.geneticsName,
          seedBank: h.seedBank,
          currentStage: 'Finalizado',
          stageStartDate: h.harvestDate,
          substrate: { type: 'Sustrato orgánico', potVolumeLiters: 11, potType: 'Geotextil' },
          status: 'ESTABLE',
          isFinished: true,
          harvestId: h.id,
          createdAt: h.createdAt,
          updatedAt: h.createdAt,
        });
        seenIds.add(h.cultivationId);
      }
    });

    // Fallback: If less than 2 finished, allow picking ANY cultivation so user can test the view
    if (list.length < 2 && cultivations.length >= 2) {
      return cultivations;
    }

    return list;
  }, [cultivations, harvests]);

  // 2. Select default Crop A and Crop B
  const [cropAId, setCropAId] = useState<string>(() => {
    if (initialCropAId && finishedCultivations.some((c) => c.id === initialCropAId)) {
      return initialCropAId;
    }
    return finishedCultivations[0]?.id || '';
  });

  const [cropBId, setCropBId] = useState<string>(() => {
    if (initialCropBId && finishedCultivations.some((c) => c.id === initialCropBId)) {
      return initialCropBId;
    }
    return finishedCultivations[1]?.id || finishedCultivations[0]?.id || '';
  });

  // Active chart metrics
  const [metricTab, setMetricTab] = useState<'combined' | 'temperature' | 'humidity' | 'vpd'>('combined');
  const [chartViewMode, setChartViewMode] = useState<'cycleDays' | 'weeks'>('cycleDays');

  // Selected Cultivations and their Harvest reports
  const cropA = useMemo(
    () => finishedCultivations.find((c) => c.id === cropAId) || finishedCultivations[0],
    [finishedCultivations, cropAId]
  );
  const cropB = useMemo(
    () => finishedCultivations.find((c) => c.id === cropBId) || finishedCultivations[1] || finishedCultivations[0],
    [finishedCultivations, cropBId]
  );

  const harvestA = useMemo(
    () => harvests.find((h) => h.cultivationId === cropA?.id),
    [harvests, cropA]
  );
  const harvestB = useMemo(
    () => harvests.find((h) => h.cultivationId === cropB?.id),
    [harvests, cropB]
  );

  // Environmental records for each crop
  const envA = useMemo(() => {
    if (!cropA) return [];
    return envRecords
      .filter((r) => r.cultivationId === cropA.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [envRecords, cropA]);

  const envB = useMemo(() => {
    if (!cropB) return [];
    return envRecords
      .filter((r) => r.cultivationId === cropB.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [envRecords, cropB]);

  // Swap Cultivations
  const handleSwapCrops = () => {
    const temp = cropAId;
    setCropAId(cropBId);
    setCropBId(temp);
  };

  // 3. Environmental Averages & KPIs
  const statsA = useMemo(() => {
    if (envA.length === 0) return { avgTemp: null, avgHum: null, avgVpd: null, count: 0 };
    const avgTemp = envA.reduce((s, r) => s + r.temperatureC, 0) / envA.length;
    const avgHum = envA.reduce((s, r) => s + r.humidityPct, 0) / envA.length;
    const withVpd = envA.filter((r) => r.vpdKPa !== undefined);
    const avgVpd = withVpd.length > 0 ? withVpd.reduce((s, r) => s + (r.vpdKPa || 0), 0) / withVpd.length : null;
    return {
      avgTemp: Number(avgTemp.toFixed(1)),
      avgHum: Math.round(avgHum),
      avgVpd: avgVpd ? Number(avgVpd.toFixed(2)) : null,
      count: envA.length,
    };
  }, [envA]);

  const statsB = useMemo(() => {
    if (envB.length === 0) return { avgTemp: null, avgHum: null, avgVpd: null, count: 0 };
    const avgTemp = envB.reduce((s, r) => s + r.temperatureC, 0) / envB.length;
    const avgHum = envB.reduce((s, r) => s + r.humidityPct, 0) / envB.length;
    const withVpd = envB.filter((r) => r.vpdKPa !== undefined);
    const avgVpd = withVpd.length > 0 ? withVpd.reduce((s, r) => s + (r.vpdKPa || 0), 0) / withVpd.length : null;
    return {
      avgTemp: Number(avgTemp.toFixed(1)),
      avgHum: Math.round(avgHum),
      avgVpd: avgVpd ? Number(avgVpd.toFixed(2)) : null,
      count: envB.length,
    };
  }, [envB]);

  // Yield & Efficiency Metrics
  const yieldA = useMemo(() => {
    const dryGrams = harvestA?.finalDryWeightGrams ?? 0;
    const plants = cropA?.plantCount || harvestA?.plantCount || 1;
    const gramsPerPlant = harvestA?.gramsPerPlant ?? (plants > 0 ? Number((dryGrams / plants).toFixed(1)) : 0);
    const totalDays = harvestA?.totalDays ?? (cropA ? Math.max(1, Math.round((new Date().getTime() - (parseLocalDate(cropA.startDate) || new Date(cropA.startDate)).getTime()) / (1000 * 3600 * 24))) : 0);
    const watts = cropA?.lighting?.usedWatts || cropA?.lighting?.nominalWatts || 0;
    const gramsPerWatt = watts > 0 && dryGrams > 0 ? Number((dryGrams / watts).toFixed(2)) : null;
    const gramsPerDay = totalDays > 0 && dryGrams > 0 ? Number((dryGrams / totalDays).toFixed(2)) : null;

    return {
      dryGrams,
      plants,
      gramsPerPlant,
      totalDays,
      watts,
      gramsPerWatt,
      gramsPerDay,
      rating: harvestA?.rating1To5 || 5,
    };
  }, [cropA, harvestA]);

  const yieldB = useMemo(() => {
    const dryGrams = harvestB?.finalDryWeightGrams ?? 0;
    const plants = cropB?.plantCount || harvestB?.plantCount || 1;
    const gramsPerPlant = harvestB?.gramsPerPlant ?? (plants > 0 ? Number((dryGrams / plants).toFixed(1)) : 0);
    const totalDays = harvestB?.totalDays ?? (cropB ? Math.max(1, Math.round((new Date().getTime() - (parseLocalDate(cropB.startDate) || new Date(cropB.startDate)).getTime()) / (1000 * 3600 * 24))) : 0);
    const watts = cropB?.lighting?.usedWatts || cropB?.lighting?.nominalWatts || 0;
    const gramsPerWatt = watts > 0 && dryGrams > 0 ? Number((dryGrams / watts).toFixed(2)) : null;
    const gramsPerDay = totalDays > 0 && dryGrams > 0 ? Number((dryGrams / totalDays).toFixed(2)) : null;

    return {
      dryGrams,
      plants,
      gramsPerPlant,
      totalDays,
      watts,
      gramsPerWatt,
      gramsPerDay,
      rating: harvestB?.rating1To5 || 5,
    };
  }, [cropB, harvestB]);

  // Differential Deltas
  const yieldDeltaPct = useMemo(() => {
    if (yieldA.dryGrams <= 0 && yieldB.dryGrams <= 0) return 0;
    if (yieldA.dryGrams <= 0) return 100;
    return Number((((yieldB.dryGrams - yieldA.dryGrams) / yieldA.dryGrams) * 100).toFixed(1));
  }, [yieldA, yieldB]);

  const gramsPerPlantDeltaPct = useMemo(() => {
    if (yieldA.gramsPerPlant <= 0) return 0;
    return Number((((yieldB.gramsPerPlant - yieldA.gramsPerPlant) / yieldA.gramsPerPlant) * 100).toFixed(1));
  }, [yieldA, yieldB]);

  // 4. Construct Superimposed Environmental Data by Normalized Cycle Day
  // This lines up Day 1 of Crop A with Day 1 of Crop B, allowing true agronomic lifecycle comparison
  const superimposedChartData = useMemo(() => {
    if (!cropA || !cropB) return [];

    const startA = new Date(cropA.startDate).getTime();
    const startB = new Date(cropB.startDate).getTime();

    // Group records by day of cycle
    const dayMap = new Map<
      number,
      {
        tempA?: number;
        humA?: number;
        vpdA?: number;
        tempB?: number;
        humB?: number;
        vpdB?: number;
      }
    >();

    // Process Crop A
    envA.forEach((rec) => {
      const recTime = new Date(rec.date).getTime();
      const day = Math.max(1, Math.round((recTime - startA) / (1000 * 3600 * 24)) + 1);
      const existing = dayMap.get(day) || {};
      existing.tempA = rec.temperatureC;
      existing.humA = rec.humidityPct;
      if (rec.vpdKPa !== undefined) existing.vpdA = rec.vpdKPa;
      dayMap.set(day, existing);
    });

    // Process Crop B
    envB.forEach((rec) => {
      const recTime = new Date(rec.date).getTime();
      const day = Math.max(1, Math.round((recTime - startB) / (1000 * 3600 * 24)) + 1);
      const existing = dayMap.get(day) || {};
      existing.tempB = rec.temperatureC;
      existing.humB = rec.humidityPct;
      if (rec.vpdKPa !== undefined) existing.vpdB = rec.vpdKPa;
      dayMap.set(day, existing);
    });

    // Sort days
    const sortedDays = Array.from(dayMap.keys()).sort((a, b) => a - b);

    if (chartViewMode === 'weeks') {
      // Group into weeks (Semana 1, Semana 2, etc.)
      const weekMap = new Map<
        number,
        {
          tempsA: number[];
          humsA: number[];
          vpdsA: number[];
          tempsB: number[];
          humsB: number[];
          vpdsB: number[];
        }
      >();

      sortedDays.forEach((d) => {
        const week = Math.ceil(d / 7);
        const cur = weekMap.get(week) || {
          tempsA: [],
          humsA: [],
          vpdsA: [],
          tempsB: [],
          humsB: [],
          vpdsB: [],
        };
        const entry = dayMap.get(d)!;
        if (entry.tempA !== undefined) cur.tempsA.push(entry.tempA);
        if (entry.humA !== undefined) cur.humsA.push(entry.humA);
        if (entry.vpdA !== undefined) cur.vpdsA.push(entry.vpdA);
        if (entry.tempB !== undefined) cur.tempsB.push(entry.tempB);
        if (entry.humB !== undefined) cur.humsB.push(entry.humB);
        if (entry.vpdB !== undefined) cur.vpdsB.push(entry.vpdB);
        weekMap.set(week, cur);
      });

      return Array.from(weekMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([week, vals]) => ({
          label: `Sem. ${week}`,
          day: week * 7,
          tempA: vals.tempsA.length ? Number((vals.tempsA.reduce((a, b) => a + b, 0) / vals.tempsA.length).toFixed(1)) : undefined,
          humA: vals.humsA.length ? Math.round(vals.humsA.reduce((a, b) => a + b, 0) / vals.humsA.length) : undefined,
          vpdA: vals.vpdsA.length ? Number((vals.vpdsA.reduce((a, b) => a + b, 0) / vals.vpdsA.length).toFixed(2)) : undefined,
          tempB: vals.tempsB.length ? Number((vals.tempsB.reduce((a, b) => a + b, 0) / vals.tempsB.length).toFixed(1)) : undefined,
          humB: vals.humsB.length ? Math.round(vals.humsB.reduce((a, b) => a + b, 0) / vals.humsB.length) : undefined,
          vpdB: vals.vpdsB.length ? Number((vals.vpdsB.reduce((a, b) => a + b, 0) / vals.vpdsB.length).toFixed(2)) : undefined,
        }));
    }

    return sortedDays.map((d) => {
      const item = dayMap.get(d)!;
      return {
        label: `Día ${d}`,
        day: d,
        tempA: item.tempA !== undefined ? Number(item.tempA.toFixed(1)) : undefined,
        humA: item.humA !== undefined ? Math.round(item.humA) : undefined,
        vpdA: item.vpdA !== undefined ? Number(item.vpdA.toFixed(2)) : undefined,
        tempB: item.tempB !== undefined ? Number(item.tempB.toFixed(1)) : undefined,
        humB: item.humB !== undefined ? Math.round(item.humB) : undefined,
        vpdB: item.vpdB !== undefined ? Number(item.vpdB.toFixed(2)) : undefined,
      };
    });
  }, [cropA, cropB, envA, envB, chartViewMode]);

  // 5. Yield Comparison Bar Data
  const yieldComparisonBarData = useMemo(() => {
    return [
      {
        metric: 'Peso seco total',
        unit: 'g',
        [cropA?.name || 'Cultivo A']: yieldA.dryGrams,
        [cropB?.name || 'Cultivo B']: yieldB.dryGrams,
      },
      {
        metric: 'Rendimiento por planta',
        unit: 'g/planta',
        [cropA?.name || 'Cultivo A']: yieldA.gramsPerPlant,
        [cropB?.name || 'Cultivo B']: yieldB.gramsPerPlant,
      },
      {
        metric: 'Duración del ciclo',
        unit: 'días',
        [cropA?.name || 'Cultivo A']: yieldA.totalDays,
        [cropB?.name || 'Cultivo B']: yieldB.totalDays,
      },
      ...(yieldA.gramsPerWatt && yieldB.gramsPerWatt
        ? [
            {
              metric: 'Eficiencia lumínica (x100)',
              unit: 'g/100W',
              [cropA?.name || 'Cultivo A']: Number((yieldA.gramsPerWatt * 100).toFixed(1)),
              [cropB?.name || 'Cultivo B']: Number((yieldB.gramsPerWatt * 100).toFixed(1)),
            },
          ]
        : []),
    ];
  }, [cropA, cropB, yieldA, yieldB]);

  // Custom Superimposed Tooltip
  const CustomSuperimposedTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-surface backdrop-blur-md p-4 rounded-2xl border border-line shadow-2xl text-xs space-y-3 min-w-[240px]">
          <div className="border-b border-line pb-2 flex items-center justify-between">
            <span className="font-bold text-ink uppercase tracking-wider">{label}</span>
            <span className="text-[11px] text-ink-muted ">Día normalizado</span>
          </div>

          {/* Crop A Section */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-ok-ink">
              <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block"></span>
              <span className="truncate max-w-[180px]">{cropA?.name}</span>
            </div>
            <div className="pl-4 grid grid-cols-2 gap-x-2 text-xs text-ink">
              {payload.find((p: any) => p.dataKey === 'tempA') && (
                <div>Temp: <strong className="text-warn-ink">{dec(payload.find((p: any) => p.dataKey === 'tempA').value, 1)} °C</strong></div>
              )}
              {payload.find((p: any) => p.dataKey === 'humA') && (
                <div>Hum: <strong className="text-brand">{dec(payload.find((p: any) => p.dataKey === 'humA').value, 1)} %</strong></div>
              )}
              {payload.find((p: any) => p.dataKey === 'vpdA') && (
                <div>VPD: <strong className="text-brand">{dec(payload.find((p: any) => p.dataKey === 'vpdA').value, 2)} kPa</strong></div>
              )}
            </div>
          </div>

          {/* Crop B Section */}
          <div className="space-y-1 pt-1 border-t border-line">
            <div className="flex items-center gap-1.5 font-bold text-brand">
              <span className="w-2.5 h-2.5 rounded-full bg-brand inline-block"></span>
              <span className="truncate max-w-[180px]">{cropB?.name}</span>
            </div>
            <div className="pl-4 grid grid-cols-2 gap-x-2 text-xs text-ink">
              {payload.find((p: any) => p.dataKey === 'tempB') && (
                <div>Temp: <strong className="text-warn-ink">{dec(payload.find((p: any) => p.dataKey === 'tempB').value, 1)} °C</strong></div>
              )}
              {payload.find((p: any) => p.dataKey === 'humB') && (
                <div>Hum: <strong className="text-error">{dec(payload.find((p: any) => p.dataKey === 'humB').value, 1)} %</strong></div>
              )}
              {payload.find((p: any) => p.dataKey === 'vpdB') && (
                <div>VPD: <strong className="text-brand">{dec(payload.find((p: any) => p.dataKey === 'vpdB').value, 2)} kPa</strong></div>
              )}
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // If fewer than 2 finished crops exist
  if (finishedCultivations.length < 2) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto py-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 min-w-11 inline-flex items-center justify-center p-2.5 rounded-2xl bg-surface border border-line text-ink-muted hover:text-ink hover:bg-track transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-ink">Comparador de Cosechas</h1>
            <p className="text-xs text-ink-muted">Análisis comparativo de rendimiento y condiciones agronómicas</p>
          </div>
        </div>

        <div className="bg-card rounded-[32px] p-8 sm:p-12 border border-line text-center space-y-4 shadow-xl">
          <div className="w-16 h-16 rounded-3xl bg-surface border border-line flex items-center justify-center text-ok-ink mx-auto shadow-inner">
            <Scale className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-ink">Se requieren al menos 2 cultivos para comparar</h3>
            <p className="text-xs text-ink-muted max-w-md mx-auto leading-relaxed">
              El comparador superpone las curvas climáticas y el rendimiento seco de dos ciclos finalizados para identificar qué variables generaron mayor producción.
            </p>
          </div>

          {onSeedDemoData && (
            <div className="pt-2">
              <button
                type="button"
                onClick={onSeedDemoData}
                className="px-5 py-3 rounded-2xl bg-primary hover:bg-primary text-ink font-bold text-xs transition-all shadow-lg inline-flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 fill-black" />
                <span>Cargar cosechas de demostración</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16 animate-in fade-in">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-line">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 min-w-11 inline-flex items-center justify-center p-2.5 rounded-2xl bg-surface border border-line text-ink-muted hover:text-ink hover:bg-track transition-colors cursor-pointer"
            title="Volver a cosechas"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="p-1 rounded-md bg-ok-bg text-ok-ink border border-ok-line">
                <Scale className="w-3.5 h-3.5" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white cultiveta-on-gradient">
                Comparador
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-white cultiveta-on-gradient tracking-tight flex items-center gap-2">
              Comparador de cosechas
            </h1>
          </div>
        </div>

        {/* Swap Button */}
        <button
          type="button"
          onClick={handleSwapCrops}
          className="min-h-11 px-4 py-2.5 rounded-2xl bg-surface hover:bg-track border border-line text-ink hover:text-ink text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs"
          title="Intercambiar Cultivo A y Cultivo B"
        >
          <ArrowRightLeft className="w-4 h-4 text-ink-muted" />
          <span>Intercambiar (A ⇄ B)</span>
        </button>
      </div>

      {/* Selectors Bar: Crop A vs Crop B */}
      <div className="grid grid-cols-1 lg:grid-cols-11 gap-4 items-center">
        {/* Card Crop A (Emerald Theme) */}
        <div className="lg:col-span-5 bg-card border-2 border-ok-line rounded-[28px] p-5 space-y-3 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-primary shadow-xs"></span>
              <span className="text-xs font-bold uppercase tracking-wider text-ok-ink">
                Cultivo A (Referencia)
              </span>
            </div>
            {harvestA && (
              <div className="flex items-center gap-1 text-warn-ink">
                {[...Array(harvestA.rating1To5 || 5)].map((_, i) => (
                  <Star key={i} className="w-3 h-3 fill-warn-line" />
                ))}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="select-crop-a" className="sr-only">Seleccionar cultivo A</label>
            <select
              id="select-crop-a"
              value={cropAId}
              onChange={(e) => setCropAId(e.target.value)}
              className="w-full bg-surface border border-line rounded-2xl p-3 text-sm font-bold text-ink outline-none cursor-pointer focus:border-ok-line transition-colors"
            >
              {finishedCultivations.map((c) => (
                <option key={c.id} value={c.id} disabled={c.id === cropBId}>
                  {c.name} {c.geneticsName ? `(${c.geneticsName})` : ''} {c.id === cropBId ? '— [En B]' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Badges Crop A */}
          <div className="flex flex-wrap gap-2 text-xs text-ink-muted pt-1">
            <span className="px-2.5 py-1 rounded-xl bg-surface border border-line text-ink">
              {cropA?.geneticsName ||'Genética estándar'}
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-surface border border-line text-ink">
              {yieldA.totalDays} días
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-surface border border-line text-ok-ink font-bold">
              {dec(yieldA.dryGrams, 1)} g secos
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-surface border border-line text-ink">
              {cropA?.substrate?.type ||'Sustrato'} ({cropA?.substrate?.potVolumeLiters || 11}L)
            </span>
          </div>
        </div>

        {/* VS Divider */}
        <div className="lg:col-span-1 flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-surface border border-line flex items-center justify-center font-extrabold text-xs text-ink shadow-xl">
            VS
          </div>
        </div>

        {/* Card Crop B (Violet Theme) */}
        <div className="lg:col-span-5 bg-card border-2 border-chip-line rounded-[28px] p-5 space-y-3 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-brand shadow-xs"></span>
              <span className="text-xs font-bold uppercase tracking-wider text-brand">
                Cultivo B (Contraste)
              </span>
            </div>
            {harvestB && (
              <div className="flex items-center gap-1 text-warn-ink">
                {[...Array(harvestB.rating1To5 || 5)].map((_, i) => (
                  <Star key={i} className="w-3 h-3 fill-warn-line" />
                ))}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="select-crop-b" className="sr-only">Seleccionar cultivo B</label>
            <select
              id="select-crop-b"
              value={cropBId}
              onChange={(e) => setCropBId(e.target.value)}
              className="w-full bg-surface border border-line rounded-2xl p-3 text-sm font-bold text-ink outline-none cursor-pointer focus:border-chip-line transition-colors"
            >
              {finishedCultivations.map((c) => (
                <option key={c.id} value={c.id} disabled={c.id === cropAId}>
                  {c.name} {c.geneticsName ? `(${c.geneticsName})` : ''} {c.id === cropAId ? '— [En A]' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Badges Crop B */}
          <div className="flex flex-wrap gap-2 text-xs text-ink-muted pt-1">
            <span className="px-2.5 py-1 rounded-xl bg-surface border border-line text-ink">
              {cropB?.geneticsName ||'Genética estándar'}
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-surface border border-line text-ink">
              {yieldB.totalDays} días
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-surface border border-line text-brand font-bold">
              {dec(yieldB.dryGrams, 1)} g secos
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-surface border border-line text-ink">
              {cropB?.substrate?.type ||'Sustrato'} ({cropB?.substrate?.potVolumeLiters || 11}L)
            </span>
          </div>
        </div>
      </div>

      {/* Differential Performance KPI Matrix */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Rendimiento Total */}
        <div className="bg-card rounded-3xl p-5 border border-line shadow-md space-y-2">
          <div className="flex items-center justify-between text-ink-muted text-xs font-semibold">
            <span>Rendimiento total</span>
            <Award className="w-4 h-4 text-warn-ink" />
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <div className="space-y-0.5">
              <div className="text-xs text-ink-muted flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary"></span>
                <span>A:</span>
                <strong className="text-ink ">{dec(yieldA.dryGrams, 1)} g</strong>
              </div>
              <div className="text-xs text-ink-muted flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand"></span>
                <span>B:</span>
                <strong className="text-ink ">{dec(yieldB.dryGrams, 1)} g</strong>
              </div>
            </div>

            <div
              className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 ${
                yieldDeltaPct > 0
                  ? 'bg-icon-bg text-brand border border-chip-line'
                  : yieldDeltaPct < 0
                  ? 'bg-ok-bg text-ok-ink border border-ok-line'
                  : 'bg-track text-ink-muted'
              }`}
            >
              {yieldDeltaPct > 0 ? (
                <>
                  <TrendingUp className="w-3 h-3" />
                  <span>+{dec(yieldDeltaPct, 1)} % B</span>
                </>
              ) : yieldDeltaPct < 0 ? (
                <>
                  <TrendingUp className="w-3 h-3" />
                  <span>+{dec(Math.abs(yieldDeltaPct), 1)} % A</span>
                </>
              ) : (
                <span>Igual</span>
              )}
            </div>
          </div>
        </div>

        {/* KPI 2: Rendimiento por Planta */}
        <div className="bg-card rounded-3xl p-5 border border-line shadow-md space-y-2">
          <div className="flex items-center justify-between text-ink-muted text-xs font-semibold">
            <span>Rendimiento / Planta</span>
            <Sprout className="w-4 h-4 text-ok-ink" />
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <div className="space-y-0.5">
              <div className="text-xs text-ink-muted flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary"></span>
                <span>A:</span>
                <strong className="text-ink ">{dec(yieldA.gramsPerPlant, 1)} g</strong>
              </div>
              <div className="text-xs text-ink-muted flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand"></span>
                <span>B:</span>
                <strong className="text-ink ">{dec(yieldB.gramsPerPlant, 1)} g</strong>
              </div>
            </div>

            <div
              className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 ${
                gramsPerPlantDeltaPct > 0
                  ? 'bg-icon-bg text-brand border border-chip-line'
                  : gramsPerPlantDeltaPct < 0
                  ? 'bg-ok-bg text-ok-ink border border-ok-line'
                  : 'bg-track text-ink-muted'
              }`}
            >
              {gramsPerPlantDeltaPct > 0 ? (
                <span>+{dec(gramsPerPlantDeltaPct, 1)} % B</span>
              ) : gramsPerPlantDeltaPct < 0 ? (
                <span>+{dec(Math.abs(gramsPerPlantDeltaPct), 1)} % A</span>
              ) : (
                <span>=</span>
              )}
            </div>
          </div>
        </div>

        {/* KPI 3: Eficiencia Lumínica (g/W) */}
        <div className="bg-card rounded-3xl p-5 border border-line shadow-md space-y-2">
          <div className="flex items-center justify-between text-ink-muted text-xs font-semibold">
            <span>Eficiencia lumínica</span>
            <Zap className="w-4 h-4 text-warn-ink" />
          </div>

          <div className="space-y-0.5">
            <div className="text-xs text-ink-muted flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary"></span>
                <span>A ({yieldA.watts || '?'}W):</span>
              </span>
              <strong className="text-ink ">{yieldA.gramsPerWatt ? `${dec(yieldA.gramsPerWatt)} g/W` : '—'}</strong>
            </div>
            <div className="text-xs text-ink-muted flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand"></span>
                <span>B ({yieldB.watts || '?'}W):</span>
              </span>
              <strong className="text-ink ">{yieldB.gramsPerWatt ? `${dec(yieldB.gramsPerWatt)} g/W` : '—'}</strong>
            </div>
          </div>
        </div>

        {/* KPI 4: Duración Total y Velocidad */}
        <div className="bg-card rounded-3xl p-5 border border-line shadow-md space-y-2">
          <div className="flex items-center justify-between text-ink-muted text-xs font-semibold">
            <span>Velocidad de producción</span>
            <Clock className="w-4 h-4 text-brand" />
          </div>

          <div className="space-y-0.5">
            <div className="text-xs text-ink-muted flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary"></span>
                <span>A ({yieldA.totalDays}d):</span>
              </span>
              <strong className="text-ink ">{yieldA.gramsPerDay ? `${dec(yieldA.gramsPerDay)} g/día` : '—'}</strong>
            </div>
            <div className="text-xs text-ink-muted flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand"></span>
                <span>B ({yieldB.totalDays}d):</span>
              </span>
              <strong className="text-ink ">{yieldB.gramsPerDay ? `${dec(yieldB.gramsPerDay)} g/día` : '—'}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Main Historical Superimposed Environmental Chart Card */}
      <div
        id="crop-comparison-superimposed-chart"
        className="bg-card text-ink rounded-[32px] p-6 sm:p-8 border border-line shadow-xl space-y-6 relative overflow-hidden"
      >
        {/* Section Header with Mode Toggles */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-line">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-xl bg-icon-bg text-brand border border-chip-line">
                <BarChart3 className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand">
                Curvas superpuestas
              </span>
            </div>
            <h2 className="text-xl font-extrabold text-ink tracking-tight">
              Condiciones ambientales superpuestas
            </h2>
            <p className="text-xs text-ink-muted">
              Contraste de curvas a lo largo del ciclo vital (Día 1 a N) entre {cropA?.name} y {cropB?.name}
            </p>
          </div>

          {/* Controls: Metric Tabs & View Mode (Days vs Weeks) */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            {/* View Mode: Days or Weeks */}
            <div className="bg-surface border border-line p-1 rounded-2xl flex flex-wrap items-center gap-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setChartViewMode('cycleDays')}
                className={`min-h-10 px-3 py-1 rounded-xl transition-all cursor-pointer ${
                  chartViewMode === 'cycleDays'
                    ? 'bg-track text-ink font-bold'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                Por día
              </button>
              <button
                type="button"
                onClick={() => setChartViewMode('weeks')}
                className={`min-h-10 px-3 py-1 rounded-xl transition-all cursor-pointer ${
                  chartViewMode === 'weeks'
                    ? 'bg-track text-ink font-bold'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                Por semana
              </button>
            </div>

            {/* Metric Tab Pills */}
            <div className="bg-surface border border-line p-1 rounded-2xl flex flex-wrap items-center gap-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setMetricTab('combined')}
                className={`min-h-10 px-3 py-1 rounded-xl transition-all cursor-pointer ${
                  metricTab === 'combined'
                    ? 'bg-track text-ink font-bold shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                Combinado
              </button>
              <button
                type="button"
                onClick={() => setMetricTab('temperature')}
                className={`min-h-10 px-3 py-1 rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                  metricTab === 'temperature'
                    ? 'bg-warn-bg text-warn-ink font-bold border border-warn-line'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Thermometer className="w-3 h-3" />
                <span>Temperatura</span>
              </button>
              <button
                type="button"
                onClick={() => setMetricTab('humidity')}
                className={`min-h-10 px-3 py-1 rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                  metricTab === 'humidity'
                    ? 'bg-icon-bg text-brand font-bold border border-chip-line'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Droplets className="w-3 h-3" />
                <span>Humedad</span>
              </button>
              <button
                type="button"
                onClick={() => setMetricTab('vpd')}
                className={`min-h-10 px-3 py-1 rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                  metricTab === 'vpd'
                    ? 'bg-icon-bg text-brand font-bold border border-chip-line'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Gauge className="w-3 h-3" />
                <span>VPD</span>
              </button>
            </div>
          </div>
        </div>

        {/* Environmental Summary Comparison Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-surface border border-line rounded-2xl p-3">
            <span className="text-[11px] uppercase text-ink-muted block mb-0.5">Temp. Promedio A</span>
            <span className="text-base font-bold text-ok-ink">{statsA.avgTemp ? `${dec(statsA.avgTemp, 1)} °C` : '—'}</span>
          </div>

          <div className="bg-surface border border-line rounded-2xl p-3">
            <span className="text-[11px] uppercase text-ink-muted block mb-0.5">Temp. Promedio B</span>
            <span className="text-base font-bold text-brand">{statsB.avgTemp ? `${dec(statsB.avgTemp, 1)} °C` : '—'}</span>
          </div>

          <div className="bg-surface border border-line rounded-2xl p-3">
            <span className="text-[11px] uppercase text-ink-muted block mb-0.5">Humedad media A</span>
            <span className="text-base font-bold text-ok-ink">{statsA.avgHum ? `${statsA.avgHum} %` : '—'}</span>
          </div>

          <div className="bg-surface border border-line rounded-2xl p-3">
            <span className="text-[11px] uppercase text-ink-muted block mb-0.5">Humedad media B</span>
            <span className="text-base font-bold text-brand">{statsB.avgHum ? `${statsB.avgHum} %` : '—'}</span>
          </div>

          <div className="bg-surface border border-line rounded-2xl p-3">
            <span className="text-[11px] uppercase text-ink-muted block mb-0.5">VPD Medio A</span>
            <span className="text-base font-bold text-ok-ink">{statsA.avgVpd ? `${dec(statsA.avgVpd)} kPa` : '—'}</span>
          </div>

          <div className="bg-surface border border-line rounded-2xl p-3">
            <span className="text-[11px] uppercase text-ink-muted block mb-0.5">VPD Medio B</span>
            <span className="text-base font-bold text-brand">{statsB.avgVpd ? `${dec(statsB.avgVpd)} kPa` : '—'}</span>
          </div>
        </div>

        {/* Superimposed Line Chart Container */}
        {superimposedChartData.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-8 bg-surface border border-line rounded-2xl">
            <AlertCircle className="w-8 h-8 text-ink-muted mb-2" />
            <p className="text-sm font-bold text-ink">Sin lecturas climáticas suficientes para superponer</p>
            <p className="text-xs text-ink-muted max-w-sm mt-0.5">
              Uno o ambos cultivos no cuentan con registros ambientales históricos en sus respectivas fechas.
            </p>
          </div>
        ) : (
          <div className="h-80 sm:h-96 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={superimposedChartData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />

                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#71717a' }}
                  stroke="#3f3f46"
                  tickLine={false}
                />

                {/* Left Y Axis */}
                <YAxis
                  yAxisId="leftAxis"
                  orientation="left"
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 11, fill: '#a1a1aa' }}
                  stroke="#3f3f46"
                  tickLine={false}
                  unit={metricTab === 'humidity' ? '%' : metricTab === 'vpd' ? 'kPa' : '°C'}
                />

                {/* Right Y Axis if in Combined Mode (Humidity %) */}
                {metricTab === 'combined' && (
                  <YAxis
                    yAxisId="rightAxis"
                    orientation="right"
                    domain={[20, 85]}
                    tick={{ fontSize: 11, fill: '#38bdf8' }}
                    stroke="#3f3f46"
                    tickLine={false}
                    unit="%"
                  />
                )}

                <Tooltip content={<CustomSuperimposedTooltip />} />

                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '16px' }}
                  iconType="circle"
                  formatter={(value) => <span style={{ color: 'var(--color-ink)' }}>{value}</span>}
                />

                {/* Lines according to active metricTab */}
                {metricTab === 'combined' && (
                  <>
                    <Line
                      yAxisId="leftAxis"
                      type="monotone"
                      name={`Temp. [A] ${cropA?.name}`}
                      dataKey="tempA"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: '#10b981' }}
                    />
                    <Line
                      yAxisId="leftAxis"
                      type="monotone"
                      name={`Temp. [B] ${cropB?.name}`}
                      dataKey="tempB"
                      stroke="#8b5cf6"
                      strokeWidth={2.5}
                      strokeDasharray="5 5"
                      dot={{ r: 3, fill: '#8b5cf6', strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: '#8b5cf6' }}
                    />
                    <Line
                      yAxisId="rightAxis"
                      type="monotone"
                      name={`Hum. [A] ${cropA?.name}`}
                      dataKey="humA"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      dot={{ r: 2.5, fill: '#06b6d4', strokeWidth: 0 }}
                    />
                    <Line
                      yAxisId="rightAxis"
                      type="monotone"
                      name={`Hum. [B] ${cropB?.name}`}
                      dataKey="humB"
                      stroke="#ec4899"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      dot={{ r: 2.5, fill: '#ec4899', strokeWidth: 0 }}
                    />
                  </>
                )}

                {metricTab === 'temperature' && (
                  <>
                    {/* Agronomic benchmark bands */}
                    <ReferenceLine yAxisId="leftAxis" y={24} stroke="#22c55e" strokeDasharray="3 3" label={{ value: 'Óptimo 24°C', fill: '#22c55e', fontSize: 10 }} />
                    <Line
                      yAxisId="leftAxis"
                      type="monotone"
                      name={`[A] ${cropA?.name} (°C)`}
                      dataKey="tempA"
                      stroke="#10b981"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#10b981' }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      yAxisId="leftAxis"
                      type="monotone"
                      name={`[B] ${cropB?.name} (°C)`}
                      dataKey="tempB"
                      stroke="#8b5cf6"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#8b5cf6' }}
                      activeDot={{ r: 6 }}
                    />
                  </>
                )}

                {metricTab === 'humidity' && (
                  <>
                    <ReferenceLine yAxisId="leftAxis" y={50} stroke="#06b6d4" strokeDasharray="3 3" label={{ value: 'Media Flora 50%', fill: '#06b6d4', fontSize: 10 }} />
                    <Line
                      yAxisId="leftAxis"
                      type="monotone"
                      name={`[A] ${cropA?.name} (% HR)`}
                      dataKey="humA"
                      stroke="#06b6d4"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#06b6d4' }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      yAxisId="leftAxis"
                      type="monotone"
                      name={`[B] ${cropB?.name} (% HR)`}
                      dataKey="humB"
                      stroke="#ec4899"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#ec4899' }}
                      activeDot={{ r: 6 }}
                    />
                  </>
                )}

                {metricTab === 'vpd' && (
                  <>
                    <ReferenceLine yAxisId="leftAxis" y={1.2} stroke="#a855f7" strokeDasharray="3 3" label={{ value: 'Target Flora 1.2 kPa', fill: '#a855f7', fontSize: 10 }} />
                    <Line
                      yAxisId="leftAxis"
                      type="monotone"
                      name={`[A] ${cropA?.name} (VPD)`}
                      dataKey="vpdA"
                      stroke="#10b981"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#10b981' }}
                    />
                    <Line
                      yAxisId="leftAxis"
                      type="monotone"
                      name={`[B] ${cropB?.name} (VPD)`}
                      dataKey="vpdB"
                      stroke="#8b5cf6"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#8b5cf6' }}
                    />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Yield Side-by-Side Comparison Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Yield Bar Chart (7 cols) */}
        <div className="lg:col-span-7 bg-card rounded-[32px] p-6 sm:p-8 border border-line shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-line">
            <div>
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-ok-ink" />
                <span>Comparativa de rendimiento y biomasa</span>
              </h3>
              <p className="text-xs text-ink-muted">Contraste directo de peso seco y duración</p>
            </div>
            <span className="text-xs text-ink-muted">Valores finales</span>
          </div>

          <div className="h-64 sm:h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yieldComparisonBarData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="metric" tick={{ fontSize: 11, fill: '#a1a1aa' }} stroke="#3f3f46" tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#71717a' }} stroke="#3f3f46" tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#09090b',
                    borderColor: '#27272a',
                    borderRadius: '16px',
                    fontSize: '12px',
                    color: '#fff',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} formatter={(value) => <span style={{ color: 'var(--color-ink)' }}>{value}</span>} />
                <Bar dataKey={cropA?.name || 'Cultivo A'} fill="#10b981" radius={[8, 8, 0, 0]} maxBarSize={45} />
                <Bar dataKey={cropB?.name || 'Cultivo B'} fill="#8b5cf6" radius={[8, 8, 0, 0]} maxBarSize={45} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Agronomic Technical Specs Matrix (5 cols) */}
        <div className="lg:col-span-5 bg-card rounded-[32px] p-6 sm:p-8 border border-line shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-line">
            <div>
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand" />
                <span>Parámetros de cultivo</span>
              </h3>
              <p className="text-xs text-ink-muted">Diferencias estructurales entre montajes</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            {/* Row 1: Genetics & Seedbank */}
            <div className="p-3 rounded-2xl bg-surface border border-line space-y-1">
              <span className="text-[11px] text-ink-muted uppercase tracking-wider block">Genética y banco</span>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-ok-ink font-semibold truncate">
                  A: {cropA?.geneticsName || 'N/A'} {cropA?.seedBank && `(${cropA.seedBank})`}
                </div>
                <div className="text-brand font-semibold truncate">
                  B: {cropB?.geneticsName || 'N/A'} {cropB?.seedBank && `(${cropB.seedBank})`}
                </div>
              </div>
            </div>

            {/* Row 2: Substrate & Pot Volume */}
            <div className="p-3 rounded-2xl bg-surface border border-line space-y-1">
              <span className="text-[11px] text-ink-muted uppercase tracking-wider block">Sustrato y macetas</span>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-ink">
                  <span className="text-ok-ink font-bold">A:</span> {cropA?.substrate?.type || 'Sustrato'} ({cropA?.substrate?.potVolumeLiters || 11}L {cropA?.substrate?.potType || ''})
                </div>
                <div className="text-ink">
                  <span className="text-brand font-bold">B:</span> {cropB?.substrate?.type || 'Sustrato'} ({cropB?.substrate?.potVolumeLiters || 11}L {cropB?.substrate?.potType || ''})
                </div>
              </div>
            </div>

            {/* Row 3: Lighting and Wattage */}
            <div className="p-3 rounded-2xl bg-surface border border-line space-y-1">
              <span className="text-[11px] text-ink-muted uppercase tracking-wider block">Iluminación</span>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-ink">
                  <span className="text-ok-ink font-bold">A:</span> {cropA?.lighting?.type || 'LED'} ({yieldA.watts || 0}W)
                </div>
                <div className="text-ink">
                  <span className="text-brand font-bold">B:</span> {cropB?.lighting?.type || 'LED'} ({yieldB.watts || 0}W)
                </div>
              </div>
            </div>

            {/* Row 4: Plant Count */}
            <div className="p-3 rounded-2xl bg-surface border border-line space-y-1">
              <span className="text-[11px] text-ink-muted uppercase tracking-wider block">Densidad de plantas</span>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-ink">
                  <span className="text-ok-ink font-bold">A:</span> {yieldA.plants} plantas
                </div>
                <div className="text-ink">
                  <span className="text-brand font-bold">B:</span> {yieldB.plants} plantas
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tasting & Quality Organoleptic Comparison Card */}
      {(harvestA || harvestB) && (
        <div className="bg-card rounded-[32px] p-6 sm:p-8 border border-line shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-line">
            <Sparkles className="w-5 h-5 text-warn-ink" />
            <h3 className="text-base font-bold text-ink">Ficha de cata y calidad final</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Crop A Tasting */}
            <div className="p-4 rounded-2xl bg-surface border border-ok-line space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-ok-ink text-sm">{cropA?.name}</span>
                <div className="flex items-center gap-0.5 text-warn-ink">
                  {[...Array(harvestA?.rating1To5 || 5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-warn-line" />
                  ))}
                </div>
              </div>

              {harvestA?.aromaReview && (
                <div className="text-ink">
                  <strong className="text-ink-muted">Aroma: </strong>
                  {harvestA.aromaReview}
                </div>
              )}
              {harvestA?.flavorReview && (
                <div className="text-ink">
                  <strong className="text-ink-muted">Sabor: </strong>
                  {harvestA.flavorReview}
                </div>
              )}
              {harvestA?.structureDensityReview && (
                <div className="text-ink">
                  <strong className="text-ink-muted">Densidad: </strong>
                  {harvestA.structureDensityReview}
                </div>
              )}
              {harvestA?.finalNotes && (
                <div className="text-ink-muted italic pt-1 border-t border-line">
                  "{harvestA.finalNotes}"
                </div>
              )}
            </div>

            {/* Crop B Tasting */}
            <div className="p-4 rounded-2xl bg-surface border border-chip-line space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-brand text-sm">{cropB?.name}</span>
                <div className="flex items-center gap-0.5 text-warn-ink">
                  {[...Array(harvestB?.rating1To5 || 5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-warn-line" />
                  ))}
                </div>
              </div>

              {harvestB?.aromaReview && (
                <div className="text-ink">
                  <strong className="text-ink-muted">Aroma: </strong>
                  {harvestB.aromaReview}
                </div>
              )}
              {harvestB?.flavorReview && (
                <div className="text-ink">
                  <strong className="text-ink-muted">Sabor: </strong>
                  {harvestB.flavorReview}
                </div>
              )}
              {harvestB?.structureDensityReview && (
                <div className="text-ink">
                  <strong className="text-ink-muted">Densidad: </strong>
                  {harvestB.structureDensityReview}
                </div>
              )}
              {harvestB?.finalNotes && (
                <div className="text-ink-muted italic pt-1 border-t border-line">
                  "{harvestB.finalNotes}"
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Agronomic Conclusions / Key Takeaways */}
      <div className="bg-surface border border-line rounded-[32px] p-6 sm:p-8 space-y-3">
        <div className="flex items-center gap-2 text-ink font-bold text-sm">
          <Lightbulb className="w-4 h-4 text-warn-ink" />
          <span>Conclusiones del contraste agronómico</span>
        </div>
        <div className="text-xs text-ink space-y-1.5 leading-relaxed">
          <p>
            • <strong>Diferencial de biomasa:</strong> El cultivo{' '}
            <span className={yieldDeltaPct >= 0 ? 'text-brand font-bold' : 'text-ok-ink font-bold'}>
              {yieldDeltaPct >= 0 ? cropB?.name : cropA?.name}
            </span>{' '}
            obtuvo un mayor rendimiento de peso seco ({Math.abs(yieldDeltaPct)}% de diferencia).
          </p>
          {statsA.avgTemp && statsB.avgTemp && (
            <p>
              • <strong>Estabilidad térmica:</strong> La temperatura media de {cropA?.name} fue de {dec(statsA.avgTemp, 1)} °C frente a {dec(statsB.avgTemp, 1)} °C en {cropB?.name} (Δ {Number(Math.abs(statsB.avgTemp - statsA.avgTemp).toFixed(1))}°C).
            </p>
          )}
          {statsA.avgHum && statsB.avgHum && (
            <p>
              • <strong>Humedad relativa:</strong> {cropA?.name} operó con un promedio de {statsA.avgHum}% HR mientras que {cropB?.name} registró {statsB.avgHum}% HR.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
