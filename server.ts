import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { CultivationTask } from './src/types';

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
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
    console.error('Error in /api/ai/analyze-photo:', error);
    res.status(500).json({ error: error?.message || 'Error procesando análisis con Cultiveta IA' });
  }
});

// 3. Contextual Chat for Cultivation
app.post('/api/ai/chat', async (req, res) => {
  try {
    const {
      message,
      history,
      cultivation,
      recentWaterings,
      recentEnv,
      recentPhotos,
      recentNotes,
      condensedSummary,
      intelligenceContext,
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Mensaje vacío' });
    }

    const ai = getAIClient();

    const cropName = intelligenceContext?.identity?.name || cultivation?.name;

    const systemInstruction = `
Eres Cultiveta IA, el compañero experto y botánico de la aplicación Cultiveta.
${cropName ? `Estás conversando con el cultivador sobre su cultivo: "${cropName}".` : `Estás conversando con el cultivador sobre botánica y cultivo general (sin cultivo específico seleccionado).`}

PRINCIPIO CENTRAL DE CULTIVETA:
DATOS REALES → CÁLCULOS DETERMINISTAS → ESTIMACIONES CON INCERTIDUMBRE → IA QUE INTERPRETA Y EXPLICA
Tú NO inventas cálculos matemáticos de secado ni fechas de riego; interpretas el motor determinista.

${intelligenceContext ? `
=== CONTEXTO AGRONÓMICO DE ALTA PRECISIÓN (PRECALCULADO DETERMINISTA) ===
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
=============================================================================
` : cultivation ? `
INFORMACIÓN BÁSICA DEL CULTIVO:
- Etapa actual: ${cultivation.currentStage || 'No especificada'}
- Tipo: ${cultivation.type || 'No especificado'}
- Genética: ${cultivation.geneticsName || 'Sin especificar'} (Banco: ${cultivation.seedBank || 'N/A'})
- Cantidad de plantas: ${cultivation.plantCount ?? 'No especificada'}
- Sustrato: ${cultivation.substrate?.type || 'No especificado'} (${cultivation.substrate?.potVolumeLiters ? `${cultivation.substrate?.potVolumeLiters}L` : 'Volumen no registrado'})
- Iluminación: ${cultivation.lighting?.type || 'N/A'}
` : `
CONSULTA GENERAL:
El usuario no ha seleccionado un cultivo específico. Responde a sus dudas agronómicas o botánicas generales sin asumir tipo de ambiente, genéticas ni cantidades de plantas inventadas.
`}

${condensedSummary && Array.isArray(condensedSummary) && condensedSummary.length > 0 ? `
=== MODO RESUMEN ACTIVADO POR EL CULTIVADOR ===
Puntos clave condensados:
${condensedSummary.map((point: string) => `• ${point}`).join('\n')}
==============================================
` : ''}

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
   - Si el usuario pregunta "¿Cuándo riego?" o sobre el secado de la maceta: NUNCA inventes una hora o fecha diferente a la del motor matemático. Usa la ventana de revisión provista en el Irrigation Forecast, explica los factores reales (volumen, VPD, temperatura, mediana histórica) y recomienda REVISAR la maceta (peso/humedad), no ordenar un riego a ciegas.
3. DATOS FALTANTES:
   - NUNCA inventes variables ausentes (ej. si no hay tamaño de maceta registrado, NO digas "tu maceta es de 10L"; di que no está registrado).
4. HISTORIAL DE ETAPAS:
   - Responde preguntas sobre duración de etapas pasadas utilizando las fechas y días de completedStages.
5. Devuelve la respuesta en formato JSON:
{
  "reply": "Texto de tu respuesta en formato Markdown claro y bien formateado",
  "evidence": {
    "recordsReferenced": ["Lista breve de registros o eventos que usaste para contestar"],
    "metricsReferenced": ["Métricas citadas como 24°C, pH 6.2, 63 h, etc."],
    "datesReferenced": ["Fechas citadas"]
  }
}
`;

    const chatContents: any[] = [];
    if (history && Array.isArray(history)) {
      history.slice(-8).forEach((msg) => {
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

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: chatContents,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    let result;
    try {
      result = JSON.parse(response.text || '{}');
    } catch {
      result = {
        reply: response.text || 'Entendido. ¿En qué más puedo ayudarte con este cultivo?',
        evidence: { recordsReferenced: [], metricsReferenced: [], datesReferenced: [] },
      };
    }

    res.json(result);
  } catch (error: any) {
    console.error('Error in /api/ai/chat:', error);
    res.status(500).json({ error: error?.message || 'Error procesando consulta con Cultiveta IA' });
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

    res.json(JSON.parse(response.text || '{}'));
  } catch (error: any) {
    console.error('Error in /api/ai/summary:', error);
    res.status(500).json({ error: error?.message || 'Error generando resumen' });
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

    res.json(JSON.parse(response.text || '{}'));
  } catch (error: any) {
    console.error('Error in /api/ai/weekly-summary:', error);
    res.status(500).json({ error: error?.message || 'Error generando resumen semanal' });
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
    console.error('Error in /api/ai/compare-photos:', error);
    res.status(500).json({ error: error?.message || 'Error comparando fotografías' });
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

export function broadcastNotification(payload: any, targetUserId?: string) {
  const data = JSON.stringify(payload);
  sseClients.forEach((client) => {
    if (!targetUserId || !client.userId || client.userId === 'system' || client.userId === targetUserId) {
      try {
        client.res.write(`data: ${data}\n\n`);
      } catch (err) {
        console.warn(`[SSE Broadcast] Error enviando a cliente ${client.id}:`, err);
      }
    }
  });
}

// Sincronización horaria automática para cultivos Outdoor e Invernadero
// Puede ejecutarse globalmente desde el cron o restringida a un usuario específico
export async function syncHourlyOutdoorWeather(targetUserId?: string) {
  console.log(`[Cron Job] Ejecutando sincronización de clima exterior (Objetivo: ${targetUserId || 'todos'})...`);
  let isFirestoreAvailable = false;
  let firestore: Firestore | null = null;
  const outdoorCropsMap = new Map<string, { id: string; data: any }>();

  // 1. Cargar cultivos registrados localmente en el servidor filtrando por targetUserId si aplica
  outdoorCropsStore.forEach((crop, id) => {
    if (!crop.isFinished && crop.locationCoordinates) {
      if (!targetUserId || crop.userId === targetUserId) {
        outdoorCropsMap.set(id, { id, data: crop });
      }
    }
  });

  // 2. Intentar consultar Cloud Firestore de manera segura
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

      if (isOutdoorOrGreenhouse && hasCoords) {
        outdoorCropsMap.set(doc.id, { id: doc.id, data });
        outdoorCropsStore.set(doc.id, {
          id: doc.id,
          userId: data.userId || 'system',
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

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const createdAtIso = now.toISOString();

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
        const dateStr = isoString.split('T')[0];
        const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

        const newRecord = {
          id: `auto-env-${crop.id}-${Date.now()}`,
          userId: crop.data.userId || 'system',
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

        outdoorRecordsStore.push(newRecord);

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

        if (isCritical) {
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

            const ai = getAIClient();
            let aiResponse: any = null;
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
                console.warn(`[Cron Job Alertas] Modelo ${modelName} no respondió, probando alternativa:`, mErr?.message || mErr);
              }
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
            const taskId = `task-env-alert-${crop.id}-${Date.now()}`;
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
              categoryLabel: '🚨 Alerta Climática',
              title: alertTitle,
              description: alertDescription,
              dueDate: dateStr,
              actionHint: 'Revisar Cultivo',
              isDemo: Boolean(crop.data.isDemo),
              createdAt: isoString,
              userId: crop.data.userId || 'system',
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
            outdoorTasksStore.push(newTask);
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

// Programación de Cron Job: cada minuto (para pruebas y monitoreo activo)
cron.schedule('* * * * *', async () => {
  try {
    await syncHourlyOutdoorWeather();
  } catch (e: any) {
    console.warn('[Cron Job] Error controlado en la ejecución programada:', e?.message || e);
  }
});

// Endpoint para que el cliente registre cultivos Outdoor/Invernadero con coordenadas
app.post('/api/outdoor/cultivations', verifyFirebaseAuth, (req, res) => {
  try {
    const { id, name, type, geneticsName, currentStage, isFinished, locationCoordinates, isDemo } = req.body;
    const userId = req.userId!;

    if (!id || !locationCoordinates || typeof locationCoordinates.lat !== 'number' || typeof locationCoordinates.lon !== 'number') {
      return res.status(400).json({ error: 'Datos incompletos de cultivo o coordenadas inválidas.' });
    }

    outdoorCropsStore.set(id, {
      id,
      userId,
      name: name || 'Cultivo',
      type: type || 'Outdoor',
      geneticsName: geneticsName || 'No especificada',
      currentStage: currentStage || 'Vegetativo',
      isFinished: Boolean(isFinished),
      locationCoordinates,
      isDemo: Boolean(isDemo),
    });

    res.json({ success: true, totalRegistered: outdoorCropsStore.size });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error guardando cultivo exterior' });
  }
});

// Endpoint para consultar registros ambientales generados automáticamente
app.get('/api/outdoor/environment-records', verifyFirebaseAuth, (req, res) => {
  try {
    const { cultivationId } = req.query;
    const userId = req.userId!;
    let records = outdoorRecordsStore.filter((r) => r.userId === userId || r.userId === 'system');

    if (cultivationId) {
      records = records.filter((r) => r.cultivationId === cultivationId);
    }

    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error consultando registros ambientales' });
  }
});

// Endpoint para consultar tareas y alertas críticas generadas automáticamente por Sincronización Inversa
app.get('/api/outdoor/tasks', verifyFirebaseAuth, (req, res) => {
  try {
    const { cultivationId } = req.query;
    const userId = req.userId!;
    let tasks = outdoorTasksStore.filter((t) => (t as any).userId === userId || (t as any).userId === 'system');

    if (cultivationId) {
      tasks = tasks.filter((t) => t.cultivationId === cultivationId);
    }

    res.json(tasks);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error consultando tareas de alerta' });
  }
});

// Endpoint para disparar manualmente la sincronización restringido al usuario autenticado
app.post('/api/cron/trigger-outdoor-weather', verifyFirebaseAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    const result = await syncHourlyOutdoorWeather(userId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.warn('[Trigger Outdoor Weather] Error controlado:', error?.message || error);
    res.status(500).json({ error: error?.message || 'Error ejecutando sincronización manual' });
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
      title: '🚨 Alerta Climática: Humedad Crítica (79%)',
      description: 'El cron job detectó humedad de 79% en floración. Se recomienda ventilación máxima inmediata para evitar botrytis.',
      dueDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      categoryLabel: '🚨 Alerta Climática',
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
      message: 'Notificación de alerta enviada vía SSE al usuario autenticado',
      clientsNotified: sseClients.size,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error emitiendo notificación de prueba' });
  }
});

// Endpoint para listar las alertas ambientales recientes del usuario autenticado
app.get('/api/notifications/recent', verifyFirebaseAuth, (req, res) => {
  try {
    const userId = req.userId!;
    const alerts = outdoorTasksStore.filter(
      (t) => t.type === 'env_alert' && ((t as any).userId === userId || (t as any).userId === 'system')
    );
    res.json(alerts.slice(-20).reverse());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error consultando alertas recientes' });
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
