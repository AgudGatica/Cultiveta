import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signOut,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase/config';
import { authFetch } from './apiClient';
import { localStore } from './localStore';

const OFFLINE_DB_NAME = 'cultiveta_offline_db';

/** Proveedor con el que se inició sesión ('password', 'google.com', ...). */
export function getSignInProvider(): string | null {
  const user = auth.currentUser;
  if (!user) return null;
  return user.providerData[0]?.providerId || null;
}

async function readError(res: Response, fallback: string): Promise<Error & { code?: string }> {
  let message = fallback;
  let code: string | undefined;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
    code = body?.code;
  } catch {
    // respuesta sin JSON
  }
  const err = new Error(message) as Error & { code?: string };
  err.code = code;
  return err;
}

export const accountService = {
  /** Descarga un JSON con todos los datos de la cuenta. */
  async exportData(): Promise<void> {
    const res = await authFetch('/api/account/export');
    if (!res.ok) throw await readError(res, 'No se pudo generar la exportación.');
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] || 'cultiveta-export.json';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  /**
   * Borra la cuenta y todos sus datos. Antes reautentica (contraseña o Google) porque el
   * servidor exige un inicio de sesión de los últimos 5 minutos.
   */
  async deleteAccount(password?: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('No hay una sesión activa.');
    const uid = user.uid;

    if (getSignInProvider() === 'password') {
      if (!user.email || !password) throw new Error('Ingresá tu contraseña para confirmar.');
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    } else {
      await reauthenticateWithPopup(user, googleProvider);
    }
    // Token nuevo con la hora de inicio de sesión actualizada
    await user.getIdToken(true);

    const res = await authFetch('/api/account/delete', { method: 'POST' });
    if (!res.ok) throw await readError(res, 'No se pudo eliminar la cuenta.');

    this.clearLocalData(uid);
    await signOut(auth).catch(() => {});
  },

  /** Borra los datos guardados en este dispositivo para esa cuenta. */
  clearLocalData(uid: string): void {
    localStore.clearUserData(uid);
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('cultiveta_') && (key.includes(uid) || key === 'cultiveta_last_user_id')) {
          keys.push(key);
        }
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {
      // almacenamiento no disponible
    }
    try {
      // Cola offline de fotos pendientes de este dispositivo
      indexedDB.deleteDatabase(OFFLINE_DB_NAME);
    } catch {
      // IndexedDB no disponible
    }
  },
};
