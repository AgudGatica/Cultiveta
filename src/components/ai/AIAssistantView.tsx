import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Send,
  Bot,
  User,
  Sprout,
  Droplets,
  Thermometer,
  HelpCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import {
  Cultivation,
  Watering,
  EnvironmentRecord,
  AIChatMessage,
  Genetics,
  PhotoRecord,
  DiaryEntry,
  Harvest,
} from '../../types';
import { aiService } from '../../services/aiService';
import { condenseRecordsToKeyPoints } from '../../utils/condenseRecords';
import { buildCultivationIntelligenceContext } from '../../services/cultivationIntelligenceService';
import { SafeMarkdown } from './SafeMarkdown';

export interface AIAssistantViewProps {
  cultivations: Cultivation[];
  activeCultivation?: Cultivation | null;
  recentWaterings: Watering[];
  recentEnvRecords: EnvironmentRecord[];
  geneticsList?: Genetics[];
  photos?: PhotoRecord[];
  diaryEntries?: DiaryEntry[];
  harvests?: Harvest[];
}

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({
  cultivations,
  activeCultivation,
  recentWaterings,
  recentEnvRecords,
  geneticsList = [],
  photos = [],
  diaryEntries = [],
  harvests = [],
}) => {
  const [selectedCropId, setSelectedCropId] = useState<string>(
    activeCultivation?.id || cultivations[0]?.id || ''
  );
  const [isSummaryMode, setIsSummaryMode] = useState<boolean>(false);
  const [showSummaryPreview, setShowSummaryPreview] = useState<boolean>(true);
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<AIChatMessage[]>([
    {
      id: 'init-1',
      sender: 'ai',
      text: '¡Hola! Soy tu asistente agronómico inteligente de Cultiveta. Tengo acceso a los datos de tus cultivos, riegos y lecturas ambientales. ¿En qué te puedo asesorar hoy?',
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedCrop = cultivations.find((c) => c.id === selectedCropId);

  // Compute the condensed records summary for the selected crop
  const condensedSummary = useMemo(() => {
    return condenseRecordsToKeyPoints(selectedCrop, recentWaterings, recentEnvRecords);
  }, [selectedCrop, recentWaterings, recentEnvRecords]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const standardQuestions = [
    '¿Cuándo tendría que revisar el próximo riego?',
    '¿Cuánto está tardando en secarse este cultivo?',
    '¿Cómo cambió el consumo de agua con el calor?',
    '¿Cuánto me duró cada etapa?',
    '¿Cómo preparo la nutrición para esta etapa?',
    '¿Qué rango de VPD y temperatura es ideal ahora?',
  ];

  const summaryModeQuestions = [
    '¿Cómo evalúas estos puntos clave de ambiente y riegos?',
    '¿Mis valores de pH y EC están dentro del rango óptimo?',
    '¿Qué ajustes climáticos o de ventilación me sugieres?',
    '¿La frecuencia y volumen de riego son los adecuados?',
  ];

  const quickQuestions = isSummaryMode ? summaryModeQuestions : standardQuestions;

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputMessage;
    if (!textToSend.trim() || loading) return;

    const pointsToInclude = isSummaryMode ? condensedSummary.keyPoints : undefined;

    const userMsg: AIChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      summaryModeActive: isSummaryMode,
      condensedPoints: pointsToInclude,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setLoading(true);

    try {
      // Build real-time context
      const cropWaterings = recentWaterings.filter((w) => w.cultivationId === selectedCropId);
      const cropEnv = recentEnvRecords.filter((e) => e.cultivationId === selectedCropId);

      // Sanitize photo records to only include useful metadata without image binary/payloads
      const photoMetadata: PhotoRecord[] = photos.map((p) => ({
        id: p.id,
        userId: p.userId,
        cultivationId: p.cultivationId,
        date: p.date,
        dayOfCultivation: p.dayOfCultivation,
        stage: p.stage,
        category: p.category,
        caption: p.caption,
        url: '', // strip image binary / storage URL
        createdAt: p.createdAt,
      }));

      const intelligenceContext = selectedCrop
        ? buildCultivationIntelligenceContext({
            cultivation: selectedCrop,
            waterings: cropWaterings,
            envRecords: cropEnv,
            photos: photoMetadata,
            diaryEntries,
            geneticsList,
            harvests,
          })
        : undefined;

      const contextPayload = selectedCrop
        ? {
            cropName: selectedCrop.name,
            stage: selectedCrop.currentStage,
            genetics: selectedCrop.geneticsName,
            photoperiod: selectedCrop.photoperiodType,
            substrate: selectedCrop.substrate?.type,
            lighting: selectedCrop.lighting?.type,
            recentWaterings: cropWaterings.slice(0, 5).map((w) => ({
              date: w.date,
              volumeL: w.volumeLiters,
              phIn: w.phIn,
              ecIn: w.ecIn,
            })),
            recentEnv: cropEnv.slice(0, 5).map((e) => ({
              date: e.date,
              tempC: e.temperatureC,
              humidityPct: e.humidityPct,
              vpdKPa: e.vpdKPa,
            })),
          }
        : undefined;

      const aiReply = await aiService.askAssistant({
        question: userMsg.text,
        cultivation: selectedCrop,
        intelligenceContext,
        cultivationContext: contextPayload,
        condensedSummary: pointsToInclude,
        photos: photoMetadata,
        diaryEntries,
        waterings: cropWaterings,
        envRecords: cropEnv,
        chatHistory: messages.slice(-10).map((m) => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text,
        })),
      });

      const replyMsg: AIChatMessage = {
        id: `reply-${Date.now()}`,
        sender: 'ai',
        text: aiReply,
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, replyMsg]);
    } catch (err: any) {
      console.error('Error in chat with AI', err);
      const rawMsg = err?.message || '';
      const friendlyText = rawMsg && (rawMsg.includes('créditos') || rawMsg.includes('cuota') || rawMsg.includes('agotados') || rawMsg.includes('RESOURCE_EXHAUSTED'))
        ? rawMsg
        : 'Disculpa, ocurrió un inconveniente con el modelo agronómico. Todos tus registros, riegos y cálculos botánicos continúan disponibles normalmente.';
      const errorMsg: AIChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'ai',
        text: friendlyText,
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-chip-line shadow-xs flex flex-col h-[calc(100vh-140px)] min-h-[500px]">
      {/* Chat Top Header with Crop Context Selector and Summary Mode Switch */}
      <div className="p-4 sm:p-5 border-b border-chip-line flex flex-col md:flex-row items-start md:items-center justify-between gap-3 cultiveta-gradient-ai cultiveta-grain rounded-t-3xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-brand/15 text-brand">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-ink text-sm sm:text-base flex items-center gap-2">
              <span>Asistente Cultiveta IA 🌱</span>
              {isSummaryMode && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand/15 text-brand border border-brand/30">
                  <Zap className="w-3 h-3 text-brand" />
                  Modo Resumen
                </span>
              )}
            </h3>
            <p className="text-xs text-ink-muted">
              Respuestas agronómicas con contexto en tiempo real
            </p>
          </div>
        </div>

        {/* Right Controls: Crop Selector & Summary Mode Switch */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          {/* Crop Selector */}
          {cultivations.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-ink-muted shrink-0">Carpa:</span>
              <select
                id="ai-crop-select"
                value={selectedCropId}
                onChange={(e) => setSelectedCropId(e.target.value)}
                className="px-3 py-1.5 rounded-2xl bg-white border border-chip-line text-xs font-bold text-ink focus:outline-hidden focus:border-brand cursor-pointer shadow-2xs"
              >
                <option value="">Pregunta general</option>
                {cultivations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.currentStage})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Summary Mode Switch */}
          <div className="flex items-center gap-2.5 bg-white px-3 py-1.5 rounded-2xl border border-chip-line shadow-2xs">
            <div className="flex flex-col text-right">
              <span className="text-xs font-bold text-ink flex items-center justify-end gap-1">
                <FileText className={`w-3.5 h-3.5 ${isSummaryMode ? 'text-brand' : 'text-ink-subtle'}`} />
                Modo Resumen
              </span>
              <span className="text-[10px] text-ink-muted hidden sm:inline">
                {isSummaryMode ? 'Condensando datos' : 'Condensar registros'}
              </span>
            </div>
            <button
              type="button"
              id="summary-mode-switch"
              role="switch"
              aria-checked={isSummaryMode}
              onClick={() => setIsSummaryMode(!isSummaryMode)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                isSummaryMode ? 'bg-brand' : 'bg-line'
              }`}
              title={
                isSummaryMode
                  ? 'Desactivar modo resumen'
                  : 'Activar modo de resumen para condensar registros de ambiente y riegos en puntos clave'
              }
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  isSummaryMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Summary Mode Banner with Condensed Key Points */}
      {isSummaryMode && (
        <div className="bg-brand/10 border-b border-brand/20 px-4 sm:px-6 py-3 transition-all">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-ink">
              <div className="p-1.5 rounded-xl bg-brand/20 text-brand shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-ink">Modo Resumen Activo</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand/20 text-brand">
                    {condensedSummary.envRecordsCount} registros de ambiente • {condensedSummary.wateringsCount} riegos
                  </span>
                </div>
                <p className="text-[11px] text-ink-muted">
                  Los registros se condensan en puntos clave y se envían como base antes de cada consulta.
                </p>
              </div>
            </div>

            <button
              type="button"
              id="toggle-summary-preview-btn"
              onClick={() => setShowSummaryPreview(!showSummaryPreview)}
              className="flex items-center gap-1 text-xs font-bold text-brand hover:bg-brand/15 px-2.5 py-1 rounded-xl transition-colors cursor-pointer shrink-0"
            >
              <span>{showSummaryPreview ? 'Ocultar puntos clave' : 'Ver puntos clave'}</span>
              {showSummaryPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Expanded preview of condensed key points */}
          {showSummaryPreview && (
            <div className="mt-3 pt-3 border-t border-brand/20 space-y-2">
              <div className="text-[11px] font-bold text-ink uppercase tracking-wide flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand" />
                Puntos clave condensados para el asistente:
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {condensedSummary.keyPoints.map((point, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-2xl p-2.5 border border-chip-line text-xs text-ink flex items-start gap-2 shadow-2xs font-medium"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-brand mt-1.5 shrink-0" />
                    <span className="leading-relaxed">{point}</span>
                  </div>
                ))}
              </div>

              {condensedSummary.alerts.length > 0 && (
                <div className="mt-2 pt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold text-coral uppercase">Alertas clave:</span>
                  {condensedSummary.alerts.map((alt, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-[11px] bg-coral/15 text-coral border border-coral/30 px-2.5 py-0.5 rounded-full font-bold"
                    >
                      <AlertTriangle className="w-3 h-3 text-coral shrink-0" />
                      {alt}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Messages Container */}
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 max-w-3xl ${
              msg.sender === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-2xl flex items-center justify-center shrink-0 text-xs font-bold ${
                msg.sender === 'user'
                  ? 'bg-ok text-white shadow-2xs'
                  : 'bg-brand/15 text-brand'
              }`}
            >
              {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div
              className={`p-4 rounded-3xl text-xs sm:text-sm leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-ok text-white rounded-tr-xs shadow-xs whitespace-pre-wrap'
                  : 'bg-surface text-ink rounded-tl-xs border border-chip-line shadow-2xs font-medium'
              }`}
            >
              {msg.sender === 'user' ? msg.text : <SafeMarkdown text={msg.text} />}

              {/* Tag indicating that this message included a condensed summary */}
              {msg.summaryModeActive && msg.sender === 'user' && (
                <div className="mt-2 pt-1.5 border-t border-white/30 flex items-center gap-1 text-[10px] text-white/90 font-medium">
                  <Zap className="w-3 h-3 text-white shrink-0" />
                  <span>Modo Resumen activado ({msg.condensedPoints?.length || 0} puntos clave adjuntados)</span>
                </div>
              )}

              <div
                className={`text-[10px] mt-2 font-semibold ${
                  msg.sender === 'user' ? 'text-white/80' : 'text-ink-subtle'
                }`}
              >
                {msg.timestamp}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-start gap-3 mr-auto max-w-xl">
            <div className="w-8 h-8 rounded-2xl bg-brand/15 text-brand flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 animate-spin" />
            </div>
            <div className="p-4 rounded-3xl rounded-tl-xs bg-surface border border-chip-line text-ink-muted text-xs flex items-center gap-2">
              <span>
                {isSummaryMode
                  ? 'Analizando puntos clave de ambiente y riegos...'
                  : 'Pensando recomendación agronómica...'}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompt Chips */}
      <div className="px-4 py-2 bg-surface border-t border-chip-line flex items-center gap-2 overflow-x-auto scrollbar-none">
        <span className="text-[11px] font-bold text-ink-subtle shrink-0">Sugerencias:</span>
        {quickQuestions.map((q, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSendMessage(q)}
            className="px-3 py-1.5 rounded-full bg-white hover:bg-track text-ink hover:text-brand border border-chip-line text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer shadow-2xs"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Chat Input Bar */}
      <div className="p-4 border-t border-chip-line bg-white rounded-b-3xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            id="ai-chat-input"
            type="text"
            placeholder={
              isSummaryMode
                ? 'Consultá al asistente basándote en los puntos clave de ambiente y riegos...'
                : 'Preguntale sobre riego, podas, nutrientes o iluminación...'
            }
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-2xl bg-surface border border-chip-line text-ink text-xs sm:text-sm focus:outline-hidden focus:border-brand focus:bg-white font-medium"
          />
          <button
            type="submit"
            id="send-ai-chat-btn"
            disabled={!inputMessage.trim() || loading}
            className="p-3 rounded-2xl bg-brand hover:bg-brand-deep text-white transition-all disabled:opacity-40 cursor-pointer shadow-md shadow-brand/20"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

