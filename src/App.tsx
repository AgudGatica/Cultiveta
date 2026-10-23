import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { User } from 'firebase/auth';
import { AppView, isLegacyHarvestsPath, parseAppRoute, pathForView } from './appRoutes';
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
import { CultivationFormModal } from './components/cultivations/CultivationFormModal';
import { getDetailBackTarget, getNavHighlight, isCropFinished } from './utils/cropCardInfo';
import { WateringModal } from './components/logs/WateringModal';
import { EnvironmentModal } from './components/logs/EnvironmentModal';
import { PhotoUploadModal } from './components/logs/PhotoUploadModal';
import { DiaryNoteModal } from './components/logs/DiaryNoteModal';
import { getOverdueCultivations } from './utils/wateringAlertUtils';
import { calculateIrrigationForecast } from './services/irrigationForecastService';
import { browserNotificationService } from './services/browserNotificationService';
import { NotificationCenterModal } from './components/notifications/NotificationCenterModal';
import { UserPreferencesModal } from './components/user/UserPreferencesModal';
import { AccountModal } from './components/user/AccountModal';
import { UserProfile } from './types';
import { useGrowerProgress } from './hooks/useGrowerProgress';
import { CelebrationLayer } from './components/profile/CelebrationLayer';
import { Sprout } from 'lucide-react';

// Pantallas y modales pesados con carga diferida: se descargan recién cuando se abren.
const CultivationDetailView = React.lazy(() =>
  import('./components/cultivations/CultivationDetailView').then((m) => ({ default: m.CultivationDetailView }))
);
const GeneticsLibraryView = React.lazy(() =>
  import('./components/genetics/GeneticsLibraryView').then((m) => ({ default: m.GeneticsLibraryView }))
);
const FinishedCropsView = React.lazy(() =>
  import('./components/cultivations/FinishedCropsView').then((m) => ({ default: m.FinishedCropsView }))
);
const CropComparisonView = React.lazy(() =>
  import('./components/harvests/CropComparisonView').then((m) => ({ default: m.CropComparisonView }))
);
const AIAssistantView = React.lazy(() =>
  import('./components/ai/AIAssistantView').then((m) => ({ default: m.AIAssistantView }))
);
const CalculatorsView = React.lazy(() =>
  import('./components/tools/CalculatorsView').then((m) => ({ default: m.CalculatorsView }))
);
const PhotoDiagnosisModal = React.lazy(() =>
  import('./components/ai/PhotoDiagnosisModal').then((m) => ({ default: m.PhotoDiagnosisModal }))
);
const ProfileView = React.lazy(() => import('./components/profile/ProfileView'));
const AchievementsView = React.lazy(() => import('./components/profile/AchievementsView'));
const GoogleCalendarModal = React.lazy(() =>
  import('./components/calendar/GoogleCalendarModal').then((m) => ({ default: m.GoogleCalendarModal }))
);

