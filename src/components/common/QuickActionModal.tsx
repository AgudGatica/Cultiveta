import React from 'react';
import { X, Droplets, Thermometer, Camera, BookOpen, Sparkles, PlusCircle, FlaskConical } from 'lucide-react';
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

  const actions = [
    {
      id: 'watering' as const,
      label: 'Riego',
      description: 'Volumen, pH, EC y fertilizantes',
      icon: Droplets,
      iconBg: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
    },
    {
      id: 'environment' as const,
      label: 'Ambiente',
      description: 'Temperatura, humedad, VPD y PPFD',
      icon: Thermometer,
      iconBg: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    },
    {
      id: 'photo' as const,
      label: 'Fotografía',
      description: 'Subir o tomar foto para el historial',
      icon: Camera,
      iconBg: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    },
    {
      id: 'note' as const,
      label: 'Nota de Diario',
      description: 'Poda, trasplante o evento libre',
      icon: BookOpen,
      iconBg: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    },
    {
      id: 'measurement' as const,
      label: 'Medición pH / EC',
      description: 'Registrar valores de entrada y drenaje',
      icon: FlaskConical,
      iconBg: 'bg-teal-500/10 text-teal-400 border border-teal-500/20',
    },
    {
      id: 'ai-analyze' as const,
      label: 'Analizar Planta con IA',
      description: 'Diagnóstico visual y observaciones',
      icon: Sparkles,
      iconBg: 'bg-violet-500/10 text-violet-400 border border-violet-500/20',
    },
    {
      id: 'new-crop' as const,
      label: 'Nuevo Cultivo',
      description: 'Iniciar un nuevo ciclo o carpa',
      icon: PlusCircle,
      iconBg: 'bg-zinc-800 text-zinc-300 border border-zinc-700',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div
        id="quick-action-sheet"
        className="w-full sm:max-w-lg bg-[#0F0F0F] rounded-t-[32px] sm:rounded-[32px] p-6 sm:p-7 shadow-2xl border border-zinc-800 animate-in slide-in-from-bottom duration-200"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-4">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-500 block mb-0.5">Acceso Instantáneo</span>
            <h3 className="text-lg font-bold text-white">Registro Rápido</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto pr-1">
          {actions.map((act) => {
            const Icon = act.icon;
            return (
              <button
                key={act.id}
                type="button"
                id={`quick-action-btn-${act.id}`}
                onClick={() => handleActionClick(act.id)}
                className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800/90 hover:border-emerald-500/40 hover:bg-zinc-850 text-left transition-all cursor-pointer group"
              >
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${act.iconBg}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-bold text-zinc-200 group-hover:text-emerald-400 transition-colors">{act.label}</div>
                  <div className="text-[11px] text-zinc-400 leading-tight mt-0.5">{act.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

