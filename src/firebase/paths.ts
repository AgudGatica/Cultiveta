/**
 * Centralized Firebase Paths for Firestore collections and Storage buckets.
 * Ensures consistent, deterministic paths across client and server.
 *
 * MIGRATION PLAN (FASE 6):
 * Currently the active schema uses top-level collections with a 'userId' property
 * (photos, cultivations, etc.) secured by firestore.rules and client-side where('userId', '==', ...).
 *
 * TARGET SCHEMA (Future Planned Migration):
 * - users/{uid}
 * - users/{uid}/cultivations/{cultivationId}
 * - users/{uid}/cultivations/{cultivationId}/photos/{photoId}
 * - users/{uid}/cultivations/{cultivationId}/analyses/{analysisId}
 *
 * Guidelines for future migration:
 * 1. Do NOT execute automatic global migration on client boot.
 * 2. Perform export backup before moving documents.
 * 3. Use an administrative dual-read adapter during transition so historical records remain accessible.
 */

export const FIRESTORE_COLLECTIONS = {
  USERS: 'users',
  CULTIVATIONS: 'cultivations',
  PHOTOS: 'photos',
  PHOTO_ANALYSES: 'photoAnalyses',
  WATERINGS: 'waterings',
  ENVIRONMENT_RECORDS: 'environmentRecords',
  DIARY: 'diary',
  HARVESTS: 'harvests',
  TASKS: 'tasks',
  GENETICS: 'genetics',
  GENETICS_CATALOG_PHOTOS: 'geneticsCatalogPhotos',
} as const;

/**
 * Deterministic Storage path for cultivation photos.
 * Pattern: users/{userId}/cultivations/{cultivationId}/photos/{photoId}.{ext}
 * Re-attempts will re-use this exact path to avoid orphaned duplicates.
 */
export function getPhotoStoragePath(
  userId: string,
  cultivationId: string,
  photoId: string,
  extension = 'jpg'
): string {
  const cleanExt = extension.replace(/^\./, '').toLowerCase() || 'jpg';
  return `users/${userId}/cultivations/${cultivationId}/photos/${photoId}.${cleanExt}`;
}

/**
 * Storage path for user avatar.
 */
export function getUserAvatarStoragePath(userId: string): string {
  return `users/${userId}/avatar/profile.jpg`;
}
