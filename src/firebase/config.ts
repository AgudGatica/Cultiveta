import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, initializeFirestore, setLogLevel, Firestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfigJson from '../../firebase-applet-config.json';

// Suppress benign connection retry / offline mode warnings
setLogLevel('error');

const firebaseConfig = {
  apiKey: firebaseConfigJson.apiKey,
  authDomain: firebaseConfigJson.authDomain,
  projectId: firebaseConfigJson.projectId,
  storageBucket: firebaseConfigJson.storageBucket,
  messagingSenderId: firebaseConfigJson.messagingSenderId,
  appId: firebaseConfigJson.appId,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.events'];
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const calendarGoogleProvider = new GoogleAuthProvider();
calendarGoogleProvider.addScope('https://www.googleapis.com/auth/calendar.events');
calendarGoogleProvider.setCustomParameters({ prompt: 'consent' });

const firestoreDatabaseId = (firebaseConfigJson as { firestoreDatabaseId?: string }).firestoreDatabaseId;

let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
    },
    firestoreDatabaseId || undefined
  );
} catch {
  firestoreInstance = firestoreDatabaseId ? getFirestore(app, firestoreDatabaseId) : getFirestore(app);
}

export const db = firestoreInstance;
export const storage = getStorage(app);
export default app;
