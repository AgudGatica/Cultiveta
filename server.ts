import { executeAIWithRotationAndFallback, buildAgronomicDeterministicFallback } from './src/services/aiAgronomicFallback';
import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'crypto';
import multer from 'multer';
import { CultivationTask } from './src/types';
import { verifyAdminRole, isRequestAdmin } from './src/server/adminAuthMiddleware';
import { validateImageBuffer } from './src/server/imageValidation';
import { getGeneticsPhotoKey } from './src/utils/geneticsKeyUtils';
import { cleanFirestoreData } from './src/utils/firestoreUtils';

dotenv.config();

// Extensión de tipos de Express para incluir los datos del usuario autenticado
declare global {
  namespace Express {
    interface Request {
      user?: DecodedIdToken;
      userId?: string;
    }
  }
}

const app = express();
// Cloud Run asigna el puerto por variable de entorno; 3000 queda para desarrollo local.
const PORT = Number(process.env.PORT) || 3000;

// Zona horaria de los registros automáticos (fecha y hora que ve la persona).
// El servidor corre en UTC en Cloud Run; sin esto, una medición de las 22 h de Argentina
// quedaría con la fecha del día siguiente.
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Argentina/Buenos_Aires';

// Límite de cuerpo: las rutas de IA aceptan imágenes en base64 (máx. 10 MB de imagen ≈ 14 MB en base64);
// el resto de la API no necesita más de 2 MB. El primer parser que procesa el cuerpo es el que aplica.
app.use('/api/ai', express.json({ limit: '15mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

/** Fecha (YYYY-MM-DD), hora (HH:mm) y clave horaria (YYYYMMDDHH) en APP_TIMEZONE. */
export function getZonedParts(date: Date = new Date(), timeZone: string = APP_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
  const timeStr = `${get('hour')}:${get('minute')}`;
  return { dateStr, timeStr, hourKey: `${dateStr.replace(/-/g, '')}${get('hour')}`, dayKey: dateStr.replace(/-/g, '') };
}

/** Respuesta de error sin exponer detalles internos al cliente (el detalle queda en el log). */
function sendServerError(res: express.Response, status: number, publicMessage: string, err: unknown, logTag: string) {
  console.error(`[${logTag}]`, err);
  return res.status(status).json({ error: publicMessage });
}

/** Agrega un elemento a un arreglo en memoria reemplazando por id y conservando solo los últimos `max`. */
function upsertCapped<T extends { id: string }>(list: T[], item: T, max = 500) {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) list[idx] = item;
  else list.push(item);
  if (list.length > max) list.splice(0, list.length - max);
}

export type FirebaseAdminAppWithFirestore = App & {
  firestore: () => Firestore;
};

// Cargar configuración explícita de Firebase desde firebase-applet-config.json
let appletFirebaseConfig: {
  projectId?: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
} = {};

try {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    appletFirebaseConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    console.log('[server.ts] Configuración Firebase sincronizada:', {
      projectId: appletFirebaseConfig.projectId,
      firestoreDatabaseId: appletFirebaseConfig.firestoreDatabaseId || '(default)',
      storageBucket: appletFirebaseConfig.storageBucket,
    });
  }
} catch (cfgErr) {
  console.warn('[server.ts] No se pudo leer firebase-applet-config.json:', cfgErr);
}

// Indica si hay credenciales de Firebase Admin disponibles (Cloud Run / ADC / cuenta de servicio).
// Sin ellas (p. ej. desarrollo local en una PC), las consultas de Firestore Admin fallan de forma
// asíncrona fuera del try/catch y tiran abajo el proceso.
export function hasAdminCredentials(): boolean {
  if (process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS) return true;
  if (process.env.K_SERVICE || process.env.FUNCTION_TARGET) return true;
  const adcPath = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'gcloud', 'application_default_credentials.json')
    : path.join(process.env.HOME || '', '.config', 'gcloud', 'application_default_credentials.json');
  return fs.existsSync(adcPath);
}

// Red de seguridad para desarrollo local: Storage Admin también puede lanzar el error de
// credenciales de forma asíncrona y no capturable. Fuera de producción, se registra y el
// servidor sigue funcionando.
if (process.env.NODE_ENV !== 'production' && !hasAdminCredentials()) {
  process.on('uncaughtException', (err) => {
    if (err?.message?.includes('Could not load the default credentials')) {
      console.warn('[Firebase Admin] Operación omitida: sin credenciales en desarrollo local.');
      return;
    }
    throw err;
  });
}

// 1. Inicialización segura y perezosa de Firebase Admin SDK
let firebaseAdminApp: App | null = null;
export function getFirebaseAdmin(): FirebaseAdminAppWithFirestore {
  if (!firebaseAdminApp) {
    if (getApps().length > 0) {
      firebaseAdminApp = getApps()[0];
    } else {
      const projectId =
        process.env.FIREBASE_PROJECT_ID ||
        appletFirebaseConfig.projectId ||
        process.env.GCLOUD_PROJECT ||
        'gen-lang-client-0531791519';

      // Soporte para clave de cuenta de servicio en JSON (opcional para entornos externos a GCP)
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
          const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
          firebaseAdminApp = initializeApp({
            credential: cert(serviceAccount),
            projectId: serviceAccount.project_id || projectId,
          });
        } catch (err) {
          console.error('[Firebase Admin] Error parseando FIREBASE_SERVICE_ACCOUNT JSON:', err);
        }
      }

      // Inicialización por defecto (utiliza Application Default Credentials / ADC en Cloud Run)
      if (!firebaseAdminApp) {
        firebaseAdminApp = initializeApp({ projectId });
      }
    }
  }

  // Vincular método .firestore() con soporte para base de datos nombrada (firestoreDatabaseId)
  (firebaseAdminApp as any).firestore = () => {
    // Fallar de forma síncrona (capturable por los try/catch de cada ruta) en vez de dejar que
    // google-auth-library lance el error de credenciales fuera de la cadena de promesas.
    if (!hasAdminCredentials()) {
      throw new Error('Sin credenciales de Firebase Admin (desarrollo local)');
    }
    const databaseId =
      process.env.FIRESTORE_DATABASE_ID ||
      appletFirebaseConfig.firestoreDatabaseId;
    return databaseId
      ? getFirestore(firebaseAdminApp!, databaseId)
      : getFirestore(firebaseAdminApp!);
  };

  return firebaseAdminApp as FirebaseAdminAppWithFirestore;
}

// 2. Middleware de Validación de Firebase Authentication (verifyFirebaseAuth)
export const verifyFirebaseAuth: express.RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // 1. Verificar presencia y formato del encabezado
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Acceso no autorizado: Se requiere encabezado de autorización en formato "Bearer <token>".',
      code: 'auth/missing-token',
    });
  }

  const idToken = authHeader.split('Bearer ')[1]?.trim();

  // 2. Verificar que el token no esté vacío
  if (!idToken) {
    return res.status(401).json({
      error: 'Acceso no autorizado: El token de autenticación provisto está vacío.',
      code: 'auth/empty-token',
    });
  }

  // 3. Inicializar Firebase Admin SDK con manejo de errores de configuración
  let adminApp: App;
  let adminAuth: ReturnType<typeof getAuth>;
  try {
    adminApp = getFirebaseAdmin();
    adminAuth = getAuth(adminApp);
  } catch (initErr: any) {
    console.error('[verifyFirebaseAuth] Error interno inicializando Firebase Admin SDK:', initErr);
    return res.status(500).json({
      error: 'Error interno en la configuración de autenticación del servidor.',
      code: 'auth/server-config-error',
    });
  }

  // 4. Validar estrictamente el JWT emitido por Firebase Auth
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    // Inyectar la identidad verificada del usuario en la petición Express
    req.user = decodedToken;
    req.userId = decodedToken.uid;

    return next();
  } catch (error: any) {
    console.warn('[verifyFirebaseAuth] Verificación de token fallida:', error?.code || error?.message);

    // Manejo granular de errores de autenticación
    if (error?.code === 'auth/id-token-expired') {
      return res.status(401).json({
        error: 'Acceso no autorizado: El token de sesión ha expirado. Por favor renueva tu sesión.',
        code: 'auth/id-token-expired',
      });
    }

    if (error?.code === 'auth/id-token-revoked') {
      return res.status(401).json({
        error: 'Acceso no autorizado: La sesión o token de autenticación ha sido revocado.',
        code: 'auth/id-token-revoked',
      });
    }

    if (error?.code === 'auth/argument-error' || error?.code === 'auth/invalid-id-token') {
      return res.status(401).json({
        error: 'Acceso no autorizado: Token de autenticación inválido o malformado.',
        code: 'auth/invalid-token',
      });
    }

    return res.status(401).json({
      error: 'Acceso no autorizado: Token de autenticación inválido, expirado o manipulado.',
      code: error?.code || 'auth/invalid-token',
    });
  }
};

// Lazy initialization of Gemini API
function isQuotaOrCreditExhausted(err: any): boolean {
  if (!err) return false;
  const msg = (err?.message || (typeof err === 'string' ? err : JSON.stringify(err)) || '').toLowerCase();
  const code = err?.code || err?.status || err?.error?.code || err?.error?.status;
  return (
    code === 402 ||
    code === 429 ||
    code === 'RESOURCE_EXHAUSTED' ||
    msg.includes('prepayment credits are depleted') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('402')
  );
}

