import type { RequestHandler } from 'express';

/**
 * Obtiene la lista autorizada de UIDs administrativos exclusivamente configurados
 * en variables de entorno del servidor.
 * No expone UIDs ficticios ni valores predeterminados de desarrollo en producción.
 */
export function getServerAdminUids(): string[] {
  const list: string[] = [];
  if (process.env.CREATOR_UID) {
    const val = process.env.CREATOR_UID.trim();
    if (val) list.push(val);
  }
  if (process.env.ADMIN_UID) {
    const val = process.env.ADMIN_UID.trim();
    if (val) list.push(val);
  }
  if (process.env.ADMIN_UIDS) {
    process.env.ADMIN_UIDS.split(',').forEach((uid) => {
      const val = uid.trim();
      if (val) list.push(val);
    });
  }
  return list;
}

/**
 * Evalúa si una solicitud autenticada proviene de un creador/administrador verificado.
 * Fuentes autorizadas estrictas:
 * A. Firebase Custom Claims (admin: true o creator: true)
 * B. UID en variables de entorno del servidor (CREATOR_UID, ADMIN_UID, ADMIN_UIDS)
 */
export function isRequestAdmin(req: { user?: any; userId?: string }): boolean {
  if (!req.userId) return false;

  // A. Firebase Custom Claims verificados criptográficamente
  if (req.user?.admin === true || req.user?.creator === true) {
    return true;
  }

  // B. UIDs configurados exclusivamente en variables de entorno del servidor
  const serverAdminUids = getServerAdminUids();
  if (serverAdminUids.includes(req.userId)) {
    return true;
  }

  return false;
}

/**
 * Middleware para restringir rutas exclusivamente a administradores verificados.
 */
export const verifyAdminRole: RequestHandler = async (req, res, next) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({
      error: 'Acceso no autorizado: Se requiere autenticación.',
      code: 'auth/unauthenticated',
    });
  }

  if (isRequestAdmin(req)) {
    return next();
  }

  return res.status(403).json({
    error: 'Acceso denegado: Se requieren permisos de creador/administrador de Cultiveta.',
    code: 'auth/forbidden',
  });
};
