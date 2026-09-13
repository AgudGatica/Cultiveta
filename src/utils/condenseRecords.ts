import { Cultivation, Watering, EnvironmentRecord } from '../types';

export interface CondensedRecordsSummary {
  hasData: boolean;
  wateringsCount: number;
  envRecordsCount: number;
  keyPoints: string[];
  alerts: string[];
  metrics: {
    avgTemp?: number;
    minTemp?: number;
    maxTemp?: number;
    avgHumidity?: number;
    minHumidity?: number;
    maxHumidity?: number;
    avgVpd?: number;
    minVpd?: number;
    maxVpd?: number;
    lastWateringDate?: string;
    lastWateringDaysAgo?: number;
    lastWateringVolume?: number;
    avgPhIn?: number;
    avgEcIn?: number;
    totalVolumeWatered?: number;
    avgIntervalDays?: number;
  };
}

/**
 * Condenses environmental and watering records into essential botanical key points
 * for quick review and AI context injection.
 */
export function condenseRecordsToKeyPoints(
  crop: Cultivation | undefined,
  allWaterings: Watering[],
  allEnvRecords: EnvironmentRecord[]
): CondensedRecordsSummary {
  if (!crop) {
    return {
      hasData: false,
      wateringsCount: 0,
      envRecordsCount: 0,
      keyPoints: ['No hay ningún cultivo seleccionado para condensar datos.'],
      alerts: [],
      metrics: {},
    };
  }

  // Filter for the specific cultivation and sort chronologically (newest first)
  const cropWaterings = allWaterings
    .filter((w) => w.cultivationId === crop.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const cropEnv = allEnvRecords
    .filter((e) => e.cultivationId === crop.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (cropWaterings.length === 0 && cropEnv.length === 0) {
    return {
      hasData: false,
      wateringsCount: 0,
      envRecordsCount: 0,
      keyPoints: [
        `Cultivo "${crop.name}" (${crop.currentStage}): Aún no se han registrado riegos ni lecturas ambientales en el diario.`,
      ],
      alerts: [],
      metrics: {},
    };
  }

  const keyPoints: string[] = [];
  const alerts: string[] = [];
  const metrics: CondensedRecordsSummary['metrics'] = {};

  // 1. Stage and Genetics Header Key Point
  const geneticsDescription = crop.geneticsList && crop.geneticsList.length > 1
    ? crop.geneticsList.map(g => `${g.name} (${g.plantCount || 1}p)`).join(', ')
    : `${crop.geneticsName || 'No especificada'} (${crop.photoperiodType})`;

  keyPoints.push(
    `Cultivo "${crop.name}" en etapa de ${crop.currentStage} | Genética: ${geneticsDescription}`
  );

  // 2. Environmental Condensation
  if (cropEnv.length > 0) {
    const recentEnv = cropEnv.slice(0, 10); // Analyze up to 10 most recent records
    const temps = recentEnv.map((e) => e.temperatureC).filter((t) => typeof t === 'number' && !isNaN(t));
    const hums = recentEnv.map((e) => e.humidityPct).filter((h) => typeof h === 'number' && !isNaN(h));
    const vpds = recentEnv.map((e) => e.vpdKPa).filter((v): v is number => typeof v === 'number' && !isNaN(v));

    if (temps.length > 0) {
      const avgTemp = +(temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1);
      const minTemp = Math.min(...temps);
      const maxTemp = Math.max(...temps);
      metrics.avgTemp = avgTemp;
      metrics.minTemp = minTemp;
      metrics.maxTemp = maxTemp;

      keyPoints.push(
        `Temperatura ambiente: Promedio ${avgTemp}°C (Mín: ${minTemp}°C / Máx: ${maxTemp}°C).`
      );

      if (maxTemp - minTemp >= 9) {
        alerts.push(`Amplitud térmica alta (${(maxTemp - minTemp).toFixed(1)}°C de oscilación en carpa).`);
      }
      if (maxTemp > 30) {
        alerts.push(`Picos térmicos elevados detectados (máximo ${maxTemp}°C).`);
      } else if (minTemp < 17) {
        alerts.push(`Temperaturas mínimas bajas registradas (mínimo ${minTemp}°C).`);
      }
    }

    if (hums.length > 0) {
      const avgHum = Math.round(hums.reduce((a, b) => a + b, 0) / hums.length);
      const minHum = Math.min(...hums);
      const maxHum = Math.max(...hums);
      metrics.avgHumidity = avgHum;
      metrics.minHumidity = minHum;
      metrics.maxHumidity = maxHum;

      keyPoints.push(`Humedad relativa: Promedio ${avgHum}% (Rango: ${minHum}% - ${maxHum}%).`);

      if (crop.currentStage === 'Floración' && avgHum > 62) {
        alerts.push(`Humedad promedio elevada para floración (${avgHum}%), riesgo de proliferación fúngica.`);
      } else if (crop.currentStage === 'Vegetativo' && avgHum < 45) {
        alerts.push(`Humedad baja para vegetativo (${avgHum}%), ralentiza crecimiento.`);
      }
    }

    if (vpds.length > 0) {
      const avgVpd = +(vpds.reduce((a, b) => a + b, 0) / vpds.length).toFixed(2);
      const minVpd = +Math.min(...vpds).toFixed(2);
      const maxVpd = +Math.max(...vpds).toFixed(2);
      metrics.avgVpd = avgVpd;
      metrics.minVpd = minVpd;
      metrics.maxVpd = maxVpd;

      keyPoints.push(
        `VPD (Transpiración): Promedio ${avgVpd} kPa (Mín: ${minVpd} / Máx: ${maxVpd} kPa).`
      );

      if (avgVpd > 1.55) {
        alerts.push(`VPD medio alto (${avgVpd} kPa), posible cierre estomático por transpiración exigida.`);
      } else if (avgVpd < 0.75 && crop.currentStage === 'Floración') {
        alerts.push(`VPD bajo en floración (${avgVpd} kPa), transpiración deficiente.`);
      }
    }
  }

  // 3. Watering Condensation
  if (cropWaterings.length > 0) {
    const recentWaterings = cropWaterings.slice(0, 8); // Analyze up to 8 recent waterings
    const lastWatering = recentWaterings[0];
    const daysAgo = Math.max(
      0,
      Math.floor((Date.now() - new Date(lastWatering.date).getTime()) / 86400000)
    );

    metrics.lastWateringDate = lastWatering.date;
    metrics.lastWateringDaysAgo = daysAgo;
    metrics.lastWateringVolume = lastWatering.volumeLiters;

    const totalVol = recentWaterings.reduce((sum, w) => sum + (w.volumeLiters || 0), 0);
    metrics.totalVolumeWatered = +totalVol.toFixed(1);

    const timingText = daysAgo === 0 ? 'hoy' : `hace ${daysAgo} día(s)`;
    keyPoints.push(
      `Último riego: Aplicado ${timingText} (${lastWatering.date}) con ${lastWatering.volumeLiters}L.`
    );

    // Calculate frequency / interval between waterings
    if (recentWaterings.length >= 2) {
      const intervals: number[] = [];
      for (let i = 0; i < recentWaterings.length - 1; i++) {
        const diffDays = Math.abs(
          (new Date(recentWaterings[i].date).getTime() - new Date(recentWaterings[i + 1].date).getTime()) /
            86400000
        );
        if (diffDays > 0 && diffDays < 30) {
          intervals.push(diffDays);
        }
      }
      if (intervals.length > 0) {
        const avgInterval = +(intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(1);
        metrics.avgIntervalDays = avgInterval;
        keyPoints.push(
          `Frecuencia hídrica: Riego promedio cada ${avgInterval} días (${recentWaterings.length} riegos analizados, ${totalVol.toFixed(1)}L totales).`
        );
      }
    }

    // pH Analysis
    const phInList = recentWaterings
      .map((w) => w.phIn)
      .filter((p): p is number => typeof p === 'number' && !isNaN(p));
    if (phInList.length > 0) {
      const avgPh = +(phInList.reduce((a, b) => a + b, 0) / phInList.length).toFixed(2);
      metrics.avgPhIn = avgPh;
      keyPoints.push(`pH de entrada: Promedio ${avgPh} (Último riego: ${lastWatering.phIn ?? 'N/A'}).`);

      if (avgPh < 5.8 || avgPh > 6.7) {
        alerts.push(`pH promedio de riego (${avgPh}) fuera del rango de absorción balanceada (6.0-6.5).`);
      }
    }

    // EC Analysis
    const ecInList = recentWaterings
      .map((w) => w.ecIn)
      .filter((e): e is number => typeof e === 'number' && !isNaN(e));
    if (ecInList.length > 0) {
      const avgEc = +(ecInList.reduce((a, b) => a + b, 0) / ecInList.length).toFixed(2);
      metrics.avgEcIn = avgEc;
      keyPoints.push(`Conductividad (EC): Promedio ${avgEc} mS/cm (Último riego: ${lastWatering.ecIn ?? 'N/A'} mS/cm).`);

      if (avgEc > 2.2) {
        alerts.push(`EC de entrada elevada (${avgEc} mS/cm), vigilar posible sobrefertilización.`);
      }
    }

    // Runoff check
    const withRunoff = recentWaterings.filter(
      (w) => typeof w.ecRunoff === 'number' && typeof w.ecIn === 'number'
    );
    if (withRunoff.length > 0) {
      const latestRunoff = withRunoff[0];
      if (latestRunoff.ecRunoff! > latestRunoff.ecIn! * 1.35) {
        alerts.push(
          `Salinidad de escorrentía (Runoff ${latestRunoff.ecRunoff} mS/cm) notablemente superior a la entrada (${latestRunoff.ecIn} mS/cm).`
        );
      }
    }

    // Recent products / additives
    if (lastWatering.productsUsed && lastWatering.productsUsed.length > 0) {
      const prodNames = lastWatering.productsUsed.map((p) => p.name).join(', ');
      keyPoints.push(`Nutrición reciente: ${prodNames}.`);
    }

    if (daysAgo >= 4 && crop.currentStage !== 'Finalizado') {
      alerts.push(`Han pasado ${daysAgo} días desde el último riego registrado; verificar turgencia y peso de maceta.`);
    }
  }

  return {
    hasData: true,
    wateringsCount: cropWaterings.length,
    envRecordsCount: cropEnv.length,
    keyPoints,
    alerts,
    metrics,
  };
}
