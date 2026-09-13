import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';

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

// 1. Inicialización segura y perezosa de Firebase Admin SDK
let firebaseAdminApp: App | null = null;
export function getFirebaseAdmin(): App {
  if (!firebaseAdminApp) {
    if (getApps().length > 0) {
      firebaseAdminApp = getApps()[0];
      return firebaseAdminApp;
    }

    const projectId =
      process.env.FIREBASE_PROJECT_ID ||
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
        return firebaseAdminApp;
      } catch (err) {
        console.error('[Firebase Admin] Error parseando FIREBASE_SERVICE_ACCOUNT JSON:', err);
      }
    }

    // Inicialización por defecto (utiliza Application Default Credentials / ADC en Cloud Run)
    firebaseAdminApp = initializeApp({ projectId });
  }
  return firebaseAdminApp;
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

  try {
    const adminApp = getFirebaseAdmin();
    const adminAuth = getAuth(adminApp);

    // 3. Validar el JWT emitido por Firebase Auth
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    // 4. Inyectar la identidad del usuario a la petición Express
    req.user = decodedToken;
    req.userId = decodedToken.uid;

    return next();
  } catch (error: any) {
    console.error('[verifyFirebaseAuth] Error validando ID Token:', error?.message || error);

    // 5. Manejo granular de errores comunes de autenticación
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

    return res.status(401).json({
      error: 'Acceso no autorizado: Token de autenticación inválido o alterado.',
      code: 'auth/invalid-token',
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

// 2. Photo Analysis (Gemini Multimodal) - Protegido por verifyFirebaseAuth
app.post('/api/ai/analyze-photo', async (req, res) => {
  try {
    const { photoBase64OrUrl, category, userComments, cultivationContext } = req.body;

    if (!photoBase64OrUrl) {
      return res.status(400).json({ error: 'Se requiere una imagen para el análisis' });
    }

    const ai = getAIClient();

    // Prepare image part
    let imagePart: any;
    if (photoBase64OrUrl.startsWith('data:')) {
      const match = photoBase64OrUrl.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        imagePart = {
          inlineData: {
            mimeType: match[1],
            data: match[2],
          },
        };
      } else {
        const parts = photoBase64OrUrl.split(',');
        imagePart = {
          inlineData: {
            mimeType: 'image/jpeg',
            data: parts[1] || parts[0],
          },
        };
      }
    } else {
      // Remote URL or fallback
      imagePart = {
        text: `URL de la fotografía del cultivo para análisis: ${photoBase64OrUrl}`,
      };
    }

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
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            typeof imagePart === 'object' && imagePart.inlineData ? imagePart : { text: 'Fotografía adjunta' },
            { text: contextPrompt },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const responseText = response.text || '{}';
    let parsedResult;
    try {
      parsedResult = JSON.parse(responseText);
    } catch {
      parsedResult = {
        observed: responseText,
        possibleCauses: ['Se requiere mayor información para determinar causas.'],
        relatedCultivationData: ['Contexto básico provisto.'],
        missingInformation: ['Mediciones de pH y EC recientes.'],
        confidence: 'Media',
      };
    }

    res.json(parsedResult);
  } catch (error: any) {
    console.error('Error in /api/ai/analyze-photo:', error);
    res.status(500).json({ error: error?.message || 'Error procesando análisis con Cultiveta IA' });
  }
});

// 3. Contextual Chat for Cultivation
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, history, cultivation, recentWaterings, recentEnv, recentPhotos, recentNotes, condensedSummary } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Mensaje vacío' });
    }

    const ai = getAIClient();

    const systemInstruction = `
Eres Cultiveta IA, el compañero experto y botánico de la aplicación Cultiveta.
Estás conversando con el cultivador sobre su cultivo actual: "${cultivation?.name || 'Cultivo'}".

INFORMACIÓN REGISTRADA REAL DEL CULTIVO:
- Etapa actual: ${cultivation?.currentStage || 'No especificada'}
- Tipo: ${cultivation?.type || 'Indoor'}
- Genética: ${cultivation?.geneticsName || 'Sin especificar'} (Banco: ${cultivation?.seedBank || 'N/A'})
- Cantidad de plantas: ${cultivation?.plantCount || 1}
- Sustrato: ${cultivation?.substrate?.type || 'No especificado'} (${cultivation?.substrate?.potVolumeLiters || 'N/A'}L)
- Iluminación: ${cultivation?.lighting?.type || 'N/A'} (${cultivation?.lighting?.usedWatts || 'N/A'}W)

${condensedSummary && Array.isArray(condensedSummary) && condensedSummary.length > 0 ? `
=== MODO RESUMEN ACTIVADO POR EL CULTIVADOR ===
Los registros de ambiente y riegos han sido condensados en los siguientes puntos clave antes de consultar:
${condensedSummary.map((point: string) => `• ${point}`).join('\n')}

