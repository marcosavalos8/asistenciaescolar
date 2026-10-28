import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAppData } from "@/hooks/useAppData";
import { METHOD_LABEL, STATUS_LABEL, STATUS_STYLE, studentStats } from "@/lib/attendance";
import { downloadText, safeFilename, toCsv } from "@/lib/csv";
import { errorMessage } from "@/lib/errors";
import { addDays, formatShortDate, timeInZone, todayInZone } from "@/lib/time";
import { listRecordsByStudent } from "@/services/records";
import { listSessions } from "@/services/sessions";
import { getStudent } from "@/services/students";
import type { AttendanceRecord, AttendanceSession, Student } from "@/types";
import { StudentQrPanel } from "@/components/QrCard";
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, PageLoader, inputCls } from "@/components/ui";

export default function StudentDetail() {
  const { studentId = "" } = useParams();
  const { groupById, settings } = useAppData();
  const tz = settings.timezone;
  const today = todayInZone(tz);
  const [from, setFrom] = useState(addDays(today, -89));
  const [to, setTo] = useState(today);
  const [student, setStudent] = useState<Student | null | undefined>(undefined);
  const [records, setRecords] = useState<AttendanceRecord[] | null>(null);
  const [sessions, setSessions] = useState<AttendanceSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    getStudent(studentId).then(setStudent, (e) => setError(errorMessage(e)));
  }, [studentId]);

  useEffect(() => {
    if (from > to) return;
    let cancelled = false;
    setRecords(null);
    setSessions(null);
    const groupId = student?.groupId;
    Promise.all([
      listRecordsByStudent(studentId, from, to),
      groupId ? listSessions({ from, to, groupId }) : Promise.resolve([]),
    ]).then(
      ([r, s]) => {
        if (cancelled) return;
        setRecords(r);
        setSessions(s);
      },
      (e) => !cancelled && setError(errorMessage(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [studentId, student?.groupId, from, to]);

  // Sesiones consideradas: las de su grupo actual + cualquiera donde tenga registro (p. ej. de un grupo anterior).
  const { stats, rows } = useMemo(() => {
    const bySession = new Map((records ?? []).map((r) => [r.sessionId, r]));
    const ids = new Set<string>([...(sessions ?? []).map((s) => s.id), ...bySession.keys()]);
    const sessionById = new Map((sessions ?? []).map((s) => [s.id, s]));
    const rows = [...ids]
      .map((id) => ({ id, record: bySession.get(id) ?? null, session: sessionById.get(id) ?? null }))
      .map((r) => ({ ...r, date: r.record?.date ?? r.session?.date ?? "", label: r.session?.label ?? "", groupName: r.record?.groupName ?? r.session?.groupName ?? "" }))
      .sort((a, b) => b.date.localeCompare(a.date));
    return { stats: studentStats([...ids], bySession), rows };
  }, [records, sessions]);

  if (error) return <Alert>{error}</Alert>;
  if (student === undefined) return <PageLoader />;

  const name = student?.fullName ?? records?.[0]?.studentName ?? "Alumno eliminado";
  const groupName = student ? groupById.get(student.groupId)?.name ?? "" : "";

  const exportCsv = () => {
    downloadText(
      `historial_${safeFilename(name)}_${from}_${to}.csv`,
      toCsv(
        ["Fecha", "Grupo", "Sesión", "Estado", "Método", "Hora"],
        rows.map((r) => [
          r.date,
          r.groupName,
          r.label,
          r.record ? STATUS_LABEL[r.record.status] : "Sin registro",
          r.record ? METHOD_LABEL[r.record.method] : "",
          r.record?.recordedAt ? timeInZone(r.record.recordedAt.toDate(), tz) : "",
        ]),
      ),
    );
  };

  return (
    <div>
      <PageHeader
        title={name}
        subtitle={
          student ? (
            <>
              {groupName}
              {student.enrollmentId && ` · Matrícula ${student.enrollmentId}`}
              {!student.active && " · Inactivo"}
            </>
          ) : (
            "La ficha fue eliminada; se muestra su historial conservado."
          )
        }
        actions={
          <>
            {student && <Button variant="secondary" onClick={() => setShowQr(true)}>Ver QR</Button>}
            <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}>Exportar CSV</Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Field label="Desde"><input type="date" className={inputCls} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Hasta"><input type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>

      {!records ? (
        <PageLoader />
      ) : (
        <>
          <Card className="mb-4 grid grid-cols-3 gap-3 text-center sm:grid-cols-6">
            <Mini label="Asistencia" value={stats.percent === null ? "—" : `${stats.percent}%`} tone="text-brand-700" />
            <Mini label="Sesiones" value={stats.sessions} />
            <Mini label="Presente" value={stats.present} tone="text-emerald-700" />
            <Mini label="Retardo" value={stats.late} tone="text-amber-700" />
            <Mini label="Ausente" value={stats.absent + stats.noRecord} tone="text-rose-700" />
            <Mini label="Justificado" value={stats.justified} tone="text-sky-700" />
          </Card>
          {rows.length === 0 ? (
            <EmptyState title="Sin sesiones en este rango" />
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-slate-200">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link to={`/historial/${r.id}`} className="font-medium capitalize hover:text-brand-700">{formatShortDate(r.date)}</Link>
                      <p className="text-xs text-slate-500">
                        {r.groupName}{r.label && ` · ${r.label}`}
                        {r.record?.recordedAt && ` · ${timeInZone(r.record.recordedAt.toDate(), tz)}`}
                      </p>
                    </div>
                    {r.record ? (
                      <Badge className={STATUS_STYLE[r.record.status]}>{STATUS_LABEL[r.record.status]}</Badge>
                    ) : (
                      <Badge className="border-slate-300 bg-slate-50 text-slate-500">Sin registro</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <p className="mt-2 text-xs text-slate-500">% de asistencia = (presente + retardo) ÷ (sesiones − justificadas). «Sin registro» cuenta como inasistencia.</p>
        </>
      )}

      {showQr && student && (
        <Modal open onClose={() => setShowQr(false)} title="Código QR">
          <StudentQrPanel student={student} groupName={groupName} institution={settings.name} />
        </Modal>
      )}
    </div>
  );
}

function Mini({ label, value, tone = "" }: { label: string; value: number | string; tone?: string }) {
  return (
    <div>
      <p className={`text-xl font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="text-[11px] uppercase text-slate-500">{label}</p>
    </div>
  );
}
