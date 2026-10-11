import { useState, useEffect } from 'react';
import { GeneticsCatalogPhoto } from '../types';
import { geneticsCatalogPhotoService } from '../services/geneticsCatalogPhotoService';

/**
 * Hook reactivo para suscribirse a las fotografías del catálogo oficial de genéticas.
 * Mantiene la UI sincronizada en tiempo real sin polling ni lecturas redundantes.
 */
export function useGeneticsCatalogPhotos(): Record<string, GeneticsCatalogPhoto> {
  const [catalogPhotos, setCatalogPhotos] = useState<Record<string, GeneticsCatalogPhoto>>(() =>
    geneticsCatalogPhotoService.getCatalogPhotos()
  );

  useEffect(() => {
    const unsub = geneticsCatalogPhotoService.subscribeCatalogPhotos((photos) => {
      setCatalogPhotos(photos);
    });
    return () => unsub();
  }, []);

  return catalogPhotos;
}