INSTRUCCIÓN ESPECÍFICA PARA MODO RESUMEN:
- Basa tu razonamiento prioritariamente en estos puntos clave condensados.
- Responde de forma sintética, accionable y estructurada, destacando si hay parámetros fuera de rango (como pH, EC o VPD) o si la frecuencia hídrica es adecuada.
==============================================
` : ''}

REGISTROS RECIENTES DE RIEGO:
${JSON.stringify(recentWaterings || [], null, 2)}

REGISTROS RECIENTES DE AMBIENTE:
${JSON.stringify(recentEnv || [], null, 2)}

FOTOS RECIENTES REGISTRADAS:
${JSON.stringify(recentPhotos || [], null, 2)}

NOTAS RECIENTES DEL DIARIO:
${JSON.stringify(recentNotes || [], null, 2)}

REGLAS DE RESPUESTA:
1. Responde en español amigable, cercano y con conocimiento botánico.
2. Basate SIEMPRE en los datos reales registrados arriba. Si el usuario te pregunta algo sobre lo que no hay registros (por ejemplo "cómo está mi EC" cuando no hay registros de EC), indícalo amablemente ("No tenés registros de EC cargados aún").
3. Si el usuario pide un resumen o análisis, cita las fechas o valores reales que fundamentan tu respuesta.
4. No uses lenguaje médico excesivo.
5. Devuelve la respuesta en formato JSON con la siguiente estructura:
{
  "reply": "Texto de tu respuesta en formato Markdown claro y bien formateado",
  "evidence": {
    "recordsReferenced": ["Lista breve de registros o eventos que usaste para contestar"],
    "metricsReferenced": ["Métricas citadas como 24°C, pH 6.2, etc."],
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
      model: 'gemini-2.5-flash',
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
      model: 'gemini-2.5-flash',
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

// 5. Compare Photos Evolution
app.post('/api/ai/compare-photos', async (req, res) => {
  try {
    const { photoA, photoB, geneticsName } = req.body;

    const ai = getAIClient();

    const prompt = `
Eres Cultiveta IA. Compara la evolución visual entre dos etapas de un cultivo de genética "${geneticsName || 'desconocida'}":
- Foto A: Día ${photoA?.day || 'X'} (Etapa: ${photoA?.stage || 'N/A'}) - URL/Ref: ${photoA?.url}
- Foto B: Día ${photoB?.day || 'Y'} (Etapa: ${photoB?.stage || 'N/A'}) - URL/Ref: ${photoB?.url}

Describe las diferencias visuales evolutivas con rigor botánico y honestidad.
Responde en JSON con:
{
  "visualChanges": "Descripción de cambios en tamaño, follaje, floración o coloración",
  "structuralGrowth": "Análisis del desarrollo estructural y ramas/copas",
  "healthNotes": "Observaciones sobre vigor y estado general visible",
  "confidence": "Media"
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    res.json(JSON.parse(response.text || '{}'));
  } catch (error: any) {
    console.error('Error in /api/ai/compare-photos:', error);
    res.status(500).json({ error: error?.message || 'Error comparando fotografías' });
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
