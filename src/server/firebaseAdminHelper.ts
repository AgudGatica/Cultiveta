import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';

export type FirebaseAdminAppWithFirestore = App & {
  firestore: () => Firestore;
};

let appletFirebaseConfig: {
  projectId?: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
} = {};

try {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    appletFirebaseConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  }
} catch {
  // Ignorar error al leer config
}

let firebaseAdminApp: App | null = null;

export function getFirebaseAdmin(): FirebaseAdminAppWithFirestore | null {
  try {
    if (!firebaseAdminApp) {
      if (getApps().length > 0) {
        firebaseAdminApp = getApps()[0];
      } else {
        const projectId =
          process.env.FIREBASE_PROJECT_ID ||
          appletFirebaseConfig.projectId ||
          process.env.GCLOUD_PROJECT ||
          'gen-lang-client-0531791519';

        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
          try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            firebaseAdminApp = initializeApp({
              credential: cert(serviceAccount),
              projectId: serviceAccount.project_id || projectId,
            });
          } catch {
            // fallback
          }
        }

        if (!firebaseAdminApp) {
          firebaseAdminApp = initializeApp({ projectId });
        }
      }
    }

    if (firebaseAdminApp && !(firebaseAdminApp as any).firestore) {
      (firebaseAdminApp as any).firestore = () => {
        const databaseId =
          process.env.FIRESTORE_DATABASE_ID ||
          appletFirebaseConfig.firestoreDatabaseId;
        return databaseId
          ? getFirestore(firebaseAdminApp!, databaseId)
          : getFirestore(firebaseAdminApp!);
      };
    }

    return firebaseAdminApp as FirebaseAdminAppWithFirestore;
  } catch (err) {
    console.warn('[firebaseAdminHelper] Inicialización omitida o no disponible:', err);
    return null;
  }
}
