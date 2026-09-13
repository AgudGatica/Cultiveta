import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Cultivation, Genetics, Watering, EnvironmentRecord, PhotoRecord, DiaryEntry, Harvest, AIPhotoAnalysis, FertilizationSchedule, WateringProductItem } from '../types';
import { localStore } from './localStore';
import { fertilizationService } from './fertilizationService';

function saveDemoItem(collectionName: string, item: any) {
  localStore.saveItem(collectionName, item);
  try {
    const docRef = doc(db, collectionName, item.id);
    setDoc(docRef, item).catch(() => {});
  } catch (e) {}
}

export const demoDataService = {
  async hasDemoData(userId: string): Promise<boolean> {
    const local = localStore.getItems<Cultivation>('cultivations', userId);
    if (local.some((d) => d.isDemo === true)) return true;
    try {
      const q = query(
        collection(db, 'cultivations'),
        where('userId', '==', userId)
      );
      const snap = await getDocs(q);
      return snap.docs.some((d) => d.data().isDemo === true);
    } catch (e) {
      return false;
    }
  },

  async seedDemoData(userId: string): Promise<void> {
    const today = new Date();
    const formatDate = (daysAgo: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString().split('T')[0];
    };

    // 1. Seed Genetics
    const genetics1Id = `demo_gen_1_${userId}`;
    const genetics2Id = `demo_gen_2_${userId}`;
    const genetics3Id = `demo_gen_3_${userId}`;

    const gen1: Genetics = {
      id: genetics1Id,
      userId,
      name: 'Purple Punch',
      seedBank: 'Barney’s Farm',
      breeder: 'Barney’s',
      photoperiodType: 'Fotoperiódica',
      declaredFloweringDays: 55,
      sativaIndicaRatio: '80% Indica / 20% Sativa',
      expectedAroma: 'Frutos del bosque dulces, uva, tarta de arándanos',
      expectedFlavor: 'Frutal dulce, terroso suave',
      expectedEffect: 'Relajante corporal profundo, sedante nocturno',
      morphologyNotes: 'Estructura robusta, entrenudos cortos, tonos púrpuras en floración avanzada',
      isDemo: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const gen2: Genetics = {
      id: genetics2Id,
      userId,
      name: 'Amnesia Haze Auto',
      seedBank: 'Royal Queen Seeds',
      breeder: 'RQS',
      photoperiodType: 'Automática',
      declaredFloweringDays: 70,
      sativaIndicaRatio: '50% Sativa / 20% Indica / 30% Ruderalis',
      expectedAroma: 'Cítrico intenso, limón, especiado',
      expectedFlavor: 'Limón terroso, toque inciensado',
      expectedEffect: 'Cerebral energizante, creativo',
      morphologyNotes: 'Crecimiento vigoroso, espigado medio con buena ramificación lateral',
      isDemo: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const gen3: Genetics = {
      id: genetics3Id,
      userId,
      name: 'Gorilla Cookies',
      seedBank: 'FastBuds',
      photoperiodType: 'Fotoperiódica',
      declaredFloweringDays: 63,
      sativaIndicaRatio: '55% Sativa / 45% Indica',
      expectedAroma: 'Galleta dulce, combustible, pino',
      expectedFlavor: 'Menta terrosa, galleta horneada',
      expectedEffect: 'Equilibrado eufórico y relajante',
      isDemo: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const genetics4Id = `demo_gen_4_${userId}`;
    const gen4: Genetics = {
      id: genetics4Id,
      userId,
      name: 'Gelato 33',
      seedBank: 'Advanced Seeds',
      photoperiodType: 'Fotoperiódica',
      declaredFloweringDays: 60,
      sativaIndicaRatio: '55% Indica / 45% Sativa',
      expectedAroma: 'Cítrico cremoso, sorbete dulce, notas terrosas',
      expectedFlavor: 'Frutal dulce, crema suave',
      expectedEffect: 'Relajación física lúcida, bienestar elevado',
      isDemo: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveDemoItem('genetics', gen1);
    saveDemoItem('genetics', gen2);
    saveDemoItem('genetics', gen3);
    saveDemoItem('genetics', gen4);

    // 2. Active Cultivation 1: Purple Punch #02 (Floración Día 24)
    const cult1Id = `demo_cult_1_${userId}`;
    const cult1: Cultivation = {
      id: cult1Id,
      userId,
      name: 'Purple Punch #02',
      startDate: formatDate(54),
      type: 'Indoor',
      plantCount: 4,
      geneticsId: genetics1Id,
      geneticsName: 'Purple Punch',
      seedBank: 'Barney’s Farm',
      photoperiodType: 'Fotoperiódica',
      declaredFloweringWeeks: 8,
      currentStage: 'Floración',
      stageStartDate: formatDate(24),
      floweringStartDate: formatDate(24),
      substrate: {
        type: 'Sustrato aireado 70/30 Turba y Perlita',
        brand: 'Klasmann / Growmix',
        potVolumeLiters: 15,
        potType: 'Geotextil',
      },
      lighting: {
        type: 'Quantum Board LED Samsung LM301H',
        brand: 'Spider Farmer',
        model: 'SF-2000',
        nominalWatts: 240,
        usedWatts: 240,
        photoperiodHoursLight: 12,
        photoperiodHoursDark: 12,
        distanceCm: 45,
      },
      coverPhotoUrl: 'https://images.unsplash.com/photo-1536964549204-cce9eab227bd?auto=format&fit=crop&w=600&q=80',
      status: 'ESTABLE',
      statusNotes: 'Desarrollo vigoroso de cálices y primeros pistilos anaranjados.',
      notes: 'Carpa 80x80x160. Extracción continua con filtro de carbón activado.',
      isFinished: false,
      isDemo: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveDemoItem('cultivations', cult1);

    // Waterings for cult 1
    const wateringsCult1: Array<{
      date: string;
      volumeLiters: number;
      phIn: number;
      ecIn: number;
      phRunoff?: number;
      ecRunoff?: number;
      fertilizationWeekNumber?: number;
      productsUsed?: WateringProductItem[];
      observations?: string;
    }> = [
      {
        date: formatDate(1),
        volumeLiters: 6,
        phIn: 6.3,
        ecIn: 1.8,
        phRunoff: 6.4,
        ecRunoff: 1.9,
        fertilizationWeekNumber: 4,
        productsUsed: [
          { name: 'Bio Bloom', brand: 'Biobizz', dosageMlPerL: 3.0, totalAmountMl: 18.0, category: 'floracion' },
          { name: 'Bio Grow', brand: 'Biobizz', dosageMlPerL: 1.0, totalAmountMl: 6.0, category: 'crecimiento' },
          { name: 'Top Max', brand: 'Biobizz', dosageMlPerL: 1.0, totalAmountMl: 6.0, category: 'estimulante' },
          { name: 'Bio Heaven', brand: 'Biobizz', dosageMlPerL: 2.0, totalAmountMl: 12.0, category: 'estimulante' },
        ],
        observations: 'Riego con base floración + bioestimulante.',
      },
      {
        date: formatDate(4),
        volumeLiters: 6,
        phIn: 6.2,
        ecIn: 0.4,
        fertilizationWeekNumber: 4,
        productsUsed: [],
        observations: 'Riego suave solo agua desclorada con micorrizas.',
      },
      {
        date: formatDate(7),
        volumeLiters: 6,
        phIn: 6.3,
        ecIn: 1.7,
        fertilizationWeekNumber: 3,
        productsUsed: [
          { name: 'Bio Bloom', brand: 'Biobizz', dosageMlPerL: 2.0, totalAmountMl: 12.0, category: 'floracion' },
          { name: 'Bio Grow', brand: 'Biobizz', dosageMlPerL: 1.0, totalAmountMl: 6.0, category: 'crecimiento' },
          { name: 'Top Max', brand: 'Biobizz', dosageMlPerL: 1.0, totalAmountMl: 6.0, category: 'estimulante' },
        ],
        observations: 'Nutrición con PK leve.',
      },
      {
        date: formatDate(11),
        volumeLiters: 5.5,
        phIn: 6.1,
        ecIn: 1.5,
        fertilizationWeekNumber: 3,
        productsUsed: [
          { name: 'Bio Bloom', brand: 'Biobizz', dosageMlPerL: 2.0, totalAmountMl: 11.0, category: 'floracion' },
          { name: 'Bio Grow', brand: 'Biobizz', dosageMlPerL: 1.0, totalAmountMl: 5.5, category: 'crecimiento' },
        ],
        observations: 'Buen drenaje del 15%.',
      },
      {
        date: formatDate(15),
        volumeLiters: 5,
        phIn: 6.2,
        ecIn: 1.4,
        fertilizationWeekNumber: 2,
        productsUsed: [
          { name: 'Bio Grow', brand: 'Biobizz', dosageMlPerL: 2.0, totalAmountMl: 10.0, category: 'crecimiento' },
          { name: 'Bio Heaven', brand: 'Biobizz', dosageMlPerL: 2.0, totalAmountMl: 10.0, category: 'estimulante' },
        ],
        observations: 'Riego transición vegetativo-flora.',
      },
    ];

    for (let i = 0; i < wateringsCult1.length; i++) {
      const wId = `demo_w_1_${i}_${userId}`;
      const wData: Watering = {
        id: wId,
        userId,
        cultivationId: cult1Id,
        ...wateringsCult1[i],
        isDemo: true,
        createdAt: new Date().toISOString(),
      };
      saveDemoItem('waterings', wData);
    }

    // Demo fertilization schedule for cult 1
    const schedCult1 = fertilizationService.getPresetSchedule('biobizz_organic', cult1Id, userId);
    schedCult1.isDemo = true;
    saveDemoItem('fertilization_schedules', schedCult1);

    // Environment records for cult 1 (last 10 days)
    for (let i = 10; i >= 0; i--) {
      const envId = `demo_env_1_${i}_${userId}`;
      const temp = 23.5 + Math.sin(i) * 1.8;
      const hum = 52 + Math.cos(i) * 4;
      const envData: EnvironmentRecord = {
        id: envId,
        userId,
        cultivationId: cult1Id,
        date: formatDate(i),
        temperatureC: Number(temp.toFixed(1)),
        humidityPct: Math.round(hum),
        leafTempC: Number((temp - 1.8).toFixed(1)),
        ppfd: 720,
        vpdKPa: Number((1.15 + Math.sin(i) * 0.1).toFixed(2)),
        isDemo: true,
        createdAt: new Date().toISOString(),
      };
      saveDemoItem('environmentRecords', envData);
    }

    // Photos for cult 1
    const photosCult1 = [
      {
        url: 'https://images.unsplash.com/photo-1536964549204-cce9eab227bd?auto=format&fit=crop&w=800&q=80',
        dayOfCultivation: 53,
        stage: 'Floración',
        category: 'flor' as const,
        caption: 'Formación de cogollos principales y tricomas lechosos comenzando.',
        date: formatDate(1),
      },
      {
        url: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=800&q=80',
        dayOfCultivation: 38,
        stage: 'Floración',
        category: 'hoja superior' as const,
        caption: 'Desarrollo de resina y coloración en hojas superiores.',
        date: formatDate(16),
      },
      {
        url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=800&q=80',
        dayOfCultivation: 25,
        stage: 'Vegetativo',
        category: 'planta completa' as const,
        caption: 'Último día de vegetativo antes de pasar a 12/12.',
        date: formatDate(29),
      }
    ];

    for (let i = 0; i < photosCult1.length; i++) {
      const pId = `demo_p_1_${i}_${userId}`;
      const pData: PhotoRecord = {
        id: pId,
        userId,
        cultivationId: cult1Id,
        ...photosCult1[i],
        isDemo: true,
        createdAt: new Date().toISOString(),
      };
      saveDemoItem('photos', pData);
    }

    // Diary notes for cult 1
    const notesCult1 = [
      {
        title: 'Defoliación de bajos y poda lollipop',
        content: 'Realicé limpieza de ramas bajas que no reciben luz directa para favorecer la ventilación y enfocar la energía en las puntas principales.',
        date: formatDate(8),
      },
      {
        title: 'Cambio de fotoperiodo a 12/12',
        content: 'Pasamos el temporizador a 12 horas de luz y 12 de oscuridad. La altura promedio de las 4 copas es de 42 cm.',
        date: formatDate(24),
      },
    ];

    for (let i = 0; i < notesCult1.length; i++) {
      const nId = `demo_note_1_${i}_${userId}`;
      const nData: DiaryEntry = {
        id: nId,
        userId,
        cultivationId: cult1Id,
        ...notesCult1[i],
        isDemo: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveDemoItem('diaryEntries', nData);
    }

    // 2b. Active Cultivation 2: Amnesia Haze Auto #01 (Vegetativo Día 18 - Riego Pendiente: Hace 4 días)
    const cult2Id = `demo_cult_2_${userId}`;
    const cult2: Cultivation = {
      id: cult2Id,
      userId,
      name: 'Amnesia Haze Auto #01',
      startDate: formatDate(18),
      type: 'Indoor',
      plantCount: 2,
      geneticsId: genetics2Id,
      geneticsName: 'Amnesia Haze Auto',
      seedBank: 'Royal Queen Seeds',
      photoperiodType: 'Automática',
      declaredFloweringWeeks: 10,
      currentStage: 'Vegetativo',
      stageStartDate: formatDate(18),
      substrate: {
        type: 'Sustrato Light Mix',
        brand: 'Biobizz',
        potVolumeLiters: 11,
        potType: 'Geotextil',
      },
      lighting: {
        type: 'LED Full Spectrum',
        nominalWatts: 150,
        usedWatts: 120,
        photoperiodHoursLight: 18,
        photoperiodHoursDark: 6,
        distanceCm: 50,
      },
      coverPhotoUrl: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=600&q=80',
      status: 'REVISAR',
      statusNotes: 'Requiere riego: han pasado más de 3 días desde la última aplicación de solución nutritiva.',
      notes: 'Carpa secundaria 60x60. Riego pendiente de agua con estimulador radicular.',
      isFinished: false,
      isDemo: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveDemoItem('cultivations', cult2);

    // Watering for cult 2: last watered 4 days ago
    const wateringsCult2 = [
      { date: formatDate(4), volumeLiters: 2.5, phIn: 6.2, ecIn: 1.2, observations: 'Riego con estimulador de raíces.' },
      { date: formatDate(8), volumeLiters: 2, phIn: 6.1, ecIn: 1.0, observations: 'Primer riego ligero en maceta definitiva.' },
    ];
    for (let i = 0; i < wateringsCult2.length; i++) {
      const wId = `demo_w_2_${i}_${userId}`;
      const wData: Watering = {
        id: wId,
        userId,
        cultivationId: cult2Id,
        ...wateringsCult2[i],
        isDemo: true,
        createdAt: new Date().toISOString(),
      };
      saveDemoItem('waterings', wData);
    }

    // 3. Finished Cultivation: Gorilla Cookies #01
    const cult3Id = `demo_cult_3_${userId}`;
    const harvest3Id = `demo_harv_3_${userId}`;

    const harvest3: Harvest = {
      id: harvest3Id,
      userId,
      cultivationId: cult3Id,
      cultivationName: 'Gorilla Cookies #01',
      geneticsName: 'Gorilla Cookies',
      seedBank: 'FastBuds',
      startDate: formatDate(120),
      harvestDate: formatDate(35),
      totalDays: 85,
      floweringDays: 61,
      plantCount: 3,
      wetWeightGrams: 780,
      finalDryWeightGrams: 168.5,
      gramsPerPlant: 56.2,
      rating1To5: 5,
      aromaReview: 'Galleta recién horneada con notas terrosas y un toque dulce de combustible.',
      flavorReview: 'Intenso, sabor denso a menta y galleta.',
      structureDensityReview: 'Cogollos densos como rocas, excelente cobertura de resina blanca.',
      curingNotes: '4 semanas en frascos herméticos con boveda 62% a 19°C.',
      finalNotes: 'Excelente cultivo. Muy tolerante a niveles de EC altos en floración avanzada.',
      isDemo: true,
      createdAt: new Date().toISOString(),
    };

    const cult3: Cultivation = {
      id: cult3Id,
      userId,
      name: 'Gorilla Cookies #01',
      startDate: formatDate(120),
      type: 'Indoor',
      plantCount: 3,
      geneticsId: genetics3Id,
      geneticsName: 'Gorilla Cookies',
      seedBank: 'FastBuds',
      photoperiodType: 'Fotoperiódica',
      declaredFloweringWeeks: 9,
      currentStage: 'Finalizado',
      stageStartDate: formatDate(35),
      floweringStartDate: formatDate(96),
      substrate: {
        type: 'Coco 70% / Perlita 30%',
        potVolumeLiters: 11,
        potType: 'Plástico',
      },
      lighting: {
        type: 'LED Bar 240W',
        nominalWatts: 240,
        photoperiodHoursLight: 12,
        photoperiodHoursDark: 12,
      },
      coverPhotoUrl: 'https://images.unsplash.com/photo-1568644396922-5c3bfae12521?auto=format&fit=crop&w=600&q=80',
      status: 'ESTABLE',
      isFinished: true,
      harvestId: harvest3Id,
      isDemo: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveDemoItem('cultivations', cult3);
    saveDemoItem('harvests', harvest3);

    // Historical environmental records for Cultivation 3 (Gorilla Cookies: days 1 to 85)
    // Recorded every 3-4 days to model full cycle curve
    for (let day = 1; day <= 85; day += 3) {
      const daysAgo = 120 - day;
      const isFlower = day > 24;
      // Temp: vegetativo ~25°C, floracion baja a ~22.5°C
      const baseTemp = isFlower ? 22.8 - ((day - 24) / 61) * 1.5 : 25.0;
      const temp = baseTemp + Math.sin(day * 0.4) * 0.8;
      // Humedad: vegetativo ~65%, floracion baja a ~45%
      const baseHum = isFlower ? 58 - ((day - 24) / 61) * 15 : 68;
      const hum = baseHum + Math.cos(day * 0.3) * 3;
      const vpd = Number((0.9 + (day / 85) * 0.45 + Math.sin(day * 0.2) * 0.05).toFixed(2));

      const envId = `demo_env_3_${day}_${userId}`;
      const envData: EnvironmentRecord = {
        id: envId,
        userId,
        cultivationId: cult3Id,
        date: formatDate(daysAgo),
        temperatureC: Number(temp.toFixed(1)),
        humidityPct: Math.round(hum),
        leafTempC: Number((temp - 1.5).toFixed(1)),
        ppfd: isFlower ? 850 : 500,
        vpdKPa: vpd,
        isDemo: true,
        createdAt: new Date().toISOString(),
      };
      saveDemoItem('environmentRecords', envData);
    }

    // 4. Finished Cultivation 2: Gelato 33 #01 (for direct head-to-head comparison)
    const cult4Id = `demo_cult_4_${userId}`;
    const harvest4Id = `demo_harv_4_${userId}`;

    const harvest4: Harvest = {
      id: harvest4Id,
      userId,
      cultivationId: cult4Id,
      cultivationName: 'Gelato 33 #01',
      geneticsName: 'Gelato 33',
      seedBank: 'Advanced Seeds',
      startDate: formatDate(98),
      harvestDate: formatDate(20),
      totalDays: 78,
      floweringDays: 56,
      plantCount: 4,
      wetWeightGrams: 890,
      finalDryWeightGrams: 194.0,
      gramsPerPlant: 48.5,
      rating1To5: 5,
      aromaReview: 'Sorbete cítrico con fondo de combustible dulce y crema.',
      flavorReview: 'Cremoso, notas terrosas suaves con regusto cítrico dulce.',
      structureDensityReview: 'Cálices hinchados, resina ultra cristalina y tonos violáceos.',
      curingNotes: '3 semanas curando con sobres de humedad 62% a 18°C.',
      finalNotes: 'Excelente tolerancia al estrés lumínico. Floración rápida y cogollos uniformes.',
      isDemo: true,
      createdAt: new Date().toISOString(),
    };

    const cult4: Cultivation = {
      id: cult4Id,
      userId,
      name: 'Gelato 33 #01',
      startDate: formatDate(98),
      type: 'Indoor',
      plantCount: 4,
      geneticsId: genetics4Id,
      geneticsName: 'Gelato 33',
      seedBank: 'Advanced Seeds',
      photoperiodType: 'Fotoperiódica',
      declaredFloweringWeeks: 8,
      currentStage: 'Finalizado',
      stageStartDate: formatDate(20),
      floweringStartDate: formatDate(76),
      substrate: {
        type: 'Turba 60% / Humus 20% / Perlita 20%',
        potVolumeLiters: 11,
        potType: 'Geotextil',
      },
      lighting: {
        type: 'Quantum Board LED 240W',
        nominalWatts: 240,
        usedWatts: 240,
        photoperiodHoursLight: 12,
        photoperiodHoursDark: 12,
      },
      coverPhotoUrl: 'https://images.unsplash.com/photo-1536964549204-cce9eab227bd?auto=format&fit=crop&w=600&q=80',
      status: 'ESTABLE',
      isFinished: true,
      harvestId: harvest4Id,
      isDemo: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveDemoItem('cultivations', cult4);
    saveDemoItem('harvests', harvest4);

    // Historical environmental records for Cultivation 4 (Gelato 33: days 1 to 78)
    // Warmer and slightly drier profile for realistic agronomic contrast
    for (let day = 1; day <= 78; day += 3) {
      const daysAgo = 98 - day;
      const isFlower = day > 22;
      const baseTemp = isFlower ? 24.2 - ((day - 22) / 56) * 1.8 : 26.2;
      const temp = baseTemp + Math.sin(day * 0.5) * 0.9;
      const baseHum = isFlower ? 52 - ((day - 22) / 56) * 12 : 62;
      const hum = baseHum + Math.cos(day * 0.4) * 3.5;
      const vpd = Number((1.05 + (day / 78) * 0.4 + Math.sin(day * 0.3) * 0.06).toFixed(2));

      const envId = `demo_env_4_${day}_${userId}`;
      const envData: EnvironmentRecord = {
        id: envId,
        userId,
        cultivationId: cult4Id,
        date: formatDate(daysAgo),
        temperatureC: Number(temp.toFixed(1)),
        humidityPct: Math.round(hum),
        leafTempC: Number((temp - 1.8).toFixed(1)),
        ppfd: isFlower ? 900 : 550,
        vpdKPa: vpd,
        isDemo: true,
        createdAt: new Date().toISOString(),
      };
      saveDemoItem('environmentRecords', envData);
    }
  },

  async deleteDemoData(userId: string): Promise<void> {
    const collectionsToClean = [
      'cultivations',
      'genetics',
      'waterings',
      'environmentRecords',
      'photos',
      'diaryEntries',
      'harvests',
      'fertilization_schedules',
    ];

    for (const colName of collectionsToClean) {
      const localItems = localStore.getItems<any>(colName, userId);
      const remaining = localItems.filter((i) => !i.isDemo);
      localStore.saveAll(colName, userId, remaining);

      try {
        const q = query(
          collection(db, colName),
          where('userId', '==', userId)
        );
        const snap = await getDocs(q);
        const demoDocs = snap.docs.filter((d) => d.data().isDemo === true);
        if (demoDocs.length > 0) {
          const batch = writeBatch(db);
          demoDocs.forEach((d) => batch.delete(d.ref));
          await batch.commit().catch(() => {});
        }
      } catch (e) {}
    }
  },

  async clearDemoData(userId: string): Promise<void> {
    return this.deleteDemoData(userId);
  }
};
