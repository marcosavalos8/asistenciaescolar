import { Link } from "react-router-dom";
import { useStaff } from "@/hooks/useAuth";

const ITEMS = [
  { to: "/grupos", icon: "🏫", label: "Grupos" },
  { to: "/informes", icon: "📊", label: "Informes" },
  { to: "/configuracion", icon: "⚙️", label: "Configuración" },
];

export default function More() {
  const { profile, logout } = useStaff();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Más</h1>
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {ITEMS.map((i) => (
          <li key={i.to}>
            <Link to={i.to} className="flex items-center gap-3 px-4 py-4 text-lg font-medium active:bg-slate-50">
              <span aria-hidden>{i.icon}</span>
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="font-medium">{profile.displayName}</p>
        <p className="text-sm text-slate-500">{profile.email} · {profile.role === "admin" ? "Administrador" : "Docente"}</p>
        <button onClick={logout} className="mt-3 font-semibold text-rose-700">Cerrar sesión</button>
      </div>
    </div>
  );
}
