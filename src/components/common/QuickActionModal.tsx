import React, { useState } from 'react';
import {
  X,
  Droplets,
  Camera,
  BookOpen,
  Sparkles,
  Thermometer,
  FlaskConical,
  ChevronDown,
  Plus,
} from 'lucide-react';
import { Cultivation } from '../../types';

export type QuickActionType =
  | 'watering'
  | 'environment'
  | 'photo'
  | 'note'
  | 'ai-analyze'
  | 'new-crop'
  | 'measurement';

interface QuickActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  cultivations?: Cultivation[];
  onSelectAction?: (action: QuickActionType) => void;
  onOpenWatering?: () => void;
  onOpenEnvironment?: () => void;
  onOpenPhoto?: () => void;
  onOpenDiary?: () => void;
  onOpenNewCultivation?: () => void;
  onOpenAIAssistant?: () => void;
  onOpenMeasurement?: () => void;
}

export const QuickActionModal: React.FC<QuickActionModalProps> = ({
  isOpen,
  onClose,
  cultivations = [],
  onSelectAction,
  onOpenWatering,
  onOpenEnvironment,
  onOpenPhoto,
  onOpenDiary,
  onOpenNewCultivation,
  onOpenAIAssistant,
  onOpenMeasurement,
}) => {
  const [showMoreActions, setShowMoreActions] = useState(false);

  if (!isOpen) return null;

  const handleActionClick = (actionId: QuickActionType) => {
    onClose();

    if (typeof onSelectAction === 'function') {
      onSelectAction(actionId);
      return;
    }

    switch (actionId) {
      case 'watering':
        onOpenWatering?.();
        break;
      case 'environment':
        onOpenEnvironment?.();
        break;
      case 'photo':
        onOpenPhoto?.();
        break;
      case 'note':
        onOpenDiary?.();
        break;
      case 'new-crop':
        onOpenNewCultivation?.();
        break;
      case 'ai-analyze':
        onOpenAIAssistant?.();
        break;
      case 'measurement':
        if (onOpenMeasurement) {
          onOpenMeasurement();
        } else if (onOpenWatering) {
          onOpenWatering();
        }
        break;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#29202F]/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full sm:max-w-md bg-[#FFFDF7] rounded-t-[32px] sm:rounded-[32px] border border-[#EFE3CF] shadow-2xl p-6 sm:p-7 space-y-5 animate-in slide-in-from-bottom duration-250 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del modal */}
        <div className="flex items-center justify-between pb-3 border-b border-[#EFE3CF]">
          <div>
            <h2 className="text-lg font-extrabold text-[#29202F]">
              ¿Qué anotamos hoy? 🌱
            </h2>
            <p className="text-xs text-[#6E5D77] mt-0.5">
              Registro rápido en un par de toques
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[#FAF2E1] text-[#6E5D77] hover:text-[#29202F] transition-colors cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primera Capa: 4 Acciones Cotidianas Esenciales */}
        <div className="grid grid-cols-2 gap-3">
          {/* 1. Regué */}
          <button
            type="button"
            id="quick-action-watering"
            onClick={() => handleActionClick('watering')}
            className="flex flex-col items-start p-4 rounded-2xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] transition-all hover:scale-[1.02] active:scale-[0.98] text-left cursor-pointer shadow-xs group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#62B95B]/15 text-[#62B95B] flex items-center justify-center mb-2.5 group-hover:bg-[#62B95B] group-hover:text-white transition-colors">
              <Droplets className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="text-sm font-bold text-[#29202F]">💧 Regué</span>
            <span className="text-[11px] text-[#6E5D77] mt-0.5 line-clamp-1">
              Agua, pH, EC y fertis
            </span>
          </button>

          {/* 2. Foto */}
          <button
            type="button"
            id="quick-action-photo"
            onClick={() => handleActionClick('photo')}
            className="flex flex-col items-start p-4 rounded-2xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] transition-all hover:scale-[1.02] active:scale-[0.98] text-left cursor-pointer shadow-xs group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#6C45C7]/15 text-[#6C45C7] flex items-center justify-center mb-2.5 group-hover:bg-[#6C45C7] group-hover:text-white transition-colors">
              <Camera className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="text-sm font-bold text-[#29202F]">📷 Foto</span>
            <span className="text-[11px] text-[#6E5D77] mt-0.5 line-clamp-1">
              Seguimiento visual
            </span>
          </button>

          {/* 3. Anoté algo */}
          <button
            type="button"
            id="quick-action-note"
            onClick={() => handleActionClick('note')}
            className="flex flex-col items-start p-4 rounded-2xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] transition-all hover:scale-[1.02] active:scale-[0.98] text-left cursor-pointer shadow-xs group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#F3C843]/25 text-[#29202F] flex items-center justify-center mb-2.5 group-hover:bg-[#F3C843] transition-colors">
              <BookOpen className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="text-sm font-bold text-[#29202F]">📝 Anoté algo</span>
            <span className="text-[11px] text-[#6E5D77] mt-0.5 line-clamp-1">
              Poda, plaga, cambio de luz
            </span>
          </button>

          {/* 4. Preguntale a Cultiveta */}
          <button
            type="button"
            id="quick-action-ai"
            onClick={() => handleActionClick('ai-analyze')}
            className="flex flex-col items-start p-4 rounded-2xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] transition-all hover:scale-[1.02] active:scale-[0.98] text-left cursor-pointer shadow-xs group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#6C45C7]/15 text-[#6C45C7] flex items-center justify-center mb-2.5 group-hover:bg-[#6C45C7] group-hover:text-white transition-colors">
              <Sparkles className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="text-sm font-bold text-[#29202F]">✨ Preguntale a Cultiveta</span>
            <span className="text-[11px] text-[#6E5D77] mt-0.5 line-clamp-1">
              Diagnóstico botánico IA
            </span>
          </button>
        </div>

        {/* Acordeón: Más registros */}
        <div className="pt-1">
          <button
            type="button"
            id="quick-action-more-toggle"
            onClick={() => setShowMoreActions((prev) => !prev)}
            className="w-full py-2.5 px-3 rounded-2xl bg-[#FFF8E8] hover:bg-[#FAF2E1] border border-[#EFE3CF] flex items-center justify-between text-xs font-bold text-[#29202F] transition-colors cursor-pointer"
          >
            <span>Más registros técnicos</span>
            <ChevronDown
              className={`w-4 h-4 text-[#6E5D77] transition-transform duration-200 ${
                showMoreActions ? 'rotate-180 text-[#6C45C7]' : ''
              }`}
            />
          </button>

          {showMoreActions && (
            <div className="grid grid-cols-2 gap-2.5 mt-2.5 animate-in fade-in duration-200">
              {/* Ambiente */}
              <button
                type="button"
                id="quick-action-environment"
                onClick={() => handleActionClick('environment')}
                className="flex items-center gap-2.5 p-3 rounded-2xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] text-left transition-all cursor-pointer shadow-2xs"
              >
                <div className="p-2 rounded-xl bg-[#EB7864]/15 text-[#EB7864]">
                  <Thermometer className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-[#29202F] block">Ambiente</span>
                  <span className="text-[10px] text-[#6E5D77] block">T°, HR, VPD</span>
                </div>
              </button>

              {/* pH / EC y mediciones */}
              <button
                type="button"
                id="quick-action-measurement"
                onClick={() => handleActionClick('measurement')}
                className="flex items-center gap-2.5 p-3 rounded-2xl bg-white hover:bg-[#FAF2E1] border border-[#EFE3CF] text-left transition-all cursor-pointer shadow-2xs"
              >
                <div className="p-2 rounded-xl bg-[#62B95B]/15 text-[#62B95B]">
                  <FlaskConical className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-[#29202F] block">pH / EC</span>
                  <span className="text-[10px] text-[#6E5D77] block">Escorrentía</span>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Footer: Crear nuevo cultivo como acceso secundario limpio */}
        <div className="pt-2 border-t border-[#EFE3CF] text-center">
          <button
            type="button"
            id="quick-action-new-crop"
            onClick={() => handleActionClick('new-crop')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6C45C7] hover:text-[#5B37AE] hover:underline cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>¿Querés sumar una carpa o planta nueva? Creá un nuevo cultivo</span>
          </button>
        </div>
      </div>
    </div>
  );
};
