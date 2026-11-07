/** Un número como se escribe acá: coma decimal y sin ceros de más (1,5 · 2 · 6,2). Sin dato: "—". */
export function dec(value: number | string | null | undefined, digits = 2): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  const factor = 10 ** digits;
  return String(Math.round(n * factor) / factor).replace('.', ',');
}

/** Día y mes como se leen acá: "2026-11-06" → "6/11". */
export function dayMonth(iso: string): string {
  const [, month, day] = iso.slice(0, 10).split('-');
  return `${Number(day)}/${Number(month)}`;
}
