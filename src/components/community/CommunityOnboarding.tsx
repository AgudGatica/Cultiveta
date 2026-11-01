import React, { useRef, useState } from 'react';
import { Camera, ShieldCheck, Users } from 'lucide-react';
import { communityService, type CommunityMe } from '../../services/communityService';
import type { AvatarMode } from '../../utils/growlog';
import { Avatar } from './Avatar';

const FIELD = 'w-full min-h-11 px-3 rounded-2xl bg-white border border-line text-sm text-ink focus:outline-hidden focus:border-brand';
const LABEL = 'text-xs font-semibold text-ink-muted block space-y-1';
const PILL = (on: boolean) => `flex-1 min-h-10 rounded-full text-xs font-bold border px-2 ${on ? 'bg-brand-deep text-white border-brand-deep' : 'bg-white text-ink border-line'}`;

export const COMMUNITY_RULES = [
  'Tenés 18 años o más.',
  'Nada de venta, canje ni regalo de plantas, semillas o flores.',
  'Respeto: sin insultos, acoso ni discriminación.',
  'Sin datos personales tuyos ni de otros (direcciones, teléfonos, caras).',
  'Respetá la ley de tu país.',
];

interface Props {
  me: CommunityMe | null;
  /** Para sugerir el nombre y el @usuario. */
  suggestedName?: string | null;
  suggestedHandle?: string | null;
  level?: number;
  levelName?: string;
  /** Editar un perfil que ya existe (sin las normas). */
  editing?: boolean;
  onDone: () => void;
  onCancel?: () => void;
}

const suggest = (s?: string | null) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);

/** Primera vez en la Comunidad (o editar el perfil): @usuario, nombre, foto y normas. */
export const CommunityOnboarding: React.FC<Props> = ({ me, suggestedName, suggestedHandle, level, levelName, editing, onDone, onCancel }) => {
  const prev = me?.profile;
  const [handle, setHandle] = useState(prev?.handle || suggest(suggestedHandle || suggestedName));
  const [displayName, setDisplayName] = useState(prev?.displayName || suggestedName || '');
  const [bio, setBio] = useState(prev?.bio || '');
  const [location, setLocation] = useState(prev?.location || '');
  const [mode, setMode] = useState<AvatarMode>(prev?.avatarMode || (me?.googlePhoto ? 'google' : 'incognito'));
  const [accepted, setAccepted] = useState(Boolean(prev));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const previewUrl = mode === 'google' ? me?.googlePhoto : mode === 'photo' ? (file ? URL.createObjectURL(file) : prev?.avatarUrl) : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!accepted) return setError('Para entrar hay que aceptar las normas.');
    if (mode === 'photo' && !file && prev?.avatarMode !== 'photo') return setError('Elegí una foto o cambiá a otra opción.');
    setBusy(true);
    try {
      await communityService.saveProfile({ handle, displayName, bio, location, avatarMode: mode === 'photo' ? 'photo' : mode, acceptRules: true, level, levelName });
      if (mode === 'photo' && file) await communityService.uploadAvatar(file);
      onDone();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form id="community-onboarding" onSubmit={save} className="bg-white rounded-[28px] p-5 sm:p-6 border border-line shadow-2xs space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-2xl bg-brand/10 text-brand">
          <Users className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold text-ink">{editing ? 'Tu perfil de grower' : 'Entrá a la comunidad'}</h2>
          <p className="text-xs text-ink-muted">Así te ven los demás. Tus cultivos siguen privados hasta que compartas uno.</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Avatar url={previewUrl} name={displayName || handle || '?'} color={prev?.avatarColor || '#2D6B28'} size={64} />
        <div className="flex-1 space-y-1">
          <span className="text-xs font-semibold text-ink-muted">Foto</span>
          <div className="flex gap-1.5" role="group" aria-label="Foto de perfil">
            {me?.googlePhoto && (
              <button type="button" id="avatar-google" aria-pressed={mode === 'google'} onClick={() => setMode('google')} className={PILL(mode === 'google')}>
                La de Google
              </button>
            )}
            <button type="button" id="avatar-photo" aria-pressed={mode === 'photo'} onClick={() => { setMode('photo'); fileRef.current?.click(); }} className={PILL(mode === 'photo')}>
              <Camera className="w-3.5 h-3.5 inline -mt-0.5 mr-1" aria-hidden="true" />
              Una mía
            </button>
            <button type="button" id="avatar-incognito" aria-pressed={mode === 'incognito'} onClick={() => setMode('incognito')} className={PILL(mode === 'incognito')}>
              Incógnito
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
      </div>

      <label className={LABEL}>
        <span>Usuario</span>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">@</span>
          <input id="community-handle" className={`${FIELD} pl-7`} value={handle} maxLength={20} autoCapitalize="none" spellCheck={false} onChange={(e) => setHandle(e.target.value.toLowerCase())} required />
        </div>
        <small className="block text-[11px] text-ink-subtle">De 3 a 20 letras, números o guion bajo. Es único.</small>
      </label>
      <label className={LABEL}>
        <span>Nombre para mostrar</span>
        <input id="community-name" className={FIELD} value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} required />
      </label>
      <label className={LABEL}>
        <span>Sobre vos (opcional)</span>
        <textarea id="community-bio" className={`${FIELD} py-2 min-h-16`} value={bio} maxLength={160} onChange={(e) => setBio(e.target.value)} placeholder="Cultivo en carpa desde 2022. Me gustan las índicas." />
      </label>
      <label className={LABEL}>
        <span>Ubicación general (opcional)</span>
        <input id="community-location" className={FIELD} value={location} maxLength={60} onChange={(e) => setLocation(e.target.value)} placeholder="Argentina, Buenos Aires" />
        <small className="block text-[11px] text-ink-subtle">Solo país, provincia o ciudad. Nunca tu dirección.</small>
      </label>

      {!editing && (
        <div className="rounded-2xl bg-surface border border-line p-3 space-y-2">
          <b className="text-xs text-ink flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-brand" aria-hidden="true" />
            Normas de la comunidad
          </b>
          <ul className="text-xs text-ink space-y-1 list-disc pl-5">
            {COMMUNITY_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <label className="flex items-start gap-2 text-xs font-semibold text-ink">
            <input id="community-accept" type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5" />
            Las leí y las acepto. Lo que no las cumpla se puede denunciar y ocultar.
          </label>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs font-semibold text-error">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="cultiveta-btn-secondary text-sm">
            Cancelar
          </button>
        )}
        <button type="submit" id="community-save" disabled={busy} className="cultiveta-btn-primary text-sm flex-1 justify-center disabled:opacity-50">
          {busy ? 'Guardando…' : editing ? 'Guardar' : 'Entrar a la comunidad'}
        </button>
      </div>
    </form>
  );
};
