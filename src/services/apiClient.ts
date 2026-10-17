import { auth } from '../firebase/config';

/**
 * fetch hacia la API propia agregando el token de Firebase de la sesión actual.
 * Las rutas /api/* privadas lo exigen (sin él responden 401).
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
