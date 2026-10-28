import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStaff } from "@/hooks/useAuth";
import { useAppData } from "@/hooks/useAppData";
import { errorMessage } from "@/lib/errors";
import { formatLongDate, isValidYmd, todayInZone } from "@/lib/time";
import { createSession, getSessionsForGroupDate } from "@/services/sessions";
import { unlockAudio } from "@/scanner/feedback";
import type { AttendanceSession } from "@/types";
import { Alert, Badge, Button, Card, EmptyState, Field, PageHeader, PageLoader, inputCls } from "@/components/ui";

const LS_KEY = "asis.attendance.group";

export default function AttendanceStart() {
  const { actor } = useStaff();
  const { groups, groupsLoading, settings } = useAppData();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const active = groups.filter((g) => g.active);
  const initialGroup = (() => {
    const fromUrl = params.get("grupo");
    let fromLs: string | null = null;
    try {
      fromLs = localStorage.getItem(LS_KEY);
    } catch {
      /* sin almacenamiento */
    }
    return [fromUrl, fromLs].find((id) => id && active.some((g) => g.id === id)) ?? active[0]?.id ?? "";
  })();
  const today = todayInZone(settings.timezone);
  const [groupId, setGroupId] = useState(initialGroup);
  const [date, setDate] = useState(today);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<AttendanceSession[] | null>(null);

  const effectiveGroup = groupId || initialGroup;
  const group = active.find((g) => g.id === effectiveGroup);

  const create = async () => {
    if (!group) return;
    setBusy(true);
    try {
      const id = await createSession(actor, group, date, label);
      navigate(`/pasar-lista/${id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const start = async () => {
    unlockAudio();
    setError(null);
    if (!group) return setError("Selecciona un grupo.");
    if (!isValidYmd(date)) return setError("Fecha no válida.");
    try {
      localStorage.setItem(LS_KEY, group.id);
    } catch {
      /* sin almacenamiento */
    }
    setBusy(true);
    try {
      const sessions = await getSessionsForGroupDate(group.id, date);
      if (sessions.length) {
        setExisting(sessions);
        setBusy(false);
        return;
      }
      await create();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  if (groupsLoading) return <PageLoader />;
  if (!active.length) return <EmptyState title="No hay grupos activos">Un administrador debe crear grupos y alumnos primero.</EmptyState>;

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Pasar lista" subtitle={`Zona horaria: ${settings.timezone}`} />
      <Card className="space-y-4 p-5">
        <Field label="Grupo">
          <select className={`${inputCls} text-lg`} value={effectiveGroup} onChange={(e) => (setGroupId(e.target.value), setExisting(null))}>
            {active.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Fecha" hint={isValidYmd(date) ? formatLongDate(date) + (date === today ? " (hoy)" : "") : undefined}>
          <input className={inputCls} type="date" value={date} max={today} onChange={(e) => (setDate(e.target.value), setExisting(null))} />
        </Field>
        <Field label="Clase o materia (opcional)" hint="Útil si pasas lista varias veces el mismo día.">
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Ej. Matemáticas, 1.ª hora" />
        </Field>
        {error && <Alert>{error}</Alert>}

        {existing ? (
          <div className="space-y-3">
            <Alert kind="warning">Ya hay {existing.length} sesión(es) de este grupo en esa fecha.</Alert>
            {existing.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(s.status === "open" ? `/pasar-lista/${s.id}` : `/historial/${s.id}`)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-brand-300"
              >
                <span>
                  <span className="font-semibold">{s.label || "Sin etiqueta"}</span>
                  <span className="block text-sm text-slate-500">{s.startedByName}</span>
                </span>
                {s.status === "open" ? (
                  <Badge className="border-emerald-300 bg-emerald-50 text-emerald-700">Continuar</Badge>
                ) : (
                  <Badge className="border-slate-300 bg-slate-50 text-slate-600">Cerrada · Ver</Badge>
                )}
              </button>
            ))}
            <Button size="lg" variant="secondary" className="w-full" onClick={create} loading={busy}>Crear otra sesión</Button>
          </div>
        ) : (
          <Button size="lg" className="w-full" onClick={start} loading={busy}>
            📷 Iniciar pase de lista
          </Button>
        )}
      </Card>
      <p className="mt-4 text-center text-xs text-slate-500">
        El QR identifica al alumno, pero no demuestra por sí solo que esté presente: verifica visualmente al escanear.
      </p>
    </div>
  );
}
