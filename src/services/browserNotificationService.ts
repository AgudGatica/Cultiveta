import { CultivationTask } from '../types';
import { db, auth } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

const NOTIFIED_TASKS_KEY = 'cultiveta_notified_env_alerts';

class BrowserNotificationService {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private sseAbortController: AbortController | null = null;
  private sseReconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private notifiedTaskIds: Set<string> = new Set();
  private isInitialized = false;
  private firestoreUnsub: (() => void) | null = null;
  public currentUserId: string | null = null;

  constructor() {
    this.loadNotifiedTasks();
  }

  /**
   * Obtiene las preferencias de alertas configuradas por el usuario
   */
  public getAlertPreferences(): {
    climateAlerts: boolean;
    wateringAlerts: boolean;
    calendarReminders: boolean;
    soundEnabled: boolean;
  } {
    if (typeof window === 'undefined') {
      return { climateAlerts: true, wateringAlerts: true, calendarReminders: true, soundEnabled: true };
    }
    try {
      if (this.currentUserId) {
        const stored = localStorage.getItem(`cultiveta_profile_${this.currentUserId}`);
        if (stored) {
          const profile = JSON.parse(stored);
          const alerts = profile.preferences?.alertTypes;
          if (alerts) {
            return {
              climateAlerts: alerts.climateAlerts ?? true,
              wateringAlerts: alerts.wateringAlerts ?? true,
              calendarReminders: alerts.calendarReminders ?? true,
              soundEnabled: alerts.soundEnabled ?? true,
            };
          }
        }
      }
    } catch {}
    return { climateAlerts: true, wateringAlerts: true, calendarReminders: true, soundEnabled: true };
  }

