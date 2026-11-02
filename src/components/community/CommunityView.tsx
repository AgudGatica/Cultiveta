import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Compass, Dna, Eye, Flag, Globe, Heart, Link2, Lock, Search, Share2, ShieldAlert, Trophy, Users } from 'lucide-react';
import type { Cultivation, Genetics } from '../../types';
import { communityService, growlogFor, useCommunityMe } from '../../services/communityService';
import { useGeneticsCatalogPhotos } from '../../hooks/useGeneticsCatalogPhotos';
import { geneticEntries } from '../../utils/indoors';
import { exploreSections, growlogMatches, type GrowerCard, type GrowlogCard } from '../../utils/growlog';
import { Avatar } from './Avatar';
import { CommunityOnboarding } from './CommunityOnboarding';
import { GrowlogTile, kfmt } from './GrowlogTile';
import { NotificationsPanel } from './NotificationsPanel';
import { ShareGrowlogModal } from './ShareGrowlogModal';

type CommunityTab = 'explorar' | 'siguiendo' | 'mios';
const TABS: Array<[CommunityTab, string, typeof Compass]> = [
  ['explorar', 'Explorar', Compass],
  ['siguiendo', 'Siguiendo', Users],
  ['mios', 'Mis growlogs', Dna],
];
/** La pestaña elegida queda al volver a Comunidad. */
let lastTab: CommunityTab = 'explorar';
let lastQuery = '';

const CARD = 'bg-white rounded-[28px] p-5 border border-line shadow-2xs';

interface Props {
  userId: string;
  cultivations: Cultivation[];
  geneticsList?: Genetics[];
  /** Para sugerir nombre y @usuario la primera vez. */
  suggestedName?: string | null;
  suggestedHandle?: string | null;
  level?: number;
  levelName?: string;
  onOpenGrowlog: (id: string) => void;
  onOpenGrower: (handle: string) => void;
  onOpenAdmin: () => void;
  showToast?: (msg: string) => void;
  /** Para tests: no pedir Explorar ni Siguiendo al servidor. */
  initialExplore?: { growlogs: GrowlogCard[]; growers: GrowerCard[]; following: string[] };
  initialFeed?: GrowlogCard[];
  now?: Date;
}

/**
 * Comunidad (como en Canopia): buscador y tres pestañas. Explorar (growlog del mes, colecciones, tus
 * growlogs públicos y growers), Siguiendo (lo nuevo de la gente que seguís) y Mis growlogs (qué genéticas
 * compartís y con quién).
 */
