import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { authService } from './services/authService';
import { cultivationService } from './services/cultivationService';
import { wateringService } from './services/wateringService';
import { environmentService } from './services/environmentService';
import { photoService } from './services/photoService';
import { geneticsService } from './services/geneticsService';
import { harvestService } from './services/harvestService';
import { diaryService } from './services/diaryService';
import { demoDataService } from './services/demoDataService';

import {
  Cultivation,
  Watering,
  EnvironmentRecord,
  PhotoRecord,
  Genetics,
  Harvest,
  DiaryEntry,
  WateringProductItem,
} from './types';

import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { MobileNav } from './components/common/MobileNav';
import { QuickActionModal } from './components/common/QuickActionModal';
import { AuthScreen } from './components/auth/AuthScreen';

import { DashboardOverview } from './components/dashboard/DashboardOverview';
import { CultivationDetailView } from './components/cultivations/CultivationDetailView';
import { CultivationFormModal } from './components/cultivations/CultivationFormModal';
import { CultivationCard } from './components/cultivations/CultivationCard';
import { CultivationsFilterBar, StageFilterCategory, matchesStageFilter } from './components/cultivations/CultivationsFilterBar';
import { WateringModal } from './components/logs/WateringModal';
import { EnvironmentModal } from './components/logs/EnvironmentModal';
import { PhotoUploadModal } from './components/logs/PhotoUploadModal';
import { DiaryNoteModal } from './components/logs/DiaryNoteModal';
import { GeneticsLibraryView } from './components/genetics/GeneticsLibraryView';
import { HarvestsHistoryView } from './components/harvests/HarvestsHistoryView';
import { AIAssistantView } from './components/ai/AIAssistantView';
import { CalculatorsView } from './components/tools/CalculatorsView';
import { PhotoDiagnosisModal } from './components/ai/PhotoDiagnosisModal';
import { GoogleCalendarModal } from './components/calendar/GoogleCalendarModal';
import { CropComparisonView } from './components/harvests/CropComparisonView';
import { Sprout, Plus, SlidersHorizontal } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // App Navigation State
  const [currentView, setCurrentView] = useState<
    'dashboard' | 'cultivations' | 'cultivation_detail' | 'genetics' | 'harvests' | 'compare_crops' | 'ai_assistant' | 'calculators'
  >('dashboard');
  const [selectedCultivationId, setSelectedCultivationId] = useState<string | null>(null);
  const [comparisonCropAId, setComparisonCropAId] = useState<string | undefined>(undefined);
  const [comparisonCropBId, setComparisonCropBId] = useState<string | undefined>(undefined);

  // Data Collections
  const [cultivations, setCultivations] = useState<Cultivation[]>([]);
  const [waterings, setWaterings] = useState<Watering[]>([]);
  const [envRecords, setEnvRecords] = useState<EnvironmentRecord[]>([]);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [geneticsList, setGeneticsList] = useState<Genetics[]>([]);
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);

  // Modal States
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const [isCultivationFormOpen, setIsCultivationFormOpen] = useState(false);
  const [cultivationToEdit, setCultivationToEdit] = useState<Cultivation | null>(null);
  const [initialGeneticsForNewCrop, setInitialGeneticsForNewCrop] = useState<Genetics | null>(null);
  const [isWateringModalOpen, setIsWateringModalOpen] = useState(false);
  const [wateringModalInitialRecipe, setWateringModalInitialRecipe] = useState<{
    products: WateringProductItem[];
    ph?: number;
    ec?: number;
  } | null>(null);
  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isDiaryModalOpen, setIsDiaryModalOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [calendarModalCultivation, setCalendarModalCultivation] = useState<Cultivation | null>(null);
  const [photoForInstantDiagnosis, setPhotoForInstantDiagnosis] = useState<{
    photo: PhotoRecord;
    cultivation: Cultivation;
  } | null>(null);

  // Notification / Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Firestore Sync / Skeleton Loading State for initial fetch and refresh
  const [isFirestoreLoading, setIsFirestoreLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setIsFirestoreLoading(false);
      return;
    }
    setIsFirestoreLoading(true);
    const timer = setTimeout(() => {
      setIsFirestoreLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [currentUser?.uid]);

  // Cultivations List Stage Filter & Search State
  const [stageFilter, setStageFilter] = useState<StageFilterCategory>('all');
  const [cultivationSearchQuery, setCultivationSearchQuery] = useState('');

  const filteredCultivations = useMemo(() => {
    return cultivations.filter((crop) => {
      // Stage filter
      if (!matchesStageFilter(crop, stageFilter)) {
        return false;
      }

      // Search query filter
      if (cultivationSearchQuery.trim()) {
        const q = cultivationSearchQuery.toLowerCase();
        const nameMatch = crop.name.toLowerCase().includes(q);
        const geneticsMatch = crop.geneticsName?.toLowerCase().includes(q);
        const stageMatch = crop.currentStage?.toLowerCase().includes(q);
        const typeMatch = crop.type?.toLowerCase().includes(q);
        if (!nameMatch && !geneticsMatch && !stageMatch && !typeMatch) {
          return false;
        }
      }
      return true;
    });
  }, [cultivations, stageFilter, cultivationSearchQuery]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Listen for Auth State
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged((user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-time subscriptions to Firestore
  useEffect(() => {
    if (!currentUser) {
      setCultivations([]);
      setWaterings([]);
      setEnvRecords([]);
      setPhotos([]);
      setGeneticsList([]);
      setHarvests([]);
      setDiaryEntries([]);
      return;
    }

    const unsubCultivations = cultivationService.subscribeCultivations(
      currentUser.uid,
      setCultivations
    );
    const unsubWaterings = wateringService.subscribeWaterings(currentUser.uid, setWaterings);
    const unsubEnv = environmentService.subscribeEnvironment(currentUser.uid, setEnvRecords);
    const unsubPhotos = photoService.subscribePhotos(currentUser.uid, setPhotos);
    const unsubGenetics = geneticsService.subscribeGenetics(currentUser.uid, setGeneticsList);
    const unsubHarvests = harvestService.subscribeHarvests(currentUser.uid, setHarvests);
    const unsubDiary = diaryService.subscribeDiary(currentUser.uid, setDiaryEntries);

    return () => {
      unsubCultivations();
      unsubWaterings();
      unsubEnv();
      unsubPhotos();
      unsubGenetics();
      unsubHarvests();
      unsubDiary();
    };
  }, [currentUser]);

  // Handle Demo Data Seed
  const handleSeedDemoData = async () => {
    if (!currentUser) return;
    try {
      showToast('Cargando datos de demostración realistas...');
      await demoDataService.seedDemoData(currentUser.uid);
      showToast('¡Datos de demostración cargados exitosamente!');
    } catch (err: any) {
      console.error('Error seeding demo data', err);
      showToast('No se pudieron cargar los datos de demo.');
    }
  };

  // Handle Demo Data Clear
  const handleClearDemoData = async () => {
    if (!currentUser) return;
    if (window.confirm('¿Deseas eliminar todos los registros marcados como Demo?')) {
      try {
        await demoDataService.clearDemoData(currentUser.uid);
        showToast('Datos de demostración eliminados.');
      } catch (err) {
        console.error('Error clearing demo data', err);
        showToast('Error al limpiar datos demo.');
      }
    }
  };

  const handleLogout = async () => {
    await authService.signOutUser();
    setCurrentView('dashboard');
    setSelectedCultivationId(null);
  };

  const selectedCultivation = cultivations.find((c) => c.id === selectedCultivationId);

  // Authentication Loading Screen
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-black flex items-center justify-center text-3xl shadow-lg shadow-emerald-500/20 animate-pulse font-mono font-bold">
            🌱
          </div>
          <p className="text-xs font-mono font-bold uppercase tracking-[0.2em] text-zinc-500">Cargando Cultiveta...</p>
        </div>
      </div>
    );
  }

  // Not logged in -> Show Login/Register
  if (!currentUser) {
    return (
      <AuthScreen
        onSuccess={() => {}}
        onExploreDemo={async () => {
          try {
            showToast('Ingresando en Modo Demo...');
            const guest = await authService.loginAsDemoGuest();
            const hasData = await demoDataService.hasDemoData(guest.uid);
            if (!hasData) {
              await demoDataService.seedDemoData(guest.uid);
            }
            showToast('¡Bienvenido al Modo Demo de Cultiveta!');
          } catch (err: any) {
            console.error('Error in demo exploration:', err);
            showToast('Error al iniciar Modo Demo.');
          }
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 flex flex-col selection:bg-emerald-500 selection:text-black">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 px-5 py-3 rounded-2xl bg-[#0F0F0F] text-emerald-400 text-xs font-bold shadow-2xl border border-zinc-800 animate-in slide-in-from-top duration-200 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></div>
          {toastMessage}
        </div>
      )}

      {/* Top Header */}
      <Header
        currentUser={currentUser}
        onOpenQuickAction={() => setIsQuickActionOpen(true)}
        onLogout={handleLogout}
        onSeedDemoData={handleSeedDemoData}
        onClearDemoData={handleClearDemoData}
      />

      {/* Main Layout (Sidebar + Main Content) */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 gap-6">
        {/* Desktop Sidebar */}
        <Sidebar
          currentView={currentView}
          onNavigate={(view) => {
            setCurrentView(view);
            if (view !== 'cultivation_detail') {
              setSelectedCultivationId(null);
            }
          }}
          onOpenQuickAction={() => setIsQuickActionOpen(true)}
          cultivationsCount={cultivations.filter((c) => !c.isFinished).length}
          geneticsCount={geneticsList.length}
          harvestsCount={harvests.length}
        />

        {/* Content Area */}
        <main className="flex-1 min-w-0 pb-24 md:pb-8">
          {/* VIEW: DASHBOARD OVERVIEW */}
          {currentView === 'dashboard' && (
            <DashboardOverview
              cultivations={cultivations}
              waterings={waterings}
              envRecords={envRecords}
              photos={photos}
              userId={currentUser.uid}
              isLoading={isFirestoreLoading}
              onRefreshData={() => {
                setIsFirestoreLoading(true);
                setTimeout(() => setIsFirestoreLoading(false), 1200);
              }}
              onSelectCultivation={(crop) => {
                setSelectedCultivationId(crop.id);
                setCurrentView('cultivation_detail');
              }}
              onCreateCultivationClick={() => {
                setCultivationToEdit(null);
                setIsCultivationFormOpen(true);
              }}
              onOpenWateringModal={(crop) => {
                if (crop) setSelectedCultivationId(crop.id);
                setIsWateringModalOpen(true);
              }}
              onOpenEnvModal={(crop) => {
                if (crop) setSelectedCultivationId(crop.id);
                setIsEnvModalOpen(true);
              }}
              onOpenPhotoModal={(crop) => {
                if (crop) setSelectedCultivationId(crop.id);
                setIsPhotoModalOpen(true);
              }}
              onOpenAIAssistant={(crop) => {
                if (crop) setSelectedCultivationId(crop.id);
                setCurrentView('ai_assistant');
              }}
              onOpenCalendarModal={(crop) => {
                setCalendarModalCultivation(crop);
                setIsCalendarModalOpen(true);
              }}
              onWateringAdded={(w) => {
                setWaterings((prev) => [w, ...prev.filter((x) => x.id !== w.id)]);
              }}
              onTaskCompletedFeedback={(msg) => {
                showToast(msg);
              }}
            />
          )}

          {/* VIEW: CULTIVATIONS LIST */}
          {currentView === 'cultivations' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-[#0F0F0F] rounded-[32px] p-6 sm:p-8 border border-zinc-800 shadow-sm relative overflow-hidden">
                <div className="absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_20%_20%,#10b981_0%,transparent_60%)] pointer-events-none"></div>
                <div className="relative z-10">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-[0.25em] text-zinc-500 mb-1 block">Gestión de Salas</span>
                  <h2 className="font-bold text-2xl text-white">Mis Cultivos 🌱</h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Seguimiento individual de carpas, salas y plantas
                  </p>
                </div>

                <button
                  type="button"
                  id="list-create-crop-btn"
                  onClick={() => {
                    setCultivationToEdit(null);
                    setIsCultivationFormOpen(true);
                  }}
                  className="relative z-10 px-6 py-3 rounded-2xl bg-white hover:bg-zinc-200 text-black text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-black stroke-[2.5]" />
                  <span>Nuevo Cultivo</span>
                </button>
              </div>

              {cultivations.length > 0 && (
                <CultivationsFilterBar
                  activeFilter={stageFilter}
                  onFilterChange={setStageFilter}
                  searchQuery={cultivationSearchQuery}
                  onSearchChange={setCultivationSearchQuery}
                  cultivations={cultivations}
                  totalFilteredCount={filteredCultivations.length}
                />
              )}

              {cultivations.length === 0 ? (
                <div className="bg-[#0F0F0F] rounded-[32px] p-12 border border-zinc-800 text-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 text-emerald-400 flex items-center justify-center mx-auto">
                    <Sprout className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">No hay cultivos registrados</h3>
                    <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-1">
                      Crea un nuevo cultivo para empezar a registrar riegos, parámetros y fotografías.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCultivationToEdit(null);
                      setIsCultivationFormOpen(true);
                    }}
                    className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all shadow-lg shadow-emerald-500/20 cursor-pointer inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    Crear Primer Cultivo
                  </button>
                </div>
              ) : filteredCultivations.length === 0 ? (
                <div className="bg-[#0F0F0F] rounded-[32px] p-10 border border-zinc-800 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 flex items-center justify-center mx-auto">
                    <SlidersHorizontal className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-white text-base">No hay cultivos que coincidan</h3>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                    No encontramos plantas activas con el filtro seleccionado
                    {stageFilter !== 'all' && <> (etapa: <strong className="text-zinc-200 capitalize">{stageFilter}</strong>)</>}
                    {cultivationSearchQuery && <> y término &quot;<strong className="text-zinc-200">{cultivationSearchQuery}</strong>&quot;</>}.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setStageFilter('all');
                      setCultivationSearchQuery('');
                    }}
                    className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs transition-colors cursor-pointer inline-flex items-center gap-2"
                  >
                    Mostrar todos los cultivos
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredCultivations.map((crop) => (
                    <CultivationCard
                      key={crop.id}
                      cultivation={crop}
                      latestWatering={
                        waterings
                          .filter((w) => w.cultivationId === crop.id)
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null
                      }
                      latestEnv={
                        envRecords
                          .filter((e) => e.cultivationId === crop.id)
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null
                      }
                      onClick={() => {
                        setSelectedCultivationId(crop.id);
                        setCurrentView('cultivation_detail');
                      }}
                      onQuickWater={(c) => {
                        setSelectedCultivationId(c.id);
                        setIsWateringModalOpen(true);
                      }}
                      onQuickPhoto={(c) => {
                        setSelectedCultivationId(c.id);
                        setIsPhotoModalOpen(true);
                      }}
                      onQuickAI={(c) => {
                        setSelectedCultivationId(c.id);
                        setCurrentView('ai_assistant');
                      }}
                      onQuickCalendar={(c) => {
                        setCalendarModalCultivation(c);
                        setIsCalendarModalOpen(true);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* VIEW: CULTIVATION DETAIL */}
          {currentView === 'cultivation_detail' && (
            selectedCultivation ? (
              <CultivationDetailView
                cultivation={selectedCultivation}
                userId={currentUser.uid}
                waterings={waterings}
                envRecords={envRecords}
                photos={photos}
                diaryEntries={diaryEntries}
                onBack={() => {
                  setSelectedCultivationId(null);
                  setCurrentView('cultivations');
                }}
                onEditCultivation={(crop) => {
                  setCultivationToEdit(crop);
                  setIsCultivationFormOpen(true);
                }}
                onDeleteCultivation={async (cropId) => {
                  await cultivationService.deleteCultivation(cropId);
                  showToast('Cultivo eliminado.');
                  setSelectedCultivationId(null);
                  setCurrentView('cultivations');
                }}
                onOpenWateringModal={() => setIsWateringModalOpen(true)}
                onOpenWateringModalWithRecipe={(recipeProducts, defPh, defEc) => {
                  setWateringModalInitialRecipe({ products: recipeProducts, ph: defPh, ec: defEc });
                  setIsWateringModalOpen(true);
                }}
                onWateringUpdated={(updated) => {
                  setWaterings((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
                  showToast('Nutrición actualizada en el registro de riego.');
                }}
                onOpenEnvModal={() => setIsEnvModalOpen(true)}
                onOpenPhotoModal={() => setIsPhotoModalOpen(true)}
                onOpenDiaryModal={() => setIsDiaryModalOpen(true)}
                onHarvestFinalized={(harvest) => {
                  showToast('¡Cosecha finalizada y registrada!');
                  setCurrentView('harvests');
                }}
                onDeletePhoto={async (photoId) => {
                  if (window.confirm('¿Deseas eliminar esta fotografía?')) {
                    await photoService.deletePhotoRecord(photoId);
                    showToast('Fotografía eliminada.');
                  }
                }}
                onCultivationUpdated={(updated) => {
                  setCultivations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
                  showToast('Etapas y cronograma de cultivo actualizados.');
                }}
              />
            ) : (
              <div className="bg-[#0F0F0F] rounded-[32px] p-12 border border-zinc-800 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 text-emerald-400 flex items-center justify-center mx-auto">
                  <Sprout className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Cargando cultivo...</h3>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-1">
                    Cargando la información del cultivo seleccionado.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentView('cultivations')}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-semibold hover:bg-zinc-700 transition-colors"
                >
                  Volver a mis cultivos
                </button>
              </div>
            )
          )}

          {/* VIEW: GENETICS LIBRARY */}
          {currentView === 'genetics' && (
            <GeneticsLibraryView
              userId={currentUser.uid}
              geneticsList={geneticsList}
              harvests={harvests}
              onStartCropWithGenetics={(genetics) => {
                setCultivationToEdit(null);
                setInitialGeneticsForNewCrop(genetics);
                setIsCultivationFormOpen(true);
              }}
              onGeneticsUpdated={(saved) => {
                showToast(`Genética "${saved.name}" guardada.`);
              }}
              onGeneticsDeleted={async (id) => {
                if (window.confirm('¿Eliminar esta genética de tu biblioteca?')) {
                  await geneticsService.deleteGenetics(id);
                  showToast('Genética eliminada.');
                }
              }}
            />
          )}

          {/* VIEW: HARVESTS HISTORY */}
          {currentView === 'harvests' && (
            <HarvestsHistoryView
              harvests={harvests}
              cultivations={cultivations}
              userId={currentUser?.uid}
              onNavigateToCompare={(cropAId) => {
                setComparisonCropAId(cropAId);
                setCurrentView('compare_crops');
              }}
            />
          )}

          {/* VIEW: CROP COMPARISON */}
          {currentView === 'compare_crops' && (
            <CropComparisonView
              cultivations={cultivations}
              harvests={harvests}
              envRecords={envRecords}
              waterings={waterings}
              initialCropAId={comparisonCropAId}
              initialCropBId={comparisonCropBId}
              onBack={() => setCurrentView('harvests')}
              onSeedDemoData={handleSeedDemoData}
            />
          )}

          {/* VIEW: AI ASSISTANT CHAT */}
          {currentView === 'ai_assistant' && (
            <AIAssistantView
              cultivations={cultivations}
              activeCultivation={selectedCultivation}
              recentWaterings={waterings}
              recentEnvRecords={envRecords}
            />
          )}

          {/* VIEW: CALCULATORS */}
          {currentView === 'calculators' && <CalculatorsView />}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav
        currentView={currentView}
        onNavigate={(view) => {
          setCurrentView(view);
          if (view !== 'cultivation_detail') {
            setSelectedCultivationId(null);
          }
        }}
        onOpenQuickAction={() => setIsQuickActionOpen(true)}
      />

      {/* Quick Action Bottom Sheet */}
      <QuickActionModal
        isOpen={isQuickActionOpen}
        onClose={() => setIsQuickActionOpen(false)}
        cultivations={cultivations}
        onSelectAction={(action) => {
          setIsQuickActionOpen(false);
          switch (action) {
            case 'watering':
            case 'measurement':
              setIsWateringModalOpen(true);
              break;
            case 'environment':
              setIsEnvModalOpen(true);
              break;
            case 'photo':
              setIsPhotoModalOpen(true);
              break;
            case 'note':
              setIsDiaryModalOpen(true);
              break;
            case 'new-crop':
              setCultivationToEdit(null);
              setIsCultivationFormOpen(true);
              break;
            case 'ai-analyze':
              setCurrentView('ai_assistant');
              break;
          }
        }}
        onOpenWatering={() => setIsWateringModalOpen(true)}
        onOpenEnvironment={() => setIsEnvModalOpen(true)}
        onOpenPhoto={() => setIsPhotoModalOpen(true)}
        onOpenDiary={() => setIsDiaryModalOpen(true)}
        onOpenNewCultivation={() => {
          setCultivationToEdit(null);
          setIsCultivationFormOpen(true);
        }}
        onOpenAIAssistant={() => setCurrentView('ai_assistant')}
      />

      {/* Cultivation Form Modal */}
      {isCultivationFormOpen && (
        <CultivationFormModal
          isOpen={isCultivationFormOpen}
          onClose={() => {
            setIsCultivationFormOpen(false);
            setCultivationToEdit(null);
            setInitialGeneticsForNewCrop(null);
          }}
          userId={currentUser.uid}
          cultivationToEdit={cultivationToEdit}
          initialGenetics={initialGeneticsForNewCrop}
          geneticsList={geneticsList}
          onSaved={(savedCrop) => {
            setCultivations((prev) => {
              const exists = prev.some((c) => c.id === savedCrop.id);
              if (exists) {
                return prev.map((c) => (c.id === savedCrop.id ? savedCrop : c));
              }
              return [savedCrop, ...prev];
            });
            showToast(`Cultivo "${savedCrop.name}" guardado exitosamente.`);
            setSelectedCultivationId(savedCrop.id);
            setCurrentView('cultivation_detail');
            setInitialGeneticsForNewCrop(null);
          }}
        />
      )}

      {/* Watering Modal */}
      {isWateringModalOpen && (
        <WateringModal
          isOpen={isWateringModalOpen}
          onClose={() => {
            setIsWateringModalOpen(false);
            setWateringModalInitialRecipe(null);
          }}
          userId={currentUser.uid}
          cultivations={cultivations.filter((c) => !c.isFinished)}
          defaultCultivationId={selectedCultivationId || undefined}
          initialProducts={wateringModalInitialRecipe?.products}
          initialPh={wateringModalInitialRecipe?.ph}
          initialEc={wateringModalInitialRecipe?.ec}
          onWateringAdded={(w) => {
            setWaterings((prev) => [w, ...prev.filter((x) => x.id !== w.id)]);
            showToast('Riego registrado con éxito.');
            setWateringModalInitialRecipe(null);
          }}
        />
      )}

      {/* Environment Modal */}
      {isEnvModalOpen && (
        <EnvironmentModal
          isOpen={isEnvModalOpen}
          onClose={() => setIsEnvModalOpen(false)}
          userId={currentUser.uid}
          cultivations={cultivations.filter((c) => !c.isFinished)}
          defaultCultivationId={selectedCultivationId || undefined}
          onRecordAdded={(r) => {
            showToast('Medición ambiental registrada.');
          }}
        />
      )}

      {/* Photo Upload Modal */}
      {isPhotoModalOpen && (
        <PhotoUploadModal
          isOpen={isPhotoModalOpen}
          onClose={() => setIsPhotoModalOpen(false)}
          userId={currentUser.uid}
          cultivations={cultivations.filter((c) => !c.isFinished)}
          defaultCultivationId={selectedCultivationId || undefined}
          onPhotoUploaded={(photo, triggerAI) => {
            showToast('Fotografía guardada en la galería.');
            if (triggerAI) {
              const targetCrop = cultivations.find((c) => c.id === photo.cultivationId);
              if (targetCrop) {
                setPhotoForInstantDiagnosis({ photo, cultivation: targetCrop });
              }
            }
          }}
        />
      )}

      {/* Diary Note Modal */}
      {isDiaryModalOpen && (
        <DiaryNoteModal
          isOpen={isDiaryModalOpen}
          onClose={() => setIsDiaryModalOpen(false)}
          userId={currentUser.uid}
          cultivations={cultivations.filter((c) => !c.isFinished)}
          defaultCultivationId={selectedCultivationId || undefined}
          onNoteAdded={(n) => {
            showToast('Nota añadida al diario.');
          }}
        />
      )}

      {/* Instant AI Diagnosis Modal from Photo Upload */}
      {photoForInstantDiagnosis && (
        <PhotoDiagnosisModal
          isOpen={!!photoForInstantDiagnosis}
          onClose={() => setPhotoForInstantDiagnosis(null)}
          userId={currentUser.uid}
          cultivation={photoForInstantDiagnosis.cultivation}
          photo={photoForInstantDiagnosis.photo}
        />
      )}

      {/* Google Calendar Sync Modal */}
      {isCalendarModalOpen && calendarModalCultivation && (
        <GoogleCalendarModal
          isOpen={isCalendarModalOpen}
          onClose={() => {
            setIsCalendarModalOpen(false);
            setCalendarModalCultivation(null);
          }}
          cultivation={calendarModalCultivation}
          latestWatering={
            waterings
              .filter((w) => w.cultivationId === calendarModalCultivation.id)
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null
          }
          onEventSynced={() => {
            showToast('Evento sincronizado con Google Calendar');
          }}
        />
      )}
    </div>
  );
}
