import { doc, collection, getDocs, setDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Cultivation, FertilizationSchedule, FertilizationWeek, FertilizationProductDosage } from '../types';
import { cleanFirestoreData } from '../utils/firestoreUtils';
import { localStore } from './localStore';

export interface FertilizationPresetMeta {
  id: string;
  name: string;
  brand: string;
  substrateType: string;
  description: string;
  totalWeeks: number;
}

export const PRESET_FEEDING_SCHEDULES: Record<string, {
  name: string;
  brand: string;
  substrateType: string;
  description: string;
  weeks: Omit<FertilizationWeek, 'weekNumber'>[];
}> = {
  biobizz_organic: {
    name: 'Biobizz 100% Orgánico (All-Mix / Light-Mix)',
    brand: 'Biobizz',
    substrateType: 'Tierra / Sustrato',
    description: 'Programa biológico completo para floración aromática, máxima resina y sabor puro.',
    weeks: [
      {
        stage: 'Plántula',
        title: 'Semana 1 · Enraizamiento inicial',
        targetPh: 6.2,
        targetEc: 0.8,
        observations: 'Riegos ligeros alrededor del tallo. Fomentar expansión radicular.',
        products: [
          { id: 'bb-1', name: 'Root-Juice', brand: 'Biobizz', dosageMlPerL: 2.0, category: 'raices', notes: 'Estimula pelos absorbentes' },
          { id: 'bb-2', name: 'Bio-Grow', brand: 'Biobizz', dosageMlPerL: 1.0, category: 'crecimiento' },
        ],
      },
      {
        stage: 'Vegetativo',
        title: 'Semana 2 · Crecimiento Vegetativo 1',
        targetPh: 6.3,
        targetEc: 1.1,
        observations: 'Aumento de masa foliar y desarrollo de nudos.',
        products: [
          { id: 'bb-3', name: 'Bio-Grow', brand: 'Biobizz', dosageMlPerL: 2.0, category: 'crecimiento' },
          { id: 'bb-4', name: 'Bio-Heaven', brand: 'Biobizz', dosageMlPerL: 2.0, category: 'estimulante', notes: 'Energía y absorción' },
          { id: 'bb-5', name: 'Calmag', brand: 'Biobizz', dosageMlPerL: 0.5, category: 'calmag', notes: 'Prevención bajo LED' },
        ],
      },
      {
        stage: 'Vegetativo',
        title: 'Semana 3 · Crecimiento Vegetativo 2',
        targetPh: 6.3,
        targetEc: 1.3,
        observations: 'Estructuración previa al cambio de fotoperiodo.',
        products: [
          { id: 'bb-6', name: 'Bio-Grow', brand: 'Biobizz', dosageMlPerL: 2.5, category: 'crecimiento' },
          { id: 'bb-7', name: 'Bio-Heaven', brand: 'Biobizz', dosageMlPerL: 2.0, category: 'estimulante' },
          { id: 'bb-8', name: 'Calmag', brand: 'Biobizz', dosageMlPerL: 0.8, category: 'calmag' },
        ],
      },
      {
        stage: 'Prefloración',
        title: 'Semana 4 · Prefloración y Estiramiento (Stretch)',
        targetPh: 6.3,
        targetEc: 1.4,
        observations: 'Cambio a 12/12. Comienzo gradual de fósforo y potasio orgánico.',
        products: [
          { id: 'bb-9', name: 'Bio-Grow', brand: 'Biobizz', dosageMlPerL: 2.0, category: 'crecimiento' },
          { id: 'bb-10', name: 'Bio-Bloom', brand: 'Biobizz', dosageMlPerL: 1.0, category: 'floracion' },
          { id: 'bb-11', name: 'Top-Max', brand: 'Biobizz', dosageMlPerL: 1.0, category: 'estimulante', notes: 'Estimula formación floral' },
          { id: 'bb-12', name: 'Calmag', brand: 'Biobizz', dosageMlPerL: 0.8, category: 'calmag' },
        ],
      },
      {
        stage: 'Floración',
        title: 'Semana 5 · Floración 1 (Formación de botones florales)',
        targetPh: 6.4,
        targetEc: 1.6,
        observations: 'Aparecen los primeros pompones y pistilos blancos.',
        products: [
          { id: 'bb-13', name: 'Bio-Grow', brand: 'Biobizz', dosageMlPerL: 2.0, category: 'crecimiento' },
          { id: 'bb-14', name: 'Bio-Bloom', brand: 'Biobizz', dosageMlPerL: 2.0, category: 'floracion' },
          { id: 'bb-15', name: 'Top-Max', brand: 'Biobizz', dosageMlPerL: 1.0, category: 'estimulante' },
          { id: 'bb-16', name: 'Bio-Heaven', brand: 'Biobizz', dosageMlPerL: 2.0, category: 'estimulante' },
          { id: 'bb-17', name: 'Calmag', brand: 'Biobizz', dosageMlPerL: 1.0, category: 'calmag' },
        ],
      },
      {
        stage: 'Floración',
        title: 'Semana 6 · Floración 2 (Desarrollo y densidad de cálices)',
        targetPh: 6.4,
        targetEc: 1.8,
        observations: 'Engorde progresivo. Demanda elevada de potasio y micronutrientes.',
        products: [
          { id: 'bb-18', name: 'Bio-Grow', brand: 'Biobizz', dosageMlPerL: 2.0, category: 'crecimiento' },
          { id: 'bb-19', name: 'Bio-Bloom', brand: 'Biobizz', dosageMlPerL: 3.0, category: 'floracion' },
          { id: 'bb-20', name: 'Top-Max', brand: 'Biobizz', dosageMlPerL: 2.0, category: 'estimulante' },
          { id: 'bb-21', name: 'Bio-Heaven', brand: 'Biobizz', dosageMlPerL: 3.0, category: 'estimulante' },
          { id: 'bb-22', name: 'Calmag', brand: 'Biobizz', dosageMlPerL: 1.0, category: 'calmag' },
        ],
      },
      {
        stage: 'Floración',
        title: 'Semana 7 · Floración 3 (Pico de nutrición y tricomas)',
        targetPh: 6.5,
        targetEc: 2.0,
        observations: 'Pico máximo nutricional. Controlar puntas de hojas para evitar sobrefertilización.',
        products: [
          { id: 'bb-23', name: 'Bio-Grow', brand: 'Biobizz', dosageMlPerL: 2.0, category: 'crecimiento' },
          { id: 'bb-24', name: 'Bio-Bloom', brand: 'Biobizz', dosageMlPerL: 4.0, category: 'floracion' },
          { id: 'bb-25', name: 'Top-Max', brand: 'Biobizz', dosageMlPerL: 4.0, category: 'estimulante' },
          { id: 'bb-26', name: 'Bio-Heaven', brand: 'Biobizz', dosageMlPerL: 4.0, category: 'estimulante' },
          { id: 'bb-27', name: 'Calmag', brand: 'Biobizz', dosageMlPerL: 1.0, category: 'calmag' },
        ],
      },
      {
        stage: 'Maduración',
        title: 'Semana 8 · Maduración (Reducción de Nitrógeno)',
        targetPh: 6.5,
        targetEc: 1.5,
        observations: 'Pistilos tostándose y cabezas de tricomas hinchadas. Bajar nitrógeno.',
        products: [
          { id: 'bb-28', name: 'Bio-Bloom', brand: 'Biobizz', dosageMlPerL: 3.0, category: 'floracion' },
          { id: 'bb-29', name: 'Top-Max', brand: 'Biobizz', dosageMlPerL: 4.0, category: 'estimulante' },
          { id: 'bb-30', name: 'Bio-Heaven', brand: 'Biobizz', dosageMlPerL: 2.0, category: 'estimulante' },
        ],
      },
      {
        stage: 'Lavado',
        title: 'Semana 9 · Lavado de Raíces (Flush)',
        targetPh: 6.3,
        targetEc: 0.3,
        observations: 'Solo agua osmótica o desclorada. La planta consume sus reservas de hojas.',
        products: [],
      },
      {
        stage: 'Lavado',
        title: 'Semana 10 · Cosecha y Secado',
        targetPh: 6.3,
        targetEc: 0.2,
        observations: 'Dejar secar el sustrato 48h antes de cortar para facilitar el manicurado.',
        products: [],
      },
    ],
  },

  top_crop_line: {
    name: 'Top Crop Completo (Mineral & Bioestimulantes)',
    brand: 'Top Crop',
    substrateType: 'Tierra / Sustrato',
    description: 'Línea de alta efectividad con Deeper Underground, Top Veg, Top Bloom, Big One y Top Candy.',
    weeks: [
      {
        stage: 'Plántula',
        title: 'Semana 1 · Enraizamiento',
        targetPh: 6.0,
        targetEc: 0.8,
        observations: 'Estimulación del sistema radicular.',
        products: [
          { id: 'tc-1', name: 'Deeper Underground', brand: 'Top Crop', dosageMlPerL: 1.5, category: 'raices' },
        ],
      },
      {
        stage: 'Vegetativo',
        title: 'Semana 2 · Crecimiento Vegetativo 1',
        targetPh: 6.1,
        targetEc: 1.1,
        observations: 'Aporte de nitrógeno para vigorosidad.',
        products: [
          { id: 'tc-2', name: 'Top Veg', brand: 'Top Crop', dosageMlPerL: 2.0, category: 'crecimiento' },
          { id: 'tc-3', name: 'Deeper Underground', brand: 'Top Crop', dosageMlPerL: 1.0, category: 'raices' },
        ],
      },
      {
        stage: 'Vegetativo',
        title: 'Semana 3 · Crecimiento Vegetativo 2',
        targetPh: 6.2,
        targetEc: 1.3,
        observations: 'Desarrollo de ramas secundarias.',
        products: [
          { id: 'tc-4', name: 'Top Veg', brand: 'Top Crop', dosageMlPerL: 3.0, category: 'crecimiento' },
          { id: 'tc-5', name: 'Green Explosion', brand: 'Top Crop', dosageMlPerL: 1.0, category: 'estimulante', notes: 'Foliar o en riego' },
        ],
      },
      {
        stage: 'Prefloración',
        title: 'Semana 4 · Prefloración y Primer Big One',
        targetPh: 6.3,
        targetEc: 1.4,
        observations: 'Estimulador de floración concentrado.',
        products: [
          { id: 'tc-6', name: 'Top Veg', brand: 'Top Crop', dosageMlPerL: 1.5, category: 'crecimiento' },
          { id: 'tc-7', name: 'Big One', brand: 'Top Crop', dosageMlPerL: 2.0, category: 'estimulante', notes: 'Incrementa nudos florales' },
        ],
      },
      {
        stage: 'Floración',
        title: 'Semana 5 · Floración 1 (Inicio de cálices)',
        targetPh: 6.3,
        targetEc: 1.6,
        observations: 'Fósforo y potasio para cuajado floral.',
        products: [
          { id: 'tc-8', name: 'Top Bloom', brand: 'Top Crop', dosageMlPerL: 2.0, category: 'floracion' },
          { id: 'tc-9', name: 'Top Candy', brand: 'Top Crop', dosageMlPerL: 1.0, category: 'estimulante', notes: 'Azúcares e hidratos' },
        ],
      },
      {
        stage: 'Floración',
        title: 'Semana 6 · Floración 2 (Segundo Big One & Engorde)',
        targetPh: 6.4,
        targetEc: 1.8,
        observations: 'Refuerzo de Big One y azúcares Top Candy.',
        products: [
          { id: 'tc-10', name: 'Top Bloom', brand: 'Top Crop', dosageMlPerL: 3.0, category: 'floracion' },
          { id: 'tc-11', name: 'Big One', brand: 'Top Crop', dosageMlPerL: 2.0, category: 'estimulante' },
          { id: 'tc-12', name: 'Top Candy', brand: 'Top Crop', dosageMlPerL: 2.0, category: 'estimulante' },
        ],
      },
      {
        stage: 'Floración',
        title: 'Semana 7 · Floración 3 (Top Bud - Reventador de Cogollos)',
        targetPh: 6.5,
        targetEc: 2.0,
        observations: 'Aporte masivo de PK concentrado.',
        products: [
          { id: 'tc-13', name: 'Top Bloom', brand: 'Top Crop', dosageMlPerL: 3.0, category: 'floracion' },
          { id: 'tc-14', name: 'Top Bud', brand: 'Top Crop', dosageMlPerL: 1.0, category: 'pk_booster', notes: 'PK 16-18' },
          { id: 'tc-15', name: 'Top Candy', brand: 'Top Crop', dosageMlPerL: 2.0, category: 'estimulante' },
        ],
      },
      {
        stage: 'Maduración',
        title: 'Semana 8 · Maduración final',
        targetPh: 6.5,
        targetEc: 1.5,
        observations: 'Solo azúcares e hidratos antes del lavado.',
        products: [
          { id: 'tc-16', name: 'Top Candy', brand: 'Top Crop', dosageMlPerL: 2.0, category: 'estimulante' },
        ],
      },
      {
        stage: 'Lavado',
        title: 'Semana 9 · Lavado de Raíces',
        targetPh: 6.3,
        targetEc: 0.3,
        observations: 'Agua limpia para consumir sales residuales.',
        products: [],
      },
    ],
  },

  advanced_nutrients_ph_perfect: {
    name: 'Advanced Nutrients pH Perfect (Sensi Series)',
    brand: 'Advanced Nutrients',
    substrateType: 'Tierra / Coco / Hidroponía',
    description: 'Tecnología pH Perfect autoestabilizante con quelatos de aminoácidos y Big Bud.',
    weeks: [
      {
        stage: 'Vegetativo',
        title: 'Semana 1-2 · Vegetativo temprano',
        targetPh: 6.0,
        targetEc: 1.2,
        observations: 'Base balanceada y estimuladores radiculares.',
        products: [
          { id: 'an-1', name: 'Sensi Grow A', brand: 'Advanced Nutrients', dosageMlPerL: 2.0, category: 'crecimiento' },
          { id: 'an-2', name: 'Sensi Grow B', brand: 'Advanced Nutrients', dosageMlPerL: 2.0, category: 'crecimiento' },
          { id: 'an-3', name: 'B-52', brand: 'Advanced Nutrients', dosageMlPerL: 2.0, category: 'estimulante' },
          { id: 'an-4', name: 'Voodoo Juice', brand: 'Advanced Nutrients', dosageMlPerL: 2.0, category: 'raices' },
        ],
      },
      {
        stage: 'Vegetativo',
        title: 'Semana 3 · Vegetativo tardío',
        targetPh: 6.1,
        targetEc: 1.4,
        observations: 'Follaje denso y preparación para floración.',
        products: [
          { id: 'an-5', name: 'Sensi Grow A', brand: 'Advanced Nutrients', dosageMlPerL: 3.0, category: 'crecimiento' },
          { id: 'an-6', name: 'Sensi Grow B', brand: 'Advanced Nutrients', dosageMlPerL: 3.0, category: 'crecimiento' },
          { id: 'an-7', name: 'B-52', brand: 'Advanced Nutrients', dosageMlPerL: 2.0, category: 'estimulante' },
        ],
      },
      {
        stage: 'Prefloración',
        title: 'Semana 4 · Transición a Floración',
        targetPh: 6.2,
        targetEc: 1.6,
        observations: 'Inicio de base de floración.',
        products: [
          { id: 'an-8', name: 'Sensi Bloom A', brand: 'Advanced Nutrients', dosageMlPerL: 2.0, category: 'floracion' },
          { id: 'an-9', name: 'Sensi Bloom B', brand: 'Advanced Nutrients', dosageMlPerL: 2.0, category: 'floracion' },
          { id: 'an-10', name: 'Bud Ignitor', brand: 'Advanced Nutrients', dosageMlPerL: 2.0, category: 'estimulante' },
        ],
      },
      {
        stage: 'Floración',
        title: 'Semana 5-6 · Big Bud Plena Floración',
        targetPh: 6.3,
        targetEc: 1.8,
        observations: 'Aporte de Big Bud para volumen y peso.',
        products: [
          { id: 'an-11', name: 'Sensi Bloom A', brand: 'Advanced Nutrients', dosageMlPerL: 3.5, category: 'floracion' },
          { id: 'an-12', name: 'Sensi Bloom B', brand: 'Advanced Nutrients', dosageMlPerL: 3.5, category: 'floracion' },
          { id: 'an-13', name: 'Big Bud', brand: 'Advanced Nutrients', dosageMlPerL: 2.0, category: 'pk_booster' },
          { id: 'an-14', name: 'B-52', brand: 'Advanced Nutrients', dosageMlPerL: 2.0, category: 'estimulante' },
        ],
      },
      {
        stage: 'Maduración',
        title: 'Semana 7-8 · Overdrive Maduración de Cálices',
        targetPh: 6.4,
        targetEc: 1.7,
        observations: 'Overdrive induce segunda oleada de floración y endurecimiento.',
        products: [
          { id: 'an-15', name: 'Sensi Bloom A', brand: 'Advanced Nutrients', dosageMlPerL: 3.0, category: 'floracion' },
          { id: 'an-16', name: 'Sensi Bloom B', brand: 'Advanced Nutrients', dosageMlPerL: 3.0, category: 'floracion' },
          { id: 'an-17', name: 'Overdrive', brand: 'Advanced Nutrients', dosageMlPerL: 2.0, category: 'pk_booster' },
        ],
      },
      {
        stage: 'Lavado',
        title: 'Semana 9 · Flawless Finish',
        targetPh: 6.2,
        targetEc: 0.3,
        observations: 'Quelante de lavado final para eliminar excesos de sales.',
        products: [
          { id: 'an-18', name: 'Flawless Finish', brand: 'Advanced Nutrients', dosageMlPerL: 2.0, category: 'enzimas' },
        ],
      },
    ],
  },
};

