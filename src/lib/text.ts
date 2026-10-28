/** Normaliza para búsquedas y duplicados: minúsculas, sin acentos, espacios simples. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanName(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function cleanEnrollment(s: string | null | undefined): string | null {
  const v = (s ?? "").toString().trim().toUpperCase();
  return v ? v : null;
}
