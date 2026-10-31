import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Power, RefreshCw, Unplug } from 'lucide-react';
import type { Cultivation } from '../../types';
import { devicesService, scheduleSnapshot, type DeviceBindingState, type SmartDevice } from '../../services/devicesService';
import { CLIMATE_ROLES, DEFAULT_PUMP, defaultClimateRule, describeAutoIrrigation, describeClimateRule, validatePump, type ClimateRole, type PumpConfig } from '../../utils/deviceRules';
import { ClimateRuleEditor } from './ClimateRuleEditor';
import { AutoIrrigationEditor } from './AutoIrrigationEditor';

interface SmartLifePanelProps {
  cultivations: Cultivation[];
  showToast?: (msg: string) => void;
  /** Cuántos equipos hay (para mostrar u ocultar Qué comprar). */
  onDevicesChange?: (count: number) => void;
}

const FIELD = 'min-h-11 px-3 rounded-2xl bg-white border border-line text-sm text-ink focus:outline-hidden focus:border-brand w-full';
const ITEM = 'bg-surface rounded-3xl p-4 border border-line';
const SMALL = 'min-h-9 px-2 rounded-xl bg-white border border-line text-xs text-ink';

/** Para qué se usa un toma: la luz, la bomba de riego o un equipo de clima. */
type Use = 'light' | 'pump' | ClimateRole;
const USE_LABEL: Record<string, string> = { light: 'Luz', pump: 'Bomba de riego', ...Object.fromEntries(Object.entries(CLIMATE_ROLES).map(([k, r]) => [k, r.label])) };
function bindingText(b: DeviceBindingState): string {
  if (b.role === 'light') return `Luz de ${b.cultivationName}`;
  if (b.role === 'pump') return `Bomba de riego de ${b.cultivationName} · ${describeAutoIrrigation(b.auto)}`;
  if (b.role === 'climate' && b.climateRole && b.rule) return `${CLIMATE_ROLES[b.climateRole].label} de ${b.cultivationName} · ${describeClimateRule(b.climateRole, b.rule)}`;
  return b.cultivationName;
}

