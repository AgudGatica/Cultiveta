import React, { useEffect, useState } from 'react';
import { Droplets, ExternalLink, Lightbulb, Plug, Thermometer } from 'lucide-react';
import {
  DEVICE_BRANDS,
  DEVICE_USES,
  SHOP_ITEMS,
  SHOP_SECTIONS,
  formatArs,
  mercadoLibreUrl,
  type DeviceUse,
  type ShopSection,
} from '../../data/deviceCatalog';

interface DevicesViewProps {
  /** Desde dónde se llegó (la luz, el ambiente o el riego de un cultivo): se resalta eso. */
  focus?: DeviceUse | null;
  /** Equipos conectados. Todavía no hay conexión real: la lista viene vacía. */
  hasDevices?: boolean;
}

const USE_ICON: Record<DeviceUse, React.ElementType> = { luz: Lightbulb, ambiente: Thermometer, riego: Droplets };
const SECTION_FOR_USE: Record<DeviceUse, ShopSection> = { luz: 'enchufes', ambiente: 'sensores', riego: 'riego' };
const CARD = 'bg-white rounded-[28px] p-5 sm:p-6 border border-line shadow-2xs';
const ITEM = 'bg-surface rounded-3xl p-4 border border-line';

/**
 * Equipos (traído de Órbita): los equipos conectados, cómo conectar uno nuevo por marca y, si todavía
 * no hay ninguno, qué comprar. La conexión real con cada marca llega en la próxima etapa.
 * Todo va dentro de tarjetas blancas: sobre el fondo de color de la página los textos no se leen.
 */
export const DevicesView: React.FC<DevicesViewProps> = ({ focus = null, hasDevices = false }) => {
  const [section, setSection] = useState<ShopSection | 'todo'>(focus ? SECTION_FOR_USE[focus] : 'todo');

  useEffect(() => {
    if (!focus) return;
    setSection(SECTION_FOR_USE[focus]);
    const el = document.getElementById(`device-use-${focus}`);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focus]);

  const items = SHOP_ITEMS.filter((i) => section === 'todo' || i.section === section);

  return (
    <div id="devices-view" className="space-y-5 max-w-3xl mx-auto">
      <section id="devices-mine" className={`${CARD} space-y-3`}>
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-icon-bg text-brand">
            <Plug className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-ink">Equipos</h1>
            <p className="text-xs text-ink-muted">Enchufes, sensores y riego conectados a tus cultivos.</p>
          </div>
        </div>
        <p className="text-sm text-ink">
          Todavía no conectaste ningún equipo. Mientras tanto, la luz, el ambiente y el riego se cargan a mano en cada cultivo.
        </p>
      </section>

      <section id="devices-connect" className={`${CARD} space-y-3`}>
        <div>
          <h2 className="text-sm font-bold text-ink">Conectar un equipo nuevo</h2>
          <p className="text-xs text-ink-muted mt-1">
            Cada equipo se agrega primero en la app de su marca. Después se conecta acá y se asigna a un cultivo.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {DEVICE_BRANDS.map((b) => (
            <div key={b.id} id={`device-brand-${b.id}`} className={`${ITEM} flex flex-col gap-2`}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-bold text-ink">{b.label}</span>
                <span className="text-[9px] font-black tracking-wider uppercase bg-warn-bg border border-warn-line text-warn-ink px-1.5 py-0.5 rounded-md shrink-0">
                  Próximamente
                </span>
              </div>
              <p className="text-[11px] text-ink-muted flex-1">{b.description}</p>
              <button type="button" disabled className="cultiveta-btn-secondary text-xs opacity-50 cursor-not-allowed">
                Conectar {b.app}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section id="devices-uses" className={`${CARD} space-y-3`}>
        <h2 className="text-sm font-bold text-ink">Qué hace cada equipo en tu cultivo</h2>
        <div className="grid grid-cols-1 gap-3">
          {DEVICE_USES.map((u) => {
            const Icon = USE_ICON[u.id];
            const on = focus === u.id;
            return (
              <div key={u.id} id={`device-use-${u.id}`} className={`${ITEM} flex gap-3 ${on ? 'border-brand ring-2 ring-brand/20' : ''}`}>
                <div className="p-2 rounded-xl bg-icon-bg text-brand h-fit">
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-bold text-ink">{u.title}</p>
                  <p className="text-xs text-ink-muted mt-0.5">{u.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {!hasDevices && (
        <section id="devices-shop" className={`${CARD} space-y-3`}>
          <div>
            <h2 className="text-sm font-bold text-ink">Qué comprar</h2>
            <p className="text-xs text-ink-muted mt-1">Si todavía no tenés equipos, estos funcionan bien en una carpa.</p>
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de equipo">
            {(['todo', 'enchufes', 'sensores', 'riego'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={section === s}
                onClick={() => setSection(s)}
                className={`min-h-9 px-3 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                  section === s ? 'bg-brand-deep text-white border-brand-deep' : 'bg-white text-ink border-line hover:bg-track'
                }`}
              >
                {s === 'todo' ? 'Todos' : SHOP_SECTIONS[s]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {items.map((i) => (
              <article key={i.id} className={`shop-item ${ITEM} flex flex-col gap-2`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-ink">{i.name}</p>
                    <p className="text-[11px] text-ink-subtle">
                      {i.brand} · {i.install}
                    </p>
                  </div>
                  {i.recommended && (
                    <span className="text-[9px] font-black tracking-wider uppercase bg-ok-bg border border-ok-line text-ok-ink px-1.5 py-0.5 rounded-md shrink-0">
                      Ideal para empezar
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-muted flex-1">{i.why}</p>
                <p className="text-xs font-bold text-ink">
                  {formatArs(i.ars[0])} – {formatArs(i.ars[1])} <span className="font-medium text-ink-subtle">(orientativo)</span>
                </p>
                <a
                  href={mercadoLibreUrl(i.query)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cultiveta-btn-secondary text-xs justify-center"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Buscar en Mercado Libre</span>
                </a>
              </article>
            ))}
          </div>
          <p className="text-[11px] text-ink-subtle">Precios orientativos. Cultiveta no vende estos equipos ni cobra por los enlaces.</p>
        </section>
      )}
    </div>
  );
};

export default DevicesView;
