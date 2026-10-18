import React from 'react';
import { ArrowLeft, Flame, Lock, Medal, NotebookText, Sparkles, Trophy } from 'lucide-react';
import {
  BADGE_XP,
  BADGES,
  LEVELS,
  XP_RULES,
  XP_SOURCES,
  type GrowerProgress,
} from '../../utils/growerProgress';
import { formatFriendlyDate } from '../../utils/growthStageUtils';
import { BADGE_ICONS } from './badgeIcons';

interface AchievementsViewProps {
  progress: GrowerProgress;
  /** Fecha en que se ganó cada logro (datos reales). */
  badgeDates: Record<string, string>;
  onBack: () => void;
}

function earnedLabel(iso?: string): string | null {
  if (!iso || iso.length < 10) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return formatFriendlyDate(local, { includeYear: true });
}

export const AchievementsView: React.FC<AchievementsViewProps> = ({ progress, badgeDates, onBack }) => {
  const { level, stats } = progress;
  const pct = Math.round(level.pct * 100);
  const unlockedCount = progress.unlockedBadgeIds.length;

  const kpis = [
    { label: 'Racha', value: stats.streak, icon: Flame },
    { label: 'Mejor racha', value: stats.bestStreak, icon: Medal },
    { label: 'Registros', value: stats.totalRecords, icon: NotebookText },
    { label: 'Logros', value: `${unlockedCount}/${BADGES.length}`, icon: Trophy },
  ];

  return (
    <div id="achievements-view" className="max-w-3xl mx-auto space-y-4 sm:space-y-5 pb-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 min-h-11 px-1 text-xs font-bold text-brand hover:underline cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Mi perfil
      </button>

      {/* Nivel grande */}
      <section className="rounded-[28px] bg-brand-deep text-white p-6 sm:p-7 shadow-lg shadow-brand-deep/20 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-primary/20 blur-2xl" aria-hidden="true" />
        <div className="relative flex items-center gap-5">
          <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-3xl bg-white/10 border border-white/20 flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-soft">Nivel</span>
            <span className="text-4xl sm:text-5xl font-black leading-none">{level.level}</span>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="text-xl sm:text-2xl font-black truncate">{level.name}</h1>
            <div className="h-3 rounded-full bg-white/15 overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-brand-soft font-semibold">
              {level.nextXp !== null
                ? `${level.xp} / ${level.nextXp} XP · faltan ${level.nextXp - level.xp} para ${level.nextName}`
                : `${level.xp} XP · llegaste al nivel máximo`}
            </p>
          </div>
        </div>
      </section>

      {/* Números */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {kpis.map(({ label, value, icon: Icon }) => (
          <div key={label} className="cultiveta-card p-3.5 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-icon-bg text-brand shrink-0">
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-lg font-black text-ink leading-none block">{value}</span>
              <span className="text-[11px] font-semibold text-ink-muted">{label}</span>
            </div>
          </div>
        ))}
      </section>

      {/* Grilla de logros */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink px-1">Logros</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
          {BADGES.map((b) => {
            const isUnlocked = progress.unlockedBadgeIds.includes(b.id);
            const Icon = BADGE_ICONS[b.icon];
            const date = isUnlocked ? earnedLabel(badgeDates[b.id]) : null;
            return (
              <div
                key={b.id}
                data-badge={b.id}
                data-unlocked={isUnlocked ? 'true' : 'false'}
                className={`rounded-3xl p-4 flex flex-col items-center text-center gap-1.5 border ${
                  isUnlocked ? 'bg-card border-ok-line shadow-card' : 'bg-surface border-line'
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                    isUnlocked ? 'bg-ok-bg text-ok-ink border border-ok-line' : 'bg-track text-ink-subtle'
                  }`}
                >
                  {isUnlocked ? <Icon className="w-6 h-6" /> : <Lock className="w-5 h-5" />}
                </div>
                <span className={`text-xs font-bold ${isUnlocked ? 'text-ink' : 'text-ink-muted'}`}>{b.name}</span>
                <span className="text-[11px] leading-snug text-ink-muted">{b.description}</span>
                {isUnlocked && (
                  <span className="text-[10px] font-bold text-ok-ink mt-auto pt-1">
                    {/* Sin fecha guardada: lo desbloquean los datos de ejemplo */}
                    {date ? `Ganado el ${date}` : 'Con datos de ejemplo'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Cómo sumar XP */}
      <section className="cultiveta-card p-5 space-y-3">
        <h2 className="text-sm font-bold text-ink flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand" />
          Cómo sumar XP
        </h2>
        <ul className="divide-y divide-line">
          {XP_SOURCES.map((s) => (
            <li key={s} className="flex items-center justify-between py-2 text-xs">
              <span className="text-ink">{XP_RULES[s].howTo}</span>
              <span className="font-black text-brand">+{XP_RULES[s].xp} XP</span>
            </li>
          ))}
          <li className="flex items-center justify-between py-2 text-xs">
            <span className="text-ink">Desbloquear un logro</span>
            <span className="font-black text-brand">+{BADGE_XP} XP</span>
          </li>
        </ul>
        <p className="text-[11px] text-ink-muted leading-relaxed">
          El XP sale de lo que ya registraste, así que cuenta todo tu historial. Los registros de clima
          exterior automáticos no suman. La racha cuenta los días seguidos con al menos un riego, una
          foto, un registro de ambiente o una nota.
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {LEVELS.map((l, i) => (
            <span
              key={l.name}
              className={`text-[10px] font-bold rounded-full px-2.5 py-1 border ${
                i + 1 === level.level
                  ? 'bg-brand-deep text-white border-brand-deep'
                  : i + 1 < level.level
                    ? 'bg-ok-bg text-ok-ink border-ok-line'
                    : 'bg-surface text-ink-muted border-line'
              }`}
            >
              {i + 1}. {l.name} · {l.minXp}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AchievementsView;
