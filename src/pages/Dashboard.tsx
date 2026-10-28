import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAppData } from "@/hooks/useAppData";
import { errorMessage } from "@/lib/errors";
import { formatLongDate, todayInZone } from "@/lib/time";
import { subscribeSessionsByDate } from "@/services/sessions";
import type { AttendanceSession } from "@/types";
import { Alert, Badge, Card, EmptyState, Spinner, btnCls } from "@/components/ui";

export default function Dashboard() {
  const { profile, isAdmin } = useAuth();
  const { settings, groups, groupsLoading, settingsExists } = useAppData();
  const today = todayInZone(settings.timezone);
  const [sessions, setSessions] = useState<AttendanceSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeSessionsByDate(
        today,
        (s) => setSessions(s.sort((a, b) => (b.startedAt?.toMillis() ?? 0) - (a.startedAt?.toMillis() ?? 0))),
        (e) => setError(errorMessage(e)),
      ),
    [today],
  );

  const activeGroups = groups.filter((g) => g.active);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm capitalize text-slate-500">{formatLongDate(today)}</p>
        <h1 className="text-2xl font-bold">Hola, {profile?.displayName?.split(" ")[0] || "docente"}</h1>
      </div>

      {isAdmin && !settingsExists && (
        <Alert kind="info">
          Configura el nombre y la zona horaria de la institución en <Link className="font-semibold underline" to="/configuracion">Configuración</Link>.
        </Alert>
      )}

      <Link to="/pasar-lista" className="flex items-center justify-between rounded-3xl bg-brand-600 p-6 text-white shadow-lg active:bg-brand-700">
        <div>
          <p className="text-2xl font-bold">Pasar lista</p>
          <p className="text-brand-100">Escanea los QR de tus alumnos</p>
        </div>
        <span className="text-5xl" aria-hidden>📷</span>
      </Link>

      {!groupsLoading && activeGroups.length === 0 && (
        <EmptyState title="Aún no hay grupos">
          {isAdmin ? (
            <Link to="/grupos" className={btnCls("primary", "sm")}>Crear el primer grupo</Link>
          ) : (
            "Pide a un administrador que cree los grupos y registre a los alumnos."
          )}
        </EmptyState>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">Sesiones de hoy</h2>
        {error && <Alert>{error}</Alert>}
        {!sessions && !error && <Spinner />}
        {sessions && sessions.length === 0 && <p className="text-sm text-slate-500">Todavía no se ha pasado lista hoy.</p>}
        <div className="space-y-2">
          {sessions?.map((s) => (
            <Link key={s.id} to={s.status === "open" ? `/pasar-lista/${s.id}` : `/historial/${s.id}`}>
              <Card className="flex items-center justify-between hover:border-brand-300">
                <div>
                  <p className="font-semibold">
                    {s.groupName} {s.label && <span className="font-normal text-slate-500">· {s.label}</span>}
                  </p>
                  <p className="text-sm text-slate-500">
                    {s.startedByName}
                    {s.totals && ` · ${s.totals.present + s.totals.late}/${s.totals.total} asistieron`}
                  </p>
                </div>
                {s.status === "open" ? (
                  <Badge className="border-emerald-300 bg-emerald-50 text-emerald-700">En curso · Continuar</Badge>
                ) : (
                  <Badge className="border-slate-300 bg-slate-50 text-slate-600">Cerrada</Badge>
                )}
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickLink to="/alumnos" icon="🎓" label="Alumnos" />
        <QuickLink to="/grupos" icon="🏫" label={`Grupos (${activeGroups.length})`} />
        <QuickLink to="/historial" icon="🗓️" label="Historial" />
        <QuickLink to="/informes" icon="📊" label="Informes" />
      </section>
    </div>
  );
}

function QuickLink({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <Link to={to} className="flex flex-col items-center gap-1 rounded-2xl border border-slate-200 bg-white p-4 font-medium shadow-sm hover:border-brand-300">
      <span className="text-2xl" aria-hidden>{icon}</span>
      {label}
    </Link>
  );
}