export const CommunityView: React.FC<Props> = ({ userId, cultivations, geneticsList = [], suggestedName, suggestedHandle, level, levelName, onOpenGrowlog, onOpenGrower, onOpenAdmin, showToast, initialExplore, initialFeed, now }) => {
  const me = useCommunityMe();
  const [tab, setTabState] = useState<CommunityTab>(lastTab);
  const setTab = (t: CommunityTab) => {
    lastTab = t;
    setTabState(t);
  };
  const [query, setQueryState] = useState(lastQuery);
  const setQuery = (q: string) => {
    lastQuery = q;
    setQueryState(q);
  };
  const [explore, setExplore] = useState(initialExplore || null);
  const [feed, setFeed] = useState<GrowlogCard[] | null>(initialFeed || null);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [notices, setNotices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState<'new' | 'edit' | null>(null);
  const [sharing, setSharing] = useState<{ cropId: string; index: number; name: string } | null>(null);
  const catalogPhotos = useGeneticsCatalogPhotos();

  useEffect(() => {
    communityService.loadMe().catch((e) => setError(e?.message || null));
  }, []);
  useEffect(() => {
    if (initialExplore || tab !== 'explorar' || explore) return;
    communityService
      .explore()
      .then(setExplore)
      .catch((e) => setError(e?.message || null));
  }, [tab, explore, initialExplore]);
  useEffect(() => {
    if (initialFeed || tab !== 'siguiendo' || feed) return;
    communityService
      .feed()
      .then((d) => {
        setFeed(d.growlogs);
        setLiked(new Set(d.liked));
      })
      .catch((e) => setError(e?.message || null));
  }, [tab, feed, initialFeed]);

  const mine = useMemo(() => geneticEntries(cultivations.filter((c) => !c.isDemo), geneticsList, catalogPhotos), [cultivations, geneticsList, catalogPhotos]);
  const sections = useMemo(() => (explore ? exploreSections(explore.growlogs, now || new Date()) : null), [explore, now]);
  const results = useMemo(() => (explore && query.trim() ? explore.growlogs.filter((g) => growlogMatches(g, query)) : null), [explore, query]);
  const growerResults = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '');
    return explore && q ? explore.growers.filter((p) => p.handle.includes(q) || p.displayName.toLowerCase().includes(q)) : [];
  }, [explore, query]);
  const myPublic = (explore?.growlogs || []).filter((g) => g.ownerUid === userId);

  const toggleLike = async (g: GrowlogCard) => {
    if (!me?.profile) return setOnboarding('new');
    const next = !liked.has(g.id);
    const set = new Set(liked);
    if (next) set.add(g.id);
    else set.delete(g.id);
    setLiked(set);
    try {
      const r = await communityService.like(g.id, next);
      setFeed((list) => (list || []).map((x) => (x.id === g.id ? { ...x, likes: r.likes } : x)));
    } catch (e: any) {
      showToast?.(e?.message || 'No se pudo.');
    }
  };

  if (onboarding) {
    return (
      <div className="max-w-3xl mx-auto">
        <CommunityOnboarding
          me={me}
          editing={onboarding === 'edit'}
          suggestedName={suggestedName}
          suggestedHandle={suggestedHandle}
          level={level}
          levelName={levelName}
          onCancel={() => setOnboarding(null)}
          onDone={() => {
            setOnboarding(null);
            setExplore(null);
            showToast?.(onboarding === 'edit' ? 'Perfil guardado.' : '¡Bienvenido a la comunidad!');
          }}
        />
      </div>
    );
  }

  return (
    <div id="community-view" className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 pt-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Comunidad</h1>
        <div className="flex items-center gap-2">
          <button type="button" id="community-bell" onClick={() => setNotices(true)} aria-label={me?.unread ? `Avisos: ${me.unread} sin leer` : 'Avisos'} className="relative min-h-10 min-w-10 rounded-full bg-white/15 text-white inline-flex items-center justify-center hover:bg-white/25">
            <Bell className="w-5 h-5" aria-hidden="true" />
            {!!me?.unread && (
              <span id="community-unread" className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-coral text-white text-[10px] font-black inline-flex items-center justify-center">
                {me.unread > 9 ? '9+' : me.unread}
              </span>
            )}
          </button>
          {me?.isAdmin && (
            <button type="button" id="community-admin" onClick={onOpenAdmin} aria-label="Denuncias" className="min-h-10 min-w-10 rounded-full bg-white/15 text-white inline-flex items-center justify-center hover:bg-white/25">
              <ShieldAlert className="w-5 h-5" aria-hidden="true" />
            </button>
          )}
          {me?.profile ? (
            <button type="button" id="community-me" onClick={() => onOpenGrower(me.profile!.handle)} aria-label="Tu perfil de grower" className="rounded-full ring-2 ring-white/60">
              <Avatar url={me.profile.avatarUrl} name={me.profile.displayName} color={me.profile.avatarColor} size={36} />
            </button>
          ) : (
            <button type="button" id="community-join" onClick={() => setOnboarding('new')} className="min-h-10 px-3 rounded-full bg-primary text-ink text-xs font-black">
              Armar mi perfil
            </button>
          )}
        </div>
      </div>

      <label className="relative block">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
        <input
          id="community-search"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value && tab !== 'explorar') setTab('explorar');
          }}
          placeholder="Buscar growlogs, genéticas o growers"
          aria-label="Buscar en la comunidad"
          className="w-full min-h-11 pl-10 pr-3 rounded-2xl bg-white border border-line text-sm text-ink focus:outline-hidden focus:border-brand"
        />
      </label>

      <div role="tablist" aria-label="Comunidad" className="grid grid-cols-3 p-1 rounded-2xl bg-white/15 gap-1">
        {TABS.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`community-tab-${key}`}
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-11 rounded-xl text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors ${tab === key ? 'bg-white text-ink shadow-xs' : 'text-white hover:bg-white/10'}`}
          >
            <Icon className="w-4 h-4 hidden sm:block" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {error && !explore && !feed && <p className="text-sm text-white/90">{error}</p>}

      {tab === 'explorar' && (
        <div id="community-explore" className="space-y-4">
          {!explore ? (
            <div className="h-48 rounded-[28px] bg-white/30 animate-pulse" aria-label="Cargando" />
          ) : results ? (
            results.length || growerResults.length ? (
              <>
                {growerResults.length > 0 && <GrowerRow growers={growerResults} onOpen={onOpenGrower} />}
                <div id="community-results" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {results.map((g) => (
                    <GrowlogTile key={g.id} g={g} onOpen={onOpenGrowlog} wide />
                  ))}
                </div>
              </>
            ) : (
              <Empty icon={Search} title="Sin resultados" text="Probá con otra genética o grower." />
            )
          ) : explore.growlogs.length === 0 ? (
            <Empty icon={Compass} title="Todavía no hay growlogs públicos" text="¡Publicá el primero! En Mis growlogs elegís qué genética compartir." />
          ) : (
            <>
              {sections?.top && (
                <button type="button" id="community-top" onClick={() => onOpenGrowlog(sections.top!.id)} className="relative block w-full overflow-hidden rounded-[28px] bg-brand-deep aspect-[16/10] text-left shadow-sm">
                  {sections.top.coverUrl && <img src={sections.top.coverUrl} alt={sections.top.title} className="absolute inset-0 w-full h-full object-cover" />}
                  <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                  <span className="absolute left-4 right-4 bottom-4 space-y-1.5 text-white">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary text-ink px-2.5 py-1 text-xs font-black">
                      <Trophy className="w-3.5 h-3.5" aria-hidden="true" />
                      Growlog del mes
                    </span>
                    <b className="block text-2xl font-black leading-tight">{sections.top.title}</b>
                    <span className="flex items-center gap-1.5 text-xs text-white/85">
                      <Avatar url={sections.top.ownerAvatarUrl} name={sections.top.ownerName} color={sections.top.ownerAvatarColor} size={20} />@{sections.top.ownerHandle} · {kfmt(sections.top.views)} vistas
                    </span>
                  </span>
                </button>
              )}
              {sections?.sections.map((s) => (
                <Row key={s.id} id={`community-section-${s.id}`} title={s.title} count={s.growlogs.length}>
                  {s.growlogs.map((g) => (
                    <GrowlogTile key={g.id} g={g} onOpen={onOpenGrowlog} />
                  ))}
                </Row>
              ))}
              {myPublic.length > 0 && (
                <Row id="community-section-mine" title="Tus growlogs públicos" count={myPublic.length}>
                  {myPublic.map((g) => (
                    <GrowlogTile key={g.id} g={g} onOpen={onOpenGrowlog} />
                  ))}
                </Row>
              )}
              {explore.growers.length > 0 && <GrowerRow growers={explore.growers} onOpen={onOpenGrower} />}
            </>
          )}
        </div>
      )}

      {tab === 'siguiendo' && (
        <div id="community-following" className="space-y-3">
          {!feed ? (
            <div className="h-48 rounded-[28px] bg-white/30 animate-pulse" aria-label="Cargando" />
          ) : feed.length === 0 ? (
            <Empty icon={Users} title="Todavía no seguís a nadie" text="Explorá growlogs y seguí a los growers que te gusten." />
          ) : (
            feed.map((g) => (
              <article key={g.id} className="feed-post bg-white rounded-[28px] border border-line overflow-hidden shadow-2xs">
                <button type="button" onClick={() => onOpenGrower(g.ownerHandle)} className="flex items-center gap-2.5 p-3 w-full text-left">
                  <Avatar url={g.ownerAvatarUrl} name={g.ownerName} color={g.ownerAvatarColor} size={36} />
                  <span className="min-w-0">
                    <b className="block text-sm text-ink truncate">{g.ownerName}</b>
                    <small className="block text-xs text-ink-muted truncate">
                      {g.title} · {g.finished ? 'cosechada' : g.stage.toLowerCase()}
                    </small>
                  </span>
                </button>
                <button type="button" onClick={() => onOpenGrowlog(g.id)} className="block w-full">
                  {g.coverUrl ? <img src={g.coverUrl} alt={g.title} loading="lazy" className="w-full aspect-[4/3] object-cover bg-track" /> : <span className="block w-full aspect-[4/3] bg-brand-deep" />}
                </button>
                {g.lastNote && <p className="px-4 pt-3 text-sm text-ink line-clamp-3">{g.lastNote}</p>}
                <div className="flex items-center gap-3 px-4 py-3 text-xs text-ink-muted">
                  <button type="button" data-like={g.id} aria-pressed={liked.has(g.id)} onClick={() => toggleLike(g)} className={`inline-flex items-center gap-1 min-h-9 px-3 rounded-full border ${liked.has(g.id) ? 'border-coral text-coral' : 'border-line'}`}>
                    <Heart className={`w-3.5 h-3.5 ${liked.has(g.id) ? 'fill-coral' : ''}`} aria-hidden="true" />
                    {kfmt(g.likes)}
                  </button>
                  <span className="inline-flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    {kfmt(g.views)}
                  </span>
                  <button type="button" onClick={() => onOpenGrowlog(g.id)} className="ml-auto cultiveta-btn-secondary text-xs">
                    Ver growlog
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {tab === 'mios' && (
        <div id="community-mine" className="space-y-2">
          {!me?.profile && (
            <section className={`${CARD} space-y-2`}>
              <b className="block text-sm text-ink">Armá tu perfil de grower</b>
              <p className="text-xs text-ink-muted">Para compartir un growlog, seguir y comentar. Tus cultivos siguen privados hasta que elijas compartir uno.</p>
              <button type="button" onClick={() => setOnboarding('new')} className="cultiveta-btn-primary text-sm">
                Armar mi perfil
              </button>
            </section>
          )}
          {mine.length === 0 ? (
            <Empty icon={Dna} title="Sin genéticas" text="Creá un cultivo para tener tu growlog." />
          ) : (
            mine.map((e) => {
              const gl = growlogFor(me, e.crop.id, e.index);
              const privacy = gl?.privacy || 'private';
              const PIcon = privacy === 'public' ? Globe : privacy === 'unlisted' ? Link2 : Lock;
              return (
                <div key={`${e.crop.id}_${e.index}`} data-my-growlog={`${e.crop.id}_${e.index}`} data-privacy={privacy} className="flex items-center gap-3 bg-white rounded-[22px] border border-line p-2.5">
                  <span className="w-14 h-14 rounded-2xl overflow-hidden bg-brand-deep shrink-0 flex items-center justify-center">
                    {gl?.coverUrl || e.card.photoUrl ? <img src={gl?.coverUrl || e.card.photoUrl || ''} alt="" className="w-full h-full object-cover" /> : <Dna className="w-6 h-6 text-white/40" aria-hidden="true" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <b className="block text-sm text-ink truncate">{e.card.name}</b>
                    <small className="block text-xs text-ink-muted truncate">{e.crop.name}</small>
                    <small className="flex items-center gap-1 text-xs font-semibold text-ink-muted">
                      <PIcon className="w-3 h-3" aria-hidden="true" />
                      {privacy === 'public' ? 'Público' : privacy === 'unlisted' ? 'No listado' : 'Privado'}
                      {gl?.hidden && (
                        <span className="inline-flex items-center gap-0.5 text-error font-bold">
                          <Flag className="w-3 h-3" aria-hidden="true" />
                          oculto
                        </span>
                      )}
                    </small>
                  </span>
                  {gl && (
                    <button type="button" onClick={() => onOpenGrowlog(gl.id)} className="cultiveta-btn-secondary text-xs">
                      Ver
                    </button>
                  )}
                  <button type="button" aria-label={`Compartir ${e.card.name}`} data-share={`${e.crop.id}_${e.index}`} onClick={() => setSharing({ cropId: e.crop.id, index: e.index, name: e.card.name })} className="min-h-10 min-w-10 rounded-full bg-icon-bg text-brand inline-flex items-center justify-center">
                    <Share2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      <p className="text-[11px] text-white/70 text-center px-4 pb-2">Comunidad para mayores de 18 años. Nada de venta. Las fotos se publican sin ubicación.</p>

      {notices && <NotificationsPanel onClose={() => setNotices(false)} onOpenGrowlog={onOpenGrowlog} onOpenGrower={onOpenGrower} />}

      {sharing && (
        <ShareGrowlogModal
          cropId={sharing.cropId}
          geneticIndex={sharing.index}
          name={sharing.name}
          onClose={() => {
            setSharing(null);
            setExplore(null);
          }}
          onNeedProfile={() => {
            setSharing(null);
            setOnboarding('new');
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
};

const Row: React.FC<{ id: string; title: string; count: number; children: React.ReactNode }> = ({ id, title, count, children }) => (
  <section id={id} className="space-y-2">
    <div className="flex items-center justify-between px-1">
      <h2 className="text-base font-extrabold text-white">{title}</h2>
      <span className="text-xs text-white/70">{count}</span>
    </div>
    <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none]">{children}</div>
  </section>
);

const GrowerRow: React.FC<{ growers: GrowerCard[]; onOpen: (handle: string) => void }> = ({ growers, onOpen }) => (
  <Row id="community-growers" title="Growers" count={growers.length}>
    {growers.map((p) => (
      <button key={p.uid} type="button" data-grower={p.handle} onClick={() => onOpen(p.handle)} className="w-28 shrink-0 bg-white rounded-[22px] border border-line p-3 text-center space-y-1">
        <Avatar url={p.avatarUrl} name={p.displayName} color={p.avatarColor} size={52} className="mx-auto" />
        <b className="block text-xs text-ink truncate">{p.displayName}</b>
        <small className="block text-[10px] text-ink-muted truncate">@{p.handle}</small>
      </button>
    ))}
  </Row>
);

const Empty: React.FC<{ icon: typeof Compass; title: string; text: string }> = ({ icon: Icon, title, text }) => (
  <section className="bg-white rounded-[28px] border border-line p-6 text-center space-y-1.5">
    <Icon className="w-7 h-7 mx-auto text-brand" aria-hidden="true" />
    <b className="block text-sm text-ink">{title}</b>
    <p className="text-xs text-ink-muted">{text}</p>
  </section>
);
