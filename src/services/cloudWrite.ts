/**
 * Guarda en Firestore sin esperar respuesta del servidor. Sin conexión esa respuesta no llega nunca: la pantalla
 * quedaría en "Guardando…". El dato ya está en el celular y Firestore lo manda solo cuando vuelve la señal.
 * Si el servidor lo rechaza (por ejemplo, venció la sesión), se avisa en pantalla.
 */
export const CLOUD_WRITE_FAILED_EVENT = 'cultiveta_cloud_write_failed';

export function cloudWrite(write: () => Promise<unknown>, onSaved?: () => void): void {
  const failed = (err: any) => {
    console.warn('[cloudWrite] No se pudo guardar en la nube:', err?.code || err?.message || err);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CLOUD_WRITE_FAILED_EVENT, { detail: { code: err?.code } }));
  };
  try {
    write().then(() => onSaved?.()).catch(failed);
  } catch (err) {
    failed(err);
  }
}
