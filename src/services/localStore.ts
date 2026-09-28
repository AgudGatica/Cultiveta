/**
 * Local Store utility for reliable offline-first and hybrid persistence.
 * Ensures data is stored locally and survives even if Cloud Firestore
 * API is temporarily disabled or unreachable.
 *
 * FASE 2: No guarda imágenes binarias pesadas en localStorage para evitar
 * QuotaExceededError. Maneja excepciones de cuota explícitamente y preserva
 * compatibilidad de lectura con registros legados.
 */

function getStorageKey(collectionName: string, userId: string): string {
  return `cultiveta_${collectionName}_${userId}`;
}

/**
 * Sanitiza elementos para no almacenar cadenas base64 gigantescas en localStorage
 */
function sanitizeForLocalStorage<T>(collectionName: string, item: T): T {
  if (collectionName !== 'photos') return item;

  const photo = item as any;
  if (!photo) return item;

  // Si la URL es una data:image/ muy pesada (más de 10KB), no almacenarla completa en localStorage.
  // El binario real reside en IndexedDB (pending_photos).
  if (typeof photo.url === 'string' && photo.url.startsWith('data:image/') && photo.url.length > 10240) {
    return {
      ...photo,
      // Conservar metadatos pero evitar saturar los ~5MB de cuota de localStorage
      url: photo.storagePath ? photo.url : (photo.previewDataUrl ? photo.previewDataUrl : photo.url),
      isHeavyPayloadSanitized: true,
    };
  }

  return item;
}

function getItems<T>(collectionName: string, userId: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(collectionName, userId));
    if (!raw) return [];
    return JSON.parse(raw) as T[];
  } catch (err) {
    console.warn(`[localStore] Error al leer colección "${collectionName}" para usuario "${userId}":`, err);
    return [];
  }
}

function notify(collectionName: string, userId: string, items: any[]): void {
  if (typeof window === 'undefined') return;
  try {
    const eventName = `cultiveta_update_${collectionName}_${userId}`;
    window.dispatchEvent(new CustomEvent(eventName, { detail: items }));
  } catch {
    // Ignore notification errors
  }
}

function notifyQuotaError(collectionName: string, error: unknown): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('cultiveta_storage_quota_exceeded', {
      detail: { collectionName, error: String(error) },
    })
  );
}

function saveItem<T extends { id: string; userId?: string }>(collectionName: string, item: T): boolean {
  if (typeof window === 'undefined') return false;
  const uid = item.userId || 'default_user';
  try {
    const sanitized = sanitizeForLocalStorage(collectionName, item);
    const items = getItems<T>(collectionName, uid);
    const existingIdx = items.findIndex((i) => i.id === sanitized.id);
    let updated: T[];
    if (existingIdx >= 0) {
      updated = [...items];
      updated[existingIdx] = { ...updated[existingIdx], ...sanitized };
    } else {
      updated = [sanitized, ...items];
    }
    localStorage.setItem(getStorageKey(collectionName, uid), JSON.stringify(updated));
    notify(collectionName, uid, updated);
    return true;
  } catch (err: any) {
    console.warn(`[localStore] Error al guardar elemento en ${collectionName}:`, err?.name || err);
    if (err?.name === 'QuotaExceededError' || err?.code === 22) {
      notifyQuotaError(collectionName, err);
    }
    return false;
  }
}

function saveAll<T extends { id: string; userId?: string }>(collectionName: string, userId: string, items: T[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const sanitizedItems = items.map((i) => sanitizeForLocalStorage(collectionName, i));
    localStorage.setItem(getStorageKey(collectionName, userId), JSON.stringify(sanitizedItems));
    notify(collectionName, userId, sanitizedItems);
    return true;
  } catch (err: any) {
    console.warn(`[localStore] Error al guardar colección completa ${collectionName}:`, err?.name || err);
    if (err?.name === 'QuotaExceededError' || err?.code === 22) {
      notifyQuotaError(collectionName, err);
    }
    return false;
  }
}

function deleteItem<T extends { id: string }>(collectionName: string, id: string, userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const items = getItems<T>(collectionName, userId);
    const filtered = items.filter((i) => i.id !== id);
    localStorage.setItem(getStorageKey(collectionName, userId), JSON.stringify(filtered));
    notify(collectionName, userId, filtered);
  } catch (err: any) {
    console.warn(`[localStore] Error al eliminar elemento en ${collectionName}:`, err);
  }
}

function subscribe<T>(collectionName: string, userId: string, callback: (items: T[]) => void): () => void {
  // 1. Initial emission
  const initial = getItems<T>(collectionName, userId);
  callback(initial);

  // 2. Listen for future changes
  const eventName = `cultiveta_update_${collectionName}_${userId}`;
  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<T[]>;
    if (customEvent.detail) {
      callback(customEvent.detail);
    } else {
      callback(getItems<T>(collectionName, userId));
    }
  };

  window.addEventListener(eventName, handler);
  return () => {
    window.removeEventListener(eventName, handler);
  };
}

function clearUserData(userId: string): void {
  if (typeof window === 'undefined') return;
  const collections = [
    'cultivations',
    'waterings',
    'environmentRecords',
    'photos',
    'genetics',
    'harvests',
    'diaryEntries',
    'favoriteGenetics',
  ];
  collections.forEach((col) => {
    try {
      localStorage.removeItem(getStorageKey(col, userId));
    } catch {
      // Ignore
    }
  });
}

export const localStore = {
  getStorageKey,
  getItems,
  saveItem,
  saveAll,
  deleteItem,
  clearUserData,
  subscribe,
};
