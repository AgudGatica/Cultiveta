/**
 * tests/phase2_corrections.test.ts
 *
 * SUITE: CORRECCIONES DE LA FASE 2
 *
 * 1. completeTask no crea registros de riego (sin pH/EC/volumen inventados).
 * 2. WateringModal guarda solo lo que informa la persona (volumen sí; pH, EC, drenaje y peso, no).
 * 3. WateringModal guarda drenaje y peso cuando la persona los elige.
 * 4. getLocalTodayDateOnly a las 23:30 en UTC-3 devuelve el día local (no el de UTC).
 * 5. getLocalTodayDateOnly a las 00:30 en UTC-3 devuelve el día local.
 * 6. Pronóstico SIN peso: pide la percepción de peso como señal faltante.
 * 7. Pronóstico CON peso: la usa como factor y deja de pedirla.
 * 8. Pronóstico CON drenaje medido (litros): lo usa como factor.
 * 9. Pronóstico con drenaje por categoría: hoy el motor no lo usa (misma ventana que sin drenaje).
 * 10. "Atrasado" con pronóstico: solo después de que termina la ventana estimada.
 * 11. SafeMarkdown no genera HTML crudo y renderiza negrita y listas.
 * 12. run_all_tests cuenta los casos a partir de las marcas de salida.
 */

// La zona horaria debe fijarse antes de crear fechas: UTC-3 (Argentina, sin horario de verano).
process.env.TZ = 'America/Argentina/Buenos_Aires';

import { JSDOM } from 'jsdom';
import type { Cultivation, Watering, CultivationTask } from '../src/types';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000',
  pretendToBeVisual: true,
});

globalThis.window = dom.window as any;
globalThis.document = dom.window.document;
globalThis.Event = dom.window.Event as any;
globalThis.CustomEvent = dom.window.CustomEvent as any;
globalThis.localStorage = dom.window.localStorage as any;
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// React y los componentes se cargan DESPUÉS de preparar jsdom: si react-dom se importa sin
// window, no conecta los eventos de input y los campos controlados no se actualizan.
const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { getLocalTodayDateOnly } = await import('../src/utils/growthStageUtils');
const { WateringModal } = await import('../src/components/logs/WateringModal');
const { wateringService } = await import('../src/services/wateringService');
const { taskService } = await import('../src/services/taskService');
const { calculateIrrigationForecast } = await import('../src/services/irrigationForecastService');
const { analyzeWateringUrgency } = await import('../src/utils/wateringAlertUtils');
const { SafeMarkdown } = await import('../src/components/ai/SafeMarkdown');
const { countSuiteResults } = await import('./run_all_tests');

const crop: Cultivation = {
  id: 'crop_phase2',
  userId: 'user_phase2',
  name: 'Carpa Fase 2',
  type: 'Indoor',
  plantCount: 1,
  startDate: '2026-09-01',
  currentStage: 'Vegetativo',
  stageStartDate: '2026-09-01',
  photoperiodType: 'Fotoperiódica',
} as Cultivation;

const baseWatering = (overrides: Partial<Watering>): Watering => ({
  id: 'w_' + Math.random().toString(36).slice(2),
  userId: crop.userId,
  cultivationId: crop.id,
  date: '2026-10-10',
  time: '10:00',
  volumeLiters: 2,
  createdAt: '2026-10-10T13:00:00.000Z',
  ...overrides,
});

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

async function renderModalAndSubmit(interact: (container: HTMLElement) => Promise<void>) {
  const captured: any[] = [];
  const original = wateringService.addWatering;
  (wateringService as any).addWatering = async (data: any) => {
    captured.push(data);
    return { ...data, id: 'saved', createdAt: new Date().toISOString() };
  };

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        React.createElement(WateringModal, {
          isOpen: true,
          onClose: () => {},
          userId: crop.userId,
          cultivations: [crop],
          defaultCultivationId: crop.id,
          onWateringAdded: () => {},
        })
      );
    });

    await interact(container);

    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });
  } finally {
    root.unmount();
    container.remove();
    (wateringService as any).addWatering = original;
  }
  return captured;
}

