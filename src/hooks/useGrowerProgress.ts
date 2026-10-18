import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AIPhotoAnalysis, FertilizationSchedule } from '../types';
import {
  BADGES,
  computeProgress,
  diffProgress,
  type GrowerProgress,
  type PersistedProgress,
  type ProgressInput,
} from '../utils/growerProgress';
import { growerProgressService } from '../services/growerProgressService';

export interface Celebration {
  id: string;
  kind: 'badge' | 'level';
  title: string;
  text: string;
  /** id del logro (para el ícono) o null en una subida de nivel. */
  badgeId: string | null;
  level?: number;
}

export interface XpToast {
  id: string;
  xp: number;
  label: string;
}

/** Espera tras la carga inicial antes de festejar: los listeners llegan de a uno. */
const SETTLE_MS = 2500;

type BaseInput = Omit<ProgressInput, 'fertilizationSchedules' | 'photoAnalyses'>;

/**
 * Calcula nivel, XP, logros y racha a partir de los datos en vivo y detecta qué festejar.
 * Los festejos salen de comparar cada cambio con el anterior (sin datos de ejemplo), así que
 * funcionan igual con cualquier forma de guardar: modales, acción rápida, offline u otro dispositivo.
 */
export function useGrowerProgress(uid: string | null | undefined, data: BaseInput, dataReady: boolean) {
  const [fertilizationSchedules, setFertilizationSchedules] = useState<FertilizationSchedule[]>([]);
  const [photoAnalyses, setPhotoAnalyses] = useState<AIPhotoAnalysis[]>([]);
  const [persisted, setPersisted] = useState<PersistedProgress | null>(null);
  const [persistedConfirmed, setPersistedConfirmed] = useState(false);
  const [settled, setSettled] = useState(false);
  const [celebrations, setCelebrations] = useState<Celebration[]>([]);
  const [xpToasts, setXpToasts] = useState<XpToast[]>([]);

  const previousRef = useRef<GrowerProgress | null>(null);
  const handledBadgesRef = useRef<Set<string>>(new Set());
  const handledLevelRef = useRef(1);
  const initializedRef = useRef(false);

  useEffect(() => {
    setFertilizationSchedules([]);
    setPhotoAnalyses([]);
    setPersisted(null);
    setPersistedConfirmed(false);
    setSettled(false);
    setCelebrations([]);
    setXpToasts([]);
    previousRef.current = null;
    handledBadgesRef.current = new Set();
    handledLevelRef.current = 1;
    initializedRef.current = false;
    if (!uid) return;
    const unsubs = [
      growerProgressService.subscribeFertilizationSchedules(uid, setFertilizationSchedules),
      growerProgressService.subscribePhotoAnalyses(uid, setPhotoAnalyses),
      growerProgressService.subscribeProgress(uid, (value, confirmed) => {
        setPersisted(value);
        if (confirmed) setPersistedConfirmed(true);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [uid]);

  useEffect(() => {
    if (!uid || !dataReady) return;
    const t = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, [uid, dataReady]);

  const input: ProgressInput = useMemo(
    () => ({ ...data, fertilizationSchedules, photoAnalyses }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.cultivations, data.waterings, data.environmentRecords, data.photos, data.diaryEntries, data.harvests, fertilizationSchedules, photoAnalyses]
  );

  /** Lo que se muestra (incluye datos de ejemplo). */
  const progress = useMemo(() => computeProgress(input, { includeDemo: true }), [input]);
  /** Lo que se festeja y se guarda (sin datos de ejemplo). */
  const realProgress = useMemo(() => computeProgress(input, { includeDemo: false }), [input]);

  useEffect(() => {
    if (!uid) return;
    if (!settled || !persistedConfirmed) {
      previousRef.current = realProgress;
      return;
    }

    if (persisted) {
      Object.keys(persisted.badges).forEach((id) => handledBadgesRef.current.add(id));
      handledLevelRef.current = Math.max(handledLevelRef.current, persisted.celebratedLevel || 1);
    }
    const effectivePersisted: PersistedProgress | null =
      persisted || initializedRef.current
        ? {
            badges: Object.fromEntries([...handledBadgesRef.current].map((id) => [id, persisted?.badges[id] || 'x'])),
            celebratedLevel: handledLevelRef.current,
          }
        : null;

    const diff = diffProgress(previousRef.current, realProgress, effectivePersisted);
    previousRef.current = realProgress;
    const now = new Date().toISOString();

    if (diff.initialize) {
      // Primera vez de la cuenta: lo que ya tiene se guarda sin festejar.
      initializedRef.current = true;
      realProgress.unlockedBadgeIds.forEach((id) => handledBadgesRef.current.add(id));
      handledLevelRef.current = realProgress.level.level;
      growerProgressService.saveProgress(uid, {
        badges: Object.fromEntries(realProgress.unlockedBadgeIds.map((id) => [id, now])),
        celebratedLevel: realProgress.level.level,
      });
      return;
    }

    if (diff.xpEvents.length > 0) {
      setXpToasts((prev) => [
        ...prev,
        ...diff.xpEvents.map((e, i) => ({ id: `${Date.now()}_${e.source}_${i}`, xp: e.xp, label: e.label })),
      ]);
    }

    const newCelebrations: Celebration[] = [];
    const badgePatch: Record<string, string> = {};
    for (const id of diff.newBadgeIds) {
      handledBadgesRef.current.add(id);
      badgePatch[id] = now;
      const def = BADGES.find((b) => b.id === id);
      if (def) {
        newCelebrations.push({
          id: `badge_${id}`,
          kind: 'badge',
          title: 'Logro desbloqueado',
          text: `${def.name} · +30 XP`,
          badgeId: id,
        });
      }
    }
    let levelPatch: number | undefined;
    if (diff.levelUp) {
      handledLevelRef.current = diff.levelUp.level;
      levelPatch = diff.levelUp.level;
      newCelebrations.push({
        id: `level_${diff.levelUp.level}`,
        kind: 'level',
        title: `¡Nivel ${diff.levelUp.level}!`,
        text: `Ahora sos ${diff.levelUp.name}`,
        badgeId: null,
        level: diff.levelUp.level,
      });
    }
    if (newCelebrations.length > 0) {
      setCelebrations((prev) => [...prev, ...newCelebrations.filter((c) => !prev.some((p) => p.id === c.id))]);
      growerProgressService.saveProgress(uid, { badges: badgePatch, celebratedLevel: levelPatch });
    }
  }, [uid, realProgress, persisted, persistedConfirmed, settled]);

  const dismissCelebration = useCallback(() => setCelebrations((prev) => prev.slice(1)), []);
  const dismissXpToast = useCallback((id: string) => setXpToasts((prev) => prev.filter((t) => t.id !== id)), []);

  return {
    progress,
    /** Fecha en que se ganó cada logro (solo los de datos reales). */
    badgeDates: persisted?.badges || {},
    celebrations,
    xpToasts,
    dismissCelebration,
    dismissXpToast,
  };
}

export type GrowerProgressState = ReturnType<typeof useGrowerProgress>;
