import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppData } from "@/hooks/useAppData";
import { METHOD_LABEL, STATUS_LABEL, studentStats, type StudentStats } from "@/lib/attendance";
import { downloadText, safeFilename, toCsv } from "@/lib/csv";
import { errorMessage } from "@/lib/errors";
import { addDays, timeInZone, todayInZone } from "@/lib/time";
import { listRecordsByGroupRange } from "@/services/records";
import { listSessions } from "@/services/sessions";
import { getStudentsByGroupOnce } from "@/services/students";
import type { AttendanceRecord, AttendanceSession } from "@/types";
import { Alert, Button, Card, EmptyState, Field, PageHeader, inputCls } from "@/components/ui";

interface Report {
  groupName: string;
  from: string;
  to: string;
  sessions: AttendanceSession[];
  records: AttendanceRecord[];
  rows: { studentId: string; name: string; enrollmentId: string | null; active: boolean; stats: StudentStats }[];
}

export default function Reports() {
  const { groups, settings } = useAppData();
  const tz = settings.timezone;
  const today = todayInZone(tz);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [sort, setSort] = useState<"name" | "percent">("name");

  const gid = groupId || groups[0]?.id || "";

  const generate = async () => {
    if (!gid) return;
    if (from > to) return setError("El rango de fechas no es válido.");
    setBusy(true);
    setError(null);
    try {
      const [sessions, records, students] = await Promise.all([
        listSessions({ from, to, groupId: gid }),
        listRecordsByGroupRange(gid, from, to),
        getStudentsByGroupOnce(gid),
      ]);
      const sessionIds = sessions.map((s) => s.id);
      const byStudent = new Map<string, Map<string, AttendanceRecord>>();
      for (const r of records) {
        if (!byStudent.has(r.studentId)) byStudent.set(r.studentId, new Map());
        byStudent.get(r.studentId)!.set(r.sessionId, r);
      }
      // Alumnos actuales del grupo + alumnos con registros en el rango (eliminados o cambiados de grupo).
      const people = new Map<string, { name: string; enrollmentId: string | null; active: boolean }>();
      for (const s of students) people.set(s.id, { name: s.fullName, enrollmentId: s.enrollmentId, active: s.active });
      for (const r of records) if (!people.has(r.studentId)) people.set(r.studentId, { name: r.studentName, enrollmentId: r.enrollmentId, active: false });
      const rows = [...people.entries()]
        .filter(([id, p]) => p.active || byStudent.has(id))
        .map(([id, p]) => ({ studentId: id, ...p, stats: studentStats(sessionIds, byStudent.get(id) ?? new Map()) }));
      setReport({ groupName: groups.find((g) => g.id === gid)?.name ?? "", from, to, sessions, records, rows });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const sorted = useMemo(() => {
    if (!report) return [];
    const r = [...report.rows];
    return sort === "name"
      ? r.sort((a, b) => a.name.localeCompare(b.name, "es"))
      : r.sort((a, b) => (a.stats.percent ?? -1) - (b.stats.percent ?? -1));
  }, [report, sort]);

  const groupAvg = useMemo(() => {
    const vals = report?.rows.map((r) => r.stats.percent).filter((v): v is number => v !== null) ?? [];
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  }, [report]);

  const exportSummary = () => {
    if (!report) return;
    downloadText(
      `resumen_${safeFilename(report.groupName)}_${report.from}_${report.to}.csv`,
      toCsv(
        ["Alumno", "Matrícula", "Sesiones", "Presente", "Retardo", "Ausente", "Sin registro", "Justificado", "% asistencia"],
        sorted.map((r) => [r.name, r.enrollmentId ?? "", r.stats.sessions, r.stats.present, r.stats.late, r.stats.absent, r.stats.noRecord, r.stats.justified, r.stats.percent ?? ""]),
      ),
    );
  };

  const exportDetail = () => {
    if (!report) return;
    const sessionById = new Map(report.sessions.map((s) => [s.id, s]));
    downloadText(
      `detalle_${safeFilename(report.groupName)}_${report.from}_${report.to}.csv`,
      toCsv(
        ["Fecha", "Sesión", "Alumno", "Matrícula", "Estado", "Método", "Hora", "Registró", "Corregido por", "Nota"],
        [...report.records]
          .sort((a, b) => a.date.localeCompare(b.date) || a.studentName.localeCompare(b.studentName, "es"))
          .map((r) => [
            r.date,
            sessionById.get(r.sessionId)?.label ?? "",
            r.studentName,
            r.enrollmentId ?? "",
            STATUS_LABEL[r.status],
            METHOD_LABEL[r.method],
            r.recordedAt ? timeInZone(r.recordedAt.toDate(), tz) : "",
            r.recordedByName,
            r.updatedByName ?? "",
            r.note ?? "",
          ]),
      ),
    );
  };

  if (!groups.length) return <EmptyState title="No hay grupos" />;

  return (
    <div>
      <PageHeader title="Informes" subtitle="Porcentaje de asistencia por alumno en un rango de fechas" />
      <Card className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Field label="Grupo">
          <select className={inputCls} value={gid} onChange={(e) => setGroupId(e.target.value)}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
        <Field label="Desde"><input type="date" className={inputCls} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Hasta"><input type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        <Button onClick={generate} loading={busy}>Generar</Button>
      </Card>
      {error && <Alert>{error}</Alert>}

      {report && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">
              <b>{report.groupName}</b> · {report.sessions.length} sesión(es) · promedio del grupo: <b>{groupAvg === null ? "—" : `${groupAvg}%`}</b>
            </p>
            <div className="flex flex-wrap gap-2">
              <select className={`${inputCls} !min-h-[36px] w-auto text-sm`} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Ordenar">
                <option value="name">Ordenar por nombre</option>
                <option value="percent">Menor asistencia primero</option>
              </select>
              <Button size="sm" variant="secondary" onClick={exportSummary}>CSV resumen</Button>
              <Button size="sm" variant="secondary" onClick={exportDetail} disabled={!report.records.length}>CSV detallado</Button>
            </div>
          </div>
          {report.sessions.length === 0 ? (
            <EmptyState title="No hubo sesiones en este rango" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Alumno</th>
                    <th className="px-2 py-2 text-center">P</th>
                    <th className="px-2 py-2 text-center">R</th>
                    <th className="px-2 py-2 text-center">A</th>
                    <th className="px-2 py-2 text-center">J</th>
                    <th className="px-3 py-2 text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map((r) => (
                    <tr key={r.studentId}>
                      <td className="px-3 py-2">
                        <Link to={`/alumnos/${r.studentId}`} className="font-medium hover:text-brand-700">{r.name}</Link>
                        {!r.active && <span className="text-xs text-slate-400"> (inactivo/eliminado)</span>}
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums">{r.stats.present}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{r.stats.late}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{r.stats.absent + r.stats.noRecord}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{r.stats.justified}</td>
                      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${r.stats.percent !== null && r.stats.percent < 80 ? "text-rose-700" : ""}`}>
                        {r.stats.percent === null ? "—" : `${r.stats.percent}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">P presente · R retardo · A ausente (incluye sin registro) · J justificado. % = (P + R) ÷ (sesiones − J).</p>
        </>
      )}
    </div>
  );
}
