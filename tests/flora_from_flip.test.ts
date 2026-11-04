/**
 * tests/flora_from_flip.test.ts
 *
 * SUITE: LA FLORACIÓN SE CUENTA DESDE EL 12/12 (preflora y maduración incluidas).
 *
 * Los días de flora que da el banco se cuentan desde el cambio a 12/12 hasta el corte. Las etapas son
 * Germinación, Plántula, Vegetativo, Floración, Cosecha, Secado y Curado: la preflora es el principio de
 * la floración y la maduración, su final.
 *
 * 1. Las etapas de cada esquema (fotoperiódica, automática, exterior y sativa larga), sin Prefloración ni Maduración.
 * 2. Genética de 55 días que pasa hoy a 12/12: corte en 55 días (antes daba 72).
 * 3. Cultivo guardado en "Prefloración" hace 10 días: se lee como Floración desde ese día; corte en 45.
 * 4. El caso del dueño: 20 días de preflora anotados y Floración desde hoy: la flora cuenta desde el
 *    12/12 (hace 20 días) y el corte es en 35 (antes daba 65 desde hoy).
 * 5. Cultivo guardado en "Maduración": sigue en Floración desde el 12/12 y corta cuando corresponde.
 * 6. Partes de la floración: preflora (semanas 1–3), engorde y maduración (últimos 10 días).
 * 7. El lavado de raíces y el control de tricomas, con los días de la genética desde el 12/12.
 * 8. Pasar a Floración marca el día del 12/12.
 */

