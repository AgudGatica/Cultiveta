import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Camera, Clock, Dna, Eye, Flag, Heart, Home, Layers, MapPin, MessageCircle, Share2, Sparkles, Sprout, Sun, Timer } from 'lucide-react';
import type { PhotoRecord } from '../../types';
import { communityService, growlogLink } from '../../services/communityService';
import { buildCultivationStageSchedule } from '../../utils/growthStageUtils';
import { targetsForStages } from '../../utils/ambientEvaluation';
import { growlogSummary, wateringsByWeek, type Growlog } from '../../utils/growlog';
import { PlantTimeline } from '../cultivations/PlantTimeline';
import { AmbientHistory } from '../indoors/AmbientHistory';
import { StageList } from '../indoors/StageList';
import { Avatar } from './Avatar';
import { ReportModal } from './ReportModal';

type Tab = 'resumen' | 'etapas' | 'graficos' | 'comentarios' | 'timeline';

const CARD = 'bg-white rounded-[28px] p-5 sm:p-6 border border-line shadow-2xs';
const kfmt = (n: number) => (n >= 1000 ? `${(Math.round(n / 100) / 10).toString().replace('.', ',')} k` : String(n));

interface Props {
  growlogId: string;
  /** Quién mira (para saber si es el dueño). */
  userId: string;
  onBack: () => void;
  onOpenGrower?: (handle: string) => void;
  /** El dueño quiere cambiar la privacidad (abre Compartir desde su genética). */
  onEditShare?: (g: Growlog) => void;
  showToast?: (msg: string) => void;
}

/**
 * Un growlog público (como en Canopia): portada, genética, etapa y semanas; el grower; vistas, me gusta,
 * comentarios y fotos; y cinco pestañas: Resumen, Etapas, Gráficos, Comentarios y Timeline (la maceta).
 */