const ViewLoading: React.FC = () => (
  <div role="status" className="cultiveta-card p-8 text-center text-sm font-semibold text-ink-muted">
    Cargando...
  </div>
);

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Navegación: la pantalla actual sale de la URL (react-router), así funcionan el botón
  // "atrás" de Android y los enlaces directos. setCurrentView navega a la URL de la pantalla.
  const location = useLocation();
  const navigate = useNavigate();
  const route = useMemo(() => parseAppRoute(location.pathname), [location.pathname]);
  const currentView: AppView = route.view;

  // El cultivo seleccionado también se usa como contexto de los modales (riego, foto, etc.),
  // por eso sigue siendo estado; en /cultivos/:id se sincroniza con la URL.
  const [selectedCultivationId, setSelectedCultivationIdState] = useState<string | null>(route.cultivationId);
  const latestSelectedIdRef = React.useRef<string | null>(route.cultivationId);
  const setSelectedCultivationId = React.useCallback((id: string | null) => {
    latestSelectedIdRef.current = id;
    setSelectedCultivationIdState(id);
  }, []);

  useEffect(() => {
    if (route.cultivationId && route.cultivationId !== latestSelectedIdRef.current) {
      setSelectedCultivationId(route.cultivationId);
    }
  }, [route.cultivationId, setSelectedCultivationId]);

  // Cosechas se unió con Cultivos: los enlaces viejos a /cosechas llevan a /cultivos
  useEffect(() => {
    if (isLegacyHarvestsPath(location.pathname)) {
      navigate('/cultivos', { replace: true });
    }
  }, [location.pathname, navigate]);

  // Ruta desconocida: se muestra el Inicio y se corrige la URL (sin sumar una entrada al historial)
  useEffect(() => {
    if (route.view === 'dashboard' && location.pathname !== '/') {
      navigate('/', { replace: true });
    }
  }, [route.view, location.pathname, navigate]);

  const setCurrentView = React.useCallback(
    (view: string) => {
      const target =
        view === 'cultivation_detail'
          ? latestSelectedIdRef.current
            ? `/cultivos/${encodeURIComponent(latestSelectedIdRef.current)}`
            : '/cultivos'
          : pathForView(view);
      if (target !== location.pathname) navigate(target);
    },
    [navigate, location.pathname]
  );
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
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [envAlertsCount, setEnvAlertsCount] = useState(0);

  // Notification / Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Loading and Sync states linked to actual Firestore/cache results
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Nivel, XP, logros y racha: se calculan de los datos en vivo; los festejos salen de comparar cambios.
  const progressData = useMemo(
    () => ({ cultivations, waterings, environmentRecords: envRecords, photos, diaryEntries, harvests }),
    [cultivations, waterings, envRecords, photos, diaryEntries, harvests]
  );
  const growerProgress = useGrowerProgress(currentUser?.uid, progressData, Boolean(currentUser) && !isInitialLoading);

  // ─────────────────────────────────────────────────────────────
  // CULTIVETA DESIGN SYSTEM: ATMÓSFERA VISUAL SEGÚN VIEW ACTIVA
  // ─────────────────────────────────────────────────────────────
  const pageAtmosphereClass = useMemo(() => {
    switch (currentView) {
      case 'dashboard':
        return 'cultiveta-page-home';
      case 'cultivations':
      case 'cultivation_detail':
        return 'cultiveta-page-cultivations';
      case 'genetics':
        return 'cultiveta-page-genetics';
      case 'ai_assistant':
        return 'cultiveta-page-ai';
      default:
        return 'cultiveta-page-default';
    }
  }, [currentView]);

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

    const overdueList = getOverdueCultivations(cultivations, waterings, new Date(), (crop) =>
      calculateIrrigationForecast(crop, waterings, envRecords)
    );
    if (overdueList.length === 0) return;

    // Detectar si hay cultivos con riego Overdue que no hayan sido notificados en la sesión actual
    const unnotified = overdueList.filter(
      (item) => !notifiedOverdueRef.current.has(item.cultivation.id)
    );

    if (unnotified.length > 0) {
      unnotified.forEach((item) => notifiedOverdueRef.current.add(item.cultivation.id));
      const first = unnotified[0];
      if (unnotified.length === 1) {
        showToast(`"${first.cultivation.name}": ${first.analysis.label}`);
      } else {
        showToast(`Riego atrasado en ${unnotified.length} cultivos: pasó la ventana estimada de revisión.`);
      }
    }
  }, [currentUser, cultivations, waterings, envRecords, userProfile]);

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
  // Activo → vuelve al Inicio y se resalta Inicio; terminado → Cultivos.
  const detailBackTarget = getDetailBackTarget(selectedCultivation);
  const navHighlight = getNavHighlight(currentView, selectedCultivation);

  // Authentication Loading Screen
  if (authLoading) {
    return (
      <div className="min-h-screen cultiveta-page-background flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-3xl bg-white border border-chip-line shadow-md flex items-center justify-center text-3xl transition-transform animate-bounce">
            🌱
          </div>
          <span className="text-xl font-black text-ink tracking-tight">Cultiveta</span>
          <p className="text-xs font-bold text-ink-muted">Preparando tu cultivo...</p>
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
    <div className="cultiveta-app-shell text-ink flex flex-col selection:bg-brand selection:text-white">
      {/* Capa de fondo fija: degradado vertical "Océano" (tokens --color-ocean-* en index.css) */}
      <div aria-hidden="true" className="cultiveta-page-background" />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 px-5 py-3 rounded-2xl bg-white text-ink text-xs font-bold shadow-xl border border-chip-line animate-in slide-in-from-top duration-200 flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-ok animate-ping" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <Header
        currentUser={currentUser}
        userProfile={userProfile}
        onOpenQuickAction={() => setIsQuickActionOpen(true)}
        onOpenPreferences={() => setIsPreferencesModalOpen(true)}
        onOpenAccount={() => setIsAccountModalOpen(true)}
        onOpenNotifications={() => setIsNotificationCenterOpen(true)}
        notificationCount={envAlertsCount}
        onLogout={handleLogout}
        onSeedDemoData={handleSeedDemoData}
        onClearDemoData={handleClearDemoData}
        onNavigate={(view) => {
          if (view === 'preferences') {
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
          currentView={navHighlight}
          onNavigate={(view) => {
            setCurrentView(view);
            if (view !== 'cultivation_detail') {
              setSelectedCultivationId(null);
            }
          }}
          onOpenQuickAction={() => setIsQuickActionOpen(true)}
          cultivationsCount={cultivations.filter(isCropFinished).length}
          geneticsCount={geneticsList.length}
        />

        {/* Content Area */}
        <main className="flex-1 min-w-0 pb-24 md:pb-8">
          <React.Suspense fallback={<ViewLoading />}>
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
              progress={growerProgress.progress}
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
              onTaskCompletedFeedback={(msg) => {
                showToast(msg);
              }}
            />
          )}

          {/* VIEW: CULTIVOS (terminados + cosechas) */}
          {currentView === 'cultivations' && (
            <FinishedCropsView
              cultivations={cultivations}
              harvests={harvests}
              photos={photos}
              userId={currentUser.uid}
              onOpenCultivation={(crop) => {
                setSelectedCultivationId(crop.id);
                setCurrentView('cultivation_detail');
              }}
              onNavigateToCompare={(cropAId) => {
                setComparisonCropAId(cropAId);
                setCurrentView('compare_crops');
              }}
              onHarvestUpdated={(updated) => {
                setHarvests((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
              }}
            />
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
                backLabel={detailBackTarget === 'cultivations' ? 'Volver a Cultivos' : 'Volver al Inicio'}
                onBack={() => {
                  setSelectedCultivationId(null);
                  setCurrentView(detailBackTarget);
                }}
                onEditCultivation={(crop) => {
                  setCultivationToEdit(crop);
                  setIsCultivationFormOpen(true);
                }}
                onDeleteCultivation={async (cropId) => {
                  await cultivationService.deleteCultivation(cropId);
                  showToast('Cultivo eliminado.');
                  setSelectedCultivationId(null);
                  setCurrentView(detailBackTarget);
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
                  setCurrentView('cultivations');
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
              <div className="cultiveta-card p-12 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-icon-bg text-brand flex items-center justify-center mx-auto">
                  <Sprout className="w-6 h-6 animate-pulse" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-bold text-ink text-base">Cargando cultivo...</h3>
                  <p className="text-xs text-ink-muted max-w-sm mx-auto mt-1">
                    Cargando la información del cultivo seleccionado.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentView('dashboard')}
                  className="cultiveta-btn-secondary text-xs"
                >
                  Volver al Inicio
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
          {/* VIEW: CROP COMPARISON */}
          {currentView === 'compare_crops' && (
            <CropComparisonView
              cultivations={cultivations}
              harvests={harvests}
              envRecords={envRecords}
              waterings={waterings}
              initialCropAId={comparisonCropAId}
              initialCropBId={comparisonCropBId}
              onBack={() => setCurrentView('cultivations')}
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

          {/* VIEW: PERFIL Y LOGROS */}
          {currentView === 'profile' && (
            <ProfileView
              currentUser={currentUser}
              userProfile={userProfile}
              progress={growerProgress.progress}
              onOpenAchievements={() => setCurrentView('achievements')}
              onProfileUpdated={(info) => setUserProfile((prev) => (prev ? { ...prev, ...info } : prev))}
              showToast={showToast}
            />
          )}
          {currentView === 'achievements' && (
            <AchievementsView
              progress={growerProgress.progress}
              badgeDates={growerProgress.badgeDates}
              onBack={() => setCurrentView('profile')}
            />
          )}
          </React.Suspense>
        </main>
      </div>

      {/* Festejos de nivel y logros, y avisos de XP */}
      <CelebrationLayer
        celebrations={growerProgress.celebrations}
        onDismissCelebration={growerProgress.dismissCelebration}
        xpToasts={growerProgress.xpToasts}
        onDismissXpToast={growerProgress.dismissXpToast}
        onOpenAchievements={() => setCurrentView('achievements')}
      />

      {/* Mobile Bottom Navigation */}
      <MobileNav
        currentView={navHighlight}
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
            showToast('💧 Riego registrado con éxito. ¡Alerta de riego atrasado resuelta!');
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

      <React.Suspense fallback={null}>
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
      </React.Suspense>

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

      {/* Tus datos y tu cuenta: exportación y borrado completo */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        onAccountDeleted={() => {
          setIsAccountModalOpen(false);
          setCultivations([]);
          setWaterings([]);
          setEnvRecords([]);
          setPhotos([]);
          setGeneticsList([]);
          setHarvests([]);
          setDiaryEntries([]);
          setCurrentView('dashboard');
          setSelectedCultivationId(null);
          showToast('Tu cuenta y todos tus datos fueron eliminados.');
        }}
      />

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
