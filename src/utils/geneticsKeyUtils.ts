/**
 * Utilidad canónica y compartida para normalización de claves de genéticas (cliente y servidor).
 * 
 * Reglas de normalización:
 * - lowercase;
 * - Unicode normalize NFD;
 * - remover diacríticos (/[\u0300-\u036f]/g);
 * - cualquier secuencia no alfanumérica → un solo "-";
 * - trim de guiones iniciales y finales;
 * - formato canónico: `${bank}__${name}`.
 * 
 * Ejemplos:
 * "Barney's Farm" -> "barney-s-farm"
 * "Mokum's Tulip" -> "mokum-s-tulip"
 * "Skunk #1" -> "skunk-1"
 * ("Sensi Seeds", "Skunk #1") -> "sensi-seeds__skunk-1"
 */

export function normalizeGeneticsSlug(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getGeneticsPhotoKey(seedBank: string, name: string): string {
  const cleanBank = normalizeGeneticsSlug(seedBank);
  const cleanName = normalizeGeneticsSlug(name);
  return `${cleanBank}__${cleanName}`;
}
