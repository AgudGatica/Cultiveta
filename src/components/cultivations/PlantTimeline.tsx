import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Camera, ChevronDown, Droplets, Flag, NotebookPen, type LucideIcon } from 'lucide-react';
import type { Cultivation, DiaryEntry, Genetics, PhotoRecord, Watering } from '../../types';
import {
  buildPlantTimeline,
  stemSegmentPx,
  type PlantCrown,
  type PlantEventKind,
  type PlantTimelineEvent,
} from '../../utils/plantTimeline';
import { formatFriendlyDate } from '../../utils/growthStageUtils';
import { PhotoImageView } from '../common/PhotoImageView';

interface PlantTimelineProps {
  cultivation: Cultivation;
  waterings: Watering[];
  diaryEntries: DiaryEntry[];
  photos: PhotoRecord[];
  geneticsList?: Genetics[];
  userId?: string;
}

/** Eventos visibles de entrada; el resto se despliega con "Ver anteriores". */
const PAGE_SIZE = 20;

const LEAF = '#4E9F3D';
const LEAF_DARK = '#2D6B28';
const LEAF_LIGHT = '#7CC46B';

const KIND_META: Record<PlantEventKind, { icon: LucideIcon; label: string; card: string; iconTone: string }> = {
  stage: { icon: Flag, label: 'Etapa', card: 'bg-ok-bg border-ok-line', iconTone: 'bg-ok text-white' },
  photo: { icon: Camera, label: 'Foto', card: 'bg-white border-line', iconTone: 'bg-icon-bg text-brand' },
  note: { icon: NotebookPen, label: 'Nota', card: 'bg-warn-bg border-warn-line', iconTone: 'bg-white text-warn-ink' },
  watering: { icon: Droplets, label: 'Riego', card: 'bg-surface border-chip-line', iconTone: 'bg-icon-bg text-brand' },
  watering_group: { icon: Droplets, label: 'Riegos', card: 'bg-surface border-chip-line', iconTone: 'bg-track text-ink-muted' },
};

/** Hoja de cannabis: folíolos que salen de un punto, más largos en el centro. */
function FanLeaf({ x, y, angle, size, color = LEAF }: { x: number; y: number; angle: number; size: number; color?: string }) {
  const leaflets = [
    { a: -70, l: 0.5 },
    { a: -40, l: 0.78 },
    { a: -15, l: 0.95 },
    { a: 0, l: 1 },
    { a: 15, l: 0.95 },
    { a: 40, l: 0.78 },
    { a: 70, l: 0.5 },
  ];
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      {leaflets.map((f, i) => {
        const len = size * f.l;
        return (
          <ellipse
            key={i}
            cx={0}
            cy={-len / 2}
            rx={Math.max(2.2, size * 0.09)}
            ry={len / 2}
            fill={color}
            stroke={LEAF_DARK}
            strokeWidth={0.8}
            transform={`rotate(${f.a})`}
          />
        );
      })}
    </g>
  );
}

/** Cogollo: racimo de cálices con pistilos. */
function Bud({ x, y, scale = 1, ripe = false }: { x: number; y: number; scale?: number; ripe?: boolean }) {
  const calyx = ripe ? '#C9D86B' : '#A8D86B';
  const pistil = ripe ? '#D9822B' : '#F5F1E6';
  const balls = [
    [0, -34, 7],
    [-6, -26, 7.5],
    [6, -26, 7.5],
    [-8, -16, 8],
    [8, -16, 8],
    [0, -18, 8.5],
    [-4, -7, 8],
    [5, -7, 8],
  ];
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {balls.map(([bx, by, r], i) => (
        <circle key={i} cx={bx} cy={by} r={r} fill={calyx} stroke={LEAF_DARK} strokeWidth={0.7} />
      ))}
      {[
        [-3, -38, -8, -44],
        [3, -36, 8, -43],
        [-9, -22, -15, -26],
        [10, -20, 16, -24],
        [-6, -10, -13, -12],
        [7, -11, 14, -13],
      ].map(([x1, y1, x2, y2], i) => (
        <path key={i} d={`M${x1} ${y1} Q ${(x1 + x2) / 2} ${y2 - 2} ${x2} ${y2}`} stroke={pistil} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      ))}
    </g>
  );
}

