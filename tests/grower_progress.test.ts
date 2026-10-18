/**
 * tests/grower_progress.test.ts
 *
 * SUITE: NIVEL DEL GROWER, XP, LOGROS Y RACHA (src/utils/growerProgress.ts)
 *
 * 1. levelInfo: sin XP, justo antes y justo en el umbral, y nivel máximo.
 * 2. XP: sin datos da 0; suma cada tipo de registro; el ambiente automático no cuenta.
 * 3. Cambios de etapa: no cuenta la primera etapa con fecha real.
 * 4. Datos de ejemplo: cuentan para mostrar y no para festejar.
 * 5. Logros: umbrales (litros, pH, floración, madrugador, rachas).
 * 6. Racha: sin datos, sin registros hoy (cuenta hasta ayer), racha cortada, mejor racha.
 * 7. diffProgress: primera vez inicializa sin festejar; un riego nuevo da +10; nivel y logro
 *    se festejan una sola vez.
 */

process.env.TZ = 'America/Argentina/Buenos_Aires';

const {
  levelInfo,
  computeProgress,
  computeStats,
  activeDays,
  currentStreak,
  bestStreak,
  countStageChanges,
  diffProgress,
  BADGES,
  BADGE_XP,
} = await import('../src/utils/growerProgress');
type ProgressInput = import('../src/utils/growerProgress').ProgressInput;

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`✓ [PASÓ] ${name}`);
  } else {
    failed++;
    console.log(`✗ [FALLÓ] ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function emptyInput(): ProgressInput {
  return {
    cultivations: [],
    waterings: [],
    environmentRecords: [],
    photos: [],
    diaryEntries: [],
    harvests: [],
    fertilizationSchedules: [],
    photoAnalyses: [],
  };
}

const TODAY = '2026-10-18';
const day = (offset: number) => {
  const d = new Date(2026, 9, 18 + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const watering = (date: string, extra: Record<string, unknown> = {}) => ({
  date,
  volumeLiters: 2,
  createdAt: `${date}T15:00:00-03:00`,
  ...extra,
});

// 1. levelInfo
{
  const l0 = levelInfo(0);
  check('levelInfo(0) → nivel 1 Semilla, barra en 0', l0.level === 1 && l0.name === 'Semilla' && l0.pct === 0 && l0.nextXp === 120);
  const l119 = levelInfo(119);
  check('levelInfo(119) sigue en nivel 1', l119.level === 1 && l119.nextName === 'Germinado');
  const l120 = levelInfo(120);
  check('levelInfo(120) sube justo en el umbral a Germinado', l120.level === 2 && l120.name === 'Germinado' && l120.pct === 0);
  const l640 = levelInfo(640);
  check('levelInfo(640) → nivel 4 Grower, 640/1000, barra 10 %', l640.level === 4 && l640.name === 'Grower' && l640.nextXp === 1000 && Math.abs(l640.pct - 0.1) < 1e-9);
  const lMax = levelInfo(9999);
  check('levelInfo en el máximo: Leyenda verde, sin próximo, barra llena', lMax.level === 8 && lMax.nextXp === null && lMax.pct === 1);
  check('levelInfo con XP negativo o inválido cuenta como 0', levelInfo(-5).xp === 0 && levelInfo(NaN).level === 1);
}

// 2. XP
{
  const empty = computeProgress(emptyInput(), { today: TODAY });
  check('Sin datos: 0 XP, nivel 1, sin logros, racha 0', empty.xp === 0 && empty.level.level === 1 && empty.unlockedBadgeIds.length === 0 && empty.stats.streak === 0);

  const input = emptyInput();
  input.waterings.push(watering(day(-3)));
  input.photos.push({ date: day(-3), createdAt: `${day(-3)}T15:00:00-03:00` });
  input.environmentRecords.push({ date: day(-3), createdAt: `${day(-3)}T15:00:00-03:00` });
  input.environmentRecords.push({ date: day(-3), createdAt: `${day(-3)}T15:00:00-03:00`, isAutoLogged: true });
  input.diaryEntries.push({ date: day(-3), createdAt: `${day(-3)}T15:00:00-03:00` });
  const p = computeProgress(input, { today: TODAY });
  // riego 10 + foto 12 + ambiente manual 6 + nota 8 = 36; logros: primer riego, primera foto, primera nota = 90
  check('XP suma riego, foto, ambiente manual y nota', p.stats.counts.watering === 1 && p.stats.counts.photo === 1 && p.stats.counts.diary === 1);
  check('El ambiente automático no da XP', p.stats.counts.environment === 1);
  check('XP total = registros + 30 por logro', p.xp === 36 + 3 * BADGE_XP, `xp=${p.xp}`);

  const more = emptyInput();
  more.cultivations.push({ currentStage: 'Vegetativo' });
  more.harvests.push({});
  more.fertilizationSchedules.push({});
  more.photoAnalyses.push({});
  const m = computeProgress(more, { today: TODAY });
  // cultivo 15 + cosecha 40 + tabla 10 + IA 5 = 70; logros: primer cultivo, cosecha, tabla, IA = 120
  check('XP de cultivo, cosecha, tabla de fertilización y análisis IA', m.xp === 70 + 4 * BADGE_XP, `xp=${m.xp}`);
}

// 3. Cambios de etapa
{
  const stage = (name: string, actualStartDate?: string) => ({ id: name, name, startDate: '2026-01-01', expectedDurationDays: 7, actualStartDate });
  check('Sin etapas: 0 cambios', countStageChanges({ stagesTimeline: undefined }) === 0);
  check('Una sola etapa con fecha real (el arranque) no cuenta', countStageChanges({ stagesTimeline: [stage('Plántula', '2026-01-01'), stage('Vegetativo')] }) === 0);
  check('Tres etapas con fecha real = 2 cambios', countStageChanges({ stagesTimeline: [stage('Plántula', '2026-01-01'), stage('Vegetativo', '2026-01-15'), stage('Floración', '2026-02-20')] }) === 2);
}

// 4. Datos de ejemplo
{
  const input = emptyInput();
  input.waterings.push(watering(day(-1), { isDemo: true }));
  input.waterings.push(watering(day(-1)));
  const shown = computeProgress(input, { today: TODAY });
  const real = computeProgress(input, { today: TODAY, includeDemo: false });
  check('Los datos de ejemplo cuentan para mostrar', shown.stats.counts.watering === 2);
  check('Los datos de ejemplo no cuentan para festejar', real.stats.counts.watering === 1);
}

// 5. Logros
{
  const input = emptyInput();
  for (let i = 0; i < 10; i++) input.waterings.push(watering(day(-20 - i), { volumeLiters: 5, phIn: 6.2 }));
  const s = computeStats(input, { today: TODAY });
  const ids = computeProgress(input, { today: TODAY }).unlockedBadgeIds;
  check('50 L regados desbloquea "Medio centenar"', s.totalLiters === 50 && ids.includes('liters_50'));
  check('10 riegos con pH desbloquea "pH al día"', s.wateringsWithPh === 10 && ids.includes('ph_10'));
  check('Con 10 riegos no se desbloquea el de 25', !ids.includes('waterings_25'));

  const nine = emptyInput();
  for (let i = 0; i < 9; i++) nine.waterings.push(watering(day(-20 - i), { volumeLiters: 5, phIn: 6.2 }));
  check('Con 45 L y 9 pH no se desbloquean', !computeProgress(nine, { today: TODAY }).unlockedBadgeIds.some((id) => id === 'liters_50' || id === 'ph_10'));

  const flower = emptyInput();
  flower.cultivations.push({ currentStage: 'Prefloración' });
  check('Prefloración todavía no cuenta como flores', !computeProgress(flower, { today: TODAY }).unlockedBadgeIds.includes('first_flowers'));
  flower.cultivations.push({ currentStage: 'Finalizado' });
  check('Un cultivo finalizado ya floreció', computeProgress(flower, { today: TODAY }).unlockedBadgeIds.includes('first_flowers'));

  const early = emptyInput();
  early.waterings.push(watering(day(-2), { time: '07:30' }));
  check('Riego a las 7:30 → Madrugador', computeProgress(early, { today: TODAY }).unlockedBadgeIds.includes('early_bird'));
  const night = emptyInput();
  night.waterings.push(watering(day(-2), { time: '02:15' }));
  night.waterings.push(watering(day(-3), { time: '08:00' }));
  check('A las 2:15 o a las 8:00 no es Madrugador', !computeProgress(night, { today: TODAY }).unlockedBadgeIds.includes('early_bird'));
  const byCreated = emptyInput();
  byCreated.diaryEntries.push({ date: day(-2), createdAt: new Date(2026, 9, 16, 6, 10).toISOString() });
  check('Sin campo time usa la hora local de createdAt', computeProgress(byCreated, { today: TODAY }).unlockedBadgeIds.includes('early_bird'));

  check('Hay 17 logros y los ids no se repiten', BADGES.length === 17 && new Set(BADGES.map((b) => b.id)).size === 17);
}

// 6. Racha
{
  check('Sin registros: racha 0 y mejor racha 0', currentStreak(new Set(), TODAY) === 0 && bestStreak(new Set()) === 0);

  const withToday = new Set([day(0), day(-1), day(-2)]);
  check('Con registros hoy, ayer y anteayer: racha 3', currentStreak(withToday, TODAY) === 3);

  const noToday = new Set([day(-1), day(-2), day(-3), day(-4)]);
  check('Sin registros hoy: cuenta hasta ayer (4)', currentStreak(noToday, TODAY) === 4);

  const broken = new Set([day(0), day(-1), day(-3), day(-4), day(-5), day(-6)]);
  check('Racha cortada: solo cuentan los días desde el corte (2)', currentStreak(broken, TODAY) === 2);
  check('Mejor racha con un corte: 4', bestStreak(broken) === 4);

  const old = new Set([day(-2), day(-3)]);
  check('Si el último registro fue anteayer, la racha es 0', currentStreak(old, TODAY) === 0);

  const input = emptyInput();
  input.waterings.push(watering(day(0)));
  input.waterings.push(watering(day(0)));
  input.photos.push({ date: day(-1), createdAt: '' });
  input.environmentRecords.push({ date: day(-2), createdAt: '', isAutoLogged: true });
  input.diaryEntries.push({ date: `${day(-2)}T10:00:00.000Z`, createdAt: '' });
  const days = activeDays(input);
  check('Varios registros el mismo día cuentan una vez', days.has(day(0)) && days.size === 3);
  check('El ambiente automático no cuenta para la racha; la nota con hora sí', currentStreak(days, TODAY) === 3);

  const month = new Set<string>();
  for (let i = 0; i < 30; i++) month.add(day(-i - 40));
  check('30 días seguidos en el pasado: mejor racha 30 y racha actual 0', bestStreak(month) === 30 && currentStreak(month, TODAY) === 0);

  // Cruce de mes y cambio de año en hora local
  const crossing = new Set(['2026-12-30', '2026-12-31', '2027-01-01']);
  check('La racha cruza el fin de año', currentStreak(crossing, '2027-01-01') === 3 && bestStreak(crossing) === 3);
}

// 7. diffProgress
{
  const base = emptyInput();
  base.waterings.push(watering(day(-1)));
  const before = computeProgress(base, { today: TODAY, includeDemo: false });

  const first = diffProgress(null, before, null);
  check('Primera vez: inicializa sin festejar', first.initialize && first.newBadgeIds.length === 0 && first.levelUp === null && first.xpEvents.length === 0);

  const persisted = { badges: { first_watering: '2026-10-17T12:00:00.000Z' }, celebratedLevel: before.level.level };
  const withNew = { ...base, waterings: [...base.waterings, watering(day(0))] };
  const after = computeProgress(withNew, { today: TODAY, includeDemo: false });
  const d = diffProgress(before, after, persisted);
  check('Un riego nuevo da "+10 XP · Riego registrado"', d.xpEvents.length === 1 && d.xpEvents[0].xp === 10 && d.xpEvents[0].label === 'Riego registrado');
  check('Un logro ya guardado no se vuelve a festejar', !d.newBadgeIds.includes('first_watering'));

  const noBase = diffProgress(null, after, persisted);
  check('Recién cargada la app (sin base) no hay avisos de XP', noBase.xpEvents.length === 0);

  const deleted = diffProgress(after, before, persisted);
  check('Borrar un registro no genera avisos', deleted.xpEvents.length === 0);

  // Subida de nivel: de 119 a 120+ XP
  const lvl = emptyInput();
  for (let i = 0; i < 9; i++) lvl.waterings.push(watering(day(-30 - i * 2)));
  const p9 = computeProgress(lvl, { today: TODAY, includeDemo: false }); // 90 + 30 (primer riego) = 120 → nivel 2
  const persisted1 = { badges: { first_watering: 'x' }, celebratedLevel: 1 };
  const up = diffProgress(null, p9, persisted1);
  check('Cruzar el umbral festeja el nivel nuevo', p9.xp === 120 && up.levelUp?.level === 2 && up.levelUp?.name === 'Germinado', `xp=${p9.xp}`);
  const again = diffProgress(p9, p9, { ...persisted1, celebratedLevel: 2 });
  check('El nivel ya festejado no se repite', again.levelUp === null);
  const lower = diffProgress(p9, before, { ...persisted1, celebratedLevel: 2 });
  check('Si baja el XP no hay festejo', lower.levelUp === null);

  const newBadge = diffProgress(before, after, { badges: {}, celebratedLevel: 1 });
  check('Un logro sin fecha guardada se festeja', newBadge.newBadgeIds.includes('first_watering'));
}

console.log(`\nResultado: ${passed} pasados, ${failed} fallidos`);
if (failed > 0) process.exit(1);
