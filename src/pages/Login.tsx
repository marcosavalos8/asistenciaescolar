import { useState, type FormEvent } from "react";
import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { auth, firebaseConfigured } from "@/lib/firebase";
import { errorMessage } from "@/lib/errors";
import { Alert, Button, Card, Field, inputCls } from "@/components/ui";

export default function Login() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await sendEmailVerification(cred.user);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setError(null);
    if (!email.trim()) {
      setError("Escribe tu correo para enviarte el enlace de recuperación.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo("Si el correo tiene cuenta, recibirás un enlace para restablecer la contraseña.");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <img src="/icon.svg" alt="" className="mx-auto mb-3 h-14 w-14" />
          <h1 className="text-2xl font-bold">Asistencia escolar</h1>
          <p className="text-slate-600">Pase de lista con códigos QR</p>
        </div>
        <Card className="p-5">
          {!firebaseConfigured && (
            <div className="mb-4">
              <Alert>Faltan las variables de entorno de Firebase (VITE_FIREBASE_*). Revisa el README.</Alert>
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <Field label="Correo electrónico">
              <input className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Contraseña" hint={mode === "signup" ? "Mínimo 6 caracteres." : undefined}>
              <input
                className={inputCls}
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error && <Alert>{error}</Alert>}
            {info && <Alert kind="success">{info}</Alert>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
            </Button>
          </form>
          <div className="mt-4 flex flex-col items-center gap-2 text-sm">
            {mode === "login" ? (
              <>
                <button className="text-brand-700 hover:underline" onClick={reset}>¿Olvidaste tu contraseña?</button>
                <button className="text-slate-600 hover:underline" onClick={() => setMode("signup")}>
                  ¿Te invitaron? Crea tu cuenta
                </button>
              </>
            ) : (
              <>
                <p className="text-center text-slate-500">Solo podrás entrar si un administrador te invitó con este correo.</p>
                <button className="text-brand-700 hover:underline" onClick={() => setMode("login")}>Ya tengo cuenta</button>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
