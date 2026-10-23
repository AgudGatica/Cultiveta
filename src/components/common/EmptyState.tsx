import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Ícono opcional para el botón de acción. */
  actionIcon?: LucideIcon;
  id?: string;
}

/** Estado vacío con el estilo de Cultiveta (tarjeta, ícono en burbuja y acción principal). */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon: ActionIcon,
  id = 'empty-state-card',
}) => {
  return (
    <div id={id} className="cultiveta-card flex flex-col items-center justify-center p-8 md:p-12 text-center">
      <div className="w-16 h-16 rounded-2xl bg-icon-bg text-brand flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 stroke-[1.75]" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-extrabold text-ink mb-1.5">{title}</h3>
      <p className="text-ink-muted text-sm max-w-sm mb-6 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="cultiveta-btn-primary text-sm">
          {ActionIcon && <ActionIcon className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />}
          {actionLabel}
        </button>
      )}
    </div>
  );
};
