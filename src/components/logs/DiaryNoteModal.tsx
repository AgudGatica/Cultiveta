import React, { useState } from 'react';
import { X, BookOpen, Save, Tag } from 'lucide-react';
import { Cultivation, DiaryEntry } from '../../types';
import { diaryService } from '../../services/diaryService';

interface DiaryNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  cultivations: Cultivation[];
  defaultCultivationId?: string;
  onNoteAdded: (note: DiaryEntry) => void;
}

export const DiaryNoteModal: React.FC<DiaryNoteModalProps> = ({
  isOpen,
  onClose,
  userId,
  cultivations,
  defaultCultivationId,
  onNoteAdded,
}) => {
  const [cultivationId, setCultivationId] = useState(defaultCultivationId || (cultivations[0]?.id || ''));
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(['Observación']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddTag = () => {
    if (!tagInput.trim() || tags.includes(tagInput.trim())) return;
    setTags([...tags, tagInput.trim()]);
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cultivationId) {
      setError('Por favor selecciona un cultivo.');
      return;
    }
    if (!content.trim()) {
      setError('El contenido de la nota no puede estar vacío.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const targetCrop = cultivations.find((c) => c.id === cultivationId);

      const newNote = await diaryService.addDiaryEntry({
        userId,
        cultivationId,
        date,
        title: title.trim() || undefined,
        content: content.trim(),
        tags: tags.length > 0 ? tags : undefined,
        isDemo: targetCrop?.isDemo,
      });

      onNoteAdded(newNote);
      onClose();
    } catch (err: any) {
      console.error('Error adding note', err);
      setError(err?.message || 'No se pudo guardar la nota.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div
        id="diary-note-modal-box"
        className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-stone-200 my-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-800">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">Nota de Diario 📝</h2>
              <p className="text-xs text-stone-500">Registra podas, trasplantes, observaciones o reflexiones</p>
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
              <label className="block text-xs font-bold text-stone-700 mb-1">Cultivo *</label>
              <select
                id="diary-crop-select"
                value={cultivationId}
                onChange={(e) => setCultivationId(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-xs focus:outline-hidden focus:border-emerald-500 focus:bg-white cursor-pointer"
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
                id="diary-date-input"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Título de la nota (opcional)</label>
            <input
              id="diary-title-input"
              type="text"
              placeholder="ej. Poda apical, defoliación de bajos, etc."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Detalle de la nota *</label>
            <textarea
              id="diary-content-input"
              rows={4}
              required
              placeholder="Describe lo realizado o observado con el mayor detalle posible..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white leading-relaxed"
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-stone-700">Etiquetas</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 flex items-center gap-1.5"
                >
                  <Tag className="w-3 h-3" />
                  {t}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(t)}
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
                placeholder="ej. Poda, Trasplante, Carencia, Plaga"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                className="flex-1 px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="px-3 py-1.5 rounded-xl bg-stone-200 hover:bg-stone-300 text-xs font-bold text-stone-700 transition-colors cursor-pointer"
              >
                Agregar
              </button>
            </div>
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
              id="save-diary-note-btn"
              disabled={loading}
              className="px-6 py-2.5 rounded-full text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Guardar Nota</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