let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// 1. Health check público
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Proteger todas las rutas /api/ai/* con el middleware de Firebase Auth
app.use('/api/ai', verifyFirebaseAuth);

// Límite diario de consultas a la IA por persona (cada consulta tiene costo en Gemini).
// Se cuenta en Firestore (colección reservada aiUsage, sin acceso desde el cliente) y,
// sin credenciales de Admin (desarrollo local), en memoria.
const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT) || 60;
const localAiUsage = new Map<string, number>();

async function consumeAiQuota(userId: string): Promise<{ allowed: boolean; used: number }> {
  const { dateStr } = getZonedParts();
  const key = `${userId}_${dateStr}`;

  if (!hasAdminCredentials()) {
    const used = (localAiUsage.get(key) || 0) + 1;
    localAiUsage.set(key, used);
    return { allowed: used <= AI_DAILY_LIMIT, used };
  }

  const db = getFirebaseAdmin().firestore();
  const ref = db.collection('aiUsage').doc(key);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? Number(snap.data()?.count || 0) : 0;
    if (current >= AI_DAILY_LIMIT) {
      return { allowed: false, used: current };
    }
    tx.set(ref, { userId, date: dateStr, count: current + 1, updatedAt: new Date().toISOString() }, { merge: true });
    return { allowed: true, used: current + 1 };
  });
}

app.use('/api/ai', async (req, res, next) => {
  try {
    const quota = await consumeAiQuota(req.userId!);
    if (!quota.allowed) {
      return res.status(429).json({
        error: `Llegaste al límite de ${AI_DAILY_LIMIT} consultas a Cultiveta IA por hoy. Probá de nuevo mañana.`,
        code: 'ai/daily-limit',
      });
    }
    return next();
  } catch (err) {
    // Si el contador falla no se bloquea a la persona: se registra y se continúa.
    console.warn('[Cultiveta IA] No se pudo registrar el uso diario:', err);
    return next();
  }
});

// Helper para resolver de forma segura y tipada los bytes de una imagen para Gemini Multimodal
// Previene vulnerabilidades SSRF (no descarga URLs externas no verificadas) y utiliza Firebase Admin Storage SDK
async function resolveImagePart(
  reqUserId: string,
  body: {
    photoId?: string;
    cultivationId?: string;
    storagePath?: string;
    photoBase64OrUrl?: string;
  }
): Promise<{ inlineData: { mimeType: string; data: string } } | null> {
  const { photoId, cultivationId, storagePath, photoBase64OrUrl } = body;

  // 1. Obtener desde Firebase Storage Bucket mediante SDK Admin
  const targetPath =
    storagePath ||
    (photoId && cultivationId ? `users/${reqUserId}/cultivations/${cultivationId}/photos/${photoId}.jpg` : null);

  if (targetPath) {
    // Validar aislamiento de inquilino (tenant isolation): la ruta DEBE pertenecer al usuario autenticado
    if (!targetPath.startsWith(`users/${reqUserId}/`)) {
      throw new Error('Acceso denegado: No tienes permiso para acceder a esta fotografía.');
    }

    try {
      const adminApp = getFirebaseAdmin();
      const bucketName =
        process.env.FIREBASE_STORAGE_BUCKET ||
        appletFirebaseConfig.storageBucket ||
        'gen-lang-client-0531791519.firebasestorage.app';
      const bucket = getStorage(adminApp).bucket(bucketName);
      const file = bucket.file(targetPath);
      const [exists] = await file.exists();
      if (exists) {
        const [buffer] = await file.download();
        const [metadata] = await file.getMetadata();
        const mimeType = (metadata.contentType as string) || 'image/jpeg';
        return {
          inlineData: {
            mimeType,
            data: buffer.toString('base64'),
          },
        };
      }
    } catch (storageErr) {
      console.warn('[resolveImagePart] Error leyendo imagen desde Firebase Storage bucket:', storageErr);
    }
  }

  // 2. Imagen en base64 (Data URL) enviada por el cliente
  if (photoBase64OrUrl && photoBase64OrUrl.startsWith('data:image/')) {
    const match = photoBase64OrUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
    if (!match) {
      throw new Error('Formato de imagen no soportado. Debe ser JPEG, PNG o WebP en base64.');
    }
    const mimeType = match[1].toLowerCase();
    const data = match[2];

    // Límite de tamaño máximo: 10 MB
    const approximateBytes = (data.length * 3) / 4;
    if (approximateBytes > 10 * 1024 * 1024) {
      throw new Error('La imagen excede el límite máximo de tamaño permitido (10 MB).');
    }

    return {
      inlineData: {
        mimeType,
        data,
      },
    };
  }

  // 3. URL de Firebase Storage del propio proyecto perteneciente al usuario autenticado
  if (photoBase64OrUrl && typeof photoBase64OrUrl === 'string' && photoBase64OrUrl.startsWith('https://')) {
    const isFirebaseStorage =
      photoBase64OrUrl.includes('firebasestorage.googleapis.com') ||
      photoBase64OrUrl.includes('firebasestorage.app');

    const containsUserOwnership =
      photoBase64OrUrl.includes(encodeURIComponent(`users/${reqUserId}/`)) ||
      photoBase64OrUrl.includes(`users/${reqUserId}/`);

    if (isFirebaseStorage && containsUserOwnership) {
      try {
        const resp = await fetch(photoBase64OrUrl, { signal: AbortSignal.timeout(9000) });
        if (resp.ok) {
          const contentType = resp.headers.get('content-type') || 'image/jpeg';
          if (!contentType.startsWith('image/')) {
            throw new Error('El archivo recuperado no corresponde a una imagen válida.');
          }
          const arrayBuf = await resp.arrayBuffer();
          if (arrayBuf.byteLength > 10 * 1024 * 1024) {
            throw new Error('La imagen excede el límite de 10 MB.');
          }
          return {
            inlineData: {
              mimeType: contentType,
              data: Buffer.from(arrayBuf).toString('base64'),
            },
          };
        }
      } catch (fetchErr: any) {
        console.warn('[resolveImagePart] Error descargando Storage URL verificada:', fetchErr?.message);
      }
    } else {
      // Bloqueo explícito de URLs externas arbitrarias para prevenir SSRF
      throw new Error(
        'Por seguridad (protección SSRF), no se permite procesar URLs externas arbitrarias. Provee identificadores de registro o imagen en base64.'
      );
    }
  }

  return null;
}

// 2. Photo Analysis (Gemini Multimodal) - Protegido por verifyFirebaseAuth
app.post('/api/ai/analyze-photo', async (req, res) => {
  try {
    const { photoId, cultivationId, storagePath, photoBase64OrUrl, category, userComments, cultivationContext } = req.body;
    const userId = req.userId!;

    // 1. Resolver y obtener los bytes reales de la imagen multimodal
    let imagePart: { inlineData: { mimeType: string; data: string } } | null = null;
    try {
      imagePart = await resolveImagePart(userId, {
        photoId,
        cultivationId: cultivationId || cultivationContext?.id,
        storagePath,
        photoBase64OrUrl,
      });
    } catch (imageErr: any) {
      return res.status(400).json({ error: imageErr?.message || 'Error validando la imagen suministrada.' });
    }

    if (!imagePart || !imagePart.inlineData?.data) {
      return res.status(400).json({
        error: 'No se pudo obtener el contenido visual de la imagen para su análisis. Asegúrate de que la foto exista y sea accesible.',
      });
    }

    const ai = getAIClient();

    const contextPrompt = `
Eres Cultiveta IA, el asistente inteligente y botánico de la aplicación Cultiveta.
Tu rol es analizar con rigor botánico, tono amigable, humilde y sin alarmismos ni certezas absolutas la fotografía de una planta de cultivo privado personal.

REGLAS DE ORO:
1. Nunca inventes datos que no estén presentes ni des diagnósticos como verdades infalibles.
2. Evita lenguaje excesivamente médico o clínico (no uses "paciente", "clínico", "diagnóstico definitivo"). Usa "Estado del cultivo", "Posible causa", "Observación", "Algo para revisar".
3. Usa siempre la estructura de salida especificada.
4. Si faltan datos (p.ej. no se sabe el pH o el tipo de luz), indícalo amablemente en "Qué información falta".

CONTEXTO REGISTRADO DEL CULTIVO:
${cultivationContext ? JSON.stringify(cultivationContext, null, 2) : 'No se proveyó contexto adicional.'}
Categoría de foto seleccionada por el usuario: ${category || 'No especificada'}
Comentario del usuario: ${userComments || 'Ninguno'}

Responde estrictamente en formato JSON válido con las siguientes claves:
{
  "observed": "Descripción clara y detallada de lo que se observa a nivel visual en la imagen (color, estructura, hojas, tallos, tricomas, etc.)",
  "possibleCauses": ["Hipótesis 1 compatible con los signos visibles", "Hipótesis 2 alternativa si aplica"],
  "relatedCultivationData": ["Dato registrado que se relaciona o refuerza la observación", "Parámetro ambiental o de riego relevante"],
  "missingInformation": ["Dato no registrado que ayudaría a precisar la hipótesis (p. ej. pH de drenaje, distancia lumínica, etc.)"],
  "confidence": "Baja" | "Media" | "Alta"
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          role: 'user',
          parts: [
            imagePart,
            { text: contextPrompt },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const responseText = response.text || '';
    if (!responseText.trim()) {
      return res.status(502).json({
        error: 'El modelo no devolvió una respuesta válida.',
        code: 'ai/empty-response',
      });
    }

    let parsedResult: any;
    try {
      parsedResult = JSON.parse(responseText);
    } catch {
      return res.status(502).json({
        error: 'Error al interpretar la respuesta generada por Cultiveta IA.',
        code: 'ai/json-parse-error',
      });
    }

    // Validación estricta en tiempo de ejecución (FASE 5)
    if (
      !parsedResult ||
      typeof parsedResult.observed !== 'string' ||
      !parsedResult.observed.trim() ||
      !Array.isArray(parsedResult.possibleCauses) ||
      parsedResult.possibleCauses.length === 0
    ) {
      return res.status(502).json({
        error: 'El análisis de la imagen no arrojó resultados botánicos concluyentes. Por favor intenta con una foto más nítida.',
        code: 'ai/invalid-structure',
      });
    }

    // Asegurar estructura coherente
    const validatedResult = {
      observed: String(parsedResult.observed).trim(),
      possibleCauses: Array.isArray(parsedResult.possibleCauses)
        ? parsedResult.possibleCauses.map((c: any) => String(c).trim()).filter(Boolean)
        : ['Observación botánica general'],
      relatedCultivationData: Array.isArray(parsedResult.relatedCultivationData)
        ? parsedResult.relatedCultivationData.map((d: any) => String(d).trim()).filter(Boolean)
        : [],
      missingInformation: Array.isArray(parsedResult.missingInformation)
        ? parsedResult.missingInformation.map((m: any) => String(m).trim()).filter(Boolean)
        : [],
      confidence: ['Baja', 'Media', 'Alta'].includes(parsedResult.confidence)
        ? parsedResult.confidence
        : 'Media',
    };

    res.json(validatedResult);
  } catch (error: any) {
    return sendServerError(res, 500, 'Error procesando el análisis con Cultiveta IA.', error, 'ai/analyze-photo');
  }
});

// 3. Contextual Chat for Cultivation
app.post('/api/ai/chat', async (req, res) => {
  const {
    message,
    history = [],
    cultivation,
    recentWaterings,
    recentEnv,
    recentPhotos,
    recentNotes,
    condensedSummary,
    intelligenceContext,
  } = req.body;

  const cropName = intelligenceContext?.identity?.name || cultivation?.name;

  try {
    const ai = getAIClient();

    const systemInstruction = `
Eres Cultiveta IA, el compañero experto y botánico de la aplicación Cultiveta.
${cropName ? `Estás conversando con el cultivador sobre su cultivo: "${cropName}".` : `Estás conversando con el cultivador sobre botánica y cultivo general (sin cultivo específico seleccionado).`}

PRINCIPIO CENTRAL DE CULTIVETA:
DATOS REALES → CÁLCULOS DETERMINISTAS → ESTIMACIONES CON INCERTIDUMBRE → IA QUE INTERPRETA Y EXPLICA
Tú NO inventas cálculos matemáticos de secado ni fechas de riego; interpretas el motor determinista.

${intelligenceContext ? `=== CONTEXTO AGRONÓMICO DE ALTA PRECISIÓN (PRECALCULADO DETERMINISTA) ===
1. IDENTIDAD DEL CULTIVO:
- Nombre: ${intelligenceContext.identity.name}
- Genética: ${intelligenceContext.identity.geneticsName || 'Sin especificar'} (Banco: ${intelligenceContext.identity.seedBank || 'N/A'})
- Tipo: ${intelligenceContext.identity.type} | Plantas: ${intelligenceContext.identity.plantCount}
- Sustrato: ${intelligenceContext.identity.substrateType || 'No registrado'} (${intelligenceContext.identity.potVolumeLiters ? `${intelligenceContext.identity.potVolumeLiters}L` : 'Volumen no registrado'}${intelligenceContext.identity.potType ? `, maceta ${intelligenceContext.identity.potType}` : ''})
- Iluminación: ${intelligenceContext.identity.lightingType || 'N/A'} (${intelligenceContext.identity.lightingWatts ? `${intelligenceContext.identity.lightingWatts}W` : 'potencia s/d'}) | Fotoperiodo: ${intelligenceContext.identity.photoperiodHoursLight !== undefined && intelligenceContext.identity.photoperiodHoursDark !== undefined ? `${intelligenceContext.identity.photoperiodHoursLight}h luz / ${intelligenceContext.identity.photoperiodHoursDark}h oscuridad` : 'No registrado'}

2. CRONOLOGÍA Y ETAPAS:
- Fecha de inicio: ${intelligenceContext.chronology.startDate} (Día real transcurrido: ${intelligenceContext.chronology.realDaysElapsed})
- Etapa actual: ${intelligenceContext.chronology.currentStage} (Días en etapa actual: ${intelligenceContext.chronology.daysInActiveStage})
- Fecha estimada de corte/cosecha: ${intelligenceContext.chronology.estimatedHarvestDate} (${intelligenceContext.chronology.hasStageAdjustments ? `ajuste de ${intelligenceContext.chronology.adjustmentDeltaDays} días respecto a proyección inicial` : 'cronograma alineado'})
- Historial de etapas completadas: ${JSON.stringify(intelligenceContext.chronology.completedStages, null, 2)}

3. MOTOR DE INTELIGENCIA HÍDRICA (IRRIGATION FORECAST DETERMINISTA):
- Último riego: ${intelligenceContext.irrigation.lastWatering ? `${intelligenceContext.irrigation.lastWatering.volumeLiters} L el ${intelligenceContext.irrigation.lastWatering.date} ${intelligenceContext.irrigation.lastWatering.time || ''} (hace ~${intelligenceContext.irrigation.forecast.hoursSinceLastWatering ?? '?'} h)` : 'Sin riegos registrados'}
- Drenaje/Runoff último riego: ${intelligenceContext.irrigation.lastWatering?.runoffVolumeLiters !== undefined ? `${intelligenceContext.irrigation.lastWatering.runoffVolumeLiters} L` : 'No registrado'}
- Ventana estimada para REVISAR el próximo riego: ${intelligenceContext.irrigation.forecast.wateringWindowStart ? `${intelligenceContext.irrigation.forecast.wateringWindowStart} a ${intelligenceContext.irrigation.forecast.wateringWindowEnd}` : 'Pendiente de datos'}
- Nivel de confianza del motor: ${intelligenceContext.irrigation.forecast.confidence.toUpperCase()}
- Factores agronómicos deterministas:
${intelligenceContext.irrigation.forecast.factors.map((f: string) => `  • ${f}`).join('\n')}
- Señales faltantes: ${intelligenceContext.irrigation.forecast.missingSignals.join(', ') || 'Ninguna'}
- Mediana histórica de intervalo entre riegos: ${intelligenceContext.irrigation.statistics.medianIntervalHours ? `${intelligenceContext.irrigation.statistics.medianIntervalHours} h` : 'N/A'} (Promedio: ${intelligenceContext.irrigation.statistics.averageIntervalHours ? `${intelligenceContext.irrigation.statistics.averageIntervalHours} h` : 'N/A'})
- Mediana histórica de volumen aplicado: ${intelligenceContext.irrigation.statistics.medianVolumeLiters ? `${intelligenceContext.irrigation.statistics.medianVolumeLiters} L` : 'N/A'}
${intelligenceContext.irrigation.statistics.intervalByVpdLevel ? `- Relación ambiente ↔ riego (por VPD): Low VPD (<1.0 kPa): ${intelligenceContext.irrigation.statistics.intervalByVpdLevel.lowVpdAvgHours ?? 's/d'} h | Med VPD (1.0-1.4 kPa): ${intelligenceContext.irrigation.statistics.intervalByVpdLevel.mediumVpdAvgHours ?? 's/d'} h | High VPD (>1.4 kPa): ${intelligenceContext.irrigation.statistics.intervalByVpdLevel.highVpdAvgHours ?? 's/d'} h (muestra: ${intelligenceContext.irrigation.statistics.intervalByVpdLevel.sampleSize} episodios)` : ''}

4. AMBIENTE AGREGADO:
- Última medición: ${JSON.stringify(intelligenceContext.environment.latest || 'N/A')}
- Promedio desde último riego: Temp ${intelligenceContext.environment.avgSinceLastWatering.tempC ?? 's/d'}°C (Max ${intelligenceContext.environment.avgSinceLastWatering.maxTempC ?? 's/d'}°C), Humedad ${intelligenceContext.environment.avgSinceLastWatering.humidityPct ?? 's/d'}%, VPD ${intelligenceContext.environment.avgSinceLastWatering.vpdKPa ?? 's/d'} kPa (Max ${intelligenceContext.environment.avgSinceLastWatering.maxVpdKPa ?? 's/d'} kPa), DLI ~${intelligenceContext.environment.avgSinceLastWatering.estimatedDli ?? 's/d'} mol/m²/d

5. METADATA DE FOTOS, NOTAS Y COSECHAS:
- Notas registradas: ${intelligenceContext.notesAndPhotos?.recentNotesCount ?? 0}
- Fotos registradas: ${intelligenceContext.notesAndPhotos?.recentPhotosCount ?? 0}
- Cosechas registradas del cultivador: ${intelligenceContext.harvestsSummary?.pastHarvestsCount ?? 0}
=============================================================================` : cultivation ? `INFORMACIÓN BÁSICA DEL CULTIVO:
- Etapa actual: ${cultivation.currentStage || 'No especificada'}
- Tipo: ${cultivation.type || 'No especificado'}
- Genética: ${cultivation.geneticsName || 'Sin especificar'} (Banco: ${cultivation.seedBank || 'N/A'})
- Cantidad de plantas: ${cultivation.plantCount ?? 'No especificada'}
- Sustrato: ${cultivation.substrate?.type || 'No especificado'} (${cultivation.substrate?.potVolumeLiters ? `${cultivation.substrate?.potVolumeLiters}L` : 'Volumen no registrado'})
- Iluminación: ${cultivation.lighting?.type || 'N/A'}` : `CONSULTA GENERAL:
El usuario no ha seleccionado un cultivo específico. Responde a sus dudas agronómicas o botánicas generales sin asumir tipo de ambiente, genéticas ni cantidades de plantas inventadas.`}

${condensedSummary && Array.isArray(condensedSummary) && condensedSummary.length > 0 ? `=== MODO RESUMEN ACTIVADO POR EL CULTIVADOR ===
Puntos clave condensados:
${condensedSummary.map((point: string) => `• ${point}`).join('\n')}
==============================================` : ''}

REGISTROS RECIENTES:
- Riegos recientes: ${JSON.stringify(recentWaterings || [], null, 2)}
- Ambiente reciente: ${JSON.stringify(recentEnv || [], null, 2)}
- Fotos recientes: ${JSON.stringify(recentPhotos || [], null, 2)}
- Notas del diario: ${JSON.stringify(recentNotes || [], null, 2)}

REGLAS ESTRICTAS DE RESPUESTA:
1. DIFERENCIAR CLARAMENTE:
   - DATO REAL: Lo que el usuario registró explícitamente ("Regaste 1.5 L el 2 de octubre").
   - CÁLCULO: Estadística o valor matemático derivado ("La mediana de tus últimos riegos es 63 h").
   - ESTIMACIÓN CON INCERTIDUMBRE: Proyección ("La ventana estimada para revisar la maceta es entre mañana 15:00 y 21:00").
2. PRÓXIMO RIEGO:
   - Si el usuario pregunta "¿cuándo riego?" o "¿necesita agua?", consulta SIEMPRE la ventana determinista.
   - Si no hay datos suficientes (confianza baja o sin riegos), dilo con honestidad: "No hay riegos registrados para calcular la tasa de secado".
   - NUNCA des una hora exacta como certeza matemática. Presenta la ventana como recordatorio para "revisar la maceta".
3. TONO:
   - Cercano, claro, riguroso botánicamente, en español argentino neutro y cordial ("¡Hola! Mirando tus registros...", "Te recomiendo revisar...").
   - Responde siempre con estructura concisa en formato JSON válido.

ESTRUCTURA DE RESPUESTA JSON REQUERIDA:
{
  "reply": "Tu respuesta detallada y clara al cultivador.",
  "evidence": {
    "recordsReferenced": ["riego del 2/10", "temperatura de ayer"],
    "metricsReferenced": ["1.5L", "24°C", "58% HR"],
    "datesReferenced": ["2026-10-02"]
  }
}
`;

    const chatContents: any[] = [];
    if (history && Array.isArray(history) && history.length > 0) {
      history.slice(-8).forEach((msg: any) => {
        chatContents.push({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }],
        });
      });
    }

    chatContents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    const candidateModels = ['gemini-3.8-flash', 'gemini-3.6-flash'];

    const execution = await executeAIWithRotationAndFallback({
      candidateModels,
      generateCall: (model) =>
        ai.models.generateContent({
          model,
          contents: chatContents,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            temperature: 0.3,
          },
        }),
      isQuotaOrCreditExhausted,
      onModelAttempt: (model, idx, total) => {
        console.log(`[Cultiveta IA] Intentando modelo (${idx + 1}/${total}): ${model}`);
      },
      onModelSuccess: (model) => {
        console.log(`[Cultiveta IA] Respuesta exitosa con modelo: ${model}`);
      },
      onModelFailure: (model, err, willRotate) => {
        const isQuota = isQuotaOrCreditExhausted(err);
        console.warn(
          `[Cultiveta IA] Fallo en modelo ${model} (${isQuota ? 'Cuota/Créditos agotados' : 'Error de API'}): ${err?.message || err}. ${
            willRotate ? 'Rotando al siguiente modelo candidato...' : 'Todos los modelos candidatos agotados.'
          }`
        );
      },
      onFallbackActivated: () => {
        console.info('[Cultiveta IA] Activando fallback agronómico determinista (sin inventar datos).');
      },
      fallbackInput: {
        message,
        cropName,
        intelligenceContext,
        cultivation,
        recentWaterings,
        recentEnv,
        recentPhotos,
        recentNotes,
      },
    });

    return res.json(execution.result);
  } catch (error: any) {
    console.error('Error en controlador /api/ai/chat:', error);
    const fallbackResult = buildAgronomicDeterministicFallback({
      message,
      cropName,
      intelligenceContext,
      cultivation,
      recentWaterings,
      recentEnv,
      recentPhotos,
      recentNotes,
    });
    return res.json(fallbackResult);
  }
});
// 4. 7-Day Summary
app.post('/api/ai/summary', async (req, res) => {
  try {
    const { cultivation, waterings7d, env7d, photos7d, notes7d } = req.body;

    const ai = getAIClient();

    const prompt = `
Genera un resumen semanal objetivo para el cultivo "${cultivation?.name}".
Datos de los últimos 7 días:
- Riegos (${waterings7d?.length || 0}): ${JSON.stringify(waterings7d || [])}
- Mediciones ambientales (${env7d?.length || 0}): ${JSON.stringify(env7d || [])}
- Fotos agregadas (${photos7d?.length || 0}): ${JSON.stringify(photos7d || [])}
- Notas de diario (${notes7d?.length || 0}): ${JSON.stringify(notes7d || [])}

Responde en JSON con:
{
  "summary": "Resumen conciso del estado semanal y evolución",
  "wateringsCount": ${waterings7d?.length || 0},
  "photosCount": ${photos7d?.length || 0},
  "avgTemp": promedio numérico de temperatura o null,
  "avgHumidity": promedio numérico de humedad o null,
  "notableObservations": ["Observación 1 basada estrictamente en datos", "Observación 2"],
  "missingDataTips": ["Consejo de datos faltantes para completar el registro semanal"]
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    let parsedSummary: any;
    try {
      parsedSummary = JSON.parse(response.text || '{}');
    } catch (parseErr) {
      return sendServerError(res, 502, 'La IA devolvió un resumen con formato inválido.', parseErr, 'ai/summary');
    }
    res.json(parsedSummary);
  } catch (error: any) {
    return sendServerError(res, 500, 'Error generando el resumen.', error, 'ai/summary');
  }
});

// 4b. Weekly Summary with Aggregated Real Metrics (No Invented Defaults)
app.post('/api/ai/weekly-summary', async (req, res) => {
  try {
    const { cultivations, wateringsCount, recentEnvAvg } = req.body;
    const cropNames =
      (cultivations || []).map((c: any) => `${c.name} (${c.stage || 'Sin etapa'})`).join(', ') ||
      'Cultivos activos';

    const ai = getAIClient();
    const prompt = `
Genera un resumen semanal objetivo para el conjunto de cultivos activos:
Cultivos: ${cropNames}
Total riegos en los últimos 7 días: ${wateringsCount ?? 0}
Promedio ambiental reciente: Temperatura ${recentEnvAvg?.tempC ?? 'N/D'}°C, Humedad ${recentEnvAvg?.humidityPct ?? 'N/D'}% HR.

Responde en JSON con:
{
  "summary": "Resumen conciso en español de la evolución agronómica agregada sin inventar datos que no se hayan proporcionado."
}
`;
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    let parsedWeekly: any;
    try {
      parsedWeekly = JSON.parse(response.text || '{}');
    } catch (parseErr) {
      return sendServerError(res, 502, 'La IA devolvió un resumen con formato inválido.', parseErr, 'ai/weekly-summary');
    }
    res.json(parsedWeekly);
  } catch (error: any) {
    return sendServerError(res, 500, 'Error generando el resumen semanal.', error, 'ai/weekly-summary');
  }
});

// 5. Compare Photos Evolution (Multimodal Real)
app.post('/api/ai/compare-photos', async (req, res) => {
  try {
    const { photoA, photoB, geneticsName } = req.body;
    const userId = req.userId!;

    if (!photoA || !photoB) {
      return res.status(400).json({ error: 'Se requieren dos fotografías para la comparación.' });
    }

    // Resolver ambas imágenes multimodalmente
    const [imagePartA, imagePartB] = await Promise.all([
      resolveImagePart(userId, {
        photoId: photoA.id,
        cultivationId: photoA.cultivationId,
        storagePath: photoA.storagePath,
        photoBase64OrUrl: photoA.url,
      }),
      resolveImagePart(userId, {
        photoId: photoB.id,
        cultivationId: photoB.cultivationId,
        storagePath: photoB.storagePath,
        photoBase64OrUrl: photoB.url,
      }),
    ]);

    if (!imagePartA || !imagePartB) {
      return res.status(400).json({
        error: 'No se pudieron recuperar los archivos de ambas fotografías para su comparación visual directa.',
      });
    }

    const ai = getAIClient();

    const prompt = `
Eres Cultiveta IA, botánico experto en cultivo y desarrollo vegetal.
Compara la evolución visual real entre las dos fotografías adjuntas de un cultivo de genética "${geneticsName || 'desconocida'}":
- Foto A (Primera): Día ${photoA?.dayOfCultivation || photoA?.day || 'X'} (Etapa: ${photoA?.stage || 'N/A'})
- Foto B (Segunda / Posterior): Día ${photoB?.dayOfCultivation || photoB?.day || 'Y'} (Etapa: ${photoB?.stage || 'N/A'})

Examina las imágenes proporcionadas y describe las diferencias visuales evolutivas con rigor botánico, precisión y honestidad.
Responde estrictamente en formato JSON válido con la siguiente estructura:
{
  "visualChanges": "Descripción concreta de cambios visuales en tamaño, follaje, coloración o maduración de flores entre ambas imágenes.",
  "structuralGrowth": "Análisis del desarrollo estructural, grosor de tallos, internodos y vigor de ramas observado.",
  "healthNotes": "Observaciones sobre salud foliar, turgencia y balance nutricional visible.",
  "confidence": "Baja" | "Media" | "Alta"
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          role: 'user',
          parts: [
            imagePartA,
            imagePartB,
            { text: prompt },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const responseText = response.text || '';
    if (!responseText.trim()) {
      return res.status(502).json({ error: 'Respuesta vacía del modelo de IA al comparar fotos.' });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      return res.status(502).json({ error: 'Error parseando JSON de comparación fotográfica.' });
    }

    if (!parsed || typeof parsed.visualChanges !== 'string' || !parsed.visualChanges.trim()) {
      return res.status(502).json({ error: 'La comparación no arrojó resultados concluyentes.' });
    }

    res.json(parsed);
  } catch (error: any) {
    return sendServerError(res, 500, 'Error comparando las fotografías.', error, 'ai/compare-photos');
  }
});

// Helper de cálculo de Déficit de Presión de Vapor (VPD en kPa)
function calculateVPD(airTempC: number, humidityPct: number, leafTempC?: number): number {
  const leafTemp = leafTempC ?? airTempC - 2;
  const vpsat = 0.61078 * Math.exp((17.27 * leafTemp) / (leafTemp + 237.3));
  const vpair = 0.61078 * Math.exp((17.27 * airTempC) / (airTempC + 237.3)) * (humidityPct / 100);
  return Number(Math.max(0, vpsat - vpair).toFixed(2));
}

// Registro local y en memoria para cultivos exteriores (permite cron sin depender de Cloud Firestore en GCP)
interface OutdoorCropItem {
  id: string;
  userId: string;
  name: string;
  type: string;
  geneticsName?: string;
  currentStage?: string;
  isFinished: boolean;
  locationCoordinates: { lat: number; lon: number };
  isDemo?: boolean;
}

const outdoorCropsStore = new Map<string, OutdoorCropItem>();
const outdoorRecordsStore: any[] = [];
const outdoorTasksStore: CultivationTask[] = [];

// Almacén de clientes SSE para notificaciones de navegador en tiempo real
interface SSEClient {
  id: string;
  res: any;
  userId?: string;
}
const sseClients = new Map<string, SSEClient>();

/** Envía una notificación SSE solo a las conexiones del usuario indicado (nunca a todos). */
export function broadcastNotification(payload: any, targetUserId: string) {
  if (!targetUserId) return;
  const data = JSON.stringify(payload);
  sseClients.forEach((client) => {
    if (client.userId === targetUserId) {
      try {
        client.res.write(`data: ${data}\n\n`);
      } catch (err) {
        console.warn(`[SSE Broadcast] Error enviando a cliente ${client.id}:`, err);
      }
    }
  });
}

