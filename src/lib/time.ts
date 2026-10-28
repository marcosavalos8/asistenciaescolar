/**
 * Fechas en la zona horaria de la institución. El reloj del teléfono puede estar
 * desfasado, así que se corrige con un offset calculado contra el servidor de
 * Firebase (ver AuthProvider: escribe `lastSeen` con serverTimestamp y lo compara).
 */
let serverOffsetMs = 0;

export function setServerOffset(ms: number) {
  // Ignora diferencias absurdas (p. ej. un snapshot muy tardío)
  if (Number.isFinite(ms) && Math.abs(ms) < 1000 * 60 * 60 * 24 * 2) serverOffsetMs = ms;
}

export function now(): Date {
  return new Date(Date.now() + serverOffsetMs);
}

/** YYYY-MM-DD de `date` en la zona `timeZone`. */
export function dateInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function todayInZone(timeZone: string): string {
  return dateInZone(now(), timeZone);
}

export function timeInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function dateTimeInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

/** Suma días a una fecha YYYY-MM-DD (aritmética de calendario, sin zona). */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function formatLongDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatShortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function listTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [
      "America/Mexico_City", "America/Monterrey", "America/Chihuahua", "America/Hermosillo",
      "America/Mazatlan", "America/Tijuana", "America/Cancun", "America/Bogota", "America/Lima",
      "America/Santiago", "America/Argentina/Buenos_Aires", "Europe/Madrid", "UTC",
    ];
  }
}
