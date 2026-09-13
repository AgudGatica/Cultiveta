import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
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

function createLocalUser(uid: string, email: string, displayName: string): User {
  return {
    uid,
    email,
    displayName,
    photoURL: null,
    emailVerified: true,
    isAnonymous: uid.includes('demo'),
    metadata: {},
    providerData: [],
    refreshToken: '',
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => 'mock-token',
    getIdTokenResult: async () => ({} as any),
    reload: async () => {},
    toJSON: () => ({ uid, email, displayName }),
    phoneNumber: null,
    providerId: 'firebase',
  } as unknown as User;
}

function getStoredLocalUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('cultiveta_local_user');
    if (!raw) return null;
    const data = JSON.parse(raw);
    return createLocalUser(data.uid, data.email, data.displayName);
  } catch (e) {
    return null;
  }
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

  notifyLocalListeners(user: User | null) {
    authListeners.forEach((cb) => cb(user));
  },

  onStateChanged(callback: (user: User | null) => void) {
    authListeners.push(callback);

    // If there's already a local user stored, emit immediately
    const localUser = getStoredLocalUser();
    if (localUser && !auth.currentUser) {
      callback(localUser);
    }

    const unsubFirebase = onAuthStateChanged(auth, (user) => {
      if (!user) {
        cachedAccessToken = null;
        const currentLocal = getStoredLocalUser();
        callback(currentLocal);
      } else {
        localStorage.setItem('cultiveta_last_user_id', user.uid);
        callback(user);
      }
    });

    return () => {
      const idx = authListeners.indexOf(callback);
      if (idx !== -1) authListeners.splice(idx, 1);
      unsubFirebase();
    };
  },

  onAuthStateChanged(callback: (user: User | null) => void) {
    return this.onStateChanged(callback);
  },

  async loginWithGoogle(): Promise<{ user: User; accessToken: string | null }> {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      cachedAccessToken = credential?.accessToken || null;
      const user = result.user;
      localStorage.removeItem('cultiveta_local_user');
      localStorage.setItem('cultiveta_last_user_id', user.uid);
      await this.syncUserProfile(user);
      return { user, accessToken: cachedAccessToken };
    } catch (err: any) {
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
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      const user = cred.user;
      localStorage.removeItem('cultiveta_local_user');
      localStorage.setItem('cultiveta_last_user_id', user.uid);
      if (name) {
        await updateProfile(user, { displayName: name });
      }
      await this.syncUserProfile(user, name);
      return user;
    } catch (err: any) {
      if (
        err?.code === 'auth/operation-not-allowed' ||
        err?.code === 'auth/network-request-failed' ||
        err?.code === 'auth/admin-restricted-operation'
      ) {
        console.warn('Firebase Auth email registration not enabled in console, using local session fallback');
        const localUid = 'usr_' + btoa(email).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
        const displayName = name || email.split('@')[0];
        const localUser = createLocalUser(localUid, email, displayName);
        localStorage.setItem('cultiveta_local_user', JSON.stringify({ uid: localUid, email, displayName }));
        localStorage.setItem('cultiveta_last_user_id', localUid);
        await this.syncUserProfile(localUser, displayName);
        this.notifyLocalListeners(localUser);
        return localUser;
      }
      throw err;
    }
  },

  async loginWithEmail(email: string, pass: string): Promise<User> {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      localStorage.removeItem('cultiveta_local_user');
      localStorage.setItem('cultiveta_last_user_id', cred.user.uid);
      await this.syncUserProfile(cred.user);
      return cred.user;
    } catch (err: any) {
      if (
        err?.code === 'auth/operation-not-allowed' ||
        err?.code === 'auth/network-request-failed' ||
        err?.code === 'auth/admin-restricted-operation'
      ) {
        console.warn('Firebase Auth email login not enabled in console, using local session fallback');
        const localUid = 'usr_' + btoa(email).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
        const displayName = email.split('@')[0];
        const localUser = createLocalUser(localUid, email, displayName);
        localStorage.setItem('cultiveta_local_user', JSON.stringify({ uid: localUid, email, displayName }));
        localStorage.setItem('cultiveta_last_user_id', localUid);
        await this.syncUserProfile(localUser, displayName);
        this.notifyLocalListeners(localUser);
        return localUser;
      }
      throw err;
    }
  },

  async loginAsDemoGuest(): Promise<User> {
    try {
      const cred = await signInAnonymously(auth);
      localStorage.removeItem('cultiveta_local_user');
      localStorage.setItem('cultiveta_last_user_id', cred.user.uid);
      await this.syncUserProfile(cred.user, 'Cultivador Demo');
      return cred.user;
    } catch (err: any) {
      console.warn('signInAnonymously failed, falling back to demo email account', err);
      const demoEmail = 'demo@cultiveta.app';
      const demoPass = 'CultivetaDemo2026!';
      try {
        const cred = await signInWithEmailAndPassword(auth, demoEmail, demoPass);
        localStorage.removeItem('cultiveta_local_user');
        localStorage.setItem('cultiveta_last_user_id', cred.user.uid);
        await this.syncUserProfile(cred.user, 'Cultivador Demo');
        return cred.user;
      } catch (loginErr: any) {
        try {
          const uniqueEmail = `demo_${Date.now()}_${Math.floor(Math.random() * 10000)}@cultiveta.app`;
          const cred = await createUserWithEmailAndPassword(auth, uniqueEmail, demoPass);
          if (cred.user) {
            await updateProfile(cred.user, { displayName: 'Cultivador Demo' });
          }
          localStorage.removeItem('cultiveta_local_user');
          localStorage.setItem('cultiveta_last_user_id', cred.user.uid);
          await this.syncUserProfile(cred.user, 'Cultivador Demo');
          return cred.user;
        } catch (createErr) {
          const localGuest = createLocalUser('demo_cultiveta_guest', 'demo@cultiveta.app', 'Cultivador Demo');
          localStorage.setItem('cultiveta_local_user', JSON.stringify({ uid: localGuest.uid, email: localGuest.email, displayName: localGuest.displayName }));
          localStorage.setItem('cultiveta_last_user_id', localGuest.uid);
          await this.syncUserProfile(localGuest, 'Cultivador Demo');
          this.notifyLocalListeners(localGuest);
          return localGuest;
        }
      }
    }
  },

  async logout(): Promise<void> {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('cultiveta_local_user');
    }
    this.notifyLocalListeners(null);
    await signOut(auth).catch(() => {});
  },

  async signOutUser(): Promise<void> {
    await this.logout();
  },

  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email);
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
        try { return JSON.parse(stored); } catch (e) {}
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
          const current = JSON.parse(stored);
          current.preferences = { ...current.preferences, ...preferences };
          localStorage.setItem(`cultiveta_profile_${uid}`, JSON.stringify(current));
        } catch (e) {}
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
    const user = auth.currentUser || getStoredLocalUser();
    if (!user) throw new Error('No hay usuario autenticado');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('cultiveta_local_user');
      localStorage.removeItem(`cultiveta_profile_${user.uid}`);
    }
    this.notifyLocalListeners(null);
    try {
      const userRef = doc(db, 'users', user.uid);
      await deleteDoc(userRef).catch(() => {});
      if (auth.currentUser) {
        await deleteUser(auth.currentUser);
      }
    } catch (e) {
      console.warn('deleteUser error:', e);
    }
  }
};
