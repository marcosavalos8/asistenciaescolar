import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { errorMessage } from "@/lib/errors";
import { setServerOffset } from "@/lib/time";
import { claimInvite, getInviteFor, subscribeMyUser, touchLastSeen, type Actor } from "@/services/users";
import type { AppUser, Invite } from "@/types";

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "noAccess"; user: User; invite: Invite | null; error?: string }
  | { status: "ready"; user: User; profile: AppUser };

interface AuthCtx {
  state: AuthState;
  /** Usuario de la app (solo cuando status === "ready") */
  profile: AppUser | null;
  actor: Actor | null;
  isAdmin: boolean;
  retry: () => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const touched = useRef<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);

  useEffect(() => {
    if (user === undefined) return;
    if (user === null) {
      setState({ status: "signedOut" });
      touched.current = null;
      return;
    }
    setState({ status: "loading" });
    let claiming = false;
    let offsetDone = false;
    let writeStartedAt = 0;

    const unsub = subscribeMyUser(
      user.uid,
      async (profile, pending) => {
        if (profile && profile.active) {
          setState({ status: "ready", user, profile });
          // Una vez por sesión: lastSeen con hora del servidor → desfase del reloj local.
          if (touched.current !== user.uid) {
            touched.current = user.uid;
            writeStartedAt = Date.now();
            touchLastSeen(user.uid).catch(() => undefined);
          } else if (!offsetDone && !pending && writeStartedAt && profile.lastSeen) {
            offsetDone = true;
            const localMid = (writeStartedAt + Date.now()) / 2;
            setServerOffset(profile.lastSeen.toMillis() - localMid);
          }
          return;
        }
        if (profile && !profile.active) {
          setState({ status: "noAccess", user, invite: null, error: "Tu cuenta está desactivada. Contacta al administrador." });
          return;
        }
        // Sin perfil: ¿hay invitación para su correo?
        if (claiming) return;
        try {
          const invite = user.email ? await getInviteFor(user.email) : null;
          if (invite && user.emailVerified) {
            claiming = true;
            await claimInvite(user.uid, user.email!, invite);
            return; // el snapshot traerá el perfil nuevo
          }
          setState({ status: "noAccess", user, invite });
        } catch (e) {
          claiming = false;
          setState({ status: "noAccess", user, invite: null, error: errorMessage(e) });
        }
      },
      (e) => setState({ status: "noAccess", user, invite: null, error: errorMessage(e) }),
    );
    return unsub;
  }, [user, attempt]);

  const value = useMemo<AuthCtx>(() => {
    const profile = state.status === "ready" ? state.profile : null;
    return {
      state,
      profile,
      actor: profile ? { uid: profile.uid, name: profile.displayName || profile.email } : null,
      isAdmin: profile?.role === "admin",
      retry: () => {
        auth.currentUser
          ?.reload()
          .then(() => auth.currentUser?.getIdToken(true))
          .finally(() => {
            setUser(auth.currentUser);
            setAttempt((n) => n + 1);
          });
      },
      logout: () => signOut(auth),
    };
  }, [state]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth fuera de AuthProvider");
  return c;
}

/** Para páginas internas: garantiza actor/profile no nulos. */
export function useStaff() {
  const c = useAuth();
  if (!c.profile || !c.actor) throw new Error("Usuario no autorizado");
  return { profile: c.profile, actor: c.actor, isAdmin: c.isAdmin, logout: c.logout };
}
