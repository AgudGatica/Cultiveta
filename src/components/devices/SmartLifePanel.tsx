import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Power, RefreshCw, Search, Unplug } from 'lucide-react';
import type { Cultivation } from '../../types';
import { devicesService, scheduleSnapshot, takeEwelinkReturn, type DeviceBindingState, type DeviceVendor, type DevicesStatus, type SmartDevice } from '../../services/devicesService';
import { CLIMATE_MODE_LABEL, CLIMATE_ROLES, DEFAULT_PUMP, defaultClimateRule, describeAutoIrrigation, describeClimateRule, validatePump, type ClimateRole, type PumpConfig } from '../../utils/deviceRules';
import { ClimateRuleEditor } from './ClimateRuleEditor';
import { useIndoors } from '../../services/indoorService';
import { AutoIrrigationEditor } from './AutoIrrigationEditor';
import { ManualPowerButton, manualText } from './ManualPowerButton';

interface SmartLifePanelProps {
  cultivations: Cultivation[];
  showToast?: (msg: string) => void;
  /** Cuántos equipos hay (para mostrar u ocultar Qué comprar). */
  onDevicesChange?: (count: number) => void;
}

const FIELD = 'min-h-11 px-3 rounded-2xl bg-white border border-line text-sm text-ink focus:outline-hidden focus:border-brand w-full';
const ITEM = 'bg-surface rounded-3xl p-4 border border-line';
const CARD = 'bg-white rounded-[28px] p-5 sm:p-6 border border-line shadow-2xs';
const VENDOR_LABEL: Record<DeviceVendor, string> = { tuya: 'Smart Life', ewelink: 'eWeLink', shelly: 'Shelly' };
const VENDOR_TITLE: Record<DeviceVendor, string> = { tuya: 'Smart Life / Tuya', ewelink: 'Sonoff / eWeLink', shelly: 'Shelly' };
const VENDORS: DeviceVendor[] = ['tuya', 'ewelink', 'shelly'];
const SMALL = 'min-h-9 px-2 rounded-xl bg-white border border-line text-xs text-ink';

/** Cómo sumar otro equipo de una marca que ya está conectada: se agrega en su app y aparece solo. */
const ADD_STEPS: Record<DeviceVendor, { steps: string[]; extra?: string }> = {
  tuya: {
    steps: [
      'En la app Smart Life (o Tuya), agregá el enchufe, la zapatilla o el sensor nuevo con la misma cuenta.',
      'Tocá "Buscar equipos nuevos": aparece abajo, en Tus equipos, y ahí elegís para qué es cada toma.',
    ],
    extra: '¿Está en otra cuenta de Smart Life? En iot.tuya.com, dentro del mismo proyecto: Devices → Link App Account, escaneá el código con esa otra cuenta y buscá de nuevo.',
  },
  ewelink: {
    steps: ['En la app eWeLink, agregá el equipo nuevo con la misma cuenta.', 'Tocá "Buscar equipos nuevos": aparece abajo, en Tus equipos.'],
  },
  shelly: {
    steps: ['En la app Shelly, agregá el equipo nuevo con la misma cuenta.', 'Tocá "Buscar equipos nuevos": aparece abajo, en Tus equipos.'],
  },
};

/** Ambiente o cultivo al que se asigna un toma o un sensor. */
type Target = { key: string; kind: 'cultivation' | 'indoor'; id: string; name: string; lighting?: Cultivation['lighting'] };

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
 * Equipos reales (traído de Órbita): conectar Smart Life / Tuya (proyecto de iot.tuya.com), Sonoff /
 * eWeLink (inicio de sesión en eWeLink) y Shelly (clave de la nube), ver los equipos de todas las marcas
 * juntos y asignar cada toma o sensor a un cultivo. Las claves quedan solo en el servidor.
 */
