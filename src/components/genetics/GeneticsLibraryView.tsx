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
  Heart
} from 'lucide-react';
import { Genetics, Harvest, PhotoperiodType, DominanceType, FavoriteGenetic } from '../../types';
import { GeneticsFormModal } from './GeneticsFormModal';
import { GENETICS_DATABASE, PredefinedGenetic } from '../../data/predefinedGenetics';
import { geneticsService } from '../../services/geneticsService';
import { favoritesService, getGeneticsKey } from '../../services/favoritesService';

interface GeneticsLibraryViewProps {
  userId: string;
  geneticsList: Genetics[];
  harvests: Harvest[];
  onStartCropWithGenetics: (genetics: Genetics) => void;
  onGeneticsUpdated: (genetics: Genetics) => void;
  onGeneticsDeleted?: (geneticsId: string) => void;
}

export function convertPredefinedToGenetics(p: PredefinedGenetic, userId: string): Genetics {
  const numbers = p.floweringDays.match(/\d+/g);
  const parsedDays = numbers ? parseInt(numbers[numbers.length - 1], 10) : 60;

  const isAuto = p.floweringDays.toLowerCase().includes('germ') || p.name.toLowerCase().includes('auto');
  const isCBD = p.name.toUpperCase().includes('CBD') || p.dominance.toUpperCase().includes('CBD');
  const photoperiodType: PhotoperiodType = isAuto ? 'Automática' : isCBD ? 'CBD' : 'Fotoperiódica';

  let dominance: DominanceType = 'Híbrida';
  const domLower = p.dominance.toLowerCase();
  if (domLower.includes('índica') || domLower.includes('indica')) dominance = 'Índica';
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
    notes: `Perfil organoléptico: ${p.organolepticProfile} | Floración estimada: ${p.floweringDays} | Rendimiento: ${p.estimatedYield} g/m²`,
    createdAt: now,
    updatedAt: now,
  };
}

