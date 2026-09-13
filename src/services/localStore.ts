/**
 * Local Store utility for reliable offline-first and hybrid persistence.
 * Ensures data is immediately stored locally and survives even if Cloud Firestore
 * API is temporarily disabled, unreachable, or in demo mode.
 */

function getStorageKey(collectionName: string, userId: string): string {
  return `cultiveta_${collectionName}_${userId}`;
}

function getItems<T>(collectionName: string, userId: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(collectionName, userId));
    if (!raw) return [];
    return JSON.parse(raw) as T[];
  } catch (err) {
    console.warn(`[localStore] Failed to read ${collectionName} for ${userId}`, err);
    return [];
  }
}

function notify(collectionName: string, userId: string, items: any[]): void {
  if (typeof window === 'undefined') return;
  try {
    const eventName = `cultiveta_update_${collectionName}_${userId}`;
    window.dispatchEvent(new CustomEvent(eventName, { detail: items }));
  } catch (e) {
    // Ignore
  }
}

function saveItem<T extends { id: string; userId?: string }>(collectionName: string, item: T): void {
  if (typeof window === 'undefined') return;
  const uid = item.userId || 'default_user';
  try {
    const items = getItems<T>(collectionName, uid);
    const existingIdx = items.findIndex((i) => i.id === item.id);
    let updated: T[];
    if (existingIdx >= 0) {
      updated = [...items];
      updated[existingIdx] = { ...updated[existingIdx], ...item };
    } else {
      updated = [item, ...items];
    }
    localStorage.setItem(getStorageKey(collectionName, uid), JSON.stringify(updated));
    notify(collectionName, uid, updated);
  } catch (err) {
    console.warn(`[localStore] Failed to save item in ${collectionName}`, err);
  }
}

function saveAll<T extends { id: string; userId?: string }>(collectionName: string, userId: string, items: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(collectionName, userId), JSON.stringify(items));
    notify(collectionName, userId, items);
  } catch (err) {
    console.warn(`[localStore] Failed to save all in ${collectionName}`, err);
  }
}

function deleteItem<T extends { id: string }>(collectionName: string, id: string, userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const items = getItems<T>(collectionName, userId);
    const filtered = items.filter((i) => i.id !== id);
    localStorage.setItem(getStorageKey(collectionName, userId), JSON.stringify(filtered));
    notify(collectionName, userId, filtered);
  } catch (err) {
    console.warn(`[localStore] Failed to delete item in ${collectionName}`, err);
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

export const localStore = {
  getStorageKey,
  getItems,
  saveItem,
  saveAll,
  deleteItem,
  notify,
  subscribe,
};

