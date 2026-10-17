import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="cultiveta-modal-overlay items-center animate-in fade-in"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      <div
        id="confirm-modal-box"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-message"
        onClick={(e) => e.stopPropagation()}
        className="cultiveta-modal-container max-w-md p-6 sm:p-7 my-auto"
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl border ${isDestructive ? 'bg-error/10 text-error border-error/20' : 'bg-warn-bg text-warn-ink border-warn-line'}`}>
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 id="confirm-modal-title" className="text-lg font-bold text-ink">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cerrar"
            className="min-h-11 min-w-11 flex items-center justify-center text-ink-muted hover:text-ink rounded-full hover:bg-track transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p id="confirm-modal-message" className="text-sm text-ink-muted mb-6 leading-relaxed">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            id="confirm-modal-cancel-btn"
            onClick={onCancel}
            className="cultiveta-btn-secondary text-sm"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            id="confirm-modal-submit-btn"
            onClick={onConfirm}
            className={
              isDestructive
                ? 'inline-flex items-center justify-center min-h-11 px-5 py-2.5 text-sm font-bold rounded-2xl text-white bg-error hover:brightness-110 transition-all cursor-pointer'
                : 'cultiveta-btn-primary text-sm'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
