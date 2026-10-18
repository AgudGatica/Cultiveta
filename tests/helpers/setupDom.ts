/**
 * tests/helpers/setupDom.ts
 *
 * Entorno DOM (jsdom) compartido para las suites que montan componentes de React.
 *
 * IMPORTANTE: tiene que ser el PRIMER import de la suite. Los `import` se evalúan antes que el
 * resto del archivo: si react-dom se carga sin `window`, no conecta los eventos de input y los
 * campos controlados no reaccionan a los cambios (los tests no lo detectarían).
 */
import { JSDOM } from 'jsdom';

export const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000',
  pretendToBeVisual: true,
});

globalThis.window = dom.window as any;
globalThis.document = dom.window.document;
globalThis.Event = dom.window.Event as any;
globalThis.CustomEvent = dom.window.CustomEvent as any;
globalThis.localStorage = dom.window.localStorage as any;
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});
(globalThis as any).HTMLElement = dom.window.HTMLElement;
(globalThis as any).HTMLInputElement = dom.window.HTMLInputElement;
(globalThis as any).HTMLSelectElement = dom.window.HTMLSelectElement;
(globalThis as any).HTMLButtonElement = dom.window.HTMLButtonElement;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