export async function runPhase2CorrectionsTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n================================================================');
  console.log('   PRUEBAS: CORRECCIONES FASE 2');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  const assert = async (name: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
      console.log(`  ✓ [PASÓ] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FALLÓ] ${name}: ${err?.message || err}`);
      failed++;
    }
  };

  await assert('1. completeTask no crea registros de riego (sin valores inventados)', async () => {
    let calls = 0;
    const original = wateringService.addWatering;
    (wateringService as any).addWatering = async () => {
      calls++;
      throw new Error('no debería llamarse');
    };
    try {
      const task: CultivationTask = {
        id: 'watering_crop_phase2_2026-10-17',
        cultivationId: crop.id,
        cultivationName: crop.name,
        stage: 'Floración',
        type: 'watering',
        title: 'Riego',
        description: '',
        dueDate: '2026-10-17',
        urgency: 'today',
        priority: 'high',
        isCompleted: false,
        categoryLabel: 'Riego',
      };
      const res = await taskService.completeTask(task, crop.userId);
      if (!res.success) throw new Error('completeTask debería devolver success');
      if ('wateringCreated' in res) throw new Error('completeTask no debe devolver un riego creado');
    } finally {
      (wateringService as any).addWatering = original;
    }
    if (calls !== 0) throw new Error(`addWatering se llamó ${calls} vez/veces`);
  });

  await assert('2. WateringModal guarda solo lo informado (sin pH/EC/drenaje/peso supuestos)', async () => {
    const captured = await renderModalAndSubmit(async (container) => {
      const volume = container.querySelector('#watering-volume-input') as HTMLInputElement;
      const ph = container.querySelector('#watering-ph-in-input') as HTMLInputElement;
      const ec = container.querySelector('#watering-ec-in-input') as HTMLInputElement;
      if (ph.value !== '' || ec.value !== '') throw new Error(`pH/EC no deben venir precargados (pH="${ph.value}", EC="${ec.value}")`);
      if (volume.value !== '') throw new Error(`El volumen no debe venir precargado ("${volume.value}")`);
      await act(async () => setInputValue(volume, '3'));
    });
    if (captured.length !== 1) throw new Error(`Se esperaba 1 guardado, hubo ${captured.length}`);
    const data = captured[0];
    if (data.volumeLiters !== 3) throw new Error(`volumeLiters esperado 3, obtenido ${data.volumeLiters}`);
    for (const field of ['phIn', 'ecIn', 'drainageLevel', 'potLiftBeforeWatering', 'runoffVolumeLiters', 'observations']) {
      if (data[field] !== undefined) throw new Error(`${field} debería ser undefined y es ${JSON.stringify(data[field])}`);
    }
  });

  await assert('3. WateringModal guarda drenaje y peso cuando la persona los elige', async () => {
    const captured = await renderModalAndSubmit(async (container) => {
      const volume = container.querySelector('#watering-volume-input') as HTMLInputElement;
      await act(async () => setInputValue(volume, '2.5'));
      await act(async () => (container.querySelector('[data-testid="drainage-low"]') as HTMLButtonElement).click());
      await act(async () => (container.querySelector('[data-testid="pot-lift-light"]') as HTMLButtonElement).click());
    });
    const data = captured[0];
    if (data.drainageLevel !== 'low') throw new Error(`drainageLevel esperado 'low', obtenido ${data.drainageLevel}`);
    if (data.potLiftBeforeWatering !== 'light') throw new Error(`potLiftBeforeWatering esperado 'light', obtenido ${data.potLiftBeforeWatering}`);
  });

  await assert('4. getLocalTodayDateOnly: 23:30 en UTC-3 es el mismo día local', () => {
    const d = new Date('2026-10-18T02:30:00Z'); // 17/10 23:30 en Buenos Aires
    if (d.getTimezoneOffset() !== 180) throw new Error(`La zona horaria del test no es UTC-3 (offset ${d.getTimezoneOffset()})`);
    const local = getLocalTodayDateOnly(d);
    const utc = d.toISOString().split('T')[0];
    if (local !== '2026-10-17') throw new Error(`Esperado 2026-10-17, obtenido ${local}`);
    if (utc !== '2026-10-18') throw new Error('Control: en UTC la fecha ya es 2026-10-18');
  });

  await assert('5. getLocalTodayDateOnly: 00:30 en UTC-3 ya es el día siguiente local', () => {
    const d = new Date('2026-10-18T03:30:00Z'); // 18/10 00:30 en Buenos Aires
    const local = getLocalTodayDateOnly(d);
    if (local !== '2026-10-18') throw new Error(`Esperado 2026-10-18, obtenido ${local}`);
  });

  const evalDate = new Date(2026, 9, 11, 10, 0); // 11/10 10:00 local
  const potLiftMissing = 'Percepción de peso de maceta (levantada a mano) no registrada';

  await assert('6. Pronóstico sin peso: lo pide como señal faltante', () => {
    const f = calculateIrrigationForecast(crop, [baseWatering({})], [], evalDate);
    if (!f.missingSignals.includes(potLiftMissing)) {
      throw new Error(`Falta la señal de peso en missingSignals: ${JSON.stringify(f.missingSignals)}`);
    }
  });

  await assert('7. Pronóstico con peso: lo usa como factor y deja de pedirlo', () => {
    const f = calculateIrrigationForecast(crop, [baseWatering({ potLiftBeforeWatering: 'light' })], [], evalDate);
    if (f.missingSignals.includes(potLiftMissing)) throw new Error('No debería pedir el peso si se informó');
    const without = calculateIrrigationForecast(crop, [baseWatering({})], [], evalDate);
    if (f.factors.length <= without.factors.length) throw new Error('El peso informado debería sumar un factor');
  });

  await assert('8. Pronóstico con drenaje medido en litros: lo usa como factor', () => {
    const f = calculateIrrigationForecast(crop, [baseWatering({ runoffVolumeLiters: 0.4 })], [], evalDate);
    if (!f.factors.some((x) => x.includes('Drenaje registrado'))) throw new Error('Falta el factor de drenaje registrado');
    if (f.netWaterLiters !== 1.6) throw new Error(`netWaterLiters esperado 1.6, obtenido ${f.netWaterLiters}`);
  });

  await assert('9. Drenaje por categoría: el motor todavía no lo usa (misma ventana)', () => {
    const withLevel = calculateIrrigationForecast(crop, [baseWatering({ drainageLevel: 'high' })], [], evalDate);
    const without = calculateIrrigationForecast(crop, [baseWatering({})], [], evalDate);
    if (withLevel.wateringWindowStart !== without.wateringWindowStart || withLevel.wateringWindowEnd !== without.wateringWindowEnd) {
      throw new Error('drainageLevel cambió la ventana: si el motor empezó a usarlo, actualizá este test y la documentación');
    }
  });

  await assert('10. "Atrasado" con pronóstico: solo después de que termina la ventana', () => {
    const w = baseWatering({});
    const f = calculateIrrigationForecast(crop, [w], [], evalDate);
    const [endDate, endTime] = f.wateringWindowEnd!.split('T');
    const [y, m, d] = endDate.split('-').map(Number);
    const [hh, mm] = endTime.split(':').map(Number);
    const end = new Date(y, m - 1, d, hh, mm);
    const before = analyzeWateringUrgency(crop, w, new Date(end.getTime() - 60_000), f);
    const after = analyzeWateringUrgency(crop, w, new Date(end.getTime() + 60_000), f);
    if (before.isOverdue) throw new Error('No debería estar atrasado antes del fin de la ventana');
    if (!after.isOverdue) throw new Error('Debería estar atrasado después del fin de la ventana');
  });

  await assert('11. SafeMarkdown no genera HTML crudo', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(SafeMarkdown, {
          text: '<img src=x onerror="alert(1)"> **Regá** hoy\n- uno\n- dos',
        })
      );
    });
    const hasImg = container.querySelector('img') !== null;
    const strong = container.querySelector('strong')?.textContent;
    const items = container.querySelectorAll('li').length;
    const showsTagAsText = container.textContent?.includes('<img');
    root.unmount();
    container.remove();
    if (hasImg) throw new Error('Se creó un <img> a partir del texto');
    if (!showsTagAsText) throw new Error('La etiqueta debería verse como texto');
    if (strong !== 'Regá') throw new Error(`Negrita esperada "Regá", obtenida "${strong}"`);
    if (items !== 2) throw new Error(`Se esperaban 2 ítems de lista, hubo ${items}`);
  });

  await assert('12. run_all_tests cuenta casos a partir de las marcas', () => {
    const out = '  ✓ [PASÓ] a\n  ✅ PASSED: b\n  ✗ [FALLÓ] c\n  ❌ FAILED: d\n  ⚠️ [OMITIDA] e\nTOTAL PASSED: 2';
    const c = countSuiteResults(out);
    if (c.passed !== 2 || c.failed !== 2 || c.skipped !== 1) {
      throw new Error(`Conteo inesperado: ${JSON.stringify(c)}`);
    }
  });

  console.log('\n================================================================');
  console.log(` RESULTADO CORRECCIONES FASE 2: ${passed} pasadas, ${failed} fallidas de ${passed + failed}`);
  console.log('================================================================\n');
  return { passed, failed };
}

if (process.argv[1]?.endsWith('phase2_corrections.test.ts')) {
  runPhase2CorrectionsTests()
    .then((res) => process.exit(res.failed > 0 ? 1 : 0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
