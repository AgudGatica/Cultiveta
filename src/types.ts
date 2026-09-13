export type CultivationType = 'Indoor' | 'Outdoor' | 'Invernadero';
export type PhotoperiodType = 'Fotoperiódica' | 'Automática' | 'CBD' | 'Regular';
export type PotType = 'Geotextil' | 'Plástico' | 'Airpot' | 'Tierra madre' | 'Hidropónico' | 'Otro';

export type CultivationStageName =
  | 'Germinación'
  | 'Plántula'
  | 'Vegetativo'
  | 'Prefloración'
  | 'Floración'
  | 'Maduración'
  | 'Cosecha'
  | 'Secado'
  | 'Curado'
  | 'Finalizado'
  | string;

export type HealthStatus = 'ESTABLE' | 'REVISAR' | 'ATENCION';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  createdAt: string;
  preferences?: {
    advancedMode?: boolean;
    tempUnit?: 'C' | 'F';
    volumeUnit?: 'L' | 'gal';
    notificationsEnabled?: boolean;
  };
}

export interface CultivationGeneticsItem {
  id: string;
  geneticsId?: string;
  name: string;
  seedBank?: string;
  photoperiodType?: PhotoperiodType;
  declaredFloweringWeeks?: number;
  plantCount?: number;
  notes?: string;
}

export interface CultivationGrowthStage {
  id: string;
  name: CultivationStageName;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  expectedDurationDays: number;
  actualDurationDays?: number;
  photoperiodHoursLight?: number;
  targetTempMinC?: number;
  targetTempMaxC?: number;
  targetHumidityMinPct?: number;
  targetHumidityMaxPct?: number;
  notes?: string;
  isCompleted?: boolean;
}

export interface Cultivation {
  id: string;
  userId: string;
  name: string;
  startDate: string;
  type: CultivationType;
  plantCount: number;
  geneticsId?: string;
  geneticsName?: string;
  seedBank?: string;
  photoperiodType?: PhotoperiodType;
  declaredFloweringWeeks?: number;
  geneticsList?: CultivationGeneticsItem[];
  currentStage: CultivationStageName;
  stageStartDate: string;
  floweringStartDate?: string;
  stagesTimeline?: CultivationGrowthStage[];
  substrate: {
    type: string;
    brand?: string;
    potVolumeLiters: number;
    potType: PotType;
  };
  lighting?: {
    type: string; // LED, HPS, LEC, Sol, etc.
    brand?: string;
    model?: string;
    nominalWatts?: number;
    usedWatts?: number;
    photoperiodHoursLight?: number;
    photoperiodHoursDark?: number;
    distanceCm?: number;
  };
  coverPhotoUrl?: string;
  status: HealthStatus;
  statusNotes?: string;
  notes?: string;
  isFinished?: boolean;
  harvestId?: string;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DominanceType = 'Índica' | 'Sativa' | 'Híbrida' | 'Ruderalis';

export interface AIChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  summaryModeActive?: boolean;
  condensedPoints?: string[];
}

export interface AIPhotoAnalysisResult {
  diagnosis: string;
  severity: 'Baja' | 'Media' | 'Alta';
  affectedOrgan: string;
  visualFindings: string;
  actionPlan: string[];
  confidence: 'Baja' | 'Media' | 'Alta';
}