// Sincronización horaria de clima para cultivos Outdoor e Invernadero.
// La dispara Cloud Scheduler (POST /api/internal/outdoor-weather) una vez por hora, o la persona
// manualmente para sus propios cultivos. Es idempotente por cultivo y hora.
export async function syncHourlyOutdoorWeather(targetUserId?: string) {
  console.log(`[Clima exterior] Sincronización (objetivo: ${targetUserId || 'todos'})...`);
  let isFirestoreAvailable = false;
  let firestore: Firestore | null = null;
  const outdoorCropsMap = new Map<string, { id: string; data: any }>();

  // 1. Fuente principal: Cloud Firestore. Si no está disponible (desarrollo local), se usa
  //    el registro en memoria que completa POST /api/outdoor/cultivations.
  try {
    const adminApp = getFirebaseAdmin();
    firestore = adminApp.firestore();
    let query: any = firestore
      .collection('cultivations')
      .where('isFinished', '==', false);

    if (targetUserId) {
      query = query.where('userId', '==', targetUserId);
    }

    const snapshot = await query.get();

    isFirestoreAvailable = true;
    snapshot.forEach((doc: any) => {
      const data = doc.data();
      const isOutdoorOrGreenhouse = data.type === 'Outdoor' || data.type === 'Invernadero';
      const hasCoords =
        data.locationCoordinates &&
        typeof data.locationCoordinates.lat === 'number' &&
        typeof data.locationCoordinates.lon === 'number';

      // Sin dueño no se procesa: nunca se generan registros "system" visibles para todos.
      if (isOutdoorOrGreenhouse && hasCoords && data.userId) {
        outdoorCropsMap.set(doc.id, { id: doc.id, data });
        outdoorCropsStore.set(doc.id, {
          id: doc.id,
          userId: data.userId,
          name: data.name || 'Cultivo Exterior',
          type: data.type,
          geneticsName: data.geneticsName || data.genetics || 'No especificada',
          currentStage: data.currentStage || data.stage || 'Vegetativo',
          isFinished: false,
          locationCoordinates: data.locationCoordinates,
          isDemo: data.isDemo || false,
        });
      }
    });
  } catch (firestoreErr: any) {
    console.warn(
      '[Cron Job] Cloud Firestore no disponible o API no habilitada en GCP (' +
        (firestoreErr?.code === 7 ? 'PERMISSION_DENIED: API no habilitada' : firestoreErr?.message || 'Error desconocido') +
        '). Operando con registro local del servidor.'
    );
    isFirestoreAvailable = false;
  }

  if (!isFirestoreAvailable) {
    outdoorCropsStore.forEach((crop, id) => {
      if (!crop.isFinished && crop.locationCoordinates && crop.userId) {
        if (!targetUserId || crop.userId === targetUserId) {
          outdoorCropsMap.set(id, { id, data: crop });
        }
      }
    });
  }

  const outdoorCrops = Array.from(outdoorCropsMap.values());
  if (outdoorCrops.length === 0) {
    console.log('[Cron Job] No se encontraron cultivos activos Outdoor/Invernadero con coordenadas registradas.');
    return { syncedCount: 0, alertsGenerated: 0, totalDetected: 0, mode: isFirestoreAvailable ? 'firestore' : 'local' };
  }

  console.log(
    `[Cron Job] Sincronizando ${outdoorCrops.length} cultivo(s) exterior/invernadero (Modo: ${
      isFirestoreAvailable ? 'Firestore + Local' : 'Local'
    }).`
  );

  let syncedCount = 0;
  let alertsGenerated = 0;

  for (const crop of outdoorCrops) {
    try {
      const coords = crop.data.locationCoordinates;
      if (!coords || typeof coords.lat !== 'number' || typeof coords.lon !== 'number') {
        continue;
      }
      const { lat, lon } = coords;
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m`;

      const response = await fetch(weatherUrl);
      if (!response.ok) {
        console.warn(
          `[Cron Job] No se pudo obtener el clima de Open-Meteo para el cultivo ${crop.id} (${crop.data.name}): ${response.statusText}`
        );
        continue;
      }

      const weatherJson = await response.json();
      if (weatherJson && weatherJson.current) {
        const tempC = Math.round(Number(weatherJson.current.temperature_2m) * 10) / 10;
        const humidity = Math.round(Number(weatherJson.current.relative_humidity_2m));
        const vpd = calculateVPD(tempC, humidity);

        const now = new Date();
        const isoString = now.toISOString();
        const { dateStr, timeStr, hourKey, dayKey } = getZonedParts(now);

        // Id por cultivo y hora: si la sincronización se repite en la misma hora, se reemplaza
        // la medición en lugar de duplicarla.
        const newRecord = {
          id: `auto-env-${crop.id}-${hourKey}`,
          userId: crop.data.userId,
          cultivationId: crop.id,
          date: dateStr,
          time: timeStr,
          temperatureC: tempC,
          humidityPct: humidity,
          vpdKPa: vpd,
          isAutoLogged: true,
          notes: 'Auto-registro meteorológico (Open-Meteo)',
          isDemo: crop.data.isDemo || false,
          createdAt: isoString,
        };

        upsertCapped(outdoorRecordsStore, newRecord);

        if (isFirestoreAvailable && firestore) {
          try {
            const docRef = firestore.collection('environmentRecords').doc(newRecord.id);
            await docRef.set(newRecord);
          } catch (writeErr: any) {
            console.warn('[Cron Job] No se pudo persistir en Firestore para ' + crop.id, writeErr?.message);
          }
        }

        syncedCount++;
        console.log(
          `[Cron Job] ✅ Medición guardada para "${crop.data.name}": ${tempC}°C, ${humidity}% HR, VPD ${vpd} kPa.`
        );

        // =========================================================================
        // EVALUACIÓN DE UMBRALES CLIMÁTICOS (CONFIGURADOS POR EL USUARIO O POR DEFECTO)
        // Y RECOMENDACIÓN DE EMERGENCIA CON GEMINI (CULTIVETA IA)
        // =========================================================================
        const cultivationName: string = crop.data.name || 'Cultivo Exterior';
        const geneticsName: string = crop.data.geneticsName || crop.data.genetics || 'No especificada';
        const stage: string = crop.data.currentStage || crop.data.stage || 'Vegetativo';

        // Umbrales configurados por el usuario para este cultivo en Firestore
        const alertThresholds = crop.data.alertThresholds;
        const isCustomThresholdsActive =
          alertThresholds &&
          alertThresholds.enabled !== false &&
          (alertThresholds.tempMaxC !== undefined ||
            alertThresholds.tempMinC !== undefined ||
            alertThresholds.humidityMaxPct !== undefined ||
            alertThresholds.humidityMinPct !== undefined);

        const tempMaxLimit: number =
          alertThresholds?.tempMaxC !== undefined && alertThresholds.tempMaxC !== null && Number(alertThresholds.tempMaxC) > 0
            ? Number(alertThresholds.tempMaxC)
            : 35;

        const tempMinLimit: number =
          alertThresholds?.tempMinC !== undefined && alertThresholds.tempMinC !== null
            ? Number(alertThresholds.tempMinC)
            : 11;

        const humidityMaxLimit: number =
          alertThresholds?.humidityMaxPct !== undefined && alertThresholds.humidityMaxPct !== null && Number(alertThresholds.humidityMaxPct) > 0
            ? Number(alertThresholds.humidityMaxPct)
            : 75;

        const humidityMinLimit: number =
          alertThresholds?.humidityMinPct !== undefined && alertThresholds.humidityMinPct !== null && Number(alertThresholds.humidityMinPct) > 0
            ? Number(alertThresholds.humidityMinPct)
            : 25;

        // Evaluación de umbrales críticos exactos
        const isHighTemp = tempC > tempMaxLimit;
        const isLowTemp = tempC < tempMinLimit;
        const isCriticalHumidityHigh = humidity > humidityMaxLimit;
        const isCriticalHumidityLow = humidity < humidityMinLimit;
        const isCriticalHumidity = isCriticalHumidityHigh || isCriticalHumidityLow;
        const isFloweringOrMaturing =
          stage.toLowerCase().includes('flora') ||
          stage.toLowerCase().includes('madura');

        const isCritical = isHighTemp || isLowTemp || isCriticalHumidity;

        // Una sola alerta por cultivo, condición y día (evita repetir Gemini, tarea y notificación)
        const conditionKey = [
          isHighTemp && 'temp-alta',
          isLowTemp && 'temp-baja',
          isCriticalHumidityHigh && 'hum-alta',
          isCriticalHumidityLow && 'hum-baja',
        ]
          .filter(Boolean)
          .join('_');
        const alertTaskId = `task-env-alert-${crop.id}-${conditionKey}-${dayKey}`;
        let alreadyAlerted = outdoorTasksStore.some((t) => t.id === alertTaskId);
        if (isCritical && !alreadyAlerted && isFirestoreAvailable && firestore) {
          try {
            alreadyAlerted = (await firestore.collection('tasks').doc(alertTaskId).get()).exists;
          } catch (readErr: any) {
            console.warn('[Clima exterior] No se pudo verificar si la alerta ya existía:', readErr?.message || readErr);
          }
        }

        if (isCritical && !alreadyAlerted) {
          // Bloque try/catch INDEPENDIENTE para la fase de Cultiveta IA (Gemini) y creación de tarea
          // Garantiza que si Gemini falla, demora o no hay red, el cron job continúe sin colapsar
          try {
            const criticalReasons: string[] = [];
            if (isHighTemp) {
              criticalReasons.push(
                `Temperatura excesiva (${tempC}°C supera el límite de ${tempMaxLimit}°C - riesgo de estrés térmico y marchitez)`
              );
            }
            if (isLowTemp) {
              criticalReasons.push(
                `Temperatura baja crítica (${tempC}°C por debajo del límite de ${tempMinLimit}°C - riesgo de shock radicular)`
              );
            }
            if (isCriticalHumidityHigh) {
              if (isFloweringOrMaturing) {
                criticalReasons.push(
                  `Humedad excesiva (${humidity}% supera el límite de ${humidityMaxLimit}% en etapa de ${stage} - altísimo peligro de botrytis y pudrición de flores)`
                );
              } else {
                criticalReasons.push(
                  `Humedad ambiental alta (${humidity}% supera el límite de ${humidityMaxLimit}% - riesgo de hongos foliares y baja transpiración)`
                );
              }
            }
            if (isCriticalHumidityLow) {
              criticalReasons.push(
                `Humedad excesivamente baja (${humidity}% por debajo del mínimo de ${humidityMinLimit}% - deshidratación y transpiración forzada)`
              );
            }

            const detectedCriticalValue = criticalReasons.join(' | ');

            console.log(
              `[Cron Job Alertas] ⚠️ Umbral crítico detectado en cultivo ${crop.id} ("${cultivationName}"): ${detectedCriticalValue} [Umbrales aplicados: Temp ${tempMinLimit}°C-${tempMaxLimit}°C, Hum ${humidityMinLimit}%-${humidityMaxLimit}%]. Consultando a Gemini...`
            );

            // Consulta a Gemini solicitando estrictamente JSON con { "title", "description" }
            const prompt = `Eres Cultiveta IA, agrónomo experto en cultivo técnico y botánica de cannabis.
Se ha detectado una condición meteorológica crítica en tiempo real durante el monitoreo del cron job:
- Cultivo afectado: "${cultivationName}" (ID: ${crop.id})
- Genética: "${geneticsName}"
- Etapa fenológica actual: "${stage}"
- Parámetros registrados: Temperatura ${tempC}°C, Humedad Relativa ${humidity}%, VPD ${vpd} kPa
- Umbrales críticos definidos para este cultivo:
  * Temperatura permitida: ${tempMinLimit}°C a ${tempMaxLimit}°C ${isCustomThresholdsActive ? '(Personalizado por el cultivador)' : '(Estándar)'}
  * Humedad relativa permitida: ${humidityMinLimit}% a ${humidityMaxLimit}% HR ${isCustomThresholdsActive ? '(Personalizado por el cultivador)' : '(Estándar)'}
- Alerta crítica: ${detectedCriticalValue}

Instrucción obligatoria:
Proporciona una recomendación de emergencia inmediata, técnica y accionable para que el cultivador intervenga de inmediato y proteja las plantas de acuerdo a los umbrales configurados para su cultivo.
Devuelve ESTRICTAMENTE un objeto JSON válido con este formato:
{
  "title": "Título conciso y directo de la alerta (ej: 'Alerta: Calor Crítico (>${tempMaxLimit}°C)' o 'Alerta: Riesgo de Botrytis (>${humidityMaxLimit}% HR)' o 'Alerta: Frío Crítico (<${tempMinLimit}°C)')",
  "description": "Recomendación de emergencia clara de 1 a 2 oraciones indicando las acciones prioritarias a tomar."
}`;

            let aiResponse: any = null;
            try {
              const ai = getAIClient();
              const candidateModels = ['gemini-3.8-flash', 'gemini-3.6-flash'];
              for (const modelName of candidateModels) {
                try {
                  aiResponse = await ai.models.generateContent({
                    model: modelName,
                    contents: prompt,
                    config: {
                      responseMimeType: 'application/json',
                      temperature: 0.2,
                    },
                  });
                  if (aiResponse?.text) break;
                } catch (mErr: any) {
                  if (isQuotaOrCreditExhausted(mErr)) {
                    console.info(`[Cron Job Alertas] Cuota o créditos agotados en ${modelName}. Aplicando recomendaciones botánicas deterministas de emergencia sin bloqueo.`);
                    break;
                  } else {
                    console.warn(`[Cron Job Alertas] Modelo ${modelName} no respondió, probando alternativa:`, mErr?.message || mErr);
                  }
                }
              }
            } catch (clientErr: any) {
              console.info('[Cron Job Alertas] Cliente de IA no disponible o sin clave. Utilizando fallback botánico determinista.');
            }

            // Valores de respaldo por si el modelo devuelve estructura atípica o no está disponible
            let alertTitle = isCriticalHumidityHigh && isFloweringOrMaturing
              ? `Alerta: Riesgo Severo de Botrytis (Humedad >${humidityMaxLimit}%)`
              : isCriticalHumidityHigh
              ? `Alerta: Humedad Excesiva (>${humidityMaxLimit}%)`
              : isCriticalHumidityLow
              ? `Alerta: Humedad Críticamente Baja (<${humidityMinLimit}%)`
              : isHighTemp
              ? `Alerta: Calor Crítico (>${tempMaxLimit}°C)`
              : `Alerta: Frío Crítico (<${tempMinLimit}°C)`;

            let alertDescription = isCriticalHumidityHigh && isFloweringOrMaturing
              ? `Humedad de ${humidity}% supera el umbral configurado de ${humidityMaxLimit}% en etapa de ${stage}. Maximiza la circulación de aire inmediatamente para evitar hongos en los cogollos.`
              : isCriticalHumidityHigh
              ? `Humedad de ${humidity}% superior al umbral configurado de ${humidityMaxLimit}%. Incrementa la ventilación y extracción.`
              : isCriticalHumidityLow
              ? `Humedad de ${humidity}% inferior al umbral configurado de ${humidityMinLimit}%. Aumenta la humedad ambiental para evitar deshidratación foliar.`
              : isHighTemp
              ? `Temperatura de ${tempC}°C superior al umbral configurado de ${tempMaxLimit}°C. Provee sombra urgente y ventilación para evitar marchitamiento.`
              : `Temperatura de ${tempC}°C inferior al umbral configurado de ${tempMinLimit}°C. Aísla las macetas del suelo frío o enciende calefacción.`;

            if (aiResponse?.text) {
              try {
                const parsed = JSON.parse(aiResponse.text.trim());
                if (parsed && typeof parsed.title === 'string' && parsed.title.trim()) {
                  alertTitle = parsed.title.trim();
                }
                if (parsed && typeof parsed.description === 'string' && parsed.description.trim()) {
                  alertDescription = parsed.description.trim();
                }
              } catch (parseError) {
                console.warn('[Cron Job Alertas] Advertencia al parsear respuesta JSON de Gemini:', parseError);
              }
            }

            // Generación del nuevo documento en la colección de tareas (CultivationTask)
            const taskId = alertTaskId;
            const newTask: CultivationTask & {
              userId: string;
              createdAt: string;
              isDemo?: boolean;
              criticalData?: {
                temperatureC: number;
                humidityPct: number;
                vpdKPa: number;
                detectedAt: string;
                appliedThresholds?: {
                  tempMinC: number;
                  tempMaxC: number;
                  humidityMinPct: number;
                  humidityMaxPct: number;
                  isCustom: boolean;
                };
              };
            } = {
              id: taskId,
              cultivationId: crop.id,
              cultivationName,
              geneticsName,
              stage,
              type: 'env_alert',
              urgency: 'today',
              priority: 'critical',
              isCompleted: false,
              categoryLabel: 'Alerta climática',
              title: alertTitle,
              description: alertDescription,
              dueDate: dateStr,
              actionHint: 'Revisar Cultivo',
              isDemo: Boolean(crop.data.isDemo),
              createdAt: isoString,
              userId: crop.data.userId,
              criticalData: {
                temperatureC: tempC,
                humidityPct: humidity,
                vpdKPa: vpd,
                detectedAt: isoString,
                appliedThresholds: {
                  tempMinC: tempMinLimit,
                  tempMaxC: tempMaxLimit,
                  humidityMinPct: humidityMinLimit,
                  humidityMaxPct: humidityMaxLimit,
                  isCustom: Boolean(isCustomThresholdsActive),
                },
              },
            };

            // Guardar documento en Firestore en la colección 'tasks'
            if (isFirestoreAvailable && firestore) {
              try {
                const taskDocRef = firestore.collection('tasks').doc(taskId);
                await taskDocRef.set(newTask);
                console.log(
                  `[Cron Job Alertas] 🚨 Tarea de tipo 'env_alert' guardada en Firestore (tasks/${taskId}) para cultivo "${cultivationName}": "${alertTitle}".`
                );
              } catch (firestoreTaskErr: any) {
                console.warn(
                  `[Cron Job Alertas] No se pudo persistir la tarea en Firestore para el cultivo ${crop.id}:`,
                  firestoreTaskErr?.message || firestoreTaskErr
                );
              }
            }

            // Guardar en el almacén en memoria del servidor para disponibilidad inmediata
            upsertCapped(outdoorTasksStore, newTask);
            alertsGenerated++;

            // Difundir notificación Push / SSE de alerta climática al navegador
            broadcastNotification(
              {
                type: 'env_alert',
                task: newTask,
                timestamp: isoString,
              },
              crop.data.userId
            );

            console.log(
              `[Cron Job Alertas] ✅ Alerta procesada y tarea generada: "${alertTitle}" -> "${alertDescription}". Notificación emitida a clientes SSE.`
            );
          } catch (geminiAlertErr: any) {
            // Aislamiento de fallos: si Gemini o la API fallan, el cron job sigue adelante
            console.warn(
              `[Cron Job Alertas] Error aislado durante la consulta a Gemini o guardado de tarea para ${crop.id} (${cultivationName}):`,
              geminiAlertErr?.message || geminiAlertErr
            );
          }
        }
      }
    } catch (cropErr: any) {
      console.warn(`[Cron Job] Error procesando clima de cultivo ${crop.id}:`, cropErr?.message || cropErr);
    }
  }

  return { syncedCount, alertsGenerated, totalDetected: outdoorCrops.length, mode: isFirestoreAvailable ? 'firestore' : 'local' };
}

// Disparo programado (Cloud Scheduler, 1 vez por hora). Ya no se usa node-cron: en Cloud Run el
// proceso puede no estar corriendo (0 instancias) o haber varias instancias a la vez.
// Requiere el header "x-cultiveta-cron-secret" igual a OUTDOOR_SYNC_SECRET.
const OUTDOOR_SYNC_SECRET = process.env.OUTDOOR_SYNC_SECRET || '';

function isValidCronSecret(provided: string | undefined): boolean {
  if (!OUTDOOR_SYNC_SECRET || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(OUTDOOR_SYNC_SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.post('/api/internal/outdoor-weather', async (req, res) => {
  if (!OUTDOOR_SYNC_SECRET) {
    return res.status(503).json({ error: 'Sincronización programada no configurada.' });
  }
  if (!isValidCronSecret(req.get('x-cultiveta-cron-secret'))) {
    return res.status(401).json({ error: 'No autorizado.' });
  }
  try {
    const result = await syncHourlyOutdoorWeather();
    res.json({ success: true, ...result });
  } catch (err) {
    return sendServerError(res, 500, 'Error en la sincronización programada.', err, 'internal/outdoor-weather');
  }
});

// Desarrollo local: opcionalmente, sincronizar cada hora sin Cloud Scheduler (LOCAL_OUTDOOR_SYNC=1).
if (process.env.NODE_ENV !== 'production' && process.env.LOCAL_OUTDOOR_SYNC === '1') {
  setInterval(() => {
    syncHourlyOutdoorWeather().catch((e) => console.warn('[Clima exterior] Error en sincronización local:', e?.message || e));
  }, 60 * 60 * 1000);
}

// Endpoint para que el cliente registre cultivos Outdoor/Invernadero con coordenadas
// Máximo de cultivos exteriores que una persona puede registrar en el servidor (cada uno genera
// consultas de clima): evita que una cuenta dispare consultas sin límite.
const MAX_OUTDOOR_CROPS_PER_USER = 20;

app.post('/api/outdoor/cultivations', verifyFirebaseAuth, async (req, res) => {
  try {
    const { id } = req.body || {};
    const userId = req.userId!;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Falta el id del cultivo.' });
    }

    // Con Firestore disponible, los datos salen del documento real y se exige que sea de quien llama.
    let source: any = null;
    if (hasAdminCredentials()) {
      try {
        const snap = await getFirebaseAdmin().firestore().collection('cultivations').doc(id).get();
        if (!snap.exists) {
          return res.status(404).json({ error: 'Cultivo no encontrado.' });
        }
        source = snap.data();
        if (source?.userId !== userId) {
          return res.status(403).json({ error: 'El cultivo no pertenece a tu cuenta.' });
        }
      } catch (readErr) {
        return sendServerError(res, 503, 'No se pudo verificar el cultivo.', readErr, 'outdoor/cultivations');
      }
    } else {
      // Desarrollo local sin Firestore Admin: se usa el cuerpo, pero nunca se pisa un cultivo ajeno.
      const existing = outdoorCropsStore.get(id);
      if (existing && existing.userId !== userId) {
        return res.status(403).json({ error: 'El cultivo no pertenece a tu cuenta.' });
      }
      source = req.body;
    }

    const coords = source?.locationCoordinates;
    if (!coords || typeof coords.lat !== 'number' || typeof coords.lon !== 'number') {
      return res.status(400).json({ error: 'El cultivo no tiene coordenadas válidas.' });
    }
    if (source.type !== 'Outdoor' && source.type !== 'Invernadero') {
      return res.status(400).json({ error: 'Solo se registran cultivos de exterior o invernadero.' });
    }

    const ownCount = Array.from(outdoorCropsStore.values()).filter((c) => c.userId === userId && c.id !== id).length;
    if (ownCount >= MAX_OUTDOOR_CROPS_PER_USER) {
      return res.status(429).json({ error: `Podés registrar hasta ${MAX_OUTDOOR_CROPS_PER_USER} cultivos de exterior.` });
    }

    outdoorCropsStore.set(id, {
      id,
      userId,
      name: source.name || 'Cultivo',
      type: source.type,
      geneticsName: source.geneticsName || 'No especificada',
      currentStage: source.currentStage || 'Vegetativo',
      isFinished: Boolean(source.isFinished),
      locationCoordinates: coords,
      isDemo: Boolean(source.isDemo),
    });

    res.json({ success: true });
  } catch (err) {
    return sendServerError(res, 500, 'Error guardando el cultivo de exterior.', err, 'outdoor/cultivations');
  }
});

// Registros ambientales automáticos del usuario autenticado (solo los propios)
app.get('/api/outdoor/environment-records', verifyFirebaseAuth, (req, res) => {
  try {
    const { cultivationId } = req.query;
    const userId = req.userId!;
    let records = outdoorRecordsStore.filter((r) => r.userId === userId);

    if (cultivationId) {
      records = records.filter((r) => r.cultivationId === cultivationId);
    }

    res.json(records);
  } catch (err) {
    return sendServerError(res, 500, 'Error consultando registros ambientales.', err, 'outdoor/environment-records');
  }
});

// Tareas y alertas generadas automáticamente para el usuario autenticado (solo las propias)
app.get('/api/outdoor/tasks', verifyFirebaseAuth, (req, res) => {
  try {
    const { cultivationId } = req.query;
    const userId = req.userId!;
    let tasks = outdoorTasksStore.filter((t) => (t as any).userId === userId);

    if (cultivationId) {
      tasks = tasks.filter((t) => t.cultivationId === cultivationId);
    }

    res.json(tasks);
  } catch (err) {
    return sendServerError(res, 500, 'Error consultando tareas de alerta.', err, 'outdoor/tasks');
  }
});

// Disparo manual de la sincronización, limitado a los cultivos de quien llama y a 1 vez cada 10 minutos
const MANUAL_SYNC_COOLDOWN_MS = 10 * 60 * 1000;
const lastManualSyncByUser = new Map<string, number>();

app.post('/api/cron/trigger-outdoor-weather', verifyFirebaseAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    const last = lastManualSyncByUser.get(userId) || 0;
    if (Date.now() - last < MANUAL_SYNC_COOLDOWN_MS) {
      return res.status(429).json({ error: 'Esperá unos minutos antes de volver a sincronizar el clima.' });
    }
    lastManualSyncByUser.set(userId, Date.now());
    const result = await syncHourlyOutdoorWeather(userId);
    res.json({ success: true, ...result });
  } catch (err) {
    return sendServerError(res, 500, 'Error ejecutando la sincronización manual.', err, 'cron/trigger-outdoor-weather');
  }
});

// Endpoint SSE para streaming de notificaciones de navegador en tiempo real autenticado
app.get('/api/notifications/stream', verifyFirebaseAuth, (req, res) => {
  const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const userId = req.userId!;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  sseClients.set(clientId, { id: clientId, res, userId });
  console.log(`[SSE Notifications] 🟢 Cliente conectado autenticado (${clientId}, userId: ${userId}). Clientes activos: ${sseClients.size}`);

  res.write(`data: ${JSON.stringify({ type: 'connected', clientId, timestamp: new Date().toISOString() })}\n\n`);

  // Heartbeat cada 25s para mantener abierta la conexión HTTP persistente
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(clientId);
    console.log(`[SSE Notifications] 🔴 Cliente desconectado (${clientId}). Clientes activos: ${sseClients.size}`);
  });
});

// Endpoint para probar el envío de notificaciones de alerta climática para el usuario autenticado
app.post('/api/notifications/test', verifyFirebaseAuth, (req, res) => {
  try {
    const userId = req.userId!;
    const testTask = {
      id: `test-env-alert-${Date.now()}`,
      cultivationId: 'crop-test',
      cultivationName: 'Carpa Principal (Exterior)',
      stage: 'Floración',
      type: 'env_alert',
      urgency: 'today',
      priority: 'critical',
      isCompleted: false,
      title: 'Prueba de notificación de alerta climática',
      description: 'Esta es una notificación de prueba. No corresponde a una medición real.',
      dueDate: getZonedParts().dateStr,
      createdAt: new Date().toISOString(),
      categoryLabel: 'Alerta climática',
      userId,
    };

    broadcastNotification(
      {
        type: 'env_alert',
        task: testTask,
        timestamp: new Date().toISOString(),
      },
      userId
    );

    res.json({
      success: true,
      message: 'Notificación de prueba enviada a tus conexiones activas.',
      clientsNotified: Array.from(sseClients.values()).filter((c) => c.userId === userId).length,
    });
  } catch (err) {
    return sendServerError(res, 500, 'Error enviando la notificación de prueba.', err, 'notifications/test');
  }
});

// Alertas ambientales recientes del usuario autenticado (solo las propias)
app.get('/api/notifications/recent', verifyFirebaseAuth, (req, res) => {
  try {
    const userId = req.userId!;
    const alerts = outdoorTasksStore.filter((t) => t.type === 'env_alert' && (t as any).userId === userId);
    res.json(alerts.slice(-20).reverse());
  } catch (err) {
    return sendServerError(res, 500, 'Error consultando alertas recientes.', err, 'notifications/recent');
  }
});

// =========================================================================
// CUENTA: EXPORTACIÓN COMPLETA Y BORRADO COMPLETO DE DATOS
// =========================================================================

/** Colecciones de primer nivel con datos de la persona (campo userId). */
export const USER_DATA_COLLECTIONS = [
  'cultivations',
  'waterings',
  'environmentRecords',
  'diaryEntries',
  'harvests',
  'photos',
  'photoAnalyses',
  'fertilizationSchedules',
  'favoriteGenetics',
  'genetics',
  'tasks',
  'aiUsage',
] as const;

function getStorageBucketName(): string {
  return (
    process.env.FIREBASE_STORAGE_BUCKET ||
    appletFirebaseConfig.storageBucket ||
    'gen-lang-client-0531791519.firebasestorage.app'
  );
}

// Exportación: un JSON con todos los documentos de la persona.
app.get('/api/account/export', verifyFirebaseAuth, async (req, res) => {
  const userId = req.userId!;
  if (!hasAdminCredentials()) {
    return res.status(503).json({ error: 'La exportación no está disponible en este entorno.' });
  }
  try {
    const db = getFirebaseAdmin().firestore();
    const data: Record<string, any[]> = {};
    for (const name of USER_DATA_COLLECTIONS) {
      if (name === 'aiUsage') continue;
      const snap = await db.collection(name).where('userId', '==', userId).get();
      data[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    const profileSnap = await db.collection('users').doc(userId).get();
    // Subcolecciones del perfil (por ejemplo, progress: logros ganados y nivel festejado)
    const profileSubcollections: Record<string, any[]> = {};
    for (const sub of await db.collection('users').doc(userId).listCollections()) {
      const subSnap = await sub.get();
      profileSubcollections[sub.id] = subSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    const { dateStr } = getZonedParts();
    res.setHeader('Content-Disposition', `attachment; filename="cultiveta-export-${dateStr}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      userId,
      profile: profileSnap.exists ? profileSnap.data() : null,
      profileSubcollections,
      collections: data,
      note: 'Las fotos se incluyen como enlaces (campo de URL de cada registro en "photos").',
    });
  } catch (err) {
    return sendServerError(res, 500, 'No se pudo generar la exportación.', err, 'account/export');
  }
});

