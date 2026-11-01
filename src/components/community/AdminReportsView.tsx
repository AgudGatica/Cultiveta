import React, { useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Trash2 } from 'lucide-react';
import { communityService, REPORT_REASONS, type ReportGroup } from '../../services/communityService';

const KIND: Record<ReportGroup['kind'], string> = { growlog: 'Growlog', profile: 'Grower', comment: 'Comentario' };

/** Denuncias abiertas, para el admin: ocultar, volver a mostrar o borrar. */
export const AdminReportsView: React.FC<{ onBack: () => void; onOpenGrowlog: (id: string) => void; showToast?: (msg: string) => void }> = ({ onBack, onOpenGrowlog, showToast }) => {
  const [groups, setGroups] = useState<ReportGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    communityService
      .adminReports()
      .then(setGroups)
      .catch((e) => setError(e?.message || 'No se pudo cargar.'));
  useEffect(() => {
    load();
  }, []);

  const act = async (g: ReportGroup, action: 'hide' | 'show' | 'delete') => {
    if (action === 'delete' && !window.confirm('¿Borrar para siempre? No se puede deshacer.')) return;
    setBusy(`${g.kind}_${g.targetId}`);
    try {
      await communityService.resolveReports(g, action);
      showToast?.(action === 'hide' ? 'Ocultado.' : action === 'show' ? 'Visible otra vez.' : 'Borrado.');
      await load();
    } catch (e: any) {
      showToast?.(e?.message || 'No se pudo.');
    } finally {
      setBusy(null);
    }
  };

  const title = (g: ReportGroup) => {
    const t = g.target;
    if (!t) return '(ya no existe)';
    if (g.kind === 'growlog') return `${t.title} · @${t.ownerHandle}`;
    if (g.kind === 'profile') return `@${t.handle} · ${t.displayName}`;
    return `"${String(t.text || '').slice(0, 120)}"`;
  };

  return (
    <div id="admin-reports" className="max-w-3xl mx-auto space-y-4">
      <button type="button" onClick={onBack} className="cultiveta-btn-secondary text-sm">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Comunidad
      </button>
      <h1 className="text-2xl font-black text-white">Denuncias</h1>
      {error && <p className="text-sm text-white">{error}</p>}
      {groups && groups.length === 0 && <p className="bg-white rounded-[24px] border border-line p-5 text-sm text-ink-muted">No hay denuncias abiertas.</p>}
      {groups?.map((g) => (
        <section key={`${g.kind}_${g.targetId}`} className="report-group bg-white rounded-[24px] border border-line p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <small className="text-[10px] font-black uppercase tracking-wider text-ink-muted">
                {KIND[g.kind]} · {g.reports.length} {g.reports.length === 1 ? 'denuncia' : 'denuncias'}
                {g.target?.hidden ? ' · oculto' : ''}
              </small>
              {g.kind === 'growlog' && g.target ? (
                <button type="button" onClick={() => onOpenGrowlog(g.targetId)} className="block text-sm font-bold text-brand underline text-left">
                  {title(g)}
                </button>
              ) : (
                <b className="block text-sm text-ink break-words">{title(g)}</b>
              )}
            </div>
          </div>
          <ul className="text-xs text-ink space-y-0.5">
            {g.reports.map((r, i) => (
              <li key={i}>
                <b>{REPORT_REASONS[r.reason] || r.reason}</b>
                {r.text ? `: ${r.text}` : ''}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {g.target?.hidden ? (
              <button type="button" disabled={!!busy} onClick={() => act(g, 'show')} className="cultiveta-btn-secondary text-xs">
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                Volver a mostrar
              </button>
            ) : (
              <button type="button" disabled={!!busy} onClick={() => act(g, 'hide')} className="cultiveta-btn-secondary text-xs">
                <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                Ocultar
              </button>
            )}
            <button type="button" disabled={!!busy} onClick={() => act(g, 'delete')} className="cultiveta-btn-secondary text-xs text-error">
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Borrar
            </button>
          </div>
        </section>
      ))}
    </div>
  );
};
