import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { User } from 'firebase/auth';
import { AppView, isLegacyHarvestsPath, parseAppRoute, pathForGenetic, pathForGrower, pathForGrowlog, pathForIndoor, pathForView } from './appRoutes';
import { authService } from './services/authService';
import { cultivationService } from './services/cultivationService';
import { wateringService } from './services/wateringService';
import { environmentService } from './services/environmentService';
import { photoService } from './services/photoService';
import { geneticsService } from './services/geneticsService';
import { harvestService } from './services/harvestService';
import { diaryService } from './services/diaryService';
import { photoOfflineQueue } from './services/photoOfflineQueue';
import { localStore } from './services/localStore';
import { scrollToTop, useScrollTopOnNavigate } from './hooks/useScrollTopOnNavigate';
import { communityService } from './services/communityService';

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
  Indoor,
} from './types';

import { Header } from './components/common/Header';
import { Sidebar } from './components/common/Sidebar';
import { MobileNav } from './components/common/MobileNav';
import { LazyBoundary, LazyModal, ViewLoadError, lazyNamed, preloadWhenIdle, useOpenedOnce } from './components/common/LazyLoad';

import { DashboardOverview } from './components/dashboard/DashboardOverview';
import { getDetailBackTarget, getNavHighlight, isCropFinished } from './utils/cropCardInfo';
import { getOverdueCultivations } from './utils/wateringAlertUtils';
import { calculateIrrigationForecast } from './services/irrigationForecastService';
import { browserNotificationService } from './services/browserNotificationService';
import { UserProfile } from './types';
import { useGrowerProgress } from './hooks/useGrowerProgress';
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
const DevicesView = React.lazy(() => import('./components/devices/DevicesView'));
const AmbientDetailView = React.lazy(() => import('./components/indoors/AmbientDetailView'));
const GeneticDetailView = React.lazy(() => import('./components/indoors/GeneticDetailView'));
const CommunityView = React.lazy(() => import('./components/community/CommunityView').then((m) => ({ default: m.CommunityView })));
const GrowlogView = React.lazy(() => import('./components/community/GrowlogView').then((m) => ({ default: m.GrowlogView })));
const GrowerView = React.lazy(() => import('./components/community/GrowerView').then((m) => ({ default: m.GrowerView })));
const AdminReportsView = React.lazy(() => import('./components/community/AdminReportsView').then((m) => ({ default: m.AdminReportsView })));
import { devicesService, scheduleSnapshot, sameSchedule, useDevicesOverview } from './services/devicesService';
import { indoorService } from './services/indoorService';
import { autoAmbientId, cropsWithoutAmbient, withIndoorLighting } from './utils/indoors';
import { normalizeCultivationStages } from './utils/growthStageUtils';
const PhotoDiagnosisModal = React.lazy(() =>
  import('./components/ai/PhotoDiagnosisModal').then((m) => ({ default: m.PhotoDiagnosisModal }))
);
const ProfileView = React.lazy(() => import('./components/profile/ProfileView'));
const AchievementsView = React.lazy(() => import('./components/profile/AchievementsView'));
const GoogleCalendarModal = React.lazy(() =>
  import('./components/calendar/GoogleCalendarModal').then((m) => ({ default: m.GoogleCalendarModal }))
);

