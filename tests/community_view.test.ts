/**
 * tests/community_view.test.ts
 *
 * SUITE: COMUNIDAD — PANTALLAS (src/components/community/*)
 *
 *  1. Explorar: growlog del mes, colecciones (Indoor, Exterior, Automáticas…), tus públicos y growers;
 *     el buscador filtra growlogs y growers; la pestaña elegida queda.
 *  2. Mis growlogs: cada genética con su privacidad; sin perfil, invita a armarlo.
 *  3. Compartir: elegir Público con ubicación publica; Privado deja de compartir.
 *  4. Primera vez: hay que aceptar las normas; guarda el perfil.
 *  5. Página del growlog: portada, grower, métricas, resumen automático, etapas, gráficos y la maceta.
 *  6. De otra persona: se puede denunciar (motivo obligatorio).
 *  7. Perfil de grower: datos, sus growlogs y Seguir / Siguiendo.
 *  8. Barra de abajo: Comunidad en lugar de IA, que pasa a "Más".
 */

import './helpers/setupDom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Cultivation } from '../src/types';
import { buildGrowlog, growlogCard, type Growlog, type GrowlogCard, type PublicProfile } from '../src/utils/growlog';
import { communityService } from '../src/services/communityService';
import { CommunityView } from '../src/components/community/CommunityView';
import { CommunityOnboarding } from '../src/components/community/CommunityOnboarding';
import { ShareGrowlogModal } from '../src/components/community/ShareGrowlogModal';
import { GrowlogView } from '../src/components/community/GrowlogView';
import { GrowerView } from '../src/components/community/GrowerView';
import { MobileNav } from '../src/components/common/MobileNav';

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

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