// Borrado: todos los documentos, archivos de Storage y el usuario de Firebase Auth.
// Exige un inicio de sesión reciente (máx. 5 minutos) para evitar borrados con una sesión olvidada.
const RECENT_LOGIN_MAX_AGE_S = 5 * 60;

app.post('/api/account/delete', verifyFirebaseAuth, async (req, res) => {
  const userId = req.userId!;
  const authTime = Number(req.user?.auth_time || 0);
  if (!authTime || Date.now() / 1000 - authTime > RECENT_LOGIN_MAX_AGE_S) {
    return res.status(401).json({
      error: 'Por seguridad, volvé a iniciar sesión antes de eliminar la cuenta.',
      code: 'auth/requires-recent-login',
    });
  }
  if (!hasAdminCredentials()) {
    return res.status(503).json({ error: 'El borrado de cuenta no está disponible en este entorno.' });
  }

  const deleted: Record<string, number> = {};
  try {
    const adminApp = getFirebaseAdmin();
    const db = adminApp.firestore();

    // 1. Documentos de Firestore, en lotes de hasta 400
    for (const name of USER_DATA_COLLECTIONS) {
      const snap = await db.collection(name).where('userId', '==', userId).get();
      deleted[name] = snap.size;
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = db.batch();
        snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }
    // recursiveDelete: el perfil y sus subcolecciones (progress, etc.); delete() las dejaba huérfanas
    await db.recursiveDelete(db.collection('users').doc(userId));

    // 2. Archivos de Storage del usuario (fotos y avatar)
    await getStorage(adminApp)
      .bucket(getStorageBucketName())
      .deleteFiles({ prefix: `users/${userId}/` });

    // 3. Datos en memoria del servidor
    Array.from(outdoorCropsStore.entries()).forEach(([id, crop]) => {
      if (crop.userId === userId) outdoorCropsStore.delete(id);
    });
    for (let i = outdoorRecordsStore.length - 1; i >= 0; i--) {
      if (outdoorRecordsStore[i].userId === userId) outdoorRecordsStore.splice(i, 1);
    }
    for (let i = outdoorTasksStore.length - 1; i >= 0; i--) {
      if ((outdoorTasksStore[i] as any).userId === userId) outdoorTasksStore.splice(i, 1);
    }

    // 4. Por último, el usuario de Firebase Auth
    await getAuth(adminApp).deleteUser(userId);

    console.log(`[account/delete] Cuenta ${userId} eliminada:`, deleted);
    res.json({ success: true, deleted });
  } catch (err) {
    return sendServerError(
      res,
      500,
      'No se pudo completar el borrado. Volvé a intentarlo: lo que ya se borró no se recupera, pero el proceso se puede repetir.',
      err,
      'account/delete'
    );
  }
});

