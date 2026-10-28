import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useStaff } from "@/hooks/useAuth";
import { useAppData } from "@/hooks/useAppData";
import { useStudents } from "@/hooks/useStudents";
import { METHOD_LABEL, STATUS_LABEL, STATUS_ORDER, STATUS_STYLE } from "@/lib/attendance";
import { downloadText, safeFilename, toCsv } from "@/lib/csv";
import { errorMessage } from "@/lib/errors";
import { dateTimeInZone, formatLongDate, timeInZone } from "@/lib/time";
import { correctRecord, listAuditForRecord, registerAttendance, subscribeSessionRecords } from "@/services/records";
import { adjustClosedTotals, subscribeSession } from "@/services/sessions";
import type { AttendanceRecord, AttendanceSession, AttendanceStatus, Student } from "@/types";
import StatusSheet from "@/components/StatusSheet";
import { Alert, Badge, Button, Card, Modal, PageHeader, PageLoader, btnCls, useToast } from "@/components/ui";

type Row = { key: string; name: string; enrollmentId: string | null; record: AttendanceRecord | null; student: Student | null };

export default function SessionDetail() {
  const { sessionId = "" } = useParams();
  const { actor, isAdmin } = useStaff();
  const { settings } = useAppData();
  const tz = settings.timezone;
  const toast = useToast();
  const [session, setSession] = useState<AttendanceSession | null | undefined>(undefined);
  const [records, setRecords] = useState<AttendanceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AttendanceStatus | "none" | "all">("all");
  const [editing, setEditing] = useState<Row | null>(null);
  const [auditFor, setAuditFor] = useState<AttendanceRecord | null>(null);
  const { students } = useStudents(session?.groupId ?? null);

  useEffect(() => subscribeSession(sessionId, setSession, (e) => setError(errorMessage(e))), [sessionId]);
  useEffect(() => subscribeSessionRecords(sessionId, (r) => setRecords(r), (e) => setError(errorMessage(e))), [sessionId]);

  // Registros + alumnos activos del grupo sin registro (incluye alumnos ya eliminados vía su registro).
  const rows = useMemo<Row[]>(() => {
    const byStudent = new Map((records ?? []).map((r) => [r.studentId, r]));
    const studentById = new Map(students.map((s) => [s.id, s]));
    const out: Row[] = (records ?? []).map((r) => ({ key: r.id, name: r.studentName, enrollmentId: r.enrollmentId, record: r, student: studentById.get(r.studentId) ?? null }));
    for (const s of students) if (s.active && !byStudent.has(s.id)) out.push({ key: s.id, name: s.fullName, enrollmentId: s.enrollmentId, record: null, student: s });
    return out.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [records, students]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { present: 0, late: 0, absent: 0, justified: 0, none: 0 };
    for (const r of rows) c[r.record?.status ?? "none"]++;
    return c;
  }, [rows]);

  if (error) return <Alert>{error}</Alert>;
  if (session === undefined || !records) return <PageLoader />;
  if (!session) return <Alert>La sesión no existe.</Alert>;

  const closed = session.status === "closed";
  const canEdit = !closed || isAdmin;
  const visible = rows.filter((r) => filter === "all" || (filter === "none" ? !r.record : r.record?.status === filter));

  const exportCsv = () => {
    const csv = toCsv(
      ["Fecha", "Grupo", "Sesión", "Alumno", "Matrícula", "Estado", "Método", "Hora", "Registró", "Corregido por", "Nota"],
      rows.map((r) => [
        session.date,
        session.groupName,
        session.label,
        r.name,
        r.enrollmentId ?? "",
        r.record ? STATUS_LABEL[r.record.status] : "Sin registro",
        r.record ? METHOD_LABEL[r.record.method] : "",
        r.record?.recordedAt ? timeInZone(r.record.recordedAt.toDate(), tz) : "",
        r.record?.recordedByName ?? "",
        r.record?.updatedByName ?? "",
        r.record?.note ?? "",
      ]),
    );
    downloadText(`asistencia_${safeFilename(session.groupName)}_${session.date}${session.label ? "_" + safeFilename(session.label) : ""}.csv`, csv);
  };

  const pick = async (row: Row, status: AttendanceStatus, note: string) => {
    if (row.record) {
      const prev = await correctRecord(actor, row.record, status, note);
      if (closed && session.totals) await adjustClosedTotals(session.id, prev, status);
    } else if (row.student) {
      const res = await registerAttendance(actor, session, row.student, "manual", status);
      if (res.result === "exists") throw new Error("Ya tenía registro; recarga la página.");
      if (closed && session.totals) await adjustClosedTotals(session.id, null, status);
    }
    toast("Registro actualizado");
  };

  return (
    <div>
      <PageHeader
        title={`${session.groupName}${session.label ? " · " + session.label : ""}`}
        subtitle={
          <span className="capitalize">
            {formatLongDate(session.date)} · {closed ? `Cerrada por ${session.closedByName ?? ""}` : "En curso"}
          </span>
        }
        actions={
          <>
            {!closed && <Link to={`/pasar-lista/${session.id}`} className={btnCls("primary")}>Continuar escaneo</Link>}
            <Button variant="secondary" onClick={exportCsv}>Exportar CSV</Button>
          </>
        }
      />
      {closed && !isAdmin && (
        <div className="mb-3">
          <Alert kind="info">Sesión cerrada: solo un administrador puede corregir registros.</Alert>
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>Todos ({rows.length})</FilterChip>
        {STATUS_ORDER.map((s) => (
          <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>{STATUS_LABEL[s]} ({counts[s]})</FilterChip>
        ))}
        {counts.none > 0 && <FilterChip active={filter === "none"} onClick={() => setFilter("none")}>Sin registro ({counts.none})</FilterChip>}
      </div>

      <Card className="overflow-hidden p-0">
        <ul className="divide-y divide-slate-200">
          {visible.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {r.student ? <Link to={`/alumnos/${r.student.id}`} className="hover:text-brand-700">{r.name}</Link> : r.name}
                  {!r.student && r.record && <span className="text-xs text-slate-400"> (eliminado)</span>}
                </p>
                {r.record && (
                  <p className="text-xs text-slate-500">
                    {r.record.recordedAt ? timeInZone(r.record.recordedAt.toDate(), tz) : "…"} · {METHOD_LABEL[r.record.method]} · {r.record.recordedByName}
                    {r.record.correctionCount > 0 && (
                      <button className="ml-1 text-brand-700 underline" onClick={() => setAuditFor(r.record)}>
                        corregido ({r.record.correctionCount})
                      </button>
                    )}
                  </p>
                )}
              </div>
              {r.record ? (
                <Badge className={STATUS_STYLE[r.record.status]}>{STATUS_LABEL[r.record.status]}</Badge>
              ) : (
                <Badge className="border-slate-300 bg-slate-50 text-slate-500">Sin registro</Badge>
              )}
              {canEdit && (r.record || r.student) && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>{r.record ? "Corregir" : "Registrar"}</Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {editing && (
        <StatusSheet
          title={editing.name}
          subtitle={closed ? "Corrección en sesión cerrada (administrador)" : undefined}
          current={editing.record?.status ?? null}
          onClose={() => setEditing(null)}
          onPick={(s, note) => pick(editing, s, note)}
        />
      )}
      {auditFor && <AuditModal record={auditFor} tz={tz} onClose={() => setAuditFor(null)} />}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full border px-3 py-1.5 text-sm font-medium ${active ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
      {children}
    </button>
  );
}

function AuditModal({ record, tz, onClose }: { record: AttendanceRecord; tz: string; onClose: () => void }) {
  const [items, setItems] = useState<Awaited<ReturnType<typeof listAuditForRecord>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listAuditForRecord(record.id).then(setItems, (e) => setError(errorMessage(e)));
  }, [record.id]);
  return (
    <Modal open onClose={onClose} title={`Correcciones · ${record.studentName}`}>
      {error && <Alert>{error}</Alert>}
      {!items && !error && <PageLoader />}
      <ol className="space-y-2 text-sm">
        {items?.map((a, i) => (
          <li key={i} className="rounded-xl bg-slate-50 p-3">
            <b>{STATUS_LABEL[a.from]}</b> → <b>{STATUS_LABEL[a.to]}</b>
            <span className="block text-slate-600">
              {a.byName} · {a.at ? dateTimeInZone(a.at.toDate(), tz) : "…"}
            </span>
            {a.note && <span className="block italic text-slate-600">«{a.note}»</span>}
          </li>
        ))}
      </ol>
    </Modal>
  );
}
