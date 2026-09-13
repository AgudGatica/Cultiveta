import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  id?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  id = 'empty-state-card'
}) => {
  return (
    <div
      id={id}
      className="flex flex-col items-center justify-center p-8 md:p-12 text-center bg-[#0F0F0F] rounded-[32px] border border-zinc-800 shadow-sm relative overflow-hidden"
    >
      <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 text-emerald-400 flex items-center justify-center mb-4 shadow-sm">
        <Icon className="w-8 h-8 stroke-[1.75]" />
      </div>
      <h3 className="text-lg font-bold text-white mb-1.5">{title}</h3>
      <p className="text-zinc-400 text-xs sm:text-sm max-w-sm mb-6 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

