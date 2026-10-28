import { useState } from "react";
import { sendEmailVerification, type User } from "firebase/auth";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/errors";
import type { Invite } from "@/types";
import { Alert, Button, Card } from "@/components/ui";

export default function NoAccess({ user, invite, error }: { user: User; invite: Invite | null; error?: string }) {
  const { retry, logout } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const resend = async () => {
    try {
      await sendEmailVerification(user);
      setMsg("Te enviamos un nuevo correo de verificación. Revisa también la carpeta de spam.");
    } catch (e) {
      setMsg(errorMessage(e));
    }
  };

  const copyUid = async () => {
    try {
      await navigator.clipboard.writeText(user.uid);
      setCopied(true);
    } catch {
      /* el usuario puede copiarlo a mano */
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md space-y-4 p-6">
        <h1 className="text-xl font-bold">Acceso pendiente</h1>
        {error && <Alert>{error}</Alert>}
        {invite && !user.emailVerified ? (
          <>
            <Alert kind="info">
              Tienes una invitación como <b>{invite.role === "admin" ? "administrador" : "docente"}</b>. Para activarla, verifica tu
              correo <b>{user.email}</b> con el enlace que te enviamos y después pulsa «Ya verifiqué».
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button onClick={retry}>Ya verifiqué</Button>
              <Button variant="secondary" onClick={resend}>Reenviar correo</Button>
            </div>
            {msg && <p className="text-sm text-slate-600">{msg}</p>}
          </>
        ) : (
          !error && (
            <p className="text-slate-700">
              Tu cuenta (<b>{user.email}</b>) aún no está autorizada en el sistema de asistencia. Pide a un administrador que te invite
              con tu correo o que te dé de alta con tu identificador:
            </p>
          )
        )}
        <div className="rounded-xl bg-slate-100 p-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Tu UID</p>
          <p className="break-all font-mono text-sm">{user.uid}</p>
          <button onClick={copyUid} className="mt-1 text-sm text-brand-700 hover:underline">{copied ? "Copiado ✓" : "Copiar"}</button>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={retry}>Reintentar</Button>
          <Button variant="ghost" onClick={logout}>Cerrar sesión</Button>
        </div>
      </Card>
    </div>
  );
}
