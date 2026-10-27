import React from 'react';
import { FlaskConical, Lock, Moon, Sun } from 'lucide-react';
import {
  STANDARD_PRESETS,
  SUPERCYCLE_PRESETS,
  canUseSupercycles,
  darkHoursFor,
  type PhotoperiodPreset,
} from '../../utils/photoperiods';

interface PhotoperiodPresetPickerProps {
  light: number | '';
  dark?: number | null;
  onSelect: (light: number, dark: number) => void;
  /** Enchufe inteligente Wi-Fi conectado (habilita los superciclos). */
  hasSmartPlug?: boolean;
  idPrefix?: string;
}

/**
 * Botones rápidos de fotoperiodo (20/4, 18/6, 13/11, 12/12, 11/13) y superciclos (13/13 y 14/14),
 * marcados como experimentales y bloqueados si no hay un enchufe inteligente Wi-Fi.
 */
export const PhotoperiodPresetPicker: React.FC<PhotoperiodPresetPickerProps> = ({
  light,
  dark,
  onSelect,
  hasSmartPlug = false,
  idPrefix = 'preset',
}) => {
  const currentLight = light === '' ? null : Number(light);
  const currentDark = currentLight === null ? null : darkHoursFor(currentLight, dark);
  const supercyclesEnabled = canUseSupercycles(hasSmartPlug);

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
        className={`min-h-11 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 border ${
          disabled
            ? 'bg-surface text-ink-subtle border-line cursor-not-allowed'
            : active
              ? 'bg-brand-deep text-white border-brand-deep shadow-xs cursor-pointer'
              : 'bg-white hover:bg-surface text-ink border-chip-line cursor-pointer'
        }`}
      >
        {disabled ? <Lock className="w-3.5 h-3.5" aria-hidden="true" /> : <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
        <span>{p.light}/{p.dark}</span>
        <span className={`text-[10px] font-semibold ${active ? 'text-brand-soft' : 'text-ink-muted'}`}>
          {p.name}
          {p.note && <span className="font-normal"> ({p.note})</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5">{STANDARD_PRESETS.map((p) => chip(p))}</div>

      <div id={`${idPrefix}-supercycles`} className="rounded-2xl border border-dashed border-chip-line bg-surface/60 p-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-extrabold text-ink">Superciclos</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-warn-bg border border-warn-line px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-warn-ink">
            <FlaskConical className="w-3 h-3" aria-hidden="true" />
            Experimental
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">{SUPERCYCLE_PRESETS.map((p) => chip(p, !supercyclesEnabled))}</div>
        <p className="text-[11px] text-ink-muted leading-snug">
          {supercyclesEnabled
            ? 'Ciclos de más de 24 horas, manejados por tu enchufe inteligente.'
            : 'Ciclos de más de 24 horas. Solo se pueden usar con un enchufe inteligente Wi-Fi conectado a Cultiveta (próximamente): un temporizador común no puede hacerlos.'}
        </p>
      </div>
    </div>
  );
};
