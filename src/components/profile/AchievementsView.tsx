import React from 'react';
import {
  Camera,
  ChevronLeft,
  ClipboardList,
  Droplet,
  Lock,
  NotebookPen,
  ScanSearch,
  Scissors,
  Sprout,
  Thermometer,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import {
  BADGE_XP,
  BADGES,
  LEVELS,
  XP_RULES,
  XP_SOURCES,
  type GrowerProgress,
  type XpSource,
} from '../../utils/growerProgress';
import { formatFriendlyDate } from '../../utils/growthStageUtils';
import { BADGE_ICONS } from './badgeIcons';

interface AchievementsViewProps {
  progress: GrowerProgress;
  /** Fecha en que se ganó cada logro (datos reales). */
  badgeDates: Record<string, string>;
  onBack: () => void;
}

const XP_ICONS: Record<XpSource, LucideIcon> = {
  watering: Droplet,
  photo: Camera,
  environment: Thermometer,
  diary: NotebookPen,
  cultivation: Sprout,
  fertilization: ClipboardList,
  stage: TrendingUp,
  aiAnalysis: ScanSearch,
  harvest: Scissors,
};

/** Fecha corta en hora local ("17 oct"). */
function earnedLabel(iso?: string): string | null {
  if (!iso || iso.length < 10) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return formatFriendlyDate(local, { includeYear: false });
}

/**
 * Logros y nivel. Misma estructura que la pantalla de logros de Brote (barra con volver, tarjeta
 * con el nivel grande y la barra de XP, "Cómo sumar XP", grilla de logros y lista de niveles),
 * con los colores de Cultiveta.
 */
export const AchievementsView: React.FC<AchievementsViewProps> = ({ progress, badgeDates, onBack }) => {
  const { level } = progress;
  const pct = Math.round(level.pct * 100);

  return (
    <div id="achievements-view" className="max-w-[480px] mx-auto pb-6">
      {/* Barra: volver + título */}
      <div className="flex items-center gap-2.5 pt-1 pb-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver a mi perfil"
          className="w-10 h-10 rounded-[14px] grid place-items-center bg-card text-ink shadow-card cursor-pointer hover:bg-surface"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-[1.2rem] font-black text-white drop-shadow-sm">Logros y nivel</h1>
      </div>

      {/* Nivel grande */}
      <section
        id="achievements-level-hero"
        className="relative overflow-hidden rounded-[28px] px-[18px] py-4 mb-3.5 text-center text-white shadow-[0_14px_30px_rgba(27,46,122,0.30)]"
        style={{ background: 'linear-gradient(135deg, var(--color-ocean-20) 0%, var(--color-ocean-60) 50%, var(--color-brand-deep) 100%)' }}
      >
        <div className="absolute -right-[60px] -top-[60px] w-[200px] h-[200px] rounded-full bg-white/10" aria-hidden="true" />
        <div className="relative">
          <div className="w-[76px] h-[76px] mx-auto mb-2 rounded-2xl bg-white text-brand-deep grid place-items-center text-[2.4rem] font-black -rotate-6 shadow-md">
            {level.level}
          </div>
          <h2 className="text-[1.7rem] font-black leading-tight">{level.name}</h2>
          <div
            className="h-2.5 max-w-[260px] mx-auto mt-2.5 mb-1 rounded-full bg-white/30 overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Avance al próximo nivel"
          >
            <span className="block h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
          <p className="font-semibold opacity-95 text-sm">
            {level.nextXp !== null
              ? `${level.xp} / ${level.nextXp} XP · siguiente: ${level.nextName}`
              : `${level.xp} XP · nivel máximo`}
          </p>
        </div>
      </section>

      {/* Cómo sumar XP */}
      <section className="bg-card rounded-[20px] p-4 mb-3.5 shadow-card">
        <h3 className="text-[1.12rem] font-black text-ink">Cómo sumar XP</h3>
        <ul className="mt-2 flex flex-col gap-2">
          {XP_SOURCES.map((s) => {
            const Icon = XP_ICONS[s];
            return (
              <li key={s} className="flex items-center gap-2.5 text-sm text-ink">
                <Icon className="w-5 h-5 text-brand shrink-0" />
                {XP_RULES[s].label}
                <b className="ml-auto font-black text-brand">+{XP_RULES[s].xp}</b>
              </li>
            );
          })}
          <li className="flex items-center gap-2.5 text-sm text-ink">
            <Trophy className="w-5 h-5 text-brand shrink-0" />
            Logro desbloqueado
            <b className="ml-auto font-black text-brand">+{BADGE_XP}</b>
          </li>
        </ul>
      </section>

      {/* Grilla de logros */}
      <section className="grid grid-cols-2 min-[361px]:grid-cols-3 gap-2.5 mb-3.5">
        {BADGES.map((b) => {
          const isUnlocked = progress.unlockedBadgeIds.includes(b.id);
          const Icon = BADGE_ICONS[b.icon];
          const date = isUnlocked ? earnedLabel(badgeDates[b.id]) : null;
          return (
            <div
              key={b.id}
              data-badge={b.id}
              data-unlocked={isUnlocked ? 'true' : 'false'}
              className={`rounded-[18px] px-2 py-3 text-center flex flex-col items-center gap-[3px] shadow-card ${
                isUnlocked ? 'outline-2 outline-ok' : 'bg-card opacity-55'
              }`}
              style={isUnlocked ? { background: 'linear-gradient(180deg, var(--color-card), var(--color-ok-bg))' } : undefined}
            >
              {isUnlocked ? (
                <Icon className="w-[30px] h-[30px] text-brand" />
              ) : (
                <Lock className="w-[30px] h-[30px] text-ink-subtle" />
              )}
              <b className="text-[0.86rem] font-black text-ink leading-tight">{b.name}</b>
              <small className="text-[0.7rem] text-ink-muted leading-tight">{b.description}</small>
              {isUnlocked && (
                <em className="not-italic text-[0.66rem] font-black text-ok-ink">{date || 'ejemplo'}</em>
              )}
            </div>
          );
        })}
      </section>

      {/* Niveles */}
      <section className="bg-card rounded-[20px] p-4 shadow-card">
        <h3 className="text-[1.12rem] font-black text-ink">Niveles</h3>
        <ol className="mt-2 flex flex-col gap-1.5">
          {LEVELS.map((l, i) => {
            const reached = i + 1 <= level.level;
            return (
              <li
                key={l.name}
                className={`flex items-center gap-2.5 p-2 rounded-xl bg-surface font-bold text-sm text-ink ${
                  reached ? '' : 'opacity-60'
                } ${i + 1 === level.level ? 'ring-2 ring-primary' : ''}`}
              >
                <span
                  className="w-7 h-7 rounded-[9px] grid place-items-center text-white font-black text-xs"
                  style={{ background: 'linear-gradient(135deg, var(--color-ocean-20), var(--color-brand-deep))' }}
                >
                  {i + 1}
                </span>
                {l.name}
                <small className="ml-auto text-xs font-semibold text-ink-muted">{l.minXp} XP</small>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
};

export default AchievementsView;
