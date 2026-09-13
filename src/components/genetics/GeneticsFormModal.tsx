import React, { useState, useEffect } from 'react';
import { X, Layers, Save, Tag } from 'lucide-react';
import { Genetics, PhotoperiodType, DominanceType } from '../../types';
import { geneticsService } from '../../services/geneticsService';

interface GeneticsFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  geneticsToEdit?: Genetics | null;
  onSaved: (genetics: Genetics) => void;
}

export const GeneticsFormModal: React.FC<GeneticsFormModalProps> = ({
  isOpen,
  onClose,
  userId,
  geneticsToEdit,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [seedBank, setSeedBank] = useState('');
  const [photoperiodType, setPhotoperiodType] = useState<PhotoperiodType>('Fotoperiódica');
  const [dominance, setDominance] = useState<DominanceType>('Híbrida');
  const [declaredFloweringDays, setDeclaredFloweringDays] = useState(60);
  const [thcPercentage, setThcPercentage] = useState<number | ''>('');
  const [cbdPercentage, setCbdPercentage] = useState<number | ''>('');
  const [terpenesInput, setTerpenesInput] = useState('');
  const [terpenes, setTerpenes] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (geneticsToEdit) {
      setName(geneticsToEdit.name);
      setSeedBank(geneticsToEdit.seedBank);
      setPhotoperiodType(geneticsToEdit.photoperiodType);
      setDominance(geneticsToEdit.dominance);
      setDeclaredFloweringDays(geneticsToEdit.declaredFloweringDays || 60);
      setThcPercentage(geneticsToEdit.thcPercentage || '');
      setCbdPercentage(geneticsToEdit.cbdPercentage || '');
      setTerpenes(geneticsToEdit.terpenes || []);
      setNotes(geneticsToEdit.notes || '');
    } else {
      setName('');
      setSeedBank('');
      setPhotoperiodType('Fotoperiódica');
      setDominance('Híbrida');
      setDeclaredFloweringDays(60);
      setThcPercentage('');
      setCbdPercentage('');
      setTerpenes(['Mirceno', 'Limoneno']);
      setNotes('');
    }
  }, [geneticsToEdit, isOpen]);

  const handleAddTerpene = () => {
    if (!terpenesInput.trim() || terpenes.includes(terpenesInput.trim())) return;
    setTerpenes([...terpenes, terpenesInput.trim()]);
    setTerpenesInput('');
  };

  const handleRemoveTerpene = (tToRemove: string) => {
    setTerpenes(terpenes.filter((t) => t !== tToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !seedBank.trim()) {
      setError('Nombre y Banco son obligatorios.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload = {
        userId,
        name: name.trim(),
        seedBank: seedBank.trim(),
        photoperiodType,
        dominance,
        declaredFloweringDays: Number(declaredFloweringDays) || 60,
        thcPercentage: thcPercentage !== '' ? Number(thcPercentage) : undefined,
        cbdPercentage: cbdPercentage !== '' ? Number(cbdPercentage) : undefined,
        terpenes: terpenes.length > 0 ? terpenes : undefined,
        notes: notes.trim() || undefined,
      };

      let result: Genetics;
      if (geneticsToEdit) {
        await geneticsService.updateGenetics(geneticsToEdit.id, payload);
        result = { ...geneticsToEdit, ...payload };
      } else {
        result = await geneticsService.createGenetics(payload);
      }

      onSaved(result);
      onClose();
    } catch (err: any) {
      console.error('Error saving genetics', err);
      setError(err?.message || 'No se pudo guardar la genética.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div
        id="genetics-form-modal"
        className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-stone-200 my-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-800">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">
                {geneticsToEdit ? 'Editar Genética' : 'Nueva Genética'} 🧬
              </h2>
              <p className="text-xs text-stone-500">Agrega variedades a tu biblioteca personal</p>
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

        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Nombre de la variedad *</label>
              <input
                id="genetics-name-input"
                type="text"
                required
                placeholder="ej. Gelato #33"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Banco / Breeder *</label>
              <input
                id="genetics-bank-input"
                type="text"
                required
                placeholder="ej. Barney's Farm"
                value={seedBank}
                onChange={(e) => setSeedBank(e.target.value)}
                className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Tipo de fotoperiodo</label>
              <select
                value={photoperiodType}
                onChange={(e) => setPhotoperiodType(e.target.value as PhotoperiodType)}
                className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white cursor-pointer"
              >
                <option value="Fotoperiódica">Fotoperiódica</option>
                <option value="Automática">Automática (Auto)</option>
                <option value="Regular">Regular</option>
                <option value="CBD">CBD</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Dominancia</label>
              <select
                value={dominance}
                onChange={(e) => setDominance(e.target.value as DominanceType)}
                className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white cursor-pointer"
              >
                <option value="Índica">Índica</option>
                <option value="Sativa">Sativa</option>
                <option value="Híbrida">Híbrida</option>
                <option value="Ruderalis">Ruderalis</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Floración (Días)</label>
              <input
                type="number"
                min="30"
                max="120"
                value={declaredFloweringDays}
                onChange={(e) => setDeclaredFloweringDays(parseInt(e.target.value) || 60)}
                className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">THC (%)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="40"
                placeholder="ej. 24"
                value={thcPercentage}
                onChange={(e) => setThcPercentage(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">CBD (%)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="30"
                placeholder="ej. 0.5"
                value={cbdPercentage}
                onChange={(e) => setCbdPercentage(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
              />
            </div>
          </div>

          {/* Terpenes */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-stone-700">Perfil de Terpenos</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {terpenes.map((t) => (
                <span
                  key={t}
                  className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 flex items-center gap-1.5"
                >
                  <Tag className="w-3 h-3" />
                  {t}
                  <button
                    type="button"
                    onClick={() => handleRemoveTerpene(t)}
                    className="hover:text-rose-600 cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="ej. Cariofileno, Linalool, Pineno"
                value={terpenesInput}
                onChange={(e) => setTerpenesInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTerpene();
                  }
                }}
                className="flex-1 px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
              />
              <button
                type="button"
                onClick={handleAddTerpene}
                className="px-3 py-1.5 rounded-xl bg-stone-200 hover:bg-stone-300 text-xs font-bold text-stone-700 cursor-pointer"
              >
                Agregar
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Notas de cultivo y requerimientos</label>
            <textarea
              rows={2}
              placeholder="Sensibilidad a nutrientes, estiramiento en pre-flora, resistencia a hongos..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
            />
          </div>

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
              id="save-genetics-btn"
              disabled={loading}
              className="px-6 py-2.5 rounded-full text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Guardar Genética</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
