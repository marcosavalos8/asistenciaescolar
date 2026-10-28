import type { AttendanceRecord, AttendanceStatus, RecordMethod, SessionTotals, Student } from "@/types";

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Presente",
  late: "Retardo",
  absent: "Ausente",
  justified: "Justificado",
};

export const STATUS_ORDER: AttendanceStatus[] = ["present", "late", "absent", "justified"];

export const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present: "bg-emerald-100 text-emerald-800 border-emerald-300",
  late: "bg-amber-100 text-amber-800 border-amber-300",
  absent: "bg-rose-100 text-rose-800 border-rose-300",
  justified: "bg-sky-100 text-sky-800 border-sky-300",
};

export const METHOD_LABEL: Record<RecordMethod, string> = {
  qr: "QR",
  manual: "Manual",
  auto: "Al cerrar",
};

export function recordId(sessionId: string, studentId: string) {
  return `${sessionId}_${studentId}`;
}

/** Cuenta los estados de la sesión contra los alumnos activos del grupo. */
export function computeLiveSummary(activeStudents: Student[], recordsByStudent: Map<string, AttendanceRecord>) {
  let present = 0, late = 0, absent = 0, justified = 0;
  for (const s of activeStudents) {
    const r = recordsByStudent.get(s.id);
    if (!r) continue;
    if (r.status === "present") present++;
    else if (r.status === "late") late++;
    else if (r.status === "absent") absent++;
    else if (r.status === "justified") justified++;
  }
  const total = activeStudents.length;
  const attended = present + late;
  return {
    total,
    present,
    late,
    absent,
    justified,
    attended,
    pending: total - (present + late + absent + justified),
    percent: total ? Math.round((attended / total) * 100) : 0,
  };
}

export function totalsFromRecords(records: Iterable<AttendanceRecord>, total: number): SessionTotals {
  const t: SessionTotals = { total, present: 0, late: 0, absent: 0, justified: 0 };
  for (const r of records) t[r.status]++;
  return t;
}

export interface StudentStats {
  sessions: number;
  present: number;
  late: number;
  absent: number;
  justified: number;
  noRecord: number;
  /** (presente + retardo) / (sesiones − justificadas), en %. null si no hay base. */
  percent: number | null;
}

/**
 * Estadística de un alumno sobre un conjunto de sesiones. Una sesión sin
 * registro del alumno se cuenta aparte ("sin registro") y como inasistencia.
 */
export function studentStats(sessionIds: string[], recordsBySession: Map<string, AttendanceRecord>): StudentStats {
  const s: StudentStats = { sessions: sessionIds.length, present: 0, late: 0, absent: 0, justified: 0, noRecord: 0, percent: null };
  for (const id of sessionIds) {
    const r = recordsBySession.get(id);
    if (!r) s.noRecord++;
    else s[r.status]++;
  }
  const base = s.sessions - s.justified;
  s.percent = base > 0 ? Math.round(((s.present + s.late) / base) * 1000) / 10 : null;
  return s;
}
