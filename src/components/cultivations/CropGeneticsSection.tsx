import React, { useMemo } from 'react';
import { Dna, Leaf } from 'lucide-react';
import type { Cultivation, Genetics, GeneticsCatalogPhoto } from '../../types';
import { resolveCropGenetics } from '../../utils/cropGenetics';
import { useGeneticsCatalogPhotos } from '../../hooks/useGeneticsCatalogPhotos';
import { GeneticsShowcaseCard } from '../genetics/GeneticsShowcaseCard';

interface CropGeneticsSectionProps {
  cultivation: Cultivation;
  geneticsList?: Genetics[];
  /** Para tests: fotos del catálogo sin suscribirse. */
  catalogPhotos?: Record<string, GeneticsCatalogPhoto>;
}

/** Genéticas del cultivo con la misma tarjeta de la pantalla Genéticas. */
export const CropGeneticsSection: React.FC<CropGeneticsSectionProps> = ({ cultivation, geneticsList = [], catalogPhotos }) => {
  const subscribed = useGeneticsCatalogPhotos();
  const photos = catalogPhotos || subscribed;
  const cards = useMemo(() => resolveCropGenetics(cultivation, geneticsList, photos), [cultivation, geneticsList, photos]);

  if (cards.length === 0) return null;

  return (
    <section id="crop-genetics-section" aria-labelledby="crop-genetics-title" className="space-y-3">
      <h2 id="crop-genetics-title" className="text-lg font-extrabold text-white flex items-center gap-2 px-1">
        <Dna className="w-5 h-5" aria-hidden="true" />
        {cards.length === 1 ? 'Genética' : `Genéticas (${cards.length})`}
      </h2>
      <div className={cards.length === 1 ? 'max-w-[570px]' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
        {cards.map((g) => (
          <GeneticsShowcaseCard
            key={g.key}
            name={g.name}
            seedBank={g.seedBank}
            dominance={g.dominance}
            photoUrl={g.photoUrl}
            estimatedYield={g.estimatedYield}
            floweringDays={g.floweringDays}
            organolepticProfile={g.organolepticProfile}
          >
            <div className="flex items-center justify-center gap-2 rounded-full bg-ok-bg border border-ok-line min-h-[52px] px-4 text-ok-ink font-bold text-xs sm:text-sm">
              <Leaf className="w-4 h-4 shrink-0" aria-hidden="true" />
              {g.plantCount
                ? `${g.plantCount === 1 ? '1 planta' : `${g.plantCount} plantas`} en este cultivo`
                : 'En este cultivo'}
              {g.photoperiodType ? ` · ${g.photoperiodType}` : ''}
            </div>
          </GeneticsShowcaseCard>
        ))}
      </div>
    </section>
  );
};
