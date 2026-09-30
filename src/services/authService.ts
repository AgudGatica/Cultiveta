import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signInWithCustomToken,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  User,
  updateProfile,
  deleteUser,
  GoogleAuthProvider
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { auth, googleProvider, calendarGoogleProvider, db } from '../firebase/config';
import { UserProfile } from '../types';
import { cleanFirestoreData } from '../utils/firestoreUtils';

let cachedAccessToken: string | null = null;
const authListeners: ((user: User | null) => void)[] = [];

export interface LegacyLocalUserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  profile?: UserProfile | null;
  timestamp: string;
}

export const authService = {
  getAccessToken(): string | null {
    return cachedAccessToken;
  },

  setAccessToken(token: string | null) {
    cachedAccessToken = token;
  },

  hasCalendarAccess(): boolean {
    return !!cachedAccessToken;
  },

  notifyListeners(user: User | null) {
    authListeners.forEach((cb) => cb(user));
  },

  /**
   * Suscribe a los cambios reales de Firebase Auth sin generar usuarios ficticios
   */
  onAuthStateChanged(callback: (user: User | null) => void) {
    authListeners.push(callback);

    const unsubFirebase = onAuthStateChanged(auth, (user) => {
      if (!user) {
        cachedAccessToken = null;
        callback(null);
      } else {
        if (typeof window !== 'undefined') {
          localStorage.setItem('cultiveta_last_user_id', user.uid);
        }
        callback(user);
      }
    });

    return () => {
      const idx = authListeners.indexOf(callback);
      if (idx !== -1) authListeners.splice(idx, 1);
      unsubFirebase();
    };
  },

  onStateChanged(callback: (user: User | null) => void) {
    return this.onAuthStateChanged(callback);
  },

  async loginWithGoogle(): Promise<{ user: User; accessToken: string | null }> {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      cachedAccessToken = credential?.accessToken || null;
      const user = result.user;
      if (typeof window !== 'undefined') {
        localStorage.setItem('cultiveta_last_user_id', user.uid);
      }
      await this.syncUserProfile(user);
      return { user, accessToken: cachedAccessToken };
    } catch (err: unknown) {
      console.warn('Google signInWithPopup error:', err);
      throw err;
    }
  },

  async connectGoogleCalendar(): Promise<string> {
    const result = await signInWithPopup(auth, calendarGoogleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('No se pudo obtener el token de acceso para Google Calendar.');
    }
    cachedAccessToken = credential.accessToken;
    return cachedAccessToken;
  },

  async registerWithEmail(email: string, pass: string, name: string): Promise<User> {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const user = cred.user;
    if (typeof window !== 'undefined') {
      localStorage.setItem('cultiveta_last_user_id', user.uid);
    }
    if (name) {
      await updateProfile(user, { displayName: name });
    }
    await this.syncUserProfile(user, name);
    return user;
  },

  async loginWithEmail(email: string, pass: string): Promise<User> {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    if (typeof window !== 'undefined') {
      localStorage.setItem('cultiveta_last_user_id', cred.user.uid);
    }
    await this.syncUserProfile(cred.user);
    return cred.user;
  },

  /**
   * Ingreso como invitado explícito utilizando autenticación anónima nativa de Firebase.
   * No utiliza credenciales compartidas ni inventa usuarios locales fingidos.
   */
  async loginAsDemoGuest(): Promise<User> {
    const cred = await signInAnonymously(auth);
    if (typeof window !== 'undefined') {
      localStorage.setItem('cultiveta_last_user_id', cred.user.uid);
    }
    await this.syncUserProfile(cred.user, 'Cultivador Invitado');
    return cred.user;
  },

  /**
   * Autenticación segura mediante token personalizado (Custom Token) emitido por Firebase Admin.
   * Utilizado para entornos de prueba y sesiones autenticadas directas.
   */
  async loginWithCustomToken(token: string): Promise<User> {
    const cred = await signInWithCustomToken(auth, token);
    if (typeof window !== 'undefined') {
      localStorage.setItem('cultiveta_last_user_id', cred.user.uid);
    }
    await this.syncUserProfile(cred.user, 'Cultivador E2E');
    return cred.user;
  },

  async logout(): Promise<void> {
    cachedAccessToken = null;
    this.notifyListeners(null);
    await signOut(auth);
  },

  async signOutUser(): Promise<void> {
    await this.logout();
  },

  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email);
  },

  /**
   * Verifica si existen datos de usuarios locales anteriores en el dispositivo
   * para permitir su recuperación o exportación sin borrarlos (FASE 1).
   */
  hasLegacyLocalData(): boolean {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('cultiveta_local_user');
  },

  /**
   * Exporta datos de usuario local legado a un objeto seguro para su descarga o migración.
   */
  exportLegacyLocalData(): LegacyLocalUserData | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('cultiveta_local_user');
      if (!raw) return null;
      const data = JSON.parse(raw);
      const profileRaw = localStorage.getItem(`cultiveta_profile_${data.uid}`);
      const profile = profileRaw ? JSON.parse(profileRaw) : null;
      return {
        uid: data.uid,
        email: data.email || null,
        displayName: data.displayName || null,
        profile,
        timestamp: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  },

  async syncUserProfile(user: User, customName?: string): Promise<UserProfile> {
    const fallbackProfile: UserProfile = {
      uid: user.uid,
      email: user.email,
      displayName: customName || user.displayName || user.email?.split('@')[0] || 'Cultivador',
      photoURL: user.photoURL,
      createdAt: new Date().toISOString(),
      preferences: {
        advancedMode: false,
        tempUnit: 'C',
        volumeUnit: 'L',
        alertTypes: {
          climateAlerts: true,
          wateringAlerts: true,
          calendarReminders: true,
          soundEnabled: true,
        },
      },
    };

    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`cultiveta_profile_${user.uid}`);
      if (!stored) {
        localStorage.setItem(`cultiveta_profile_${user.uid}`, JSON.stringify(fallbackProfile));
      }
    }

    try {
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        await setDoc(userRef, cleanFirestoreData(fallbackProfile)).catch(() => {});
        return fallbackProfile;
      } else {
        const cloudData = snap.data() as UserProfile;
        if (typeof window !== 'undefined') {
          localStorage.setItem(`cultiveta_profile_${user.uid}`, JSON.stringify(cloudData));
        }
        return cloudData;
      }
    } catch (err) {
      console.warn('Could not sync user profile to Firestore (using local fallback):', err);
      return fallbackProfile;
    }
  },

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`cultiveta_profile_${uid}`);
      if (stored) {
        try {
          return JSON.parse(stored) as UserProfile;
        } catch {
          // invalid json
        }
      }
    }
    try {
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      return snap.exists() ? (snap.data() as UserProfile) : null;
    } catch (err) {
      console.warn('Could not get user profile from Firestore:', err);
      return null;
    }
  },

  async updateUserPreferences(uid: string, preferences: Partial<UserProfile['preferences']>): Promise<void> {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`cultiveta_profile_${uid}`);
      if (stored) {
        try {
          const current = JSON.parse(stored) as UserProfile;
          current.preferences = { ...current.preferences, ...preferences };
          localStorage.setItem(`cultiveta_profile_${uid}`, JSON.stringify(current));
        } catch {
          // ignore
        }
      }
    }
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { preferences }).catch(() => {});
    } catch (err) {
      console.warn('Could not update preferences in Firestore:', err);
    }
  },

  async deleteAccount(): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('No hay usuario autenticado');
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`cultiveta_profile_${user.uid}`);
    }
    this.notifyListeners(null);
    try {
      const userRef = doc(db, 'users', user.uid);
      await deleteDoc(userRef).catch(() => {});
      await deleteUser(user);
    } catch (e) {
      console.warn('deleteUser error:', e);
    }
  },
};

if (typeof window !== 'undefined') {
  (window as any).__cultivetaAuth = authService;
}
