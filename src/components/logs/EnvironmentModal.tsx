import React, { useState } from 'react';
import { X, Thermometer, Save, Wind, SunMedium } from 'lucide-react';
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
  const [leafTempC, setLeafTempC] = useState<number | ''>('');
  const [ppfd, setPpfd] = useState<number | ''>('');
  const [co2Ppm, setCo2Ppm] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cultivationId) {
      setError('Por favor selecciona un cultivo.');
      return;
    }
    if (temperatureC === '' || humidityPct === '') {
      setError('Temperatura y Humedad son campos obligatorios.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const targetCrop = cultivations.find((c) => c.id === cultivationId);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div
        id="environment-modal-box"
        className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-stone-200 my-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-100 text-amber-800">
              <Thermometer className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">Registro Ambiental 🌡️</h2>
              <p className="text-xs text-stone-500">Anota temperatura, humedad, VPD y radiación PPFD</p>
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

        <form onSubmit={handleSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          {/* Crop & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-3">
              <label className="block text-xs font-bold text-stone-700 mb-1">Cultivo *</label>
              <select
                id="env-crop-select"
                value={cultivationId}
                onChange={(e) => setCultivationId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-sm focus:outline-hidden focus:border-amber-500 focus:bg-white cursor-pointer"
              >
                {cultivations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.currentStage})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Fecha</label>
              <input
                id="env-date-input"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-amber-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Hora</label>
              <input
                id="env-time-input"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-amber-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Temp and Humidity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Temperatura (°C) *</label>
              <input
                id="env-temp-input"
                type="number"
                step="0.1"
                required
                placeholder="ej. 24.5"
                value={temperatureC}
                onChange={(e) => setTemperatureC(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="w-full px-4 py-2.5 rounded-2xl bg-amber-50/40 border border-amber-300 font-bold text-sm text-stone-900 focus:outline-hidden focus:border-amber-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Humedad Relativa (% HR) *</label>
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
                className="w-full px-4 py-2.5 rounded-2xl bg-cyan-50/40 border border-cyan-300 font-bold text-sm text-stone-900 focus:outline-hidden focus:border-cyan-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Advanced / Optional (Leaf temp, PPFD, CO2) */}
          <div className="p-4 rounded-2xl bg-stone-50/80 border border-stone-200/80 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
              <SunMedium className="w-3.5 h-3.5" />
              Métricas Avanzadas (Opcional)
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Temp Foliar (°C)</label>
                <input
                  id="env-leaf-temp-input"
                  type="number"
                  step="0.1"
                  placeholder="ej. 22.8"
                  value={leafTempC}
                  onChange={(e) => setLeafTempC(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">PPFD (µmol/m²s)</label>
                <input
                  id="env-ppfd-input"
                  type="number"
                  step="10"
                  placeholder="ej. 650"
                  value={ppfd}
                  onChange={(e) => setPpfd(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">CO₂ (ppm)</label>
                <input
                  id="env-co2-input"
                  type="number"
                  step="50"
                  placeholder="ej. 450"
                  value={co2Ppm}
                  onChange={(e) => setCo2Ppm(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Notas del entorno</label>
            <textarea
              id="env-notes-input"
              rows={2}
              placeholder="Encendido de ventilador, extracción al 80%, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-amber-500 focus:bg-white"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-full text-xs font-semibold text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="save-environment-btn"
              disabled={loading}
              className="px-6 py-2.5 rounded-full text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Guardar Ambiente</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