// Modales, festejos y la pantalla de ingreso: no hacen falta para abrir el Jardín, se bajan la primera vez que
// se usan. Los de uso diario también se bajan solos un rato después de entrar (ver DAILY_MODALS).
const QuickActionModal = lazyNamed(() => import('./components/common/QuickActionModal'), 'QuickActionModal');
const WateringModal = lazyNamed(() => import('./components/logs/WateringModal'), 'WateringModal');
const EnvironmentModal = lazyNamed(() => import('./components/logs/EnvironmentModal'), 'EnvironmentModal');
const PhotoUploadModal = lazyNamed(() => import('./components/logs/PhotoUploadModal'), 'PhotoUploadModal');
const DiaryNoteModal = lazyNamed(() => import('./components/logs/DiaryNoteModal'), 'DiaryNoteModal');
const CultivationFormModal = lazyNamed(() => import('./components/cultivations/CultivationFormModal'), 'CultivationFormModal');
const AmbientFormModal = lazyNamed(() => import('./components/indoors/AmbientFormModal'), 'AmbientFormModal');
const CelebrationLayer = lazyNamed(() => import('./components/profile/CelebrationLayer'), 'CelebrationLayer');
const NotificationCenterModal = lazyNamed(() => import('./components/notifications/NotificationCenterModal'), 'NotificationCenterModal');
const UserPreferencesModal = lazyNamed(() => import('./components/user/UserPreferencesModal'), 'UserPreferencesModal');
const AccountModal = lazyNamed(() => import('./components/user/AccountModal'), 'AccountModal');
const AuthScreen = lazyNamed(() => import('./components/auth/AuthScreen'), 'AuthScreen');
const loadDemoData = () => import('./services/demoDataService').then((m) => m.demoDataService);

// Se bajan en segundo plano después de entrar: abren al instante y también sin conexión.
const DAILY_MODALS = [
  QuickActionModal,
  WateringModal,
  EnvironmentModal,
  PhotoUploadModal,
  DiaryNoteModal,
  CultivationFormModal,
  AmbientFormModal,
  CelebrationLayer,
];

const ViewLoading: React.FC = () => (
  <div role="status" className="cultiveta-card p-8 text-center text-sm font-semibold text-ink-muted">
    Cargando...
  </div>
);

