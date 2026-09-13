import React, { useState, useEffect } from 'react';
import { X, Sprout, Calendar, Sun, Layers, Lightbulb, Camera, Save, Plus, Trash2 } from 'lucide-react';
import { Cultivation, CultivationType, PhotoperiodType, PotType, Genetics, CultivationGeneticsItem } from '../../types';
import { cultivationService } from '../../services/cultivationService';
import { photoService } from '../../services/photoService';
import { auth } from '../../firebase/config';

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
  const [lightingWatts, setLightingWatts] = useState(240);
  const [lightHours, setLightHours] = useState(18);
  const [notes, setNotes] = useState('');
  const [coverPhotoUrl, setCoverPhotoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cultivationToEdit) {
      setName(cultivationToEdit.name);
      setStartDate(cultivationToEdit.startDate);
      setType(cultivationToEdit.type);
      setPlantCount(cultivationToEdit.plantCount || 1);

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
      setLightingType(cultivationToEdit.lighting?.type || 'LED Quantum Board');
      setLightingWatts(cultivationToEdit.lighting?.usedWatts || 240);
      setLightHours(cultivationToEdit.lighting?.photoperiodHoursLight || 18);
      setNotes(cultivationToEdit.notes || '');
      setCoverPhotoUrl(cultivationToEdit.coverPhotoUrl || '');
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
      const url = await photoService.uploadPhotoFile(userId, 'temp_cover', file);
      setCoverPhotoUrl(url);
    } catch (err: any) {
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
        lighting: {
          type: lightingType || 'LED Quantum Board',
          photoperiodHoursLight: Number(lightHours) || 18,
          photoperiodHoursDark: 24 - (Number(lightHours) || 18),
        },
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

      if (lightingWatts && Number(lightingWatts) > 0) {
        cultivationPayload.lighting.usedWatts = Number(lightingWatts);
      }

      if (coverPhotoUrl) {
        cultivationPayload.coverPhotoUrl = coverPhotoUrl;
      }

      if (notes && notes.trim()) {
        cultivationPayload.notes = notes.trim();
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
                  onChange={(e) => setType(e.target.value as CultivationType)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-sm focus:outline-hidden focus:border-emerald-500 focus:bg-white cursor-pointer"
                >
                  <option value="Indoor">Indoor (Carpa / Sala)</option>
                  <option value="Outdoor">Outdoor (Exterior)</option>
                  <option value="Invernadero">Invernadero</option>
                </select>
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
                <label className="block text-xs font-bold text-stone-700 mb-1">Iluminación</label>
                <input
                  id="crop-lighting-type-input"
                  type="text"
                  placeholder="ej. LED QB LM301H, Sodio 400W"
                  value={lightingType}
                  onChange={(e) => setLightingType(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-sm focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Potencia utilizada (Watts)</label>
                <input
                  id="crop-lighting-watts-input"
                  type="number"
                  min="0"
                  max="5000"
                  value={lightingWatts}
                  onChange={(e) => setLightingWatts(parseInt(e.target.value) || 0)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-sm focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-stone-700">Horas de luz diarias</label>
                  <span className="text-[11px] font-bold text-amber-700">
                    {lightHours}h luz / {Math.max(0, 24 - lightHours)}h osc.
                  </span>
                </div>
                <input
                  id="crop-light-hours-input"
                  type="number"
                  min="0"
                  max="24"
                  value={lightHours}
                  onChange={(e) => setLightHours(parseInt(e.target.value) || 0)}
                  className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-sm focus:outline-hidden focus:border-emerald-500 focus:bg-white font-bold"
                />

                {/* Quick Presets for Light Hours */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setLightHours(12)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                      lightHours === 12
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
                      lightHours === 13
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
                      lightHours === 11
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
                      lightHours === 18
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

          {/* Section 4: Photo & Notes */}
          <div className="space-y-4 pt-2 border-t border-stone-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" />
              4. Foto de Portada y Notas
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