export interface Genetics {
  id: string;
  userId: string;
  name: string;
  seedBank: string;
  breeder?: string;
  photoperiodType: PhotoperiodType;
  dominance?: DominanceType;
  declaredFloweringDays?: number;
  sativaIndicaRatio?: string; // e.g. "70% Sativa / 30% Indica"
  thcPercentage?: number;
  cbdPercentage?: number;
  terpenes?: string[];
  expectedAroma?: string;
  expectedFlavor?: string;
  expectedEffect?: string;
  morphologyNotes?: string;
  notes?: string;
  photoUrl?: string;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FavoriteGenetic {
  id: string;
  userId: string;
  geneticsKey: string;
  name: string;
  seedBank: string;
  geneticsId?: string;
  photoperiodType?: PhotoperiodType | string;
  dominance?: DominanceType | string;
  floweringDays?: string | number;
  estimatedYield?: number;
  organolepticProfile?: string;
  createdAt: string;
}

export interface WateringProductItem {
  name: string;
  dosageMlPerL?: number;
  brand?: string;
  category?: 'raices' | 'crecimiento' | 'floracion' | 'estimulante' | 'pk_booster' | 'calmag' | 'enzimas' | 'otro';
  totalAmountMl?: number;
}

export interface Watering {
  id: string;
  userId: string;
  cultivationId: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  volumeLiters: number;
  phIn?: number;
  ecIn?: number; // mS/cm or uS/cm
  phRunoff?: number;
  ecRunoff?: number;
  waterTempC?: number;
  productsUsed?: WateringProductItem[];
  fertilizationWeekNumber?: number;
  observations?: string;
  isDemo?: boolean;
  createdAt: string;
}

export interface FertilizationProductDosage {
  id: string;
  name: string;
  brand?: string;
  dosageMlPerL: number;
  category?: 'raices' | 'crecimiento' | 'floracion' | 'estimulante' | 'pk_booster' | 'calmag' | 'enzimas' | 'otro';
  notes?: string;
}

export interface FertilizationWeek {
  weekNumber: number; // e.g. 1, 2, 3, 4...
  stage: 'Plántula' | 'Vegetativo' | 'Prefloración' | 'Floración' | 'Maduración' | 'Lavado';
  title: string; // e.g. "Semana 1 - Enraizamiento", "Semana 4 - Inicio Flora"
  targetPh?: number;
  targetEc?: number;
  products: FertilizationProductDosage[];
  observations?: string;
}

export interface FertilizationSchedule {
  id: string;
  userId: string;
  cultivationId: string;
  name: string; // e.g. "Tabla Biobizz Orgánica", "Tabla Personalizada"
  brand?: string; // "Biobizz", "Top Crop", "Advanced Nutrients", "General Hydroponics", "Plagron", "Personalizada"
  substrateType?: string; // "Tierra / Sustrato", "Coco", "Hidroponía"
  presetId?: string;
  weeks: FertilizationWeek[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface EnvironmentRecord {
  id: string;
  userId: string;
  cultivationId: string;
  date: string;
  time?: string;
  temperatureC: number;
  humidityPct: number;
  leafTempC?: number;
  ppfd?: number; // umol/m2/s
  vpdKPa?: number;
  co2Ppm?: number;
  notes?: string;
  isDemo?: boolean;
  createdAt: string;
}

export type PhotoCategory =
  | 'planta completa'
  | 'flor'
  | 'hoja superior'
  | 'hoja inferior'
  | 'tallo'
  | 'sustrato'
  | 'zona problemática'
  | 'tricomas'
  | 'otra';

export interface PhotoRecord {
  id: string;
  userId: string;
  cultivationId: string;
  url: string;
  thumbnailUrl?: string;
  date: string;
  dayOfCultivation: number;
  stage: CultivationStageName;
  category: PhotoCategory;
  caption?: string;
  isDemo?: boolean;
  aiAnalysisId?: string;
  createdAt: string;
}

export interface DiaryEntry {
  id: string;
  userId: string;
  cultivationId: string;
  date: string;
  title?: string;
  content: string;
  tags?: string[];
  photoUrls?: string[];
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Harvest {
  id: string;
  userId: string;
  cultivationId: string;
  cultivationName: string;
  geneticsName?: string;
  seedBank?: string;
  startDate: string;
  harvestDate: string;
  totalDays: number;
  floweringDays?: number;
  plantCount: number;
  wetWeightGrams?: number;
  finalDryWeightGrams: number; // strictly recorded in grams
  gramsPerPlant: number;
  rating1To5: number;
  aromaReview?: string;
  flavorReview?: string;
  structureDensityReview?: string;
  curingNotes?: string;
  finalNotes?: string;
  photoUrls?: string[];
  isDemo?: boolean;
  createdAt: string;
}

export interface AIPhotoAnalysis {
  id: string;
  userId: string;
  cultivationId: string;
  photoUrl: string;
  photoCategory?: PhotoCategory;
  date: string;
  userComments?: string;
  observed: string; // "Lo que se observa"
  possibleCauses: string[]; // "Posibles causas"
  relatedCultivationData: string[]; // "Datos del cultivo relacionados"
  missingInformation: string[]; // "Qué información falta"
  confidence: 'Baja' | 'Media' | 'Alta'; // "Confianza del análisis"
  contextUsed?: {
    stage?: string;
    day?: number;
    recentPh?: number;
    recentEc?: number;
    recentTemp?: number;
    recentHumidity?: number;
    genetics?: string;
  };
  isDemo?: boolean;
  createdAt: string;
}

export interface AIConversationMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  evidence?: {
    recordsReferenced?: string[];
    metricsReferenced?: string[];
    datesReferenced?: string[];
  };
}

export interface TimelineEvent {
  id: string;
  type: 'watering' | 'environment' | 'photo' | 'stage' | 'diary' | 'harvest' | 'ai_analysis' | 'lighting' | 'transplant';
  date: string;
  title: string;
  description: string;
  details?: Record<string, any>;
  icon: string;
  color: string;
  relatedId?: string;
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  category: 'Nutrición' | 'pH y EC' | 'Ambiente' | 'Plagas y Carencias' | 'Riego' | 'Luz' | 'Genéticas';
  summary: string;
  content: string;
  tags: string[];
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
  htmlLink?: string;
  colorId?: string;
  extendedProperties?: {
    private?: {
      cultivationId?: string;
      cropEventCategory?: string;
    };
  };
}

export interface CultivationCalendarPlan {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  endDate?: string;
  type: 'watering' | 'stage_change' | 'harvest' | 'defoliation' | 'flush' | 'custom';
  description: string;
  isSynced?: boolean;
  googleEventId?: string;
  htmlLink?: string;
}

export type TaskUrgency = 'overdue' | 'today' | 'tomorrow' | 'upcoming';
export type TaskPriority = 'critical' | 'high' | 'medium';
export type CultivationTaskType = 'watering' | 'flush' | 'defoliation' | 'stage_change' | 'harvest' | 'env_alert' | 'custom';

export interface CultivationTask {
  id: string;
  cultivationId: string;
  cultivationName: string;
  geneticsName?: string;
  stage?: string;
  type: CultivationTaskType;
  title: string;
  description: string;
  dueDate: string; // YYYY-MM-DD
  urgency: TaskUrgency;
  priority: TaskPriority;
  isCompleted: boolean;
  completedAt?: string;
  categoryLabel: string;
  actionHint?: string;
}