export const GeneticsLibraryView: React.FC<GeneticsLibraryViewProps> = ({
  userId,
  geneticsList,
  harvests,
  onStartCropWithGenetics,
  onGeneticsUpdated,
  onGeneticsDeleted,
}) => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'saved' | 'favorites'>('catalog');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeedBank, setSelectedSeedBank] = useState<string>('ALL');
  const [filterPhotoperiod, setFilterPhotoperiod] = useState('all');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [geneticsToEdit, setGeneticsToEdit] = useState<Genetics | null>(null);
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});

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
    estimatedYield?: number;
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
      // Filtro solo favoritas
      if (showOnlyFavorites && !isGeneticsFavorite(item.name, item.seedBank)) {
        return false;
      }

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
  }, [searchTerm, selectedSeedBank, filterPhotoperiod, showOnlyFavorites, favoriteKeysSet]);

  // Filtrado de las genéticas guardadas del usuario
  const filteredSavedGenetics = useMemo(() => {
    return geneticsList.filter((g) => {
      if (showOnlyFavorites && !isGeneticsFavorite(g.name, g.seedBank)) {
        return false;
      }
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
  }, [geneticsList, selectedSeedBank, filterPhotoperiod, searchTerm, showOnlyFavorites, favoriteKeysSet]);

  // Filtrado de las genéticas favoritas
  const filteredFavorites = useMemo(() => {
    return favorites.filter((fav) => {
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
  }, [favorites, selectedSeedBank, filterPhotoperiod, searchTerm]);

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

    try {
      setSavingMap((prev) => ({ ...prev, [key]: true }));
      const converted = convertPredefinedToGenetics(item, userId);
      const saved = await geneticsService.createGenetics({
        userId,
        name: item.name,
        seedBank: item.seedBank,
        photoperiodType: converted.photoperiodType,
        dominance: converted.dominance,
        declaredFloweringDays: converted.declaredFloweringDays,
        expectedAroma: item.organolepticProfile,
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

  const hasActiveFilters = searchTerm.trim() !== '' || selectedSeedBank !== 'ALL' || filterPhotoperiod !== 'all' || showOnlyFavorites;

  return (
    <div className="space-y-6">
      {/* Top Banner & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white rounded-3xl p-6 border border-stone-200 shadow-sm">
        <div>
          <h2 className="font-bold text-xl text-stone-900 flex items-center gap-2">
            <span>Biblioteca y Catálogo de Genéticas</span>
            <span className="text-sm font-normal text-stone-500 bg-stone-100 px-2.5 py-0.5 rounded-full border border-stone-200">
              {GENETICS_DATABASE.length} variedades
            </span>
          </h2>
          <p className="text-xs text-stone-500 mt-1">
            Encuentra rápidamente variedades por banco de semillas o nombre para iniciar tus nuevos cultivos
          </p>
        </div>

        <button
          type="button"
          id="add-genetics-btn"
          onClick={() => {
            setGeneticsToEdit(null);
            setIsFormOpen(true);
          }}
          className="px-5 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Genética Personalizada</span>
        </button>
      </div>

      {/* Tabs Switcher: Catálogo Base vs Mis Genéticas vs Favoritas */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          id="tab-catalog-btn"
          onClick={() => setActiveTab('catalog')}
          className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'catalog'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Catálogo de Genéticas ({GENETICS_DATABASE.length})</span>
        </button>

        <button
          type="button"
          id="tab-saved-btn"
          onClick={() => setActiveTab('saved')}
          className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'saved'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <Bookmark className="w-4 h-4" />
          <span>Mis Genéticas Guardadas ({geneticsList.length})</span>
        </button>

        <button
          type="button"
          id="tab-favorites-btn"
          onClick={() => setActiveTab('favorites')}
          className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'favorites'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <Heart className={`w-4 h-4 ${activeTab === 'favorites' ? 'fill-white text-white' : 'text-rose-500 fill-rose-100'}`} />
          <span>Mis Favoritas ({favorites.length})</span>
        </button>
      </div>

      {/* Search Bar & Photoperiod Dropdown */}
      <div className="space-y-3 bg-white p-4 rounded-3xl border border-stone-200 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
            <input
              id="filter-genetics-name"
              type="text"
              placeholder="Filtrar por nombre de genética (ej: Skunk, Amnesia, Gelato)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 placeholder-stone-400 focus:outline-hidden focus:border-emerald-600 focus:bg-white transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                id="clear-genetics-name-search"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2.5 p-1 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition-colors cursor-pointer"
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
            className="px-4 py-2.5 rounded-2xl bg-stone-50 border border-stone-200 text-xs font-semibold text-stone-700 focus:outline-hidden cursor-pointer"
          >
            <option value="all">Todos los fotoperiodos</option>
            <option value="Fotoperiódica">Fotoperiódicas</option>
            <option value="Automática">Automáticas</option>
            <option value="CBD">CBD</option>
          </select>

          {/* Quick toggle for Favorites filter */}
          <button
            type="button"
            id="toggle-only-favorites-btn"
            onClick={() => setShowOnlyFavorites((prev) => !prev)}
            className={`px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              showOnlyFavorites
                ? 'bg-rose-50 border border-rose-300 text-rose-700 shadow-2xs'
                : 'bg-stone-50 border border-stone-200 text-stone-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200'
            }`}
            title="Filtrar solo genéticas marcadas como favoritas"
          >
            <Heart className={`w-3.5 h-3.5 ${showOnlyFavorites ? 'fill-rose-600 text-rose-600' : 'text-stone-400'}`} />
            <span>Favoritas ({favorites.length})</span>
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              id="clear-all-filters-btn"
              onClick={() => {
                setSearchTerm('');
                setSelectedSeedBank('ALL');
                setFilterPhotoperiod('all');
                setShowOnlyFavorites(false);
              }}
              className="px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Limpiar filtros</span>
            </button>
          )}
        </div>

        {/* Filter Chips for seedBank */}
        <div className="space-y-1.5 pt-2 border-t border-stone-100">
          <div className="flex items-center justify-between text-xs font-bold text-stone-500 px-1">
            <span className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-stone-400" />
              <span>Bancos de Semillas ({seedBanks.length}):</span>
            </span>
            {selectedSeedBank !== 'ALL' && (
              <button
                type="button"
                id="reset-seedbank-chip"
                onClick={() => setSelectedSeedBank('ALL')}
                className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
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
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedSeedBank === 'ALL'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
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
                  className={`px-3 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-emerald-700 text-white font-semibold shadow-xs'
                      : 'bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium'
                  }`}
                >
                  <span>{name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isSelected
                        ? 'bg-emerald-800 text-emerald-100'
                        : 'bg-stone-200/80 text-stone-600'
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
        <div className="flex items-center justify-between text-xs text-stone-500 pt-1 px-1">
          <span>
            Mostrando{' '}
            <strong className="text-stone-800">
              {activeTab === 'catalog'
                ? filteredPredefined.length
                : activeTab === 'saved'
                ? filteredSavedGenetics.length
                : filteredFavorites.length}
            </strong>{' '}
            variedades
            {selectedSeedBank !== 'ALL' && (
              <span>
                {' '}
                de <strong className="text-emerald-800">{selectedSeedBank}</strong>
              </span>
            )}
            {searchTerm && <span> para "{searchTerm}"</span>}
            {showOnlyFavorites && <span className="text-rose-600 font-semibold"> (solo favoritas)</span>}
          </span>
        </div>
      </div>

      {/* Grid Content: Predefined Catalog Tab */}
      {activeTab === 'catalog' && (
        <>
          {filteredPredefined.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 border border-stone-200 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <Search className="w-8 h-8 text-stone-400" />
              </div>
              <h4 className="font-bold text-stone-800 text-base">No se encontraron genéticas en el catálogo</h4>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                No hay variedades que coincidan con los filtros seleccionados. Prueba con otro banco de semillas o término de búsqueda.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedSeedBank('ALL');
                  setFilterPhotoperiod('all');
                }}
                className="px-4 py-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold transition-colors cursor-pointer"
              >
                Limpiar búsqueda y filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredPredefined.map((item) => {
                const isSaved = isSavedInUserLibrary(item.name, item.seedBank);
                const isSaving = savingMap[`${item.seedBank}-${item.name}`];
                const converted = convertPredefinedToGenetics(item, userId);

                // Dominance styling
                const dom = item.dominance.toLowerCase();
                const isSativa = dom.includes('sátiva') || dom.includes('sativa');
                const isIndica = dom.includes('índica') || dom.includes('indica');

                return (
                  <div
                    key={`${item.seedBank}-${item.name}`}
                    className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      {/* Title & Bank */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-base text-stone-900 leading-tight">{item.name}</h3>
                          <span className="inline-block mt-0.5 text-xs font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                            {item.seedBank}
                          </span>
                        </div>

                        {/* Save to library indicator / button */}
                        <button
                          type="button"
                          onClick={() => handleSavePredefined(item)}
                          disabled={isSaved || isSaving}
                          title={isSaved ? 'Ya está en tu biblioteca' : 'Guardar en mi biblioteca'}
                          className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                            isSaved
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 cursor-default'
                              : 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100 hover:text-stone-800'
                          }`}
                        >
                          {isSaved ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Bookmark className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      {/* Dominance & Specs Badges */}
                      <div className="flex flex-wrap gap-1.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            isSativa
                              ? 'bg-amber-50 text-amber-900 border-amber-200'
                              : isIndica
                              ? 'bg-purple-50 text-purple-900 border-purple-200'
                              : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                          }`}
                        >
                          {item.dominance}
                        </span>

                        <span className="px-2.5 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-700 text-[11px] font-semibold flex items-center gap-1">
                          <Clock className="w-3 h-3 text-stone-400" />
                          <span>{item.floweringDays} d</span>
                        </span>

                        <span className="px-2.5 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-700 text-[11px] font-semibold flex items-center gap-1">
                          <Scale className="w-3 h-3 text-stone-400" />
                          <span>{item.estimatedYield} g/m²</span>
                        </span>
                      </div>

                      {/* Organoleptic Profile */}
                      <div className="bg-stone-50/80 p-3 rounded-2xl border border-stone-200/60 space-y-1">
                        <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                          <Sparkles className="w-3 h-3 text-emerald-600" />
                          <span>Aroma y Gusto</span>
                        </div>
                        <p className="text-xs text-stone-700 font-medium italic">
                          "{item.organolepticProfile}"
                        </p>
                      </div>
                    </div>

                    {/* Actions: Start crop & Save */}
                    <div className="space-y-2 pt-2 border-t border-stone-100">
                      <button
                        type="button"
                        onClick={() => onStartCropWithGenetics(converted)}
                        className="w-full py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Sprout className="w-4 h-4" />
                        <span>Iniciar Cultivo con {item.name}</span>
                      </button>

                      {!isSaved && (
                        <button
                          type="button"
                          onClick={() => handleSavePredefined(item)}
                          disabled={isSaving}
                          className="w-full py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Bookmark className="w-3.5 h-3.5" />
                          <span>{isSaving ? 'Guardando...' : 'Guardar en Mi Biblioteca'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Grid Content: Mis Genéticas Guardadas Tab */}
      {activeTab === 'saved' && (
        <>
          {filteredSavedGenetics.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 border border-stone-200 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <Layers className="w-8 h-8" />
              </div>
              <h4 className="font-bold text-stone-800 text-base">
                {hasActiveFilters
                  ? 'No se encontraron genéticas guardadas con estos filtros'
                  : 'Aún no tienes genéticas personalizadas guardadas'}
              </h4>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                {hasActiveFilters
                  ? 'Prueba limpiando la búsqueda o el filtro de banco de semillas.'
                  : 'Explora el Catálogo de Genéticas predefinidas o crea una nueva con el botón superior.'}
              </p>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedSeedBank('ALL');
                    setFilterPhotoperiod('all');
                  }}
                  className="px-4 py-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Limpiar filtros
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveTab('catalog')}
                  className="px-4 py-2 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Explorar Catálogo de Genéticas
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredSavedGenetics.map((genetics) => {
                const stats = getStatsForGenetics(genetics.name);

                return (
                  <div
                    key={genetics.id}
                    className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      {/* Card Title & Bank */}
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-bold text-base text-stone-900">{genetics.name}</h3>
                          <p className="text-xs font-semibold text-emerald-800">{genetics.seedBank}</p>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setGeneticsToEdit(genetics);
                              setIsFormOpen(true);
                            }}
                            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 cursor-pointer"
                            title="Editar"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          {onGeneticsDeleted && (
                            <button
                              type="button"
                              onClick={() => onGeneticsDeleted(genetics.id)}
                              className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-stone-100 cursor-pointer"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-1.5">
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                          {genetics.photoperiodType}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-700 text-[11px] font-semibold">
                          {genetics.dominance}
                        </span>
                        {genetics.declaredFloweringDays && (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">
                            ~{genetics.declaredFloweringDays} días flor
                          </span>
                        )}
                      </div>

                      {/* Cannabinoids */}
                      {(genetics.thcPercentage || genetics.cbdPercentage) && (
                        <div className="grid grid-cols-2 gap-2 bg-stone-50 p-2.5 rounded-2xl border border-stone-200/60 text-xs">
                          {genetics.thcPercentage && (
                            <div>
                              <span className="text-stone-400 block text-[10px]">THC</span>
                              <span className="font-bold text-stone-800">{genetics.thcPercentage}%</span>
                            </div>
                          )}
                          {genetics.cbdPercentage && (
                            <div>
                              <span className="text-stone-400 block text-[10px]">CBD</span>
                              <span className="font-bold text-stone-800">{genetics.cbdPercentage}%</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Terpenes */}
                      {genetics.terpenes && genetics.terpenes.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold text-stone-400">Terpenos dominantes</span>
                          <div className="flex flex-wrap gap-1">
                            {genetics.terpenes.map((t, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 text-[10px] font-medium"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {genetics.notes && (
                        <p className="text-xs text-stone-600 italic bg-emerald-50/40 p-2.5 rounded-xl border border-emerald-100">
                          "{genetics.notes}"
                        </p>
                      )}

                      {/* Harvest stats */}
                      {stats.count > 0 && (
                        <div className="p-3 rounded-2xl bg-amber-50/50 border border-amber-200/60 text-xs space-y-1">
                          <div className="flex items-center justify-between font-bold text-amber-900">
                            <span>{stats.count} cosechas registradas</span>
                            {stats.avgRating && (
                              <span className="flex items-center gap-1">
                                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                {stats.avgRating}
                              </span>
                            )}
                          </div>
                          {stats.avgGrams && (
                            <div className="text-stone-600 text-[11px]">
                              Rendimiento promedio: <span className="font-bold text-stone-800">{stats.avgGrams} g / planta</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Bottom action */}
                    <button
                      type="button"
                      onClick={() => onStartCropWithGenetics(genetics)}
                      className="w-full py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Sprout className="w-4 h-4" />
                      <span>Iniciar Cultivo con esta Genética</span>
                    </button>
                  </div>
                );
              })}
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
    </div>
  );
};
