/**
 * Configuración centralizada de seguridad y permisos para creador/administrador de Cultiveta.
 * 
 * Reglas de diseño:
 * 1. Control real de permisos: No resolver esto únicamente con 'display: none' o condicionales visuales.
 * 2. Soporta UserProfile.role === 'admin' o UserProfile.isCreator === true.
 * 3. Centraliza identificadores de creador (UIDs) en esta configuración y variables de entorno,
 *    evitando repetir cadenas o hardcodear emails privados por toda la aplicación.
 */

// UIDs preconfigurados con privilegios de creador / administrador
const DEFAULT_CREATOR_UIDS: string[] = [
  'creator-cultiveta-admin',
  'admin-cultiveta-main',
  'cultiveta-creator-master',
];

export const ADMIN_CONFIG = {
  /**
   * Lista de UIDs reconocidos como creador / admin.
   * Permite inyectar vía VITE_CREATOR_UID en tiempo de compilación/despliegue.
   */
  CREATOR_UIDS: [
    ...DEFAULT_CREATOR_UIDS,
    typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_CREATOR_UID
      ? (import.meta as any).env.VITE_CREATOR_UID
      : '',
  ].filter(Boolean),

  /**
   * Determina si un usuario autenticado posee permisos reales de creador / administrador.
   * Valida roles persistidos en el perfil o coincidencia con la lista centralizada de UIDs.
   */
  isUserAdminOrCreator(
    userProfile?: { role?: string; isCreator?: boolean; uid?: string } | null,
    uid?: string
  ): boolean {
    if (!userProfile && !uid) return false;

    // 1. Privilegios explícitos en el perfil del usuario
    if (userProfile?.role === 'admin' || userProfile?.isCreator === true) {
      return true;
    }

    // 2. Coincidencia de UID con la configuración centralizada de creador
    const targetUid = uid || userProfile?.uid;
    if (targetUid && ADMIN_CONFIG.CREATOR_UIDS.includes(targetUid)) {
      return true;
    }

    return false;
  },
};
