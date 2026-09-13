/**
 * Recursively removes all keys with undefined values from objects and arrays
 * so they can be safely saved to Firebase Firestore without throwing:
 * "Unsupported field value: undefined"
 */
export function cleanFirestoreData<T>(obj: T): T {
  if (obj === undefined) {
    return undefined as any;
  }
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => cleanFirestoreData(item)) as any;
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      const cleanedValue = cleanFirestoreData(value);
      if (cleanedValue !== undefined) {
        clean[key] = cleanedValue;
      }
    }
  }
  return clean as T;
}
