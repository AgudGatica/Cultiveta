import React, { useEffect, useState } from 'react';
import { Bell, Heart, MessageCircle, UserPlus, X } from 'lucide-react';
import { communityService, type Notice } from '../../services/communityService';
import { Avatar } from './Avatar';

const ICON = { follow: UserPlus, like: Heart, comment: MessageCircle } as const;

function line(n: Notice) {
  if (n.kind === 'follow') return 'te empezó a seguir';
  if (n.kind === 'like') return `le dio me gusta a ${n.growlogTitle || 'tu growlog'}`;
  return `comentó en ${n.growlogTitle || 'tu growlog'}`;
}

/** Avisos de la comunidad (la campana): seguidores nuevos, me gusta y comentarios. Al abrirlos quedan leídos. */
export const NotificationsPanel: React.FC<{ onClose: () => void; onOpenGrowlog: (id: string) => void; onOpenGrower: (handle: string) => void; initial?: Notice[] }> = ({ onClose, onOpenGrowlog, onOpenGrower, initial }) => {
  const [list, setList] = useState<Notice[] | null>(initial || null);

  useEffect(() => {
    if (!initial) {
      communityService
        .notifications()
        .then(setList)
        .catch(() => setList([]));
    }
    communityService.markRead().catch(() => {});
  }, [initial]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="notices-title" className="cultiveta-modal-overlay animate-in fade-in">
      <div id="notices-panel" className="cultiveta-modal-container my-auto max-w-md max-h-[80vh] overflow-y-auto p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="notices-title" className="text-lg font-extrabold text-ink flex items-center gap-2">
            <Bell className="w-5 h-5 text-brand" aria-hidden="true" />
            Avisos
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="p-2 text-ink-subtle hover:text-ink rounded-full hover:bg-surface">
            <X className="w-5 h-5" />
          </button>
        </div>
        {!list ? (
          <p className="text-xs text-ink-muted">Cargando…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-ink-muted">Todavía no tenés avisos. Cuando alguien te siga, le dé me gusta o comente tus growlogs, aparece acá.</p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((n) => {
              const Icon = ICON[n.kind];
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    data-notice={n.kind}
                    onClick={() => {
                      onClose();
                      if (n.growlogId) onOpenGrowlog(n.growlogId);
                      else onOpenGrower(n.fromHandle);
                    }}
                    className={`w-full flex items-center gap-3 py-2.5 text-left ${n.read ? '' : 'font-semibold'}`}
                  >
                    <span className="relative">
                      <Avatar url={n.fromAvatarUrl} name={n.fromName} color={n.fromAvatarColor} size={38} />
                      <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white border border-line inline-flex items-center justify-center">
                        <Icon className="w-3 h-3 text-brand" aria-hidden="true" />
                      </span>
                    </span>
                    <span className="flex-1 min-w-0 text-sm text-ink">
                      <b>@{n.fromHandle}</b> {line(n)}
                      {n.text && <small className="block text-xs text-ink-muted truncate">“{n.text}”</small>}
                    </span>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-coral shrink-0" aria-label="Sin leer" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
