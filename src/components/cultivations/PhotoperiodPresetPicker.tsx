import React from 'react';
import { FlaskConical, Lock, Moon, Sun, SunDim } from 'lucide-react';
import {
  FLOWER_PRESETS,
  SUPERCYCLE_PRESETS,
  VEG_PRESETS,
  canUseSupercycles,
  darkHoursFor,
  findPhotoperiodPreset,
  type PhotoperiodPreset,
} from '../../utils/photoperiods';

interface PhotoperiodPresetPickerProps {
  /** Horas de luz elegidas ('' = sin definir). */
  light: number | '';
  dark?: number | null;
  onSelect: (light: number, dark: number) => void;
  /** Enchufe inteligente Wi-Fi conectado (habilita los superciclos). */
  hasSmartPlug?: boolean;
  /** Muestra la opción "Luz natural" (exterior e invernadero, donde las horas son opcionales). */
  onSelectNone?: () => void;
  idPrefix?: string;
}

function Group({
  id,
  title,
  badge,
  dashed = false,
  children,
}: {
  id: string;
  title: string;
  badge?: React.ReactNode;
  dashed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <fieldset
      id={id}
      className={`rounded-2xl border bg-surface/60 p-2.5 space-y-2 ${dashed ? 'border-dashed border-chip-line' : 'border-chip-line'}`}
    >
      <legend className="sr-only">{title}</legend>
      <div className="flex flex-wrap items-center gap-2" aria-hidden="true">
        <span className="text-[11px] font-extrabold text-ink">{title}</span>
        {badge}
      </div>
      {children}
    </fieldset>
  );
}

/**
 * Elección de fotoperiodo solo con opciones fijas, agrupadas en cuadros:
 * Vegetativo (18/6, 20/4), Floración (12/12, 13/11) y Superciclos floración (13/13, 14/14), estos
 * últimos experimentales y bloqueados si no hay un enchufe inteligente Wi-Fi.
 */
export const PhotoperiodPresetPicker: React.FC<PhotoperiodPresetPickerProps> = ({
  light,
  dark,
  onSelect,
  hasSmartPlug = false,
  onSelectNone,
  idPrefix = 'preset',
}) => {
  const currentLight = light === '' ? null : Number(light);
  const currentDark = currentLight === null ? null : darkHoursFor(currentLight, dark);
  const supercyclesEnabled = canUseSupercycles(hasSmartPlug);
  const isCustom = currentLight !== null && !findPhotoperiodPreset(currentLight, currentDark);

  const chip = (p: PhotoperiodPreset, disabled = false) => {
    const active = currentLight === p.light && currentDark === p.dark;
    const Icon = p.phase === 'veg' ? Sun : Moon;
    return (
      <button
        key={p.id}
        type="button"
        id={`${idPrefix}-${p.id}`}
        data-photoperiod={p.id}
        onClick={() => !disabled && onSelect(p.light, p.dark)}
        disabled={disabled}
        aria-pressed={active}
        title={disabled ? `${p.hint} Necesita un enchufe inteligente Wi-Fi.` : p.hint}
        className={`min-h-11 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 border text-left ${
          disabled
            ? 'bg-surface text-ink-subtle border-line cursor-not-allowed'
            : active
              ? 'bg-brand-deep text-white border-brand-deep shadow-xs cursor-pointer'
              : 'bg-white hover:bg-surface text-ink border-chip-line cursor-pointer'
        }`}
      >
        {disabled ? <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> : <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
        <span>
          {p.light}/{p.dark}
        </span>
        <span className={`text-[10px] font-semibold ${active ? 'text-brand-soft' : 'text-ink-muted'}`}>
          {p.name}
          {p.note && <span className="font-normal"> ({p.note})</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-2">
      {onSelectNone && (
        <button
          type="button"
          id={`${idPrefix}-none`}
          onClick={onSelectNone}
          aria-pressed={currentLight === null}
          className={`min-h-11 px-3 py-1.5 rounded-xl text-xs font-extrabold border flex items-center gap-1.5 cursor-pointer ${
            currentLight === null ? 'bg-brand-deep text-white border-brand-deep' : 'bg-white hover:bg-surface text-ink border-chip-line'
          }`}
        >
          <SunDim className="w-3.5 h-3.5" aria-hidden="true" />
          Luz natural (sin definir)
        </button>
      )}

      <Group id={`${idPrefix}-veg`} title="Vegetativo">
        <div className="flex flex-wrap gap-1.5">{VEG_PRESETS.map((p) => chip(p))}</div>
      </Group>

      <Group id={`${idPrefix}-flower`} title="Floración">
        <div className="flex flex-wrap gap-1.5">{FLOWER_PRESETS.map((p) => chip(p))}</div>
      </Group>

      <Group
        id={`${idPrefix}-supercycles`}
        title="Superciclos floración"
        dashed
        badge={
          <span className="inline-flex items-center gap-1 rounded-full bg-warn-bg border border-warn-line px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-warn-ink">
            <FlaskConical className="w-3 h-3" aria-hidden="true" />
            Experimental
          </span>
        }
      >
        <div className="flex flex-wrap gap-1.5">{SUPERCYCLE_PRESETS.map((p) => chip(p, !supercyclesEnabled))}</div>
        <p className="text-[11px] text-ink-muted leading-snug">
          {supercyclesEnabled
            ? 'Ciclos de más de 24 horas, manejados por tu enchufe inteligente.'
            : 'Ciclos de más de 24 horas. Solo se pueden usar con un enchufe inteligente Wi-Fi conectado a Cultiveta (próximamente): un temporizador común no puede hacerlos.'}
        </p>
      </Group>

      {isCustom && (
        <p className="text-[11px] font-semibold text-warn-ink">
          Este cultivo tiene {currentLight}/{currentDark}, que no está entre las opciones. Elegí una para cambiarlo.
        </p>
      )}
    </div>
  );
};
