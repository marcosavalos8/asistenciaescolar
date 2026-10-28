import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAppData } from "@/hooks/useAppData";
import { useOnline } from "@/hooks/useOnline";
import { Alert } from "./ui";

const NAV = [
  { to: "/", label: "Inicio", icon: "🏠", end: true },
  { to: "/pasar-lista", label: "Pasar lista", icon: "📷" },
  { to: "/alumnos", label: "Alumnos", icon: "🎓" },
  { to: "/grupos", label: "Grupos", icon: "🏫" },
  { to: "/historial", label: "Historial", icon: "🗓️" },
  { to: "/informes", label: "Informes", icon: "📊" },
  { to: "/configuracion", label: "Configuración", icon: "⚙️" },
];

const MOBILE_NAV = [
  { to: "/", label: "Inicio", icon: "🏠", end: true },
  { to: "/alumnos", label: "Alumnos", icon: "🎓" },
  { to: "/pasar-lista", label: "Pasar lista", icon: "📷", primary: true },
  { to: "/historial", label: "Historial", icon: "🗓️" },
  { to: "/mas", label: "Más", icon: "☰" },
];

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="sticky top-0 z-40 bg-rose-600 px-4 py-2 text-center text-sm font-semibold text-white">
      Sin conexión a internet. Las asistencias no se guardarán hasta recuperar la conexión.
    </div>
  );
}

export default function Layout() {
  const { profile, logout } = useAuth();
  const { settings, error } = useAppData();

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Asistencia</p>
          <p className="truncate font-bold">{settings.name}</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-100"}`
              }
            >
              <span aria-hidden>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4 text-sm">
          <p className="truncate font-medium">{profile?.displayName}</p>
          <p className="truncate text-slate-500">{profile?.role === "admin" ? "Administrador" : "Docente"}</p>
          <button onClick={logout} className="mt-2 text-brand-700 hover:underline">Cerrar sesión</button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <OfflineBanner />
        <main className="mx-auto max-w-5xl px-4 pb-28 pt-5 lg:pb-10 lg:pt-8">
          {error && (
            <div className="mb-4">
              <Alert>{error}</Alert>
            </div>
          )}
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg items-end justify-around px-2">
          {MOBILE_NAV.map((n) =>
            n.primary ? (
              <NavLink key={n.to} to={n.to} className="-mt-6 flex flex-col items-center" aria-label={n.label}>
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-2xl text-white shadow-lg ring-4 ring-white">
                  {n.icon}
                </span>
                <span className="mb-1 mt-0.5 text-xs font-semibold text-brand-700">{n.label}</span>
              </NavLink>
            ) : (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex min-w-[64px] flex-col items-center py-2 text-xs font-medium ${isActive ? "text-brand-700" : "text-slate-500"}`
                }
              >
                <span className="text-xl" aria-hidden>{n.icon}</span>
                {n.label}
              </NavLink>
            ),
          )}
        </div>
      </nav>
    </div>
  );
}
