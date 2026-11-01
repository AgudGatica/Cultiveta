/**
 * tests/community_server.test.ts
 *
 * SUITE: COMUNIDAD — SERVIDOR (src/server/community/communityService.ts, src/utils/growlog.ts)
 *
 * Perfil:
 *  1. Hay que aceptar las normas; @usuario válido, único y que se libera al cambiarlo; ubicación sin números.
 * Growlogs:
 *  2. Sin perfil no se publica; un cultivo ajeno o de ejemplo, tampoco.
 *  3. Publicar arma la copia pública de UNA genética sin nada privado (coordenadas, ids, notas del cultivo,
 *     portada privada) y con las fotos copiadas y limpias (sin el GPS).
 *  4. Volver a publicar la misma genética actualiza la misma copia; No listado no cuenta en el perfil.
 *  5. Actualizar: espera 30 s entre vueltas, copia la foto nueva y borra la que ya no está.
 *  6. Si se borra el cultivo, sus growlogs se van solos.
 *  7. Dejar de compartir: solo el dueño (o el admin) y se borran copia y fotos.
 * Moderación:
 *  8. No se denuncia lo propio; la misma persona cuenta una vez; con 3 se oculta y sale de Explorar.
 *  9. El admin vuelve a mostrar (y se cierran las denuncias) o borra.
 * 10. Borrar la cuenta se lleva perfil, @usuario, growlogs y fotos.
 */

import { CommunityError, CommunityService, REFRESH_MIN_MS } from '../src/server/community/communityService';
import { MemoryCommunityDb, MemoryCommunityFiles } from '../src/server/community/communityStore';
import { cleanLocation, growlogMatches, growlogTokens, mediumOf } from '../src/utils/growlog';

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

async function rejects(p: Promise<unknown>, re: RegExp, status?: number) {
  try {
    await p;
  } catch (err: any) {
    assert(re.test(err?.message || ''), `mensaje: ${err?.message}`);
    if (status) assert(err instanceof CommunityError && err.status === status, `status ${err?.status}`);
    return;
  }
  throw new Error(`no falló (esperaba ${re})`);
}

const asc = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
function jpegWithGps(tag: string): Uint8Array {
  const exif = [...asc('Exif'), 0, 0, 0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...asc(`GPS ${tag}`)];
  const len = exif.length + 2;
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...exif, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x11, 0x22, 0xff, 0xd9]);
}
const hasText = (b: Uint8Array | null | undefined, s: string) => !!b && Buffer.from(b).includes(Buffer.from(s, 'latin1'));

let clock = new Date('2026-11-01T12:00:00Z');
const tick = (ms: number) => (clock = new Date(clock.getTime() + ms));

function setup() {
  const db = new MemoryCommunityDb();
  const files = new MemoryCommunityFiles();
  const svc = new CommunityService(db, files, () => clock);
  const crop = {
    userId: 'u1',
    name: 'Carpa de otoño',
    startDate: '2026-09-01',
    type: 'Indoor',
    plantCount: 3,
    geneticsList: [
      { id: 'g-a', name: 'Gelato 33', seedBank: 'Barney', photoperiodType: 'Fotoperiódica', plantCount: 2 },
      { id: 'g-b', name: 'Northern Lights', seedBank: 'Sensi', photoperiodType: 'Automática', plantCount: 1 },
    ],
    currentStage: 'Floración',
    stageStartDate: '2026-10-01',
    stagesTimeline: [{ id: 's1', name: 'Vegetativo', startDate: '2026-09-01', expectedDurationDays: 30, notes: 'nota privada de etapa' }],
    substrate: { type: 'Coco', potVolumeLiters: 11, potType: 'Tela' },
    lighting: { type: 'LED', usedWatts: 240, photoperiodHoursLight: 12 },
    locationCoordinates: { lat: -34.6, lon: -58.38 },
    indoorId: 'in1',
    notes: 'NOTA PRIVADA DEL CULTIVO',
    coverPhotoUrl: 'https://privado/portada.jpg',
    alertThresholds: { tempMaxC: 30 },
    status: 'Saludable',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };
  db.docs.set('cultivations/c1', crop);
  db.docs.set('cultivations/demo', { ...crop, isDemo: true });
  db.docs.set('cultivations/ajeno', { ...crop, userId: 'u2' });
  db.docs.set('indoors/in1', { userId: 'u1', name: 'Carpa 120', kind: 'carpa', environment: 'indoor', lighting: { type: 'LED', usedWatts: 320 } });
  const photo = (id: string, date: string) => {
    const storagePath = `users/u1/cultivations/c1/photos/${id}.jpg`;
    db.docs.set(`photos/${id}`, { userId: 'u1', cultivationId: 'c1', url: `https://privado/${id}`, storagePath, date, dayOfCultivation: 10, stage: 'Floración', category: 'general', caption: `foto ${id}`, createdAt: `${date}T10:00:00Z` });
    files.files.set(storagePath, { bytes: jpegWithGps(`-34.60 ${id}`), contentType: 'image/jpeg' });
  };
  photo('p1', '2026-10-05');
  photo('p2', '2026-10-12');
  db.docs.set('waterings/w1', { userId: 'u1', cultivationId: 'c1', date: '2026-10-06', volumeLiters: 2, phIn: 6.1, observations: 'regado', createdAt: '2026-10-06T00:00:00Z' });
  db.docs.set('diaryEntries/d1', { userId: 'u1', cultivationId: 'c1', date: '2026-10-07', content: 'Empezó a oler', photoUrls: ['https://privado/x'], createdAt: '2026-10-07', updatedAt: '2026-10-07' });
  db.docs.set('environmentRecords/e1', { userId: 'u1', cultivationId: 'c1', date: '2026-10-08', time: '09:00', temperatureC: 25, humidityPct: 55, createdAt: '2026-10-08T12:00:00Z' });
  return { db, files, svc };
}