export const SmartLifePanel: React.FC<SmartLifePanelProps> = ({ cultivations, showToast, onDevicesChange }) => {
  const [status, setStatus] = useState<DevicesStatus | null>(null);
  const [devices, setDevices] = useState<SmartDevice[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ accessId: '', accessSecret: '', region: 'us' });
  const [target, setTarget] = useState<Record<string, string>>({});
  const [use, setUse] = useState<Record<string, Use>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState<DeviceVendor | null>(null);
  const [adding, setAdding] = useState<DeviceVendor | null>(null);
  const [shellyForm, setShellyForm] = useState({ server: '', authKey: '', ids: '' });
  const [listErrors, setListErrors] = useState<Partial<Record<DeviceVendor, string>>>({});

  const toast = (m: string) => showToast?.(m);
  const indoors = useIndoors();

  /** Lee los equipos; devuelve la lista (null si no se pudo). */
  const loadDevices = useCallback(async (): Promise<SmartDevice[] | null> => {
    try {
      const { devices: list, errors } = await devicesService.listDevicesWithErrors();
      setDevices(list);
      setListErrors(errors);
      onDevicesChange?.(list.length);
      setError(null);
      return list;
    } catch (e: any) {
      setError(e?.message || 'No se pudieron leer los equipos.');
      return null;
    }
  }, [onDevicesChange]);

  const loadStatus = useCallback(async () => {
    try {
      const s = await devicesService.status();
      setStatus(s);
      if (s.tuya.connected || s.ewelink?.connected || s.shelly?.connected) await loadDevices();
      else {
        setDevices(null);
        onDevicesChange?.(0);
      }
    } catch (e: any) {
      setError(e?.message || 'No hay conexión con el servidor de Cultiveta.');
    }
  }, [loadDevices, onDevicesChange]);

  useEffect(() => {
    // vuelta del inicio de sesión de eWeLink: se termina de conectar acá
    const back = takeEwelinkReturn();
    if (!back) {
      loadStatus();
      return;
    }
    setBusy('ewelink');
    devicesService
      .connectEwelink(back)
      .then((r) => {
        if (r.warning) setError(r.warning);
        showToast?.(`eWeLink conectado: ${r.devices} equipo${r.devices === 1 ? '' : 's'}`);
      })
      .catch((e) => setError(e?.message || 'No se pudo conectar eWeLink.'))
      .finally(() => {
        setBusy(null);
        loadStatus();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const ewelinkMock = () =>
    run('ewelink', async () => {
      const r = await devicesService.connectEwelink({ mock: true });
      setOpen(null);
      await loadStatus();
      toast(`Sonoff de prueba conectados: ${r.devices}`);
    });
  const ewelinkLogin = () =>
    run('ewelink', async () => {
      window.location.assign(await devicesService.ewelinkLoginUrl());
    });
  const shellyConnect = (mock: boolean) =>
    run('shelly', async () => {
      const r = await devicesService.connectShelly(mock ? { mock: true } : shellyForm);
      if (r.warning) setError(r.warning);
      setShellyForm({ server: '', authKey: '', ids: '' });
      setOpen(null);
      await loadStatus();
      toast(mock ? 'Shelly de prueba conectados' : `Shelly conectado: ${r.devices} equipo${r.devices === 1 ? '' : 's'}`);
    });

  const disconnect = (v: DeviceVendor) => {
    const app = VENDOR_LABEL[v];
    const what = v === 'shelly' ? 'Se apagan las bombas de Shelly asignadas y se borra la clave.' : `Se borra lo que Cultiveta cargó en ${app}, vuelven tus programaciones de la app ${app} y se borran las claves.`;
    if (!window.confirm(`${what} ¿Desconectar ${app}?`)) return;
    run(`disconnect-${v}`, async () => {
      if (v === 'tuya') await devicesService.disconnectTuya();
      else if (v === 'ewelink') await devicesService.disconnectEwelink();
      else await devicesService.disconnectShelly();
      await loadStatus();
    }, `${app} desconectado`);
  };

  /** Una marca ya conectada: los equipos nuevos de su app aparecen solos al volver a leer. */
  const searchNew = (v: DeviceVendor) =>
    run(`search-${v}`, async () => {
      const before = new Set((devices || []).map((d) => d.id));
      const list = await loadDevices();
      if (!list) return;
      const fresh = list.filter((d) => !before.has(d.id));
      if (fresh.length) setAdding(null);
      toast(
        fresh.length
          ? `Listo: ${fresh.length === 1 ? `apareció ${fresh[0].name}` : `aparecieron ${fresh.length} equipos`}. Lo ves abajo, en Tus equipos.`
          : `No apareció ningún equipo nuevo de ${VENDOR_LABEL[v]}: fijate que esté agregado en su app, con la misma cuenta.`
      );
    });

  const sensorIn = (id: string) => (devices || []).some((x) => x.sensorBindings.some((sb) => sb.role === 'sensor_th' && sb.cultivationId === id));
  const lightIn = (id: string) => (devices || []).some((x) => x.channels.some((c) => c.binding?.role === 'light' && c.binding.cultivationId === id));

  /**
   * A qué se puede asignar: la luz, el clima y el sensor de ambiente van a un ambiente (o a un cultivo que
   * no está en ninguno); la bomba y la sonda de sustrato, a un cultivo (cada maceta se riega aparte).
   */
  const targetsFor = (u: Use | 'sensor_th' | 'sensor_soil'): Target[] => {
    const asCrop = (c: Cultivation): Target => ({ key: `crop:${c.id}`, kind: 'cultivation', id: c.id, name: c.name, lighting: c.lighting });
    if (u === 'pump' || u === 'sensor_soil') return cultivations.map(asCrop);
    const loose = cultivations.filter((c) => !c.indoorId && (u !== 'light' || c.type === 'Indoor'));
    // la luz, solo en ambientes interiores
    const ambients = u === 'light' ? indoors.filter((i) => i.environment !== 'exterior') : indoors;
    return [...ambients.map((i): Target => ({ key: `indoor:${i.id}`, kind: 'indoor', id: i.id, name: i.name, lighting: i.lighting })), ...loose.map(asCrop)];
  };
  const pickTarget = (key: string, list: Target[]) => list.find((t) => t.key === target[key]) || list[0];
  const assign = (d: SmartDevice, code: string, u: Use | 'sensor_th' | 'sensor_soil') => {
    const key = `${d.id}|${code}`;
    const crop = pickTarget(key, targetsFor(u));
    if (!crop) return setError(u === 'light' ? 'Primero creá un ambiente interior.' : 'Primero creá un ambiente con plantas.');
    const role = u === 'light' || u === 'pump' || u === 'sensor_th' || u === 'sensor_soil' ? u : 'climate';
    // un equipo de clima sin sensor en ese lugar arranca siguiendo a la luz (por sensor quedaría apagado)
    const rule = role === 'climate' ? defaultClimateRule(u as ClimateRole, { hasSensor: sensorIn(crop.id) }) : null;
    run(key, async () => {
      await devicesService.bind({
        deviceId: d.id,
        code,
        role,
        cultivationId: crop.id,
        cultivationName: crop.name,
        targetKind: crop.kind,
        schedule: role === 'light' || role === 'pump' ? scheduleSnapshot(crop) : null,
        ...(role === 'climate' && rule ? { climateRole: u as ClimateRole, rule } : {}),
        ...(role === 'pump' ? { pump: { ...DEFAULT_PUMP } } : {}),
      });
      await loadDevices();
    }, role === 'light' ? `Listo: este toma maneja la luz de ${crop.name}` : role === 'pump' ? `Listo: bomba de riego de ${crop.name}` : role === 'climate' && rule ? `Listo: ${USE_LABEL[u]} de ${crop.name} · ${CLIMATE_MODE_LABEL[rule.mode].toLowerCase()}` : `Listo: el sensor mide en ${crop.name}`);
  };

  const st = status;
  const anyConnected = !!st && (st.tuya.connected || st.ewelink?.connected || st.shelly?.connected);
  const connectedText = (v: DeviceVendor): string | null => {
    if (!st) return null;
    if (v === 'tuya') return st.tuya.connected ? `Conectado${st.tuya.mock ? ' · zapatilla de prueba' : st.tuya.accessId ? ` · ${st.tuya.accessId}` : ''}` : null;
    if (v === 'ewelink') return st.ewelink?.connected ? `Conectado${st.ewelink.mock ? ' · Sonoff de prueba' : ''}` : null;
    return st.shelly?.connected ? `Conectado${st.shelly.mock ? ' · Shelly de prueba' : st.shelly.server ? ` · ${st.shelly.server}` : ''}` : null;
  };

  /** Pasos para sumar otro equipo de una marca que ya está conectada. */
  const addPanel = (v: DeviceVendor) => (
    <div id={`${v}-add-steps`} className="space-y-2">
      <ol className="list-decimal pl-5 space-y-1 text-xs text-ink-muted">
        {ADD_STEPS[v].steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {ADD_STEPS[v].extra && <p className="text-[11px] text-ink-subtle">{ADD_STEPS[v].extra}</p>}
      <button type="button" id={`${v}-search`} disabled={busy === `search-${v}`} onClick={() => searchNew(v)} className="cultiveta-btn-primary text-xs w-full justify-center disabled:opacity-50">
        <Search className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{busy === `search-${v}` ? 'Buscando…' : 'Buscar equipos nuevos'}</span>
      </button>
    </div>
  );

  // Arriba: cada marca con "Conectar" o, si ya está conectada, "Agregar otro" (desconectar va abajo, en Tus equipos)
  const brand = (v: DeviceVendor, desc: string, body: React.ReactNode) => {
    const connected = connectedText(v);
    return (
      <div id={`device-brand-${v}`} data-connected={connected ? 'true' : 'false'} className={`${ITEM} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink">{VENDOR_TITLE[v]}</p>
            <p className={`text-[11px] ${connected ? 'text-ok-ink font-bold' : 'text-ink-muted'}`}>{connected || desc}</p>
          </div>
          {connected ? (
            <button type="button" id={`${v}-add`} aria-expanded={adding === v} onClick={() => setAdding(adding === v ? null : v)} className="cultiveta-btn-secondary text-xs">
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{adding === v ? 'Cerrar' : 'Agregar otro'}</span>
            </button>
          ) : (
            <button type="button" id={`${v}-open`} aria-expanded={open === v} disabled={!st} onClick={() => setOpen(open === v ? null : v)} className="cultiveta-btn-secondary text-xs disabled:opacity-50">
              {open === v ? 'Cerrar' : 'Conectar'}
            </button>
          )}
        </div>
        {connected ? adding === v && addPanel(v) : open === v && body}
      </div>
    );
  };

  const tuyaForm = st && (
    <div id="smartlife-connect" className="space-y-3">
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

  const ewelinkForm = st && (
    <div id="ewelink-connect" className="space-y-3">
      {st.ewelink.available ? (
        <>
          <p className="text-xs text-ink-muted">Se abre la página de eWeLink: iniciá sesión con tu cuenta (la de la app eWeLink) y aceptá. Volvés a esta pantalla con tus equipos.</p>
          <button type="button" id="ewelink-login" disabled={busy === 'ewelink'} onClick={ewelinkLogin} className="cultiveta-btn-primary text-xs w-full justify-center disabled:opacity-50">
            {busy === 'ewelink' ? 'Conectando…' : 'Iniciar sesión en eWeLink'}
          </button>
        </>
      ) : (
        <p className="text-xs text-ink-muted">Conectar tu cuenta de eWeLink todavía no está habilitado en Cultiveta. Mientras tanto podés probar cómo funciona con equipos de prueba.</p>
      )}
      <button type="button" id="ewelink-mock" disabled={busy === 'ewelink'} onClick={ewelinkMock} className="cultiveta-btn-secondary text-xs w-full justify-center disabled:opacity-50">
        Probar con Sonoff de prueba (sin cuenta)
      </button>
    </div>
  );

  const shellyFormEl = st && (
    <form
      id="shelly-connect"
      className="space-y-2"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        shellyConnect(false);
      }}
    >
      <p className="text-xs text-ink-muted">
        En la app Shelly: <b>Configuración de usuario → Clave de autorización de la nube</b>. Tocá <b>Obtener clave</b> y copiá el <b>server</b> y la <b>clave</b>.
      </p>
      <label className="text-xs font-semibold text-ink-muted block space-y-1">
        <span>Server</span>
        <input id="shelly-server" className={FIELD} placeholder="shelly-103-eu.shelly.cloud" value={shellyForm.server} onChange={(e) => setShellyForm({ ...shellyForm, server: e.target.value })} spellCheck={false} required />
      </label>
      <label className="text-xs font-semibold text-ink-muted block space-y-1">
        <span>Clave de autorización</span>
        <input id="shelly-key" className={FIELD} type="password" autoComplete="new-password" value={shellyForm.authKey} onChange={(e) => setShellyForm({ ...shellyForm, authKey: e.target.value })} required />
      </label>
      <label className="text-xs font-semibold text-ink-muted block space-y-1">
        <span>Device Id (opcional, si alguno no aparece)</span>
        <input id="shelly-ids" className={FIELD} placeholder="a8032ab1c2d3, e8db84d4b2f1" value={shellyForm.ids} onChange={(e) => setShellyForm({ ...shellyForm, ids: e.target.value })} spellCheck={false} />
      </label>
      <p className="text-[11px] text-ink-subtle">La nube de Shelly no deja guardar horarios en el equipo: la luz la maneja la revisión de Cultiveta, que deja programado cada cambio en el Shelly. La bomba se apaga sola igual.</p>
      <button type="submit" id="shelly-submit" disabled={busy === 'shelly'} className="cultiveta-btn-primary text-xs w-full justify-center disabled:opacity-50">
        {busy === 'shelly' ? 'Conectando…' : 'Conectar Shelly'}
      </button>
      <button type="button" id="shelly-mock" disabled={busy === 'shelly'} onClick={() => shellyConnect(true)} className="cultiveta-btn-secondary text-xs w-full justify-center disabled:opacity-50">
        Probar con Shelly de prueba (sin cuenta)
      </button>
    </form>
  );

  return (
    <div id="smartlife-devices" className="space-y-5">
      <section id="devices-connect" className={`${CARD} space-y-3`}>
        <div>
          <h2 className="text-sm font-bold text-ink">Conectar un equipo nuevo</h2>
          <p className="text-xs text-ink-muted mt-1">
            Cada equipo se agrega primero en la app de su marca (Smart Life, eWeLink o Shelly). Después se conecta la marca acá y cada toma o sensor se asigna a un ambiente o cultivo. Si la marca ya está conectada, tocá <b>Agregar otro</b>.
          </p>
        </div>
        {brand('tuya', 'Enchufes, zapatillas y sensores de la app Smart Life o Tuya.', tuyaForm)}
        {brand('ewelink', 'Relés, enchufes y sensores Sonoff de la app eWeLink.', ewelinkForm)}
        {brand('shelly', 'Enchufes, relés y sensores Shelly, por la nube de Shelly.', shellyFormEl)}
        {!st && <p className="text-xs text-ink-muted">{error || 'Cargando tus marcas…'}</p>}
        {st && !anyConnected && error && <p className="text-xs font-bold text-error">{error}</p>}
      </section>

      {anyConnected && (
      <section id="devices-list" className={`${CARD} space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-ink">Tus equipos</h2>
          <button type="button" onClick={() => run('refresh', loadDevices)} className="cultiveta-btn-secondary text-xs" aria-label="Actualizar equipos">
            <RefreshCw className={`w-3.5 h-3.5 ${busy === 'refresh' ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Actualizar</span>
          </button>
        </div>
        <div id="devices-brands" className="space-y-2">
          {VENDORS.filter((v) => connectedText(v)).map((v) => (
            <div key={v} id={`device-connected-${v}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface border border-line px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-ink">{VENDOR_TITLE[v]}</p>
                <p className="text-[11px] font-bold text-ok-ink truncate">{connectedText(v)}</p>
              </div>
              <button type="button" id={`${v}-disconnect`} onClick={() => disconnect(v)} disabled={busy === `disconnect-${v}`} className="cultiveta-btn-secondary text-xs text-error disabled:opacity-50">
                <Unplug className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Desconectar</span>
              </button>
            </div>
          ))}
        </div>
      {Object.values(listErrors).map((m) => (
        <p key={m} className="text-xs font-bold text-coral">
          {m}
        </p>
      ))}
      {error && <p className="text-xs font-bold text-error">{error}</p>}
      {!devices && <p className="text-xs text-ink-muted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Leyendo tus equipos…</p>}
      {devices && !devices.length && (
        <p className="text-xs text-ink-muted">No aparece ningún equipo: agregalos primero en la app de su marca (en Smart Life, además, vinculá tu cuenta al proyecto: Devices → Link App Account) y tocá Actualizar.</p>
      )}
      {devices?.map((d) => (
        <div key={d.id} className={`smart-device ${ITEM} space-y-2`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-ink">{d.name}</p>
              <p className="text-[11px] text-ink-subtle">
                {VENDOR_LABEL[d.vendor] || 'Smart Life'} · {d.product}
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
                        hasLight={lightIn(ch.binding.cultivationId)}
                        hasSensor={sensorIn(ch.binding.cultivationId)}
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
                    {(ch.binding.role === 'light' || ch.binding.role === 'climate') && (
                      <div className="flex flex-wrap items-center gap-2">
                        <ManualPowerButton
                          binding={{ ...(ch.binding as DeviceBindingState), on: ch.on, online: d.online }}
                          female={ch.binding.role === 'light'}
                          onToast={toast}
                          onDone={async () => {
                            await loadDevices();
                          }}
                        />
                        {manualText(ch.binding, Date.now(), ch.binding.role === 'light') && (
                          <span className="device-manual-note text-[11px] font-bold text-brand">{manualText(ch.binding, Date.now(), ch.binding.role === 'light')}</span>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3">
                      {ch.binding.role === 'pump' && editing !== `${ch.binding.id}|auto` && (
                        <button type="button" onClick={() => setEditing(`${ch.binding!.id}|auto`)} className="pump-auto-btn text-[11px] font-bold text-brand hover:underline">
                          Riego automático
                        </button>
                      )}
                      {(ch.binding.role === 'climate' || ch.binding.role === 'pump') && editing !== ch.binding.id && (
                        <button type="button" onClick={() => setEditing(ch.binding!.id)} className="text-[11px] font-bold text-brand hover:underline">
                          {ch.binding.role === 'pump' ? 'Caudal y topes' : 'Cómo se maneja'}
                        </button>
                      )}
                      <button type="button" onClick={() => run(key, async () => { await devicesService.unbind(ch.binding!.id); await loadDevices(); }, 'Asignación quitada')} className="text-[11px] font-bold text-ink-muted hover:underline">
                        {d.vendor === 'shelly' ? 'Desasignar' : `Desasignar (vuelven tus horarios de ${VENDOR_LABEL[d.vendor] || 'Smart Life'})`}
                      </button>
                    </div>
                  </div>
                ) : cultivations.length || indoors.length ? (
                  (() => {
                    const canLight = targetsFor('light').length > 0;
                    const u = use[key] || (canLight ? 'light' : 'exhaust');
                    const list = targetsFor(u);
                    const chosen = pickTarget(key, list);
                    return (
                      <div className="flex flex-wrap items-center gap-2">
                        <select className={SMALL} value={u} onChange={(e) => setUse({ ...use, [key]: e.target.value as Use })} aria-label="Para qué se usa">
                          {canLight && <option value="light">Luz</option>}
                          {ch.hasCountdown && <option value="pump">Bomba de riego</option>}
                          {(Object.keys(CLIMATE_ROLES) as ClimateRole[]).map((r) => (
                            <option key={r} value={r}>
                              {CLIMATE_ROLES[r].label}
                            </option>
                          ))}
                        </select>
                        <select className={SMALL} value={chosen?.key} onChange={(e) => setTarget({ ...target, [key]: e.target.value })} aria-label="Ambiente o cultivo">
                          {list.map((t) => (
                            <option key={t.key} value={t.key}>
                              {t.kind === 'indoor' ? `${t.name} (ambiente)` : t.name}
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
              {!d.sensorBindings.length && targetsFor(d.sensors.soil != null ? 'sensor_soil' : 'sensor_th').length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="min-h-9 px-2 rounded-xl bg-white border border-line text-xs text-ink"
                    value={pickTarget(`${d.id}|sensor`, targetsFor(d.sensors.soil != null ? 'sensor_soil' : 'sensor_th'))?.key}
                    onChange={(e) => setTarget({ ...target, [`${d.id}|sensor`]: e.target.value })}
                    aria-label="Ambiente o cultivo"
                  >
                    {targetsFor(d.sensors.soil != null ? 'sensor_soil' : 'sensor_th').map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.kind === 'indoor' ? `${t.name} (ambiente)` : t.name}
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
      </section>
      )}
    </div>
  );
};

export default SmartLifePanel;
