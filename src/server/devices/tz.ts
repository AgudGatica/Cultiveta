/**
 * Horas en la zona horaria de la persona. El servidor corre en UTC (Cloud Run): las programaciones de
 * Smart Life se escriben con la fecha y la hora de la zona de quien usa la app (p. ej. Argentina), que
 * manda el navegador junto con el horario del cultivo.
 */

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** ¿Es una zona horaria que entiende el sistema? ("America/Argentina/Buenos_Aires" sí; "Marte" no). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(ms: number, timeZone: string): ZonedParts {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour % 24, minute: +parts.minute };
}

const pad = (n: number) => String(n).padStart(2, '0');
/** "20261031" en esa zona. */
export const zonedDateKey = (ms: number, timeZone: string): string => {
  const p = zonedParts(ms, timeZone);
  return `${p.year}${pad(p.month)}${pad(p.day)}`;
};
/** "18:00" en esa zona. */
export const zonedClock = (ms: number, timeZone: string): string => {
  const p = zonedParts(ms, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
};

/** Diferencia con UTC en minutos en ese momento (Argentina: -180). */
export function offsetMinutes(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(ms / 60000) * 60000) / 60000);
}

/** "-03:00" (lo que pide Tuya en time_zone). */
export function offsetString(ms: number, timeZone: string): string {
  const off = offsetMinutes(ms, timeZone);
  const a = Math.abs(off);
  return `${off >= 0 ? '+' : '-'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** Fecha y hora de esa zona → ms (por ejemplo "20261031" "18:00" en Argentina). */
export function zonedToMs(dateKey: string, clock: string, timeZone: string): number {
  const y = +dateKey.slice(0, 4), mo = +dateKey.slice(4, 6), d = +dateKey.slice(6, 8);
  const [h, mi] = clock.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let ms = guess - offsetMinutes(guess, timeZone) * 60000;
  ms = guess - offsetMinutes(ms, timeZone) * 60000; // segunda pasada por si el cambio de horario cae justo ahí
  return ms;
}
