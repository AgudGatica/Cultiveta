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
    <div className="cultiveta-modal-overlay animate-in fade-in">
      <div
        id="diary-note-modal-box"
        className="cultiveta-modal-container max-w-lg p-6 sm:p-8 my-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#EFE3CF] mb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-[#6C45C7]/15 text-[#6C45C7]">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[#29202F]">Anotá algo en el diario 📝</h2>
              <p className="text-xs text-[#6E5D77]">Registrá podas, trasplantes o cómo viste tus plantas</p>
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

        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#29202F] mb-1">Cultivo *</label>
              <select
                id="diary-crop-select"
                value={cultivationId}
                onChange={(e) => setCultivationId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-[#29202F] text-xs focus:outline-hidden focus:border-[#6C45C7] focus:bg-white cursor-pointer font-medium"
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
                id="diary-date-input"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#6C45C7] focus:bg-white font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#29202F] mb-1">Título de la nota (opcional)</label>
            <input
              id="diary-title-input"
              type="text"
              placeholder="ej. Poda apical, defoliación de bajos, etc."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#6C45C7] focus:bg-white font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#29202F] mb-1">Detalle de la nota *</label>
            <textarea
              id="diary-content-input"
              rows={4}
              required
              placeholder="Describí lo realizado o observado con el mayor detalle posible..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#6C45C7] focus:bg-white leading-relaxed font-medium"
            />
          </div>

          {/* Tags */}
          <div className="space-y-2 p-3.5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF]">
            <label className="block text-xs font-bold text-[#29202F]">Etiquetas</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#62B95B]/15 text-[#62B95B] border border-[#62B95B]/30 flex items-center gap-1.5"
                >
                  <Tag className="w-3 h-3 text-[#62B95B]" />
                  {t}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(t)}
                    className="hover:text-[#EB7864] cursor-pointer ml-0.5 text-sm leading-none"
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
                className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-[#EFE3CF] text-xs text-[#29202F] focus:outline-hidden focus:border-[#6C45C7]"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="px-3.5 py-1.5 rounded-xl bg-[#FAF2E1] hover:bg-[#ebdcc0] text-xs font-bold text-[#29202F] border border-[#EFE3CF] transition-colors cursor-pointer"
              >
                Agregar
              </button>
            </div>
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
              id="save-diary-note-btn"
              disabled={loading}
              className="cultiveta-btn-primary text-xs disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>Guardar nota</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