// =========================================================================
// GESTIÓN PRIVADA DE FOTOGRAFÍAS OFICIALES DE GENÉTICAS (CREADOR / ADMIN)
// =========================================================================

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
});

// 1. Estado administrativo y privilegios del usuario autenticado (/api/admin/me)
app.get('/api/admin/me', verifyFirebaseAuth, async (req, res) => {
  try {
    const isAdmin = isRequestAdmin(req);
    let storageAvailable = false;
    try {
      const adminApp = getFirebaseAdmin();
      const bucketName =
        process.env.FIREBASE_STORAGE_BUCKET ||
        appletFirebaseConfig.storageBucket ||
        'gen-lang-client-0531791519.firebasestorage.app';
      const bucket = getStorage(adminApp).bucket(bucketName);
      const [exists] = await bucket.exists();
      storageAvailable = exists;
    } catch {
      storageAvailable = false;
    }

    res.json({
      authenticated: true,
      isAdmin,
      storageAvailable,
    });
  } catch (err: any) {
    return sendServerError(res, 500, 'Error verificando el estado administrativo.', err, 'admin/me');
  }
});

// 2. Verificación de estado de Firebase Storage
app.get('/api/admin/genetics/storage-status', verifyFirebaseAuth, verifyAdminRole, async (req, res) => {
  try {
    const adminApp = getFirebaseAdmin();
    const bucketName =
      process.env.FIREBASE_STORAGE_BUCKET ||
      appletFirebaseConfig.storageBucket ||
      'gen-lang-client-0531791519.firebasestorage.app';
    const bucket = getStorage(adminApp).bucket(bucketName);
    const [exists] = await bucket.exists();
    if (!exists) {
      return res.status(503).json({
        available: false,
        code: 'storage/unavailable',
        message: 'El almacenamiento de imágenes todavía no está habilitado.',
      });
    }
    res.json({ available: true, bucket: bucketName });
  } catch {
    return res.status(503).json({
      available: false,
      code: 'storage/unavailable',
      message: 'El almacenamiento de imágenes todavía no está habilitado.',
    });
  }
});

