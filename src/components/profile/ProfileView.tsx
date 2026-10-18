import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { Award, Camera, Check, Droplets, Pencil, Sprout, Trophy, X } from 'lucide-react';
import type { UserProfile } from '../../types';
import { BADGES, type GrowerProgress } from '../../utils/growerProgress';
import { BIO_MAX, USERNAME_MAX, growerProgressService, normalizeUsername } from '../../services/growerProgressService';
import { LevelCard } from './LevelCard';
import { BADGE_ICONS } from './badgeIcons';

interface ProfileViewProps {
  currentUser: User | null;
  userProfile: UserProfile | null;
  progress: GrowerProgress;
  onOpenAchievements: () => void;
  onProfileUpdated: (info: Pick<UserProfile, 'username' | 'bio'>) => void;
  showToast?: (msg: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  currentUser,
  userProfile,
  progress,
  onOpenAchievements,
  onProfileUpdated,
  showToast,
}) => {
  const displayName =
    userProfile?.displayName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Cultivador';
  const photoURL = userProfile?.photoURL || currentUser?.photoURL || null;
  const suggestedUsername = normalizeUsername(displayName.replace(/\s+/g, '.'));
  const username = userProfile?.username || '';
  const bio = userProfile?.bio || '';

  const [isEditing, setIsEditing] = useState(false);
  const [draftUsername, setDraftUsername] = useState(username);
  const [draftBio, setDraftBio] = useState(bio);

  useEffect(() => {
    if (!isEditing) {
      setDraftUsername(username);
      setDraftBio(bio);
    }
  }, [username, bio, isEditing]);

  const handleSave = async () => {
    if (!currentUser) return;
    const saved = await growerProgressService.updateProfileInfo(currentUser.uid, {
      username: draftUsername,
      bio: draftBio,
    });
    onProfileUpdated(saved);
    setIsEditing(false);
    showToast?.('Perfil actualizado');
  };

  const { counts } = progress.stats;
  const numbers = [
    { label: 'Cultivos', value: counts.cultivation, icon: Sprout },
    { label: 'Riegos', value: counts.watering, icon: Droplets },
    { label: 'Fotos', value: counts.photo, icon: Camera },
    { label: 'Cosechas', value: counts.harvest, icon: Award },
  ];

  const unlocked = BADGES.filter((b) => progress.unlockedBadgeIds.includes(b.id));
  const recent = unlocked.slice(-4).reverse();

  return (
    <div id="profile-view" className="max-w-2xl mx-auto space-y-4 sm:space-y-5 pb-6">
      {/* Cabecera */}
      <section className="cultiveta-card p-5 sm:p-6">
        <div className="flex items-start gap-4">
          {photoURL ? (
            <img
              src={photoURL}
              alt=""
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl object-cover border border-line shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-icon-bg text-brand border border-brand/20 flex items-center justify-center text-2xl sm:text-3xl font-black shrink-0">
              {displayName[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl font-black text-ink truncate">{displayName}</h1>
            {!isEditing && (
              <>
                <p className="text-xs font-semibold text-brand truncate">
                  @{username || suggestedUsername || 'grower'}
                </p>
                <p className={`text-xs mt-2 leading-relaxed ${bio ? 'text-ink' : 'text-ink-subtle italic'}`}>
                  {bio || 'Contá algo de tu cultivo: tu espacio, tus genéticas favoritas, qué estás probando.'}
                </p>
              </>
            )}
          </div>
          {!isEditing && (
            <button
              type="button"
              id="profile-edit-btn"
              onClick={() => setIsEditing(true)}
              className="min-h-11 min-w-11 flex items-center justify-center rounded-2xl border border-chip-line text-ink-muted hover:bg-surface hover:text-ink cursor-pointer shrink-0"
              aria-label="Editar usuario y bio"
              title="Editar usuario y bio"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>

        {isEditing && (
          <div className="mt-4 space-y-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-ink-muted">Usuario</span>
              <div className="flex items-center rounded-2xl border border-chip-line bg-surface focus-within:border-brand">
                <span className="pl-3 text-sm font-bold text-ink-subtle">@</span>
                <input
                  id="profile-username-input"
                  value={draftUsername}
                  onChange={(e) => setDraftUsername(normalizeUsername(e.target.value))}
                  maxLength={USERNAME_MAX}
                  placeholder={suggestedUsername || 'tu.usuario'}
                  autoComplete="off"
                  className="w-full bg-transparent px-1.5 py-2.5 text-sm text-ink outline-none"
                />
              </div>
              <span className="text-[10px] text-ink-subtle">Letras, números, punto y guion bajo.</span>
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-ink-muted">Bio</span>
              <textarea
                id="profile-bio-input"
                value={draftBio}
                onChange={(e) => setDraftBio(e.target.value.slice(0, BIO_MAX))}
                rows={3}
                placeholder="Indoor 80x80, LED, sustrato con perlita…"
                className="w-full rounded-2xl border border-chip-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-brand resize-none"
              />
              <span className="text-[10px] text-ink-subtle block text-right">
                {draftBio.length}/{BIO_MAX}
              </span>
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setIsEditing(false)} className="cultiveta-btn-secondary text-xs">
                <X className="w-4 h-4" /> Cancelar
              </button>
              <button type="button" id="profile-save-btn" onClick={handleSave} className="cultiveta-btn-primary text-xs">
                <Check className="w-4 h-4" /> Guardar
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Números */}
      <section className="grid grid-cols-4 gap-2 sm:gap-3">
        {numbers.map(({ label, value, icon: Icon }) => (
          <div key={label} className="cultiveta-card p-3 sm:p-4 flex flex-col items-center text-center gap-1">
            <Icon className="w-4 h-4 text-brand" />
            <span className="text-lg sm:text-xl font-black text-ink leading-none">{value}</span>
            <span className="text-[10px] sm:text-[11px] font-semibold text-ink-muted">{label}</span>
          </div>
        ))}
      </section>

      {/* Nivel */}
      <LevelCard progress={progress} onClick={onOpenAchievements} />

      {/* Logros recientes */}
      <section className="cultiveta-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-ink flex items-center gap-2">
            <Trophy className="w-4 h-4 text-brand" />
            Logros
          </h2>
          <span className="text-[11px] font-bold text-ink-muted">
            {unlocked.length} de {BADGES.length}
          </span>
        </div>
        {recent.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {recent.map((b) => {
              const Icon = BADGE_ICONS[b.icon];
              return (
                <span
                  key={b.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ok-bg border border-ok-line px-3 py-1.5 text-[11px] font-bold text-ok-ink"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {b.name}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-ink-muted">
            Todavía no desbloqueaste logros. Registrá un riego o subí una foto para arrancar.
          </p>
        )}
        <button
          type="button"
          id="profile-open-achievements-btn"
          onClick={onOpenAchievements}
          className="cultiveta-btn-secondary w-full text-xs"
        >
          Ver todos los logros
        </button>
      </section>
    </div>
  );
};

export default ProfileView;
