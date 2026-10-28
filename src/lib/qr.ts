/**
 * Contenido del QR: `ASIS1:<token>`. El token son 128 bits aleatorios (base64url),
 * sin datos personales. Cambiar el nombre del alumno no lo afecta; solo se
 * invalida si un administrador lo regenera.
 */
export const QR_PREFIX = "ASIS1:";

export function generateQrToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function qrPayload(token: string): string {
  return QR_PREFIX + token;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

/** Devuelve el token si el texto leído tiene el formato esperado; si no, null. */
export function parseQrPayload(raw: string): string | null {
  const text = raw.trim();
  if (!text.startsWith(QR_PREFIX)) return null;
  const token = text.slice(QR_PREFIX.length);
  return TOKEN_RE.test(token) ? token : null;
}
