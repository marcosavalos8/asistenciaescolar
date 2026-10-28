import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStaff } from "@/hooks/useAuth";
import { useAppData } from "@/hooks/useAppData";
import { useOnline } from "@/hooks/useOnline";
import { useStudents } from "@/hooks/useStudents";
import { computeLiveSummary, STATUS_LABEL, STATUS_STYLE } from "@/lib/attendance";
import { errorMessage } from "@/lib/errors";
import { parseQrPayload } from "@/lib/qr";
import { normalizeText } from "@/lib/text";
import { formatShortDate, now, timeInZone } from "@/lib/time";
import { correctRecord, registerAttendance, subscribeSessionRecords } from "@/services/records";
import { subscribeSession } from "@/services/sessions";
import { findStudentByToken } from "@/services/students";
import { ScanGate } from "@/scanner/scanGate";
import { beep, unlockAudio } from "@/scanner/feedback";
import type { AttendanceRecord, AttendanceSession, AttendanceStatus, Student } from "@/types";
import StatusSheet from "@/components/StatusSheet";
import { Alert, Badge, Button, PageLoader, inputCls, btnCls } from "@/components/ui";

const QrScannerView = lazy(() => import("@/scanner/QrScannerView"));

type Feedback = {
  id: number;
  kind: "ok" | "warn" | "error" | "pending";
  title: string;
  detail?: string;
};

const FEEDBACK_STYLE: Record<Feedback["kind"], string> = {
  ok: "bg-emerald-600 text-white",
  warn: "bg-amber-400 text-slate-900",
  error: "bg-rose-600 text-white",
  pending: "bg-slate-800 text-white",
};

const FEEDBACK_ICON: Record<Feedback["kind"], string> = { ok: "✓", warn: "!", error: "✕", pending: "…" };

