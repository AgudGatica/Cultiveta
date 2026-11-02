import React, { useEffect, useState } from 'react';
import { ArrowLeft, Ban, Flag, MapPin } from 'lucide-react';
import { communityService } from '../../services/communityService';
import type { GrowlogCard, PublicProfile } from '../../utils/growlog';
import { Avatar } from './Avatar';
import { GrowlogTile, kfmt } from './GrowlogTile';
import { ReportModal } from './ReportModal';

interface Props {
  handle: string;
  userId: string;
  onBack: () => void;
  onOpenGrowlog: (id: string) => void;
  onEditProfile: () => void;
  showToast?: (msg: string) => void;
}

/** Perfil de un grower (como en Canopia): foto, bio, seguidores, growlogs, vistas, Seguir y sus growlogs. */
export const GrowerView: React.FC<Props> = ({ handle, userId, onBack, onOpenGrowlog, onEditProfile, showToast }) => {
  const [data, setData] = useState<{ profile: PublicProfile; growlogs: GrowlogCard[]; following: boolean; blocked: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    communityService
      .grower(handle)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e?.message || 'No se pudo abrir.'));
    return () => {
      alive = false;
    };
  }, [handle]);

  const toggleFollow = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const r = await communityService.follow(data.profile.uid, !data.following);
      setData({ ...data, following: r.following, profile: { ...data.profile, followers: r.followers } });
    } catch (e: any) {
      showToast?.(e?.message || 'No se pudo.');
    } finally {
      setBusy(false);
    }
  };

  const toggleBlock = async () => {
    if (!data) return;
    const next = !data.blocked;
    if (next && !window.confirm(`¿Bloquear a @${data.profile.handle}? No vas a ver sus growlogs ni sus comentarios, no te va a poder comentar ni seguir, y se dejan de seguir.`)) return;
    setBusy(true);
    try {
      await communityService.block(data.profile.uid, next);
      if (next) {
        setData({ ...data, blocked: true, following: false, growlogs: [] });
        showToast?.(`Bloqueaste a @${data.profile.handle}.`);
      } else {
        setData(await communityService.grower(handle));
        showToast?.(`Desbloqueaste a @${data.profile.handle}.`);
      }
    } catch (e: any) {
      showToast?.(e?.message || 'No se pudo.');
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <button type="button" onClick={onBack} className="cultiveta-btn-secondary text-sm">
      <ArrowLeft className="w-4 h-4" aria-hidden="true" />
      Comunidad
    </button>
  );
  if (error) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        {back}
        <p className="bg-white rounded-[24px] border border-line p-5 text-sm text-ink-muted">{error}</p>
      </div>
    );
  }
  if (!data) return <div className="max-w-3xl mx-auto h-64 rounded-[28px] bg-white/40 animate-pulse" aria-label="Cargando perfil" />;
  const p = data.profile;
  const own = p.uid === userId;
  const views = data.growlogs.reduce((a, g) => a + (g.views || 0), 0);

  return (
    <div id="grower-view" className="max-w-3xl mx-auto space-y-4">
      {back}
      <section className="bg-white rounded-[28px] border border-line p-5 text-center space-y-2 relative">
        {!own && (
          <button type="button" id="grower-report" onClick={() => setReporting(true)} aria-label="Denunciar" className="absolute top-3 right-3 min-h-10 min-w-10 rounded-full inline-flex items-center justify-center text-ink-muted hover:text-error hover:bg-surface">
            <Flag className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
        <Avatar url={p.avatarUrl} name={p.displayName} color={p.avatarColor} size={76} className="mx-auto" />
        <h1 className="text-xl font-black text-ink">{p.displayName}</h1>
        <small className="block text-sm text-ink-muted">
          @{p.handle} · Nivel {p.level}
          {p.levelName ? ` · ${p.levelName}` : ''}
        </small>
        {p.location && (
          <small className="flex items-center justify-center gap-1 text-xs text-ink-muted">
            <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
            {p.location}
          </small>
        )}
        {p.bio && <p className="text-sm text-ink">{p.bio}</p>}
        <div id="grower-stats" className="grid grid-cols-3 gap-2 pt-2">
          {[
            [kfmt(p.followers), 'seguidores'],
            [String(data.growlogs.length), 'growlogs'],
            [kfmt(views), 'vistas'],
          ].map(([v, l]) => (
            <div key={l}>
              <b className="block text-lg font-black text-ink">{v}</b>
              <small className="text-[11px] text-ink-muted">{l}</small>
            </div>
          ))}
        </div>
        {own ? (
          <button type="button" id="grower-edit" onClick={onEditProfile} className="cultiveta-btn-secondary text-sm w-full justify-center">
            Editar perfil
          </button>
        ) : (
          <div className="space-y-2">
            {!data.blocked && (
              <button type="button" id="grower-follow" disabled={busy} onClick={toggleFollow} className={`${data.following ? 'cultiveta-btn-secondary' : 'cultiveta-btn-primary'} text-sm w-full justify-center disabled:opacity-50`}>
                {data.following ? 'Siguiendo' : 'Seguir'}
              </button>
            )}
            <button type="button" id="grower-block" disabled={busy} onClick={toggleBlock} className="w-full text-xs font-bold text-ink-muted hover:text-error inline-flex items-center justify-center gap-1 min-h-9">
              <Ban className="w-3.5 h-3.5" aria-hidden="true" />
              {data.blocked ? 'Desbloquear' : 'Bloquear'}
            </button>
          </div>
        )}
      </section>
      <h2 className="text-lg font-black text-white">Growlogs</h2>
      {data.blocked ? (
        <p id="grower-blocked" className="bg-white rounded-[24px] border border-line p-5 text-sm text-ink-muted">
          Bloqueaste a @{p.handle}: no ves sus growlogs ni sus comentarios.
        </p>
      ) : data.growlogs.length === 0 ? (
        <p className="bg-white rounded-[24px] border border-line p-5 text-sm text-ink-muted">Todavía no compartió ningún growlog.</p>
      ) : (
        <div id="grower-growlogs" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {data.growlogs.map((g) => (
            <GrowlogTile key={g.id} g={g} onOpen={onOpenGrowlog} wide />
          ))}
        </div>
      )}
      {reporting && <ReportModal kind="profile" targetId={p.uid} what={`@${p.handle}`} onClose={() => setReporting(false)} showToast={showToast} />}
    </div>
  );
};
