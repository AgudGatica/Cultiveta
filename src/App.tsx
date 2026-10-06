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
import { photoOfflineQueue } from './services/photoOfflineQueue';
import { localStore } from './services/localStore';

import {
  Cultivation,
  Watering,
  EnvironmentRecord,
  PhotoRecord,
  Genetics,
  Harvest,
  DiaryEntry,
  WateringProductItem,
  CultivationTask,
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
import {
  CultivationsFilterBar,
  StageFilterCategory,
  CultivationStatusFilter,
  matchesStageFilter,
  isCropFinished,
} from './components/cultivations/CultivationsFilterBar';
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
import { getOverdueCultivations } from './utils/wateringAlertUtils';
import { browserNotificationService } from './services/browserNotificationService';
import { NotificationCenterModal } from './components/notifications/NotificationCenterModal';
import { UserPreferencesModal } from './components/user/UserPreferencesModal';
import { UserProfile } from './types';
import { Sprout, Plus, SlidersHorizontal } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
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
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState(false);
  const [envAlertsCount, setEnvAlertsCount] = useState(0);

  // Notification / Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Loading and Sync states linked to actual Firestore/cache results
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Cultivations List Stage Filter & Search State
  const [cultivationStatusFilter, setCultivationStatusFilter] = useState<CultivationStatusFilter>('active');
  const [stageFilter, setStageFilter] = useState<StageFilterCategory>('all');
  const [cultivationSearchQuery, setCultivationSearchQuery] = useState('');

  const filteredCultivations = useMemo(() => {
    return cultivations
      .filter((crop) => {
        const finished = isCropFinished(crop);
        // Status filter: active / finished / all
        if (cultivationStatusFilter === 'active' && finished) {
          return false;
        }
        if (cultivationStatusFilter === 'finished' && !finished) {
          return false;
        }

        // Stage filter (only applied in 'active' mode)
        if (cultivationStatusFilter === 'active' && !matchesStageFilter(crop, stageFilter)) {
          return false;
        }

        // Search query filter
        if (cultivationSearchQuery.trim()) {
          const q = cultivationSearchQuery.toLowerCase();
          const nameMatch = crop.name.toLowerCase().includes(q);
          const geneticsMatch =
            crop.geneticsName?.toLowerCase().includes(q) ||
            (crop.genetics && crop.genetics.toLowerCase().includes(q));
          const stageMatch = crop.currentStage?.toLowerCase().includes(q);
          const typeMatch = crop.type?.toLowerCase().includes(q);
          if (!nameMatch && !geneticsMatch && !stageMatch && !typeMatch) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        // If showing finished crops, sort newest terminal date first
        if (cultivationStatusFilter === 'finished') {
          const dateA = new Date(a.harvestDate || a.endDate || a.floweringStartDate || a.startDate || 0).getTime();
          const dateB = new Date(b.harvestDate || b.endDate || b.floweringStartDate || b.startDate || 0).getTime();
          return dateB - dateA;
        }
        return 0;
      });
  }, [cultivations, cultivationStatusFilter, stageFilter, cultivationSearchQuery]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Listen for Auth State
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const profile = await authService.getUserProfile(user.uid);
          setUserProfile(profile);
        } catch (e) {
          console.warn('Could not load user profile:', e);
        }
      } else {
        setUserProfile(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 1.1 Iniciar sincronización automática de fotos encoladas en IndexedDB exclusivamente para el UID autenticado
  const currentAuthUid = currentUser?.uid;
  useEffect(() => {
    if (!currentAuthUid) {
      photoOfflineQueue.stopAutoSync();
      return;
    }

    const cleanupAutoSync = photoOfflineQueue.initAutoSync(currentAuthUid);

    const handleSyncedEvent = (e: Event) => {
      const ce = e as CustomEvent<{ syncedCount?: number }>;
      const count = ce.detail?.syncedCount;
      if (count && count > 0) {
        showToast(`📸 ${count} fotografía(s) sincronizada(s) con Firebase.`);
      }
    };

    const handleCropDeleted = (e: Event) => {
      const ce = e as CustomEvent<{ name?: string }>;
      showToast(`🗑️ Cultivo "${ce.detail?.name || ''}" eliminado correctamente.`);
    };

    window.addEventListener('cultiveta_photos_synced', handleSyncedEvent);
    window.addEventListener('cultiveta_cultivation_deleted', handleCropDeleted);

    return () => {
      cleanupAutoSync();
      window.removeEventListener('cultiveta_photos_synced', handleSyncedEvent);
      window.removeEventListener('cultiveta_cultivation_deleted', handleCropDeleted);
    };
  }, [currentAuthUid]);

  // 1.2 Monitoreo y Notificación Automática de Alertas de Riego Overdue
  const notifiedOverdueRef = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUser || cultivations.length === 0) return;

    // Respetar preferencia del usuario sobre si desea recibir alertas de riego
    const alertPrefs = userProfile?.preferences?.alertTypes;
    if (alertPrefs && alertPrefs.wateringAlerts === false) return;

    const overdueList = getOverdueCultivations(cultivations, waterings);
    if (overdueList.length === 0) return;

    // Detectar si hay cultivos con riego Overdue que no hayan sido notificados en la sesión actual
    const unnotified = overdueList.filter(
      (item) => !notifiedOverdueRef.current.has(item.cultivation.id)
    );

    if (unnotified.length > 0) {
      unnotified.forEach((item) => notifiedOverdueRef.current.add(item.cultivation.id));
      const first = unnotified[0];
      if (unnotified.length === 1) {
        showToast(
          `⚠️ Alerta Overdue: "${first.cultivation.name}" superó el ciclo de riego (${first.analysis.recommendedIntervalDays}d en ${first.cultivation.currentStage}).`
        );
      } else {
        showToast(
          `⚠️ Alerta Overdue: ${unnotified.length} cultivos superan el período de riego recomendado.`
        );
      }
    }
  }, [currentUser, cultivations, waterings, userProfile]);

  // 1.3 Inicializar servicio de Notificaciones de Navegador / Push para alertas 'env_alert' del cron job
  useEffect(() => {
    browserNotificationService.init(currentUser?.uid);

    const handleEnvAlert = (e: Event) => {
      // Respetar preferencia del usuario sobre si desea recibir alertas climáticas
      const alertPrefs = userProfile?.preferences?.alertTypes;
      if (alertPrefs && alertPrefs.climateAlerts === false) return;

      const ce = e as CustomEvent<{ task: CultivationTask }>;
      if (ce.detail?.task) {
        setEnvAlertsCount((prev) => prev + 1);
        showToast(`🚨 Alerta Climática recibida: ${ce.detail.task.title}`);
      }
    };

    const handleNotifClicked = (e: Event) => {
      const ce = e as CustomEvent<{ cultivationId?: string }>;
      if (ce.detail?.cultivationId) {
        setSelectedCultivationId(ce.detail.cultivationId);
        setCurrentView('cultivation_detail');
      }
    };

    window.addEventListener('cultiveta_env_alert_received', handleEnvAlert);
    window.addEventListener('cultiveta_notification_clicked', handleNotifClicked);

    return () => {
      window.removeEventListener('cultiveta_env_alert_received', handleEnvAlert);
      window.removeEventListener('cultiveta_notification_clicked', handleNotifClicked);
    };
  }, [currentUser?.uid]);

  // 2. Real-time subscriptions to Firestore and error listener
  useEffect(() => {
    if (!currentUser) {
      setCultivations([]);
      setWaterings([]);
      setEnvRecords([]);
      setPhotos([]);
      setGeneticsList([]);
      setHarvests([]);
      setDiaryEntries([]);
      setIsInitialLoading(false);
      setSyncError(null);
      return;
    }

    setIsInitialLoading(true);
    setSyncError(null);

    let isSubActive = true;

    // Conclude initial loading as soon as core data or confirmed empty state arrives
    const markInitialLoaded = () => {
      if (isSubActive) {
        setIsInitialLoading(false);
      }
    };

    // Safety timeout: prevent infinite skeleton if network socket hangs completely with no cache
    const safetyTimer = setTimeout(() => {
      markInitialLoaded();
    }, 2500);

    const handleListenerError = (e: Event) => {
      const ce = e as CustomEvent<{ collection?: string; code?: string; message?: string }>;
      if (ce.detail?.message && isSubActive) {
        setSyncError(ce.detail.message);
        showToast(`⚠️ ${ce.detail.message}`);
        markInitialLoaded();
      }
    };

    window.addEventListener('cultiveta_listener_error', handleListenerError);

    const unsubCultivations = cultivationService.subscribeCultivations(
      currentUser.uid,
      (list) => {
        setCultivations(list);
        markInitialLoaded();
      }
    );
    const unsubWaterings = wateringService.subscribeWaterings(
      currentUser.uid,
      (list) => {
        setWaterings(list);
        markInitialLoaded();
      }
    );
    const unsubEnv = environmentService.subscribeEnvironment(
      currentUser.uid,
      (list) => {
        setEnvRecords(list);
        markInitialLoaded();
      }
    );
    const unsubPhotos = photoService.subscribePhotos(
      currentUser.uid,
      (list) => {
        setPhotos(list);
      }
    );
    const unsubGenetics = geneticsService.subscribeGenetics(
      currentUser.uid,
      (list) => {
        setGeneticsList(list);
      }
    );
    const unsubHarvests = harvestService.subscribeHarvests(
      currentUser.uid,
      (list) => {
        setHarvests(list);
      }
    );
    const unsubDiary = diaryService.subscribeDiary(
      currentUser.uid,
      (list) => {
        setDiaryEntries(list);
      }
    );

    return () => {
      isSubActive = false;
      clearTimeout(safetyTimer);
      window.removeEventListener('cultiveta_listener_error', handleListenerError);
      unsubCultivations();
      unsubWaterings();
      unsubEnv();
      unsubPhotos();
      unsubGenetics();
      unsubHarvests();
      unsubDiary();
    };
  }, [currentUser?.uid]);

  // Handle Real Refresh / Resync Action without fake timers or hiding the screen
  const handleRefreshData = async () => {
    if (isSyncing || !currentUser) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      // 1. Iniciar el procesamiento de la cola de fotos en segundo plano de forma desacoplada,
      // sin bloquear la interfaz ni esperar que todas las confirmaciones remotas de setDoc finalicen.
      photoOfflineQueue.triggerProcessing(currentUser.uid);

      // 2. Actualizar registros meteorológicos del servidor
      await environmentService.fetchServerRecords(currentUser.uid);

      showToast('Actualizando datos con el servidor...');
    } catch (err: any) {
      console.warn('Sync error:', err);
      setSyncError('Error al sincronizar con el servidor.');
      showToast('Modo sin conexión: mostrando datos locales.');
    } finally {
      setIsSyncing(false);
    }
  };

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
    if (currentUser?.uid) {
      localStore.clearUserData(currentUser.uid);
    }
    setCultivations([]);
    setWaterings([]);
    setEnvRecords([]);
    setPhotos([]);
    setGeneticsList([]);
    setHarvests([]);
    setDiaryEntries([]);
    await authService.signOutUser();
    setCurrentView('dashboard');
    setSelectedCultivationId(null);
  };

  const selectedCultivation = cultivations.find((c) => c.id === selectedCultivationId);

  // Authentication Loading Screen
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FFF8E8] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-3xl bg-white border border-[#EFE3CF] shadow-md flex items-center justify-center text-3xl transition-transform animate-bounce">
            🌱
          </div>
          <span className="text-xl font-black text-[#29202F] tracking-tight">Cultiveta</span>
          <p className="text-xs font-bold text-[#6E5D77]">Preparando tu cultivo...</p>
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
    <div className="min-h-screen bg-[#FFF8E8] text-[#29202F] flex flex-col selection:bg-[#6C45C7] selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 px-5 py-3 rounded-2xl bg-white text-[#29202F] text-xs font-bold shadow-xl border border-[#EFE3CF] animate-in slide-in-from-top duration-200 flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#62B95B] animate-ping" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <Header
        currentUser={currentUser}
        userProfile={userProfile}
        onOpenQuickAction={() => setIsQuickActionOpen(true)}
        onOpenPreferences={() => setIsPreferencesModalOpen(true)}
        onOpenNotifications={() => setIsNotificationCenterOpen(true)}
        notificationCount={envAlertsCount}
        onLogout={handleLogout}
        onSeedDemoData={handleSeedDemoData}
        onClearDemoData={handleClearDemoData}
        onNavigate={(view) => {
          if (view === 'profile' || view === 'preferences') {
            setIsPreferencesModalOpen(true);
          } else {
            setCurrentView(view as any);
          }
        }}
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
              geneticsList={geneticsList}
              userProfile={userProfile}
              userId={currentUser.uid}
              isLoading={isInitialLoading}
              isSyncing={isSyncing}
              syncError={syncError}
              onRefreshData={handleRefreshData}
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
                notifiedOverdueRef.current.delete(w.cultivationId);
              }}
              onTaskCompletedFeedback={(msg) => {
                showToast(msg);
              }}
            />
          )}

          {/* VIEW: CULTIVATIONS LIST */}
          {currentView === 'cultivations' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-white rounded-[32px] p-6 sm:p-8 border border-[#EFE3CF] shadow-xs relative overflow-hidden">
                <div className="relative z-10">
                  <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#9887A2] mb-1 block">Gestión de Salas</span>
                  <h2 className="font-extrabold text-2xl text-[#29202F]">Mis Cultivos 🌱</h2>
                  <p className="text-xs text-[#6E5D77] mt-1">
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
                  className="relative z-10 px-6 py-3 rounded-2xl bg-[#62B95B] hover:bg-[#52A54C] text-white text-xs font-bold transition-all shadow-md shadow-[#62B95B]/20 flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-white stroke-[2.5]" />
                  <span>Nuevo Cultivo</span>
                </button>
              </div>

              {cultivations.length > 0 && (
                <CultivationsFilterBar
                  statusFilter={cultivationStatusFilter}
                  onStatusFilterChange={setCultivationStatusFilter}
                  activeFilter={stageFilter}
                  onFilterChange={setStageFilter}
                  searchQuery={cultivationSearchQuery}
                  onSearchChange={setCultivationSearchQuery}
                  cultivations={cultivations}
                  totalFilteredCount={filteredCultivations.length}
                />
              )}

              {cultivations.length === 0 ? (
                <div className="bg-white rounded-[32px] p-12 border border-[#EFE3CF] text-center space-y-4 shadow-xs">
                  <div className="w-16 h-16 rounded-2xl bg-[#FAF2E1] border border-[#EFE3CF] text-[#62B95B] flex items-center justify-center mx-auto">
                    <Sprout className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#29202F] text-base">Todavía no anotaste ningún cultivo.</h3>
                    <p className="text-xs text-[#6E5D77] max-w-sm mx-auto mt-1">
                      Creá tu primer cultivo para empezar a registrar riegos, parámetros y fotografías.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCultivationToEdit(null);
                      setIsCultivationFormOpen(true);
                    }}
                    className="px-6 py-3 rounded-2xl bg-[#62B95B] hover:bg-[#52A54C] text-white font-bold text-xs transition-all shadow-lg shadow-[#62B95B]/20 cursor-pointer inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    Crear cultivo
                  </button>
                </div>
              ) : filteredCultivations.length === 0 ? (
                <div className="bg-white rounded-[32px] p-10 border border-[#EFE3CF] text-center space-y-4 shadow-xs">
                  <div className="w-12 h-12 rounded-2xl bg-[#FAF2E1] border border-[#EFE3CF] text-[#9887A2] flex items-center justify-center mx-auto">
                    <SlidersHorizontal className="w-6 h-6" />
                  </div>
                  <div>
                    {cultivationSearchQuery.trim() ? (
                      <>
                        <h3 className="font-bold text-[#29202F] text-base">No hay cultivos que coincidan</h3>
                        <p className="text-xs text-[#6E5D77] max-w-sm mx-auto mt-1">
                          No encontramos plantas con el término &quot;<strong className="text-[#29202F]">{cultivationSearchQuery}</strong>&quot;.
                        </p>
                        <button
                          type="button"
                          onClick={() => setCultivationSearchQuery('')}
                          className="mt-3 px-4 py-2 rounded-xl bg-[#FAF2E1] hover:bg-[#EFE3CF] text-[#29202F] font-semibold text-xs transition-colors cursor-pointer inline-flex items-center gap-2"
                        >
                          Limpiar búsqueda
                        </button>
                      </>
                    ) : cultivationStatusFilter === 'active' ? (
                      <>
                        <h3 className="font-bold text-[#29202F] text-base">No tenés cultivos activos ahora.</h3>
                        <p className="text-xs text-[#6E5D77] max-w-sm mx-auto mt-1">
                          Podés iniciar una nueva carpa o revisar tus cultivos finalizados.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setCultivationToEdit(null);
                            setIsCultivationFormOpen(true);
                          }}
                          className="mt-3 px-5 py-2.5 rounded-2xl bg-[#62B95B] hover:bg-[#52A54C] text-white font-bold text-xs transition-all shadow-md shadow-[#62B95B]/20 cursor-pointer inline-flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4 stroke-[2.5]" />
                          Crear cultivo
                        </button>
                      </>
                    ) : cultivationStatusFilter === 'finished' ? (
                      <>
                        <h3 className="font-bold text-[#29202F] text-base">Todavía no terminaste ningún cultivo.</h3>
                        <p className="text-xs text-[#6E5D77] max-w-sm mx-auto mt-1">
                          Cuando coseches un cultivo activo, aparecerá registrado aquí con su historial.
                        </p>
                      </>
                    ) : (
                      <>
                        <h3 className="font-bold text-[#29202F] text-base">Todavía no anotaste ningún cultivo.</h3>
                        <p className="text-xs text-[#6E5D77] max-w-sm mx-auto mt-1">
                          Iniciá tu primer cultivo para comenzar el seguimiento.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setCultivationToEdit(null);
                            setIsCultivationFormOpen(true);
                          }}
                          className="mt-3 px-5 py-2.5 rounded-2xl bg-[#62B95B] hover:bg-[#52A54C] text-white font-bold text-xs transition-all shadow-md shadow-[#62B95B]/20 cursor-pointer inline-flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4 stroke-[2.5]" />
                          Crear cultivo
                        </button>
                      </>
                    )}
                  </div>
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
                geneticsList={geneticsList}
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
              userProfile={userProfile}
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
              geneticsList={geneticsList}
              photos={photos}
              diaryEntries={diaryEntries}
              harvests={harvests}
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
            notifiedOverdueRef.current.delete(w.cultivationId);
            showToast('💧 Riego registrado con éxito. ¡Alerta Overdue resuelta!');
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
            if (photo.syncStatus === 'queued' || photo.isPendingSync) {
              showToast('📸 Fotografía guardada localmente (se sincronizará al conectar).');
            } else {
              showToast('📸 Fotografía guardada y sincronizada en la nube.');
            }
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
          geneticsList={geneticsList}
          onEventSynced={() => {
            showToast('Evento sincronizado con Google Calendar');
          }}
        />
      )}

      {/* Notification Center Modal for env_alert cron alerts */}
      {isNotificationCenterOpen && (
        <NotificationCenterModal
          isOpen={isNotificationCenterOpen}
          onClose={() => {
            setIsNotificationCenterOpen(false);
            setEnvAlertsCount(0);
          }}
          userId={currentUser.uid}
          onSelectCultivation={(cropId) => {
            setSelectedCultivationId(cropId);
            setCurrentView('cultivation_detail');
          }}
          onOpenPreferences={() => {
            setIsNotificationCenterOpen(false);
            setIsPreferencesModalOpen(true);
          }}
        />
      )}

      {/* User Preferences & Alert Types Configuration Modal */}
      {isPreferencesModalOpen && (
        <UserPreferencesModal
          isOpen={isPreferencesModalOpen}
          onClose={() => setIsPreferencesModalOpen(false)}
          userProfile={userProfile}
          onPreferencesUpdated={(newPrefs) => {
            setUserProfile((prev) =>
              prev
                ? { ...prev, preferences: newPrefs }
                : {
                    uid: currentUser?.uid || '',
                    email: currentUser?.email || '',
                    displayName: currentUser?.displayName || 'Cultivador',
                    createdAt: new Date().toISOString(),
                    preferences: newPrefs,
                  }
            );
          }}
          onShowToast={showToast}
        />
      )}
    </div>
  );
}
