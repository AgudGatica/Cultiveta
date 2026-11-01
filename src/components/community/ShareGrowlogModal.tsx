import React, { useState } from 'react';
import { Copy, Globe, Link2, Lock, Share2, X } from 'lucide-react';
import { communityService, growlogFor, growlogLink, useCommunityMe } from '../../services/communityService';
import type { GrowlogPrivacy } from '../../utils/growlog';

const FIELD = 'w-full min-h-11 px-3 rounded-2xl bg-white border border-line text-sm text-ink focus:outline-hidden focus:border-brand';

type Choice = 'private' | GrowlogPrivacy;
const CHOICES: Array<{ id: Choice; label: string; desc: string; icon: typeof Lock }> = [
  { id: 'private', label: 'Privado', desc: 'Solo vos. No se comparte nada.', icon: Lock },
  { id: 'unlisted', label: 'No listado', desc: 'Lo ve quien tenga el enlace. No aparece en Explorar.', icon: Link2 },
  { id: 'public', label: 'Público', desc: 'Aparece en la comunidad y en tu perfil de grower.', icon: Globe },
];

interface Props {
  cropId: string;
  geneticIndex: number;
  /** Nombre de la genética (para el título). */
  name: string;
  onClose: () => void;
  /** No tiene perfil todavía: hay que armarlo primero. */
  onNeedProfile: () => void;
  showToast?: (msg: string) => void;
}

/**
 * Compartir una genética como growlog (como en Canopia): Privado, No listado o Público, con una ubicación
 * general opcional. Lo que se comparte es una copia: sus fotos salen sin ubicación ni datos del celular.
 */
export const ShareGrowlogModal: React.FC<Props> = ({ cropId, geneticIndex, name, onClose, onNeedProfile, showToast }) => {
  const me = useCommunityMe();
  const current = growlogFor(me, cropId, geneticIndex);
  const [choice, setChoice] = useState<Choice>(current?.privacy || 'private');
  const [location, setLocation] = useState(current?.location || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (choice !== 'private' && !me?.profile) return onNeedProfile();
    setBusy(true);
    try {
      if (choice === 'private') {
        if (current) await communityService.unpublish(current.id);
        showToast?.('Ya no se comparte.');
      } else {
        await communityService.publish(cropId, geneticIndex, choice, location.trim() || null);
        showToast?.(choice === 'public' ? 'Publicado en la comunidad.' : 'Listo: compartí el enlace con quien quieras.');
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(growlogLink(current.id));
      showToast?.('Enlace copiado.');
    } catch {
      setError('No se pudo copiar. Mantené apretado el enlace para copiarlo.');
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="share-growlog-title" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs overflow-y-auto">
      <div id="share-growlog-modal" className="w-full max-w-md bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-line my-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-brand/10 text-brand">
              <Share2 className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="share-growlog-title" className="text-lg font-extrabold text-ink">
                Compartir {name}
              </h2>
              <p className="text-xs text-ink-muted">Su growlog: fotos, etapas, riegos y notas.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="p-2 text-ink-subtle hover:text-ink rounded-full hover:bg-surface">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2" role="radiogroup" aria-label="Quién lo ve">
          {CHOICES.map((c) => {
            const Icon = c.icon;
            const on = choice === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={on}
                data-privacy={c.id}
                onClick={() => setChoice(c.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left ${on ? 'border-brand-deep bg-brand/5' : 'border-line bg-white'}`}
              >
                <span className={`p-2 rounded-xl ${on ? 'bg-brand-deep text-white' : 'bg-icon-bg text-brand'}`}>
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </span>
                <span className="flex-1 min-w-0">
                  <b className="block text-sm text-ink">{c.label}</b>
                  <small className="block text-xs text-ink-muted">{c.desc}</small>
                </span>
              </button>
            );
          })}
        </div>

        {choice !== 'private' && (
          <label className="text-xs font-semibold text-ink-muted block space-y-1">
            <span>Ubicación general (opcional)</span>
            <input id="share-location" className={FIELD} value={location} maxLength={60} onChange={(e) => setLocation(e.target.value)} placeholder="Argentina, Buenos Aires" />
            <small className="block text-[11px] text-ink-subtle">Solo país, provincia o ciudad. Las fotos se publican sin ubicación.</small>
          </label>
        )}

        {current && (
          <div className="rounded-2xl bg-surface border border-line p-3 space-y-2">
            <small className="block text-[11px] font-semibold text-ink-muted">Enlace</small>
            <div className="flex items-center gap-2">
              <code id="share-link" className="flex-1 min-w-0 truncate text-xs text-ink">
                {growlogLink(current.id)}
              </code>
              <button type="button" id="share-copy" onClick={copy} className="cultiveta-btn-secondary text-xs">
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                Copiar
              </button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs font-semibold text-error">
            {error}
          </p>
        )}
        <button type="button" id="share-save" disabled={busy || (choice === 'private' && !current)} onClick={save} className="cultiveta-btn-primary text-sm w-full justify-center disabled:opacity-50">
          {busy ? 'Guardando…' : choice === 'private' ? (current ? 'Dejar de compartir' : 'Es privado') : current ? 'Guardar' : 'Compartir'}
        </button>
      </div>
    </div>
  );
};