// 3. Obtener todas las fotos oficiales del catálogo de genéticas (Autenticado - Sanitizado DTO)
app.get('/api/genetics/catalog-photos', verifyFirebaseAuth, async (req, res) => {
  try {
    const adminApp = getFirebaseAdmin();
    const db = adminApp.firestore();
    const snap = await db.collection('geneticsCatalogPhotos').get();
    const photos: Record<string, any> = {};

    snap.forEach((doc: any) => {
      const data = doc.data();
      if (data && (data.key || doc.id)) {
        const key = data.key || doc.id;
        // DTO explícito que nunca expone updatedBy a clientes
        photos[key] = {
          key,
          seedBank: data.seedBank,
          name: data.name,
          photoUrl: data.photoUrl,
          storagePath: data.storagePath,
          fileSize: data.fileSize,
          mimeType: data.mimeType,
          dimensions: data.dimensions,
          photoSourceUrl: data.photoSourceUrl,
          photoSourceName: data.photoSourceName,
          photoAttribution: data.photoAttribution,
          photoLicense: data.photoLicense,
          photoRightsStatus: data.photoRightsStatus || 'unknown',
          updatedAt: data.updatedAt,
        };
      }
    });

    res.json({ success: true, photos });
  } catch (err: any) {
    res.status(503).json({
      code: 'firestore/unavailable',
      error: 'No se pudo cargar el catálogo de fotografías.',
    });
  }
});