  private loadNotifiedTasks() {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(NOTIFIED_TASKS_KEY);
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) {
          this.notifiedTaskIds = new Set(arr);
        }
      }
    } catch (e) {
      console.warn('[NotificationService] Error loading notified cache:', e);
    }
  }

  private saveNotifiedTasks() {
    if (typeof window === 'undefined') return;
    try {
      const arr = Array.from(this.notifiedTaskIds).slice(-100); // Guardar últimas 100
      localStorage.setItem(NOTIFIED_TASKS_KEY, JSON.stringify(arr));
    } catch (e) {
      console.warn('[NotificationService] Error saving notified cache:', e);
    }
  }

  /**
   * Comprueba si el navegador actual soporta la API de Notificaciones
   */
  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  /**
   * Obtiene el estado actual del permiso ('granted' | 'denied' | 'default')
   */
  public getPermission(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  }

  /**
   * Solicita permiso al usuario para mostrar notificaciones de escritorio / SO
   */
  public async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) return 'denied';
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        await this.registerServiceWorker();
      }
      return permission;
    } catch (err) {
      console.warn('[NotificationService] Error al solicitar permiso:', err);
      return Notification.permission;
    }
  }

  /**
   * Registra el Service Worker de Cultiveta (/sw.js) para notificaciones en segundo plano
   */
  public async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      this.swRegistration = registration;
      console.log('[NotificationService] ✅ Service Worker registrado correctamente:', registration.scope);
      return registration;
    } catch (err) {
      console.warn('[NotificationService] Error registrando Service Worker:', err);
      return null;
    }
  }

  /**
   * Reproduce una señal acústica breve usando Web Audio API (sin archivos externos)
   */
  public playAlertSound() {
    if (typeof window === 'undefined') return;
    const prefs = this.getAlertPreferences();
    if (prefs.soundEnabled === false) return; // Silenciado según preferencia del usuario

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.3); // D6

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch {
      // Audio autoplay puede estar bloqueado hasta interacción del usuario
    }
  }

  /**
   * Dispara una notificación de navegador del sistema para una tarea de tipo 'env_alert'
   */
  public async showEnvAlertNotification(task: CultivationTask): Promise<boolean> {
    if (!this.isSupported() || Notification.permission !== 'granted') {
      return false;
    }

    // Comprobar si el usuario decidió recibir alertas climáticas
    const prefs = this.getAlertPreferences();
    if (prefs.climateAlerts === false) {
      console.log('[NotificationService] Alerta climática suprimida según las preferencias del usuario');
      return false;
    }

    if (this.notifiedTaskIds.has(task.id)) {
      return false; // Ya notificado
    }

    this.notifiedTaskIds.add(task.id);
    this.saveNotifiedTasks();

    const title = `🚨 Alerta Climática: ${task.title}`;
    const body = `"${task.cultivationName}" (${task.stage || 'Cultivo'}): ${task.description}`;

    const options: NotificationOptions = {
      body,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌱</text></svg>',
      badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚨</text></svg>',
      tag: `env-alert-${task.id}`,
      requireInteraction: true,
      data: {
        taskId: task.id,
        cultivationId: task.cultivationId,
        url: `/?cultivationId=${task.cultivationId}`,
      },
    };

    // Intentar mostrar vía Service Worker para que persista fuera de la pestaña
    if (this.swRegistration && this.swRegistration.showNotification) {
      try {
        await this.swRegistration.showNotification(title, options);
        this.playAlertSound();
        this.dispatchAppEvent(task);
        return true;
      } catch (swErr) {
        console.warn('[NotificationService] Fallback a Notification clásica:', swErr);
      }
    }

    // Fallback: Notificación tradicional
    try {
      const notif = new Notification(title, options);
      this.playAlertSound();
      notif.onclick = () => {
        window.focus();
        this.dispatchAppEvent(task);
        notif.close();
      };
      this.dispatchAppEvent(task);
      return true;
    } catch (e) {
      console.warn('[NotificationService] Error lanzando notificación:', e);
      return false;
    }
  }

  /**
   * Emite un evento en la ventana para que los componentes de React se actualicen
   */
  private dispatchAppEvent(task: CultivationTask) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('cultiveta_env_alert_received', { detail: { task } })
      );
    }
  }

  /**
   * Conecta al canal SSE del servidor (/api/notifications/stream) mediante fetch streaming
   * autenticado con encabezado Bearer JWT (FASE 1: transporte seguro sin JWT en URL).
   */
  public async initSSEStream(userId?: string) {
    if (typeof window === 'undefined') return;
    this.stopSSEStream();

    const currentUser = auth.currentUser;
    if (!currentUser) {
      // Sin usuario autenticado en Firebase no se consumen canales privados
      return;
    }

    try {
      const idToken = await currentUser.getIdToken();
      if (!idToken) return;

      this.sseAbortController = new AbortController();
      const signal = this.sseAbortController.signal;

      const response = await fetch('/api/notifications/stream', {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        signal,
      });

      if (!response.ok || !response.body) {
        console.warn('[NotificationService] Conexión a stream SSE falló:', response.status);
        return;
      }

      console.log('[NotificationService] 🟢 Conexión SSE autenticada de alertas cron establecida');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const lines = part.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const rawData = line.slice(6).trim();
              if (rawData) {
                try {
                  const payload = JSON.parse(rawData);
                  if (payload.type === 'env_alert' && payload.task) {
                    console.log('[NotificationService] 🚨 Alerta de cron job recibida por SSE:', payload.task.title);
                    this.showEnvAlertNotification(payload.task);
                  } else if (payload.type === 'test_alert') {
                    this.sendTestNotification();
                  }
                } catch {
                  // Ping o formato no-JSON
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn('[NotificationService] Stream SSE desconectado, programando reconexión:', err?.message);
        if (!this.sseReconnectTimeout) {
          this.sseReconnectTimeout = setTimeout(() => {
            this.sseReconnectTimeout = null;
            this.initSSEStream(userId);
          }, 8000);
        }
      }
    }
  }

  /**
   * Cierra el canal SSE activo y cancela reintentos
   */
  public stopSSEStream() {
    if (this.sseAbortController) {
      this.sseAbortController.abort();
      this.sseAbortController = null;
    }
    if (this.sseReconnectTimeout) {
      clearTimeout(this.sseReconnectTimeout);
      this.sseReconnectTimeout = null;
    }
  }

  /**
   * Escucha la colección 'tasks' de Firestore para alertas generadas por el cron job en la nube
   */
  public initFirestoreListener(userId?: string) {
    if (!db || this.firestoreUnsub) return;

    try {
      const tasksRef = collection(db, 'tasks');
      const q = userId
        ? query(tasksRef, where('type', '==', 'env_alert'), where('userId', 'in', [userId, 'system']))
        : query(tasksRef, where('type', '==', 'env_alert'));

      this.firestoreUnsub = onSnapshot(
        q,
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const taskData = change.doc.data() as CultivationTask;
              if (taskData && taskData.type === 'env_alert' && !taskData.isCompleted) {
                this.showEnvAlertNotification(taskData);
              }
            }
          });
        },
        (err) => {
          console.warn('[NotificationService] Listener Firestore tareas no disponible (usando fallback local):', err?.message);
        }
      );
    } catch (err) {
      console.warn('[NotificationService] Error inicializando listener de tareas:', err);
    }
  }

  /**
   * Inicializa completamente el servicio de notificaciones
   */
  public async init(userId?: string) {
    this.currentUserId = userId || null;
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (this.isSupported() && Notification.permission === 'granted') {
      await this.registerServiceWorker();
    }

    this.initSSEStream(userId);
    this.initFirestoreListener(userId);

    // Escuchar mensajes provenientes del Service Worker (por ejemplo, clicks en notificaciones)
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'NOTIFICATION_CLICKED') {
          console.log('[NotificationService] Usuario interactuó con la alerta:', event.data.data);
          window.dispatchEvent(
            new CustomEvent('cultiveta_notification_clicked', { detail: event.data.data })
          );
        }
      });
    }
  }

  /**
   * Dispara una notificación de riego pendiente u overdue si el usuario tiene activadas las alertas de riego
   */
  public async showWateringAlertNotification(cultivationName: string, daysOverdue: number, stage?: string): Promise<boolean> {
    if (!this.isSupported() || Notification.permission !== 'granted') return false;
    const prefs = this.getAlertPreferences();
    if (prefs.wateringAlerts === false) {
      console.log('[NotificationService] Alerta de riego suprimida según las preferencias del usuario');
      return false;
    }

    const title = `💧 Alerta de Riego: ${cultivationName}`;
    const body = `El cultivo lleva +${daysOverdue} días de retraso en su ciclo de riego (${stage || 'Etapa activa'}). Conviene hidratar el sustrato.`;
    const options: NotificationOptions = {
      body,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💧</text></svg>',
      tag: `watering-alert-${cultivationName}`,
    };

    if (this.swRegistration && this.swRegistration.showNotification) {
      try {
        await this.swRegistration.showNotification(title, options);
        this.playAlertSound();
        return true;
      } catch {}
    }

    try {
      new Notification(title, options);
      this.playAlertSound();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Dispara una notificación de recordatorio de calendario si el usuario tiene activados los recordatorios
   */
  public async showCalendarReminderNotification(title: string, description: string): Promise<boolean> {
    if (!this.isSupported() || Notification.permission !== 'granted') return false;
    const prefs = this.getAlertPreferences();
    if (prefs.calendarReminders === false) {
      console.log('[NotificationService] Recordatorio de calendario suprimido según las preferencias del usuario');
      return false;
    }

    const notifTitle = `📅 Recordatorio: ${title}`;
    const options: NotificationOptions = {
      body: description,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📅</text></svg>',
      tag: `calendar-reminder-${title}`,
    };

    if (this.swRegistration && this.swRegistration.showNotification) {
      try {
        await this.swRegistration.showNotification(notifTitle, options);
        this.playAlertSound();
        return true;
      } catch {}
    }

    try {
      new Notification(notifTitle, options);
      this.playAlertSound();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Envía una notificación de prueba para que el usuario verifique la recepción fuera de la pestaña
   */
  public async sendTestNotification(): Promise<boolean> {
    if (!this.isSupported()) return false;
    if (Notification.permission !== 'granted') {
      const res = await this.requestPermission();
      if (res !== 'granted') return false;
    }

    const testTask: CultivationTask = {
      id: `test-${Date.now()}`,
      cultivationId: 'test_crop',
      cultivationName: 'Demo Carpa 1',
      stage: 'Floración',
      type: 'env_alert',
      urgency: 'today',
      priority: 'critical',
      isCompleted: false,
      title: '¡Prueba de Notificación de Alerta Climática!',
      description: 'Esta alerta te avisará incluso si estás en otra pestaña o con el navegador minimizado.',
      dueDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      categoryLabel: '🚨 Alerta Climática',
    };

    return this.showEnvAlertNotification(testTask);
  }

  /**
   * Limpia conexiones al desmontar
   */
  public destroy() {
    this.stopSSEStream();
    if (this.firestoreUnsub) {
      this.firestoreUnsub();
      this.firestoreUnsub = null;
    }
    this.isInitialized = false;
  }
}

export const browserNotificationService = new BrowserNotificationService();
