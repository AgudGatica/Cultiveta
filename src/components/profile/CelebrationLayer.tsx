import React, { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Sparkles, Trophy } from 'lucide-react';
import { BADGES } from '../../utils/growerProgress';
import type { Celebration, XpToast } from '../../hooks/useGrowerProgress';
import { BADGE_ICONS } from './badgeIcons';

interface CelebrationLayerProps {
  celebrations: Celebration[];
  onDismissCelebration: () => void;
  xpToasts: XpToast[];
  onDismissXpToast: (id: string) => void;
  onOpenAchievements?: () => void;
}

const CONFETTI_COLORS = ['var(--color-primary)', 'var(--color-accent)', 'var(--color-ocean-40)', 'var(--color-ocean-60)', 'var(--color-ok)', 'var(--color-coral)'];
const TOAST_MS = 2600;

const XpToastItem: React.FC<{ toast: XpToast; onDone: (id: string) => void }> = ({ toast, onDone }) => {
  useEffect(() => {
    const t = setTimeout(() => onDone(toast.id), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast.id, onDone]);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-brand-deep text-white pl-2 pr-4 py-1.5 shadow-lg shadow-brand-deep/25 text-xs font-bold"
      role="status"
    >
      <span className="rounded-full bg-primary text-ink px-2 py-0.5 text-[11px] font-black">+{toast.xp} XP</span>
      {toast.label}
    </motion.div>
  );
};

/** Festejos en cola (uno por vez) y avisos chicos de XP. */
export const CelebrationLayer: React.FC<CelebrationLayerProps> = ({
  celebrations,
  onDismissCelebration,
  xpToasts,
  onDismissXpToast,
  onOpenAchievements,
}) => {
  const current = celebrations[0];
  // Mientras hay un festejo abierto, los avisos de XP esperan (no se superponen).
  const visibleToasts = current ? [] : xpToasts.slice(0, 3);

  const confetti = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.35,
        rotate: Math.random() * 360,
        drift: (Math.random() - 0.5) * 80,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    // Nuevo confeti por festejo
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current?.id]
  );

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') onDismissCelebration();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, onDismissCelebration]);

  const badge = current?.badgeId ? BADGES.find((b) => b.id === current.badgeId) : null;
  const Icon = badge ? BADGE_ICONS[badge.icon] : Trophy;
  const remaining = celebrations.length - 1;

  return (
    <>
      <div className="fixed left-0 right-0 bottom-24 lg:bottom-8 z-[70] flex flex-col items-center gap-2 pointer-events-none px-4">
        <AnimatePresence>
          {visibleToasts.map((t) => (
            <XpToastItem key={t.id} toast={t} onDone={onDismissXpToast} />
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.id}
            id="celebration-overlay"
            className="fixed inset-0 z-[80] flex items-center justify-center p-6 bg-ink/45 backdrop-blur-xs overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onDismissCelebration}
          >
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              {confetti.map((c, i) => (
                <motion.span
                  key={i}
                  className="absolute top-0 w-2 h-3 rounded-[2px]"
                  style={{ left: `${c.left}%`, backgroundColor: c.color }}
                  initial={{ y: -20, x: 0, rotate: c.rotate, opacity: 1 }}
                  animate={{ y: '105vh', x: c.drift, rotate: c.rotate + 540, opacity: [1, 1, 0.6] }}
                  transition={{ duration: 2.4, delay: c.delay, ease: 'easeIn' }}
                />
              ))}
            </div>

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="celebration-title"
              className="relative w-full max-w-xs cultiveta-modal-container p-6 text-center space-y-3"
              initial={{ scale: 0.8, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                className={`mx-auto w-20 h-20 rounded-3xl flex items-center justify-center ${
                  current.kind === 'level' ? 'bg-brand-deep text-white' : 'bg-ok-bg text-ok-ink border border-ok-line'
                }`}
                initial={{ rotate: -12, scale: 0.6 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 0.1 }}
              >
                {current.kind === 'level' ? (
                  <span className="text-4xl font-black">{current.level}</span>
                ) : (
                  <Icon className="w-10 h-10" />
                )}
              </motion.div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand flex items-center justify-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                {current.kind === 'level' ? 'Subiste de nivel' : 'Logro'}
              </p>
              <h2 id="celebration-title" className="text-xl font-black text-ink">
                {current.title}
              </h2>
              <p className="text-sm text-ink-muted">{current.text}</p>
              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  id="celebration-ok-btn"
                  autoFocus
                  onClick={onDismissCelebration}
                  className="cultiveta-btn-primary w-full"
                >
                  {remaining > 0 ? `¡Bien! (${remaining} más)` : '¡Bien!'}
                </button>
                {onOpenAchievements && remaining === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onDismissCelebration();
                      onOpenAchievements();
                    }}
                    className="w-full min-h-11 text-xs font-bold text-brand hover:underline cursor-pointer"
                  >
                    Ver mis logros
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
