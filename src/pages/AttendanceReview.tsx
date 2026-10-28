import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStaff } from "@/hooks/useAuth";
import { useOnline } from "@/hooks/useOnline";
import { useStudents } from "@/hooks/useStudents";
import { computeLiveSummary, STATUS_LABEL, STATUS_STYLE, totalsFromRecords } from "@/lib/attendance";
import { errorMessage } from "@/lib/errors";
import { formatLongDate } from "@/lib/time";
import { getSessionRecords } from "@/services/records";
import { closeSession, subscribeSession } from "@/services/sessions";
import type { AttendanceRecord, AttendanceSession } from "@/types";
import { Alert, Badge, Button, Card, PageHeader, PageLoader, btnCls } from "@/components/ui";

export default function AttendanceReview() {
  const { sessionId = "" } = useParams();
  const { actor } = useStaff();
  const online = useOnline();
  const navigate = useNavigate();
  const [session, setSession] = useState<AttendanceSession | null | undefined>(undefined);
  const [records, setRecords] = useState<AttendanceRecord[] | null>(null);
  const [markAbsent, setMarkAbsent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { students, loading } = useStudents(session?.groupId ?? null);

  useEffect(() => subscribeSession(sessionId, setSession, (e) => setError(errorMessage(e))), [sessionId]);
  // Lectura puntual desde el servidor: lo que se revisa es lo realmente guardado.
  useEffect(() => {
    getSessionRecords(sessionId).then(setRecords, (e) => setError(errorMessage(e)));
  }, [sessionId]);

  const active = useMemo(() => students.filter((s) => s.active), [students]);
  const byStudent = useMemo(() => new Map((records ?? []).map((r) => [r.studentId, r])), [records]);
  const summary = computeLiveSummary(active, byStudent);
  const pending = active.filter((s) => !byStudent.has(s.id));
  const notPresent = (records ?? []).filter((r) => r.status !== "present");

  const finish = async () => {
    if (!session || !records) return;
    if (!online) return setError("Sin conexión. Conéctate para cerrar la sesión.");
    setBusy(true);
    setError(null);
    try {
      const absentFor = markAbsent ? pending : [];
      const totals = totalsFromRecords(records, active.length);
      totals.absent += absentFor.length;
      await closeSession(actor, session, absentFor, totals);
      navigate(`/historial/${session.id}`, { replace: true });
    } catch (e) {
      setError(errorMessage(e) + " Recarga la página y vuelve a intentarlo.");
      setBusy(false);
    }
  };

  if (session === undefined || !records || loading) return <PageLoader />;
  if (!session) return <Alert>La sesión no existe.</Alert>;
  if (session.status === "closed") {
    return (
      <Alert kind="info">
        La sesión ya está cerrada. <Link to={`/historial/${session.id}`} className="font-semibold underline">Ver resultado</Link>
      </Alert>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Revisar y cerrar" subtitle={`${session.groupName} · ${formatLongDate(session.date)}`} />
      <Card className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
        <div><p className="text-2xl font-bold">{summary.total}</p><p className="text-xs text-slate-500">Total</p></div>
        <div><p className="text-2xl font-bold text-emerald-700">{summary.present}</p><p className="text-xs text-slate-500">Presentes</p></div>
        <div><p className="text-2xl font-bold text-amber-700">{summary.late}</p><p className="text-xs text-slate-500">Retardos</p></div>
        <div><p className="text-2xl font-bold text-brand-700">{summary.percent}%</p><p className="text-xs text-slate-500">Asistencia</p></div>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Sin registrar ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">Todos los alumnos activos tienen registro.</p>
        ) : (
          <>
            <ul className="mb-3 max-h-60 space-y-1 overflow-auto text-sm">
              {pending.map((s) => <li key={s.id}>• {s.fullName}</li>)}
            </ul>
            <label className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={markAbsent} onChange={(e) => setMarkAbsent(e.target.checked)} />
              <span>Marcar a estos {pending.length} alumno(s) como <b>Ausente</b> al cerrar (se podrá corregir después).</span>
            </label>
          </>
        )}
      </Card>

      {notPresent.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Retardos, ausencias y justificados</h2>
          <ul className="space-y-1 text-sm">
            {notPresent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span>{r.studentName}</span>
                <Badge className={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {error && <Alert>{error}</Alert>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link to={`/pasar-lista/${session.id}`} className={`${btnCls("secondary", "lg")} flex-1`}>Volver al escáner</Link>
        <Button size="lg" variant="success" className="flex-1" onClick={finish} loading={busy}>Cerrar sesión</Button>
      </div>
      <p className="text-center text-xs text-slate-500">Una vez cerrada, solo un administrador podrá corregir los registros.</p>
    </div>
  );
}