import type { Cultivation, Genetics } from '../src/types';
import {
  addDays,
  buildCultivationStageSchedule,
  computeStageTransition,
  daysBetween,
  floraPhaseOf,
  getLocalTodayDateOnly,
  getStagesForCultivation,
  normalizeCultivationStages,
} from '../src/utils/growthStageUtils';
import { buildDailyTasks } from '../src/utils/dailyTasks';

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ [PASÓ] ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ [FALLÓ] ${name}: ${err?.message || err}`);
  }
}
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const today = getLocalTodayDateOnly();
const ago = (d: number) => addDays(today, -d);
const genetics: Genetics[] = [{ id: 'g1', name: 'Purple Punch', declaredFloweringDays: 55 } as Genetics];
const crop = (extra: Partial<Cultivation> = {}): Cultivation =>
  ({
    id: 'c1',
    userId: 'u1',
    name: 'Purple Punch',
    geneticsName: 'Purple Punch',
    geneticsId: 'g1',
    startDate: ago(80),
    type: 'Indoor',
    photoperiodType: 'Fotoperiódica',
    plantCount: 1,
    currentStage: 'Vegetativo',
    stageStartDate: ago(40),
    substrate: { type: 'Turba', potVolumeLiters: 11, potType: 'Geotextil' },
    status: 'ESTABLE',
    cycleStartKnown: true,
    createdAt: '',
    updatedAt: '',
    ...extra,
  }) as Cultivation;
const stage = (name: string, start?: string, end?: string, done = false) => ({
  id: `st_${name}`,
  name: name as any,
  startDate: start || '',
  endDate: end,
  actualStartDate: start,
  actualEndDate: end,
  expectedDurationDays: 7,
  isCompleted: done,
});
const NEW_STAGES = 'Germinación,Plántula,Vegetativo,Floración,Cosecha,Secado,Curado';

async function run() {
  console.log('\n================================================================');
  console.log('   FLORACIÓN DESDE EL 12/12');
  console.log('================================================================\n');

  await check('1. Etapas de cada esquema: sin Prefloración ni Maduración, con Cosecha', () => {
    const names = (c: Partial<Cultivation>) => getStagesForCultivation(crop(c)).map((s) => s.name).join(',');
    assert(names({}) === NEW_STAGES, `fotoperiódica: ${names({})}`);
    assert(names({ photoperiodType: 'Automática' as any }) === NEW_STAGES, `automática: ${names({ photoperiodType: 'Automática' as any })}`);
    assert(names({ type: 'Outdoor' as any }) === NEW_STAGES, `exterior: ${names({ type: 'Outdoor' as any })}`);
    assert(names({ declaredFloweringWeeks: 12 }) === NEW_STAGES, `sativa larga: ${names({ declaredFloweringWeeks: 12 })}`);
  });

  await check('2. Genética de 55 días que pasa hoy a 12/12: corte en 55 días', () => {
    const s = buildCultivationStageSchedule(crop({ currentStage: 'Floración', stageStartDate: today, floweringStartDate: today }), genetics);
    assert(daysBetween(today, s.estimatedHarvestDate) === 55, `corte en ${daysBetween(today, s.estimatedHarvestDate)} días`);
    assert(s.stages.map((x) => x.name).join(',') === NEW_STAGES, s.stages.map((x) => x.name).join(','));
    assert(s.floweringDaysGenetics === 55, String(s.floweringDaysGenetics));
  });

  await check('3. Guardado en "Prefloración" hace 10 días: Floración desde ese día, corte en 45', () => {
    const raw = crop({ currentStage: 'Prefloración' as any, stageStartDate: ago(10) });
    const n = normalizeCultivationStages(raw);
    assert(n.currentStage === 'Floración' && n.floweringStartDate === ago(10) && n.stageStartDate === ago(10), JSON.stringify({ st: n.currentStage, f: n.floweringStartDate }));
    const s = buildCultivationStageSchedule(raw, genetics);
    assert(daysBetween(today, s.estimatedHarvestDate) === 45, `corte en ${daysBetween(today, s.estimatedHarvestDate)}`);
    assert(s.activeStage.name === 'Floración' && s.activeStageElapsedDays === 11, `${s.activeStage.name} día ${s.activeStageElapsedDays}`);
  });

  await check('4. 20 días de preflora anotados y Floración desde hoy: la flora cuenta desde el 12/12', () => {
    const raw = crop({
      currentStage: 'Floración',
      stageStartDate: today,
      floweringStartDate: today,
      stagesTimeline: [
        stage('Germinación', ago(80), ago(73), true),
        stage('Plántula', ago(73), ago(60), true),
        stage('Vegetativo', ago(60), ago(20), true),
        stage('Prefloración', ago(20), today, true),
        stage('Floración', today),
        { ...stage('Maduración'), actualStartDate: undefined, startDate: '' },
        stage('Secado'),
        stage('Curado'),
      ] as any,
    });
    const n = normalizeCultivationStages(raw);
    assert(n.floweringStartDate === ago(20), `12/12: ${n.floweringStartDate}`);
    assert((n.stagesTimeline || []).map((x) => x.name).join(',') === NEW_STAGES, (n.stagesTimeline || []).map((x) => x.name).join(','));
    const flor = n.stagesTimeline!.find((x) => x.name === 'Floración')!;
    assert(flor.actualStartDate === ago(20) && !flor.actualEndDate, JSON.stringify(flor));
    const s = buildCultivationStageSchedule(raw, genetics);
    assert(daysBetween(today, s.estimatedHarvestDate) === 35, `corte en ${daysBetween(today, s.estimatedHarvestDate)} días (antes 65)`);
    // el vegetativo terminó el día del 12/12
    assert(s.stages.find((x) => x.name === 'Vegetativo')?.endDate === ago(20), JSON.stringify(s.stages.find((x) => x.name === 'Vegetativo')));
  });

  await check('5. Guardado en "Maduración": sigue en Floración desde el 12/12', () => {
    const raw = crop({
      currentStage: 'Maduración' as any,
      stageStartDate: ago(3),
      floweringStartDate: ago(30),
      stagesTimeline: [
        stage('Germinación', ago(110), ago(103), true),
        stage('Plántula', ago(103), ago(90), true),
        stage('Vegetativo', ago(90), ago(50), true),
        stage('Prefloración', ago(50), ago(30), true),
        stage('Floración', ago(30), ago(3), true),
        stage('Maduración', ago(3)),
        stage('Cosecha'),
        stage('Secado'),
        stage('Curado'),
      ] as any,
    });
    const n = normalizeCultivationStages(raw);
    const flor = n.stagesTimeline!.find((x) => x.name === 'Floración')!;
    assert(n.currentStage === 'Floración' && n.floweringStartDate === ago(50) && flor.actualStartDate === ago(50) && !flor.actualEndDate, JSON.stringify({ st: n.currentStage, f: n.floweringStartDate, flor }));
    const s = buildCultivationStageSchedule(raw, genetics);
    assert(daysBetween(today, s.estimatedHarvestDate) === 5, `corte en ${daysBetween(today, s.estimatedHarvestDate)} días`);
    assert(s.stages.filter((x) => x.name === 'Cosecha').length === 1, 'una sola Cosecha');
  });

  await check('6. Partes de la floración: preflora, engorde y maduración', () => {
    assert(floraPhaseOf(1, 55) === 'preflora' && floraPhaseOf(21, 55) === 'preflora', 'semanas 1 a 3: preflora');
    assert(floraPhaseOf(22, 55) === 'engorde' && floraPhaseOf(45, 55) === 'engorde', 'engorde');
    assert(floraPhaseOf(46, 55) === 'maduracion' && floraPhaseOf(55, 55) === 'maduracion', 'últimos 10 días: maduración');
    // una floración corta no se queda casi toda en preflora
    assert(floraPhaseOf(20, 45) === 'engorde' && floraPhaseOf(18, 45) === 'preflora', 'floración corta');
  });

  await check('7. Lavado de raíces y control de tricomas con los días desde el 12/12', () => {
    const tasksAt = (daysOfFlora: number) =>
      buildDailyTasks([crop({ currentStage: 'Floración', stageStartDate: ago(daysOfFlora), floweringStartDate: ago(daysOfFlora) })], [], [], {}, [], genetics);
    assert(!tasksAt(30).some((t) => t.type === 'flush'), 'a los 30 días de 55 todavía no');
    const flush = tasksAt(45).find((t) => t.type === 'flush');
    assert(flush && /^Día 45 de flora/.test(flush.description), flush?.description || 'sin lavado a los 45 días');
    const legacy = buildDailyTasks([crop({ currentStage: 'Maduración' as any, stageStartDate: ago(2), floweringStartDate: ago(47) })], [], [], {}, [], genetics);
    assert(legacy.some((t) => t.type === 'flush'), 'un cultivo guardado en Maduración también');
    const harvest = tasksAt(54).find((t) => t.type === 'harvest');
    assert(harvest && /de 55 desde el 12\/12/.test(harvest.description), harvest?.description || 'sin control de tricomas');
  });

  await check('8. Pasar a Floración marca el día del 12/12', () => {
    const c = crop({ currentStage: 'Vegetativo', stageStartDate: ago(30) });
    const stages = getStagesForCultivation(c);
    const r = computeStageTransition(c, stages, 'Floración', today);
    assert(r.updates.currentStage === 'Floración' && r.updates.floweringStartDate === today, JSON.stringify(r.updates));
    const after = buildCultivationStageSchedule({ ...c, ...r.updates } as Cultivation, genetics);
    assert(daysBetween(today, after.estimatedHarvestDate) === 55, `corte en ${daysBetween(today, after.estimatedHarvestDate)}`);
  });

  console.log('\n================================================================');
  console.log(` RESULTADO FLORACIÓN DESDE EL 12/12: ${passed} pasadas, ${failed} fallidas de ${passed + failed}`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en flora_from_flip:', err);
  process.exit(1);
});
