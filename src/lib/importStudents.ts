import { cleanEnrollment, cleanName, normalizeText } from "./text";

export interface ImportRowResult {
  line: number; // número de fila en el archivo (1 = encabezado)
  fullName: string;
  enrollmentId: string | null;
  groupName: string;
  /** id del grupo existente, o null si el grupo no existe todavía */
  groupId: string | null;
  status: "ok" | "duplicate" | "error";
  message?: string;
}

export interface ImportContext {
  groups: { id: string; name: string }[];
  existingStudents: { fullName: string; enrollmentId: string | null; groupId: string }[];
  /** grupo a usar cuando el archivo no trae columna de grupo o la celda está vacía */
  defaultGroupId?: string | null;
}

const NAME_HEADERS = ["nombre", "nombre completo", "alumno", "estudiante", "name", "full name"];
const ENROLL_HEADERS = ["matricula", "numero de control", "no. control", "id", "numero", "num", "clave", "enrollment"];
const GROUP_HEADERS = ["grupo", "salon", "grado y grupo", "group", "clase"];
// Para archivos con nombre separado en columnas
const FIRST_HEADERS = ["nombre(s)", "nombres", "nombre"];
const LAST1_HEADERS = ["apellido paterno", "primer apellido", "apellido"];
const LAST2_HEADERS = ["apellido materno", "segundo apellido"];

function findCol(headers: string[], options: string[]): number {
  return headers.findIndex((h) => options.includes(h));
}

/**
 * Valida filas importadas (CSV o Excel ya convertidos a texto).
 * Reglas: nombre obligatorio; grupo existente (o el grupo por defecto);
 * matrícula única en el archivo y en la base; mismo nombre en el mismo grupo = duplicado.
 */
export function validateImport(rows: string[][], ctx: ImportContext): { results: ImportRowResult[]; headerError?: string; missingGroups: string[] } {
  const nonEmpty = rows.filter((r) => r.some((c) => (c ?? "").toString().trim() !== ""));
  if (nonEmpty.length < 2) return { results: [], headerError: "El archivo está vacío o solo tiene encabezados.", missingGroups: [] };

  const headers = nonEmpty[0].map((h) => normalizeText((h ?? "").toString()));
  let nameCol = findCol(headers, NAME_HEADERS);
  const enrollCol = findCol(headers, ENROLL_HEADERS);
  const groupCol = findCol(headers, GROUP_HEADERS);
  const last1Col = findCol(headers, LAST1_HEADERS);
  const last2Col = findCol(headers, LAST2_HEADERS);
  const firstCol = last1Col >= 0 ? findCol(headers, FIRST_HEADERS) : -1;
  const splitName = last1Col >= 0 && firstCol >= 0;
  if (splitName) nameCol = -1;

  if (nameCol < 0 && !splitName) {
    return { results: [], headerError: 'No se encontró la columna "nombre". Encabezados esperados: nombre, matricula, grupo.', missingGroups: [] };
  }
  if (groupCol < 0 && !ctx.defaultGroupId) {
    return { results: [], headerError: 'El archivo no tiene columna "grupo": elige un grupo de destino antes de importar.', missingGroups: [] };
  }

  const groupByName = new Map(ctx.groups.map((g) => [normalizeText(g.name), g]));
  const groupById = new Map(ctx.groups.map((g) => [g.id, g]));
  const dbEnroll = new Set(ctx.existingStudents.map((s) => s.enrollmentId).filter(Boolean) as string[]);
  const dbNameGroup = new Set(ctx.existingStudents.map((s) => `${s.groupId}|${normalizeText(s.fullName)}`));
  const fileEnroll = new Map<string, number>();
  const fileNameGroup = new Map<string, number>();
  const missingGroups = new Set<string>();

  const results: ImportRowResult[] = [];
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").toString() : "");

  for (let i = 1; i < nonEmpty.length; i++) {
    const r = nonEmpty[i];
    const line = rows.indexOf(r) + 1;
    const fullName = cleanName(
      splitName ? [cell(r, firstCol), cell(r, last1Col), cell(r, last2Col)].join(" ") : cell(r, nameCol),
    );
    const enrollmentId = cleanEnrollment(cell(r, enrollCol));
    let groupName = cleanName(cell(r, groupCol));
    let groupId: string | null = null;

    if (groupName) {
      const g = groupByName.get(normalizeText(groupName));
      if (g) {
        groupId = g.id;
        groupName = g.name;
      } else {
        missingGroups.add(groupName);
      }
    } else if (ctx.defaultGroupId) {
      groupId = ctx.defaultGroupId;
      groupName = groupById.get(ctx.defaultGroupId)?.name ?? "";
    }

    const base = { line, fullName, enrollmentId, groupName, groupId };

    if (!fullName) {
      results.push({ ...base, status: "error", message: "Falta el nombre" });
      continue;
    }
    if (fullName.length > 120) {
      results.push({ ...base, status: "error", message: "Nombre demasiado largo (máx. 120)" });
      continue;
    }
    if (!groupName) {
      results.push({ ...base, status: "error", message: "Falta el grupo" });
      continue;
    }
    if (enrollmentId && enrollmentId.length > 40) {
      results.push({ ...base, status: "error", message: "Matrícula demasiado larga (máx. 40)" });
      continue;
    }
    if (enrollmentId) {
      if (fileEnroll.has(enrollmentId)) {
        results.push({ ...base, status: "error", message: `Matrícula repetida en el archivo (fila ${fileEnroll.get(enrollmentId)})` });
        continue;
      }
      fileEnroll.set(enrollmentId, line);
      if (dbEnroll.has(enrollmentId)) {
        results.push({ ...base, status: "duplicate", message: "La matrícula ya existe" });
        continue;
      }
    }
    const key = `${groupId ?? "new:" + normalizeText(groupName)}|${normalizeText(fullName)}`;
    if (fileNameGroup.has(key)) {
      results.push({ ...base, status: "duplicate", message: `Repetido en el archivo (fila ${fileNameGroup.get(key)})` });
      continue;
    }
    fileNameGroup.set(key, line);
    if (groupId && dbNameGroup.has(`${groupId}|${normalizeText(fullName)}`)) {
      results.push({ ...base, status: "duplicate", message: "Ya existe un alumno con ese nombre en el grupo" });
      continue;
    }
    results.push({ ...base, status: "ok" });
  }

  return { results, missingGroups: [...missingGroups] };
}
