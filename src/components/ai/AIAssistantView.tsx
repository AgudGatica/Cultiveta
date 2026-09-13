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
import { Cultivation, Watering, EnvironmentRecord, AIChatMessage } from '../../types';
import { aiService } from '../../services/aiService';
import { condenseRecordsToKeyPoints } from '../../utils/condenseRecords';

interface AIAssistantViewProps {
  cultivations: Cultivation[];
  activeCultivation?: Cultivation | null;
  recentWaterings: Watering[];
  recentEnvRecords: EnvironmentRecord[];
}

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({
  cultivations,
  activeCultivation,
  recentWaterings,
  recentEnvRecords,
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
    '¿Cómo preparo la nutrición para esta etapa?',
    '¿Qué rango de VPD y temperatura es ideal ahora?',
    '¿Es momento de hacer defoliación o poda?',
    '¿Mis valores recientes de pH y EC son adecuados?',
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
      const cropWaterings = recentWaterings.filter((w) => w.cultivationId === selectedCropId).slice(0, 5);
      const cropEnv = recentEnvRecords.filter((e) => e.cultivationId === selectedCropId).slice(0, 5);

      const contextPayload = selectedCrop
        ? {
            cropName: selectedCrop.name,
            stage: selectedCrop.currentStage,
            genetics: selectedCrop.geneticsName,
            photoperiod: selectedCrop.photoperiodType,
            substrate: selectedCrop.substrate?.type,
            lighting: selectedCrop.lighting?.type,
            recentWaterings: cropWaterings.map((w) => ({
              date: w.date,
              volumeL: w.volumeLiters,
              phIn: w.phIn,
              ecIn: w.ecIn,
            })),
            recentEnv: cropEnv.map((e) => ({
              date: e.date,
              tempC: e.temperatureC,
              humidityPct: e.humidityPct,
              vpdKPa: e.vpdKPa,
            })),
          }
        : undefined;

      const aiReply = await aiService.askAssistant({
        question: userMsg.text,
        cultivationContext: contextPayload,
        condensedSummary: pointsToInclude,
        chatHistory: messages.slice(-6).map((m) => ({
          role: m.sender === 'user' ? 'user' : 'model',
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
      const errorMsg: AIChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'ai',
        text: 'Disculpa, ocurrió un error al consultar el modelo agronómico. Por favor intenta de nuevo en unos momentos.',
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-stone-200 shadow-sm flex flex-col h-[calc(100vh-140px)] min-h-[500px]">
      {/* Chat Top Header with Crop Context Selector and Summary Mode Switch */}
      <div className="p-4 sm:p-5 border-b border-stone-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-stone-50/50 rounded-t-3xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-violet-100 text-violet-800">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-stone-900 text-sm sm:text-base flex items-center gap-2">
              <span>Asistente Cultiveta IA</span>
              {isSummaryMode && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-200">
                  <Zap className="w-3 h-3 text-violet-600" />
                  Modo Resumen
                </span>
              )}
            </h3>
            <p className="text-xs text-stone-500">
              Respuestas agronómicas con contexto en tiempo real
            </p>
          </div>
        </div>

        {/* Right Controls: Crop Selector & Summary Mode Switch */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          {/* Crop Selector */}
          {cultivations.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-stone-500 shrink-0">Carpa:</span>
              <select
                id="ai-crop-select"
                value={selectedCropId}
                onChange={(e) => setSelectedCropId(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-white border border-stone-200 text-xs font-bold text-stone-800 focus:outline-hidden focus:border-violet-500 cursor-pointer shadow-2xs"
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
          <div className="flex items-center gap-2.5 bg-white px-3 py-1.5 rounded-xl border border-stone-200 shadow-2xs">
            <div className="flex flex-col text-right">
              <span className="text-xs font-bold text-stone-800 flex items-center justify-end gap-1">
                <FileText className={`w-3.5 h-3.5 ${isSummaryMode ? 'text-violet-600' : 'text-stone-400'}`} />
                Modo Resumen
              </span>
              <span className="text-[10px] text-stone-500 hidden sm:inline">
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
                isSummaryMode ? 'bg-violet-600' : 'bg-stone-300'
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
        <div className="bg-violet-50/70 border-b border-violet-100 px-4 sm:px-6 py-3 transition-all">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-violet-900">
              <div className="p-1.5 rounded-lg bg-violet-200/70 text-violet-800 shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold">Modo Resumen Activo</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-200 text-violet-800">
                    {condensedSummary.envRecordsCount} registros de ambiente • {condensedSummary.wateringsCount} riegos
                  </span>
                </div>
                <p className="text-[11px] text-violet-700">
                  Los registros se condensan en puntos clave y se envían como base antes de cada consulta.
                </p>
              </div>
            </div>

            <button
              type="button"
              id="toggle-summary-preview-btn"
              onClick={() => setShowSummaryPreview(!showSummaryPreview)}
              className="flex items-center gap-1 text-xs font-semibold text-violet-700 hover:text-violet-900 px-2.5 py-1 rounded-lg hover:bg-violet-100 transition-colors cursor-pointer shrink-0"
            >
              <span>{showSummaryPreview ? 'Ocultar puntos clave' : 'Ver puntos clave'}</span>
              {showSummaryPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Expanded preview of condensed key points */}
          {showSummaryPreview && (
            <div className="mt-3 pt-3 border-t border-violet-200/60 space-y-2">
              <div className="text-[11px] font-bold text-violet-900 uppercase tracking-wide flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                Puntos clave condensados para el asistente:
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {condensedSummary.keyPoints.map((point, idx) => (
                  <div
                    key={idx}
                    className="bg-white/90 rounded-xl p-2.5 border border-violet-100 text-xs text-stone-700 flex items-start gap-2 shadow-2xs"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 mt-1.5 shrink-0" />
                    <span className="leading-relaxed">{point}</span>
                  </div>
                ))}
              </div>

              {condensedSummary.alerts.length > 0 && (
                <div className="mt-2 pt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold text-amber-800 uppercase">Alertas clave:</span>
                  {condensedSummary.alerts.map((alt, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-[11px] bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full font-medium"
                    >
                      <AlertTriangle className="w-3 h-3 text-amber-700 shrink-0" />
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
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                msg.sender === 'user'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-violet-100 text-violet-800'
              }`}
            >
              {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div
              className={`p-4 rounded-3xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
                msg.sender === 'user'
                  ? 'bg-emerald-600 text-white rounded-tr-xs'
                  : 'bg-stone-100 text-stone-900 rounded-tl-xs'
              }`}
            >
              {msg.text}

              {/* Tag indicating that this message included a condensed summary */}
              {msg.summaryModeActive && msg.sender === 'user' && (
                <div className="mt-2 pt-1.5 border-t border-emerald-500/50 flex items-center gap-1 text-[10px] text-emerald-100 font-medium">
                  <Zap className="w-3 h-3 text-emerald-200 shrink-0" />
                  <span>Modo Resumen activado ({msg.condensedPoints?.length || 0} puntos clave adjuntados)</span>
                </div>
              )}

              <div
                className={`text-[10px] mt-2 font-medium ${
                  msg.sender === 'user' ? 'text-emerald-100' : 'text-stone-400'
                }`}
              >
                {msg.timestamp}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-start gap-3 mr-auto max-w-xl">
            <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-800 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 animate-spin" />
            </div>
            <div className="p-4 rounded-3xl rounded-tl-xs bg-stone-100 text-stone-500 text-xs flex items-center gap-2">
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
      <div className="px-4 py-2 bg-stone-50/70 border-t border-stone-100 flex items-center gap-2 overflow-x-auto scrollbar-none">
        <span className="text-[11px] font-bold text-stone-400 shrink-0">Sugerencias:</span>
        {quickQuestions.map((q, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSendMessage(q)}
            className="px-3 py-1 rounded-full bg-white hover:bg-violet-50 text-stone-700 hover:text-violet-800 border border-stone-200 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer shadow-2xs"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Chat Input Bar */}
      <div className="p-4 border-t border-stone-200 bg-white rounded-b-3xl">
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
                ? 'Consulta al asistente basándote en los puntos clave de ambiente y riegos...'
                : 'Pregunta sobre riego, podas, nutrientes o iluminación...'
            }
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-2xl bg-stone-50 border border-stone-200 text-stone-800 text-xs sm:text-sm focus:outline-hidden focus:border-violet-500 focus:bg-white"
          />
          <button
            type="submit"
            id="send-ai-chat-btn"
            disabled={!inputMessage.trim() || loading}
            className="p-3 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white transition-all disabled:opacity-40 cursor-pointer shadow-md shadow-violet-600/20"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

