import {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  where
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import {
  AIPhotoAnalysis,
  AIConversationMessage,
  Cultivation,
  AIPhotoAnalysisResult,
  Watering,
  EnvironmentRecord,
  DiaryEntry,
  PhotoRecord,
  CultivationIntelligenceContext,
} from '../types';
import { cleanFirestoreData } from '../utils/firestoreUtils';

export interface CultivationAnalysisContext {
  id?: string;
  name?: string;
  cropName?: string;
  stage?: string;
  currentStage?: string;
  day?: number;
  dayOfCultivation?: number;
  genetics?: string;
  geneticsName?: string;
  type?: string;
  substrate?: string;
  lighting?: string;
  recentWaterings?: Watering[];
  recentEnv?: EnvironmentRecord[];
}

/**
 * Obtiene los encabezados requeridos para invocar los endpoints protegidos /api/ai/*.
 * Requiere estrictamente una identidad verificada de Firebase Auth (FASE 1).
 */
async function getAuthHeaders(): Promise<{ Authorization: string; 'Content-Type': string }> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('Debes iniciar sesión con una cuenta para utilizar las funciones de Cultiveta IA.');
  }

  const token = await currentUser.getIdToken();
  if (!token || token.length === 0) {
    throw new Error('No se pudo verificar el token de sesión. Por favor renueva tu inicio de sesión.');
  }

  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export const aiService = {
  async getAnalysesByCultivation(cultivationId: string): Promise<AIPhotoAnalysis[]> {
    const q = query(
      collection(db, 'photoAnalyses'),
      where('cultivationId', '==', cultivationId)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as AIPhotoAnalysis))
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  },

  async saveAnalysis(data: Omit<AIPhotoAnalysis, 'id' | 'createdAt'>): Promise<AIPhotoAnalysis> {
    const docRef = doc(collection(db, 'photoAnalyses'));
    const now = new Date().toISOString();
    const newAnalysis: AIPhotoAnalysis = {
      ...data,
      id: docRef.id,
      createdAt: now,
    };
    await setDoc(docRef, cleanFirestoreData(newAnalysis));
    return newAnalysis;
  },

  /**
   * Analiza una fotografía con IA multimodal real.
   * FASE 5: Ante cualquier error de red, modelo o permisos, propaga el error tipado.
   * NUNCA inventa diagnósticos de planta sana de respaldo.
   */
  async analyzePlantPhoto(params: {
    photoId?: string;
    cultivationId?: string;
    storagePath?: string;
    photoUrl: string;
    cultivationContext?: CultivationAnalysisContext;
  }): Promise<AIPhotoAnalysisResult> {
    const res = await this.analyzePhotoWithGemini({
      photoId: params.photoId,
      cultivationId: params.cultivationId,
      storagePath: params.storagePath,
      photoBase64OrUrl: params.photoUrl,
      cultivationContext: params.cultivationContext
        ? {
            name: params.cultivationContext.name || params.cultivationContext.cropName || 'Cultivo',
            stage: params.cultivationContext.stage || params.cultivationContext.currentStage || 'Vegetativo',
            day: params.cultivationContext.day || params.cultivationContext.dayOfCultivation || 1,
            genetics: params.cultivationContext.genetics || params.cultivationContext.geneticsName,
            type: params.cultivationContext.type || 'Indoor',
            substrate: params.cultivationContext.substrate,
          }
        : undefined,
    });

    // Derivar severidad botánica basada en hallazgos objetivos, no exclusivamente en la confianza
    let derivedSeverity: 'Baja' | 'Media' | 'Alta' = 'Baja';
    const textCorpus = `${res.observed} ${res.possibleCauses.join(' ')}`.toLowerCase();
    if (
      textCorpus.includes('botrytis') ||
      textCorpus.includes('pudrición') ||
      textCorpus.includes('plaga severa') ||
      textCorpus.includes('muerte') ||
      textCorpus.includes('marchitez bacteriana')
    ) {
      derivedSeverity = 'Alta';
    } else if (
      textCorpus.includes('carencia') ||
      textCorpus.includes('exceso') ||
      textCorpus.includes('quemadura') ||
      textCorpus.includes('bloqueo') ||
      textCorpus.includes('ph') ||
      textCorpus.includes('stress')
    ) {
      derivedSeverity = 'Media';
    }

    return {
      diagnosis: res.possibleCauses[0] || 'Evolución vegetal observada',
      severity: derivedSeverity,
      affectedOrgan: 'Follaje / Estructura',
      visualFindings: res.observed,
      actionPlan:
        res.relatedCultivationData.length > 0
          ? res.relatedCultivationData
          : ['Continuar con el régimen actual y registrar nuevas fotografías para seguir la evolución.'],
      confidence: res.confidence,
    };
  },

  async askAssistant(params: {
    question: string;
    cultivationContext?: CultivationAnalysisContext;
    chatHistory?: { role: string; content: string }[];
    condensedSummary?: string[];
    intelligenceContext?: CultivationIntelligenceContext;
    cultivation?: Cultivation;
    waterings?: Watering[];
    envRecords?: EnvironmentRecord[];
    photos?: PhotoRecord[];
    diaryEntries?: DiaryEntry[];
  }): Promise<string> {
    const targetCultivation: Cultivation | undefined = params.cultivation;

    const res = await this.chatWithCropContext({
      message: params.question,
      history: (params.chatHistory || []).map((h, i) => ({
        id: `hist-${i}`,
        sender: h.role === 'user' ? 'user' : 'assistant',
        text: h.content,
        timestamp: '',
      })),
      cultivation: targetCultivation,
      recentWaterings: params.waterings || params.cultivationContext?.recentWaterings || [],
      recentEnv: params.envRecords || params.cultivationContext?.recentEnv || [],
      recentPhotos: params.photos || [],
      recentNotes: params.diaryEntries || [],
      condensedSummary: params.condensedSummary,
      intelligenceContext: params.intelligenceContext,
    });

    return res.reply;
  },

  async analyzePhotoWithGemini(params: {
    photoId?: string;
    cultivationId?: string;
    storagePath?: string;
    photoBase64OrUrl: string;
    category?: string;
    userComments?: string;
    cultivationContext?: {
      name: string;
      stage: string;
      day: number;
      genetics?: string;
      type: string;
      substrate?: string;
      recentWatering?: Watering;
      recentEnv?: EnvironmentRecord;
    };
  }): Promise<{
    observed: string;
    possibleCauses: string[];
    relatedCultivationData: string[];
    missingInformation: string[];
    confidence: 'Baja' | 'Media' | 'Alta';
  }> {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/ai/analyze-photo', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Error de comunicación con el servicio de IA' }));
      throw new Error(err.error || `Error en análisis con Cultiveta IA (HTTP ${response.status})`);
    }

    return await response.json();
  },

  async chatWithCropContext(params: {
    message: string;
    history: AIConversationMessage[];
    cultivation?: Cultivation;
    recentWaterings?: Watering[];
    recentEnv?: EnvironmentRecord[];
    recentPhotos?: PhotoRecord[];
    recentNotes?: DiaryEntry[];
    condensedSummary?: string[];
    intelligenceContext?: CultivationIntelligenceContext;
  }): Promise<{
    reply: string;
    evidence?: {
      recordsReferenced: string[];
      metricsReferenced: string[];
      datesReferenced: string[];
    };
  }> {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Error comunicando con Cultiveta IA' }));
      throw new Error(err.error || 'Error en asistente Cultiveta IA');
    }

    return await response.json();
  },

  async get7DaySummary(params: {
    cultivation: Cultivation;
    waterings7d: Watering[];
    env7d: EnvironmentRecord[];
    photos7d: PhotoRecord[];
    notes7d: DiaryEntry[];
  }): Promise<{
    summary: string;
    wateringsCount: number;
    photosCount: number;
    avgTemp?: number;
    avgHumidity?: number;
    notableObservations: string[];
    missingDataTips: string[];
  }> {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/ai/summary', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Error generando resumen' }));
      throw new Error(err.error || 'Error en resumen Cultiveta IA');
    }

    return await response.json();
  },

  async getWeeklySummary(params: {
    cultivations: { name: string; stage: string; genetics?: string }[];
    wateringsCount: number;
    recentEnvAvg: { tempC: number; humidityPct: number };
  }): Promise<string> {
    const cropNames = params.cultivations.map((c) => c.name).join(', ') || 'Cultivos activos';
    const dummyCultivation: Cultivation = {
      id: 'all',
      userId: 'user',
      name: cropNames,
      startDate: new Date().toISOString(),
      type: 'Indoor',
      plantCount: params.cultivations.length,
      currentStage: (params.cultivations[0]?.stage as any) || 'Vegetativo',
      stageStartDate: new Date().toISOString(),
      substrate: {
        type: 'No especificado',
        potVolumeLiters: 0,
        potType: 'Otro',
      },
      status: 'ESTABLE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const res = await this.get7DaySummary({
        cultivation: dummyCultivation,
        waterings7d: Array(params.wateringsCount).fill({} as any),
        env7d: [
          {
            id: 'avg',
            userId: 'user',
            cultivationId: 'all',
            date: new Date().toISOString(),
            temperatureC: params.recentEnvAvg.tempC,
            humidityPct: params.recentEnvAvg.humidityPct,
            createdAt: new Date().toISOString(),
          },
        ],
        photos7d: [],
        notes7d: [],
      });
      return res.summary;
    } catch {
      return `Resumen semanal: ${params.cultivations.length} cultivo(s) en seguimiento (${cropNames}). Riegos registrados: ${params.wateringsCount}. Parámetros climáticos promedio: ${params.recentEnvAvg.tempC}°C y ${params.recentEnvAvg.humidityPct}% HR.`;
    }
  },

  async comparePhotos(params: {
    photoA: { id?: string; cultivationId?: string; storagePath?: string; url: string; dayOfCultivation?: number; day?: number; stage: string };
    photoB: { id?: string; cultivationId?: string; storagePath?: string; url: string; dayOfCultivation?: number; day?: number; stage: string };
    geneticsName?: string;
  }): Promise<{
    visualChanges: string;
    structuralGrowth: string;
    healthNotes: string;
    confidence: 'Baja' | 'Media' | 'Alta';
  }> {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/ai/compare-photos', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Error comparando imágenes' }));
      throw new Error(err.error || 'Error en comparación visual');
    }

    return await response.json();
  }
};
