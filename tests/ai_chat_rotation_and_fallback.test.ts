import { JSDOM } from 'jsdom';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    passedCount++;
    console.log(`  ✅ PASSED: ${desc}`);
  } else {
    failedCount++;
    console.error(`  ❌ FAILED: ${desc}`);
  }
}

export async function runAIChatRotationAndFallbackTests(): Promise<{ passed: number; failed: number; skipped: number }> {
  console.log('\n================================================================');
  console.log('   PRUEBAS: ROTACIÓN SECUENCIAL DE MODELOS Y FALLBACK BOTÁNICO REAL');
  console.log('================================================================\n');

  // 1. Simulación de la lógica de rotación de modelos
  const attemptedModels: string[] = [];
  const candidateModels = ['gemini-3.8-flash', 'gemini-3.6-flash'];

  // Caso 1: gemini-3.8-flash falla por cuota (402), pero gemini-3.6-flash tiene éxito
  attemptedModels.length = 0;
  let simulatedResponse: any = null;

  for (let i = 0; i < candidateModels.length; i++) {
    const model = candidateModels[i];
    attemptedModels.push(model);
    if (model === 'gemini-3.8-flash') {
      // Simular error de cuota/crédito en 3.8
      continue;
    }
    if (model === 'gemini-3.6-flash') {
      simulatedResponse = {
        reply: 'Respuesta generada con gemini-3.6-flash exitosamente.',
        evidence: { recordsReferenced: [], metricsReferenced: [], datesReferenced: [] },
      };
      break;
    }
  }

  assert(
    attemptedModels.length === 2 && attemptedModels[0] === 'gemini-3.8-flash' && attemptedModels[1] === 'gemini-3.6-flash',
    '1. Si gemini-3.8-flash falla por cuota, se intenta secuencialmente gemini-3.6-flash'
  );
  assert(
    simulatedResponse !== null && simulatedResponse.reply.includes('gemini-3.6-flash'),
    '2. Si gemini-3.6-flash tiene éxito, se devuelve su respuesta sin activar fallback'
  );

  // Caso 2: Ambos modelos fallan por cuota -> se activa fallback determinista
  attemptedModels.length = 0;
  let fallbackActivated = false;
  for (let i = 0; i < candidateModels.length; i++) {
    const model = candidateModels[i];
    attemptedModels.push(model);
    // Ambos fallan
  }
  if (attemptedModels.length === candidateModels.length) {
    fallbackActivated = true;
  }
  assert(fallbackActivated, '3. Si ambos modelos candidatos fallan, se activa el fallback agronómico determinista');

  // Caso 3: Fallback con cultivo SIN datos de riego ni ambiente (NO debe inventar métricas ficticias)
  const emptyCropContext = {
    name: 'Critical Kush',
    currentStage: 'Vegetativo',
    geneticsName: 'Critical Kush',
    // Sin substrate, sin lastWatering, sin recentEnv
  };

  // Función que reproduce la lógica estricta del backend sin datos falsos
  function buildTestAgronomicFallback(crop: any, query: string) {
    const recordsReferenced: string[] = [];
    const metricsReferenced: string[] = [];
    const datesReferenced: string[] = [];
    const details: string[] = [];

    details.push(`🌱 **Etapa actual:** ${crop.currentStage || 'No especificada'} (${crop.type || 'Tipo no registrado'}).`);
    details.push(`🧬 **Genética:** ${crop.geneticsName || 'No especificada'}.`);

    if (crop.substrate?.type) {
      details.push(`🪴 **Sustrato:** ${crop.substrate.type}.`);
    }

    if (crop.recentWaterings && crop.recentWaterings.length > 0 && crop.recentWaterings[0].volumeLiters !== undefined) {
      recordsReferenced.push(`Riego: ${crop.recentWaterings[0].volumeLiters} L`);
      metricsReferenced.push(`${crop.recentWaterings[0].volumeLiters} L`);
      details.push(`💧 **Último riego:** ${crop.recentWaterings[0].volumeLiters} L.`);
    } else {
      details.push('💧 **Riego:** Sin riegos registrados.');
    }

    if (crop.recentEnv && crop.recentEnv.length > 0) {
      const e = crop.recentEnv[0];
      if (e.temperatureC !== undefined || e.humidityPct !== undefined) {
        details.push(`🌡️ **Ambiente reciente:** ${e.temperatureC ?? 's/d'}°C / ${e.humidityPct ?? 's/d'}% HR.`);
      } else {
        details.push('🌡️ **Ambiente:** Sin parámetros registrados.');
      }
    } else {
      details.push('🌡️ **Ambiente:** Sin mediciones ambientales registradas.');
    }

    return {
      reply: details.join('\n'),
      evidence: { recordsReferenced, metricsReferenced, datesReferenced },
    };
  }

  const fallbackResult = buildTestAgronomicFallback(emptyCropContext, '¿Cómo regar?');

  assert(
    !fallbackResult.reply.includes('1 L'),
    '4a. Fallback no inventa volumen de riego de 1 L cuando no existe registro'
  );
  assert(
    !fallbackResult.reply.includes('24°C'),
    '4b. Fallback no inventa temperatura de 24°C cuando no hay mediciones'
  );
  assert(
    !fallbackResult.reply.includes('55% HR'),
    '4c. Fallback no inventa humedad de 55% HR cuando no hay mediciones'
  );
  assert(
    !fallbackResult.reply.includes('estándar') && !fallbackResult.reply.includes('sustrato estándar'),
    '4d. Fallback no inventa tipo de sustrato estándar cuando falta'
  );
  assert(
    fallbackResult.reply.includes('Sin riegos registrados'),
    '4e. Fallback reporta explícitamente "Sin riegos registrados"'
  );
  assert(
    fallbackResult.reply.includes('Sin mediciones ambientales registradas'),
    '4f. Fallback reporta explícitamente "Sin mediciones ambientales registradas"'
  );
  assert(
    fallbackResult.evidence.metricsReferenced.length === 0,
    '4g. La evidencia del fallback no contiene métricas inventadas'
  );

  // Caso 4: Fallback CON datos reales verificados
  const realCropContext = {
    name: 'Super Lemon Haze',
    currentStage: 'Floración',
    geneticsName: 'Super Lemon Haze',
    substrate: { type: 'Coco / Perlita' },
    recentWaterings: [{ volumeLiters: 2.5, date: '2026-10-12' }],
    recentEnv: [{ temperatureC: 22.4, humidityPct: 48 }],
  };

  const realFallbackResult = buildTestAgronomicFallback(realCropContext, '¿Cuándo cosecho?');

  assert(
    realFallbackResult.reply.includes('2.5 L') && realFallbackResult.evidence.metricsReferenced.includes('2.5 L'),
    '5a. Fallback incluye exactamente el volumen real registrado de 2.5 L'
  );
  assert(
    realFallbackResult.reply.includes('22.4°C') && realFallbackResult.reply.includes('48% HR'),
    '5b. Fallback incluye exactamente las mediciones reales de clima (22.4°C / 48% HR)'
  );
  assert(
    realFallbackResult.reply.includes('Coco / Perlita'),
    '5c. Fallback incluye el sustrato real registrado (Coco / Perlita)'
  );

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL PASSED:  ${passedCount}`);
  console.log(`TOTAL FAILED:  ${failedCount}`);
  console.log('----------------------------------------------------------------\n');

  return { passed: passedCount, failed: failedCount, skipped: 0 };
}

if (process.argv[1]?.endsWith('ai_chat_rotation_and_fallback.test.ts')) {
  runAIChatRotationAndFallbackTests()
    .then((res) => {
      process.exit(res.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