/** Caudal y topes de una bomba. */
const PumpEditor: React.FC<{ pump: PumpConfig; onSave: (p: PumpConfig) => Promise<void>; onCancel: () => void }> = ({ pump, onSave, onCancel }) => {
  const [v, setV] = useState({ flowLph: String(pump.flowLph), maxSeconds: String(pump.maxSeconds), maxLiters: String(pump.maxLiters) });
  const [err, setErr] = useState<string | null>(null);
  const num = (x: string) => Number(String(x).replace(',', '.'));
  const save = async () => {
    const next = { flowLph: num(v.flowLph), maxSeconds: num(v.maxSeconds), maxLiters: num(v.maxLiters) };
    const errs = validatePump(next);
    if (errs.length) return setErr(errs[0]);
    try {
      await onSave(next);
    } catch (e: any) {
      setErr(e?.message || 'No se pudo guardar.');
    }
  };
  return (
    <div className="pump-editor space-y-2 rounded-2xl bg-surface border border-line p-3">
      <div className="grid grid-cols-3 gap-2">
        {([['flowLph', 'Caudal (L/h)'], ['maxSeconds', 'Tope (s)'], ['maxLiters', 'Tope (L)']] as const).map(([k, l]) => (
          <label key={k} className="text-[11px] font-semibold text-ink-muted space-y-1">
            <span>{l}</span>
            <input className={`${SMALL} w-full`} inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} aria-label={l} />
          </label>
        ))}
      </div>
      <p className="text-[11px] text-ink-subtle">Caudal: goteros × litros por hora de cada uno (4 goteros de 2 L/h = 8 L/h).</p>
      {err && <p className="text-[11px] font-bold text-error">{err}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={save} className="cultiveta-btn-primary text-xs">Guardar</button>
        <button type="button" onClick={onCancel} className="cultiveta-btn-secondary text-xs">Cancelar</button>
      </div>
    </div>
  );
};

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
  const [use, setUse] = useState<Record<string, Use>>({});
  const [editing, setEditing] = useState<string | null>(null);

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

  const cropsFor = (u: Use | 'sensor') => (u === 'light' ? indoor : cultivations);
  const assign = (d: SmartDevice, code: string, u: Use | 'sensor_th' | 'sensor_soil') => {
    const key = `${d.id}|${code}`;
    const list = cropsFor(u === 'sensor_th' || u === 'sensor_soil' ? 'sensor' : u);
    const crop = list.find((c) => c.id === (target[key] || list[0]?.id));
    if (!crop) return setError(u === 'light' ? 'Primero creá un cultivo indoor.' : 'Primero creá un cultivo.');
    const role = u === 'light' || u === 'pump' || u === 'sensor_th' || u === 'sensor_soil' ? u : 'climate';
    run(key, async () => {
      await devicesService.bind({
        deviceId: d.id,
        code,
        role,
        cultivationId: crop.id,
        cultivationName: crop.name,
        schedule: role === 'light' || role === 'pump' ? scheduleSnapshot(crop) : null,
        ...(role === 'climate' ? { climateRole: u as ClimateRole, rule: defaultClimateRule(u as ClimateRole) } : {}),
        ...(role === 'pump' ? { pump: { ...DEFAULT_PUMP } } : {}),
      });
      await loadDevices();
    }, role === 'light' ? `Listo: este toma maneja la luz de ${crop.name}` : role === 'pump' ? `Listo: bomba de riego de ${crop.name}` : role === 'climate' ? `Listo: ${USE_LABEL[u]} de ${crop.name}` : `Listo: el sensor mide en ${crop.name}`);
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
                    <span className="text-[11px] font-bold text-brand text-right">{bindingText(ch.binding)}</span>
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
                  <div className="space-y-2">
                    {editing === ch.binding.id && ch.binding.role === 'climate' && ch.binding.climateRole && ch.binding.rule && (
                      <ClimateRuleEditor
                        role={ch.binding.climateRole}
                        rule={ch.binding.rule}
                        onCancel={() => setEditing(null)}
                        onSave={async (rule) => {
                          await devicesService.setRule(ch.binding!.id, rule);
                          setEditing(null);
                          await loadDevices();
                          toast('Regla guardada');
                        }}
                      />
                    )}
                    {editing === `${ch.binding.id}|auto` && ch.binding.role === 'pump' && (
                      <AutoIrrigationEditor
                        auto={ch.binding.auto}
                        pump={ch.binding.pump || DEFAULT_PUMP}
                        hasSoilSensor={(devices || []).some((x) => x.sensorBindings.some((sb) => sb.role === 'sensor_soil' && sb.cultivationId === ch.binding!.cultivationId))}
                        hasLightSchedule={!!ch.binding.schedule || !!scheduleSnapshot(cultivations.find((c) => c.id === ch.binding!.cultivationId) || {})}
                        onCancel={() => setEditing(null)}
                        onSave={async (a) => {
                          await devicesService.setAuto(ch.binding!.id, a);
                          setEditing(null);
                          await loadDevices();
                          toast(a.mode === 'off' ? 'La bomba riega solo a mano' : 'Riego automático guardado');
                        }}
                      />
                    )}
                    {editing === ch.binding.id && ch.binding.role === 'pump' && (
                      <PumpEditor
                        pump={ch.binding.pump || DEFAULT_PUMP}
                        onCancel={() => setEditing(null)}
                        onSave={async (p) => {
                          await devicesService.setPump(ch.binding!.id, p);
                          setEditing(null);
                          await loadDevices();
                          toast('Bomba guardada');
                        }}
                      />
                    )}
                    <div className="flex flex-wrap gap-3">
                      {ch.binding.role === 'pump' && editing !== `${ch.binding.id}|auto` && (
                        <button type="button" onClick={() => setEditing(`${ch.binding!.id}|auto`)} className="pump-auto-btn text-[11px] font-bold text-brand hover:underline">
                          Riego automático
                        </button>
                      )}
                      {(ch.binding.role === 'climate' || ch.binding.role === 'pump') && editing !== ch.binding.id && (
                        <button type="button" onClick={() => setEditing(ch.binding!.id)} className="text-[11px] font-bold text-brand hover:underline">
                          {ch.binding.role === 'pump' ? 'Caudal y topes' : 'Cambiar regla'}
                        </button>
                      )}
                      <button type="button" onClick={() => run(key, async () => { await devicesService.unbind(ch.binding!.id); await loadDevices(); }, 'Asignación quitada')} className="text-[11px] font-bold text-ink-muted hover:underline">
                        Desasignar (vuelven tus horarios de Smart Life)
                      </button>
                    </div>
                  </div>
                ) : cultivations.length ? (
                  (() => {
                    const u = use[key] || (indoor.length ? 'light' : 'exhaust');
                    const list = cropsFor(u);
                    return (
                      <div className="flex flex-wrap items-center gap-2">
                        <select className={SMALL} value={u} onChange={(e) => setUse({ ...use, [key]: e.target.value as Use })} aria-label="Para qué se usa">
                          {indoor.length > 0 && <option value="light">Luz</option>}
                          {ch.hasCountdown && <option value="pump">Bomba de riego</option>}
                          {(Object.keys(CLIMATE_ROLES) as ClimateRole[]).map((r) => (
                            <option key={r} value={r}>
                              {CLIMATE_ROLES[r].label}
                            </option>
                          ))}
                        </select>
                        <select className={SMALL} value={target[key] && list.some((c) => c.id === target[key]) ? target[key] : list[0]?.id} onChange={(e) => setTarget({ ...target, [key]: e.target.value })} aria-label="Cultivo">
                          {list.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <button type="button" disabled={busy === key || !list.length} onClick={() => assign(d, ch.code, u)} className="cultiveta-btn-secondary text-xs disabled:opacity-50">
                          Asignar
                        </button>
                      </div>
                    );
                  })()
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
