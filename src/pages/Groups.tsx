import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useStaff } from "@/hooks/useAuth";
import { useAppData } from "@/hooks/useAppData";
import { errorMessage } from "@/lib/errors";
import { countStudentsInGroup, createGroup, deleteGroup, updateGroup } from "@/services/groups";
import type { Group } from "@/types";
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, PageLoader, btnCls, inputCls, useConfirm, useToast } from "@/components/ui";

export default function Groups() {
  const { actor, isAdmin } = useStaff();
  const { groups, groupsLoading } = useAppData();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Group | "new" | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Un conteo agregado por grupo (barato: no descarga alumnos)
  useEffect(() => {
    let cancelled = false;
    Promise.all(groups.map(async (g) => [g.id, await countStudentsInGroup(g.id).catch(() => -1)] as const)).then((pairs) => {
      if (!cancelled) setCounts(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [groups]);

  const toggle = async (g: Group) => {
    try {
      await updateGroup(g.id, { active: !g.active });
      toast(g.active ? "Grupo desactivado" : "Grupo activado");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const remove = async (g: Group) => {
    const ok = await confirm({
      title: "Eliminar grupo",
      message: (
        <>¿Eliminar el grupo <b>{g.name}</b>? Solo es posible si no tiene alumnos. Las sesiones e historial de asistencia se conservan.</>
      ),
      confirmText: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteGroup(g.id);
      toast("Grupo eliminado");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  if (groupsLoading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Grupos"
        subtitle="Salones o clases a los que se pasa lista"
        actions={isAdmin && <Button onClick={() => setEditing("new")}>+ Nuevo grupo</Button>}
      />
      {groups.length === 0 && <EmptyState title="No hay grupos registrados">{isAdmin ? "Crea el primero con el botón «Nuevo grupo»." : null}</EmptyState>}
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.id} className={g.active ? "" : "opacity-70"}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-lg font-bold">{g.name}</p>
                {g.description && <p className="text-sm text-slate-600">{g.description}</p>}
                <p className="mt-1 text-sm text-slate-500">
                  {counts[g.id] === undefined ? "…" : counts[g.id] < 0 ? "—" : `${counts[g.id]} alumno(s)`}
                </p>
              </div>
              {!g.active && <Badge className="border-slate-300 bg-slate-100 text-slate-600">Inactivo</Badge>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {g.active && (
                <Link to={`/pasar-lista?grupo=${g.id}`} className={btnCls("primary", "sm")}>Pasar lista</Link>
              )}
              <Link to={`/alumnos?grupo=${g.id}`} className={btnCls("secondary", "sm")}>Alumnos</Link>
              <Link to={`/imprimir/grupo/${g.id}`} target="_blank" rel="noopener" className={btnCls("secondary", "sm")}>Imprimir QR</Link>
              {isAdmin && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(g)}>Editar</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(g)}>{g.active ? "Desactivar" : "Activar"}</Button>
                  <Button size="sm" variant="ghost" className="text-rose-700" onClick={() => remove(g)}>Eliminar</Button>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>
      {editing && (
        <GroupForm
          group={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (name, description) => {
            if (editing === "new") await createGroup(actor, name, description);
            else await updateGroup(editing.id, { name: name.trim(), description: description.trim() });
            toast("Grupo guardado");
            setEditing(null);
          }}
          existingNames={groups.filter((g) => editing === "new" || g.id !== editing.id).map((g) => g.name.toLowerCase())}
        />
      )}
    </div>
  );
}

function GroupForm({ group, onClose, onSave, existingNames }: { group: Group | null; onClose: () => void; onSave: (n: string, d: string) => Promise<void>; existingNames: string[] }) {
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const n = name.trim();
    if (!n) return setError("El nombre es obligatorio.");
    if (n.length > 60) return setError("Máximo 60 caracteres.");
    if (existingNames.includes(n.toLowerCase())) return setError("Ya existe un grupo con ese nombre.");
    setBusy(true);
    setError(null);
    try {
      await onSave(n, description);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={group ? "Editar grupo" : "Nuevo grupo"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={busy}>Guardar</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), save())}>
        <Field label="Nombre del grupo" hint="Ejemplo: 2.º A, 3B Vespertino">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
        </Field>
        <Field label="Descripción (opcional)">
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
        </Field>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  );
}
