import React, { useEffect, useState } from 'react';
import { Droplets, Fan, Loader2, Square } from 'lucide-react';
import type { Cultivation, Watering } from '../../types';
import { climateBindingsFor, devicesService, pumpBindingFor, useDevicesOverview } from '../../services/devicesService';
import { CLIMATE_ROLES, DEFAULT_PUMP, describeAutoIrrigation, describeClimateRule, secondsToLiters } from '../../utils/deviceRules';
import { wateringService } from '../../services/wateringService';
import { getLocalTodayDateOnly } from '../../utils/growthStageUtils';

interface CropDevicesCardProps {
  cultivation: Cultivation;
  userId: string;
  showToast?: (msg: string) => void;
  onWateringAdded?: (w: Watering) => void;
  /** Lleva a Equipos (para cambiar reglas o asignar). */
  onOpenDevices?: () => void;
}

const PRESETS = [15, 30, 60, 120];
const liters = (l: number) => `${(Math.round(l * 100) / 100).toString().replace('.', ',')} L`;
const pad = (n: number) => String(n).padStart(2, '0');
/** "hoy 18:32" o "30/10 18:32". */
function shortWhen(ms: number): string {
  const d = new Date(ms);
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.toDateString() === new Date().toDateString() ? `hoy ${clock}` : `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${clock}`;
}

/**
 * Equipos del cultivo (traído de Órbita): la bomba de riego, con "Regar" (se apaga sola con la cuenta
 * regresiva del enchufe), y los equipos de clima con su estado y por qué. Cada riego queda anotado.
 */
export const CropDevicesCard: React.FC<CropDevicesCardProps> = ({ cultivation, userId, showToast, onWateringAdded, onOpenDevices }) => {
  const overview = useDevicesOverview();
  const pump = pumpBindingFor(overview, cultivation.id);
  const climate = climateBindingsFor(overview, cultivation.id);
  const [seconds, setSeconds] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const watering = pump?.watering && pump.watering.endsAt > now ? pump.watering : null;
  useEffect(() => {
    if (!watering) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [watering]);

  if (!pump && !climate.length) return null;
  const cfg = pump?.pump || DEFAULT_PUMP;

  const water = async () => {
    if (!pump) return;
    setBusy(true);
    setError(null);
    try {
      const r = await devicesService.water(pump.id, seconds);
      setNow(Date.now());
      const d = new Date();
      const w = await wateringService.addWatering({
        userId,
        cultivationId: cultivation.id,
        date: getLocalTodayDateOnly(),
        time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        volumeLiters: Math.round(r.liters * 100) / 100,
        observations: `Riego con bomba (${r.seconds} s)`,
      });
      onWateringAdded?.(w);
      showToast?.(`Regando ${r.seconds} s (${liters(r.liters)}): la bomba se apaga sola.`);
    } catch (e: any) {
      setError(e?.message || 'No se pudo regar.');
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    if (!pump) return;
    setBusy(true);
    try {
      await devicesService.stopWater(pump.id);
      showToast?.('Riego cortado.');
    } catch (e: any) {
      setError(e?.message || 'No se pudo cortar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="crop-devices-card" className="bg-white rounded-[28px] p-5 sm:p-6 border border-line shadow-2xs space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">Equipos del cultivo</span>
        {onOpenDevices && (
          <button type="button" onClick={onOpenDevices} className="text-[11px] font-bold text-brand hover:underline">
            Cambiar en Equipos
          </button>
        )}
      </div>

      {pump && (
        <div id="crop-pump" className="rounded-2xl bg-surface border border-line p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-ink flex items-center gap-1.5">
              <Droplets className="w-4 h-4 text-brand" aria-hidden="true" />
              Bomba de riego
            </span>
            <span className="text-[11px] text-ink-subtle">
              {pump.deviceName} · {pump.label}
            </span>
          </div>
          {pump.online === false ? (
            <p className="text-xs font-bold text-coral">El enchufe de la bomba no responde: no se puede regar.</p>
          ) : watering ? (
            <div className="flex items-center justify-between gap-2">
              <p id="pump-watering" className="text-sm font-bold text-ink flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-brand" aria-hidden="true" />
                Regando{watering.auto ? ' solo' : ''} · quedan {Math.max(0, Math.ceil((watering.endsAt - now) / 1000))} s
              </p>
              <button type="button" disabled={busy} onClick={stop} className="cultiveta-btn-secondary text-xs">
                <Square className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Cortar</span>
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Segundos de riego">
                {PRESETS.filter((p) => p <= cfg.maxSeconds).map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={seconds === p}
                    onClick={() => setSeconds(p)}
                    className={`min-h-9 px-3 rounded-full text-xs font-bold border ${seconds === p ? 'bg-brand-deep text-white border-brand-deep' : 'bg-white text-ink border-line'}`}
                  >
                    {p} s
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-ink-muted">≈ {liters(secondsToLiters(seconds, cfg))} con {String(cfg.flowLph).replace('.', ',')} L/h</span>
                <button type="button" id="pump-water" disabled={busy} onClick={water} className="cultiveta-btn-primary text-xs disabled:opacity-50">
                  <Droplets className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Regar {seconds} s</span>
                </button>
              </div>
              <p className="text-[11px] text-ink-subtle">Se apaga sola con la cuenta regresiva del enchufe, aunque se corte internet. El riego queda anotado en el cultivo.</p>
            </>
          )}
          {pump.auto && pump.auto.mode !== 'off' ? (
            <div id="crop-pump-auto" className="rounded-xl bg-white border border-line p-3 space-y-0.5">
              <p className="text-xs font-bold text-ink">Riego automático</p>
              <p className="text-xs text-ink-muted">{describeAutoIrrigation(pump.auto)}</p>
              {pump.irrigation?.last && (
                <p className="text-[11px] text-ink-subtle">
                  Último: {shortWhen(pump.irrigation.last.at)} · {pump.irrigation.last.seconds} s ({liters(pump.irrigation.last.liters)})
                </p>
              )}
              {pump.irrigation?.note && <p className="text-[11px] text-ink-subtle">Ahora: {pump.irrigation.note}</p>}
            </div>
          ) : (
            <p className="text-[11px] text-ink-subtle">Para que riegue sola (con la luz, a una hora o por humedad), activá el riego automático en Equipos.</p>
          )}
          {error && <p className="text-xs font-bold text-error">{error}</p>}
        </div>
      )}

      {climate.map((b) => (
        <div key={b.id} className="crop-climate-device rounded-2xl bg-surface border border-line p-4 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-ink flex items-center gap-1.5">
              <Fan className="w-4 h-4 text-brand" aria-hidden="true" />
              {b.climateRole ? CLIMATE_ROLES[b.climateRole].label : 'Equipo'}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-wider ${
                b.online === false ? 'bg-coral/15 text-coral' : b.on ? 'bg-accent text-ink' : 'bg-brand-deep text-white'
              }`}
            >
              {b.online === false ? 'SIN CONEXIÓN' : b.on ? 'PRENDIDO' : 'APAGADO'}
            </span>
          </div>
          {b.climateRole && b.rule && <p className="text-xs text-ink-muted">{describeClimateRule(b.climateRole, b.rule)}</p>}
          {b.lastReason && <p className="text-[11px] text-ink-subtle">Ahora: {b.lastReason}</p>}
        </div>
      ))}
    </section>
  );
};

export default CropDevicesCard;
