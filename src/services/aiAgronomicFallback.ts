import { Cultivation, Watering, EnvironmentRecord, PhotoRecord, DiaryEntry } from '../types';
import { buildCultivationIntelligenceContext } from './cultivationIntelligenceService';
export type CultivationIntelligenceContext = ReturnType<typeof buildCultivationIntelligenceContext>;

export interface AgronomicFallbackResult {
  reply: string;
  evidence: {
    recordsReferenced: string[];
    metricsReferenced: string[];
    datesReferenced: string[];
  };
}

export interface AgronomicFallbackInput {
  message: string;
  cropName?: string;
  intelligenceContext?: CultivationIntelligenceContext;
  cultivation?: Cultivation;
  recentWaterings?: Watering[];
  recentEnv?: EnvironmentRecord[];
  recentPhotos?: PhotoRecord[];
  recentNotes?: DiaryEntry[];
}

/**
 * Generador agronómico determinista estricto.
 * PRINCIPIO OBLIGATORIO: BASADO EXCLUSIVAMENTE EN DATOS REALES CONFIRMADOS.
 * NUNCA inventa defaults ficticios (p. ej. "1 L", "24°C", "55% HR" o "sustrato estándar").
 */
export function buildAgronomicDeterministicFallback(input: AgronomicFallbackInput): AgronomicFallbackResult {
  const {
    message,
    cropName: explicitCropName,
    intelligenceContext,
    cultivation,
    recentWaterings,
    recentEnv,
  } = input;

  const cropName = explicitCropName || intelligenceContext?.identity?.name || cultivation?.name;
  const qLower = (message || '').toLowerCase();
  const recordsReferenced: string[] = [];
  const metricsReferenced: string[] = [];
  const datesReferenced: string[] = [];

  const intro = cropName
    ? `¡Hola! Estoy analizando los registros reales y confirmados de tu cultivo **${cropName}**.`
    : '¡Hola! Estoy revisando las variables botánicas y registros de tu espacio de cultivo.';

  const agronomicDetails: string[] = [];

  // 1. Datos reales del cultivo si existen
  if (intelligenceContext) {
    const { identity, chronology, irrigation, environment } = intelligenceContext;

    // Cronología real
    const stageName = chronology.currentStage || 'No registrada';
    const daysInStage = chronology.daysInActiveStage !== undefined ? chronology.daysInActiveStage : 's/d';
    const totalDays = chronology.realDaysElapsed !== undefined ? chronology.realDaysElapsed : 's/d';
    agronomicDetails.push(
      `🌱 **Estado general:** Etapa de **${stageName}** (Días en etapa: ${daysInStage}, Días totales de ciclo: ${totalDays}).`
    );

    // Genética y sustrato estrictamente reales (NUNCA inventar "sustrato estándar")
    const genPart = identity.geneticsName
      ? `${identity.geneticsName}${identity.seedBank ? ` (${identity.seedBank})` : ''}`
      : 'Genética no registrada';
    const substratePart = identity.substrateType
      ? `en sustrato ${identity.substrateType}`
      : 'sustrato no registrado';
    agronomicDetails.push(`🧬 **Genética y medio:** ${genPart}, ${substratePart}.`);

    // Riego real (NUNCA inventar "1 L" ni fechas ficticias)
    if (irrigation.lastWatering && irrigation.lastWatering.volumeLiters !== undefined) {
      const dateStr = irrigation.lastWatering.date || 'reciente';
      recordsReferenced.push(`Último riego: ${irrigation.lastWatering.volumeLiters} L (${dateStr})`);
      if (irrigation.lastWatering.date) {
        datesReferenced.push(irrigation.lastWatering.date);
      }
      metricsReferenced.push(`${irrigation.lastWatering.volumeLiters} L`);
      agronomicDetails.push(
        `💧 **Riego registrado:** Último riego de **${irrigation.lastWatering.volumeLiters} L** el **${dateStr}**.`
      );

      if (irrigation.forecast.wateringWindowStart && irrigation.forecast.wateringWindowEnd) {
        agronomicDetails.push(
          `⏱️ **Ventana de revisión estimada:** Entre **${irrigation.forecast.wateringWindowStart}** y **${irrigation.forecast.wateringWindowEnd}**.`
        );
      }
    } else {
      agronomicDetails.push('💧 **Riego:** Sin riegos registrados en el sistema para calcular el intervalo de secado.');
    }

    // Clima / Ambiente estrictamente real (NUNCA inventar 24°C ni 55% HR)
    if (environment.latest) {
      const temp = environment.latest.tempC;
      const hum = environment.latest.humidityPct;
      const vpd = environment.latest.vpdKPa;

      if (temp !== undefined || hum !== undefined || vpd !== undefined) {
        const parts: string[] = [];
        if (temp !== undefined) {
          metricsReferenced.push(`${temp}°C`);
          parts.push(`Temperatura: **${temp}°C**`);
        } else {
          parts.push('Temperatura: s/d');
        }
        if (hum !== undefined) {
          metricsReferenced.push(`${hum}% HR`);
          parts.push(`Humedad: **${hum}%**`);
        } else {
          parts.push('Humedad: s/d');
        }
        if (vpd !== undefined) {
          metricsReferenced.push(`${vpd} kPa`);
          parts.push(`VPD: **${vpd} kPa**`);
        }
        agronomicDetails.push(`🌡️ **Clima reciente:** ${parts.join(', ')}.`);
      } else {
        agronomicDetails.push('🌡️ **Ambiente:** Sin mediciones ambientales recientes registradas.');
      }
    } else {
      agronomicDetails.push('🌡️ **Ambiente:** Sin mediciones ambientales recientes registradas.');
    }
  } else if (cultivation) {
    // Cultivation básico sin intelligenceContext
    const stageStr = cultivation.currentStage || 'No especificada';
    const typeStr = cultivation.type || 'Tipo no registrado';
    agronomicDetails.push(`🌱 **Etapa actual:** ${stageStr} (${typeStr}).`);

    if (cultivation.geneticsName) {
      agronomicDetails.push(`🧬 **Genética:** ${cultivation.geneticsName}.`);
    } else {
      agronomicDetails.push('🧬 **Genética:** No especificada.');
    }

    // Sustrato estrictamente real
    if (cultivation.substrate?.type) {
      agronomicDetails.push(
        `🪴 **Sustrato:** ${cultivation.substrate.type}${
          cultivation.substrate.potVolumeLiters ? ` (${cultivation.substrate.potVolumeLiters}L)` : ''
        }.`
      );
    }

    // Riegos reales
    if (
      recentWaterings &&
      Array.isArray(recentWaterings) &&
      recentWaterings.length > 0 &&
      recentWaterings[0].volumeLiters !== undefined
    ) {
      const lastW = recentWaterings[0];
      recordsReferenced.push(`Riego: ${lastW.volumeLiters} L`);
      metricsReferenced.push(`${lastW.volumeLiters} L`);
      if (lastW.date) datesReferenced.push(lastW.date);
      agronomicDetails.push(`💧 **Último riego:** ${lastW.volumeLiters} L el ${lastW.date || 'reciente'}.`);
    } else {
      agronomicDetails.push('💧 **Riego:** Sin riegos registrados.');
    }

    // Mediciones ambientales reales (SIN DEFAULT FICTICIO DE 24°C / 55% HR)
    if (recentEnv && Array.isArray(recentEnv) && recentEnv.length > 0) {
      const lastE = recentEnv[0];
      const temp = lastE.temperatureC ?? (lastE as any).temperature;
      const hum = lastE.humidityPct ?? (lastE as any).humidity;
      if (temp !== undefined || hum !== undefined) {
        const parts: string[] = [];
        if (temp !== undefined) {
          metricsReferenced.push(`${temp}°C`);
          parts.push(`${temp}°C`);
        } else {
          parts.push('s/d');
        }
        if (hum !== undefined) {
          metricsReferenced.push(`${hum}% HR`);
          parts.push(`${hum}% HR`);
        } else {
          parts.push('s/d');
        }
        agronomicDetails.push(`🌡️ **Ambiente reciente:** ${parts.join(' / ')}.`);
      } else {
        agronomicDetails.push('🌡️ **Ambiente:** Sin parámetros de temperatura ni humedad registrados.');
      }
    } else {
      agronomicDetails.push('🌡️ **Ambiente:** Sin mediciones ambientales registradas.');
    }
  }

  // 2. Respuesta y asesoramiento contextual según la consulta
  let specificAdvice = '';
  if (qLower.includes('riego') || qLower.includes('regar') || qLower.includes('agua') || qLower.includes('humedad')) {
    specificAdvice =
      'Para evaluar si la planta necesita riego en este momento, recordá verificar el peso de la maceta y los primeros 3-4 cm del sustrato. Si la maceta se siente ligera y el sustrato está seco, regá despacio hasta lograr entre 10% y 15% de drenaje uniforme.';
  } else if (
    qLower.includes('plaga') ||
    qLower.includes('bicho') ||
    qLower.includes('hoja') ||
    qLower.includes('amarill') ||
    qLower.includes('mancha')
  ) {
    specificAdvice =
      'Si notás manchas o decoloración foliar, revisá siempre el envés de las hojas con lupa para descartar ácaros o trips. Verificá también el pH del agua de riego para asegurar que los nutrientes estén biodisponibles y no bloqueados.';
  } else if (
    qLower.includes('flora') ||
    qLower.includes('cogollo') ||
    qLower.includes('tricoma') ||
    qLower.includes('cosech')
  ) {
    specificAdvice =
      'Durante la etapa de floración es fundamental mantener la humedad relativa por debajo del 50-55% con excelente circulación de aire para prevenir botrytis. El punto óptimo de corte se determina observando los tricomas: cuando estén en su mayoría lechosos y un 10-20% ámbar.';
  } else {
    specificAdvice =
      'Podés consultarme sobre interpretación de parámetros ambientales (temperatura, humedad, VPD), calendario de etapas, dosis de riego o cuidados botánicos específicos.';
  }

  const reply = [
    intro,
    '',
    agronomicDetails.length > 0 ? agronomicDetails.join('\n') : null,
    agronomicDetails.length > 0 ? '' : null,
    specificAdvice,
    '',
    '_Nota agronómica: El motor de asistencia está respondiendo con tus datos verificados y cálculos locales de contingencia._',
  ]
    .filter((x) => x !== null)
    .join('\n');

  return {
    reply,
    evidence: {
      recordsReferenced,
      metricsReferenced,
      datesReferenced,
    },
  };
}

