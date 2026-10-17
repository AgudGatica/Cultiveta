import React, { useState } from 'react';
import { X, Download, Trash2, AlertTriangle } from 'lucide-react';
import { accountService, getSignInProvider } from '../../services/accountService';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Se llama después de borrar la cuenta (la sesión ya quedó cerrada). */
  onAccountDeleted: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({ isOpen, onClose, onAccountDeleted }) => {
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const usesPassword = getSignInProvider() === 'password';
  const canDelete = confirmText.trim().toUpperCase() === 'ELIMINAR' && (!usesPassword || password.length > 0);

  const handleExport = async () => {
    setExporting(true);
    setMessage(null);
    try {
      await accountService.exportData();
      setMessage({ kind: 'ok', text: 'Listo: se descargó el archivo con tus datos.' });
    } catch (err: any) {
      setMessage({ kind: 'error', text: err?.message || 'No se pudo descargar tus datos.' });
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setMessage(null);
    try {
      await accountService.deleteAccount(usesPassword ? password : undefined);
      onAccountDeleted();
    } catch (err: any) {
      const code = err?.code || '';
      const text =
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'La contraseña no es correcta.'
          : code === 'auth/popup-closed-by-user'
          ? 'Se cerró la ventana de Google antes de confirmar.'
          : err?.message || 'No se pudo eliminar la cuenta.';
      setMessage({ kind: 'error', text });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="cultiveta-modal-overlay items-center animate-in fade-in" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-modal-title"
        className="cultiveta-modal-container max-w-lg p-6 sm:p-8 my-auto space-y-5"
      >
        <div className="flex items-center justify-between">
          <h2 id="account-modal-title" className="text-xl font-black text-ink">
            Tus datos y tu cuenta
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="min-h-11 min-w-11 flex items-center justify-center text-ink-muted hover:text-ink rounded-full hover:bg-track cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {message && (
          <div
            role={message.kind === 'error' ? 'alert' : 'status'}
            className={`p-3.5 rounded-2xl text-sm font-semibold border ${
              message.kind === 'error' ? 'bg-error/10 border-error/30 text-error' : 'bg-ok-bg border-ok-line text-ok-ink'
            }`}
          >
            {message.text}
          </div>
        )}

        <section className="p-4 rounded-2xl bg-surface border border-line space-y-3">
          <h3 className="text-sm font-extrabold text-ink">Descargá tus datos</h3>
          <p className="text-sm text-ink-muted">
            Un archivo con tus cultivos, riegos, mediciones, notas, cosechas y fotos (como enlaces).
          </p>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="cultiveta-btn-primary text-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            {exporting ? 'Preparando...' : 'Descargar mis datos'}
          </button>
        </section>

        <section className="p-4 rounded-2xl bg-error/5 border border-error/30 space-y-3">
          <h3 className="text-sm font-extrabold text-error flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            Eliminar mi cuenta
          </h3>
          <p className="text-sm text-ink-muted">
            Se borran para siempre tu cuenta, tus cultivos, registros, fotos y notas. No se puede deshacer.
            Te recomendamos descargar tus datos antes.
          </p>

          {!confirmStep ? (
            <button
              type="button"
              onClick={() => setConfirmStep(true)}
              className="inline-flex items-center justify-center gap-2 min-h-11 px-5 py-2.5 rounded-2xl border border-error text-error font-bold text-sm hover:bg-error/10 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              Quiero eliminar mi cuenta
            </button>
          ) : (
            <div className="space-y-3">
              <div>
                <label htmlFor="account-delete-confirm" className="block text-sm font-bold text-ink mb-1">
                  Escribí ELIMINAR para confirmar
                </label>
                <input
                  id="account-delete-confirm"
                  type="text"
                  autoComplete="off"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full min-h-11 px-3.5 py-2.5 rounded-2xl bg-white border border-line text-sm text-ink focus:outline-hidden focus:border-error"
                />
              </div>
              {usesPassword ? (
                <div>
                  <label htmlFor="account-delete-password" className="block text-sm font-bold text-ink mb-1">
                    Tu contraseña
                  </label>
                  <input
                    id="account-delete-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full min-h-11 px-3.5 py-2.5 rounded-2xl bg-white border border-line text-sm text-ink focus:outline-hidden focus:border-error"
                  />
                </div>
              ) : (
                <p className="text-xs text-ink-muted">Se va a abrir Google para confirmar que sos vos.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmStep(false);
                    setConfirmText('');
                    setPassword('');
                  }}
                  className="cultiveta-btn-secondary text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={!canDelete || deleting}
                  className="inline-flex items-center justify-center gap-2 min-h-11 px-5 py-2.5 rounded-2xl bg-error text-white font-bold text-sm hover:brightness-110 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                  {deleting ? 'Eliminando...' : 'Eliminar definitivamente'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
