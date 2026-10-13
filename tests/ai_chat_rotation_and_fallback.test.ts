import {
  executeAIWithRotationAndFallback,
  buildAgronomicDeterministicFallback,
} from '../src/services/aiAgronomicFallback';

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
  console.log('   PRUEBAS: ROTACIÓN REAL DE MODELOS Y FALLBACK BOTÁNICO DE PRODUCCIÓN');
  console.log('================================================================\n');

  const candidateModels = ['gemini-3.8-flash', 'gemini-3.6-flash'];

  // Helper para simular función isQuotaOrCreditExhausted
  const isQuota = (err: any) => {
    const msg = (err?.message || '').toLowerCase();
    return err?.code === 402 || err?.status === 'RESOURCE_EXHAUSTED' || msg.includes('quota') || msg.includes('credits');
  };

  // CASO 1: Primer modelo (gemini-3.8-flash) devuelve respuesta válida -> NO se rota ni se usa fallback
  const callSequenceCase1: string[] = [];
  const exec1 = await executeAIWithRotationAndFallback({
    candidateModels,
    generateCall: async (model) => {
      callSequenceCase1.push(model);
      return {
        text: JSON.stringify({
          reply: `Respuesta exitosa directa de ${model}`,
          evidence: { recordsReferenced: ['riego real'], metricsReferenced: ['1.2 L'], datesReferenced: ['2026-10-10'] },
        }),
      };
    },
    isQuotaOrCreditExhausted: isQuota,
    fallbackInput: { message: '¿Cómo viene el cultivo?' },
  });

  assert(
    callSequenceCase1.length === 1 && callSequenceCase1[0] === 'gemini-3.8-flash',
    '1. Si gemini-3.8-flash responde con éxito, NO se consulta gemini-3.6-flash'
  );
  assert(
    exec1.isFallback === false && exec1.usedModel === 'gemini-3.8-flash',
    '2. El resultado proviene de gemini-3.8-flash sin activar fallback'
  );

  // CASO 2: gemini-3.8-flash falla por cuota (402) -> Se intenta secuencialmente gemini-3.6-flash y este responde
  const callSequenceCase2: string[] = [];
  const exec2 = await executeAIWithRotationAndFallback({
    candidateModels,
    generateCall: async (model) => {
      callSequenceCase2.push(model);
      if (model === 'gemini-3.8-flash') {
        const err: any = new Error('Prepayment credits are depleted');
        err.code = 402;
        err.status = 'RESOURCE_EXHAUSTED';
        throw err;
      }
      return {
        text: JSON.stringify({
          reply: `Respuesta recuperada por ${model}`,
          evidence: { recordsReferenced: [], metricsReferenced: [], datesReferenced: [] },
        }),
      };
    },
    isQuotaOrCreditExhausted: isQuota,
    fallbackInput: { message: '¿Cómo regar?' },
  });

  assert(
    callSequenceCase2.length === 2 && callSequenceCase2[0] === 'gemini-3.8-flash' && callSequenceCase2[1] === 'gemini-3.6-flash',
    '3. Si gemini-3.8-flash falla por cuota 402, se intenta secuencialmente gemini-3.6-flash'
  );
  assert(
    exec2.isFallback === false && exec2.usedModel === 'gemini-3.6-flash' && exec2.result.reply.includes('gemini-3.6-flash'),
    '4. Si gemini-3.6-flash tiene éxito tras la rotación, se devuelve su respuesta sin activar fallback'
  );

  // CASO 3: gemini-3.8-flash falla por error transitorio de red (503/timeout) -> También rota a gemini-3.6-flash
  const callSequenceCase3: string[] = [];
  const exec3 = await executeAIWithRotationAndFallback({
    candidateModels,
    generateCall: async (model) => {
      callSequenceCase3.push(model);
      if (model === 'gemini-3.8-flash') {
        throw new Error('503 Service Unavailable / Network Timeout');
      }
      return {
        text: JSON.stringify({
          reply: `Respuesta de ${model} tras error transitorio`,
          evidence: { recordsReferenced: [], metricsReferenced: [], datesReferenced: [] },
        }),
      };
    },
    isQuotaOrCreditExhausted: isQuota,
    fallbackInput: { message: 'Consulta de poda' },
  });

  assert(
    callSequenceCase3.length === 2 && callSequenceCase3[1] === 'gemini-3.6-flash',
    '5. Ante error transitorio (503/timeout) en primer modelo, se rota correctamente a gemini-3.6-flash'
  );
  assert(
    exec3.isFallback === false && exec3.usedModel === 'gemini-3.6-flash',
    '6. gemini-3.6-flash asume la consulta y responde con éxito'
  );

  // CASO 4: Ambos modelos fallan (3.8 por cuota y 3.6 por cuota) -> Se activa fallback agronómico real
  const callSequenceCase4: string[] = [];
  let fallbackLogNotified: boolean = false;
  const exec4 = await executeAIWithRotationAndFallback({
    candidateModels,
    generateCall: async (model) => {
      callSequenceCase4.push(model);
      const err: any = new Error(`Quota exhausted on ${model}`);
      err.code = 402;
      throw err;
    },
    isQuotaOrCreditExhausted: isQuota,
    onFallbackActivated: () => {
      fallbackLogNotified = true;
    },
    fallbackInput: {
      message: '¿Cuándo debo regar?',
      cropName: 'Amnesia Haze',
      cultivation: {
        id: 'crop-1',
        name: 'Amnesia Haze',
        currentStage: 'Floración',
        geneticsName: 'Amnesia Haze',
        type: 'Indoor',
        // Sin sustrato, sin riegos, sin mediciones ambientales
      } as any,
    },
  });

  assert(
    callSequenceCase4.length === 2 && Boolean(fallbackLogNotified),
    '7. Si ambos modelos candidatos fallan, se intenta la rotación completa y se notifica la activación del fallback'
  );
  assert(
    exec4.isFallback === true,
    '8. El resultado final marca isFallback = true tras agotarse los candidatos'
  );

  // CASO 5: Rigor botánico del fallback determinista de producción: CERO DATOS INVENTADOS
  assert(
    !exec4.result.reply.includes('1 L'),
    '9a. El fallback de producción NUNCA inventa volumen de riego de 1 L'
  );
  assert(
    !exec4.result.reply.includes('24°C'),
    '9b. El fallback de producción NUNCA inventa temperatura de 24°C'
  );
  assert(
    !exec4.result.reply.includes('55% HR'),
    '9c. El fallback de producción NUNCA inventa humedad de 55% HR'
  );
  assert(
    !exec4.result.reply.includes('sustrato estándar'),
    '9d. El fallback de producción NUNCA inventa "sustrato estándar"'
  );
  assert(
    exec4.result.reply.includes('Sin riegos registrados'),
    '9e. Si no hay riegos, el fallback de producción informa explícitamente "Sin riegos registrados"'
  );
  assert(
    exec4.result.reply.includes('Sin mediciones ambientales registradas'),
    '9f. Si no hay mediciones ambientales, el fallback informa "Sin mediciones ambientales registradas"'
  );
  assert(
    exec4.result.evidence.metricsReferenced.length === 0,
    '9g. La evidencia de fallback no contiene métricas inventadas'
  );

  // CASO 6: Fallback de producción con DATOS REALES CONFIRMADOS
  const realFallback = buildAgronomicDeterministicFallback({
    message: '¿Cuándo regar?',
    cropName: 'Gorilla Glue #4',
    cultivation: {
      id: 'crop-2',
      name: 'Gorilla Glue #4',
      currentStage: 'Vegetativo',
      geneticsName: 'Gorilla Glue #4',
      type: 'Indoor',
      substrate: { type: 'Living Soil', potVolumeLiters: 15 },
    } as any,
    recentWaterings: [{ id: 'w1', cultivationId: 'crop-2', volumeLiters: 2.2, date: '2026-10-11' } as any],
    recentEnv: [{ id: 'e1', cultivationId: 'crop-2', temperatureC: 23.1, humidityPct: 62 } as any],
  });

  assert(
    realFallback.reply.includes('2.2 L') && realFallback.evidence.metricsReferenced.includes('2.2 L'),
    '10a. El fallback refleja exactamente el volumen real registrado de 2.2 L'
  );
  assert(
    realFallback.reply.includes('23.1°C') && realFallback.reply.includes('62% HR'),
    '10b. El fallback refleja exactamente el clima real registrado (23.1°C / 62% HR)'
  );
  assert(
    realFallback.reply.includes('Living Soil (15L)'),
    '10c. El fallback refleja exactamente el sustrato y maceta reales (Living Soil 15L)'
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
