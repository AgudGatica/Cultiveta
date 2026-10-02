import React, { useState } from 'react';
import { X, Thermometer, Save, SunMedium, Loader2, AlertCircle, ChevronDown, Sparkles } from 'lucide-react';
import { Cultivation, EnvironmentRecord } from '../../types';
import { environmentService } from '../../services/environmentService';

interface EnvironmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  cultivations: Cultivation[];
  defaultCultivationId?: string;
  onRecordAdded: (record: EnvironmentRecord) => void;
}

export const EnvironmentModal: React.FC<EnvironmentModalProps> = ({
  isOpen,
  onClose,
  userId,
  cultivations,
  defaultCultivationId,
  onRecordAdded,
}) => {
  const [cultivationId, setCultivationId] = useState(defaultCultivationId || (cultivations[0]?.id || ''));
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(
    new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  );
  const [temperatureC, setTemperatureC] = useState<number | ''>(24.5);
  const [humidityPct, setHumidityPct] = useState<number | ''>(55);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [leafTempC, setLeafTempC] = useState<number | ''>('');
  const [ppfd, setPpfd] = useState<number | ''>('');
  const [co2Ppm, setCo2Ppm] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados para clima local en cultivos de exterior
  const [isFetchingWeather, setIsFetchingWeather] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const selectedCultivation = cultivations.find((c) => c.id === cultivationId);

  // Estimación visual rápida de VPD
  const estimatedVpd = React.useMemo(() => {
    if (typeof temperatureC !== 'number' || typeof humidityPct !== 'number') return null;
    const vps = 0.61078 * Math.exp((17.27 * temperatureC) / (temperatureC + 237.3));
    const vpa = vps * (humidityPct / 100);
    return Math.max(0, Number((vps - vpa).toFixed(2)));
  }, [temperatureC, humidityPct]);

  const fetchLocalWeather = async () => {
    setWeatherError(null);
    setIsFetchingWeather(true);

    const fetchFromCoords = async (lat: number, lon: number) => {
      try {
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m`
        );

        if (!response.ok) {
          throw new Error('No se pudo obtener la información meteorológica de Open-Meteo.');
        }

        const data = await response.json();
        if (data && data.current) {
          if (typeof data.current.temperature_2m === 'number') {
            setTemperatureC(Math.round(data.current.temperature_2m * 10) / 10);
          }
          if (typeof data.current.relative_humidity_2m === 'number') {
            setHumidityPct(Math.round(data.current.relative_humidity_2m));
          }
        } else {
          throw new Error('Datos incompletos de la estación meteorológica.');
        }
      } catch (err: any) {
        console.error('Error fetching weather data:', err);
        setWeatherError(err?.message || 'Error al obtener los datos climáticos.');
      } finally {
        setIsFetchingWeather(false);
      }
    };

    // Si el cultivo ya cuenta con coordenadas registradas, utilizarlas directamente
    if (
      selectedCultivation?.locationCoordinates &&
      typeof selectedCultivation.locationCoordinates.lat === 'number' &&
      typeof selectedCultivation.locationCoordinates.lon === 'number'
    ) {
      await fetchFromCoords(
        selectedCultivation.locationCoordinates.lat,
        selectedCultivation.locationCoordinates.lon
      );
      return;
    }

    if (!navigator.geolocation) {
      setIsFetchingWeather(false);
      setWeatherError('La geolocalización no está soportada por tu navegador.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        await fetchFromCoords(lat, lon);
      },
      (geoError) => {
        setIsFetchingWeather(false);
        switch (geoError.code) {
          case geoError.PERMISSION_DENIED:
            setWeatherError('Permiso de ubicación denegado en el navegador.');
            break;
          case geoError.POSITION_UNAVAILABLE:
            setWeatherError('Ubicación no disponible en este momento.');
            break;
          case geoError.TIMEOUT:
            setWeatherError('Tiempo de espera agotado al consultar la ubicación.');
            break;
          default:
            setWeatherError('No se pudo determinar tu ubicación para el clima.');
        }
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cultivationId) {
      setError('Por favor seleccioná un cultivo.');
      return;
    }
    if (temperatureC === '' || humidityPct === '') {
      setError('Temperatura y Humedad son campos obligatorios.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const targetCrop = selectedCultivation;

      const newRecord = await environmentService.addEnvironmentRecord({
        userId,
        cultivationId,
        date,
        time: time || undefined,
        temperatureC: Number(temperatureC),
        humidityPct: Number(humidityPct),
        leafTempC: leafTempC !== '' ? Number(leafTempC) : undefined,
        ppfd: ppfd !== '' ? Number(ppfd) : undefined,
        co2Ppm: co2Ppm !== '' ? Number(co2Ppm) : undefined,
        notes: notes.trim() || undefined,
        isDemo: targetCrop?.isDemo,
      });

      onRecordAdded(newRecord);
      onClose();
    } catch (err: any) {
      console.error('Error adding environment record', err);
      setError(err?.message || 'No se pudo guardar la medición ambiental.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cultiveta-modal-overlay animate-in fade-in">
      <div
        id="environment-modal-box"
        className="cultiveta-modal-container max-w-lg p-6 sm:p-8 my-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#EFE3CF] mb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-[#F3C843]/20 text-[#EB7864]">
              <Thermometer className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#29202F]">¿Cómo está el ambiente? 🌡️</h2>
              <p className="text-xs text-[#6E5D77]">Anotá temperatura y humedad para cuidar tus plantas</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#9887A2] hover:text-[#29202F] rounded-full hover:bg-[#FAF2E1] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3.5 rounded-2xl bg-[#EB7864]/10 border border-[#EB7864]/30 text-[#EB7864] text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          {/* Crop & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-3">
              <label className="block text-xs font-bold text-[#29202F] mb-1">Cultivo *</label>
              <select
                id="env-crop-select"
                value={cultivationId}
                onChange={(e) => setCultivationId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-[#29202F] text-sm focus:outline-hidden focus:border-[#6C45C7] focus:bg-white cursor-pointer font-medium"
              >
                {cultivations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.currentStage})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#29202F] mb-1">Fecha</label>
              <input
                id="env-date-input"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#6C45C7] focus:bg-white font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#29202F] mb-1">Hora</label>
              <input
                id="env-time-input"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#6C45C7] focus:bg-white font-medium"
              />
            </div>
          </div>

          {/* Botón condicional para cultivos Outdoor */}
          {selectedCultivation?.type === 'Outdoor' && (
            <div className="space-y-2">
              <button
                type="button"
                id="env-fetch-local-weather-btn"
                disabled={isFetchingWeather}
                onClick={fetchLocalWeather}
                className="w-full py-2.5 px-4 rounded-2xl bg-[#6C45C7]/10 hover:bg-[#6C45C7]/20 border border-[#6C45C7]/30 text-[#6C45C7] text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-2xs"
              >
                {isFetchingWeather ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#6C45C7]" />
                    <span>Obteniendo clima local...</span>
                  </>
                ) : (
                  <span>🌤️ Obtener clima local de estación</span>
                )}
              </button>

              {weatherError && (
                <div
                  id="env-weather-error-box"
                  className="p-3 rounded-2xl bg-[#EB7864]/10 border border-[#EB7864]/30 text-[#EB7864] text-xs font-medium flex items-start gap-2 animate-in fade-in"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-[#EB7864] mt-0.5" />
                  <span>{weatherError}</span>
                </div>
              )}
            </div>
          )}

          {/* Primera capa esencial: Temp y Humedad */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#29202F] mb-1">Temperatura (°C) *</label>
                <div className="relative">
                  <input
                    id="env-temp-input"
                    type="number"
                    step="0.1"
                    required
                    placeholder="ej. 24.5"
                    value={temperatureC}
                    onChange={(e) => setTemperatureC(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-[#EFE3CF] font-black text-base text-[#29202F] focus:outline-hidden focus:border-[#EB7864] focus:ring-1 focus:ring-[#EB7864]/30 pr-8"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-[#EB7864]">°C</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#29202F] mb-1">Humedad (% HR) *</label>
                <div className="relative">
                  <input
                    id="env-humidity-input"
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    required
                    placeholder="ej. 55"
                    value={humidityPct}
                    onChange={(e) => setHumidityPct(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-[#EFE3CF] font-black text-base text-[#29202F] focus:outline-hidden focus:border-[#6C45C7] focus:ring-1 focus:ring-[#6C45C7]/30 pr-8"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-[#6C45C7]">%</span>
                </div>
              </div>
            </div>

            {/* Live VPD preview badge */}
            {estimatedVpd !== null && (
              <div className="flex items-center justify-between pt-2 border-t border-[#EFE3CF] text-xs">
                <span className="text-[#6E5D77]">VPD estimado en aire:</span>
                <span className="font-extrabold text-[#6C45C7] bg-[#6C45C7]/10 px-2.5 py-0.5 rounded-full border border-[#6C45C7]/20">
                  {estimatedVpd} kPa
                </span>
              </div>
            )}
          </div>

          {/* Progressive Disclosure: Agregar más datos */}
          <div className="border border-[#EFE3CF] rounded-2xl overflow-hidden bg-[#FFFDF7]">
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="w-full p-4 flex items-center justify-between text-left text-xs font-bold text-[#6C45C7] hover:bg-[#FAF2E1] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <SunMedium className="w-4 h-4 text-[#6C45C7]" />
                <span>{showAdvanced ? 'Ocultar datos avanzados' : 'Agregar más datos (Temp foliar, PPFD, CO₂, notas)'}</span>
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  showAdvanced ? 'rotate-180' : ''
                }`}
              />
            </button>

            {showAdvanced && (
              <div className="p-4 pt-0 space-y-4 animate-in fade-in duration-200">
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#6E5D77] mb-1">Temp Foliar (°C)</label>
                    <input
                      id="env-leaf-temp-input"
                      type="number"
                      step="0.1"
                      placeholder="ej. 22.8"
                      value={leafTempC}
                      onChange={(e) => setLeafTempC(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-xl bg-white border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#6C45C7]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#6E5D77] mb-1">PPFD (µmol)</label>
                    <input
                      id="env-ppfd-input"
                      type="number"
                      step="10"
                      placeholder="ej. 650"
                      value={ppfd}
                      onChange={(e) => setPpfd(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-xl bg-white border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#6C45C7]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#6E5D77] mb-1">CO₂ (ppm)</label>
                    <input
                      id="env-co2-input"
                      type="number"
                      step="50"
                      placeholder="ej. 450"
                      value={co2Ppm}
                      onChange={(e) => setCo2Ppm(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-xl bg-white border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#6C45C7]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#29202F] mb-1">Notas del entorno</label>
                  <textarea
                    id="env-notes-input"
                    rows={2}
                    placeholder="Encendido de ventilador, extracción al 80%, calor exterior..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-2xl bg-white border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#6C45C7]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-[#EFE3CF] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="cultiveta-btn-secondary text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="save-environment-btn"
              disabled={loading}
              className="cultiveta-btn-primary text-xs disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>Guardar medición</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

