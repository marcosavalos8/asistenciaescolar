import { useCallback, useEffect, useState } from "react";
import { useStaff } from "@/hooks/useAuth";
import { useAppData } from "@/hooks/useAppData";
import { errorMessage } from "@/lib/errors";
import { listTimeZones, timeInZone, todayInZone, now } from "@/lib/time";
import { saveSettings } from "@/services/settings";
import { addUserByUid, createInvite, deleteInvite, listInvites, listUsers, removeUser, updateUser } from "@/services/users";
import type { AppUser, Invite, Role } from "@/types";
import { Alert, Badge, Button, Card, Field, Modal, PageHeader, PageLoader, inputCls, useConfirm, useToast } from "@/components/ui";

export default function Settings() {
  const { isAdmin, profile, actor } = useStaff();
  const toast = useToast();
  const [name, setName] = useState(profile.displayName);
  const [busy, setBusy] = useState(false);

  const saveName = async () => {
    setBusy(true);
    try {
      await updateUser(profile.uid, { displayName: name.trim() || profile.email });
      toast("Nombre actualizado");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Configuración" />
      <Card className="space-y-3">
        <h2 className="font-semibold">Mi cuenta</h2>
        <p className="text-sm text-slate-600">
          {profile.email} · {profile.role === "admin" ? "Administrador" : "Docente"} · UID <span className="font-mono text-xs">{profile.uid}</span>
        </p>
        <div className="flex gap-2">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Nombre visible" />
          <Button onClick={saveName} loading={busy} disabled={name === profile.displayName}>Guardar</Button>
        </div>
        <p className="text-xs text-slate-500">Este nombre aparece en los registros de asistencia que realices.</p>
      </Card>

      <InstitutionCard canEdit={isAdmin} actorUid={actor.uid} actorName={actor.name} />
      {isAdmin && <UsersCard />}

      <Card className="space-y-2 text-sm text-slate-700">
        <h2 className="font-semibold text-slate-900">Seguridad de los códigos QR</h2>
        <p>Cada QR contiene solo un identificador aleatorio de 128 bits (sin nombre ni matrícula) que se valida contra la base de datos.</p>
        <p>
          Un QR puede fotografiarse o copiarse: <b>no prueba por sí solo que el alumno esté presente</b>. Recomendaciones: escanea tú los
          códigos viendo a cada alumno, revisa la lista al cerrar, y si un código se compartió usa <b>Alumnos → QR → Regenerar QR</b> para
          invalidarlo.
        </p>
      </Card>
    </div>
  );
}

function InstitutionCard({ canEdit, actorUid, actorName }: { canEdit: boolean; actorUid: string; actorName: string }) {
  const { settings } = useAppData();
  const toast = useToast();
  const [name, setName] = useState(settings.name);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [busy, setBusy] = useState(false);
  const zones = listTimeZones();

  useEffect(() => {
    setName(settings.name);
    setTimezone(settings.timezone);
  }, [settings]);

  const save = async () => {
    if (!name.trim()) return toast("El nombre es obligatorio", "error");
    setBusy(true);
    try {
      await saveSettings({ uid: actorUid, name: actorName }, { name: name.trim(), timezone });
      toast("Configuración guardada");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Institución</h2>
      <Field label="Nombre">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} maxLength={100} />
      </Field>
      <Field label="Zona horaria" hint={`Fecha y hora actuales en esa zona: ${todayInZone(timezone)} ${timeInZone(now(), timezone)}. Se usa para la fecha predeterminada del pase de lista.`}>
        <select className={inputCls} value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!canEdit}>
          {!zones.includes(timezone) && <option value={timezone}>{timezone}</option>}
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
      </Field>
      {canEdit ? <Button onClick={save} loading={busy}>Guardar</Button> : <p className="text-xs text-slate-500">Solo un administrador puede cambiar estos datos.</p>}
    </Card>
  );
}

