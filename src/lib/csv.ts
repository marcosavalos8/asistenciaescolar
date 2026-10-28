export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // Evita inyección de fórmulas al abrir el CSV en Excel/Sheets
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  // BOM para que Excel reconozca UTF-8 (acentos, ñ)
  const blob = new Blob(["﻿" + content], { type: mime });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "archivo"
  );
}