export const GrowlogView: React.FC<Props> = ({ growlogId, userId, onBack, onOpenGrower, onEditShare, showToast }) => {
  const [g, setG] = useState<Growlog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('resumen');
  const [reporting, setReporting] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setG(null);
    setError(null);
    communityService
      .getGrowlog(growlogId)
      .then((d) => alive && setG(d))
      .catch((e) => alive && setError(e?.message || 'No se pudo abrir.'));
    return () => {
      alive = false;
    };
  }, [growlogId]);

  const schedule = useMemo(() => (g ? buildCultivationStageSchedule(g.crop, []) : null), [g]);
  const photos: PhotoRecord[] = useMemo(
    () => (g ? g.photos.map((p) => ({ id: p.id, userId: '', cultivationId: g.id, url: p.url, syncStatus: 'synced', date: p.date, dayOfCultivation: p.dayOfCultivation, stage: p.stage, category: p.category, caption: p.caption, createdAt: `${p.date}T12:00:00` })) : []),
    [g]
  );

  if (error) {
    return (
      <div id="growlog-missing" className="max-w-3xl mx-auto space-y-4">
        <button type="button" onClick={onBack} className="cultiveta-btn-secondary text-sm">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Comunidad
        </button>
        <section className={`${CARD} text-center space-y-2`}>
          <b className="block text-ink">No disponible</b>
          <p className="text-sm text-ink-muted">{error}</p>
        </section>
      </div>
    );
  }
  if (!g || !schedule) {
    return <div id="growlog-loading" className="max-w-3xl mx-auto h-64 rounded-[28px] bg-white/40 animate-pulse" aria-label="Cargando growlog" />;
  }

  const own = g.ownerUid === userId;
  const day = !g.finished && schedule.isCycleStartKnown && typeof schedule.totalElapsedDays === 'number' && schedule.totalElapsedDays > 0 ? schedule.totalElapsedDays : null;
  const weeks = day ? Math.floor((day - 1) / 7) + 1 : null;
  const summary = growlogSummary(g, { day, stageDay: schedule.activeStageElapsedDays });
  const byWeek = wateringsByWeek(g);
  const maxWeek = Math.max(1, ...byWeek.map((w) => w.liters));
  const lastPoint = g.climate.length ? g.climate[g.climate.length - 1].at : Date.now();
  const tabs: Record<Tab, string> = { resumen: 'Resumen', etapas: 'Etapas', graficos: 'Gráficos', comentarios: `Comentarios (${g.comments})`, timeline: 'Timeline' };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(growlogLink(g.id));
      showToast?.('Enlace copiado.');
    } catch {
      showToast?.('No se pudo copiar el enlace.');
    }
  };

  return (
    <div id="growlog-view" className="space-y-4 max-w-3xl mx-auto">
      <section id="growlog-hero" className="relative overflow-hidden rounded-[28px] bg-brand-deep aspect-[4/5] sm:aspect-[16/10] shadow-sm">
        {g.coverUrl && !coverFailed ? (
          <img src={g.coverUrl} alt={g.title} onError={() => setCoverFailed(true)} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/25">
            <Dna className="w-24 h-24 stroke-[1.2]" aria-hidden="true" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30" />
        <button type="button" onClick={onBack} aria-label="Volver" className="absolute top-3 left-3 min-h-10 min-w-10 px-3 rounded-full bg-black/35 backdrop-blur-sm text-white text-sm font-bold inline-flex items-center gap-1.5 hover:bg-black/50">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Comunidad
        </button>
        <button type="button" id="growlog-copy" onClick={copy} aria-label="Copiar enlace" className="absolute top-3 right-3 min-h-10 min-w-10 rounded-full bg-black/35 backdrop-blur-sm text-white inline-flex items-center justify-center hover:bg-black/50">
          <Share2 className="w-4 h-4" aria-hidden="true" />
        </button>
        <div className="absolute left-4 right-4 bottom-4 space-y-2 text-white">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-none">{g.title}</h1>
          <p className="text-sm text-white/85">{[g.bank, g.photoperiodType].filter(Boolean).join(' · ') || 'Genética'}</p>
          <div className="flex flex-wrap gap-1.5">
            <span id="growlog-stage-chip" className="inline-flex items-center gap-1 rounded-full bg-primary text-ink px-2.5 py-1 text-xs font-black">
              <Sprout className="w-3.5 h-3.5" aria-hidden="true" />
              {g.finished ? 'Cosechada' : g.stage}
            </span>
            {weeks && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/40 backdrop-blur-sm px-2.5 py-1 text-xs font-bold">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                {weeks === 1 ? '1 semana' : `${weeks} semanas`}
              </span>
            )}
            {g.location && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/40 backdrop-blur-sm px-2.5 py-1 text-xs font-bold">
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                {g.location}
              </span>
            )}
          </div>
        </div>
      </section>

      {g.hidden && (
        <p role="status" className="rounded-2xl bg-warn-bg border border-warn-line text-warn-ink text-xs font-semibold p-3">
          Está oculto por denuncias: solo lo ven vos y el equipo de Cultiveta hasta que se revise.
        </p>
      )}

      <div id="growlog-owner" className="flex items-center gap-3 bg-white rounded-[24px] border border-line p-3">
        <button type="button" onClick={() => onOpenGrower?.(g.ownerHandle)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <Avatar url={g.ownerAvatarUrl} name={g.ownerName} color={g.ownerAvatarColor} size={40} />
          <span className="min-w-0">
            <b className="block text-sm text-ink truncate">{g.ownerName}</b>
            <small className="block text-xs text-ink-muted truncate">{own ? 'Vos' : `@${g.ownerHandle}`}</small>
          </span>
        </button>
        {own ? (
          <button type="button" id="growlog-edit-share" onClick={() => onEditShare?.(g)} className="cultiveta-btn-secondary text-xs">
            {g.privacy === 'public' ? 'Público' : 'No listado'}
          </button>
        ) : (
          <button type="button" id="growlog-report" onClick={() => setReporting(true)} aria-label="Denunciar" className="min-h-10 min-w-10 rounded-full inline-flex items-center justify-center text-ink-muted hover:text-error hover:bg-surface">
            <Flag className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div id="growlog-metrics" className="grid grid-cols-4 gap-2 text-center">
        {[
          [Eye, kfmt(g.views), 'vistas'],
          [Heart, kfmt(g.likes), 'me gusta'],
          [MessageCircle, String(g.comments), 'comentarios'],
          [Camera, String(g.photos.length), 'fotos'],
        ].map(([Icon, v, l]: any) => (
          <div key={l} className="cultiveta-card p-2.5">
            <Icon className="w-4 h-4 mx-auto text-brand" aria-hidden="true" />
            <b className="block text-base font-black text-ink leading-tight">{v}</b>
            <small className="block text-[10px] text-ink-muted">{l}</small>
          </div>
        ))}
      </div>

      <div role="tablist" aria-label="Secciones" className="flex overflow-x-auto p-1 rounded-2xl bg-white/15 gap-1 [scrollbar-width:none]">
        {(Object.keys(tabs) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`growlog-tab-${t}`}
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`shrink-0 min-h-11 px-3.5 rounded-xl text-sm font-extrabold whitespace-nowrap transition-colors ${tab === t ? 'bg-white text-ink shadow-xs' : 'text-white hover:bg-white/10'}`}
          >
            {tabs[t]}
          </button>
        ))}
      </div>

      {tab === 'resumen' && (
        <div id="growlog-panel-resumen" role="tabpanel" className="space-y-4">
          <section className={`${CARD} space-y-2`}>
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-brand" aria-hidden="true" />
              Resumen automático
            </span>
            <p id="growlog-summary" className="text-sm text-ink leading-relaxed">
              {summary}
            </p>
          </section>
          <section id="growlog-specs" aria-label="Datos" className="grid grid-cols-2 gap-2">
            {[
              [g.env === 'exterior' ? Sun : Home, 'Espacio', g.env === 'exterior' ? 'Exterior' : 'Indoor'],
              [Layers, 'Sustrato', g.substrateText || '—'],
              [Sun, 'Luz', g.light || '—'],
              [Timer, 'Duración', g.finished ? 'Terminado' : weeks ? `${weeks} sem.` : `${Math.max(1, schedule.activeStageElapsedDays)} d de ${g.stage.toLowerCase()}`],
            ].map(([Icon, l, v]: any) => (
              <div key={l} className="cultiveta-card p-3">
                <small className="text-[10px] font-semibold text-ink-muted flex items-center gap-1">
                  <Icon className="w-3 h-3" aria-hidden="true" />
                  {l}
                </small>
                <b className="block text-sm font-black text-ink truncate">{v}</b>
              </div>
            ))}
          </section>
          {g.photos.length > 0 && (
            <section className={`${CARD} space-y-3`}>
              <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">Fotos ({g.photos.length})</span>
              <div id="growlog-photo-strip" className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
                {[...g.photos].reverse().map((p) => (
                  <img key={p.id} src={p.url} alt={p.caption || `Foto del ${p.date}`} loading="lazy" className="w-28 h-28 rounded-2xl object-cover shrink-0 bg-track" />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'etapas' && (
        <div id="growlog-panel-etapas" role="tabpanel">
          <StageList id="growlog-stages" className={CARD} stages={schedule.stages} activeDay={schedule.activeStageElapsedDays} />
        </div>
      )}

      {tab === 'graficos' && (
        <div id="growlog-panel-graficos" role="tabpanel" className="space-y-4">
          <section className={`${CARD} space-y-3`}>
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-brand" aria-hidden="true" />
              Riegos por semana
            </span>
            {byWeek.length === 0 ? (
              <p className="text-xs text-ink-muted">Todavía no hay riegos anotados.</p>
            ) : (
              <ul id="growlog-week-bars" className="space-y-1.5">
                {byWeek.map((w) => (
                  <li key={w.week} className="flex items-center gap-2 text-xs">
                    <span className="w-14 shrink-0 text-ink-muted font-semibold">Sem. {w.week}</span>
                    <span className="flex-1 h-4 rounded-full bg-track overflow-hidden">
                      <span className="block h-full bg-brand rounded-full" style={{ width: `${(w.liters / maxWeek) * 100}%` }} />
                    </span>
                    <span className="w-24 shrink-0 text-right text-ink">
                      {w.count} · {(Math.round(w.liters * 10) / 10).toString().replace('.', ',')} L
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className={`${CARD} space-y-3`}>
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">Clima del ambiente</span>
            <AmbientHistory points={g.climate} targets={targetsForStages([g.stage])} now={lastPoint} />
          </section>
        </div>
      )}

      {tab === 'comentarios' && (
        <div id="growlog-panel-comentarios" role="tabpanel">
          <section className={`${CARD} text-center space-y-1`}>
            <MessageCircle className="w-6 h-6 mx-auto text-brand" aria-hidden="true" />
            <b className="block text-sm text-ink">Muy pronto vas a poder comentar</b>
            <p className="text-xs text-ink-muted">Los comentarios y los me gusta llegan en la próxima versión.</p>
          </section>
        </div>
      )}

      {tab === 'timeline' && (
        <div id="growlog-panel-timeline" role="tabpanel">
          <PlantTimeline cultivation={g.crop} waterings={g.waterings} diaryEntries={g.notes} photos={photos} title={own ? 'Tu planta' : g.title} />
        </div>
      )}

      {reporting && <ReportModal kind="growlog" targetId={g.id} what={`el growlog ${g.title}`} onClose={() => setReporting(false)} showToast={showToast} />}
    </div>
  );
};
