import type { RequestHandler } from 'express';
import { getFirebaseAdmin } from './firebaseAdminHelper';

/**
 * Middleware para verificar que el usuario autenticado tiene permisos reales de administrador/creador.
 *
 * Criterios de autorización:
 * 1. UID en la lista centralizada de creadores (variables de entorno o predeterminado seguro).
 * 2. Perfil en Firestore con role: 'admin' o isCreator: true.
 */
export const verifyAdminRole: RequestHandler = async (req, res, next) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({
      error: 'Acceso no autorizado: Se requiere autenticación.',
      code: 'auth/unauthenticated',
    });
  }

  // 1. Verificar si está en la lista de UIDs predeterminados o por variable de entorno
  const creatorUids = [
    'creator-cultiveta-admin',
    'admin-cultiveta-main',
    'cultiveta-creator-master',
    process.env.CREATOR_UID,
    process.env.ADMIN_UID,
  ].filter(Boolean);

  if (creatorUids.includes(userId)) {
    return next();
  }

  // 2. Verificar en Firestore el perfil del usuario (role === 'admin' o isCreator === true)
  try {
    const adminApp = getFirebaseAdmin();
    if (adminApp) {
      const db = (adminApp as any).firestore();
      const userSnap = await db.collection('users').doc(userId).get();
      if (userSnap.exists) {
        const userData = userSnap.data();
        if (userData?.role === 'admin' || userData?.isCreator === true) {
          return next();
        }
      }
    }
  } catch (err) {
    console.warn('[verifyAdminRole] No se pudo verificar rol en Firestore:', err);
  }

  return res.status(403).json({
    error: 'Acceso denegado: Se requieren permisos de creador/administrador de Cultiveta.',
    code: 'auth/forbidden',
  });
};