export const fertilizationService = {
  getPresetList(): FertilizationPresetMeta[] {
    return Object.entries(PRESET_FEEDING_SCHEDULES).map(([id, meta]) => ({
      id,
      name: meta.name,
      brand: meta.brand,
      substrateType: meta.substrateType,
      description: meta.description,
      totalWeeks: meta.weeks.length,
    }));
  },

  getPresetSchedule(presetId: string, cultivationId: string, userId: string): FertilizationSchedule {
    const preset = PRESET_FEEDING_SCHEDULES[presetId] || PRESET_FEEDING_SCHEDULES.biobizz_organic;
    const now = new Date().toISOString();
    return {
      id: `sched_${cultivationId}`,
      userId,
      cultivationId,
      name: preset.name,
      brand: preset.brand,
      substrateType: preset.substrateType,
      presetId,
      weeks: preset.weeks.map((w, idx) => ({
        ...w,
        weekNumber: idx + 1,
        products: w.products.map((p) => ({ ...p, id: `p_${idx}_${Math.random().toString(36).substring(2, 7)}` })),
      })),
      notes: preset.description,
      createdAt: now,
      updatedAt: now,
    };
  },

  calculateCurrentWeek(cultivation: Cultivation): number {
    try {
      const startMs = new Date(cultivation.startDate).getTime();
      const nowMs = Date.now();
      const diffDays = Math.max(1, Math.floor((nowMs - startMs) / (1000 * 60 * 60 * 24)));
      const week = Math.ceil(diffDays / 7);
      return Math.max(1, week);
    } catch {
      return 1;
    }
  },

  async getScheduleByCultivation(cultivationId: string, userId: string): Promise<FertilizationSchedule | null> {
    const targetUserId = userId || (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');
    const localSchedules = localStore.getItems<FertilizationSchedule>('fertilizationSchedules', targetUserId);
    const existing = localSchedules.find((s) => s.cultivationId === cultivationId);
    if (existing) {
      return existing;
    }

    try {
      const q = query(
        collection(db, 'fertilizationSchedules'),
        where('cultivationId', '==', cultivationId)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const found = { id: snap.docs[0].id, ...snap.docs[0].data() } as FertilizationSchedule;
        localStore.saveItem('fertilizationSchedules', found);
        return found;
      }
    } catch (e) {
      // Offline fallback
    }

    return null;
  },

  async saveSchedule(schedule: FertilizationSchedule): Promise<FertilizationSchedule> {
    const updated: FertilizationSchedule = {
      ...schedule,
      updatedAt: new Date().toISOString(),
    };

    localStore.saveItem('fertilizationSchedules', updated);

    try {
      const docRef = doc(db, 'fertilizationSchedules', schedule.id);
      const cleaned = cleanFirestoreData(updated);
      setDoc(docRef, cleaned, { merge: true }).catch((err) => {
        console.warn('Firestore saveSchedule pending or unavailable:', err?.message || err);
      });
    } catch (err) {
      console.warn('Serialization error on fertilization schedule:', err);
    }

    return updated;
  },

  async deleteSchedule(id: string, userId?: string): Promise<void> {
    const targetUserId = userId || (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'default_user' : 'default_user');
    localStore.deleteItem('fertilizationSchedules', id, targetUserId);

    try {
      const docRef = doc(db, 'fertilizationSchedules', id);
      deleteDoc(docRef).catch((err) => {
        console.warn('Firestore deleteSchedule error:', err?.message || err);
      });
    } catch (err) {
      console.warn('deleteDoc error on fertilization schedule:', err);
    }
  },

  createEmptySchedule(cultivationId: string, userId: string, name = 'Tabla Personalizada'): FertilizationSchedule {
    const now = new Date().toISOString();
    return {
      id: `sched_${cultivationId}`,
      userId,
      cultivationId,
      name,
      brand: 'Personalizada',
      substrateType: 'Tierra / Sustrato',
      weeks: [
        {
          weekNumber: 1,
          stage: 'Vegetativo',
          title: 'Semana 1 · Inicio',
          targetPh: 6.2,
          targetEc: 1.0,
          products: [],
          observations: 'Primeros riegos con fertilizante.',
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
  },
};