/**
 * Ejecutor secuencial de modelos de IA con degradación agraria real.
 * 1. Intenta primer modelo candidato.
 * 2. Si falla (cuota, 402, transitorio), intenta secuencialmente el siguiente modelo.
 * 3. Si todos fallan, ejecuta el fallback determinista agronómico real.
 */
export async function executeAIWithRotationAndFallback(params: {
  candidateModels: string[];
  generateCall: (model: string) => Promise<{ text?: string | null }>;
  isQuotaOrCreditExhausted: (err: any) => boolean;
  onModelAttempt?: (model: string, index: number, total: number) => void;
  onModelSuccess?: (model: string) => void;
  onModelFailure?: (model: string, err: any, willRotate: boolean) => void;
  onFallbackActivated?: () => void;
  fallbackInput: AgronomicFallbackInput;
}): Promise<{
  result: AgronomicFallbackResult;
  usedModel?: string;
  isFallback: boolean;
}> {
  const {
    candidateModels,
    generateCall,
    isQuotaOrCreditExhausted,
    onModelAttempt,
    onModelSuccess,
    onModelFailure,
    onFallbackActivated,
    fallbackInput,
  } = params;

  for (let i = 0; i < candidateModels.length; i++) {
    const model = candidateModels[i];
    if (onModelAttempt) onModelAttempt(model, i, candidateModels.length);

    try {
      const response = await generateCall(model);
      const text = response?.text || '{}';
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = {
          reply: text || 'Entendido. ¿En qué más puedo ayudarte con este cultivo?',
          evidence: { recordsReferenced: [], metricsReferenced: [], datesReferenced: [] },
        };
      }

      if (onModelSuccess) onModelSuccess(model);
      return {
        result: {
          reply: parsed.reply || text,
          evidence: parsed.evidence || { recordsReferenced: [], metricsReferenced: [], datesReferenced: [] },
        },
        usedModel: model,
        isFallback: false,
      };
    } catch (err: any) {
      const willRotate = i < candidateModels.length - 1;
      if (onModelFailure) onModelFailure(model, err, willRotate);
      // Continuamos al siguiente modelo sin hacer break
    }
  }

  // Todos los modelos fallaron -> activar fallback determinista
  if (onFallbackActivated) onFallbackActivated();
  const fallbackResult = buildAgronomicDeterministicFallback(fallbackInput);
  return {
    result: fallbackResult,
    isFallback: true,
  };
}
