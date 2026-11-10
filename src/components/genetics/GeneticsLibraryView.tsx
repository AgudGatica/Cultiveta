import React, { useState, useMemo, useEffect } from 'react';
import {
  Layers,
  Plus,
  Search,
  Sparkles,
  Sprout,
  Tag,
  Star,
  Award,
  Edit,
  Trash2,
  X,
  Bookmark,
  Check,
  Clock,
  Scale,
  BookOpen,
  Filter,
  Heart,
  Camera,
  Image as ImageIcon,
} from 'lucide-react';
import { Genetics, Harvest, PhotoperiodType, DominanceType, FavoriteGenetic, UserProfile, GeneticsCatalogPhoto } from '../../types';
import { GeneticsFormModal } from './GeneticsFormModal';
import { GeneticsPhotoAdminModal } from './GeneticsPhotoAdminModal';
import { GeneticsCatalogRow, GeneticsShowcaseCard } from './GeneticsShowcaseCard';
import { GENETICS_DATABASE, PredefinedGenetic } from '../../data/predefinedGenetics';
import { geneticsService } from '../../services/geneticsService';
import { favoritesService, getGeneticsKey } from '../../services/favoritesService';
import { geneticsCatalogPhotoService, getGeneticsPhotoKey } from '../../services/geneticsCatalogPhotoService';
import { ADMIN_CONFIG } from '../../config/adminConfig';
import { authService } from '../../services/authService';

interface GeneticsLibraryViewProps {
  userId: string;
  userProfile?: UserProfile | null;
  geneticsList: Genetics[];
  harvests: Harvest[];
  onStartCropWithGenetics: (genetics: Genetics) => void;
  onGeneticsUpdated: (genetics: Genetics) => void;
  onGeneticsDeleted?: (geneticsId: string) => void;
}

export function getRightsBadgeLabel(status?: string): string {
  switch (status) {
    case 'official-source':
      return 'Fuente oficial';
    case 'permission-granted':
      return 'Uso autorizado';
    case 'licensed':
      return 'Imagen licenciada';
    case 'owned':
      return 'Imagen Cultiveta';
    case 'unknown':
    default:
      return 'Foto de referencia';
  }
}