const profileInput = { handle: 'Agus_Grow', displayName: 'Agus', bio: 'Cultivo en casa', acceptRules: true, level: 7, levelName: 'Cultivador' };

async function run() {
  console.log('\n🧪 Comunidad — servidor\n');

  await check('1. Perfil: normas, @usuario único y ubicación general', async () => {
    const { svc, db } = setup();
    await rejects(svc.saveProfile('u1', { ...profileInput, acceptRules: false }), /normas/);
    await rejects(svc.saveProfile('u1', { ...profileInput, handle: 'a b' }), /3 a 20/);
    await rejects(svc.saveProfile('u1', { ...profileInput, handle: 'admin' }), /reservado/);
    await rejects(svc.saveProfile('u1', { ...profileInput, location: 'Av. Corrientes 1234' }), /sin direcciones/);
    const p = await svc.saveProfile('u1', { ...profileInput, avatarMode: 'google', location: 'Argentina, Buenos Aires' }, { googlePhoto: 'https://google/foto.jpg' });
    assert(p.handle === 'agus_grow' && p.avatarMode === 'google' && p.avatarUrl === 'https://google/foto.jpg' && p.location === 'Argentina, Buenos Aires', JSON.stringify(p));
    assert((await db.get('handles/agus_grow'))?.uid === 'u1', 'reserva el usuario');
    await rejects(svc.saveProfile('u2', { ...profileInput, handle: 'agus_grow' }), /ya lo usa otra persona/, 409);
    const sinGoogle = await svc.saveProfile('u2', { ...profileInput, handle: 'otro', avatarMode: 'google' });
    assert(sinGoogle.avatarMode === 'incognito' && sinGoogle.avatarUrl === null && /^#/.test(sinGoogle.avatarColor), 'sin foto de Google queda incógnito');
    await svc.saveProfile('u1', { handle: 'agus2' });
    assert(!(await db.get('handles/agus_grow')) && (await db.get('handles/agus2'))?.uid === 'u1', 'libera el usuario viejo');
  });

  await check('2. Sin perfil, cultivo ajeno o de ejemplo: no se publica', async () => {
    const { svc } = setup();
    await rejects(svc.publish('u1', { cropId: 'c1', geneticIndex: 0, privacy: 'public' }), /perfil/, 409);
    await svc.saveProfile('u1', profileInput);
    await rejects(svc.publish('u1', { cropId: 'ajeno', geneticIndex: 0, privacy: 'public' }), /No encontramos/, 404);
    await rejects(svc.publish('u1', { cropId: 'demo', geneticIndex: 0, privacy: 'public' }), /ejemplo/);
    await rejects(svc.publish('u1', { cropId: 'c1', geneticIndex: 5, privacy: 'public' }), /no está en el cultivo/, 404);
    await rejects(svc.publish('u1', { cropId: 'c1', geneticIndex: 0, privacy: 'privado' }), /No listado o Público/);
  });

  await check('3. La copia pública: una genética, nada privado y fotos limpias', async () => {
    const { svc, db, files } = setup();
    await svc.saveProfile('u1', profileInput);
    const g = await svc.publish('u1', { cropId: 'c1', geneticIndex: 1, privacy: 'public', location: 'Córdoba' });
    assert(g.title === 'Northern Lights' && g.bank === 'Sensi' && g.photoperiodType === 'Automática' && g.plants === 1, JSON.stringify([g.title, g.bank, g.plants]));
    assert(g.env === 'indoor' && g.medium === 'coco' && g.light === 'LED 320 W' && g.location === 'Córdoba', `${g.env} ${g.medium} ${g.light}`);
    assert(g.listed && g.ownerHandle === 'agus_grow' && g.ownerUid === 'u1', 'listado y con el grower');
    const json = JSON.stringify(g);
    for (const bad of ['locationCoordinates', '-58.38', 'NOTA PRIVADA', 'nota privada de etapa', 'https://privado', 'alertThresholds', 'users/u1/']) assert(!json.includes(bad), `se filtró "${bad}"`);
    assert(g.waterings.length === 1 && g.waterings[0].userId === '' && g.waterings[0].phIn === 6.1, 'riego sin dueño');
    assert(g.notes.length === 1 && !(g.notes[0] as any).photoUrls, 'nota sin fotos privadas');
    assert(g.climate.length === 1 && g.climate[0].temp === 25, 'clima');
    assert(g.photos.length === 2 && g.photos.every((p) => p.path.startsWith(`community/growlogs/${g.id}/`)), 'fotos copiadas');
    for (const p of g.photos) assert(!hasText(await files.read(p.path), 'GPS'), `la foto ${p.id} quedó con GPS`);
    assert(g.coverUrl === g.photos[1].url && g.crop.coverPhotoUrl === g.coverUrl, 'portada = última foto');
    assert(g.tokens.includes('northern') && g.tokens.includes('agus_grow'), g.tokens.join());
    assert((await db.get('profiles/u1')).growlogs === 1, 'cuenta en el perfil');
  });

  await check('4. Republicar actualiza la misma copia; No listado no cuenta', async () => {
    const { svc, db } = setup();
    await svc.saveProfile('u1', profileInput);
    const a = await svc.publish('u1', { cropId: 'c1', geneticIndex: 0, privacy: 'public' });
    const b = await svc.publish('u1', { cropId: 'c1', geneticIndex: 0, privacy: 'unlisted' });
    assert(a.id === b.id && !b.listed && b.privacy === 'unlisted', 'misma copia, no listada');
    assert((await db.query('growlogs')).length === 1, 'una sola');
    assert((await db.get('profiles/u1')).growlogs === 0, 'no listado no cuenta');
    const other = await svc.publish('u1', { cropId: 'c1', geneticIndex: 1, privacy: 'public' });
    assert(other.id !== a.id && (await svc.myGrowlogs('u1')).length === 2, 'la otra genética es otro growlog');
  });

  await check('5. Actualizar: cada 30 s, foto nueva y foto borrada', async () => {
    const { svc, db, files } = setup();
    await svc.saveProfile('u1', profileInput);
    const g = await svc.publish('u1', { cropId: 'c1', geneticIndex: 0, privacy: 'public' });
    db.docs.set('photos/p3', { userId: 'u1', cultivationId: 'c1', url: 'x', storagePath: 'users/u1/cultivations/c1/photos/p3.jpg', date: '2026-10-20', dayOfCultivation: 50, stage: 'Floración', category: 'general', createdAt: '2026-10-20T00:00:00Z' });
    files.files.set('users/u1/cultivations/c1/photos/p3.jpg', { bytes: jpegWithGps('p3'), contentType: 'image/jpeg' });
    db.docs.delete('photos/p1');
    assert((await svc.refreshCrop('u1', 'c1')) === 0, 'muy pronto: no hace nada');
    tick(REFRESH_MIN_MS + 1000);
    assert((await svc.refreshCrop('u1', 'c1')) === 1, 'actualiza');
    const after = (await db.get(`growlogs/${g.id}`)) as any;
    assert(after.photos.map((p: any) => p.id).join() === 'p2,p3', after.photos.map((p: any) => p.id).join());
    assert(!files.files.has(`community/growlogs/${g.id}/p1.jpg`) && files.files.has(`community/growlogs/${g.id}/p3.jpg`), 'archivos al día');
    assert(after.publishedAt === g.publishedAt && after.updatedAt !== g.updatedAt, 'mantiene la fecha de publicación');
  });

  await check('6. Cultivo borrado: sus growlogs se van', async () => {
    const { svc, db, files } = setup();
    await svc.saveProfile('u1', profileInput);
    const g = await svc.publish('u1', { cropId: 'c1', geneticIndex: 0, privacy: 'public' });
    db.docs.delete('cultivations/c1');
    await svc.refreshCrop('u1', 'c1');
    assert(!(await db.get(`growlogs/${g.id}`)) && ![...files.files.keys()].some((k) => k.startsWith('community/')), 'borrado');
    assert((await db.get('profiles/u1')).growlogs === 0, 'perfil al día');
  });

  await check('7. Dejar de compartir: solo el dueño o el admin', async () => {
    const { svc, db, files } = setup();
    await svc.saveProfile('u1', profileInput);
    const g = await svc.publish('u1', { cropId: 'c1', geneticIndex: 0, privacy: 'public' });
    db.docs.set(`growlogs/${g.id}/comments/k1`, { authorUid: 'u2', text: 'hola' });
    await rejects(svc.unpublish('u2', g.id), /no es tuyo/, 403);
    await svc.unpublish('u1', g.id);
    assert(!(await db.get(`growlogs/${g.id}`)) && !(await db.get(`growlogs/${g.id}/comments/k1`)), 'copia y comentarios borrados');
    assert(![...files.files.keys()].some((k) => k.startsWith(`community/growlogs/${g.id}/`)), 'fotos borradas');
  });

  await check('8. Denuncias: lo propio no, una por persona, con 3 se oculta', async () => {
    const { svc, db } = setup();
    await svc.saveProfile('u1', profileInput);
    const g = await svc.publish('u1', { cropId: 'c1', geneticIndex: 0, privacy: 'public' });
    await rejects(svc.report('u1', { kind: 'growlog', targetId: g.id, reason: 'spam' }), /algo tuyo/);
    await rejects(svc.report('u2', { kind: 'growlog', targetId: g.id, reason: 'nada' }), /motivo/);
    assert(!(await svc.report('u2', { kind: 'growlog', targetId: g.id, reason: 'venta' })).hidden, '1');
    assert(!(await svc.report('u2', { kind: 'growlog', targetId: g.id, reason: 'venta' })).hidden, 'la misma persona otra vez');
    assert(((await db.get(`growlogs/${g.id}`)) as any).reports === 1, 'cuenta una vez');
    await svc.report('u3', { kind: 'growlog', targetId: g.id, reason: 'spam' });
    assert((await svc.report('u4', { kind: 'growlog', targetId: g.id, reason: 'ofensivo', text: 'vende' })).hidden, 'con 3 se oculta');
    const hidden = (await db.get(`growlogs/${g.id}`)) as any;
    assert(hidden.hidden && !hidden.listed, 'sale de Explorar');
    assert((await db.get('profiles/u1')).growlogs === 0, 'no cuenta en el perfil');
    const again = await svc.publish('u1', { cropId: 'c1', geneticIndex: 0, privacy: 'public' });
    assert(again.hidden && !again.listed, 'republicar no lo destapa');
  });

  await check('9. El admin vuelve a mostrar o borra', async () => {
    const { svc, db } = setup();
    await svc.saveProfile('u1', profileInput);
    const g = await svc.publish('u1', { cropId: 'c1', geneticIndex: 0, privacy: 'public' });
    for (const u of ['u2', 'u3', 'u4']) await svc.report(u, { kind: 'growlog', targetId: g.id, reason: 'spam' });
    const open = await svc.openReports();
    assert(open.length === 1 && open[0].reports.length === 3 && open[0].target?.title === 'Gelato 33', JSON.stringify(open.map((o) => o.reports.length)));
    await svc.resolveReports({ kind: 'growlog', targetId: g.id, action: 'show' });
    const shown = (await db.get(`growlogs/${g.id}`)) as any;
    assert(!shown.hidden && shown.listed && shown.reports === 0, 'visible otra vez');
    assert((await svc.openReports()).length === 0, 'denuncias cerradas');
    await svc.report('u5', { kind: 'growlog', targetId: g.id, reason: 'spam' });
    await svc.resolveReports({ kind: 'growlog', targetId: g.id, action: 'delete' });
    assert(!(await db.get(`growlogs/${g.id}`)), 'borrado por el admin');
  });

  await check('10. Borrar la cuenta se lleva todo lo de la comunidad', async () => {
    const { svc, db, files } = setup();
    await svc.saveProfile('u1', profileInput);
    await svc.setAvatarPhoto('u1', jpegWithGps('avatar'), 'image/jpeg');
    const avatar = files.files.get('community/avatars/u1.jpg');
    assert(avatar && !hasText(avatar.bytes, 'GPS'), 'avatar limpio');
    assert((await db.get('profiles/u1')).avatarMode === 'photo', 'foto propia');
    await svc.publish('u1', { cropId: 'c1', geneticIndex: 0, privacy: 'public' });
    await svc.deleteAllForUser('u1');
    assert(!(await db.get('profiles/u1')) && !(await db.get('handles/agus_grow')), 'perfil y usuario');
    assert((await db.query('growlogs')).length === 0 && ![...files.files.keys()].some((k) => k.startsWith('community/')), 'growlogs y archivos');
  });

  await check('12. Explorar, perfil de grower, Seguir y Siguiendo', async () => {
    const { svc, db } = setup();
    await svc.saveProfile('u1', profileInput);
    await svc.saveProfile('u2', { ...profileInput, handle: 'luna', displayName: 'Luna' });
    const pub = await svc.publish('u1', { cropId: 'c1', geneticIndex: 0, privacy: 'public' });
    const unl = await svc.publish('u1', { cropId: 'c1', geneticIndex: 1, privacy: 'unlisted' });
    const ex = await svc.explore('u2');
    assert(ex.growlogs.map((g) => g.id).join() === pub.id, 'Explorar: solo lo público');
    assert(!(ex.growlogs[0] as any).waterings && !(ex.growlogs[0] as any).crop && ex.growlogs[0].photosCount === 2, 'tarjeta liviana');
    assert(ex.growers.some((p) => p.handle === 'agus_grow') && ex.growers.every((p) => !(p as any).acceptedRulesAt), 'growers');
    const asOther = await svc.grower('u2', 'agus_grow');
    assert(asOther.growlogs.length === 1 && !asOther.following, 'otro ve solo lo público');
    const asOwner = await svc.grower('u1', 'AGUS_GROW');
    assert(asOwner.growlogs.length === 2, 'el dueño ve también lo no listado');
    assert((await svc.getGrowlog('u2', unl.id)).id === unl.id, 'no listado se abre con el enlace');
    await rejects(svc.follow('u1', { uid: 'u1' }), /vos/);
    await rejects(svc.follow('u3', { uid: 'u1' }), /perfil/, 409);
    const f = await svc.follow('u2', { uid: 'u1', follow: true });
    await svc.follow('u2', { uid: 'u1', follow: true });
    assert(f.following && (await db.get('profiles/u1')).followers === 1 && (await db.get('profiles/u2')).following === 1, 'sigue una vez');
    assert((await svc.grower('u2', 'agus_grow')).following, 'figura como seguido');
    const feed = await svc.feed('u2');
    assert(feed.map((g) => g.id).join() === pub.id, 'Siguiendo: lo público de a quien seguís');
    await svc.follow('u2', { uid: 'u1', follow: false });
    assert((await db.get('profiles/u1')).followers === 0 && (await svc.feed('u2')).length === 0, 'deja de seguir');
    for (const u of ['u3', 'u4', 'u5']) await svc.report(u, { kind: 'profile', targetId: 'u1', reason: 'spam' });
    assert((await svc.explore('u2')).growlogs.length === 0, 'grower oculto: sus growlogs salen de Explorar');
    await rejects(svc.grower('u2', 'agus_grow'), /No encontramos/, 404);
  });

  await check('11. Ayudas: búsqueda, sustrato y ubicación', () => {
    assert(growlogMatches({ tokens: growlogTokens('Gelato 33', 'Barney Farms', 'agus') }, 'gela barn'), 'busca por el comienzo de cada palabra');
    assert(!growlogMatches({ tokens: growlogTokens('Gelato 33') }, 'skunk'), 'no coincide');
    assert(growlogTokens('Floración ÍNDICA').includes('floracion'), 'sin tildes');
    assert(mediumOf('Hidroponía') === 'hidro' && mediumOf('Fibra de coco') === 'coco' && mediumOf('Tierra / Sustrato') === 'tierra', 'sustratos');
    assert(cleanLocation('  Argentina,   Salta ').value === 'Argentina, Salta' && cleanLocation('-34.6, -58.4').error, 'ubicación');
  });

  console.log('\n================================================================');
  console.log(` RESULTADO: ${passed} pasaron, ${failed} fallaron`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run();
