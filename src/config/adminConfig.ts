/**
 * Configuración y utilidades de verificación administrativa en frontend.
 * 
 * Reglas de seguridad:
 * 1. La autoridad final reside EXCLUSIVAMENTE en el servidor y Firebase Auth (/api/admin/me).
 * 2. Ningún UID ficticio ni configuración en cliente otorga privilegios.
 * 3. Ni localStorage ni UserProfile determinan acceso administrativo.
 */

export interface AdminMeResponse {
  authenticated: boolean;
  isAdmin: boolean;
  userId?: string;
  storageAvailable?: boolean;
}

export const ADMIN_CONFIG = {
  /**
   * Consulta el endpoint seguro del servidor /api/admin/me utilizando el token JWT verificado.
   * La respuesta del servidor es la única autoridad de seguridad.
   */
  async fetchAdminStatus(idToken: string | null): Promise<AdminMeResponse> {
    if (!idToken) {
      return { authenticated: false, isAdmin: false };
    }

    try {
      const res = await fetch('/api/admin/me', {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!res.ok) {
        return { authenticated: false, isAdmin: false };
      }

      const data = await res.json();
      return {
        authenticated: Boolean(data?.authenticated),
        isAdmin: Boolean(data?.isAdmin),
        userId: data?.userId,
        storageAvailable: Boolean(data?.storageAvailable),
      };
    } catch {
      return { authenticated: false, isAdmin: false };
    }
  },

  /**
   * Helper síncrono para UI inicial/optimista.
   * La autorización real y final siempre proviene del backend /api/admin/me.
   */
  isUserAdminOrCreator(
    userProfile?: { role?: string; isCreator?: boolean; uid?: string } | null,
    uid?: string
  ): boolean {
    if (!userProfile && !uid) return false;
    if (userProfile?.role === 'admin' || userProfile?.isCreator === true) {
      return true;
    }
    return false;
  },
};