export default function AttendanceLive() {
  const { sessionId = "" } = useParams();
  const { actor } = useStaff();
  const { settings, groupById } = useAppData();
  const online = useOnline();
  const navigate = useNavigate();
  const tz = settings.timezone;

  const [session, setSession] = useState<AttendanceSession | null | undefined>(undefined);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [recordsFromCache, setRecordsFromCache] = useState(false);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { students, loading: studentsLoading, error: studentsError } = useStudents(session?.groupId ?? null);

  const [cameraOn, setCameraOn] = useState(true);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [lastScan, setLastScan] = useState<{ name: string; time: string } | null>(null);
  const [tab, setTab] = useState<"pending" | "registered">("pending");
  const [search, setSearch] = useState("");
  const [sheetFor, setSheetFor] = useState<Student | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Suscripciones: una a la sesión y una a sus registros (se cancelan al salir).
  useEffect(() => subscribeSession(sessionId, setSession, (e) => setError(errorMessage(e))), [sessionId]);
  useEffect(
    () =>
      subscribeSessionRecords(
        sessionId,
        (r, fromCache) => {
          setRecords(r);
          setRecordsFromCache(fromCache);
          setRecordsLoaded(true);
        },
        (e) => setError(errorMessage(e)),
      ),
    [sessionId],
  );

  const tokenMap = useMemo(() => new Map(students.map((s) => [s.qrToken, s])), [students]);
  const recordsByStudent = useMemo(() => new Map(records.map((r) => [r.studentId, r])), [records]);
  const activeStudents = useMemo(() => students.filter((s) => s.active), [students]);
  const summary = useMemo(() => computeLiveSummary(activeStudents, recordsByStudent), [activeStudents, recordsByStudent]);

  // Refs para que el callback del escáner siempre vea datos actuales sin reiniciar la cámara.
  const live = useRef({ tokenMap, recordsByStudent, session, online });
  live.current = { tokenMap, recordsByStudent, session, online };
  const gate = useRef(new ScanGate(2500));
  const pendingStudents = useRef(new Set<string>());
  const fbTimer = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback((f: Omit<Feedback, "id">, ms = 3500) => {
    clearTimeout(fbTimer.current);
    setFeedback({ ...f, id: Date.now() });
    if (f.kind !== "pending") fbTimer.current = setTimeout(() => setFeedback(null), ms);
    if (f.kind === "ok") beep("ok");
    else if (f.kind === "warn") beep("warn");
    else if (f.kind === "error") beep("error");
  }, []);
  useEffect(() => () => clearTimeout(fbTimer.current), []);

  const groupName = session?.groupName ?? "";

  /** Registra a un alumno; protegido contra dobles envíos por alumno. */
  const register = useCallback(
    async (student: Student, method: "qr" | "manual", status: AttendanceStatus = "present") => {
      const { session: s, online: isOnline, recordsByStudent: recs } = live.current;
      if (!s || s.status !== "open") return;
      const existing = recs.get(student.id);
      if (existing) {
        const t = existing.recordedAt ? timeInZone(existing.recordedAt.toDate(), tz) : "";
        show({ kind: "warn", title: "Ya registrado", detail: `${student.fullName} · ${STATUS_LABEL[existing.status]}${t ? " · " + t : ""}` });
        return;
      }
      if (!isOnline) {
        show({ kind: "error", title: "Sin conexión: NO se guardó", detail: `${student.fullName}. Vuelve a escanear al recuperar internet.` }, 5000);
        throw new Error("Sin conexión: no se guardó.");
      }
      if (pendingStudents.current.has(student.id)) return;
      pendingStudents.current.add(student.id);
      show({ kind: "pending", title: "Guardando…", detail: student.fullName });
      try {
        const res = await registerAttendance(actor, s, student, method, status);
        const time = timeInZone(now(), tz);
        if (res.result === "created") {
          setLastScan({ name: student.fullName, time });
          show({ kind: "ok", title: student.fullName, detail: `${groupName} · ${STATUS_LABEL[status]} · ${time}` });
        } else {
          show({ kind: "warn", title: "Ya registrado", detail: `${student.fullName} · ${STATUS_LABEL[res.record.status]}` });
        }
      } catch (e) {
        show({ kind: "error", title: "No se guardó", detail: `${student.fullName}: ${errorMessage(e)}` }, 6000);
        throw e;
      } finally {
        pendingStudents.current.delete(student.id);
      }
    },
    [actor, tz, groupName, show],
  );

  const onDecode = useCallback(
    async (text: string) => {
      const token = parseQrPayload(text);
      const key = token ?? "raw:" + text;
      if (!gate.current.tryAcquire(key)) return;
      let retryable = false;
      try {
        if (!token) {
          show({ kind: "error", title: "QR no válido", detail: "Este código no pertenece al sistema de asistencia." });
          return;
        }
        const student = live.current.tokenMap.get(token);
        if (!student) {
          let other: Student | null = null;
          try {
            other = await findStudentByToken(token);
          } catch (e) {
            retryable = true;
            show({ kind: "error", title: "No se pudo verificar el QR", detail: errorMessage(e) });
            return;
          }
          if (other) {
            const g = groupById.get(other.groupId)?.name ?? "otro grupo";
            show({ kind: "warn", title: "Alumno de otro grupo", detail: `${other.fullName} pertenece a ${g}. No se registró.` }, 5000);
          } else {
            show({ kind: "error", title: "QR no reconocido", detail: "No corresponde a ningún alumno (pudo ser regenerado o eliminado)." }, 5000);
          }
          return;
        }
        if (!student.active) {
          show({ kind: "warn", title: "Alumno inactivo", detail: `${student.fullName} está dado de baja. No se registró.` }, 5000);
          return;
        }
        try {
          await register(student, "qr");
        } catch {
          retryable = true;
        }
      } finally {
        gate.current.release(key);
        // Tras un fallo de red se puede reintentar de inmediato con el mismo QR.
        if (retryable) gate.current.forget(key);
      }
    },
    [register, show, groupById],
  );

  const changeStatus = async (student: Student, status: AttendanceStatus, note: string) => {
    const rec = recordsByStudent.get(student.id);
    if (!rec) {
      await register(student, "manual", status);
      return;
    }
    await correctRecord(actor, rec, status, note);
  };

  const openManual = () => {
    setTab("pending");
    searchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => searchRef.current?.focus(), 300);
  };

  const list = useMemo(() => {
    const q = normalizeText(search);
    const base = tab === "pending" ? activeStudents.filter((s) => !recordsByStudent.has(s.id)) : students.filter((s) => recordsByStudent.has(s.id));
    return q ? base.filter((s) => s.nameLower.includes(q) || (s.enrollmentId ?? "").toLowerCase().includes(q)) : base;
  }, [tab, search, activeStudents, students, recordsByStudent]);

  const lastFromRecords = useMemo(() => {
    let best: AttendanceRecord | null = null;
    for (const r of records) if (r.recordedAt && (!best || r.recordedAt.toMillis() > best.recordedAt!.toMillis())) best = r;
    return best ? { name: best.studentName, time: timeInZone(best.recordedAt!.toDate(), tz) } : null;
  }, [records, tz]);
  const last = lastScan ?? lastFromRecords;

  if (error) {
    return (
      <div className="mx-auto max-w-md space-y-3 p-4">
        <Alert>{error}</Alert>
        <Link to="/pasar-lista" className={btnCls("secondary")}>Volver</Link>
      </div>
    );
  }
  if (session === undefined || studentsLoading || !recordsLoaded) return <PageLoader label="Preparando pase de lista…" />;
  if (session === null) {
    return (
      <div className="mx-auto max-w-md space-y-3 p-4">
        <Alert>La sesión no existe.</Alert>
        <Link to="/pasar-lista" className={btnCls("secondary")}>Volver</Link>
      </div>
    );
  }

  const closed = session.status === "closed";

  return (
    <div className="min-h-screen bg-slate-100" onPointerDown={unlockAudio}>
      {/* Encabezado */}
      <header className="sticky top-0 z-30 flex items-center gap-2 bg-slate-900 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-white">
        <button onClick={() => navigate("/")} className="rounded-lg px-3 py-2 text-lg" aria-label="Salir del pase de lista">✕</button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{session.groupName}{session.label && ` · ${session.label}`}</p>
          <p className="text-xs capitalize text-slate-300">{formatShortDate(session.date)}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${online ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500 text-white"}`}>
          {online ? (recordsFromCache ? "Sincronizando…" : "En línea") : "Sin conexión"}
        </span>
        {!closed && (
          <button onClick={() => setCameraOn((v) => !v)} className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold">
            {cameraOn ? "Cerrar cámara" : "Abrir cámara"}
          </button>
        )}
      </header>

      {studentsError && <div className="p-3"><Alert>{studentsError}</Alert></div>}
      {closed && (
        <div className="p-3">
          <Alert kind="info">
            Esta sesión ya está cerrada. <Link to={`/historial/${session.id}`} className="font-semibold underline">Ver resultado</Link>
          </Alert>
        </div>
      )}

      {/* Cámara */}
      {!closed && cameraOn && (
        <div className="relative">
          <Suspense fallback={<div className="flex h-[52vh] items-center justify-center bg-black text-white">Cargando escáner…</div>}>
            <QrScannerView onDecode={onDecode} className="h-[52vh] min-h-[280px]" />
          </Suspense>
          {feedback && (
            <div
              key={feedback.id}
              className={`absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-2xl px-4 py-3 shadow-xl ${FEEDBACK_STYLE[feedback.kind]}`}
              role="status"
              aria-live="assertive"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/25 text-2xl font-bold">{FEEDBACK_ICON[feedback.kind]}</span>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold leading-tight">{feedback.title}</p>
                {feedback.detail && <p className="text-sm leading-snug opacity-95">{feedback.detail}</p>}
              </div>
            </div>
          )}
        </div>
      )}
      {!closed && !cameraOn && feedback && (
        <div className={`mx-3 mt-3 rounded-2xl px-4 py-3 ${FEEDBACK_STYLE[feedback.kind]}`} role="status">
          <p className="font-bold">{feedback.title}</p>
          {feedback.detail && <p className="text-sm">{feedback.detail}</p>}
        </div>
      )}

      {/* Resumen en tiempo real */}
      <section className="grid grid-cols-4 gap-2 px-3 pt-3 text-center">
        <Stat label="Total" value={summary.total} />
        <Stat label="Presentes" value={summary.attended} tone="text-emerald-700" />
        <Stat label="Pendientes" value={summary.pending} tone="text-amber-700" />
        <Stat label="Asistencia" value={`${summary.percent}%`} tone="text-brand-700" />
      </section>
      <p className="px-4 pt-2 text-sm text-slate-600">
        {summary.late > 0 && <span>Retardos: <b>{summary.late}</b> · </span>}
        {summary.absent > 0 && <span>Ausentes: <b>{summary.absent}</b> · </span>}
        {last ? (
          <span>Último: <b>{last.name}</b> a las {last.time}</span>
        ) : (
          <span>Aún no hay registros.</span>
        )}
      </p>

      {/* Lista del grupo */}
      <section className="px-3 pb-32 pt-3">
        <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-slate-200 p-1">
          {(["pending", "registered"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`min-h-[40px] rounded-lg text-sm font-semibold ${tab === t ? "bg-white shadow" : "text-slate-600"}`}
            >
              {t === "pending" ? `Pendientes (${summary.pending})` : `Registrados (${records.length})`}
            </button>
          ))}
        </div>
        <input
          ref={searchRef}
          type="search"
          className={inputCls}
          placeholder="Buscar alumno para registro manual"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {list.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-500">
              {tab === "pending" ? (search ? "Sin coincidencias." : "¡Todos registrados! 🎉") : "Nadie registrado todavía."}
            </li>
          )}
          {list.map((s) => {
            const r = recordsByStudent.get(s.id);
            return (
              <li key={s.id}>
                <button
                  disabled={closed}
                  onClick={() => setSheetFor(s)}
                  className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left active:bg-slate-50 disabled:cursor-default"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.fullName}</span>
                    {r?.recordedAt && (
                      <span className="text-xs text-slate-500">
                        {timeInZone(r.recordedAt.toDate(), tz)} · {r.method === "qr" ? "QR" : "Manual"}
                        {r.correctionCount > 0 && " · corregido"}
                      </span>
                    )}
                    {!s.active && <span className="text-xs text-rose-600"> (inactivo)</span>}
                  </span>
                  {r ? (
                    <Badge className={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  ) : (
                    <span className="text-sm font-semibold text-brand-700">Registrar</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Barra inferior */}
      {!closed && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button variant="secondary" size="lg" className="flex-1" onClick={openManual}>Registro manual</Button>
          <Button size="lg" className="flex-1" onClick={() => navigate(`/pasar-lista/${session.id}/revisar`)}>Finalizar</Button>
        </div>
      )}

      {sheetFor && (
        <StatusSheet
          title={sheetFor.fullName}
          subtitle={recordsByStudent.get(sheetFor.id) ? "Corregir estado" : "Registro manual"}
          current={recordsByStudent.get(sheetFor.id)?.status ?? null}
          onClose={() => setSheetFor(null)}
          onPick={(status, note) => changeStatus(sheetFor, status, note)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone = "text-slate-900" }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-xl bg-white px-1 py-2 shadow-sm">
      <p className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}
