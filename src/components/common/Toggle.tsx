import React from 'react';

interface ToggleProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * Interruptor. El nombre lo pone un <label htmlFor={id}> al lado; tocar el interruptor también lo cambia
 * y el área de toque llega a 44 px.
 */
export const Toggle: React.FC<ToggleProps> = ({ id, checked, onChange, disabled = false }) => (
  <label className="relative inline-flex items-center justify-center shrink-0 min-h-11 min-w-11 -my-2 cursor-pointer">
    <input type="checkbox" id={id} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
    <span
      aria-hidden="true"
      className="relative w-11 h-6 bg-ink-subtle rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-checked:bg-brand-deep peer-disabled:opacity-50 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"
    />
  </label>
);
