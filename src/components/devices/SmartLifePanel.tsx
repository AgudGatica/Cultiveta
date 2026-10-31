import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Power, RefreshCw, Unplug } from 'lucide-react';
import type { Cultivation } from '../../types';
import { devicesService, scheduleSnapshot, type SmartDevice } from '../../services/devicesService';

interface SmartLifePanelProps {
  cultivations: Cultivation[];
  showToast?: (msg: string) => void;
  /** Cuántos equipos hay (para mostrar u ocultar Qué comprar). */
  onDevicesChange?: (count: number) => void;
}

const FIELD = 'min-h-11 px-3 rounded-2xl bg-white border border-line text-sm text-ink focus:outline-hidden focus:border-brand w-full';
const ITEM = 'bg-surface rounded-3xl p-4 border border-line';

const reading = (s: SmartDevice['sensors']) =>
  s
    ? [
        s.temperature != null && `${String(s.temperature).replace('.', ',')} °C`,
        s.humidity != null && `${s.humidity} %`,
        s.soil != null && `${s.soil} % de sustrato`,
        s.co2 != null && `${s.co2} ppm`,
        s.battery != null && `batería ${s.battery} %`,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

/**
 * Smart Life / Tuya real (traído de Órbita): conectar el proyecto de iot.tuya.com, ver los equipos de
 * la cuenta y asignar cada toma o sensor a un cultivo. Las claves quedan solo en el servidor.
 */
export const SmartLifePanel: React.FC<SmartLifePanelProps> = ({ cultivations, showToast, onDevicesChange }) => {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof devicesService.status>> | null>(null);
  const [devices, setDevices] = useState<SmartDevice[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ accessId: '', accessSecret: '', region: 'us' });
  const [target, setTarget] = useState<Record<string, string>>({});

  const toast = (m: string) => showToast?.(m);
  const indoor = cultivations.filter((c) => c.type === 'Indoor');

  const loadDevices = useCallback(async () => {
    try {
      const list = await devicesService.listDevices();
      setDevices(list);
      onDevicesChange?.(list.length);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'No se pudieron leer los equipos.');
    }
  }, [onDevicesChange]);

  const loadStatus = useCallback(async () => {
    try {
      const s = await devicesService.status();
      setStatus(s);
      if (s.tuya.connected) await loadDevices();
      else onDevicesChange?.(0);
    } catch (e: any) {
      setError(e?.message || 'No hay conexión con el servidor de Cultiveta.');
    }
  }, [loadDevices, onDevicesChange]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e: any) {
      setError(e?.message || 'No se pudo.');
    } finally {
      setBusy(null);
    }
  };

  const connect = (mock: boolean) =>
    run('connect', async () => {
      const r = await devicesService.connectTuya(mock ? { mock: true } : form);
      if (r.warning) setError(r.warning);
      setForm({ accessId: '', accessSecret: '', region: form.region });
      await loadStatus();
      toast(mock ? 'Zapatilla de prueba conectada' : `Smart Life conectado: ${r.devices} equipo${r.devices === 1 ? '' : 's'}`);
    });

  const disconnect = () => {
    if (!window.confirm('Se borra lo que Cultiveta cargó en Smart Life, vuelven tus programaciones de la app Smart Life y se borran las claves. ¿Desconectar?')) return;
    run('disconnect', async () => {
      await devicesService.disconnectTuya();
      setDevices(null);
      await loadStatus();
    }, 'Smart Life desconectado');
  };

  const assign = (d: SmartDevice, code: string, role: 'light' | 'sensor_th' | 'sensor_soil') => {
    const key = `${d.id}|${code}`;
    const crop = (role === 'light' ? indoor : cultivations).find((c) => c.id === (target[key] || (role === 'light' ? indoor : cultivations)[0]?.id));
    if (!crop) return setError(role === 'light' ? 'Primero creá un cultivo indoor.' : 'Primero creá un cultivo.');
    run(key, async () => {
      await devicesService.bind({ deviceId: d.id, code, role, cultivationId: crop.id, cultivationName: crop.name, schedule: role === 'light' ? scheduleSnapshot(crop) : null });
      await loadDevices();
    }, role === 'light' ? `Listo: este toma maneja la luz de ${crop.name}` : `Listo: el sensor mide en ${crop.name}`);
  };

  if (!status) {
    return (
      <div className={`${ITEM} text-xs text-ink-muted`}>{error || 'Cargando Smart Life…'}</div>
    );
  }

  if (!status.tuya.connected) {
    return (
      <div id="smartlife-connect" className={`${ITEM} space-y-3`}>
        <p className="text-sm font-bold text-ink">Conectar Smart Life / Tuya</p>
        <ol className="list-decimal pl-5 space-y-1.5 text-xs text-ink-muted">
          <li>
            Entrá a{' '}
            <a className="text-brand font-bold" href="https://iot.tuya.com" target="_blank" rel="noopener noreferrer">
              iot.tuya.com
            </a>{' '}
            y creá una cuenta gratis (es la plataforma oficial de Tuya, la empresa detrás de Smart Life).
          </li>
          <li>
            <b>Cloud → Development → Create Cloud Project</b>. Industria y método: <b>Smart Home</b>. Centro de datos: <b>Western America</b> (el de las cuentas de Argentina).
          </li>
          <li>
            En <b>Authorize API Services</b> dejá marcados <b>IoT Core</b> y <b>Authorization Token Management</b>.
          </li>
          <li>
            Dentro del proyecto: <b>Devices → Link App Account</b>. Aparece un código QR: en Smart Life andá a <b>Yo</b>, tocá el ícono de escanear y confirmá. Tus equipos quedan vinculados.
          </li>
          <li>
            En <b>Overview</b> copiá el <b>Access ID</b> y el <b>Access Secret</b> y pegalos acá.
          </li>
        </ol>
        <form
          className="space-y-2"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            connect(false);
          }}
        >
          <label className="text-xs font-semibold text-ink-muted block space-y-1">
            <span>Access ID</span>
            <input id="tuya-access-id" className={FIELD} value={form.accessId} onChange={(e) => setForm({ ...form, accessId: e.target.value })} spellCheck={false} required />
          </label>
          <label className="text-xs font-semibold text-ink-muted block space-y-1">
            <span>Access Secret</span>
            <input id="tuya-access-secret" className={FIELD} type="password" autoComplete="new-password" value={form.accessSecret} onChange={(e) => setForm({ ...form, accessSecret: e.target.value })} required />
          </label>
          <label className="text-xs font-semibold text-ink-muted block space-y-1">
            <span>Centro de datos</span>
            <select className={FIELD} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
              {Object.entries(status.regions).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="text-xs font-bold text-error">{error}</p>}
          <button type="submit" id="tuya-connect" disabled={busy === 'connect'} className="cultiveta-btn-primary text-xs w-full justify-center disabled:opacity-50">
            {busy === 'connect' ? 'Conectando…' : 'Conectar Smart Life'}
          </button>
        </form>
        <p className="text-[11px] text-ink-subtle">Las claves quedan guardadas solo en el servidor de Cultiveta; la app nunca las vuelve a mostrar.</p>
        <button type="button" id="tuya-mock" onClick={() => connect(true)} className="cultiveta-btn-secondary text-xs w-full justify-center">
          Probar con una zapatilla de prueba (sin cuenta)
        </button>
      </div>
    );
  }

  return (
    <div id="smartlife-devices" className="space-y-3">
      <div className={`${ITEM} flex flex-wrap items-center justify-between gap-2`}>
        <span className="text-sm font-bold text-ink">
          Smart Life conectado{status.tuya.mock ? ' · zapatilla de prueba' : status.tuya.accessId ? ` · ${status.tuya.accessId}` : ''}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={() => run('refresh', loadDevices)} className="cultiveta-btn-secondary text-xs" aria-label="Actualizar equipos">
            <RefreshCw className={`w-3.5 h-3.5 ${busy === 'refresh' ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Actualizar</span>
          </button>
          <button type="button" id="tuya-disconnect" onClick={disconnect} className="cultiveta-btn-secondary text-xs text-error">
            <Unplug className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Desconectar</span>
          </button>
        </div>
      </div>
      {error && <p className="text-xs font-bold text-error">{error}</p>}
      {!devices && <p className="text-xs text-ink-muted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Leyendo tus equipos…</p>}
      {devices && !devices.length && (
        <p className="text-xs text-ink-muted">No aparece ningún equipo: vinculá tu cuenta de Smart Life al proyecto (Devices → Link App Account) y tocá Actualizar.</p>
      )}
      {devices?.map((d) => (
        <div key={d.id} className={`smart-device ${ITEM} space-y-2`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-ink">{d.name}</p>
              <p className="text-[11px] text-ink-subtle">
                {d.product}
                {d.power ? ` · ${String(d.power.watts).replace('.', ',')} W ahora` : ''}
              </p>
            </div>
            <span className={`text-[9px] font-black tracking-wider uppercase px-1.5 py-0.5 rounded-md border ${d.online ? 'bg-ok-bg border-ok-line text-ok-ink' : 'bg-coral/10 border-coral/30 text-coral'}`}>
              {d.online ? 'En línea' : 'Sin conexión'}
            </span>
          </div>

          {d.channels.map((ch) => {
            const key = `${d.id}|${ch.code}`;
            return (
              <div key={ch.code} className="device-channel rounded-2xl bg-white border border-line p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-ink">
                    {ch.label} · <span className={ch.on ? 'text-ok-ink' : 'text-ink-muted'}>{ch.on ? 'PRENDIDO' : 'APAGADO'}</span>
                  </span>
                  {ch.binding ? (
                    <span className="text-[11px] font-bold text-brand">Luz de {ch.binding.cultivationName}</span>
                  ) : (
                    <button
                      type="button"
                      disabled={!d.online || busy === `cmd|${key}`}
                      onClick={() => run(`cmd|${key}`, async () => { await devicesService.command(d.id, ch.code, !ch.on); await loadDevices(); })}
                      className="cultiveta-btn-secondary text-xs disabled:opacity-50"
                    >
                      <Power className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{ch.on ? 'Apagar' : 'Prender'}</span>
                    </button>
                  )}
                </div>
                {ch.binding ? (
                  <button type="button" onClick={() => run(key, async () => { await devicesService.unbind(ch.binding!.id); await loadDevices(); }, 'Asignación quitada')} className="text-[11px] font-bold text-ink-muted hover:underline">
                    Desasignar (vuelven tus horarios de Smart Life)
                  </button>
                ) : indoor.length ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select className="min-h-9 px-2 rounded-xl bg-white border border-line text-xs text-ink" value={target[key] || indoor[0].id} onChange={(e) => setTarget({ ...target, [key]: e.target.value })} aria-label="Cultivo">
                      {indoor.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" disabled={busy === key} onClick={() => assign(d, ch.code, 'light')} className="cultiveta-btn-secondary text-xs disabled:opacity-50">
                      Usar como luz
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}

          {d.sensors && (
            <div className="device-sensor rounded-2xl bg-white border border-line p-3 space-y-2">
              <p className="text-xs font-bold text-ink">{reading(d.sensors)}</p>
              {d.sensorBindings.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-bold text-brand">
                    {b.role === 'sensor_soil' ? 'Sustrato' : 'Ambiente'} de {b.cultivationName}
                  </span>
                  <button type="button" onClick={() => run(b.id, async () => { await devicesService.unbind(b.id); await loadDevices(); }, 'Asignación quitada')} className="font-bold text-ink-muted hover:underline">
                    Dejar de usar
                  </button>
                </div>
              ))}
              {!d.sensorBindings.length && cultivations.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <select className="min-h-9 px-2 rounded-xl bg-white border border-line text-xs text-ink" value={target[`${d.id}|sensor`] || cultivations[0].id} onChange={(e) => setTarget({ ...target, [`${d.id}|sensor`]: e.target.value })} aria-label="Cultivo">
                    {cultivations.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" disabled={busy === `${d.id}|sensor`} onClick={() => assign(d, 'sensor', d.sensors!.soil != null ? 'sensor_soil' : 'sensor_th')} className="cultiveta-btn-secondary text-xs disabled:opacity-50">
                    {d.sensors.soil != null ? 'Usar como sonda de sustrato' : 'Usar como sensor de ambiente'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default SmartLifePanel;
