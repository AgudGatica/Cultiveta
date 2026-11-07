import React, { useState } from 'react';
import { Dna, Eye, Heart, MessageCircle } from 'lucide-react';
import type { GrowlogCard } from '../../utils/growlog';
import { Avatar } from './Avatar';

export const kfmt = (n: number) => (n >= 1000 ? `${(Math.round(n / 100) / 10).toString().replace('.', ',')} k` : String(n || 0));

/** Tarjeta de un growlog (como en Canopia): foto, nombre, grower y vistas, me gusta y comentarios. */
export const GrowlogTile: React.FC<{ g: GrowlogCard; onOpen: (id: string) => void; wide?: boolean }> = ({ g, onOpen, wide }) => {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      data-growlog-card={g.id}
      onClick={() => onOpen(g.id)}
      className={`text-left bg-white rounded-[22px] border border-line overflow-hidden shadow-2xs hover:shadow-sm transition-shadow ${wide ? 'w-full' : 'w-40 shrink-0'}`}
    >
      <span className="block relative aspect-square bg-brand-deep">
        {g.coverUrl && !failed ? (
          <img src={g.coverUrl} alt={g.title} loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-white/30">
            <Dna className="w-10 h-10" aria-hidden="true" />
          </span>
        )}
      </span>
      <span className="block p-2.5 space-y-1">
        <b className="block text-sm font-extrabold text-ink truncate">{g.title}</b>
        <span className="flex items-center gap-1.5 text-xs text-ink-muted min-w-0">
          <Avatar url={g.ownerAvatarUrl} name={g.ownerName} color={g.ownerAvatarColor} size={18} />
          <span className="truncate">@{g.ownerHandle}</span>
        </span>
        <span className="flex items-center gap-2 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-0.5">
            <Eye className="w-3 h-3" aria-hidden="true" />
            {kfmt(g.views)}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Heart className="w-3 h-3" aria-hidden="true" />
            {kfmt(g.likes)}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <MessageCircle className="w-3 h-3" aria-hidden="true" />
            {g.comments || 0}
          </span>
        </span>
      </span>
    </button>
  );
};
