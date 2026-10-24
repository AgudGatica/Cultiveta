import React, { useState } from 'react';
import { CalendarDays, Leaf, Sprout } from 'lucide-react';
import type { Cultivation, Genetics } from '../../types';
import { getStageColorClasses, getStageIcon } from '../../utils/growthStageUtils';
import { getCropCoverImage, getCropCoverKind, getCropDayLabel, getGeneticsLabel } from '../../utils/cropCardInfo';

interface ActiveCropCardProps {
  cultivation: Cultivation;
  geneticsList?: Genetics[];
  onOpen: (cultivation: Cultivation) => void;
}

/**
 * Tarjeta de un cultivo activo en el Inicio: portada (interior o exterior), nombre, genética, etapa,
 * semana/día y plantas. La portada tiene proporción fija 2:1 para que la imagen calce en cualquier pantalla.
 */
export const ActiveCropCard: React.FC<ActiveCropCardProps> = ({ cultivation, geneticsList = [], onOpen }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const stage = cultivation.currentStage || 'Vegetativo';
  const stageClasses = getStageColorClasses(stage, true, false);
  const genetics = getGeneticsLabel(cultivation);
  const plants = cultivation.plantCount || 1;
  const coverUrl = getCropCoverImage(cultivation);
  const showImage = !imageFailed;

  return (
    <button
      type="button"
      data-crop-card={cultivation.id}
      onClick={() => onOpen(cultivation)}
      className="cultiveta-card cultiveta-card-hover overflow-hidden text-left w-full flex flex-col cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
      aria-label={`Abrir ${cultivation.name}`}
    >
      <div className="relative aspect-[2/1] w-full bg-icon-bg overflow-hidden" data-cover={getCropCoverKind(cultivation)}>
        {showImage ? (
          <img
            src={coverUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-brand">
            <Sprout className="w-10 h-10 stroke-[1.5]" aria-hidden="true" />
          </div>
        )}
        <span
          className={`absolute left-3 bottom-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] ${stageClasses.badge}`}
        >
          <span aria-hidden="true">{getStageIcon(stage)}</span>
          {stage}
        </span>
      </div>

      <div className="p-4 space-y-1.5">
        <h3 className="text-base font-extrabold text-ink truncate">{cultivation.name}</h3>
        <p className="text-xs text-ink-muted truncate">{genetics || 'Genética sin cargar'}</p>
        <div className="flex items-center justify-between gap-2 pt-1 text-xs font-semibold text-ink">
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <CalendarDays className="w-3.5 h-3.5 text-brand shrink-0" aria-hidden="true" />
            <span className="truncate">{getCropDayLabel(cultivation, geneticsList)}</span>
          </span>
          <span className="inline-flex items-center gap-1 shrink-0 text-ink-muted">
            <Leaf className="w-3.5 h-3.5" aria-hidden="true" />
            {plants === 1 ? '1 planta' : `${plants} plantas`}
          </span>
        </div>
      </div>
    </button>
  );
};
