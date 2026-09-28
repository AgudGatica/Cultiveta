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
} from 'lucide-react';
import {
  Cultivation,
  CultivationType,
  PhotoperiodType,
  PotType,
  Genetics,
  CultivationGeneticsItem,
  EnvironmentalAlertThresholds,
} from '../../types';
import { cultivationService } from '../../services/cultivationService';
import { photoService } from '../../services/photoService';
import { auth } from '../../firebase/config';
import { GENETICS_DATABASE } from '../../data/predefinedGenetics';

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
}

export const CultivationFormModal: React.FC<CultivationFormModalProps> = ({
  isOpen,
  onClose,
  userId,
  cultivationToEdit,
  initialGenetics,
  geneticsList,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<CultivationType>('Indoor');
  const [plantCount, setPlantCount] = useState(1);
  const [geneticsEntries, setGeneticsEntries] = useState<FormGeneticsEntry[]>([]);
  const [currentStage, setCurrentStage] = useState('Vegetativo');
  const [substrateType, setSubstrateType] = useState('Turba / Perlita / Humus');
  const [potVolumeLiters, setPotVolumeLiters] = useState(11);
  const [potType, setPotType] = useState<PotType>('Geotextil');
  const [lightingType, setLightingType] = useState('LED Quantum Board');
  const [lightingWatts, setLightingWatts] = useState<number | ''>(240);
  const [lightHours, setLightHours] = useState<number | ''>(18);
  const [locationCoordinates, setLocationCoordinates] = useState<{ lat: number; lon: number } | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [coverPhotoUrl, setCoverPhotoUrl] = useState('');
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
      setStartDate(cultivationToEdit.startDate);
      setType(cultivationToEdit.type);
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
        const isFlora = (cultivationToEdit.currentStage || '').toLowerCase().includes('flor');
        setEnableCustomThresholds(false);
        setTempMinThreshold(11);
        setTempMaxThreshold(35);
        setHumidityMinThreshold(25);
        setHumidityMaxThreshold(isFlora ? 60 : 75);
      }
    } else {
      setName('');
      setStartDate(new Date().toISOString().split('T')[0]);
      setType('Indoor');
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
          photoperiodType: parsePhotoperiod(selected.name, selected.dominance),
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
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setLoading(true);
      const photoId = 'cover_' + Date.now();
      const ext = file.name.split('.').pop() || 'jpg';
      const result = await photoService.uploadPhotoFile(userId, 'covers', photoId, file, ext);
      setCoverPhotoUrl(result.downloadUrl);
    } catch {
      setError('Error al procesar la fotografía.');
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
            name: g.name.trim() || `Variedad ${idx + 1}`,
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

      const isStageChanged = cultivationToEdit && cultivationToEdit.currentStage !== currentStage;
      const todayStr = new Date().toISOString().split('T')[0];
      const stageStartDate = isStageChanged
        ? todayStr
        : (cultivationToEdit?.stageStartDate || startDate || todayStr);

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
        const hoursNum = Math.min(24, Math.max(0, Number(lightHours)));
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
        startDate: startDate || todayStr,
        type: type || 'Indoor',
        plantCount: Math.max(1, Number(plantCount) || totalPlantsFromGenetics || 1),
        photoperiodType: primaryGen?.photoperiodType || 'Fotoperiódica',
        declaredFloweringWeeks: calculatedFloweringWeeks,
        currentStage: currentStage || 'Vegetativo',
        stageStartDate,
        substrate: {
          type: substrateType || 'Turba / Perlita / Humus',
          potVolumeLiters: Number(potVolumeLiters) || 11,
          potType: potType || 'Geotextil',
        },
        lighting: lightingPayload,
        status: cultivationToEdit?.status || 'ESTABLE',
        isFinished: cultivationToEdit?.isFinished || false,
      };

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

      if (currentStage === 'Floración' || currentStage.toLowerCase().includes('flor')) {
        cultivationPayload.floweringStartDate =
          cultivationToEdit?.floweringStartDate || (isStageChanged ? todayStr : startDate);
      }

      // Sync stagesTimeline if present on edit
      if (cultivationToEdit?.stagesTimeline && cultivationToEdit.stagesTimeline.length > 0) {
        const normSelected = (currentStage || '').toLowerCase().trim();
        const activeIdx = cultivationToEdit.stagesTimeline.findIndex(
          (s) => s.name.toLowerCase().trim() === normSelected
        );
        cultivationPayload.stagesTimeline = cultivationToEdit.stagesTimeline.map((st, idx) => ({
          ...st,
          isCompleted: activeIdx !== -1 && idx < activeIdx,
        }));
      }

      if (coverPhotoUrl) {
        cultivationPayload.coverPhotoUrl = coverPhotoUrl;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div
        id="cultivation-form-modal"
        className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-stone-200 my-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-100 text-emerald-700">
              <Sprout className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">
                {cultivationToEdit ? 'Editar Cultivo' : 'Crear Nuevo Cultivo'}
              </h2>
              <p className="text-xs text-stone-500">Registra un nuevo ciclo de cultivo independiente</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-700 rounded-full hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
          {/* Section 1: Basic Info */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
              <Sprout className="w-3.5 h-3.5" />
              1. Datos Principales
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Nombre del cultivo *</label>
                <input
                  id="crop-name-input"
                  type="text"
                  required
                  placeholder="ej. Carpa Principal #02"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-sm focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Fecha de inicio *</label>
                <input
                  id="crop-start-date-input"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-sm focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Tipo de entorno</label>
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
                  className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-sm focus:outline-hidden focus:border-emerald-500 focus:bg-white cursor-pointer"
                >
                  <option value="Indoor">Indoor (Carpa / Sala)</option>
                  <option value="Outdoor">Outdoor (Exterior)</option>
                  <option value="Invernadero">Invernadero</option>
                </select>

                {(type === 'Outdoor' || type === 'Invernadero') && (
                  <div
                    id="crop-environment-vpd-warning"
                    className="mt-2.5 flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50/90 border border-amber-200/80 text-amber-900 text-xs leading-relaxed"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      En cultivos de exterior o invernadero sin ambiente controlado, el cálculo de VPD (Déficit de Presión de Vapor) y el control de variables climáticas no estarán disponibles.
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Cantidad total de plantas
                  {geneticsEntries.length > 1 && (
                    <span className="text-[11px] font-normal text-emerald-700 ml-1.5">
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
                  className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-sm focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Etapa actual / inicial</label>
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
                  className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-sm focus:outline-hidden focus:border-emerald-500 focus:bg-white cursor-pointer"
                >
                  <option value="Germinación">🌱 Germinación</option>
                  <option value="Plántula">🌿 Plántula</option>
                  <option value="Vegetativo">🌳 Vegetativo (18/6)</option>
                  <option value="Floración">🌸 Floración (12/12)</option>
                  <option value="Lavado / Secado">🍂 Lavado / Cosecha</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Genetics */}
          <div className="space-y-4 pt-2 border-t border-stone-100">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                2. Genética y Variedades
              </h3>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                {geneticsEntries.length} {geneticsEntries.length === 1 ? 'variedad' : 'variedades'}
              </span>
            </div>

            <p className="text-xs text-stone-500">
              Puedes cultivar una o varias genéticas en el mismo espacio. Configura los datos de cada variedad o selecciónalas de tu biblioteca.
            </p>

            <div className="space-y-4">
              {geneticsEntries.map((entry, index) => (
                <div
                  key={entry.id}
                  className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3 relative group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-700 text-white font-bold text-xs flex items-center justify-center">
                        {index + 1}
                      </span>
                      <span className="text-xs font-bold text-stone-800">
                        Variedad #{index + 1}
                        {entry.name ? `: ${entry.name}` : ''}
                      </span>
                      {entry.seedBank && (
                        <span className="text-[11px] text-stone-500 font-medium">({entry.seedBank})</span>
                      )}
                    </div>

                    {geneticsEntries.length > 1 && (
                      <button
                        type="button"
                        id={`btn-remove-genetics-${index}`}
                        onClick={() => handleRemoveGeneticsEntry(entry.id)}
                        className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Quitar esta genética del cultivo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-violet-900 mb-1">
                        Cargar variedad de la base de datos predefinida
                      </label>
                      <select
                        id={`crop-predefined-genetics-selector-${index}`}
                        value={entry.seedBank && entry.name ? `${entry.seedBank}:::${entry.name}` : ''}
                        onChange={(e) => handleSelectPredefinedGenetics(entry.id, e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-violet-50/50 border border-violet-200 text-violet-900 text-xs font-medium focus:outline-hidden focus:border-violet-500 focus:ring-1 focus:ring-violet-400 cursor-pointer shadow-2xs"
                      >
                        <option value="">Seleccionar de base de datos (100 variedades / 20 bancos)...</option>
                        {Object.entries(PREDEFINED_BY_BANK).map(([bank, strains]) => (
                          <optgroup key={bank} label={bank}>
                            {strains.map((g) => (
                              <option key={`${g.seedBank}:::${g.name}`} value={`${g.seedBank}:::${g.name}`}>
                                {g.name} — {g.dominance} ({g.floweringDays} días)
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    {geneticsList.length > 0 && (
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-stone-600 mb-1">
                          Cargar desde biblioteca guardada
                        </label>
                        <select
                          id={`crop-genetics-lib-selector-${index}`}
                          value={entry.geneticsId || ''}
                          onChange={(e) => handleSelectGeneticsFromLibrary(entry.id, e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 text-stone-800 text-xs font-medium focus:outline-hidden focus:border-emerald-500 cursor-pointer shadow-2xs"
                        >
                          <option value="">Elegir de mi biblioteca de genéticas...</option>
                          {geneticsList.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name} ({g.seedBank}) · {g.photoperiodType}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">
                        Nombre de la variedad
                      </label>
                      <input
                        id={`crop-genetics-name-${index}`}
                        type="text"
                        placeholder="ej. Amnesia Haze, Gorilla Cookies"
                        value={entry.name}
                        onChange={(e) => handleUpdateGeneticsEntry(entry.id, 'name', e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 text-stone-800 text-xs focus:outline-hidden focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">Banco / Breeder</label>
                      <input
                        id={`crop-genetics-seedbank-${index}`}
                        type="text"
                        placeholder="ej. Barney’s Farm, RQS, Fast Buds"
                        value={entry.seedBank}
                        onChange={(e) => handleUpdateGeneticsEntry(entry.id, 'seedBank', e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 text-stone-800 text-xs focus:outline-hidden focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">Tipo de fotoperiodo</label>
                      <select
                        id={`crop-genetics-photoperiod-${index}`}
                        value={entry.photoperiodType}
                        onChange={(e) =>
                          handleUpdateGeneticsEntry(entry.id, 'photoperiodType', e.target.value as PhotoperiodType)
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 text-stone-800 text-xs focus:outline-hidden focus:border-emerald-500 cursor-pointer"
                      >
                        <option value="Fotoperiódica">Fotoperiódica (Feminizada)</option>
                        <option value="Automática">Automática (Auto)</option>
                        <option value="Regular">Regular</option>
                        <option value="CBD">CBD / Medicinal</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">Floración estimada (semanas)</label>
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
                        className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 text-stone-800 text-xs focus:outline-hidden focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">Plantas de esta variedad</label>
                      <input
                        id={`crop-genetics-plants-${index}`}
                        type="number"
                        min="1"
                        max="100"
                        value={entry.plantCount}
                        onChange={(e) =>
                          handleGeneticsPlantCountChange(entry.id, parseInt(e.target.value) || 1)
                        }
                        className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 text-stone-800 text-xs focus:outline-hidden focus:border-emerald-500"
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
                className="w-full py-2.5 px-4 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-dashed border-emerald-300 text-emerald-800 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-2xs"
              >
                <Plus className="w-4 h-4 text-emerald-700" />
                <span>+ Agregar otra genética</span>
              </button>
            </div>
          </div>

          {/* Section 3: Substrate and Setup */}
          <div className="space-y-4 pt-2 border-t border-stone-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5" />
              3. Sustrato e Iluminación
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Tipo de sustrato</label>
                <input
                  id="crop-substrate-type-input"
                  type="text"
                  placeholder="ej. Turba/Perlita, Coco, Living Soil"
                  value={substrateType}
                  onChange={(e) => setSubstrateType(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-sm focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Volumen de maceta (Litros)</label>
                <input
                  id="crop-pot-volume-input"
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={potVolumeLiters}
                  onChange={(e) => setPotVolumeLiters(parseFloat(e.target.value) || 11)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-sm focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Tipo de maceta</label>
                <select
                  id="crop-pot-type-select"
                  value={potType}
                  onChange={(e) => setPotType(e.target.value as PotType)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-sm focus:outline-hidden focus:border-emerald-500 focus:bg-white cursor-pointer"
                >
                  <option value="Geotextil">Geotextil (Tela)</option>
                  <option value="Plástico">Plástico tradicional</option>
                  <option value="Airpot">Airpot (Guías de raíz)</option>
                  <option value="Tierra madre">Tierra madre directa</option>
                  <option value="Hidropónico">Hidropónico / DWC</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  {(type === 'Outdoor' || type === 'Invernadero') ? 'Apoyo lumínico (Opcional)' : 'Iluminación'}
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
                  className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-sm focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
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
                  className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-sm focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-stone-700">
                    {(type === 'Outdoor' || type === 'Invernadero')
                      ? 'Horas de luz diarias (Opcional)'
                      : 'Horas de luz diarias'}
                  </label>
                  {lightHours !== '' && Number(lightHours) > 0 && (
                    <span className="text-[11px] font-bold text-amber-700">
                      {lightHours}h luz / {Math.max(0, 24 - Number(lightHours))}h osc.
                    </span>
                  )}
                </div>
                <input
                  id="crop-light-hours-input"
                  type="number"
                  min="0"
                  max="24"
                  placeholder={(type === 'Outdoor' || type === 'Invernadero') ? 'Opcional (horas sol)' : '18'}
                  value={lightHours}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLightHours(val === '' ? '' : parseInt(val) || 0);
                  }}
                  className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-sm focus:outline-hidden focus:border-emerald-500 focus:bg-white font-bold"
                />

                {/* Quick Presets for Light Hours */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setLightHours(12)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                      Number(lightHours) === 12
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'bg-stone-100 hover:bg-amber-50 text-stone-700 border border-stone-200'
                    }`}
                  >
                    12/12 Flora
                  </button>

                  <button
                    type="button"
                    onClick={() => setLightHours(13)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                      Number(lightHours) === 13
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-stone-100 hover:bg-amber-50 text-stone-700 border border-stone-200'
                    }`}
                    title="13 horas de luz y 11 de oscuridad: potencia fotosíntesis y engorde"
                  >
                    13/11 Luz extra
                  </button>

                  <button
                    type="button"
                    onClick={() => setLightHours(11)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                      Number(lightHours) === 11
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-stone-100 hover:bg-indigo-50 text-stone-700 border border-stone-200'
                    }`}
                    title="11 horas de luz y 13 de oscuridad: maduración rápida"
                  >
                    11/13 Rápida
                  </button>

                  <button
                    type="button"
                    onClick={() => setLightHours(18)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                      Number(lightHours) === 18
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-stone-100 hover:bg-emerald-50 text-stone-700 border border-stone-200'
                    }`}
                  >
                    18/6 Vega
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Critical Environmental Alert Thresholds */}
          <div className="space-y-4 pt-2 border-t border-stone-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                  4. Umbrales Críticos de Temperatura y Humedad (Alertas IA)
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Configura los límites térmicos y de humedad que el cron job y Cultiveta IA usarán para disparar alertas inmediatas.
                </p>
              </div>

              {/* Custom Thresholds Toggle Switch */}
              <label className="inline-flex items-center gap-2 cursor-pointer self-start sm:self-auto bg-stone-50 hover:bg-stone-100 px-3 py-1.5 rounded-2xl border border-stone-200 transition-colors">
                <input
                  type="checkbox"
                  id="crop-enable-custom-thresholds"
                  checked={enableCustomThresholds}
                  onChange={(e) => setEnableCustomThresholds(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded-md border-stone-300 focus:ring-emerald-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-stone-700">
                  {enableCustomThresholds ? 'Umbrales Personalizados Activos' : 'Usar Umbrales por Defecto'}
                </span>
              </label>
            </div>

            {/* Quick Presets Bar */}
            <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200/80 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-stone-600 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
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
                className="px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-white hover:bg-rose-50 hover:text-rose-700 text-stone-700 border border-stone-200 shadow-2xs transition-colors cursor-pointer"
              >
                🌸 Floración Segura (Max 58% HR)
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
                className="px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-white hover:bg-emerald-50 hover:text-emerald-700 text-stone-700 border border-stone-200 shadow-2xs transition-colors cursor-pointer"
              >
                🌿 Vegetativo Óptimo
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
                className="px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-white hover:bg-cyan-50 hover:text-cyan-700 text-stone-700 border border-stone-200 shadow-2xs transition-colors cursor-pointer"
              >
                🌱 Plántula / Esquejes
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
                className="px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-stone-200 hover:bg-stone-300 text-stone-700 transition-colors cursor-pointer ml-auto"
              >
                🔄 Valores Estándar (11-35°C | 25-75%)
              </button>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Temp Min */}
              <div
                className={`p-3.5 rounded-2xl border transition-all ${
                  enableCustomThresholds
                    ? 'bg-white border-blue-200 shadow-2xs'
                    : 'bg-stone-50/70 border-stone-200 opacity-80'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                    <Thermometer className="w-3.5 h-3.5 text-blue-500" />
                    Temp Mínima Crítica
                  </label>
                  <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
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
                  className="w-full px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-stone-800 text-sm font-bold font-mono focus:outline-hidden focus:border-blue-500"
                  placeholder="11"
                />
                <p className="text-[10px] text-stone-500 mt-1.5 leading-snug">
                  Alerta si la temperatura desciende por debajo (peligro de shock radicular).
                </p>
              </div>

              {/* Temp Max */}
              <div
                className={`p-3.5 rounded-2xl border transition-all ${
                  enableCustomThresholds
                    ? 'bg-white border-rose-200 shadow-2xs'
                    : 'bg-stone-50/70 border-stone-200 opacity-80'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                    <Thermometer className="w-3.5 h-3.5 text-rose-500" />
                    Temp Máxima Crítica
                  </label>
                  <span className="text-[10px] font-mono font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
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
                  className="w-full px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-stone-800 text-sm font-bold font-mono focus:outline-hidden focus:border-rose-500"
                  placeholder="35"
                />
                <p className="text-[10px] text-stone-500 mt-1.5 leading-snug">
                  Alerta si la temperatura supera este valor (estrés térmico y cierre estomático).
                </p>
              </div>

              {/* Humidity Min */}
              <div
                className={`p-3.5 rounded-2xl border transition-all ${
                  enableCustomThresholds
                    ? 'bg-white border-amber-200 shadow-2xs'
                    : 'bg-stone-50/70 border-stone-200 opacity-80'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                    <Droplets className="w-3.5 h-3.5 text-amber-500" />
                    Humedad Mínima
                  </label>
                  <span className="text-[10px] font-mono font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
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
                  className="w-full px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-stone-800 text-sm font-bold font-mono focus:outline-hidden focus:border-amber-500"
                  placeholder="25"
                />
                <p className="text-[10px] text-stone-500 mt-1.5 leading-snug">
                  Alerta por aire muy seco (deshidratación acelerada y quemaduras foliares).
                </p>
              </div>

              {/* Humidity Max */}
              <div
                className={`p-3.5 rounded-2xl border transition-all ${
                  enableCustomThresholds
                    ? 'bg-white border-purple-200 shadow-2xs'
                    : 'bg-stone-50/70 border-stone-200 opacity-80'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                    <Droplets className="w-3.5 h-3.5 text-purple-500" />
                    Humedad Máxima Crítica
                  </label>
                  <span className="text-[10px] font-mono font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
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
                  className="w-full px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-stone-800 text-sm font-bold font-mono focus:outline-hidden focus:border-purple-500"
                  placeholder="75"
                />
                <p className="text-[10px] text-stone-500 mt-1.5 leading-snug">
                  Alerta por humedad excesiva (peligro inminente de botrytis y hongos en cogollos).
                </p>
              </div>
            </div>

            {/* Active Threshold Summary Banner */}
            <div className="p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-950">
              <div className="flex items-center gap-2">
                <BellRing className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Rango seguro activo:</strong> Temperatura entre{' '}
                  <span className="font-mono font-bold">{tempMinThreshold}°C y {tempMaxThreshold}°C</span> · Humedad entre{' '}
                  <span className="font-mono font-bold">{humidityMinThreshold}% y {humidityMaxThreshold}% HR</span>.
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 self-start sm:self-auto shrink-0">
                {enableCustomThresholds ? 'Personalizado Activo' : 'Por Defecto'}
              </span>
            </div>
          </div>

          {/* Section 5: Photo & Notes */}
          <div className="space-y-4 pt-2 border-t border-stone-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" />
              5. Foto de Portada y Notas
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Foto de portada (opcional)</label>
                <div className="flex items-center gap-3">
                  {coverPhotoUrl && (
                    <img
                      src={coverPhotoUrl}
                      alt="Preview"
                      className="w-14 h-14 rounded-2xl object-cover border border-stone-200 shrink-0"
                    />
                  )}
                  <input
                    id="crop-cover-photo-file-input"
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="text-xs text-stone-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-100 file:text-emerald-800 hover:file:bg-emerald-200 cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Notas iniciales</label>
                <textarea
                  id="crop-notes-input"
                  rows={2}
                  placeholder="Detalles sobre germinación, condiciones iniciales, objetivos..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-sm focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full text-sm font-semibold text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="crop-submit-btn"
              disabled={loading}
              className="px-6 py-2.5 rounded-full text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>
                {loading
                  ? (cultivationToEdit ? 'Guardando...' : 'Creando cultivo...')
                  : (cultivationToEdit ? 'Guardar Cambios' : 'Crear Cultivo')}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