/** Copa de la planta según la etapa (arriba del tallo). */
function PlantCrownArt({ crown, growth }: { crown: PlantCrown; growth: number }) {
  const scale = 0.6 + 0.4 * growth;
  const label =
    crown === 'seedling'
      ? 'Plántula con sus primeras hojas'
      : crown === 'harvest'
        ? 'Planta cosechada'
        : crown === 'flower'
          ? 'Planta en floración'
          : crown === 'preflower'
            ? 'Planta en prefloración'
            : 'Planta en vegetativo';
  return (
    <motion.svg
      viewBox="0 0 200 150"
      className="block mx-auto"
      style={{ width: `${Math.round(200 * scale)}px`, height: `${Math.round(150 * scale)}px` }}
      role="img"
      aria-label={label}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 160, damping: 16 }}
    >
      {/* Remate del tallo */}
      <path d="M100 150 L100 70" stroke={LEAF_DARK} strokeWidth={6} strokeLinecap="round" />
      {crown === 'seedling' ? (
        <>
          <ellipse cx={78} cy={92} rx={22} ry={10} fill={LEAF_LIGHT} stroke={LEAF_DARK} strokeWidth={1} transform="rotate(-25 78 92)" />
          <ellipse cx={122} cy={92} rx={22} ry={10} fill={LEAF_LIGHT} stroke={LEAF_DARK} strokeWidth={1} transform="rotate(25 122 92)" />
          <FanLeaf x={100} y={78} angle={0} size={26} color={LEAF_LIGHT} />
        </>
      ) : (
        <>
          <FanLeaf x={100} y={112} angle={-62} size={58} />
          <FanLeaf x={100} y={112} angle={62} size={58} />
          <FanLeaf x={100} y={88} angle={-38} size={46} color={LEAF_LIGHT} />
          <FanLeaf x={100} y={88} angle={38} size={46} color={LEAF_LIGHT} />
          {crown === 'vegetative' && <FanLeaf x={100} y={72} angle={0} size={44} />}
          {crown === 'preflower' && (
            <>
              <FanLeaf x={100} y={72} angle={0} size={40} />
              {[
                [96, 36],
                [104, 34],
                [100, 30],
              ].map(([px, py], i) => (
                <path key={i} d={`M100 ${py + 8} Q ${px} ${py + 2} ${px + (px - 100)} ${py}`} stroke="#F5F1E6" strokeWidth={1.6} fill="none" strokeLinecap="round" />
              ))}
            </>
          )}
          {(crown === 'flower' || crown === 'harvest') && (
            <>
              <Bud x={72} y={104} scale={0.55} ripe={crown === 'harvest'} />
              <Bud x={128} y={104} scale={0.55} ripe={crown === 'harvest'} />
              <Bud x={100} y={78} scale={1.05} ripe={crown === 'harvest'} />
            </>
          )}
        </>
      )}
    </motion.svg>
  );
}

/** Maceta con sustrato (inicio del cultivo). */
function PotArt() {
  return (
    <svg viewBox="0 0 120 84" className="block mx-auto w-[110px] h-[77px]" role="img" aria-label="Maceta: inicio del cultivo">
      <path d="M60 0 L60 18" stroke={LEAF_DARK} strokeWidth={6} strokeLinecap="round" />
      <ellipse cx={60} cy={20} rx={44} ry={7} fill="#6B4A2F" />
      <path d="M14 18 L106 18 L96 80 Q60 86 24 80 Z" fill="#D9774B" stroke="#A9532F" strokeWidth={1.5} />
      <rect x={10} y={14} width={100} height={12} rx={5} fill="#E8875A" stroke="#A9532F" strokeWidth={1.5} />
    </svg>
  );
}

/** Fecha corta y día del cultivo: "27 oct · Día 17". */
function dateLine(e: PlantTimelineEvent) {
  return `${formatFriendlyDate(e.date, { includeYear: false })} · Día ${e.dayNumber}`;
}

/** Etapa en que estaba ese día: "Vegetativo, día 9". */
function stageLine(e: PlantTimelineEvent): string | null {
  if (!e.stageName) return null;
  return e.stageDay ? `${e.stageName}, día ${e.stageDay}` : e.stageName;
}

/** Foto grande, centrada sobre el tallo, con su descripción y cuándo se sacó. */
function PhotoCard({ event, userId }: { event: PlantTimelineEvent; userId?: string }) {
  const caption = event.photo?.caption?.trim();
  const stage = stageLine(event);
  return (
    <figure
      data-event-kind="photo"
      className="relative z-10 mx-auto w-[88%] max-w-[340px] rounded-[26px] bg-white border border-chip-line shadow-card p-2.5 space-y-2"
    >
      <div className="aspect-[4/3] rounded-[18px] overflow-hidden bg-track">
        {event.photo && (
          <PhotoImageView photo={event.photo} userId={userId} alt={caption || 'Foto del cultivo'} className="w-full h-full object-cover" />
        )}
      </div>
      {caption && (
        <figcaption className="px-1 text-center text-[15px] font-black text-ink leading-snug line-clamp-3">
          “{caption}”
        </figcaption>
      )}
      <div className="flex flex-wrap items-center justify-center gap-1.5 pb-0.5 text-[11px] font-bold">
        <span className="text-ink-muted">{dateLine(event)}</span>
        {stage && <span className="px-2 py-0.5 rounded-full bg-ok-bg border border-ok-line text-ok-ink">{stage}</span>}
      </div>
    </figure>
  );
}

