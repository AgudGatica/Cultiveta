import React, { useState, useEffect } from 'react';
import {
  X,
  Sprout,
  Calendar,
  Sun,
  Layers,
  Lightbulb,
  Camera,
  Save,
  Plus,
  Trash2,
  AlertTriangle,
  Thermometer,
  Droplets,
  BellRing,
  ShieldAlert,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import {
  Cultivation,
  CultivationType,
  PhotoperiodType,
  PotType,
  Genetics,
  CultivationGeneticsItem,
  EnvironmentalAlertThresholds,
  Indoor,
  GrowMethod,
} from '../../types';
import { GROW_METHODS, growMethodFromText } from '../../utils/growMethod';
import { cultivationService } from '../../services/cultivationService';
import { ambientsForCrop, cropTypeForAmbient, isExteriorAmbient } from '../../utils/indoors';
import { PhotoperiodPresetPicker } from './PhotoperiodPresetPicker';
import { clampLightHours, darkHoursFor } from '../../utils/photoperiods';
import { photoService } from '../../services/photoService';
import { PhotoPrepError, preparePhoto } from '../../services/imagePrep';
import { auth } from '../../firebase/config';
import { GENETICS_DATABASE } from '../../data/predefinedGenetics';
import {
  getLocalTodayDateOnly,
  isFloweringStage,
  buildUpdatedStagesTimeline,
} from '../../utils/growthStageUtils';

const parseFloweringWeeks = (daysStr: string) => {
  const match = daysStr.match(/(\d+)/g);
  if (!match) return 8;
  const avg = match.map(Number).reduce((a, b) => a + b, 0) / match.length;
  return Math.round(avg / 7);
};

const parsePhotoperiod = (name: string, dom: string): PhotoperiodType => {
  const c = (name + dom).toLowerCase();
  if (c.includes('auto') || c.includes('ruderalis')) return 'Automática';
  if (c.includes('cbd')) return 'CBD';
  return 'Fotoperiódica';
};

const PREDEFINED_BY_BANK = GENETICS_DATABASE.reduce(
  (acc, item) => {
    if (!acc[item.seedBank]) {
      acc[item.seedBank] = [];
    }
    acc[item.seedBank].push(item);
    return acc;
  },
  {} as Record<string, typeof GENETICS_DATABASE>
);

export interface FormGeneticsEntry {
  id: string;
  geneticsId?: string;
  name: string;
  seedBank: string;
  photoperiodType: PhotoperiodType;
  declaredFloweringWeeks: number;
  plantCount: number;
}

interface CultivationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  cultivationToEdit?: Cultivation | null;
  initialGenetics?: Genetics | null;
  geneticsList: Genetics[];
  onSaved: (cultivation: Cultivation) => void;
  /** Ambientes de la persona (en uno interior, la luz del cultivo es la del ambiente). */
  indoors?: Indoor[];
  /** Ambiente elegido de entrada (al sumar plantas desde un ambiente): fija también interior o exterior. */
  initialIndoorId?: string | null;
}