async function mount(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return { container, unmount: async () => { await act(async () => root.unmount()); container.remove(); } };
}
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = (el: Element | null) => act(async () => (el as HTMLElement).click());
function type(el: Element | null, value: string) {
  const input = el as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')!.set!;
  return act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

// --- servidor de mentira: guarda los pedidos y contesta según la dirección
const calls: Array<{ method: string; url: string; body: any }> = [];
let routes: Record<string, (body: any) => any> = {};
(globalThis as any).fetch = async (url: string, init: RequestInit = {}) => {
  const method = (init.method || 'GET').toUpperCase();
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body ?? null;
  calls.push({ method, url, body });
  const key = `${method} ${url.replace('/api/community', '')}`;
  const handler = Object.entries(routes).find(([k]) => key.startsWith(k))?.[1];
  const data = handler ? handler(body) : { error: 'sin ruta' };
  return { ok: !data?.error, status: data?.error ? 400 : 200, json: async () => data } as any;
};

const profile: PublicProfile = {
  uid: 'u1', handle: 'agus', displayName: 'Agus', avatarMode: 'incognito', avatarUrl: null, avatarColor: '#2D6B28', bio: 'Cultivo en casa',
  location: 'Córdoba', level: 7, levelName: 'Cultivador', followers: 3, following: 1, growlogs: 1, views: 40, hidden: false,
  acceptedRulesAt: '2026-10-01', createdAt: '2026-10-01', updatedAt: '2026-10-01',
};

const crop = {
  id: 'c1', userId: 'u1', name: 'Carpa de otoño', startDate: '2026-09-01', type: 'Indoor', plantCount: 3,
  geneticsList: [
    { id: 'g-a', name: 'Gelato 33', seedBank: 'Barney', photoperiodType: 'Fotoperiódica', plantCount: 2 },
    { id: 'g-b', name: 'Northern Lights', seedBank: 'Sensi', photoperiodType: 'Automática', plantCount: 1 },
  ],
  currentStage: 'Floración', stageStartDate: '2026-10-01', floweringStartDate: '2026-10-01',
  stagesTimeline: [
    { id: 's1', name: 'Vegetativo', startDate: '2026-09-01', endDate: '2026-09-30', expectedDurationDays: 30, isCompleted: true },
    { id: 's2', name: 'Floración', startDate: '2026-10-01', expectedDurationDays: 56 },
  ],
  substrate: { type: 'Coco', potVolumeLiters: 11, potType: 'Tela' },
  status: 'Saludable', createdAt: '2026-09-01', updatedAt: '2026-10-01',
} as unknown as Cultivation;

function growlog(id: string, extra: Partial<Growlog> = {}): Growlog {
  const g = buildGrowlog({
    id, crop, geneticIndex: 0, geneticKey: 'g-a', profile, privacy: 'public', location: 'Córdoba',
    photos: [{ id: 'p1', url: 'https://img/p1.jpg', path: `community/growlogs/${id}/p1.jpg`, date: '2026-10-05', dayOfCultivation: 35, stage: 'Floración', category: 'flor', caption: 'Primeros pelos' }],
    waterings: [
      { id: 'w1', userId: 'u1', cultivationId: 'c1', date: '2026-09-03', volumeLiters: 1, phIn: 6.0, createdAt: '' },
      { id: 'w2', userId: 'u1', cultivationId: 'c1', date: '2026-10-06', volumeLiters: 2, phIn: 6.2, createdAt: '' },
    ] as any,
    notes: [{ id: 'd1', userId: 'u1', cultivationId: 'c1', date: '2026-10-07', content: 'Empezó a oler', createdAt: '', updatedAt: '' }],
    envRecords: [{ date: '2026-10-08', time: '09:00', temperatureC: 25, humidityPct: 55, createdAt: '2026-10-08T12:00:00Z' }],
    ambient: { kind: 'carpa', environment: 'indoor', lighting: { type: 'LED', usedWatts: 320 } as any },
    now: '2026-10-20T10:00:00Z',
  });
  return { ...g, ...extra };
}

const other = (id: string, extra: Partial<GrowlogCard>): GrowlogCard => ({ ...growlogCard(growlog(id)), ownerUid: 'u2', ownerHandle: 'luna', ownerName: 'Luna', ...extra });

async function run() {
  console.log('\n🧪 Comunidad — pantallas\n');

  const cards: GrowlogCard[] = [
    other('a', { title: 'Gelato 33', views: 120, likes: 9, env: 'indoor', updatedAt: '2026-11-01T00:00:00Z', tokens: ['gelato', '33', 'luna'] }),
    other('b', { title: 'Critical', views: 30, likes: 2, env: 'exterior', medium: 'tierra', photoperiodType: 'Automática', tokens: ['critical', 'luna'] }),
    { ...growlogCard(growlog('mio')), views: 5 },
  ];
  const growers = [{ uid: 'u2', handle: 'luna', displayName: 'Luna', avatarUrl: null, avatarColor: '#1F6F8B', level: 4, levelName: '', followers: 8, growlogs: 2, location: null }];

  await check('1. Explorar: growlog del mes, colecciones, growers y buscador', async () => {
    routes = { 'GET /me': () => ({ profile, growlogs: [], isAdmin: false, googlePhoto: null }) };
    const opened: string[] = [];
    const m = await mount(
      React.createElement(CommunityView, {
        userId: 'u1', cultivations: [crop], onOpenGrowlog: (id: string) => opened.push(id), onOpenGrower: (h: string) => opened.push('@' + h), onOpenAdmin: () => {},
        initialExplore: { growlogs: cards, growers, following: [] }, initialFeed: [], now: new Date('2026-11-05T00:00:00Z'),
      })
    );
    await settle();
    const c = m.container;
    assert(/Growlog del mes/.test(c.querySelector('#community-top')?.textContent || '') && /Gelato 33/.test(c.querySelector('#community-top')?.textContent || ''), 'growlog del mes');
    for (const s of ['indoor', 'exterior', 'auto', 'tierra', 'mine']) assert(c.querySelector(`#community-section-${s}`), `colección ${s}`);
    assert(c.querySelectorAll('#community-section-indoor [data-growlog-card]').length === 2, 'indoor: 2');
    assert(c.querySelector('[data-grower="luna"]'), 'growers');
    await type(c.querySelector('#community-search'), 'crit');
    assert(c.querySelectorAll('#community-results [data-growlog-card]').length === 1 && /Critical/.test(c.querySelector('#community-results')?.textContent || ''), 'busca');
    await type(c.querySelector('#community-search'), 'nada que ver');
    assert(/Sin resultados/.test(c.textContent || ''), 'sin resultados');
    await type(c.querySelector('#community-search'), '');
    await click(c.querySelector('[data-growlog-card="b"]'));
    assert(opened.includes('b'), 'abre el growlog');
    await click(c.querySelector('#community-tab-siguiendo'));
    assert(/Todavía no seguís a nadie/.test(c.textContent || ''), 'siguiendo vacío');
    await m.unmount();
    const again = await mount(React.createElement(CommunityView, { userId: 'u1', cultivations: [crop], onOpenGrowlog: () => {}, onOpenGrower: () => {}, onOpenAdmin: () => {}, initialExplore: { growlogs: cards, growers, following: [] }, initialFeed: [] }));
    assert(again.container.querySelector('#community-tab-siguiendo')?.getAttribute('aria-selected') === 'true', 'recuerda la pestaña');
    await click(again.container.querySelector('#community-tab-explorar'));
    await again.unmount();
  });

  await check('2. Mis growlogs: privacidad por genética; sin perfil invita a armarlo', async () => {
    const shared = { ...growlogCard(growlog('mio')), privacy: 'unlisted' as const };
    routes = { 'GET /me': () => ({ profile, growlogs: [shared], isAdmin: false, googlePhoto: null }) };
    await communityService.loadMe(true);
    const m = await mount(React.createElement(CommunityView, { userId: 'u1', cultivations: [crop], onOpenGrowlog: () => {}, onOpenGrower: () => {}, onOpenAdmin: () => {}, initialExplore: { growlogs: [], growers: [], following: [] }, initialFeed: [] }));
    await click(m.container.querySelector('#community-tab-mios'));
    const rows = [...m.container.querySelectorAll('[data-my-growlog]')];
    assert(rows.length === 2, `una fila por genética: ${rows.length}`);
    assert(rows[0].getAttribute('data-privacy') === 'unlisted' && /No listado/.test(rows[0].textContent || ''), rows[0].textContent || '');
    assert(rows[1].getAttribute('data-privacy') === 'private' && /Privado/.test(rows[1].textContent || ''), 'la otra es privada');
    await m.unmount();
    routes = { 'GET /me': () => ({ profile: null, growlogs: [], isAdmin: false, googlePhoto: null }) };
    await communityService.loadMe(true);
    const n = await mount(React.createElement(CommunityView, { userId: 'u1', cultivations: [crop], onOpenGrowlog: () => {}, onOpenGrower: () => {}, onOpenAdmin: () => {}, initialExplore: { growlogs: [], growers: [], following: [] }, initialFeed: [] }));
    assert(/Armá tu perfil de grower/.test(n.container.querySelector('#community-mine')?.textContent || ''), 'invita a armar el perfil');
    assert(n.container.querySelector('#community-join'), 'botón arriba');
    await click(n.container.querySelector('#community-tab-explorar'));
    await n.unmount();
  });

  await check('3. Compartir: Público con ubicación, y Privado deja de compartir', async () => {
    const published = { ...growlogCard(growlog('nuevo')), geneticIndex: 1, cropId: 'c1' };
    routes = {
      'GET /me': () => ({ profile, growlogs: [], isAdmin: false, googlePhoto: null }),
      'POST /growlogs': () => ({ growlog: published }),
      'DELETE /growlogs/nuevo': () => ({ success: true }),
    };
    await communityService.loadMe(true);
    const toasts: string[] = [];
    let closed = 0;
    const m = await mount(React.createElement(ShareGrowlogModal, { cropId: 'c1', geneticIndex: 1, name: 'Northern Lights', onClose: () => closed++, onNeedProfile: () => {}, showToast: (t: string) => toasts.push(t) }));
    const c = m.container;
    assert(c.querySelector('[data-privacy="private"]')?.getAttribute('aria-checked') === 'true', 'arranca privado');
    await click(c.querySelector('[data-privacy="public"]'));
    await type(c.querySelector('#share-location'), 'Argentina, Salta');
    calls.length = 0;
    await click(c.querySelector('#share-save'));
    const post = calls.find((x) => x.method === 'POST');
    assert(post && post.body.privacy === 'public' && post.body.geneticIndex === 1 && post.body.location === 'Argentina, Salta', JSON.stringify(post?.body));
    assert(closed === 1 && /Publicado/.test(toasts.join()), 'cierra y avisa');
    assert(communityService.snapshot()?.growlogs.some((g) => g.id === 'nuevo'), 'queda en tus growlogs');
    await m.unmount();
    const again = await mount(React.createElement(ShareGrowlogModal, { cropId: 'c1', geneticIndex: 1, name: 'Northern Lights', onClose: () => closed++, onNeedProfile: () => {} }));
    assert(again.container.querySelector('[data-privacy="public"]')?.getAttribute('aria-checked') === 'true' && /\/comunidad\/growlog\/nuevo/.test(again.container.querySelector('#share-link')?.textContent || ''), 'muestra el enlace');
    await click(again.container.querySelector('[data-privacy="private"]'));
    calls.length = 0;
    await click(again.container.querySelector('#share-save'));
    assert(calls.some((x) => x.method === 'DELETE' && /growlogs\/nuevo/.test(x.url)), 'deja de compartir');
    await again.unmount();
  });

  await check('4. Primera vez: normas obligatorias y guarda el perfil', async () => {
    routes = { 'POST /profile': (b) => ({ profile: { ...profile, handle: b.handle, displayName: b.displayName } }) };
    let done = 0;
    const m = await mount(React.createElement(CommunityOnboarding, { me: { profile: null, growlogs: [], isAdmin: false, googlePhoto: 'https://google/f.jpg' }, suggestedName: 'Agustín Gatica', onDone: () => done++ }));
    const c = m.container;
    assert((c.querySelector('#community-handle') as HTMLInputElement).value === 'agustin_gatica', 'sugiere el usuario');
    assert(c.querySelector('#avatar-google')?.getAttribute('aria-pressed') === 'true', 'usa la foto de Google si hay');
    await act(async () => (c.querySelector('#community-onboarding') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert(/aceptar las normas/.test(c.textContent || '') && done === 0, 'pide las normas');
    await click(c.querySelector('#community-accept'));
    calls.length = 0;
    await act(async () => (c.querySelector('#community-onboarding') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await settle();
    const post = calls.find((x) => x.url.endsWith('/profile'));
    assert(post && post.body.acceptRules === true && post.body.handle === 'agustin_gatica' && post.body.avatarMode === 'google', JSON.stringify(post?.body));
    assert(done === 1, 'termina');
    await m.unmount();
  });

  await check('5. Página del growlog: portada, resumen, etapas, gráficos y la maceta', async () => {
    routes = { 'GET /growlogs/g1': () => ({ growlog: growlog('g1', { views: 1500, likes: 12 }) }) };
    const m = await mount(React.createElement(GrowlogView, { growlogId: 'g1', userId: 'u1', onBack: () => {} }));
    await settle();
    const c = m.container;
    assert(/Gelato 33/.test(c.querySelector('#growlog-hero')?.textContent || '') && /Floración/.test(c.querySelector('#growlog-stage-chip')?.textContent || ''), 'portada');
    assert(/Córdoba/.test(c.querySelector('#growlog-hero')?.textContent || ''), 'ubicación general');
    assert(/Vos/.test(c.querySelector('#growlog-owner')?.textContent || '') && !c.querySelector('#growlog-report'), 'el dueño no se denuncia');
    assert(/1,5 k/.test(c.querySelector('#growlog-metrics')?.textContent || ''), c.querySelector('#growlog-metrics')?.textContent || '');
    assert([...c.querySelectorAll('[role="tab"]')].map((t) => t.textContent).join() === 'Resumen,Etapas,Gráficos,Comentarios (0),Timeline', 'pestañas');
    const summary = c.querySelector('#growlog-summary')?.textContent || '';
    assert(/Gelato 33 de Barney/.test(summary) && /2 plantas en indoor con luz LED 320 W/.test(summary) && /2 riegos \(3 L, pH promedio 6,1\)/.test(summary), summary);
    assert(c.querySelectorAll('#growlog-photo-strip img').length === 1, 'tira de fotos');
    await click(c.querySelector('#growlog-tab-etapas'));
    assert(c.querySelectorAll('#growlog-stages .genetic-stage').length >= 2, 'etapas');
    await click(c.querySelector('#growlog-tab-graficos'));
    assert(c.querySelectorAll('#growlog-week-bars li').length === 2, 'riegos por semana');
    await click(c.querySelector('#growlog-tab-timeline'));
    assert(c.querySelector('#growlog-panel-timeline #plant-timeline'), 'la maceta');
    await m.unmount();
  });

  await check('6. Growlog de otra persona: denunciar con motivo', async () => {
    routes = { 'GET /growlogs/g2': () => ({ growlog: growlog('g2', { ownerUid: 'u2', ownerHandle: 'luna', ownerName: 'Luna' }) }), 'POST /report': () => ({ hidden: false }) };
    const toasts: string[] = [];
    const m = await mount(React.createElement(GrowlogView, { growlogId: 'g2', userId: 'u1', onBack: () => {}, showToast: (t: string) => toasts.push(t) }));
    await settle();
    const c = m.container;
    assert(/@luna/.test(c.querySelector('#growlog-owner')?.textContent || ''), 'muestra el grower');
    await click(c.querySelector('#growlog-report'));
    await click(c.querySelector('#report-send'));
    assert(/Elegí un motivo/.test(c.textContent || ''), 'motivo obligatorio');
    await click(c.querySelector('[data-reason="venta"]'));
    calls.length = 0;
    await click(c.querySelector('#report-send'));
    await settle();
    const post = calls.find((x) => x.url.endsWith('/report'));
    assert(post && post.body.kind === 'growlog' && post.body.targetId === 'g2' && post.body.reason === 'venta', JSON.stringify(post?.body));
    assert(!c.querySelector('#report-modal') && /revisar/.test(toasts.join()), 'cierra y agradece');
    await m.unmount();
  });

  await check('7. Perfil de grower: datos, growlogs y Seguir', async () => {
    let followers = 8;
    routes = {
      'GET /growers/luna': () => ({ profile: { ...profile, uid: 'u2', handle: 'luna', displayName: 'Luna', followers }, growlogs: [cards[0], cards[1]], following: false }),
      'POST /follow': (b) => ({ following: b.follow, followers: (followers += b.follow ? 1 : -1) }),
    };
    const m = await mount(React.createElement(GrowerView, { handle: 'luna', userId: 'u1', onBack: () => {}, onOpenGrowlog: () => {}, onEditProfile: () => {} }));
    await settle();
    const c = m.container;
    assert(/Luna/.test(c.textContent || '') && /@luna · Nivel 7/.test(c.textContent || ''), 'datos');
    assert(/8seguidores/.test((c.querySelector('#grower-stats')?.textContent || '').replace(/\s/g, '')), c.querySelector('#grower-stats')?.textContent || '');
    assert(c.querySelectorAll('#grower-growlogs [data-growlog-card]').length === 2, 'sus growlogs');
    await click(c.querySelector('#grower-follow'));
    await settle();
    assert(c.querySelector('#grower-follow')?.textContent === 'Siguiendo' && /9seguidores/.test((c.querySelector('#grower-stats')?.textContent || '').replace(/\s/g, '')), 'sigue');
    // bloquear: pide confirmación, deja de mostrar sus growlogs y se puede deshacer
    routes['POST /block'] = (b) => ({ blocked: b.block });
    (window as any).confirm = () => true;
    await click(c.querySelector('#grower-block'));
    await settle();
    assert(c.querySelector('#grower-blocked') && !c.querySelector('#grower-growlogs') && !c.querySelector('#grower-follow'), 'bloqueado');
    assert(c.querySelector('#grower-block')?.textContent?.includes('Desbloquear'), 'se puede desbloquear');
    await m.unmount();
  });

  await check('9. Me gusta, Seguir y comentarios en el growlog', async () => {
    let likes = 4;
    const comments: any[] = [
      { id: 'k1', growlogId: 'g3', authorUid: 'u3', authorHandle: 'pato', authorName: 'Pato', authorAvatarUrl: null, authorAvatarColor: '#123', text: 'Qué lindo color', hidden: false, reports: 0, createdAt: new Date(Date.now() - 3 * 3600_000).toISOString() },
    ];
    routes = {
      'GET /me': () => ({ profile, growlogs: [], isAdmin: false, googlePhoto: null, unread: 0 }),
      'GET /growlogs/g3/comments': () => ({ comments }),
      'GET /growlogs/g3': () => ({ growlog: growlog('g3', { ownerUid: 'u2', ownerHandle: 'luna', ownerName: 'Luna', likes, comments: 1 }), viewer: { liked: false, following: false, blocked: false } }),
      'POST /growlogs/g3/view': () => ({ views: 1 }),
      'POST /growlogs/g3/like': (b) => ({ liked: b.like, likes: (likes += b.like ? 1 : -1) }),
      'POST /growlogs/g3/comments': (b) => ({ comment: { ...comments[0], id: 'k2', authorUid: 'u1', authorHandle: 'agus', text: b.text, createdAt: new Date().toISOString() } }),
      'POST /follow': (b) => ({ following: b.follow, followers: 1 }),
    };
    await communityService.loadMe(true);
    calls.length = 0;
    const m = await mount(React.createElement(GrowlogView, { growlogId: 'g3', userId: 'u1', onBack: () => {} }));
    await settle();
    const c = m.container;
    assert(calls.some((x) => x.method === 'POST' && x.url.endsWith('/g3/view')), 'cuenta la vista');
    await click(c.querySelector('#growlog-like'));
    await settle();
    assert(c.querySelector('#growlog-like')?.getAttribute('aria-pressed') === 'true' && /5/.test(c.querySelector('#growlog-like')?.textContent || ''), 'me gusta');
    await click(c.querySelector('#growlog-follow'));
    await settle();
    assert(c.querySelector('#growlog-follow')?.textContent === 'Siguiendo', 'sigue al grower');
    await click(c.querySelector('#growlog-tab-comentarios'));
    await settle();
    assert(/Qué lindo color/.test(c.querySelector('#growlog-comments')?.textContent || '') && /hace 3 h/.test(c.querySelector('#growlog-comments')?.textContent || ''), 'lista de comentarios');
    assert(c.querySelector('[data-report-comment="k1"]') && !c.querySelector('[data-delete-comment="k1"]'), 'el de otro se denuncia, no se borra');
    await type(c.querySelector('#growlog-comment-input'), 'Gracias por compartir');
    await act(async () => (c.querySelector('#growlog-composer') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await settle();
    assert(c.querySelectorAll('[data-comment]').length === 2 && c.querySelector('[data-delete-comment="k2"]'), 'el propio se agrega y se puede borrar');
    assert((c.querySelector('#growlog-comment-input') as HTMLInputElement).value === '', 'limpia la caja');
    assert(/Comentarios \(2\)/.test(c.querySelector('#growlog-tab-comentarios')?.textContent || ''), 'cuenta');
    await m.unmount();
  });

  await check('10. Campana de avisos: sin leer, lista y se marcan leídos', async () => {
    routes = {
      'GET /me': () => ({ profile, growlogs: [], isAdmin: false, googlePhoto: null, unread: 2 }),
      'GET /notifications': () => ({
        notifications: [
          { id: 'n1', kind: 'comment', fromUid: 'u2', fromHandle: 'luna', fromName: 'Luna', fromAvatarUrl: null, fromAvatarColor: '#123', growlogId: 'g1', growlogTitle: 'Gelato 33', text: 'Hermosa', read: false, createdAt: '' },
          { id: 'n2', kind: 'follow', fromUid: 'u3', fromHandle: 'pato', fromName: 'Pato', fromAvatarUrl: null, fromAvatarColor: '#123', growlogId: null, growlogTitle: null, text: null, read: false, createdAt: '' },
        ],
      }),
      'POST /notifications/read': () => ({ success: true }),
    };
    await communityService.loadMe(true);
    const opened: string[] = [];
    const m = await mount(React.createElement(CommunityView, { userId: 'u1', cultivations: [], onOpenGrowlog: (id: string) => opened.push(id), onOpenGrower: (h: string) => opened.push('@' + h), onOpenAdmin: () => {}, initialExplore: { growlogs: [], growers: [], following: [] }, initialFeed: [] }));
    await settle();
    const c = m.container;
    assert(c.querySelector('#community-unread')?.textContent === '2', 'muestra 2 sin leer');
    calls.length = 0;
    await click(c.querySelector('#community-bell'));
    await settle();
    assert(/@luna comentó en Gelato 33/.test(c.querySelector('#notices-panel')?.textContent || '') && /@pato te empezó a seguir/.test(c.querySelector('#notices-panel')?.textContent || ''), c.querySelector('#notices-panel')?.textContent || '');
    assert(calls.some((x) => x.url.endsWith('/notifications/read')) && !c.querySelector('#community-unread'), 'quedan leídos');
    await click(c.querySelector('[data-notice="follow"]'));
    assert(opened.includes('@pato') && !c.querySelector('#notices-panel'), 'abre el grower');
    await m.unmount();
  });

  await check('8. Barra de abajo: Comunidad en lugar de IA', async () => {
    const went: string[] = [];
    const m = await mount(React.createElement(MobileNav, { currentView: 'community', onNavigate: (v: string) => went.push(v), onOpenQuickAction: () => {} }));
    const c = m.container;
    assert(!c.querySelector('#mobile-nav-ai') && c.querySelector('#mobile-nav-community'), 'Comunidad abajo');
    assert(/bg-brand-deep/.test(c.querySelector('#mobile-nav-community')?.className || ''), 'resaltada');
    await click(c.querySelector('#mobile-nav-more'));
    assert(/Cultiveta IA/.test(c.textContent || ''), 'la IA en Más');
    await m.unmount();
  });

  console.log('\n================================================================');
  console.log(` RESULTADO: ${passed} pasaron, ${failed} fallaron`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run();
