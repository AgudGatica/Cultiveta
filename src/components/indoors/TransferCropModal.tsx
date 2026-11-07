import React, { useState } from 'react';
import { ArrowRightLeft, Check, Home, Sun, TreePine, X } from 'lucide-react';
import type { Cultivation, Indoor } from '../../types';
import { indoorService } from '../../services/indoorService';
import { INDOOR_KINDS, isExteriorAmbient } from '../../utils/indoors';

interface TransferCropModalProps {
  crop: Cultivation;
  /** Todos los ambientes de la persona. */
  ambients: Indoor[];
  userId: string;
  /** Lo que se está transfiriendo, como lo ve la persona (el nombre de la genética). */
  plantName: string;
  /** Otras genéticas cargadas en el mismo cultivo: se mueven juntas. */
  others?: string[];
  onClose: () => void;
  /** Ya se movió. `changeStage`: quiere cambiar la etapa ahora. */
  onDone: (updated: Cultivation, to: Indoor, changeStage: boolean) => void;
}

const FLOWER_HOURS = 13;

const lightOf = (ambient: Indoor | null | undefined, crop?: Cultivation): string => {
  if (ambient && isExteriorAmbient(ambient)) return 'Luz natural';
  const hours = ambient?.lighting?.photoperiodHoursLight ?? crop?.lighting?.photoperiodHoursLight;
  return typeof hours === 'number' ? `${hours}/${24 - hours}` : 'Sin horario cargado';
};

const isFlowerLight = (ambient: Indoor) => !isExteriorAmbient(ambient) && (ambient.lighting?.photoperiodHoursLight ?? 24) <= FLOWER_HOURS;
const isVegetativeStage = (stage?: string) => !/flor|preflor|madur|cosecha|secado|curado/i.test(stage || '');

/**
 * Transferir plantas a otro ambiente, por ejemplo de la carpa de vegetativo a la de flora. Muestra qué cambia antes
 * de confirmar y, si el destino tiene luz de floración, ofrece cambiar la etapa. El historial sigue con la planta.
 */
export const TransferCropModal: React.FC<TransferCropModalProps> = ({ crop, ambients, userId, plantName, others = [], onClose, onDone }) => {
  const current = ambients.find((a) => a.id === crop.indoorId) || null;
  const targets = ambients.filter((a) => a.id !== crop.indoorId);
  const [selectedId, setSelectedId] = useState(targets.length === 1 ? targets[0].id : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState<{ updated: Cultivation; to: Indoor } | null>(null);
  const selected = targets.find((a) => a.id === selectedId) || null;

  const confirm = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await indoorService.moveCrop(crop, selected, userId);
      if (isFlowerLight(selected) && isVegetativeStage(crop.currentStage)) setMoved({ updated, to: selected });
      else onDone(updated, selected, false);
    } catch (e: any) {
      setError(e?.message || 'No se pudo transferir. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cultiveta-modal-overlay animate-in fade-in">
      <div id="transfer-crop-modal" role="dialog" aria-modal="true" aria-labelledby="transfer-crop-title" className="cultiveta-modal-container my-auto max-w-lg p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="transfer-crop-title" className="text-lg font-black text-ink">
              {moved ? `Listo, ya está en ${moved.to.name}` : 'Transferir a otro ambiente'}
            </h2>
            {!moved && <p className="text-xs text-ink-muted">{plantName} está en {current?.name || 'ningún ambiente'}.</p>}
          </div>
          <button type="button" aria-label="Cerrar" onClick={moved ? () => onDone(moved.updated, moved.to, false) : onClose} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full text-ink-muted hover:bg-track cursor-pointer">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {moved ? (
          <>
            <p id="transfer-stage-question" className="text-sm text-ink">
              {moved.to.name} tiene {moved.to.lighting?.photoperiodHoursLight} horas de luz. ¿Pasa a floración?
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => onDone(moved.updated, moved.to, false)} className="cultiveta-btn-secondary text-sm flex-1 justify-center">
                Más tarde
              </button>
              <button type="button" id="transfer-change-stage" onClick={() => onDone(moved.updated, moved.to, true)} className="cultiveta-btn-primary text-sm flex-[2] justify-center">
                Cambiar etapa
              </button>
            </div>
          </>
        ) : targets.length === 0 ? (
          <p id="transfer-no-targets" className="text-sm text-ink">
            Todavía no tenés otro ambiente. Creá uno desde el Jardín, con "Nuevo ambiente", y volvé acá para transferir.
          </p>
        ) : (
          <>
            <fieldset className="space-y-2">
              <legend className="text-xs font-bold text-ink mb-2">¿A dónde va?</legend>
              {targets.map((a) => {
                const on = a.id === selectedId;
                const Icon = isExteriorAmbient(a) ? TreePine : Home;
                return (
                  <label
                    key={a.id}
                    data-transfer-target={a.id}
                    className={`min-h-11 flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-colors ${on ? 'bg-icon-bg border-brand' : 'bg-white border-line hover:bg-surface'}`}
                  >
                    <input type="radio" name="transfer-target" value={a.id} checked={on} onChange={() => setSelectedId(a.id)} className="sr-only" />
                    <Icon className="w-5 h-5 text-brand shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-ink truncate">{a.name}</span>
                      <span className="block text-xs text-ink-muted truncate">{[INDOOR_KINDS[a.kind], lightOf(a)].filter(Boolean).join(' · ')}</span>
                    </span>
                    {on && <Check className="w-5 h-5 text-brand shrink-0" aria-hidden="true" />}
                  </label>
                );
              })}
            </fieldset>

            {selected && (
              <div id="transfer-summary" className="rounded-2xl bg-surface border border-line p-3 text-xs text-ink space-y-1">
                <p className="flex items-center gap-1.5 font-semibold">
                  <Sun className="w-3.5 h-3.5 text-warn-ink shrink-0" aria-hidden="true" />
                  Luz: {lightOf(current, crop)} → {lightOf(selected)}
                </p>
                {others.length > 0 && <p id="transfer-others">Se mueven juntas con {others.join(', ')}, porque se cargaron en el mismo cultivo.</p>}
                <p className="text-ink-muted">Riegos, fotos y notas siguen con la planta.</p>
              </div>
            )}

            {error && (
              <p role="alert" className="text-xs font-semibold text-error">
                {error}
              </p>
            )}

            <button type="button" id="transfer-confirm" disabled={!selected || busy} onClick={confirm} className="cultiveta-btn-primary text-sm w-full justify-center disabled:opacity-50">
              <ArrowRightLeft className="w-4 h-4" aria-hidden="true" />
              {busy ? 'Transfiriendo…' : selected ? `Transferir a ${selected.name}` : 'Elegí un ambiente'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
