import { describe, expect, it } from "vitest";
import { generateQrToken, parseQrPayload, qrPayload } from "./qr";
import { csvEscape, toCsv } from "./csv";
import { addDays, dateInZone, isValidYmd } from "./time";
import { validateImport } from "./importStudents";
import { computeLiveSummary, studentStats, totalsFromRecords } from "./attendance";
import { normalizeText } from "./text";
import { ScanGate } from "@/scanner/scanGate";
import type { AttendanceRecord, Student } from "@/types";

describe("QR", () => {
  it("genera tokens únicos de 22 caracteres base64url", () => {
    const set = new Set(Array.from({ length: 2000 }, generateQrToken));
    expect(set.size).toBe(2000);
    for (const t of set) expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
  it("acepta solo QR del sistema", () => {
    const t = generateQrToken();
    expect(parseQrPayload(qrPayload(t))).toBe(t);
    expect(parseQrPayload("  " + qrPayload(t) + "\n")).toBe(t);
    expect(parseQrPayload("https://example.com")).toBeNull();
    expect(parseQrPayload("ASIS1:corto")).toBeNull();
    expect(parseQrPayload("ASIS1:" + t + "x")).toBeNull();
    expect(parseQrPayload("Juan Pérez")).toBeNull();
  });
  it("el contenido no incluye datos personales", () => {
    expect(qrPayload("AAAAAAAAAAAAAAAAAAAAAA")).toBe("ASIS1:AAAAAAAAAAAAAAAAAAAAAA");
  });
});

describe("ScanGate (anti-duplicados del escáner)", () => {
  it("bloquea lecturas simultáneas del mismo código", () => {
    let t = 0;
    const g = new ScanGate(2500, () => t);
    expect(g.tryAcquire("A")).toBe(true);
    // 20 lecturas casi simultáneas mientras se guarda
    for (let i = 0; i < 20; i++) expect(g.tryAcquire("A")).toBe(false);
    expect(g.tryAcquire("B")).toBe(true); // otro alumno no se bloquea
    t = 100;
    g.release("A");
    t = 1000;
    expect(g.tryAcquire("A")).toBe(false); // dentro del enfriamiento
    t = 1000 + 2600;
    expect(g.tryAcquire("A")).toBe(true);
  });
  it("un QR que sigue frente a la cámara no se vuelve a disparar", () => {
    let t = 0;
    const g = new ScanGate(2500, () => t);
    g.tryAcquire("A");
    g.release("A");
    for (t = 200; t < 10000; t += 200) expect(g.tryAcquire("A")).toBe(false);
  });
  it("forget permite reintentar tras un error", () => {
    let t = 0;
    const g = new ScanGate(2500, () => t);
    g.tryAcquire("A");
    g.release("A");
    g.forget("A");
    t = 10;
    expect(g.tryAcquire("A")).toBe(true);
  });
});

describe("CSV", () => {
  it("escapa comillas, comas, saltos y fórmulas", () => {
    expect(csvEscape('Hola, "mundo"')).toBe('"Hola, ""mundo"""');
    expect(csvEscape("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvEscape(null)).toBe("");
    expect(toCsv(["a", "b"], [[1, "x\ny"]])).toBe('a,b\r\n1,"x\ny"');
  });
});

describe("Fechas por zona horaria", () => {
  it("usa la zona de la institución, no la del dispositivo", () => {
    const d = new Date("2026-03-01T04:30:00Z"); // 22:30 del 28-feb en CDMX
    expect(dateInZone(d, "America/Mexico_City")).toBe("2026-02-28");
    expect(dateInZone(d, "Europe/Madrid")).toBe("2026-03-01");
  });
  it("aritmética de días y validación", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(isValidYmd("2026-02-30")).toBe(false);
    expect(isValidYmd("2026-02-28")).toBe(true);
  });
});

describe("Importación de alumnos", () => {
  const groups = [{ id: "g1", name: "2.º A" }, { id: "g2", name: "3B" }];
  const existing = [{ fullName: "Ana López", enrollmentId: "A001", groupId: "g1" }];

  it("valida filas, duplicados y errores", () => {
    const rows = [
      ["Nombre", "Matrícula", "Grupo"],
      ["Luis Pérez", "a002", "2.º a"],
      ["", "A003", "3B"],
      ["Otra Persona", "A001", "3B"], // matrícula ya existe
      ["  ana   lópez ", "", "2.º A"], // mismo nombre en el grupo
      ["Rosa Díaz", "A002", "3B"], // matrícula repetida en el archivo
      ["Pedro Gil", "", "4C"], // grupo inexistente
      ["", "", ""], // vacía: se ignora
    ];
    const { results, missingGroups, headerError } = validateImport(rows, { groups, existingStudents: existing });
    expect(headerError).toBeUndefined();
    expect(results.map((r) => r.status)).toEqual(["ok", "error", "duplicate", "duplicate", "error", "ok"]);
    expect(results[0]).toMatchObject({ fullName: "Luis Pérez", enrollmentId: "A002", groupId: "g1", groupName: "2.º A" });
    expect(results[5]).toMatchObject({ groupId: null, groupName: "4C" });
    expect(missingGroups).toEqual(["4C"]);
  });

  it("usa el grupo por defecto y columnas de nombre separadas", () => {
    const rows = [
      ["Nombres", "Apellido paterno", "Apellido materno"],
      ["María José", "Ruiz", "Soto"],
    ];
    const { results } = validateImport(rows, { groups, existingStudents: [], defaultGroupId: "g2" });
    expect(results[0]).toMatchObject({ status: "ok", fullName: "María José Ruiz Soto", groupId: "g2" });
  });

  it("exige columna de nombre y grupo", () => {
    expect(validateImport([["x"], ["y"]], { groups, existingStudents: [] }).headerError).toBeTruthy();
    expect(validateImport([["nombre"], ["y"]], { groups, existingStudents: [] }).headerError).toMatch(/grupo/);
  });
});

describe("Cálculos de asistencia", () => {
  const st = (id: string, active = true) => ({ id, active }) as Student;
  const rec = (studentId: string, status: AttendanceRecord["status"], sessionId = "s1") => ({ studentId, status, sessionId }) as AttendanceRecord;

  it("resumen en vivo", () => {
    const students = [st("a"), st("b"), st("c"), st("d")];
    const map = new Map([["a", rec("a", "present")], ["b", rec("b", "late")], ["z", rec("z", "present")]]);
    expect(computeLiveSummary(students, map)).toMatchObject({ total: 4, attended: 2, late: 1, pending: 2, percent: 50 });
  });

  it("totales de sesión", () => {
    expect(totalsFromRecords([rec("a", "present"), rec("b", "absent"), rec("c", "absent")], 5)).toEqual({ total: 5, present: 1, late: 0, absent: 2, justified: 0 });
  });

  it("porcentaje por alumno excluye justificadas y cuenta 'sin registro'", () => {
    const by = new Map([["s1", rec("a", "present", "s1")], ["s2", rec("a", "late", "s2")], ["s3", rec("a", "justified", "s3")]]);
    const s = studentStats(["s1", "s2", "s3", "s4"], by);
    expect(s).toMatchObject({ sessions: 4, present: 1, late: 1, justified: 1, noRecord: 1 });
    expect(s.percent).toBe(66.7);
    expect(studentStats([], new Map()).percent).toBeNull();
  });

  it("normaliza texto para búsquedas", () => {
    expect(normalizeText("  José   MARÍA ")).toBe("jose maria");
  });
});