function UsersCard() {
  const { actor } = useStaff();
  const toast = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<"invite" | "uid" | null>(null);

  const load = useCallback(() => {
    Promise.all([listUsers(), listInvites()]).then(
      ([u, i]) => {
        setUsers(u);
        setInvites(i);
      },
      (e) => setError(errorMessage(e)),
    );
  }, []);
  useEffect(load, [load]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast(msg);
      load();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Usuarios autorizados</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setAdding("invite")}>Invitar por correo</Button>
          <Button size="sm" variant="secondary" onClick={() => setAdding("uid")}>Agregar por UID</Button>
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      {!users ? (
        <PageLoader />
      ) : (
        <ul className="divide-y divide-slate-200">
          {users.map((u) => (
            <li key={u.uid} className="flex flex-wrap items-center gap-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{u.displayName} {u.uid === actor.uid && <span className="text-xs text-slate-500">(tú)</span>}</p>
                <p className="text-sm text-slate-500">{u.email}</p>
              </div>
              <Badge className={u.role === "admin" ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-300 bg-slate-50 text-slate-600"}>
                {u.role === "admin" ? "Admin" : "Docente"}
              </Badge>
              {!u.active && <Badge className="border-rose-300 bg-rose-50 text-rose-700">Desactivado</Badge>}
              {u.uid !== actor.uid && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => act(() => updateUser(u.uid, { role: u.role === "admin" ? "teacher" : "admin" }), "Rol actualizado")}>
                    {u.role === "admin" ? "Hacer docente" : "Hacer admin"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => act(() => updateUser(u.uid, { active: !u.active }), u.active ? "Usuario desactivado" : "Usuario activado")}>
                    {u.active ? "Desactivar" : "Activar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-rose-700"
                    onClick={async () => {
                      if (await confirm({ title: "Quitar acceso", message: `¿Quitar el acceso de ${u.displayName}? Sus registros históricos se conservan.`, danger: true, confirmText: "Quitar" }))
                        act(() => removeUser(u.uid), "Acceso eliminado");
                    }}
                  >
                    Quitar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {invites.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-slate-600">Invitaciones pendientes</h3>
          <ul className="divide-y divide-slate-200 text-sm">
            {invites.map((i) => (
              <li key={i.email} className="flex items-center justify-between gap-2 py-2">
                <span>{i.email} · {i.role === "admin" ? "Admin" : "Docente"}</span>
                <Button size="sm" variant="ghost" onClick={() => act(() => deleteInvite(i.email), "Invitación cancelada")}>Cancelar</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-slate-500">
        La persona invitada crea su cuenta con ese correo desde la pantalla de inicio («¿Te invitaron?») y verifica su correo; el acceso se
        activa automáticamente.
      </p>
      {adding && (
        <AddUserModal
          mode={adding}
          onClose={() => setAdding(null)}
          onSave={async (email, displayName, role, uid) => {
            if (adding === "invite") await createInvite(actor, email, displayName, role);
            else await addUserByUid(actor, uid, email, displayName, role);
            toast(adding === "invite" ? "Invitación creada" : "Usuario agregado");
            setAdding(null);
            load();
          }}
        />
      )}
    </Card>
  );
}

function AddUserModal({ mode, onClose, onSave }: { mode: "invite" | "uid"; onClose: () => void; onSave: (email: string, name: string, role: Role, uid: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [uid, setUid] = useState("");
  const [role, setRole] = useState<Role>("teacher");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Correo no válido.");
    if (mode === "uid" && !/^[A-Za-z0-9]{20,128}$/.test(uid.trim())) return setError("UID no válido. La persona lo ve en su pantalla de «Acceso pendiente».");
    setBusy(true);
    setError(null);
    try {
      await onSave(email.trim(), name.trim() || email.trim(), role, uid.trim());
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "invite" ? "Invitar usuario" : "Agregar por UID"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={busy}>Guardar</Button>
        </>
      }
    >
      <div className="space-y-3">
        {mode === "uid" && (
          <Field label="UID de Firebase" hint="Aparece en la pantalla «Acceso pendiente» de la persona tras iniciar sesión.">
            <input className={`${inputCls} font-mono text-sm`} value={uid} onChange={(e) => setUid(e.target.value)} />
          </Field>
        )}
        <Field label="Correo">
          <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Nombre visible">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Rol">
          <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="teacher">Docente: pasa lista y corrige sesiones abiertas</option>
            <option value="admin">Administrador: además gestiona alumnos, grupos, usuarios y sesiones cerradas</option>
          </select>
        </Field>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}