// 4. Cargar/Actualizar fotografía oficial de una genética (Solo Creador/Admin - Almacenamiento Físico en Storage con ruta versionada y atomicidad)
app.post(
  '/api/admin/genetics/upload-photo',
  verifyFirebaseAuth,
  verifyAdminRole,
  photoUpload.single('photo'),
  async (req, res) => {
    try {
      const {
        seedBank,
        name,
        photoSourceName,
        photoSourceUrl,
        photoAttribution,
        photoLicense,
        photoRightsStatus,
      } = req.body;

      if (!seedBank || typeof seedBank !== 'string' || !seedBank.trim()) {
        return res.status(400).json({ error: 'El banco de semillas es obligatorio.' });
      }
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'El nombre de la genética es obligatorio.' });
      }
      if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
        return res.status(400).json({ error: 'Se requiere un archivo de imagen en el campo "photo".' });
      }

      // Validar photoRightsStatus estrictamente
      const ALLOWED_RIGHTS = ['unknown', 'official-source', 'permission-granted', 'licensed', 'owned'];
      const rightsStatus = photoRightsStatus ? String(photoRightsStatus).trim() : 'unknown';
      if (!ALLOWED_RIGHTS.includes(rightsStatus)) {
        return res.status(400).json({
          error: 'Estado de derechos inválido. Permitidos: unknown, official-source, permission-granted, licensed, owned.',
          code: 'invalid/photo-rights-status',
        });
      }

      const trimmedSourceUrl = photoSourceUrl ? String(photoSourceUrl).trim() : '';
      const trimmedSourceName = photoSourceName ? String(photoSourceName).trim() : '';
      const trimmedAttribution = photoAttribution ? String(photoAttribution).trim() : '';
      const trimmedLicense = photoLicense ? String(photoLicense).trim() : '';

      // Validar photoSourceUrl si fue provisto
      if (trimmedSourceUrl) {
        if (trimmedSourceUrl.length > 2048 || (!trimmedSourceUrl.startsWith('http://') && !trimmedSourceUrl.startsWith('https://'))) {
          return res.status(400).json({
            error: 'La URL de la fuente debe ser una dirección HTTP o HTTPS válida de hasta 2048 caracteres.',
            code: 'invalid/photo-source-url',
          });
        }
      }

      // Validar firma binaria (magic bytes) estrictamente en el backend
      const imageValidation = validateImageBuffer(req.file.buffer);
      if (!imageValidation.valid) {
        return res.status(400).json({ error: imageValidation.error });
      }

      const key = getGeneticsPhotoKey(seedBank, name);

      // Verificar disponibilidad real de Firebase Storage
      const adminApp = getFirebaseAdmin();
      const bucketName =
        process.env.FIREBASE_STORAGE_BUCKET ||
        appletFirebaseConfig.storageBucket ||
        'gen-lang-client-0531791519.firebasestorage.app';

      let bucket: any;
      try {
        bucket = getStorage(adminApp).bucket(bucketName);
        const [exists] = await bucket.exists();
        if (!exists) {
          return res.status(503).json({
            error: 'El almacenamiento de imágenes todavía no está habilitado.',
            code: 'storage/unavailable',
          });
        }
      } catch {
        return res.status(503).json({
          error: 'El almacenamiento de imágenes todavía no está habilitado.',
          code: 'storage/unavailable',
        });
      }

      // Conectar a Cloud Firestore para leer el registro anterior
      let db: any;
      try {
        db = adminApp.firestore();
      } catch {
        return res.status(503).json({
          code: 'firestore/unavailable',
          error: 'No se pudo conectar a Cloud Firestore.',
        });
      }

      const docRef = db.collection('geneticsCatalogPhotos').doc(key);
      let previousRecord: any = null;
      try {
        const prevSnap = await docRef.get();
        if (prevSnap.exists) {
          previousRecord = prevSnap.data();
        }
      } catch (readErr) {
        console.warn('[upload-photo] No se pudo leer registro anterior:', readErr);
      }
      const previousStoragePath = previousRecord?.storagePath;

      // Generar ruta Storage versionada: genetics/reference/{key}/cover-{timestamp}-{uuid}.{ext}
      const ext =
        imageValidation.detectedMime === 'image/png'
          ? 'png'
          : imageValidation.detectedMime === 'image/webp'
          ? 'webp'
          : 'jpg';
      const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
      const uuidSuffix = crypto.randomUUID().slice(0, 8);
      const newStoragePath = `genetics/reference/${key}/cover-${ts}-${uuidSuffix}.${ext}`;

      // Garantizar que la nueva ruta sea diferente a la anterior
      if (previousStoragePath && previousStoragePath === newStoragePath) {
        throw new Error('Colisión de ruta versionada de almacenamiento.');
      }

      // Subir archivo nuevo con token de descarga Firebase Storage
      const downloadToken = crypto.randomUUID();
      const fileRef = bucket.file(newStoragePath);

      try {
        await fileRef.save(req.file.buffer, {
          metadata: {
            contentType: imageValidation.detectedMime || req.file.mimetype || 'image/jpeg',
            metadata: {
              firebaseStorageDownloadTokens: downloadToken,
              seedBank: seedBank.trim(),
              geneticsName: name.trim(),
              uploadedBy: req.userId,
            },
          },
        });
      } catch {
        return res.status(503).json({
          error: 'Error guardando archivo en Firebase Storage: El almacenamiento todavía no está disponible.',
          code: 'storage/unavailable',
        });
      }

      // Generar URL estable mediante downloadToken (sin depender de makePublic)
      const photoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(newStoragePath)}?alt=media&token=${downloadToken}`;

      let parsedDimensions: { width: number; height: number } | undefined = undefined;
      if (req.body.dimensions) {
        try {
          const parsed = typeof req.body.dimensions === 'string'
            ? JSON.parse(req.body.dimensions)
            : req.body.dimensions;
          if (parsed && typeof parsed === 'object' && typeof parsed.width === 'number' && typeof parsed.height === 'number') {
            parsedDimensions = { width: parsed.width, height: parsed.height };
          }
        } catch {
          parsedDimensions = undefined;
        }
      }

      const now = new Date().toISOString();
      const rawPhotoRecord: any = {
        key,
        seedBank: seedBank.trim(),
        name: name.trim(),
        photoUrl,
        storagePath: newStoragePath,
        fileSize: req.file.size,
        mimeType: imageValidation.detectedMime,
        dimensions: parsedDimensions || undefined,
        photoSourceUrl: trimmedSourceUrl || undefined,
        photoSourceName: trimmedSourceName || undefined,
        photoAttribution: trimmedAttribution || undefined,
        photoLicense: trimmedLicense || undefined,
        photoRightsStatus: rightsStatus,
        updatedAt: now,
        updatedBy: req.userId,
      };

      // Construcción del documento Firestore sin ninguna propiedad undefined
      const newPhotoRecord = cleanFirestoreData(rawPhotoRecord);

      try {
        // Reemplazo completo del documento SIN { merge: true }
        // Evita que metadatos viejos opcionales sobrevivan cuando el usuario los deja vacíos
        await docRef.set(newPhotoRecord);
      } catch {
        // En caso de fallo de Firestore: borrar SOLAMENTE el objeto nuevo para no pisar el anterior
        await fileRef.delete({ ignoreNotFound: true }).catch(() => {
          console.warn('[genetics-photo] Rollback failed deleting new object:', newStoragePath);
        });
        return res.status(500).json({
          error: 'Error persistiendo metadatos de la fotografía en Firestore.',
          code: 'firestore/write-failed',
        });
      }

      // Firestore confirmó: limpiar previousStoragePath best-effort si existe
      if (previousStoragePath && previousStoragePath !== newStoragePath) {
        bucket.file(previousStoragePath).delete({ ignoreNotFound: true }).catch(() => {
          console.warn('[genetics-photo] Orphaned previous Storage object:', previousStoragePath);
        });
      }

      // Respuesta exitosa: DTO público sin exponer updatedBy ni undefined
      const publicDto = cleanFirestoreData({
        key,
        seedBank: newPhotoRecord.seedBank,
        name: newPhotoRecord.name,
        photoUrl: newPhotoRecord.photoUrl,
        storagePath: newPhotoRecord.storagePath,
        fileSize: newPhotoRecord.fileSize,
        mimeType: newPhotoRecord.mimeType,
        dimensions: newPhotoRecord.dimensions,
        photoSourceUrl: newPhotoRecord.photoSourceUrl,
        photoSourceName: newPhotoRecord.photoSourceName,
        photoAttribution: newPhotoRecord.photoAttribution,
        photoLicense: newPhotoRecord.photoLicense,
        photoRightsStatus: newPhotoRecord.photoRightsStatus,
        updatedAt: newPhotoRecord.updatedAt,
      });

      return res.json({ success: true, photo: publicDto });
    } catch (err: any) {
      return sendServerError(res, 500, 'Error procesando la fotografía de la genética.', err, 'admin/genetics/upload-photo');
    }
  }
);

// 5. Eliminar fotografía oficial de una genética (Solo Creador/Admin - Firestore primero, luego Storage)
app.delete('/api/admin/genetics/delete-photo', verifyFirebaseAuth, verifyAdminRole, async (req, res) => {
  try {
    const { seedBank, name } = req.body;
    if (!seedBank || !name) {
      return res.status(400).json({ error: 'Se requiere especificar banco y nombre de la genética.' });
    }

    const key = getGeneticsPhotoKey(seedBank, name);
    const adminApp = getFirebaseAdmin();
    const db = adminApp.firestore();

    let existingDoc: any = null;
    try {
      const snap = await db.collection('geneticsCatalogPhotos').doc(key).get();
      if (!snap.exists) {
        return res.status(404).json({ error: 'Fotografía no encontrada.', code: 'photo/not-found' });
      }
      existingDoc = snap.data();
    } catch {
      return res.status(500).json({ error: 'Error accediendo a Firestore.', code: 'firestore/read-error' });
    }

    const existingStoragePath = existingDoc?.storagePath;

    // 1. Borrar metadata de Firestore PRIMERO
    try {
      await db.collection('geneticsCatalogPhotos').doc(key).delete();
    } catch {
      return res.status(500).json({
        error: 'Error eliminando registro en Firestore.',
        code: 'firestore/delete-failed',
      });
    }

    // 2. Solo cuando Firestore confirmó: eliminar archivo de Storage best-effort
    if (existingStoragePath) {
      try {
        const bucketName =
          process.env.FIREBASE_STORAGE_BUCKET ||
          appletFirebaseConfig.storageBucket ||
          'gen-lang-client-0531791519.firebasestorage.app';
        const bucket = getStorage(adminApp).bucket(bucketName);
        await bucket.file(existingStoragePath).delete({ ignoreNotFound: true }).catch(() => {
          console.warn('[genetics-photo] Orphaned storage object:', existingStoragePath);
        });
      } catch (storageErr) {
        console.warn('[genetics-photo] Orphaned storage object:', existingStoragePath);
      }
    }

    res.json({ success: true, key });
  } catch (err: any) {
    return sendServerError(res, 500, 'Error eliminando la fotografía.', err, 'admin/genetics/delete-photo');
  }
});

// Vite middleware & Static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cultiveta Server running on http://localhost:${PORT}`);
  });
}

startServer();