export const CultivationFormModal: React.FC<CultivationFormModalProps> = ({
  isOpen,
  onClose,
  userId = '',
  cultivationToEdit,
  initialGenetics,
  geneticsList = [],
  onSaved,
  indoors = [],
  initialIndoorId = null,
}) => {
  const [name, setName] = useState('');
  const [indoorId, setIndoorId] = useState('');
  const [startDate, setStartDate] = useState(getLocalTodayDateOnly());
  const [type, setType] = useState<CultivationType>('Indoor');
  const [plantCount, setPlantCount] = useState(1);
  const [geneticsEntries, setGeneticsEntries] = useState<FormGeneticsEntry[]>([]);
  const [currentStage, setCurrentStage] = useState('Vegetativo');
  const [substrateType, setSubstrateType] = useState('Turba / Perlita / Humus');
  // null: se deduce del texto del sustrato (los cultivos de antes no lo tienen elegido)
  const [growMethod, setGrowMethod] = useState<GrowMethod | null>(null);
  const shownMethod = growMethod ?? growMethodFromText(substrateType);
  const [potVolumeLiters, setPotVolumeLiters] = useState(11);
  const [potType, setPotType] = useState<PotType>('Geotextil');
  const [lightingType, setLightingType] = useState('LED Quantum Board');
  const [lightingWatts, setLightingWatts] = useState<number | ''>(240);
  const [lightHours, setLightHours] = useState<number | ''>(18);
  const [locationCoordinates, setLocationCoordinates] = useState<{ lat: number; lon: number } | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [coverPhotoUrl, setCoverPhotoUrl] = useState('');
  const [showPreviousHistory, setShowPreviousHistory] = useState(false);
  const [priorDates, setPriorDates] = useState<{
    germinacion?: string;
    plantula?: string;
    vegetativo?: string;
  }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Umbrales críticos de temperatura y humedad para alertas automáticas e IA
  const [enableCustomThresholds, setEnableCustomThresholds] = useState(false);
  const [tempMinThreshold, setTempMinThreshold] = useState<number | ''>(11);
  const [tempMaxThreshold, setTempMaxThreshold] = useState<number | ''>(35);
  const [humidityMinThreshold, setHumidityMinThreshold] = useState<number | ''>(25);
  const [humidityMaxThreshold, setHumidityMaxThreshold] = useState<number | ''>(75);

  // Captura silenciosa de coordenadas para cultivos Outdoor o Invernadero
  const captureLocationSilently = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocationCoordinates({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lon: Number(pos.coords.longitude.toFixed(6)),
          });
        },
        (err) => {
          console.log('[Geolocation] Captura silenciosa no disponible o rechazada:', err.message);
        },
        { timeout: 8000, enableHighAccuracy: true }
      );
    }
  };

  useEffect(() => {
    if (cultivationToEdit) {
      setName(cultivationToEdit.name);
      const initialStageDate =
        cultivationToEdit.stageStartDate ||
        (isFloweringStage(cultivationToEdit.currentStage) ? cultivationToEdit.floweringStartDate : undefined) ||
        cultivationToEdit.startDate ||
        getLocalTodayDateOnly();
      setStartDate(initialStageDate);

      // Precargar priorDates desde stagesTimeline[].actualStartDate
      const existingTimeline = cultivationToEdit.stagesTimeline || [];
      const germinacionStage = existingTimeline.find((s) => s.name.toLowerCase().includes('germin'));
      const plantulaStage = existingTimeline.find((s) => s.name.toLowerCase().includes('plánt') || s.name.toLowerCase().includes('plant'));
      const vegetativoStage = existingTimeline.find((s) => s.name.toLowerCase().includes('veg'));

      const loadedPriorDates = {
        germinacion: germinacionStage?.actualStartDate || '',
        plantula: plantulaStage?.actualStartDate || '',
        vegetativo: vegetativoStage?.actualStartDate || '',
      };
      setPriorDates(loadedPriorDates);
      setShowPreviousHistory(Boolean(loadedPriorDates.germinacion || loadedPriorDates.plantula || loadedPriorDates.vegetativo));

      setType(cultivationToEdit.type);
      setIndoorId(cultivationToEdit.indoorId || '');
      setPlantCount(cultivationToEdit.plantCount || 1);
      setLocationCoordinates(cultivationToEdit.locationCoordinates);

      if (
        (cultivationToEdit.type === 'Outdoor' || cultivationToEdit.type === 'Invernadero') &&
        !cultivationToEdit.locationCoordinates
      ) {
        captureLocationSilently();
      }

      if (cultivationToEdit.geneticsList && cultivationToEdit.geneticsList.length > 0) {
        setGeneticsEntries(
          cultivationToEdit.geneticsList.map((g, idx) => ({
            id: g.id || `gen-${idx}-${Date.now()}`,
            geneticsId: g.geneticsId || '',
            name: g.name || '',
            seedBank: g.seedBank || '',
            photoperiodType: g.photoperiodType || 'Fotoperiódica',
            declaredFloweringWeeks: g.declaredFloweringWeeks || 8,
            plantCount: g.plantCount || 1,
          }))
        );
      } else {
        setGeneticsEntries([
          {
            id: 'gen-1',
            geneticsId: cultivationToEdit.geneticsId || '',
            name: cultivationToEdit.geneticsName || '',
            seedBank: cultivationToEdit.seedBank || '',
            photoperiodType: cultivationToEdit.photoperiodType || 'Fotoperiódica',
            declaredFloweringWeeks: cultivationToEdit.declaredFloweringWeeks || 8,
            plantCount: cultivationToEdit.plantCount || 1,
          },
        ]);
      }

      setCurrentStage(cultivationToEdit.currentStage || 'Vegetativo');
      setSubstrateType(cultivationToEdit.substrate?.type || 'Turba / Perlita');
      setGrowMethod(cultivationToEdit.growMethod ?? null);
      setPotVolumeLiters(cultivationToEdit.substrate?.potVolumeLiters || 11);
      setPotType(cultivationToEdit.substrate?.potType || 'Geotextil');
      setLightingType(cultivationToEdit.lighting?.type || '');
      setLightingWatts(
        cultivationToEdit.lighting?.usedWatts !== undefined && cultivationToEdit.lighting?.usedWatts !== null
          ? cultivationToEdit.lighting.usedWatts
          : ''
      );
      setLightHours(
        cultivationToEdit.lighting?.photoperiodHoursLight !== undefined &&
        cultivationToEdit.lighting?.photoperiodHoursLight !== null
          ? cultivationToEdit.lighting.photoperiodHoursLight
          : ''
      );
      setNotes(cultivationToEdit.notes || '');
      setCoverPhotoUrl(cultivationToEdit.coverPhotoUrl || '');

      // Cargar umbrales críticos de temperatura y humedad existentes
      if (cultivationToEdit.alertThresholds) {
        setEnableCustomThresholds(Boolean(cultivationToEdit.alertThresholds.enabled));
        setTempMinThreshold(
          cultivationToEdit.alertThresholds.tempMinC !== undefined && cultivationToEdit.alertThresholds.tempMinC !== null
            ? cultivationToEdit.alertThresholds.tempMinC
            : 11
        );
        setTempMaxThreshold(
          cultivationToEdit.alertThresholds.tempMaxC !== undefined && cultivationToEdit.alertThresholds.tempMaxC !== null
            ? cultivationToEdit.alertThresholds.tempMaxC
            : 35
        );
        setHumidityMinThreshold(
          cultivationToEdit.alertThresholds.humidityMinPct !== undefined && cultivationToEdit.alertThresholds.humidityMinPct !== null
            ? cultivationToEdit.alertThresholds.humidityMinPct
            : 25
        );
        setHumidityMaxThreshold(
          cultivationToEdit.alertThresholds.humidityMaxPct !== undefined && cultivationToEdit.alertThresholds.humidityMaxPct !== null
            ? cultivationToEdit.alertThresholds.humidityMaxPct
            : 75
        );
      } else {
        const isFlora = isFloweringStage(cultivationToEdit.currentStage);
        setEnableCustomThresholds(false);
        setTempMinThreshold(11);
        setTempMaxThreshold(35);
        setHumidityMinThreshold(25);
        setHumidityMaxThreshold(isFlora ? 60 : 75);
      }
    } else {
      setName('');
      setStartDate(getLocalTodayDateOnly());
      setType('Indoor');
      setIndoorId(initialIndoorId || '');
      const startAmbient = indoors.find((i) => i.id === initialIndoorId);
      if (startAmbient) {
        const t = cropTypeForAmbient(startAmbient);
        setType(t);
        if (t !== 'Indoor') {
          setLightingType('');
          setLightingWatts('');
          setLightHours('');
        }
      }
      setPlantCount(1);

      if (initialGenetics) {
        setGeneticsEntries([
          {
            id: 'gen-1',
            geneticsId: initialGenetics.id,
            name: initialGenetics.name,
            seedBank: initialGenetics.seedBank || '',
            photoperiodType: initialGenetics.photoperiodType || 'Fotoperiódica',
            declaredFloweringWeeks: initialGenetics.declaredFloweringDays
              ? Math.round(initialGenetics.declaredFloweringDays / 7)
              : 8,
            plantCount: 1,
          },
        ]);
      } else {
        setGeneticsEntries([
          {
            id: 'gen-1',
            geneticsId: '',
            name: '',
            seedBank: '',
            photoperiodType: 'Fotoperiódica',
            declaredFloweringWeeks: 8,
            plantCount: 1,
          },
        ]);
      }

      setCurrentStage('Vegetativo');
      setSubstrateType('Turba / Perlita / Humus');
      setGrowMethod(null);
      setPotVolumeLiters(11);
      setPotType('Geotextil');
      setLightingType('LED Quantum Board');
      setLightingWatts(240);
      setLightHours(18);
      setNotes('');
      setCoverPhotoUrl('');
      setEnableCustomThresholds(false);
      setTempMinThreshold(11);
      setTempMaxThreshold(35);
      setHumidityMinThreshold(25);
      setHumidityMaxThreshold(75);
    }
  }, [cultivationToEdit, initialGenetics, isOpen]);

  const handleUpdateGeneticsEntry = (
    id: string,
    field: keyof FormGeneticsEntry,
    value: any
  ) => {
    setGeneticsEntries((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return { ...item, [field]: value };
      })
    );
  };

  const handleSelectPredefinedGenetics = (id: string, geneticsKey: string) => {
    if (!geneticsKey) return;
    const [bank, ...nameParts] = geneticsKey.split(':::');
    const strainName = nameParts.join(':::');
    const selected = GENETICS_DATABASE.find(
      (g) => g.seedBank === bank && g.name === strainName
    );
    if (!selected) return;

    setGeneticsEntries((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          name: selected.name,
          seedBank: selected.seedBank,
          photoperiodType: parsePhotoperiod(`${selected.name} ${selected.type || ''}`, selected.dominance),
          declaredFloweringWeeks: parseFloweringWeeks(selected.floweringDays),
        };
      })
    );
  };

  const handleSelectGeneticsFromLibrary = (id: string, selectedLibId: string) => {
    const selected = geneticsList.find((g) => g.id === selectedLibId);
    setGeneticsEntries((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (!selected) {
          return { ...item, geneticsId: '' };
        }
        return {
          ...item,
          geneticsId: selected.id,
          name: selected.name,
          seedBank: selected.seedBank || '',
          photoperiodType: selected.photoperiodType,
          declaredFloweringWeeks: selected.declaredFloweringDays
            ? Math.round(selected.declaredFloweringDays / 7)
            : item.declaredFloweringWeeks,
        };
      })
    );
  };

  const handleGeneticsPlantCountChange = (id: string, count: number) => {
    const validCount = Math.max(1, count);
    setGeneticsEntries((prev) => {
      const updated = prev.map((item) =>
        item.id === id ? { ...item, plantCount: validCount } : item
      );
      const totalPlants = updated.reduce((sum, g) => sum + (Number(g.plantCount) || 1), 0);
      setPlantCount(totalPlants);
      return updated;
    });
  };

  const handleAddGeneticsEntry = () => {
    const newEntry: FormGeneticsEntry = {
      id: `gen-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      geneticsId: '',
      name: '',
      seedBank: '',
      photoperiodType: 'Fotoperiódica',
      declaredFloweringWeeks: 8,
      plantCount: 1,
    };
    setGeneticsEntries((prev) => {
      const updated = [...prev, newEntry];
      const totalPlants = updated.reduce((sum, g) => sum + (Number(g.plantCount) || 1), 0);
      setPlantCount(totalPlants);
      return updated;
    });
  };

  const handleRemoveGeneticsEntry = (id: string) => {
    if (geneticsEntries.length <= 1) return;
    setGeneticsEntries((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      const totalPlants = updated.reduce((sum, g) => sum + (Number(g.plantCount) || 1), 0);
      setPlantCount(Math.max(1, totalPlants));
      return updated;
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    try {
      setLoading(true);
      setError(null);
      // cualquier formato del celular (también HEIC), achicada y sin datos internos
      const { file } = await preparePhoto(picked, { maxEdge: 1600 });
      const photoId = 'cover_' + Date.now();
      const ext = file.name.split('.').pop() || 'jpg';
      const result = await photoService.uploadPhotoFile(userId, 'covers', photoId, file, ext);
      setCoverPhotoUrl(result.downloadUrl);
    } catch (err) {
      setError(err instanceof PhotoPrepError ? err.message : 'No se pudo subir la foto de portada. Probá de nuevo con conexión.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!name.trim()) {
      setError('Por favor indica un nombre para el cultivo.');
      return;
    }

    const activeUserId =
      auth.currentUser?.uid ||
      userId ||
      (typeof window !== 'undefined' ? localStorage.getItem('cultiveta_last_user_id') || 'usr_default' : 'usr_default');

    try {
      setLoading(true);
      setError(null);

      const cleanGeneticsList: CultivationGeneticsItem[] = geneticsEntries
        .filter((g) => g.name.trim() !== '' || (g.seedBank && g.seedBank.trim() !== '') || g.geneticsId)
        .map((g, idx) => {
          const item: CultivationGeneticsItem = {
            id: g.id || `gen-${idx}-${Date.now()}`,
            name: g.name.trim() || `Genética ${idx + 1}`,
            photoperiodType: g.photoperiodType || 'Fotoperiódica',
            declaredFloweringWeeks: Number(g.declaredFloweringWeeks) || 8,
            plantCount: Math.max(1, Number(g.plantCount) || 1),
          };
          if (g.geneticsId && g.geneticsId.trim()) {
            item.geneticsId = g.geneticsId.trim();
          }
          if (g.seedBank && g.seedBank.trim()) {
            item.seedBank = g.seedBank.trim();
          }
          return item;
        });

      const primaryGen = cleanGeneticsList[0];
      const combinedNames = cleanGeneticsList
        .map((g) => g.name)
        .filter(Boolean)
        .join(', ');
      const combinedBanks = Array.from(
        new Set(cleanGeneticsList.map((g) => g.seedBank).filter(Boolean))
      ).join(', ');

      const totalPlantsFromGenetics = cleanGeneticsList.reduce((sum, g) => sum + (g.plantCount || 1), 0);
      const calculatedFloweringWeeks = cleanGeneticsList.length > 0
        ? Math.max(...cleanGeneticsList.map((g) => g.declaredFloweringWeeks || 8))
        : 8;

      const todayStr = getLocalTodayDateOnly();
      // Una fecha explícitamente escrita por el usuario SIEMPRE tiene prioridad sobre hoy
      const stageStartDate = (startDate && startDate.trim()) || todayStr;

      const isStartFromGermination = currentStage === 'Germinación';
      const hasExplicitGermination = Boolean(priorDates.germinacion);
      const hasOtherPriorDates = Boolean(priorDates.plantula || priorDates.vegetativo);

      let timelineHistoryMode: 'known_from_start' | 'unknown_before_current_stage' | 'partially_known';
      if (isStartFromGermination || hasExplicitGermination) {
        timelineHistoryMode = 'known_from_start';
      } else if (hasOtherPriorDates) {
        timelineHistoryMode = 'partially_known';
      } else {
        timelineHistoryMode = 'unknown_before_current_stage';
      }

      const cycleStartKnown = isStartFromGermination || hasExplicitGermination;

      const resolvedStartDate = isStartFromGermination
        ? stageStartDate
        : (priorDates.germinacion ||
           (cycleStartKnown && cultivationToEdit?.startDate) ||
           priorDates.plantula ||
           priorDates.vegetativo ||
           stageStartDate);

      let finalFloweringStartDate: string | undefined = undefined;
      if (isFloweringStage(currentStage)) {
        // En Floración: fecha contextual ingresada tiene prioridad; si no fue modificada conservar la existente
        finalFloweringStartDate = stageStartDate || cultivationToEdit?.floweringStartDate || todayStr;
      } else if (cultivationToEdit?.floweringStartDate) {
        finalFloweringStartDate = cultivationToEdit.floweringStartDate;
      }

      // Construir o actualizar stagesTimeline de forma determinista
      const updatedStagesTimeline = buildUpdatedStagesTimeline({
        currentStage: currentStage || 'Vegetativo',
        stageStartDate,
        floweringStartDate: finalFloweringStartDate,
        priorDates,
        photoperiodType: primaryGen?.photoperiodType || 'Fotoperiódica',
        declaredFloweringWeeks: calculatedFloweringWeeks,
        type: type || 'Indoor',
        existingTimeline: cultivationToEdit?.stagesTimeline,
      });

      const isOutdoorOrGreenhouse = type === 'Outdoor' || type === 'Invernadero';
      let finalLightingType = lightingType.trim();
      let finalUsedWatts: number | undefined = undefined;

      if (isOutdoorOrGreenhouse) {
        if (!finalLightingType) {
          finalLightingType = 'Luz Natural';
        }
        // Si se deja vacío lightingType en exterior, al guardar se asume { type: 'Luz Natural' } sin watts
        if (finalLightingType.toLowerCase() !== 'luz natural' && lightingWatts !== '' && Number(lightingWatts) > 0) {
          finalUsedWatts = Number(lightingWatts);
        }
      } else {
        if (!finalLightingType) {
          finalLightingType = 'LED Quantum Board';
        }
        if (lightingWatts !== '' && Number(lightingWatts) > 0) {
          finalUsedWatts = Number(lightingWatts);
        }
      }

      const lightingPayload: {
        type: string;
        usedWatts?: number;
        photoperiodHoursLight?: number;
        photoperiodHoursDark?: number;
      } = {
        type: finalLightingType,
      };

      if (lightHours !== '' && Number(lightHours) > 0) {
        const hoursNum = clampLightHours(Number(lightHours));
        lightingPayload.photoperiodHoursLight = hoursNum;
        lightingPayload.photoperiodHoursDark = Math.max(0, 24 - hoursNum);
      } else if (!isOutdoorOrGreenhouse) {
        lightingPayload.photoperiodHoursLight = 18;
        lightingPayload.photoperiodHoursDark = 6;
      }

      if (finalUsedWatts !== undefined && finalUsedWatts > 0) {
        lightingPayload.usedWatts = finalUsedWatts;
      }

      const cultivationPayload: any = {
        userId: activeUserId,
        name: name.trim(),
        startDate: resolvedStartDate,
        type: type || 'Indoor',
        plantCount: Math.max(1, Number(plantCount) || totalPlantsFromGenetics || 1),
        photoperiodType: primaryGen?.photoperiodType || 'Fotoperiódica',
        declaredFloweringWeeks: calculatedFloweringWeeks,
        currentStage: currentStage || 'Vegetativo',
        stageStartDate,
        timelineHistoryMode,
        cycleStartKnown,
        stagesTimeline: updatedStagesTimeline,
        growMethod: shownMethod,
        substrate: {
          type: substrateType || 'Turba / Perlita / Humus',
          potVolumeLiters: Number(potVolumeLiters) || 11,
          potType: potType || 'Geotextil',
        },
        lighting: lightingPayload,
        status: cultivationToEdit?.status || 'ESTABLE',
        isFinished: cultivationToEdit?.isFinished || false,
      };

      if (finalFloweringStartDate) {
        cultivationPayload.floweringStartDate = finalFloweringStartDate;
      }

      if (primaryGen?.geneticsId) {
        cultivationPayload.geneticsId = primaryGen.geneticsId;
      }
      if (combinedNames) {
        cultivationPayload.geneticsName = combinedNames;
      }
      if (combinedBanks) {
        cultivationPayload.seedBank = combinedBanks;
      }
      if (cleanGeneticsList.length > 0) {
        cultivationPayload.geneticsList = cleanGeneticsList;
      }

      if (coverPhotoUrl) {
        cultivationPayload.coverPhotoUrl = coverPhotoUrl;
      }

      // Ambiente: en uno interior la luz es la del ambiente (se cambia desde el ambiente, no desde acá).
      // Sin ambiente elegido, la app le arma uno con el nombre del cultivo.
      const chosenIndoor = ambientsForCrop({ type }, indoors).find((i) => i.id === indoorId);
      if (chosenIndoor) {
        cultivationPayload.indoorId = chosenIndoor.id;
        if (chosenIndoor.lighting && !isExteriorAmbient(chosenIndoor)) cultivationPayload.lighting = chosenIndoor.lighting;
      } else if (cultivationToEdit?.indoorId) {
        cultivationPayload.indoorId = null;
      }

      if (notes && notes.trim()) {
        cultivationPayload.notes = notes.trim();
      }

      // Umbrales críticos de temperatura y humedad definidos por el usuario
      const alertThresholdsPayload: EnvironmentalAlertThresholds = {
        enabled: Boolean(enableCustomThresholds),
        tempMinC: tempMinThreshold !== '' ? Number(tempMinThreshold) : 11,
        tempMaxC: tempMaxThreshold !== '' ? Number(tempMaxThreshold) : 35,
        humidityMinPct: humidityMinThreshold !== '' ? Number(humidityMinThreshold) : 25,
        humidityMaxPct: humidityMaxThreshold !== '' ? Number(humidityMaxThreshold) : 75,
      };
      cultivationPayload.alertThresholds = alertThresholdsPayload;

      // Adjuntar coordenadas para Outdoor / Invernadero
      let finalCoords = locationCoordinates;
      if (isOutdoorOrGreenhouse && !finalCoords && typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3500, enableHighAccuracy: true });
          });
          finalCoords = {
            lat: Number(pos.coords.latitude.toFixed(6)),
            lon: Number(pos.coords.longitude.toFixed(6)),
          };
          setLocationCoordinates(finalCoords);
        } catch {
          // Continuar silenciosamente si el usuario deniega o demora
        }
      }

      if (isOutdoorOrGreenhouse && finalCoords) {
        cultivationPayload.locationCoordinates = finalCoords;
      }

      let result: Cultivation;
      if (cultivationToEdit) {
        await cultivationService.updateCultivation(cultivationToEdit.id, cultivationPayload, activeUserId);
        result = { ...cultivationToEdit, ...cultivationPayload, updatedAt: new Date().toISOString() };
      } else {
        result = await cultivationService.createCultivation(cultivationPayload);
      }

      onSaved(result);
      onClose();
    } catch (err: any) {
      console.error('Error saving cultivation', err);
      setError(err?.message || 'No se pudo guardar el cultivo.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cultiveta-modal-overlay animate-in fade-in">
      <div
        id="cultivation-form-modal"
        className="cultiveta-modal-container my-auto max-w-2xl p-6 sm:p-8"
      >
        <div className="flex items-center justify-between pb-4 border-b border-line mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-ok-bg text-ok-ink">
              <Sprout className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-ink">
                {cultivationToEdit ? 'Editar cultivo' : 'Sumar plantas'}
              </h2>
              <p className="text-xs text-ink-muted">Elegí la genética y cuándo arrancó.</p>
            </div>
          </div>
          <button aria-label="Cerrar"
            type="button"
            onClick={onClose}
            className="p-2 text-ink-subtle hover:text-ink rounded-full hover:bg-track transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-error/10 border border-error/30 text-error text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
          {/* Section 1: Basic Info */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ok-ink flex items-center gap-1.5">
              <Sprout className="w-3.5 h-3.5" />
              1. Datos Principales
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-ink mb-1">Nombre del cultivo *</label>
                <input
                  id="crop-name-input"
                  type="text"
                  required
                  placeholder="ej. Carpa Principal #02"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-surface border border-line text-ink text-sm focus:outline-hidden focus:border-ok-line focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">Etapa actual *</label>
                <select
                  id="crop-stage-select"
                  value={currentStage}
                  onChange={(e) => {
                    const newStage = e.target.value;
                    setCurrentStage(newStage);
                    if (newStage.toLowerCase().includes('flor')) {
                      setLightHours(12);
                    } else if (
                      newStage.toLowerCase().includes('veg') ||
                      newStage.toLowerCase().includes('plánt') ||
                      newStage.toLowerCase().includes('germin')
                    ) {
                      if (lightHours === 12) setLightHours(18);
                    }
                  }}
                  className="w-full px-3.5 py-2 rounded-2xl bg-surface border border-line text-ink text-sm focus:outline-hidden focus:border-ok-line focus:bg-white cursor-pointer"
                >
                  <option value="Germinación">🌱 Germinación</option>
                  <option value="Plántula">🌿 Plántula</option>
                  <option value="Vegetativo">🌳 Vegetativo (18/6)</option>
                  <option value="Floración">🌸 Floración (12/12)</option>
                  <option value="Lavado / Secado">🍂 Lavado / Cosecha</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1" id="crop-stage-start-date-label">
                  {currentStage === 'Germinación'
                    ? '¿Cuándo empezó el cultivo? *'
                    : currentStage === 'Plántula'
                    ? '¿Cuándo empezó Plántula? *'
                    : currentStage === 'Vegetativo'
                    ? '¿Cuándo empezó Vegetativo? *'
                    : currentStage === 'Floración'
                    ? '¿Cuándo empezó Floración? *'
                    : `¿Cuándo empezó ${currentStage}? *`}
                </label>
                <input
                  id="crop-start-date-input"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-surface border border-line text-ink text-sm focus:outline-hidden focus:border-ok-line focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  Cantidad total de plantas
                  {geneticsEntries.length > 1 && (
                    <span className="text-xs font-normal text-ok-ink ml-1.5">
                      (Suma de genéticas: {geneticsEntries.reduce((s, g) => s + (Number(g.plantCount) || 1), 0)})
                    </span>
                  )}
                </label>
                <input
                  id="crop-plant-count-input"
                  type="number"
                  min="1"
                  max="100"
                  value={plantCount}
                  onChange={(e) => setPlantCount(parseInt(e.target.value) || 1)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-surface border border-line text-ink text-sm focus:outline-hidden focus:border-ok-line focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">Tipo de entorno</label>
                <select
                  id="crop-type-select"
                  value={type}
                  onChange={(e) => {
                    const newType = e.target.value as CultivationType;
                    setType(newType);
                    if (newType === 'Outdoor' || newType === 'Invernadero') {
                      captureLocationSilently();
                    }
                    if (!cultivationToEdit) {
                      if (newType === 'Outdoor' || newType === 'Invernadero') {
                        if (lightingType === 'LED Quantum Board') {
                          setLightingType('');
                          setLightingWatts('');
                          setLightHours('');
                        }
                      } else if (newType === 'Indoor') {
                        if (!lightingType || lightingType === 'Luz Natural') {
                          setLightingType('LED Quantum Board');
                          setLightingWatts(240);
                          setLightHours(18);
                        }
                      }
                    }
                  }}
                  className="w-full px-3.5 py-2 rounded-2xl bg-surface border border-line text-ink text-sm focus:outline-hidden focus:border-ok-line focus:bg-white cursor-pointer"
                >
                  <option value="Indoor">Indoor (Carpa / Sala)</option>
                  <option value="Outdoor">Outdoor (Exterior)</option>
                  <option value="Invernadero">Invernadero</option>
                </select>

                {ambientsForCrop({ type }, indoors).length > 0 && (
                  <div className="mt-2.5">
                    <label htmlFor="crop-indoor-select" className="block text-xs font-bold text-ink mb-1">
                      ¿En qué ambiente está?
                    </label>
                    <select
                      id="crop-indoor-select"
                      value={indoorId}
                      onChange={(e) => setIndoorId(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-2xl bg-surface border border-line text-ink text-sm focus:outline-hidden focus:border-ok-line focus:bg-white cursor-pointer"
                    >
                      <option value="">{cultivationToEdit?.indoorId ? 'Uno nuevo para este cultivo' : 'Uno nuevo, con el nombre del cultivo'}</option>
                      {ambientsForCrop({ type }, indoors).map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {(type === 'Outdoor' || type === 'Invernadero') && (
                  <div
                    id="crop-environment-vpd-warning"
                    className="mt-2.5 flex items-start gap-2.5 p-3 rounded-2xl bg-warn-bg border border-warn-line text-warn-ink text-xs leading-relaxed"
                  >
                    <AlertTriangle className="w-4 h-4 text-warn-ink shrink-0 mt-0.5" />
                    <span>
                      En cultivos de exterior o invernadero sin ambiente controlado, el cálculo de VPD (Déficit de Presión de Vapor) y el control de variables climáticas no estarán disponibles.
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Progressive disclosure: Fechas anteriores opcionales */}
            {currentStage !== 'Germinación' && (
              <div className="pt-2 border-t border-line">
                <button
                  type="button"
                  id="toggle-prior-history-btn"
                  onClick={() => setShowPreviousHistory(!showPreviousHistory)}
                  className="text-xs font-semibold text-ok-ink hover:text-ok-ink flex items-center gap-1.5 cursor-pointer py-1"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showPreviousHistory ? 'rotate-180' : ''}`} />
                  Agregar fechas anteriores (opcional)
                </button>

                {showPreviousHistory && (
                  <div className="mt-2.5 p-3.5 rounded-2xl bg-surface border border-line space-y-3">
                    <p className="text-xs text-ink-muted leading-relaxed">
                      Si sabés cuándo empezó cada etapa anterior, cargalo acá. Si no te acordás, dejalas vacías y Cultiveta marcará el historial anterior como desconocido sin proyectar fechas hacia atrás.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-ink mb-1">
                          ¿Cuándo empezó Germinación? (opcional)
                        </label>
                        <input
                          id="prior-stage-germinacion-input"
                          type="date"
                          value={priorDates.germinacion || ''}
                          onChange={(e) => setPriorDates((p) => ({ ...p, germinacion: e.target.value }))}
                          className="w-full px-3 py-1.5 rounded-xl bg-white border border-line text-xs text-ink focus:outline-hidden focus:border-ok-line"
                        />
                      </div>

                      {(currentStage === 'Vegetativo' || currentStage === 'Floración' || currentStage === 'Lavado / Secado') && (
                        <div>
                          <label className="block text-xs font-semibold text-ink mb-1">
                            ¿Cuándo empezó Plántula? (opcional)
                          </label>
                          <input
                            id="prior-stage-plantula-input"
                            type="date"
                            value={priorDates.plantula || ''}
                            onChange={(e) => setPriorDates((p) => ({ ...p, plantula: e.target.value }))}
                            className="w-full px-3 py-1.5 rounded-xl bg-white border border-line text-xs text-ink focus:outline-hidden focus:border-ok-line"
                          />
                        </div>
                      )}

                      {(currentStage === 'Floración' || currentStage === 'Lavado / Secado') && (
                        <div>
                          <label className="block text-xs font-semibold text-ink mb-1">
                            ¿Cuándo empezó Vegetativo? (opcional)
                          </label>
                          <input
                            id="prior-stage-vegetativo-input"
                            type="date"
                            value={priorDates.vegetativo || ''}
                            onChange={(e) => setPriorDates((p) => ({ ...p, vegetativo: e.target.value }))}
                            className="w-full px-3 py-1.5 rounded-xl bg-white border border-line text-xs text-ink focus:outline-hidden focus:border-ok-line"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Genetics */}
          <div className="space-y-4 pt-2 border-t border-line">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ok-ink flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                2. Genéticas
              </h3>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-ok-bg text-ok-ink border border-ok-line">
                {geneticsEntries.length} {geneticsEntries.length === 1 ? 'genética' : 'genéticas'}
              </span>
            </div>

            <p className="text-xs text-ink-muted">
              Podés cultivar una o varias genéticas en el mismo lugar. Elegilas del catálogo o de tu biblioteca, o cargá los datos a mano.
            </p>

            <div className="space-y-4">
              {geneticsEntries.map((entry, index) => (
                <div
                  key={entry.id}
                  className="p-4 rounded-2xl bg-surface border border-line space-y-3 relative group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-brand-deep text-white font-bold text-xs flex items-center justify-center">
                        {index + 1}
                      </span>
                      <span className="text-xs font-bold text-ink">
                        Genética {index + 1}
                        {entry.name ? `: ${entry.name}` : ''}
                      </span>
                      {entry.seedBank && (
                        <span className="text-xs text-ink-muted font-medium">({entry.seedBank})</span>
                      )}
                    </div>

                    {geneticsEntries.length > 1 && (
                      <button
                        type="button"
                        id={`btn-remove-genetics-${index}`}
                        onClick={() => handleRemoveGeneticsEntry(entry.id)}
                        className="p-1.5 text-ink-subtle hover:text-error hover:bg-error/10 rounded-lg transition-colors cursor-pointer"
                        title="Quitar esta genética del cultivo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-brand mb-1">
                        Buscar en el catálogo
                      </label>
                      <select
                        id={`crop-predefined-genetics-selector-${index}`}
                        value={entry.seedBank && entry.name ? `${entry.seedBank}:::${entry.name}` : ''}
                        onChange={(e) => handleSelectPredefinedGenetics(entry.id, e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-icon-bg border border-chip-line text-brand text-xs font-medium focus:outline-hidden focus:border-chip-line focus:ring-1 focus:ring-brand cursor-pointer shadow-2xs"
                      >
                        <option value="">Elegir del catálogo ({GENETICS_DATABASE.length})…</option>
                        {Object.entries(PREDEFINED_BY_BANK).map(([bank, strains]) => (
                          <optgroup key={bank} label={bank}>
                            {strains.map((g) => (
                              <option key={`${g.seedBank}:::${g.name}`} value={`${g.seedBank}:::${g.name}`}>
                                {[g.name, g.dominance, g.floweringDays ? `${g.floweringDays} días` : ''].filter(Boolean).join(' · ')}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    {geneticsList.length > 0 && (
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-ink-muted mb-1">
                          Cargar desde biblioteca guardada
                        </label>
                        <select
                          id={`crop-genetics-lib-selector-${index}`}
                          value={entry.geneticsId || ''}
                          onChange={(e) => handleSelectGeneticsFromLibrary(entry.id, e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-line text-ink text-xs font-medium focus:outline-hidden focus:border-ok-line cursor-pointer shadow-2xs"
                        >
                          <option value="">Elegir de mi biblioteca…</option>
                          {geneticsList.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name} ({g.seedBank}) · {g.photoperiodType}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-ink mb-1">
                        Nombre de la genética
                      </label>
                      <input
                        id={`crop-genetics-name-${index}`}
                        type="text"
                        placeholder="ej. Amnesia Haze, Gorilla Cookies"
                        value={entry.name}
                        onChange={(e) => handleUpdateGeneticsEntry(entry.id, 'name', e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-line text-ink text-xs focus:outline-hidden focus:border-ok-line"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-ink mb-1">Banco / Breeder</label>
                      <input
                        id={`crop-genetics-seedbank-${index}`}
                        type="text"
                        placeholder="ej. Barney’s Farm, RQS, Fast Buds"
                        value={entry.seedBank}
                        onChange={(e) => handleUpdateGeneticsEntry(entry.id, 'seedBank', e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-line text-ink text-xs focus:outline-hidden focus:border-ok-line"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-ink mb-1">Tipo de fotoperiodo</label>
                      <select
                        id={`crop-genetics-photoperiod-${index}`}
                        value={entry.photoperiodType}
                        onChange={(e) =>
                          handleUpdateGeneticsEntry(entry.id, 'photoperiodType', e.target.value as PhotoperiodType)
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white border border-line text-ink text-xs focus:outline-hidden focus:border-ok-line cursor-pointer"
                      >
                        <option value="Fotoperiódica">Fotoperiódica (Feminizada)</option>
                        <option value="Automática">Automática (Auto)</option>
                        <option value="Regular">Regular</option>
                        <option value="CBD">CBD / Medicinal</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-ink mb-1">Floración estimada (semanas)</label>
                      <input
                        id={`crop-genetics-flowering-${index}`}
                        type="number"
                        min="4"
                        max="24"
                        value={entry.declaredFloweringWeeks}
                        onChange={(e) =>
                          handleUpdateGeneticsEntry(
                            entry.id,
                            'declaredFloweringWeeks',
                            parseInt(e.target.value) || 8
                          )
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white border border-line text-ink text-xs focus:outline-hidden focus:border-ok-line"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-ink mb-1">Plantas de esta genética</label>
                      <input
                        id={`crop-genetics-plants-${index}`}
                        type="number"
                        min="1"
                        max="100"
                        value={entry.plantCount}
                        onChange={(e) =>
                          handleGeneticsPlantCountChange(entry.id, parseInt(e.target.value) || 1)
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white border border-line text-ink text-xs focus:outline-hidden focus:border-ok-line"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Button to add another genetics */}
            <div className="pt-1">
              <button
                type="button"
                id="btn-add-another-genetics"
                onClick={handleAddGeneticsEntry}
                className="w-full py-2.5 px-4 rounded-2xl bg-ok-bg hover:bg-ok-bg border border-dashed border-ok-line text-ok-ink font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-2xs"
              >
                <Plus className="w-4 h-4 text-ok-ink" />
                <span>+ Agregar otra genética</span>
              </button>
            </div>
          </div>

          {/* Section 3: Substrate and Setup */}
          <div className="space-y-4 pt-2 border-t border-line">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ok-ink flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5" />
              3. Sustrato e Iluminación
            </h3>

            {/* Cómo se cultiva: cambia cómo se riega (pH y EC, solo agua o control del tanque) */}
            <fieldset id="crop-grow-method">
              <legend className="block text-xs font-bold text-ink mb-1">¿Cómo cultivás?</legend>
              <div className="grid grid-cols-2 gap-2">
                {GROW_METHODS.map((m) => {
                  const on = shownMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      id={`crop-grow-method-${m.id}`}
                      aria-pressed={on}
                      onClick={() => setGrowMethod(m.id)}
                      className={`text-left px-3 py-2 rounded-2xl border transition-colors cursor-pointer ${
                        on ? 'bg-ok-bg border-ok-line ring-1 ring-ok' : 'bg-surface border-line hover:border-ok-line'
                      }`}
                    >
                      <span className={`block text-xs font-bold ${on ? 'text-ok-ink' : 'text-ink'}`}>{m.label}</span>
                      <span className="block text-xs text-ink-muted leading-snug">{m.desc}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-ink mb-1">Tipo de sustrato</label>
                <input
                  id="crop-substrate-type-input"
                  type="text"
                  placeholder="ej. Turba/Perlita, Coco, Living Soil"
                  value={substrateType}
                  onChange={(e) => setSubstrateType(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-surface border border-line text-ink text-sm focus:outline-hidden focus:border-ok-line focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">Volumen de maceta (litros)</label>
                <input
                  id="crop-pot-volume-input"
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={potVolumeLiters}
                  onChange={(e) => setPotVolumeLiters(parseFloat(e.target.value) || 11)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-surface border border-line text-ink text-sm focus:outline-hidden focus:border-ok-line focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">Tipo de maceta</label>
                <select
                  id="crop-pot-type-select"
                  value={potType}
                  onChange={(e) => setPotType(e.target.value as PotType)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-surface border border-line text-ink text-sm focus:outline-hidden focus:border-ok-line focus:bg-white cursor-pointer"
                >
                  <option value="Geotextil">Geotextil (Tela)</option>
                  <option value="Plástico">Plástico tradicional</option>
                  <option value="Airpot">Airpot (Guías de raíz)</option>
                  <option value="Tierra madre">Tierra madre directa</option>
                  <option value="Hidropónico">Hidropónico / DWC</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>

              {type === 'Indoor' && ambientsForCrop({ type }, indoors).some((i) => i.id === indoorId) ? (
                <p id="crop-indoor-light-note" className="sm:col-span-3 text-xs font-semibold text-ok-ink bg-ok-bg border border-ok-line rounded-2xl px-3.5 py-2.5">
                  La luz (tipo, watts y horas) es la del ambiente {indoors.find((i) => i.id === indoorId)?.name}: se cambia desde el ambiente y vale para todas sus plantas.
                </p>
              ) : (
              <>
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  {(type === 'Outdoor' || type === 'Invernadero') ? 'Apoyo lumínico (opcional)' : 'Iluminación'}
                </label>
                <input
                  id="crop-lighting-type-input"
                  type="text"
                  placeholder={
                    (type === 'Outdoor' || type === 'Invernadero')
                      ? 'ej. Luz Natural (o lámpara de apoyo)'
                      : 'ej. LED QB LM301H, Sodio 400W'
                  }
                  value={lightingType}
                  onChange={(e) => setLightingType(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-surface border border-line text-ink text-sm focus:outline-hidden focus:border-ok-line focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  {(type === 'Outdoor' || type === 'Invernadero')
                    ? 'Potencia de apoyo (Watts, opcional)'
                    : 'Potencia utilizada (Watts)'}
                </label>
                <input
                  id="crop-lighting-watts-input"
                  type="number"
                  min="0"
                  max="5000"
                  placeholder={(type === 'Outdoor' || type === 'Invernadero') ? 'Opcional (sin watts)' : '240'}
                  value={lightingWatts}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLightingWatts(val === '' ? '' : parseInt(val) || 0);
                  }}
                  className="w-full px-3.5 py-2 rounded-2xl bg-surface border border-line text-ink text-sm focus:outline-hidden focus:border-ok-line focus:bg-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-ink">
                    {(type === 'Outdoor' || type === 'Invernadero')
                      ? 'Horas de luz diarias (opcional)'
                      : 'Horas de luz diarias'}
                  </label>
                  {lightHours !== '' && Number(lightHours) > 0 && (
                    <span className="text-xs font-bold text-warn-ink">
                      {lightHours}h luz / {darkHoursFor(Number(lightHours))}h osc.
                    </span>
                  )}
                </div>
                {/* Solo opciones fijas: Vegetativo, Floración y Superciclos floración */}
                <div className="mt-1">
                  <PhotoperiodPresetPicker
                    idPrefix="crop-photoperiod"
                    light={lightHours}
                    onSelect={(light) => setLightHours(light)}
                    onSelectNone={type === 'Outdoor' || type === 'Invernadero' ? () => setLightHours('') : undefined}
                  />
                </div>
              </div>
              </>
              )}
            </div>
          </div>

          {/* Section 4: Critical Environmental Alert Thresholds */}
          <div className="space-y-4 pt-2 border-t border-line">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-ok-ink flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-error" />
                  4. Umbrales Críticos de Temperatura y Humedad (Alertas IA)
                </h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Elegí entre qué temperatura y humedad están bien tus plantas. Si se salen de ahí, te avisamos.
                </p>
              </div>

              {/* Custom Thresholds Toggle Switch */}
              <label className="inline-flex items-center gap-2 cursor-pointer self-start sm:self-auto bg-surface hover:bg-track px-3 py-1.5 rounded-2xl border border-line transition-colors">
                <input
                  type="checkbox"
                  id="crop-enable-custom-thresholds"
                  checked={enableCustomThresholds}
                  onChange={(e) => setEnableCustomThresholds(e.target.checked)}
                  className="w-4 h-4 text-ok-ink rounded-md border-line focus:ring-ok cursor-pointer"
                />
                <span className="text-xs font-bold text-ink">
                  {enableCustomThresholds ? 'Umbrales personalizados activos' : 'Usar umbrales por defecto'}
                </span>
              </label>
            </div>

            {/* Quick Presets Bar */}
            <div className="p-3 rounded-2xl bg-surface border border-line flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-ink-muted flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-warn-ink" />
                Presets recomendados:
              </span>
              <button
                type="button"
                id="preset-flora-anti-botrytis"
                onClick={() => {
                  setEnableCustomThresholds(true);
                  setTempMinThreshold(18);
                  setTempMaxThreshold(28);
                  setHumidityMinThreshold(35);
                  setHumidityMaxThreshold(58);
                }}
                className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-white hover:bg-error/10 hover:text-error text-ink border border-line shadow-2xs transition-colors cursor-pointer"
              >
                Floración Segura (Max 58% HR)
              </button>
              <button
                type="button"
                id="preset-vegetative-optimal"
                onClick={() => {
                  setEnableCustomThresholds(true);
                  setTempMinThreshold(20);
                  setTempMaxThreshold(30);
                  setHumidityMinThreshold(45);
                  setHumidityMaxThreshold(70);
                }}
                className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-white hover:bg-ok-bg hover:text-ok-ink text-ink border border-line shadow-2xs transition-colors cursor-pointer"
              >
                Vegetativo óptimo
              </button>
              <button
                type="button"
                id="preset-seedling-humid"
                onClick={() => {
                  setEnableCustomThresholds(true);
                  setTempMinThreshold(22);
                  setTempMaxThreshold(28);
                  setHumidityMinThreshold(60);
                  setHumidityMaxThreshold(85);
                }}
                className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-white hover:bg-icon-bg hover:text-brand text-ink border border-line shadow-2xs transition-colors cursor-pointer"
              >
                Plántula / Esquejes
              </button>
              <button
                type="button"
                id="preset-standard-defaults"
                onClick={() => {
                  setEnableCustomThresholds(false);
                  setTempMinThreshold(11);
                  setTempMaxThreshold(35);
                  setHumidityMinThreshold(25);
                  setHumidityMaxThreshold(75);
                }}
                className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-line hover:bg-chip-line text-ink transition-colors cursor-pointer ml-auto"
              >
                Valores Estándar (11-35°C | 25-75%)
              </button>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Temp Min */}
              <div
                className={`p-3.5 rounded-2xl border transition-all ${
                  enableCustomThresholds
                    ? 'bg-white border-chip-line shadow-2xs'
                    : 'bg-surface border-line opacity-80'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                    <Thermometer className="w-3.5 h-3.5 text-brand" />
                    Temperatura mínima
                  </label>
                  <span className="text-[11px] font-bold text-brand bg-icon-bg px-1.5 py-0.5 rounded">
                    °C
                  </span>
                </div>
                <input
                  type="number"
                  step="0.5"
                  min="-5"
                  max="30"
                  id="crop-threshold-temp-min"
                  value={tempMinThreshold}
                  onChange={(e) => {
                    setTempMinThreshold(e.target.value === '' ? '' : parseFloat(e.target.value));
                    if (!enableCustomThresholds) setEnableCustomThresholds(true);
                  }}
                  className="w-full px-3 py-1.5 rounded-xl bg-surface border border-line text-ink text-sm font-bold focus:outline-hidden focus:border-chip-line"
                  placeholder="11"
                />
                <p className="text-[11px] text-ink-muted mt-1.5 leading-snug">
                  Alerta si la temperatura desciende por debajo (peligro de shock radicular).
                </p>
              </div>

              {/* Temp Max */}
              <div
                className={`p-3.5 rounded-2xl border transition-all ${
                  enableCustomThresholds
                    ? 'bg-white border-error/30 shadow-2xs'
                    : 'bg-surface border-line opacity-80'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                    <Thermometer className="w-3.5 h-3.5 text-error" />
                    Temperatura máxima
                  </label>
                  <span className="text-[11px] font-bold text-error bg-error/10 px-1.5 py-0.5 rounded">
                    °C
                  </span>
                </div>
                <input
                  type="number"
                  step="0.5"
                  min="20"
                  max="50"
                  id="crop-threshold-temp-max"
                  value={tempMaxThreshold}
                  onChange={(e) => {
                    setTempMaxThreshold(e.target.value === '' ? '' : parseFloat(e.target.value));
                    if (!enableCustomThresholds) setEnableCustomThresholds(true);
                  }}
                  className="w-full px-3 py-1.5 rounded-xl bg-surface border border-line text-ink text-sm font-bold focus:outline-hidden focus:border-error/30"
                  placeholder="35"
                />
                <p className="text-[11px] text-ink-muted mt-1.5 leading-snug">
                  Alerta si la temperatura supera este valor (estrés térmico y cierre estomático).
                </p>
              </div>

              {/* Humidity Min */}
              <div
                className={`p-3.5 rounded-2xl border transition-all ${
                  enableCustomThresholds
                    ? 'bg-white border-warn-line shadow-2xs'
                    : 'bg-surface border-line opacity-80'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                    <Droplets className="w-3.5 h-3.5 text-warn-ink" />
                    Humedad mínima
                  </label>
                  <span className="text-[11px] font-bold text-warn-ink bg-warn-bg px-1.5 py-0.5 rounded">
                    % HR
                  </span>
                </div>
                <input
                  type="number"
                  step="1"
                  min="10"
                  max="80"
                  id="crop-threshold-humidity-min"
                  value={humidityMinThreshold}
                  onChange={(e) => {
                    setHumidityMinThreshold(e.target.value === '' ? '' : parseInt(e.target.value));
                    if (!enableCustomThresholds) setEnableCustomThresholds(true);
                  }}
                  className="w-full px-3 py-1.5 rounded-xl bg-surface border border-line text-ink text-sm font-bold focus:outline-hidden focus:border-warn-line"
                  placeholder="25"
                />
                <p className="text-[11px] text-ink-muted mt-1.5 leading-snug">
                  Alerta por aire muy seco (deshidratación acelerada y quemaduras foliares).
                </p>
              </div>

              {/* Humidity Max */}
              <div
                className={`p-3.5 rounded-2xl border transition-all ${
                  enableCustomThresholds
                    ? 'bg-white border-chip-line shadow-2xs'
                    : 'bg-surface border-line opacity-80'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                    <Droplets className="w-3.5 h-3.5 text-brand" />
                    Humedad máxima
                  </label>
                  <span className="text-[11px] font-bold text-brand bg-icon-bg px-1.5 py-0.5 rounded">
                    % HR
                  </span>
                </div>
                <input
                  type="number"
                  step="1"
                  min="30"
                  max="99"
                  id="crop-threshold-humidity-max"
                  value={humidityMaxThreshold}
                  onChange={(e) => {
                    setHumidityMaxThreshold(e.target.value === '' ? '' : parseInt(e.target.value));
                    if (!enableCustomThresholds) setEnableCustomThresholds(true);
                  }}
                  className="w-full px-3 py-1.5 rounded-xl bg-surface border border-line text-ink text-sm font-bold focus:outline-hidden focus:border-chip-line"
                  placeholder="75"
                />
                <p className="text-[11px] text-ink-muted mt-1.5 leading-snug">
                  Alerta por humedad excesiva (peligro inminente de botrytis y hongos en cogollos).
                </p>
              </div>
            </div>

            {/* Active Threshold Summary Banner */}
            <div className="p-3 rounded-2xl bg-ok-bg border border-ok-line flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-ok-ink">
              <div className="flex items-center gap-2">
                <BellRing className="w-4 h-4 text-ok-ink shrink-0" />
                <span>
                  <strong>Rango seguro activo:</strong> Temperatura entre{' '}
                  <span className="font-bold">{tempMinThreshold}°C y {tempMaxThreshold}°C</span> · Humedad entre{' '}
                  <span className="font-bold">{humidityMinThreshold}% y {humidityMaxThreshold}% HR</span>.
                </span>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-ok-bg text-ok-ink border border-ok-line self-start sm:self-auto shrink-0">
                {enableCustomThresholds ? 'Personalizado' : 'Por defecto'}
              </span>
            </div>
          </div>

          {/* Section 5: Photo & Notes */}
          <div className="space-y-4 pt-2 border-t border-line">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ok-ink flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" />
              5. Foto de Portada y Notas
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-ink mb-1">Foto de portada (opcional)</label>
                <div className="flex items-center gap-3">
                  {coverPhotoUrl && (
                    <img
                      src={coverPhotoUrl}
                      alt="Preview"
                      className="w-14 h-14 rounded-2xl object-cover border border-line shrink-0"
                    />
                  )}
                  <input
                    id="crop-cover-photo-file-input"
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="text-xs text-ink-muted file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-ok-bg file:text-ok-ink hover:file:bg-ok-bg cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1">Notas iniciales</label>
                <textarea
                  id="crop-notes-input"
                  rows={2}
                  placeholder="Detalles sobre germinación, condiciones iniciales, objetivos..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-surface border border-line text-ink text-sm focus:outline-hidden focus:border-ok-line focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-4 border-t border-line flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full text-sm font-semibold text-ink-muted hover:bg-track transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="crop-submit-btn"
              disabled={loading}
              className="px-6 py-2.5 rounded-full text-sm font-bold bg-brand-deep hover:bg-brand-deep text-white shadow-md transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>
                {loading
                  ? (cultivationToEdit ? 'Guardando...' : 'Creando cultivo...')
                  : (cultivationToEdit ? 'Guardar cambios' : 'Sumar plantas')}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