export function convertPredefinedToGenetics(
  p: PredefinedGenetic,
  userId: string,
  photoUrl?: string
): Genetics {
  // Sin dato de floración no se inventa uno: el cultivo usa lo de su etapa hasta que la persona lo cargue
  const numbers = p.floweringDays.match(/\d+/g);
  const parsedDays = numbers ? parseInt(numbers[numbers.length - 1], 10) : undefined;

  const typeLower = (p.type || '').toLowerCase();
  const isAuto = /auto/.test(typeLower) || p.floweringDays.toLowerCase().includes('germ') || p.name.toLowerCase().includes('auto');
  const isCBD = /cbd/.test(typeLower) || p.name.toUpperCase().includes('CBD') || p.dominance.toUpperCase().includes('CBD');
  const photoperiodType: PhotoperiodType = isAuto ? 'Automática' : isCBD ? 'CBD' : 'Fotoperiódica';

  let dominance: DominanceType = 'Híbrida';
  const domLower = p.dominance.toLowerCase();
  const pct = domLower.match(/[íi]ndica\s*(\d+)\s*%\s*\/\s*sativa\s*(\d+)/);
  if (pct) dominance = Number(pct[1]) > Number(pct[2]) ? 'Índica' : Number(pct[2]) > Number(pct[1]) ? 'Sativa' : 'Híbrida';
  else if (domLower.includes('índica') || domLower.includes('indica')) dominance = 'Índica';
  else if (domLower.includes('sátiva') || domLower.includes('sativa')) dominance = 'Sativa';

  const now = new Date().toISOString();
  return {
    id: `predef-${p.seedBank.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${p.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    userId: userId || 'default',
    name: p.name,
    seedBank: p.seedBank,
    photoperiodType,
    dominance,
    declaredFloweringDays: parsedDays,
    expectedAroma: p.organolepticProfile,
    photoUrl: photoUrl || undefined,
    notes: [
      p.organolepticProfile && `Perfil organoléptico: ${p.organolepticProfile}`,
      p.floweringDays && `Floración estimada: ${p.floweringDays} días`,
      p.estimatedYield && `Rendimiento: ${p.estimatedYield} g/m²`,
      p.lineage && `Linaje: ${p.lineage}`,
      p.thc,
    ]
      .filter(Boolean)
      .join(' | '),
    createdAt: now,
    updatedAt: now,
  };
}

export const GeneticsLibraryView: React.FC<GeneticsLibraryViewProps> = ({
  userId,
  userProfile,
  geneticsList,
  harvests,
  onStartCropWithGenetics,
  onGeneticsUpdated,
  onGeneticsDeleted,
}) => {
  // Verificación reactiva segura exclusivamente con el backend (/api/admin/me como única autoridad)
  const [isAdminConfirmed, setIsAdminConfirmed] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    async function checkAdminStatus() {
      try {
        const token = await authService.getIdToken();
        if (!token) {
          if (isMounted) setIsAdminConfirmed(false);
          return;
        }
        const res = await ADMIN_CONFIG.fetchAdminStatus(token);
        if (isMounted) {
          setIsAdminConfirmed(Boolean(res.isAdmin));
        }
      } catch {
        if (isMounted) setIsAdminConfirmed(false);
      }
    }

    checkAdminStatus();
    const unsub = authService.onAuthStateChanged(() => {
      checkAdminStatus();
    });
    return () => {
      isMounted = false;
      unsub();
    };
  }, [userId]);

  const isAdminOrCreator = isAdminConfirmed;
  const [isAdminPhotoModalOpen, setIsAdminPhotoModalOpen] = useState(false);
  const [catalogPhotos, setCatalogPhotos] = useState<Record<string, GeneticsCatalogPhoto>>({});

  const [activeTab, setActiveTab] = useState<'catalog' | 'favorites'>('catalog');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeedBank, setSelectedSeedBank] = useState<string>('ALL');
  const [filterPhotoperiod, setFilterPhotoperiod] = useState('all');
  // La genética abierta del catálogo: las demás quedan en una fila
  const [openGenetic, setOpenGenetic] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [geneticsToEdit, setGeneticsToEdit] = useState<Genetics | null>(null);
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});

  // Suscribirse a fotografías oficiales del catálogo
  useEffect(() => {
    const unsub = geneticsCatalogPhotoService.subscribeCatalogPhotos((photos) => {
      setCatalogPhotos(photos);
    });
    return () => unsub();
  }, []);

  // Favoritos en tiempo real desde Firestore / localStore
  const [favorites, setFavorites] = useState<FavoriteGenetic[]>([]);
  const [togglingFavMap, setTogglingFavMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!userId) return;
    const unsub = favoritesService.subscribeFavorites(userId, (favs) => {
      setFavorites(favs);
    });
    return () => unsub();
  }, [userId]);

  const favoriteKeysSet = useMemo(() => {
    return new Set(favorites.map((f) => f.geneticsKey || getGeneticsKey(f.name, f.seedBank)));
  }, [favorites]);

  const isGeneticsFavorite = (name: string, seedBank: string) => {
    return favoriteKeysSet.has(getGeneticsKey(name, seedBank));
  };

  const handleToggleFavorite = async (data: {
    name: string;
    seedBank: string;
    geneticsId?: string;
    photoperiodType?: string;
    dominance?: string;
    floweringDays?: string | number;
    estimatedYield?: string | number;
    organolepticProfile?: string;
  }) => {
    const key = getGeneticsKey(data.name, data.seedBank);
    if (togglingFavMap[key]) return;
    const isCurrentlyFav = favoriteKeysSet.has(key);

    try {
      setTogglingFavMap((prev) => ({ ...prev, [key]: true }));
      await favoritesService.toggleFavorite(userId, isCurrentlyFav, data);
    } catch (err) {
      console.error('Error toggling favorite:', err);
    } finally {
      setTogglingFavMap((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Lista única de bancos con sus cantidades a partir de GENETICS_DATABASE
  const seedBanks = useMemo(() => {
    const counts: Record<string, number> = {};
    GENETICS_DATABASE.forEach((g) => {
      counts[g.seedBank] = (counts[g.seedBank] || 0) + 1;
    });
    return Object.keys(counts)
      .sort((a, b) => a.localeCompare(b))
      .map((bank) => ({ name: bank, count: counts[bank] }));
  }, []);

  // Filtrado de la base de datos predefinida
  const filteredPredefined = useMemo(() => {
    return GENETICS_DATABASE.filter((item) => {
      // Filtro por banco
      if (selectedSeedBank !== 'ALL' && item.seedBank !== selectedSeedBank) {
        return false;
      }

      // Filtro por fotoperiodo aproximado
      if (filterPhotoperiod !== 'all') {
        const isAuto = item.floweringDays.toLowerCase().includes('germ') || item.name.toLowerCase().includes('auto');
        const isCBD = item.name.toUpperCase().includes('CBD') || item.dominance.toUpperCase().includes('CBD');
        if (filterPhotoperiod === 'Automática' && !isAuto) return false;
        if (filterPhotoperiod === 'CBD' && !isCBD) return false;
        if (filterPhotoperiod === 'Fotoperiódica' && (isAuto || isCBD)) return false;
      }

      // Filtro por término de búsqueda (nombre, banco, perfil organoléptico o dominancia)
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matchName = item.name.toLowerCase().includes(term);
        const matchBank = item.seedBank.toLowerCase().includes(term);
        const matchProfile = item.organolepticProfile.toLowerCase().includes(term);
        const matchDom = item.dominance.toLowerCase().includes(term);
        return matchName || matchBank || matchProfile || matchDom;
      }

      return true;
    });
  }, [searchTerm, selectedSeedBank, filterPhotoperiod]);

  // Filtrado de las genéticas guardadas del usuario
  const filteredSavedGenetics = useMemo(() => {
    return geneticsList.filter((g) => {
      if (selectedSeedBank !== 'ALL' && (g.seedBank || '') !== selectedSeedBank) return false;
      if (filterPhotoperiod !== 'all' && g.photoperiodType !== filterPhotoperiod) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matchName = (g.name || '').toLowerCase().includes(term);
        const matchBank = (g.seedBank || '').toLowerCase().includes(term);
        const matchBreeder = (g.breeder || '').toLowerCase().includes(term);
        const matchNotes = (g.notes || '').toLowerCase().includes(term);
        return matchName || matchBank || matchBreeder || matchNotes;
      }
      return true;
    });
  }, [geneticsList, selectedSeedBank, filterPhotoperiod, searchTerm]);

  // Favoritas marcadas en el catálogo que no están ya entre las genéticas propias: una sola lista, sin repetidas
  const favoritesOnly = useMemo(() => {
    const own = new Set(geneticsList.map((g) => getGeneticsKey(g.name, g.seedBank)));
    return favorites.filter((fav) => !own.has(fav.geneticsKey || getGeneticsKey(fav.name, fav.seedBank)));
  }, [favorites, geneticsList]);

  // Filtrado de las genéticas favoritas
  const filteredFavorites = useMemo(() => {
    return favoritesOnly.filter((fav) => {
      if (selectedSeedBank !== 'ALL' && (fav.seedBank || '') !== selectedSeedBank) return false;
      if (filterPhotoperiod !== 'all' && fav.photoperiodType !== filterPhotoperiod) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matchName = (fav.name || '').toLowerCase().includes(term);
        const matchBank = (fav.seedBank || '').toLowerCase().includes(term);
        const matchProfile = (fav.organolepticProfile || '').toLowerCase().includes(term);
        const matchDom = (fav.dominance || '').toLowerCase().includes(term);
        return matchName || matchBank || matchProfile || matchDom;
      }
      return true;
    });
  }, [favoritesOnly, selectedSeedBank, filterPhotoperiod, searchTerm]);



  const isSavedInUserLibrary = (name: string, bank: string) => {
    const targetName = name.toLowerCase().trim();
    const targetBank = bank.toLowerCase().trim();
    return geneticsList.some(
      (g) => g.name.toLowerCase().trim() === targetName && (g.seedBank || '').toLowerCase().trim() === targetBank
    );
  };

  const handleSavePredefined = async (item: PredefinedGenetic) => {
    const key = `${item.seedBank}-${item.name}`;
    if (savingMap[key] || isSavedInUserLibrary(item.name, item.seedBank)) return;

    const photoKey = getGeneticsPhotoKey(item.seedBank, item.name);
    const officialPhoto = catalogPhotos[photoKey]?.photoUrl;

    try {
      setSavingMap((prev) => ({ ...prev, [key]: true }));
      const converted = convertPredefinedToGenetics(item, userId, officialPhoto);
      const saved = await geneticsService.createGenetics({
        userId,
        name: item.name,
        seedBank: item.seedBank,
        photoperiodType: converted.photoperiodType,
        dominance: converted.dominance,
        declaredFloweringDays: converted.declaredFloweringDays,
        expectedAroma: item.organolepticProfile,
        photoUrl: officialPhoto || undefined,
        notes: `Rendimiento estimado: ${item.estimatedYield} g/m². Floración: ${item.floweringDays}`,
      });
      onGeneticsUpdated(saved);
    } catch (err) {
      console.error('Error guardando genética predefinida:', err);
    } finally {
      setSavingMap((prev) => ({ ...prev, [key]: false }));
    }
  };

  const getStatsForGenetics = (geneticsName: string) => {
    const matchingHarvests = harvests.filter(
      (h) => h.geneticsName?.toLowerCase() === geneticsName.toLowerCase()
    );
    const count = matchingHarvests.length;
    if (count === 0) return { count: 0, avgGrams: null, avgRating: null };

    const totalGrams = matchingHarvests.reduce((acc, h) => acc + (h.gramsPerPlant || 0), 0);
    const avgGrams = Number((totalGrams / count).toFixed(1));
    const avgRating = Number(
      (matchingHarvests.reduce((acc, h) => acc + h.rating1To5, 0) / count).toFixed(1)
    );

    return { count, avgGrams, avgRating };
  };

  const favoriteItems = [
    ...filteredSavedGenetics.map((own) => ({ name: own.name, own, favorite: null as FavoriteGenetic | null })),
    ...filteredFavorites.map((favorite) => ({ name: favorite.name, own: null as Genetics | null, favorite })),
  ].sort((x, y) => x.name.localeCompare(y.name, 'es'));

  const hasActiveFilters = searchTerm.trim() !== '' || selectedSeedBank !== 'ALL' || filterPhotoperiod !== 'all';

  /** Una favorita como genética del catálogo (si salió del catálogo, con todos sus datos). */
  const predefinedFromFavorite = (fav: FavoriteGenetic): PredefinedGenetic =>
    GENETICS_DATABASE.find((g) => getGeneticsKey(g.name, g.seedBank) === (fav.geneticsKey || getGeneticsKey(fav.name, fav.seedBank))) ||
    ({
      name: fav.name,
      seedBank: fav.seedBank,
      dominance: String(fav.dominance || ''),
      floweringDays: String(fav.floweringDays || ''),
      estimatedYield: String(fav.estimatedYield || ''),
      organolepticProfile: fav.organolepticProfile || '',
    } as PredefinedGenetic);

  const renderCatalogItem = (item: PredefinedGenetic, inFavorites = false) => {
    const photoKey = getGeneticsPhotoKey(item.seedBank, item.name);
    const officialPhoto = catalogPhotos[photoKey]?.photoUrl;
    const key = `${item.seedBank}-${item.name}`;
    const isOpen = openGenetic === key;
    const isFav = isGeneticsFavorite(item.name, item.seedBank);

    return (
      <React.Fragment key={key}>
        <GeneticsCatalogRow
          name={item.name}
          seedBank={item.seedBank}
          dominance={item.dominance}
          photoUrl={officialPhoto}
          estimatedYield={item.estimatedYield}
          floweringDays={item.floweringDays}
          isFavorite={isFav}
          open={isOpen}
          onToggle={() => setOpenGenetic(isOpen ? null : key)}
        />
        {isOpen && (
          <GeneticsShowcaseCard
            name={item.name}
            seedBank={item.seedBank}
            dominance={item.dominance}
            photoUrl={officialPhoto}
            estimatedYield={item.estimatedYield}
            floweringDays={item.floweringDays}
            organolepticProfile={item.organolepticProfile}
          >
            {/* Dos botones: Iniciar cultivo y Favoritos */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onStartCropWithGenetics(convertPredefinedToGenetics(item, userId, officialPhoto))}
                className="cultiveta-btn-primary rounded-full min-h-[52px] text-xs sm:text-sm active:scale-98"
                title={`Iniciar cultivo con ${item.name}`}
              >
                <Sprout className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Iniciar cultivo</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleToggleFavorite({
                    name: item.name,
                    seedBank: item.seedBank,
                    photoperiodType: convertPredefinedToGenetics(item, userId, officialPhoto).photoperiodType,
                    dominance: item.dominance,
                    floweringDays: item.floweringDays,
                    estimatedYield: item.estimatedYield,
                    organolepticProfile: item.organolepticProfile,
                  })
                }
                disabled={Boolean(togglingFavMap[getGeneticsKey(item.name, item.seedBank)])}
                aria-pressed={isFav}
                title={isFav ? 'Quitar de favoritas' : 'Agregar a favoritas'}
                className="bg-brand-deep hover:bg-brand text-white font-bold rounded-full min-h-[52px] text-xs sm:text-sm shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-60"
              >
                <span>{inFavorites ? 'Quitar de favoritas' : 'Favoritos'}</span>
                <Heart className={`w-4 h-4 shrink-0 transition-transform ${isFav ? 'fill-white text-white scale-110' : 'text-white'}`} aria-hidden="true" />
              </button>
            </div>
          </GeneticsShowcaseCard>
        )}
      </React.Fragment>
    );
  };

  /** Una genética propia: el mismo formato que las del catálogo, con su información y sus acciones. */
  const renderOwnItem = (genetics: Genetics) => {
    const photoUrl = genetics.photoUrl || catalogPhotos[getGeneticsPhotoKey(genetics.seedBank, genetics.name)]?.photoUrl;
    const key = `own-${genetics.id}`;
    const isOpen = openGenetic === key;
    const stats = getStatsForGenetics(genetics.name);
    const floweringDays = genetics.declaredFloweringDays ? String(genetics.declaredFloweringDays) : '';
    const aroma = genetics.expectedAroma || '';
    const facts = [
      genetics.photoperiodType,
      genetics.thcPercentage ? `THC ${genetics.thcPercentage} %` : '',
      genetics.cbdPercentage ? `CBD ${genetics.cbdPercentage} %` : '',
    ].filter(Boolean);

    return (
      <React.Fragment key={key}>
        <GeneticsCatalogRow name={genetics.name} seedBank={genetics.seedBank} dominance={genetics.dominance} photoUrl={photoUrl} floweringDays={floweringDays} isFavorite open={isOpen} onToggle={() => setOpenGenetic(isOpen ? null : key)} />
        {isOpen && (
          <GeneticsShowcaseCard name={genetics.name} seedBank={genetics.seedBank} dominance={genetics.dominance} photoUrl={photoUrl} floweringDays={floweringDays} organolepticProfile={aroma}>
            {(facts.length > 0 || (genetics.terpenes?.length ?? 0) > 0 || genetics.notes || stats.count > 0) && (
              <div className="space-y-2 text-xs text-ink">
                {facts.length > 0 && <p className="font-semibold">{facts.join(' · ')}</p>}
                {genetics.terpenes && genetics.terpenes.length > 0 && <p className="text-ink-muted">Terpenos: {genetics.terpenes.join(', ')}</p>}
                {genetics.notes && <p className="text-ink-muted">{genetics.notes}</p>}
                {stats.count > 0 && (
                  <p className="flex items-center gap-1 font-semibold">
                    <Star className="w-3.5 h-3.5 fill-warn-line text-warn-ink" aria-hidden="true" />
                    {stats.count} {stats.count === 1 ? 'cosecha' : 'cosechas'}
                    {stats.avgRating ? ` · ${stats.avgRating} de 5` : ''}
                    {stats.avgGrams ? ` · ${stats.avgGrams} g por planta` : ''}
                  </p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => onStartCropWithGenetics(genetics)} className="col-span-2 cultiveta-btn-primary rounded-full min-h-[52px] text-sm" title={`Iniciar cultivo con ${genetics.name}`}>
                <Sprout className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Iniciar cultivo</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setGeneticsToEdit(genetics);
                  setIsFormOpen(true);
                }}
                className="cultiveta-btn-secondary rounded-full min-h-[52px] text-sm"
              >
                <Edit className="w-4 h-4 shrink-0 text-brand" aria-hidden="true" />
                <span>Editar</span>
              </button>
              {onGeneticsDeleted && (
                <button type="button" onClick={() => onGeneticsDeleted(genetics.id)} className="cultiveta-btn-secondary rounded-full min-h-[52px] text-sm text-error">
                  <Trash2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Eliminar</span>
                </button>
              )}
            </div>
          </GeneticsShowcaseCard>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white rounded-3xl p-6 border border-line shadow-sm">
        <div>
          <h2 className="font-bold text-xl text-ink flex items-center gap-2">
            <span>Genéticas</span>
            <span className="text-sm font-normal text-ink-muted bg-track px-2.5 py-0.5 rounded-full border border-line">
              {GENETICS_DATABASE.length} en el catálogo
            </span>
          </h2>
          <p className="text-xs text-ink-muted mt-1">
            Encontrá rápido genéticas por banco de semillas o nombre para iniciar tus nuevos cultivos
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isAdminOrCreator && (
            <button
              type="button"
              id="admin-manage-genetics-photos-btn"
              onClick={() => setIsAdminPhotoModalOpen(true)}
              className="px-4 py-2.5 rounded-2xl bg-brand-deep hover:bg-brand-deep text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
              title="Panel privado de administración y carga de fotos de genéticas"
            >
              <Camera className="w-4 h-4" />
              <span>Carga manual de fotos</span>
            </button>
          )}

          <button
            type="button"
            id="add-genetics-btn"
            onClick={() => {
              setGeneticsToEdit(null);
              setIsFormOpen(true);
            }}
            className="min-h-11 px-5 py-2.5 rounded-2xl bg-brand-deep hover:bg-brand-deep text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva genética</span>
          </button>
        </div>
      </div>

      {/* Catálogo y favoritas (las que marcaste y las tuyas) */}
      <div role="tablist" aria-label="Genéticas" className="grid grid-cols-2 p-1 rounded-2xl bg-brand-deep/55 gap-1">
        {(
          [
            ['catalog', 'tab-catalog-btn', `Catálogo (${GENETICS_DATABASE.length})`],
            ['favorites', 'tab-favorites-btn', `Favoritas (${geneticsList.length + favoritesOnly.length})`],
          ] as const
        ).map(([key, id, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={id}
            aria-selected={activeTab === key}
            onClick={() => setActiveTab(key)}
            className={`min-h-11 px-1 rounded-xl text-xs sm:text-sm font-extrabold transition-colors cursor-pointer ${activeTab === key ? 'bg-white text-ink shadow-xs' : 'text-white hover:bg-white/10'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search Bar & Photoperiod Dropdown */}
      <div className="space-y-3 bg-white p-4 rounded-3xl border border-line shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 text-ink-subtle absolute left-3.5 top-3" />
            <input
              id="filter-genetics-name"
              type="text"
              placeholder="Buscar por nombre (ej: Skunk)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-surface border border-line text-xs text-ink placeholder-ink-subtle focus:outline-hidden focus:border-ok-line focus:bg-white transition-all"
            />
            {searchTerm && (
              <button aria-label="Borrar búsqueda"
                type="button"
                id="clear-genetics-name-search"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2.5 p-1 rounded-full text-ink-subtle hover:text-ink hover:bg-line transition-colors cursor-pointer"
                title="Borrar filtro de nombre"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            id="genetics-photoperiod-filter"
            value={filterPhotoperiod}
            onChange={(e) => setFilterPhotoperiod(e.target.value)}
            className="px-4 py-2.5 rounded-2xl bg-surface border border-line text-xs font-semibold text-ink focus:outline-hidden cursor-pointer"
          >
            <option value="all">Todos los fotoperiodos</option>
            <option value="Fotoperiódica">Fotoperiódicas</option>
            <option value="Automática">Automáticas</option>
            <option value="CBD">CBD</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              id="clear-all-filters-btn"
              onClick={() => {
                setSearchTerm('');
                setSelectedSeedBank('ALL');
                setFilterPhotoperiod('all');
              }}
              className="px-3 py-2 text-xs font-semibold text-error hover:text-error hover:bg-error/10 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Limpiar filtros</span>
            </button>
          )}
        </div>

        {/* Filter Chips for seedBank */}
        <div className="space-y-1.5 pt-2 border-t border-line">
          <div className="flex items-center justify-between text-xs font-bold text-ink-muted px-1">
            <span className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-ink-subtle" />
              <span>Bancos de semillas ({seedBanks.length}):</span>
            </span>
            {selectedSeedBank !== 'ALL' && (
              <button
                type="button"
                id="reset-seedbank-chip"
                onClick={() => setSelectedSeedBank('ALL')}
                className="text-xs font-semibold text-ok-ink hover:underline cursor-pointer"
              >
                Ver todos los bancos
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar">
            <button
              type="button"
              id="seedbank-chip-all"
              onClick={() => setSelectedSeedBank('ALL')}
              className={`min-h-11 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedSeedBank === 'ALL'
                  ? 'bg-brand-deep text-white shadow-xs'
                  : 'bg-track hover:bg-line text-ink'
              }`}
            >
              Todos ({GENETICS_DATABASE.length})
            </button>

            {seedBanks.map(({ name, count }) => {
              const isSelected = selectedSeedBank === name;
              const chipId = `seedbank-chip-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
              return (
                <button
                  key={name}
                  id={chipId}
                  type="button"
                  onClick={() => setSelectedSeedBank(isSelected ? 'ALL' : name)}
                  className={`min-h-11 px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-brand-deep text-white font-semibold shadow-xs'
                      : 'bg-track hover:bg-line text-ink font-medium'
                  }`}
                >
                  <span>{name}</span>
                  <span
                    className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
                      isSelected
                        ? 'bg-brand-deep text-white'
                        : 'bg-line text-ink-muted'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Counter & Current Filter Summary */}
        <div className="flex items-center justify-between text-xs text-ink-muted pt-1 px-1">
          <span>
            Mostrando{' '}
            <strong className="text-ink">
              {activeTab === 'catalog'
                ? filteredPredefined.length
                : filteredSavedGenetics.length + filteredFavorites.length}
            </strong>{' '}
            genéticas
            {selectedSeedBank !== 'ALL' && (
              <span>
                {' '}
                de <strong className="text-ok-ink">{selectedSeedBank}</strong>
              </span>
            )}
            {searchTerm && <span> para "{searchTerm}"</span>}
          </span>
        </div>
      </div>

      {/* Grid Content: Predefined Catalog Tab */}
      {activeTab === 'catalog' && (
        <>
          {filteredPredefined.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 border border-line text-center space-y-3 max-w-[570px] mx-auto">
              <div className="w-16 h-16 rounded-full bg-ok-bg text-ok-ink flex items-center justify-center mx-auto">
                <Search className="w-8 h-8 text-ink-subtle" />
              </div>
              <h4 className="font-bold text-ink text-base">No se encontraron genéticas en el catálogo</h4>
              <p className="text-xs text-ink-muted max-w-sm mx-auto">
                Ninguna genética coincide con esos filtros. Probá con otro banco de semillas u otra búsqueda.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedSeedBank('ALL');
                  setFilterPhotoperiod('all');
                }}
                className="px-4 py-2 rounded-2xl bg-track hover:bg-line text-ink text-xs font-semibold transition-colors cursor-pointer"
              >
                Limpiar búsqueda y filtros
              </button>
            </div>
          ) : (
            <div id="genetics-catalog-list" className="flex flex-col gap-2 w-full max-w-[570px] mx-auto">
              {filteredPredefined.map((item) => renderCatalogItem(item))}
            </div>
          )}
        </>
      )}

      {/* Favoritas: las marcadas y las propias, en una sola lista y con el mismo formato */}
      {activeTab === 'favorites' && (
        <>
          {favoriteItems.length === 0 ? (
            <div id="genetics-favorites-empty" className="bg-white rounded-3xl p-12 border border-line text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-ok-bg text-ok-ink flex items-center justify-center mx-auto">
                <Layers className="w-8 h-8" />
              </div>
              <h4 className="font-bold text-ink text-base">
                {hasActiveFilters
                  ? 'Ninguna favorita con estos filtros'
                  : 'Todavía no tenés favoritas'}
              </h4>
              <p className="text-xs text-ink-muted max-w-sm mx-auto">
                {hasActiveFilters
                  ? 'Probá limpiando la búsqueda o el filtro de banco de semillas.'
                  : 'Abrí una genética del catálogo y tocá Favoritos, o creá una con el botón de arriba.'}
              </p>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedSeedBank('ALL');
                    setFilterPhotoperiod('all');
                  }}
                  className="px-4 py-2 rounded-2xl bg-track hover:bg-line text-ink text-xs font-semibold transition-colors cursor-pointer"
                >
                  Limpiar filtros
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveTab('catalog')}
                  className="px-4 py-2 rounded-2xl bg-brand-deep hover:bg-brand-deep text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Ver el catálogo
                </button>
              )}
            </div>
          ) : (
            <div id="genetics-favorites-list" className="flex flex-col gap-2 w-full max-w-[570px] mx-auto">
              {favoriteItems.map((item) => (item.own ? renderOwnItem(item.own) : renderCatalogItem(predefinedFromFavorite(item.favorite!), true)))}
            </div>
          )}
        </>
      )}

      {/* Form Modal for Creating / Editing Custom Genetics */}
      {isFormOpen && (
        <GeneticsFormModal
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          userId={userId}
          geneticsToEdit={geneticsToEdit}
          onSaved={(saved) => {
            onGeneticsUpdated(saved);
          }}
        />
      )}

      {/* Admin Photo Management Modal (Solo Creador/Admin) */}
      {isAdminPhotoModalOpen && isAdminOrCreator && (
        <GeneticsPhotoAdminModal
          isOpen={isAdminPhotoModalOpen}
          onClose={() => setIsAdminPhotoModalOpen(false)}
        />
      )}
    </div>
  );
};
