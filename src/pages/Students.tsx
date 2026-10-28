import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStaff } from "@/hooks/useAuth";
import { useAppData } from "@/hooks/useAppData";
import { useStudents } from "@/hooks/useStudents";
import { errorMessage } from "@/lib/errors";
import { normalizeText } from "@/lib/text";
import { createStudent, deleteStudent, regenerateQr, setStudentActive, updateStudent } from "@/services/students";
import type { Student } from "@/types";
import { StudentQrPanel } from "@/components/QrCard";
import {
  Alert, Badge, Button, EmptyState, Field, Modal, PageHeader, PageLoader, btnCls, inputCls, useConfirm, useToast,
} from "@/components/ui";

const ImportDialog = lazy(() => import("@/components/ImportDialog"));
const LS_KEY = "asis.students.group";

function readLs() {
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

export default function Students() {
  const { actor, isAdmin } = useStaff();
  const { groups, groupById, settings } = useAppData();
  const [params, setParams] = useSearchParams();
  const wanted = params.get("grupo") || readLs() || "all";
  const groupFilter = wanted === "all" || groupById.has(wanted) || groups.length === 0 ? wanted : "all";
  const { students, loading, error } = useStudents(groupFilter);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [editing, setEditing] = useState<Student | "new" | null>(null);
  const [qrFor, setQrFor] = useState<Student | null>(null);
  const [importing, setImporting] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const setGroup = (g: string) => {
    try {
      localStorage.setItem(LS_KEY, g);
    } catch {
      /* sin almacenamiento local */
    }
    setParams(g === "all" ? {} : { grupo: g });
  };

  const filtered = useMemo(() => {
    const q = normalizeText(search);
    return students.filter(
      (s) =>
        (status === "all" || (status === "active" ? s.active : !s.active)) &&
        (!q || s.nameLower.includes(q) || (s.enrollmentId ?? "").toLowerCase().includes(q)),
    );
  }, [students, search, status]);

  const groupName = (id: string) => groupById.get(id)?.name ?? "(grupo eliminado)";

  const toggle = async (s: Student) => {
    try {
      await setStudentActive(s.id, !s.active);
      toast(s.active ? "Alumno desactivado" : "Alumno activado");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const remove = async (s: Student) => {
    const ok = await confirm({
      title: "Eliminar alumno",
      message: (
        <div className="space-y-2">
          <p>¿Eliminar a <b>{s.fullName}</b>?</p>
          <p className="text-sm">Su historial de asistencia <b>se conserva</b> en los informes. Su QR dejará de funcionar. Si solo dejó de asistir, es mejor <b>desactivarlo</b>.</p>
        </div>
      ),
      confirmText: "Eliminar alumno",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteStudent(s.id);
      toast("Alumno eliminado");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const regen = async (s: Student) => {
    const ok = await confirm({
      title: "Regenerar QR",
      message: "El QR actual dejará de funcionar de inmediato y tendrás que imprimir el nuevo. Úsalo si el código se perdió o se compartió.",
      confirmText: "Regenerar",
      danger: true,
    });
    if (!ok) return;
    try {
      await regenerateQr(s.id);
      toast("QR regenerado");
      setQrFor(null);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <div>
      <PageHeader
        title="Alumnos"
        subtitle={loading ? "Cargando…" : `${filtered.length} de ${students.length} alumno(s)`}
        actions={
          isAdmin && (
            <>
              <Button variant="secondary" onClick={() => setImporting(true)} disabled={groups.length === 0}>Importar CSV/Excel</Button>
              <Button onClick={() => setEditing("new")} disabled={groups.length === 0}>+ Alumno</Button>
            </>
          )
        }
      />

      {groups.length === 0 && (
        <div className="mb-4">
          <Alert kind="info">
            Primero crea un grupo en <Link to="/grupos" className="font-semibold underline">Grupos</Link>.
          </Alert>
        </div>
      )}

      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_200px_160px]">
        <input className={inputCls} type="search" placeholder="Buscar por nombre o matrícula" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={inputCls} value={groupFilter} onChange={(e) => setGroup(e.target.value)} aria-label="Grupo">
          <option value="all">Todos los grupos</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Estado">
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="all">Todos</option>
        </select>
      </div>

      {error && <Alert>{error}</Alert>}
      {loading ? (
        <PageLoader />
      ) : filtered.length === 0 ? (
        <EmptyState title={students.length ? "Sin resultados" : "No hay alumnos en este filtro"} />
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {filtered.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link to={`/alumnos/${s.id}`} className="font-semibold hover:text-brand-700">{s.fullName}</Link>
                <p className="text-sm text-slate-500">
                  {groupName(s.groupId)}
                  {s.enrollmentId && ` · ${s.enrollmentId}`}
                </p>
              </div>
              {!s.active && <Badge className="border-slate-300 bg-slate-100 text-slate-600">Inactivo</Badge>}
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="secondary" onClick={() => setQrFor(s)}>QR</Button>
                {isAdmin && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggle(s)}>{s.active ? "Desactivar" : "Activar"}</Button>
                    <Button size="sm" variant="ghost" className="text-rose-700" onClick={() => remove(s)}>Eliminar</Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {groupFilter !== "all" && filtered.length > 0 && (
        <div className="mt-4">
          <Link to={`/imprimir/grupo/${groupFilter}`} target="_blank" rel="noopener" className={btnCls("secondary")}>
            Imprimir hoja de QR del grupo
          </Link>
        </div>
      )}

      {qrFor && (
        <Modal
          open
          onClose={() => setQrFor(null)}
          title="Código QR"
          footer={isAdmin && <Button variant="ghost" className="text-rose-700" onClick={() => regen(qrFor)}>Regenerar QR</Button>}
        >
          <StudentQrPanel
            student={students.find((x) => x.id === qrFor.id) ?? qrFor}
            groupName={groupName(qrFor.groupId)}
            institution={settings.name}
          />
        </Modal>
      )}

      {editing && (
        <StudentForm
          student={editing === "new" ? null : editing}
          defaultGroupId={groupFilter !== "all" ? groupFilter : groups[0]?.id ?? ""}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            if (editing === "new") await createStudent(actor, input);
            else await updateStudent(editing.id, input);
            toast(editing === "new" ? "Alumno registrado con su QR" : "Cambios guardados");
            setEditing(null);
          }}
        />
      )}

      {importing && (
        <Suspense fallback={null}>
          <ImportDialog defaultGroupId={groupFilter !== "all" ? groupFilter : null} onClose={() => setImporting(false)} />
        </Suspense>
      )}
    </div>
  );
}

function StudentForm({
  student,
  defaultGroupId,
  onClose,
  onSave,
}: {
  student: Student | null;
  defaultGroupId: string;
  onClose: () => void;
  onSave: (i: { fullName: string; enrollmentId: string | null; groupId: string }) => Promise<void>;
}) {
  const { groups } = useAppData();
  const [fullName, setFullName] = useState(student?.fullName ?? "");
  const [enrollmentId, setEnrollmentId] = useState(student?.enrollmentId ?? "");
  const [groupId, setGroupId] = useState(student?.groupId ?? defaultGroupId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave({ fullName, enrollmentId: enrollmentId || null, groupId });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={student ? "Editar alumno" : "Nuevo alumno"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={busy}>Guardar</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), save())}>
        <Field label="Nombre completo">
          <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} autoFocus required />
        </Field>
        <Field label="Matrícula (opcional)">
          <input className={inputCls} value={enrollmentId} onChange={(e) => setEnrollmentId(e.target.value)} maxLength={40} />
        </Field>
        <Field label="Grupo">
          <select className={inputCls} value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
            <option value="" disabled>Selecciona…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}{g.active ? "" : " (inactivo)"}</option>
            ))}
          </select>
        </Field>
        {student && <p className="text-xs text-slate-500">Editar el nombre o el grupo no cambia su código QR.</p>}
        {error && <Alert>{error}</Alert>}
      </form>
    </Modal>
  );
}
