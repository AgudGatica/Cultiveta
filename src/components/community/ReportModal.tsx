import React, { useState } from 'react';
import { Flag, X } from 'lucide-react';
import { communityService, REPORT_REASONS, type ReportGroup } from '../../services/communityService';

interface Props {
  kind: ReportGroup['kind'];
  targetId: string;
  growlogId?: string;
  /** "el growlog Gelato 33", "a @agus", "el comentario". */
  what: string;
  onClose: () => void;
  showToast?: (msg: string) => void;
}

/** Denunciar algo que no cumple las normas. Con 3 denuncias de personas distintas se oculta hasta revisarlo. */
export const ReportModal: React.FC<Props> = ({ kind, targetId, growlogId, what, onClose, showToast }) => {
  const [reason, setReason] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!reason) return setError('Elegí un motivo.');
    setBusy(true);
    setError(null);
    try {
      await communityService.report(kind, targetId, reason, text.trim(), growlogId);
      showToast?.('Gracias. Lo vamos a revisar.');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudo enviar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="report-title" className="cultiveta-modal-overlay animate-in fade-in">
      <div id="report-modal" className="cultiveta-modal-container my-auto max-w-md p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-error/10 text-error">
              <Flag className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="report-title" className="text-lg font-extrabold text-ink">
                Denunciar
              </h2>
              <p className="text-xs text-ink-muted">¿Qué pasa con {what}?</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="p-2 text-ink-subtle hover:text-ink rounded-full hover:bg-surface">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-1.5" role="radiogroup" aria-label="Motivo">
          {Object.entries(REPORT_REASONS).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={reason === id}
              data-reason={id}
              onClick={() => setReason(id)}
              className={`min-h-11 px-3 rounded-2xl border text-left text-sm font-semibold ${reason === id ? 'border-brand-deep bg-brand/5 text-ink' : 'border-line bg-white text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <textarea
          id="report-text"
          value={text}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
          placeholder="Contanos más (opcional)"
          className="w-full min-h-16 px-3 py-2 rounded-2xl bg-white border border-line text-sm text-ink focus:outline-hidden focus:border-brand"
        />
        {error && (
          <p role="alert" className="text-xs font-semibold text-error">
            {error}
          </p>
        )}
        <button type="button" id="report-send" disabled={busy} onClick={send} className="cultiveta-btn-primary text-sm w-full justify-center disabled:opacity-50">
          {busy ? 'Enviando…' : 'Enviar denuncia'}
        </button>
      </div>
    </div>
  );
};