const AppSplash: React.FC = () => (
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
  useScrollTopOnNavigate();

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
      // Tocar la pestaña en la que ya estás la lleva arriba de todo
      if (target !== location.pathname) navigate(target);
      else scrollToTop(true);
    },
    [navigate, location.pathname]
  );
  const [comparisonCropAId, setComparisonCropAId] = useState<string | undefined>(undefined);
  const [comparisonCropBId, setComparisonCropBId] = useState<string | undefined>(undefined);
  // Equipos: desde dónde se llegó (la luz, el ambiente o el riego de un cultivo) para resaltarlo
  const [devicesFocus, setDevicesFocus] = useState<'luz' | 'ambiente' | 'riego' | null>(null);
  const openDevices = React.useCallback((focus: 'luz' | 'ambiente' | 'riego' | null) => {
    setDevicesFocus(focus);
    setCurrentView('devices');
  }, [setCurrentView]);
  useEffect(() => {
    if (currentView !== 'devices') setDevicesFocus(null);
  }, [currentView]);

  // Data Collections
  const [rawCultivations, setCultivations] = useState<Cultivation[]>([]);
  // Indoors (carpas): los cultivos de adentro usan la luz del indoor.
  const [indoors, setIndoors] = useState<Indoor[]>([]);
  // Prefloración y Maduración ya no son etapas: los cultivos guardados así se leen con la floración desde el 12/12
  const cultivations = React.useMemo(() => withIndoorLighting(rawCultivations.map(normalizeCultivationStages), indoors), [rawCultivations, indoors]);
  const [isIndoorFormOpen, setIsIndoorFormOpen] = useState(false);
  const [indoorToEdit, setIndoorToEdit] = useState<Indoor | null>(null);
  // Nuevo cultivo pedido desde un indoor: arranca adentro
  const [newCropIndoorId, setNewCropIndoorId] = useState<string | null>(null);
  const openIndoor = React.useCallback((id: string) => navigate(pathForIndoor(id)), [navigate]);
  const selectedIndoor = route.indoorId ? indoors.find((i) => i.id === route.indoorId) || null : null;
  const geneticCrop = currentView === 'genetic_detail' && route.cultivationId ? cultivations.find((c) => c.id === route.cultivationId) || null : null;
  // Ya llegaron del servidor los cultivos y los ambientes (no solo lo guardado en este dispositivo)
  const [serverLoaded, setServerLoaded] = useState({ crops: false, ambients: false });
  const autoAmbientRef = React.useRef(new Set<string>());
  const [waterings, setWaterings] = useState<Watering[]>([]);
  const [envRecords, setEnvRecords] = useState<EnvironmentRecord[]>([]);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [geneticsList, setGeneticsList] = useState<Genetics[]>([]);
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);

  // Comunidad: si un cultivo compartido cambia (un riego, una foto, una nota, la etapa), su growlog se
  // actualiza solo en un rato. Se compara una "firma" de cada cultivo para no avisar de más.
  const growlogSignatures = React.useRef(new Map<string, string>());
  useEffect(() => {
    if (!currentUser) {
      growlogSignatures.current.clear();
      return;
    }
    const sig = new Map<string, string>();
    const add = (id: string, part: string) => sig.set(id, (sig.get(id) || '') + part);
    for (const c of rawCultivations) add(c.id, `c${c.updatedAt}|${c.currentStage}|`);
    for (const w of waterings) add(w.cultivationId, `w${w.id}`);
    for (const p of photos) if (!p.isPendingSync) add(p.cultivationId, `p${p.id}`);
    for (const d of diaryEntries) add(d.cultivationId, `d${d.id}${d.updatedAt}`);
    const before = growlogSignatures.current;
    if (before.size) sig.forEach((v, id) => before.get(id) !== v && communityService.refreshSoon(id));
    growlogSignatures.current = sig;
  }, [currentUser, rawCultivations, waterings, photos, diaryEntries]);

  // Equipos: estado de lo asignado (luz y sensores). Se lee al entrar y cada minuto mientras se mira
  // un cultivo, un ambiente o Equipos.
  const devicesOverview = useDevicesOverview();
  useEffect(() => {
    if (!currentUser) {
      devicesService.reset();
      communityService.reset();
      return undefined;
    }
    devicesService.refreshOverview();
    if (currentView !== 'cultivation_detail' && currentView !== 'devices' && currentView !== 'indoor_detail') return undefined;
    const id = window.setInterval(() => devicesService.refreshOverview(), 60_000);
    return () => window.clearInterval(id);
  }, [currentUser, currentView]);
  // Si cambia el horario de la luz de un cultivo o indoor con enchufe (hora de encendido o fotoperiodo), se
  // vuelve a cargar en Smart Life; la bomba también lo recibe (riego con la luz, de noche no riega por
  // humedad). Se recuerda lo último mandado para no repetirlo.
  const pushedSchedules = React.useRef<Record<string, string>>({});
  useEffect(() => {
    devicesOverview.bindings
      .filter((b) => b.role === 'light' || b.role === 'pump')
      .forEach((b) => {
        // la luz de un indoor es la suya; un cultivo dentro de un indoor ya trae la luz del indoor
        const owner = b.targetKind === 'indoor' ? indoors.find((i) => i.id === b.cultivationId) : cultivations.find((c) => c.id === b.cultivationId);
        if (!owner) return;
        const snap = scheduleSnapshot(owner);
        if (sameSchedule(snap, b.schedule ?? null)) return;
        const key = JSON.stringify(snap);
        if (pushedSchedules.current[b.id] === key) return;
        pushedSchedules.current[b.id] = key;
        devicesService
          .pushSchedule(b.cultivationId, snap)
          .then(() => devicesService.refreshOverview())
          .catch(() => {
            delete pushedSchedules.current[b.id];
          });
      });
  }, [cultivations, indoors, devicesOverview]);

  // Cada cultivo activo sin ambiente recibe uno con su nombre (interior o exterior). Se hace recién con
  // los datos del servidor y con un id fijo por cultivo: así no se duplica aunque se abra en dos lados.
  useEffect(() => {
    if (!currentUser || !serverLoaded.crops || !serverLoaded.ambients) return;
    for (const crop of cropsWithoutAmbient(rawCultivations)) {
      if (autoAmbientRef.current.has(crop.id)) continue;
      autoAmbientRef.current.add(crop.id);
      const existing = indoors.find((i) => i.id === autoAmbientId(crop.id));
      const job = existing
        ? cultivationService.updateCultivation(crop.id, { indoorId: existing.id }, currentUser.uid)
        : indoorService.createAmbientForCrop(crop, currentUser.uid);
      Promise.resolve(job).catch(() => autoAmbientRef.current.delete(crop.id));
    }
  }, [currentUser, serverLoaded, rawCultivations, indoors]);

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
  // Estos dos quedaban siempre montados: ahora se bajan al abrirlos por primera vez y después siguen montados
  const quickActionOpened = useOpenedOnce(isQuickActionOpen);
  const accountModalOpened = useOpenedOnce(isAccountModalOpen);

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
  // Los festejos se bajan con el primero y después quedan montados (así se animan también al irse)
  const celebrationsOpened = useOpenedOnce(growerProgress.celebrations.length > 0 || growerProgress.xpToasts.length > 0);

  useEffect(() => {
    if (!currentUser?.uid) return undefined;
    return preloadWhenIdle(DAILY_MODALS.map((modal) => modal.preload));
  }, [currentUser?.uid]);

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
      const ce = e as CustomEvent<{ cultivationId?: string; url?: string }>;
      // Avisos al celular: cada uno trae a dónde lleva (el cultivo, Equipos, la Comunidad…)
      if (ce.detail?.url && ce.detail.url.startsWith('/')) {
        navigate(ce.detail.url);
        return;
      }
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
      setIndoors([]);
      setServerLoaded({ crops: false, ambients: false });
      indoorService.reset();
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
      (list, meta) => {
        setCultivations(list);
        markInitialLoaded();
        if (meta && !meta.fromCache) setServerLoaded((s) => (s.crops ? s : { ...s, crops: true }));
      }
    );
    const unsubIndoors = indoorService.subscribeIndoors(currentUser.uid, (list, meta) => {
      setIndoors(list);
      if (meta && !meta.fromCache) setServerLoaded((s) => (s.ambients ? s : { ...s, ambients: true }));
    });
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
      unsubIndoors();
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
      const demoDataService = await loadDemoData();
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
        const demoDataService = await loadDemoData();
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
    setIndoors([]);
    setServerLoaded({ crops: false, ambients: false });
    indoorService.reset();
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
    return <AppSplash />;
  }

  // Not logged in -> Show Login/Register
  if (!currentUser) {
    return (
      <LazyBoundary
        fallback={
          <div className="min-h-screen cultiveta-page-background flex items-center justify-center p-4">
            <ViewLoadError />
          </div>
        }
      >
        <React.Suspense fallback={<AppSplash />}>
          <AuthScreen
            onSuccess={() => {}}
            onExploreDemo={async () => {
              try {
                showToast('Ingresando en Modo Demo...');
                const demoDataService = await loadDemoData();
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
        </React.Suspense>
      </LazyBoundary>
    );
  }

  const closeAmbientForm = () => {
    setIsIndoorFormOpen(false);
    setIndoorToEdit(null);
  };
  const closeCultivationForm = () => {
    setIsCultivationFormOpen(false);
    setCultivationToEdit(null);
    setInitialGeneticsForNewCrop(null);
    setNewCropIndoorId(null);
  };
  const closeWateringModal = () => {
    setIsWateringModalOpen(false);
    setWateringModalInitialRecipe(null);
  };
  const closeCalendarModal = () => {
    setIsCalendarModalOpen(false);
    setCalendarModalCultivation(null);
  };
  const closeNotificationCenter = () => {
    setIsNotificationCenterOpen(false);
    setEnvAlertsCount(0);
  };

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
          <LazyBoundary resetKey={location.pathname} fallback={<ViewLoadError />}>
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
              indoors={indoors}
              onOpenIndoor={(i) => openIndoor(i.id)}
              onOpenGenetic={(e) => navigate(pathForGenetic(e.crop.indoorId || '', e.crop.id, e.index))}
              onCreateIndoorClick={() => {
                setIndoorToEdit(null);
                setIsIndoorFormOpen(true);
              }}
            />
          )}

          {/* VIEW: AMBIENTE (carpa, sala o lugar de exterior) */}
          {currentView === 'indoor_detail' &&
            (selectedIndoor ? (
              <AmbientDetailView
                ambient={selectedIndoor}
                cultivations={cultivations}
                envRecords={envRecords}
                userId={currentUser.uid}
                geneticsList={geneticsList}
                onBack={() => setCurrentView('dashboard')}
                onOpenGenetic={(e) => navigate(pathForGenetic(selectedIndoor.id, e.crop.id, e.index))}
                onEdit={(i) => {
                  setIndoorToEdit(i);
                  setIsIndoorFormOpen(true);
                }}
                onDeleted={() => setCurrentView('dashboard')}
                onAddPlants={(i) => {
                  setCultivationToEdit(null);
                  setNewCropIndoorId(i.id);
                  setIsCultivationFormOpen(true);
                }}
                onOpenDevices={openDevices}
                onCropsUpdated={(updated) => setCultivations((prev) => prev.map((c) => updated.find((u) => u.id === c.id) || c))}
                showToast={showToast}
              />
            ) : (
              <div className="cultiveta-card p-10 text-center space-y-3">
                <p className="text-sm text-ink-muted">{isInitialLoading ? 'Cargando el ambiente…' : 'Ese ambiente ya no existe.'}</p>
                <button type="button" onClick={() => setCurrentView('dashboard')} className="cultiveta-btn-secondary text-sm">
                  Volver al Jardín
                </button>
              </div>
            ))}

          {/* VIEW: GENÉTICA (dentro de su ambiente) */}
          {currentView === 'genetic_detail' &&
            (geneticCrop ? (
              <GeneticDetailView
                ambient={indoors.find((i) => i.id === (geneticCrop.indoorId || route.indoorId)) || null}
                ambients={indoors}
                crop={geneticCrop}
                index={route.geneticIndex ?? 0}
                waterings={waterings}
                envRecords={envRecords}
                photos={photos}
                diaryEntries={diaryEntries}
                geneticsList={geneticsList}
                userId={currentUser.uid}
                onBack={() => (geneticCrop.indoorId ? openIndoor(geneticCrop.indoorId) : setCurrentView('dashboard'))}
                onCropUpdated={(updated) => {
                  setCultivations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
                  showToast('Etapa actualizada.');
                }}
                onOpenCrop={(crop) => {
                  setSelectedCultivationId(crop.id);
                  setCurrentView('cultivation_detail');
                }}
                onWater={(crop) => {
                  setSelectedCultivationId(crop.id);
                  setIsWateringModalOpen(true);
                }}
                onMoved={(to) => navigate(pathForGenetic(to.id, geneticCrop.id, route.geneticIndex ?? 0), { replace: true })}
                onShareNeedsProfile={() => setCurrentView('community')}
                onOpenGrowlog={(id) => navigate(pathForGrowlog(id))}
                showToast={showToast}
              />
            ) : (
              <div className="cultiveta-card p-10 text-center space-y-3">
                <p className="text-sm text-ink-muted">{isInitialLoading ? 'Cargando la genética…' : 'Esa genética ya no está en este ambiente.'}</p>
                <button type="button" onClick={() => setCurrentView('dashboard')} className="cultiveta-btn-secondary text-sm">
                  Volver al Jardín
                </button>
              </div>
            ))}

          {/* VIEW: COMUNIDAD (como en Canopia) */}
          {currentView === 'community' && (
            <CommunityView
              userId={currentUser.uid}
              cultivations={cultivations}
              geneticsList={geneticsList}
              suggestedName={userProfile?.displayName || currentUser.displayName}
              suggestedHandle={userProfile?.username}
              level={growerProgress.progress?.level.level}
              levelName={growerProgress.progress?.level.name}
              onOpenGrowlog={(id) => navigate(pathForGrowlog(id))}
              onOpenGrower={(handle) => navigate(pathForGrower(handle))}
              onOpenAdmin={() => setCurrentView('community_admin')}
              showToast={showToast}
            />
          )}
          {currentView === 'growlog' && route.growlogId && (
            <GrowlogView
              growlogId={route.growlogId}
              userId={currentUser.uid}
              onBack={() => (window.history.length > 1 ? navigate(-1) : setCurrentView('community'))}
              onOpenGrower={(handle) => navigate(pathForGrower(handle))}
              onNeedProfile={() => setCurrentView('community')}
              onEditShare={(g) => {
                const crop = cultivations.find((c) => c.id === g.cropId);
                if (crop) navigate(pathForGenetic(crop.indoorId || 'sin-ambiente', crop.id, g.geneticIndex));
              }}
              showToast={showToast}
            />
          )}
          {currentView === 'grower' && route.handle && (
            <GrowerView
              handle={route.handle}
              userId={currentUser.uid}
              onBack={() => setCurrentView('community')}
              onOpenGrowlog={(id) => navigate(pathForGrowlog(id))}
              onEditProfile={() => setCurrentView('community')}
              showToast={showToast}
            />
          )}
          {currentView === 'community_admin' && (
            <AdminReportsView onBack={() => setCurrentView('community')} onOpenGrowlog={(id) => navigate(pathForGrowlog(id))} showToast={showToast} />
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
                backLabel={
                  detailBackTarget === 'cultivations'
                    ? 'Volver a Cultivos'
                    : selectedCultivation.indoorId && indoors.some((i) => i.id === selectedCultivation.indoorId)
                      ? `Volver a ${indoors.find((i) => i.id === selectedCultivation.indoorId)!.name}`
                      : 'Volver al Jardín'
                }
                onBack={() => {
                  const ambientId = detailBackTarget === 'dashboard' && selectedCultivation.indoorId && indoors.some((i) => i.id === selectedCultivation.indoorId) ? selectedCultivation.indoorId : null;
                  setSelectedCultivationId(null);
                  if (ambientId) openIndoor(ambientId);
                  else setCurrentView(detailBackTarget);
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
                onOpenDevices={openDevices}
                onOpenIndoor={openIndoor}
                onWateringAdded={(w) => {
                  setWaterings((prev) => (prev.some((x) => x.id === w.id) ? prev : [w, ...prev]));
                }}
                onLightSaved={(updated) => {
                  setCultivations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
                  showToast('Hora de encendido de la luz guardada.');
                }}
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
                  Volver al Jardín
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

          {/* VIEW: EQUIPOS (enchufes, sensores y riego) */}
          {currentView === 'devices' && (
            <DevicesView focus={devicesFocus} cultivations={cultivations.filter((c) => !c.isFinished)} showToast={showToast} />
          )}

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
          </LazyBoundary>
        </main>
      </div>

      {/* Festejos de nivel y logros, y avisos de XP (si no se pudieran bajar, simplemente no se ven) */}
      {celebrationsOpened && (
        <LazyBoundary fallback={null}>
          <React.Suspense fallback={null}>
            <CelebrationLayer
              celebrations={growerProgress.celebrations}
              onDismissCelebration={growerProgress.dismissCelebration}
              xpToasts={growerProgress.xpToasts}
              onDismissXpToast={growerProgress.dismissXpToast}
              onOpenAchievements={() => setCurrentView('achievements')}
            />
          </React.Suspense>
        </LazyBoundary>
      )}

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
      {quickActionOpened && (
        <LazyModal open={isQuickActionOpen} onClose={() => setIsQuickActionOpen(false)}>
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
        </LazyModal>
      )}

      {/* Ambiente (carpa, sala o lugar de exterior): crear o editar */}
      {isIndoorFormOpen && currentUser && (
        <LazyModal onClose={closeAmbientForm}>
          <AmbientFormModal
            isOpen={isIndoorFormOpen}
            onClose={closeAmbientForm}
            userId={currentUser.uid}
            ambientToEdit={indoorToEdit}
            onSaved={(saved) => {
              setIndoors((prev) => (prev.some((i) => i.id === saved.id) ? prev.map((i) => (i.id === saved.id ? saved : i)) : [...prev, saved]));
              showToast(indoorToEdit ? `Ambiente "${saved.name}" guardado.` : `Ambiente "${saved.name}" creado. Sumale plantas.`);
              if (!indoorToEdit) openIndoor(saved.id);
            }}
          />
        </LazyModal>
      )}

      {/* Cultivation Form Modal */}
      {isCultivationFormOpen && (
        <LazyModal onClose={closeCultivationForm}>
          <CultivationFormModal
            isOpen={isCultivationFormOpen}
            onClose={closeCultivationForm}
            userId={currentUser.uid}
            indoors={indoors}
            initialIndoorId={newCropIndoorId}
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
        </LazyModal>
      )}

      {/* Watering Modal */}
      {isWateringModalOpen && (
        <LazyModal onClose={closeWateringModal}>
          <WateringModal
            isOpen={isWateringModalOpen}
            onConnectDevice={() => openDevices('riego')}
            onClose={closeWateringModal}
            userId={currentUser.uid}
            cultivations={cultivations.filter((c) => !c.isFinished)}
            waterings={waterings}
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
        </LazyModal>
      )}

      {/* Environment Modal */}
      {isEnvModalOpen && (
        <LazyModal onClose={() => setIsEnvModalOpen(false)}>
          <EnvironmentModal
            isOpen={isEnvModalOpen}
            onClose={() => setIsEnvModalOpen(false)}
            onConnectDevice={() => openDevices('ambiente')}
            userId={currentUser.uid}
            cultivations={cultivations.filter((c) => !c.isFinished)}
            defaultCultivationId={selectedCultivationId || undefined}
            onRecordAdded={(r) => {
              showToast('Medición ambiental registrada.');
            }}
          />
        </LazyModal>
      )}

      {/* Photo Upload Modal */}
      {isPhotoModalOpen && (
        <LazyModal onClose={() => setIsPhotoModalOpen(false)}>
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
        </LazyModal>
      )}

      {/* Diary Note Modal */}
      {isDiaryModalOpen && (
        <LazyModal onClose={() => setIsDiaryModalOpen(false)}>
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
        </LazyModal>
      )}

      {/* Instant AI Diagnosis Modal from Photo Upload */}
      {photoForInstantDiagnosis && (
        <LazyModal onClose={() => setPhotoForInstantDiagnosis(null)}>
          <PhotoDiagnosisModal
            isOpen={!!photoForInstantDiagnosis}
            onClose={() => setPhotoForInstantDiagnosis(null)}
            userId={currentUser.uid}
            cultivation={photoForInstantDiagnosis.cultivation}
            photo={photoForInstantDiagnosis.photo}
          />
        </LazyModal>
      )}

      {/* Google Calendar Sync Modal */}
      {isCalendarModalOpen && calendarModalCultivation && (
        <LazyModal onClose={closeCalendarModal}>
          <GoogleCalendarModal
            isOpen={isCalendarModalOpen}
            onClose={closeCalendarModal}
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
        </LazyModal>
      )}

      {/* Notification Center Modal for env_alert cron alerts */}
      {isNotificationCenterOpen && (
        <LazyModal onClose={closeNotificationCenter}>
          <NotificationCenterModal
            isOpen={isNotificationCenterOpen}
            onClose={closeNotificationCenter}
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
        </LazyModal>
      )}

      {/* Tus datos y tu cuenta: exportación y borrado completo */}
      {accountModalOpened && (
        <LazyModal open={isAccountModalOpen} onClose={() => setIsAccountModalOpen(false)}>
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
        </LazyModal>
      )}

      {/* User Preferences & Alert Types Configuration Modal */}
      {isPreferencesModalOpen && (
        <LazyModal onClose={() => setIsPreferencesModalOpen(false)}>
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
        </LazyModal>
      )}
    </div>
  );
}