/** Tarjeta al costado del tallo (notas, riegos y cambios de etapa). */
function SideCard({ event }: { event: PlantTimelineEvent }) {
  const meta = KIND_META[event.kind];
  const Icon = meta.icon;
  const stage = event.kind === 'stage' ? null : stageLine(event);
  const isNote = event.kind === 'note';
  const customTitle = isNote && event.title !== 'Nota del diario' ? event.title : null;
  return (
    <div className={`rounded-2xl border p-2.5 space-y-1 shadow-2xs text-left ${meta.card}`} data-event-kind={event.kind}>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${meta.iconTone}`}>
          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-ink-muted truncate">{meta.label}</span>
      </div>
      {isNote ? (
        <>
          {customTitle && <p className="text-xs font-bold text-ink leading-snug line-clamp-2">{customTitle}</p>}
          {event.detail && <p className="text-xs text-ink leading-snug line-clamp-4">{event.detail}</p>}
        </>
      ) : (
        <>
          <p className="text-xs font-bold text-ink leading-snug line-clamp-2">{event.title}</p>
          {event.detail && <p className="text-[11px] text-ink-muted leading-snug line-clamp-3">{event.detail}</p>}
        </>
      )}
      <p className="text-[10px] font-semibold text-ink-subtle leading-snug">
        {dateLine(event)}
        {stage && (
          <>
            <br />
            {stage}
          </>
        )}
      </p>
    </div>
  );
}

/** Hoja del nudo hacia la tarjeta. */
function NodeLeaf({ toRight, highlight }: { toRight: boolean; highlight: boolean }) {
  return (
    <svg viewBox="0 0 44 48" className="absolute inset-0 w-11 h-12 overflow-visible" aria-hidden="true">
      <g transform={toRight ? 'translate(22 24)' : 'translate(22 24) scale(-1 1)'}>
        <path d="M0 0 Q 16 -20 42 -9 Q 22 11 0 0 Z" fill={highlight ? LEAF_LIGHT : LEAF} stroke={LEAF_DARK} strokeWidth={1.1} />
        <path d="M0 0 Q 20 -8 39 -9" stroke={LEAF_DARK} strokeWidth={0.9} fill="none" />
      </g>
      <circle cx={22} cy={24} r={highlight ? 5.5 : 4} fill={highlight ? '#F3C843' : LEAF_DARK} />
    </svg>
  );
}

/**
 * Hoja grande del lado libre: lugar de descanso para la mascota (cuando esté definida se sienta acá).
 * Aparece cada tantos registros, como los personajes al costado del camino.
 */
function MascotSpot({ toRight }: { toRight: boolean }) {
  return (
    <div data-mascot-spot className="relative h-24" aria-hidden="true">
      <svg
        viewBox="0 0 120 60"
        className={`absolute top-1 ${toRight ? 'left-0' : 'right-0 -scale-x-100'} w-[120px] h-[60px] max-w-full overflow-visible`}
      >
        <path d="M0 26 Q 40 -8 116 14 Q 60 52 0 26 Z" fill={LEAF_LIGHT} stroke={LEAF_DARK} strokeWidth={1.2} />
        <path d="M0 26 Q 56 6 112 15" stroke={LEAF_DARK} strokeWidth={1} fill="none" />
        <path d="M34 15 L 44 25 M58 10 L 66 22 M82 10 L 88 20" stroke={LEAF_DARK} strokeWidth={0.8} fill="none" />
      </svg>
    </div>
  );
}

/** Cada cuántas tarjetas al costado aparece una hoja grande para la mascota. */
const MASCOT_SPOT_EVERY = 3;

/**
 * Línea de tiempo con forma de planta: abajo la maceta (inicio), el tallo crece hacia arriba según
 * los días. Las fotos van grandes, centradas sobre el tallo; notas, riegos y etapas salen del tallo
 * como hojas con su tarjeta al costado. Arriba, la copa de la etapa actual.
 */
export const PlantTimeline: React.FC<PlantTimelineProps> = ({
  cultivation,
  waterings,
  diaryEntries,
  photos,
  geneticsList = [],
  userId,
}) => {
  const [showAll, setShowAll] = useState(false);
  const model = useMemo(
    () => buildPlantTimeline(cultivation, { waterings, diaryEntries, photos }, geneticsList),
    [cultivation, waterings, diaryEntries, photos, geneticsList]
  );

  const visible = showAll ? model.events : model.events.slice(0, PAGE_SIZE);
  const hidden = model.events.length - visible.length;
  // Grosor del tallo: crece con el cultivo
  const stemWidth = Math.round(4 + 6 * model.growth);
  const stem = (
    <span
      aria-hidden="true"
      data-stem
      className="absolute inset-y-0 left-1/2 -translate-x-1/2"
      style={{ width: stemWidth, background: `linear-gradient(90deg, ${LEAF_DARK}, ${LEAF} 45%, ${LEAF_DARK})` }}
    />
  );

  // Las tarjetas al costado alternan de lado; las fotos van al centro y no cuentan
  let sideIndex = 0;

  return (
    <section id="plant-timeline" aria-labelledby="plant-timeline-title" className="cultiveta-card p-3 sm:p-6 space-y-2 overflow-hidden">
      <div className="px-1">
        <h2 id="plant-timeline-title" className="text-base sm:text-lg font-extrabold text-ink">
          Tu planta
        </h2>
        <p className="text-xs text-ink-muted">
          Día {model.totalDays} · {model.stageName} · {model.events.length === 1 ? '1 registro' : `${model.events.length} registros`}
        </p>
      </div>

      <div className="relative pt-1 max-w-xl mx-auto" data-crown={model.crown}>
        <PlantCrownArt crown={model.crown} growth={model.growth} />

        {/* Tallo continuo: desde la copa hasta la maceta, detrás de los registros */}
        <div className="relative">
          {stem}

          {/* Tramo entre la copa y el registro más reciente (días sin registros) */}
          <div style={{ height: stemSegmentPx(Math.min(model.gapDaysToToday, 10)) }} />

          <ol aria-label="Registros del cultivo, del más reciente al inicio" className="relative">
            {visible.map((event, i) => {
              const animation = {
                initial: { opacity: 0, y: 8 },
                animate: { opacity: 1, y: 0 },
                transition: { duration: 0.25, delay: Math.min(i, 8) * 0.04 },
              };

              if (event.kind === 'photo') {
                return (
                  <motion.li
                    key={event.id}
                    data-event-id={event.id}
                    data-layout="center"
                    className="relative"
                    style={{ paddingBottom: stemSegmentPx(event.gapDaysToOlder) }}
                    {...animation}
                  >
                    <PhotoCard event={event} userId={userId} />
                  </motion.li>
                );
              }

              const right = sideIndex % 2 === 0;
              const showMascotSpot = sideIndex % MASCOT_SPOT_EVERY === MASCOT_SPOT_EVERY - 1;
              sideIndex++;
              return (
                <motion.li
                  key={event.id}
                  data-event-id={event.id}
                  data-layout={right ? 'right' : 'left'}
                  className="relative grid grid-cols-[1fr_44px_1fr] items-start"
                  style={{ paddingBottom: stemSegmentPx(event.gapDaysToOlder) }}
                  {...animation}
                >
                  <div className="pr-1">
                    {right ? showMascotSpot && <MascotSpot toRight={false} /> : <SideCard event={event} />}
                  </div>
                  <div className="relative h-12">
                    <NodeLeaf toRight={right} highlight={event.kind === 'stage'} />
                  </div>
                  <div className="pl-1">
                    {right ? <SideCard event={event} /> : showMascotSpot && <MascotSpot toRight />}
                  </div>
                </motion.li>
              );
            })}
          </ol>

          {hidden > 0 && (
            <div className="relative flex justify-center py-2">
              <button
                type="button"
                id="plant-timeline-more-btn"
                onClick={() => setShowAll(true)}
                className="relative z-10 cultiveta-btn-secondary text-xs"
              >
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
                Ver anteriores ({hidden})
              </button>
            </div>
          )}
        </div>

        <PotArt />
        <p className="text-center text-xs font-bold text-ink mt-1">
          {model.isStartKnown ? 'Inicio' : 'Primer registro'} · {formatFriendlyDate(model.startDate)}
        </p>
        {model.events.length === 0 && (
          <p className="text-center text-xs text-ink-muted mt-2 max-w-xs mx-auto">
            Todavía no hay registros. Tus fotos, notas y riegos van a ir apareciendo en el tallo a medida que crece.
          </p>
        )}
      </div>
    </section>
  );
};
