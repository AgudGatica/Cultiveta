import React from 'react';
import { ChevronRight, Flame } from 'lucide-react';
import type { GrowerProgress } from '../../utils/growerProgress';

interface LevelCardProps {
  progress: GrowerProgress;
  onClick?: () => void;
}

/** Tarjeta de nivel: "Nivel 4 · Grower", barra de XP y racha. */
export const LevelCard: React.FC<LevelCardProps> = ({ progress, onClick }) => {
  const { level, stats } = progress;
  const pct = Math.round(level.pct * 100);
  const content = (
    <>
      <div className="w-14 h-14 shrink-0 rounded-2xl bg-brand-deep text-white flex flex-col items-center justify-center shadow-md shadow-brand-deep/20">
        <span className="text-[9px] font-bold uppercase tracking-wider text-brand-soft leading-none">Nivel</span>
        <span className="text-2xl font-black leading-none mt-0.5">{level.level}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-ink truncate">
            Nivel {level.level} · {level.name}
          </span>
          {onClick && <ChevronRight className="w-4 h-4 text-ink-subtle shrink-0" />}
        </div>
        <div
          className="h-2.5 rounded-full bg-track overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Avance al próximo nivel"
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-ink-muted">
          <span className="font-semibold">
            {level.nextXp !== null ? `${level.xp} / ${level.nextXp} XP` : `${level.xp} XP · nivel máximo`}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold">
            <Flame className={`w-3.5 h-3.5 ${stats.streak > 0 ? 'text-coral' : 'text-ink-subtle'}`} />
            {stats.streak === 1 ? '1 día de racha' : `${stats.streak} días de racha`}
          </span>
        </div>
      </div>
    </>
  );

  const className = 'cultiveta-card p-4 sm:p-5 flex items-center gap-4 w-full text-left';
  return onClick ? (
    <button type="button" id="profile-level-card" onClick={onClick} className={`${className} cultiveta-card-hover cursor-pointer`}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
};
