import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppData } from "@/hooks/useAppData";
import { useStudents } from "@/hooks/useStudents";
import { errorMessage } from "@/lib/errors";
import { normalizeText } from "@/lib/text";
import { addDays, formatShortDate, todayInZone } from "@/lib/time";
import { listSessions } from "@/services/sessions";
import type { AttendanceSession } from "@/types";
import { Alert, Badge, Card, EmptyState, Field, PageHeader, PageLoader, inputCls } from "@/components/ui";

export default function History() {
  const { groups, settings } = useAppData();
  const today = todayInZone(settings.timezone);
  const [from, setFrom] = useState(addDays(today, -13));
  const [to, setTo] = useState(today);
  const [groupId, setGroupId] = useState("");
  const [sessions, setSessions] = useState<AttendanceSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!from || !to || from > to) return;
    let cancelled = false;
    setSessions(null);
    setError(null);
    listSessions({ from, to, groupId: groupId || null }).then(
      (s) => !cancelled && setSessions(s),
      (e) => !cancelled && setError(errorMessage(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [from, to, groupId]);

  const byDate = new Map<string, AttendanceSession[]>();
  for (const s of sessions ?? []) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);

  return (
    <div>
      <PageHeader title="Historial" subtitle="Sesiones de asistencia por fecha" />
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <Field label="Desde"><input type="date" className={inputCls} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Hasta"><input type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Grupo">
          <select className={inputCls} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Todos</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
      </div>

      <StudentFinder groupId={groupId} />

      {error && <Alert>{error}</Alert>}
      {!sessions && !error && <PageLoader />}
      {sessions && sessions.length === 0 && <EmptyState title="No hay sesiones en este rango" />}
      <div className="space-y-4">
        {[...byDate.entries()].map(([date, list]) => (
          <section key={date}>
            <h2 className="mb-2 text-sm font-semibold capitalize text-slate-500">{formatShortDate(date)}</h2>
            <div className="space-y-2">
              {list.map((s) => {
                const t = s.totals;
                return (
                  <Link key={s.id} to={`/historial/${s.id}`}>
                    <Card className="flex flex-wrap items-center justify-between gap-2 hover:border-brand-300">
                      <div>
                        <p className="font-semibold">{s.groupName}{s.label && <span className="font-normal text-slate-500"> · {s.label}</span>}</p>
                        <p className="text-sm text-slate-500">{s.startedByName}</p>
                      </div>
                      {t ? (
                        <div className="flex flex-wrap gap-1 text-xs">
                          <Badge className="border-emerald-300 bg-emerald-50 text-emerald-800">P {t.present}</Badge>
                          <Badge className="border-amber-300 bg-amber-50 text-amber-800">R {t.late}</Badge>
                          <Badge className="border-rose-300 bg-rose-50 text-rose-800">A {t.absent}</Badge>
                          <Badge className="border-sky-300 bg-sky-50 text-sky-800">J {t.justified}</Badge>
                        </div>
                      ) : (
                        <Badge className="border-emerald-300 bg-emerald-50 text-emerald-700">En curso</Badge>
                      )}
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Acceso rápido al historial individual de un alumno. */
function StudentFinder({ groupId }: { groupId: string }) {
  const [q, setQ] = useState("");
  const { students } = useStudents(q.length >= 2 ? groupId || "all" : null);
  const navigate = useNavigate();
  const n = normalizeText(q);
  const matches = n.length >= 2 ? students.filter((s) => s.nameLower.includes(n) || (s.enrollmentId ?? "").toLowerCase().includes(n)).slice(0, 8) : [];
  return (
    <div className="relative mb-5">
      <input className={inputCls} type="search" placeholder="Historial de un alumno: escribe su nombre o matrícula" value={q} onChange={(e) => setQ(e.target.value)} />
      {matches.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {matches.map((s) => (
            <li key={s.id}>
              <button className="w-full px-4 py-3 text-left hover:bg-slate-50" onClick={() => navigate(`/alumnos/${s.id}`)}>
                {s.fullName} {s.enrollmentId && <span className="text-sm text-slate-500">· {s.enrollmentId}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
