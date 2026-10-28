import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const root = createRoot(document.getElementById("root")!);

// Vite incrusta las variables al compilar: si faltaban en el build (p. ej. en
// Vercel), Firebase falla al iniciar. Se muestra un aviso en vez de una página en blanco.
const missing = ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_PROJECT_ID", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_APP_ID"].filter(
  (k) => !import.meta.env[k],
);

if (missing.length) {
  root.render(
    <div className="mx-auto max-w-lg p-6">
      <h1 className="mb-2 text-xl font-bold">Falta la configuración de Firebase</h1>
      <p className="mb-3 text-slate-700">Esta compilación se generó sin las variables de entorno:</p>
      <ul className="mb-3 list-disc pl-6 font-mono text-sm">
        {missing.map((m) => <li key={m}>{m}</li>)}
      </ul>
      <p className="text-slate-700">Agrégalas en Vercel (Settings → Environment Variables) y vuelve a desplegar.</p>
    </div>,
  );
} else {
  // Carga diferida: así Firebase no se inicializa si falta la configuración.
  Promise.all([
    import("react-router-dom"),
    import("./App"),
    import("./hooks/useAuth"),
    import("./components/ui"),
  ]).then(([{ BrowserRouter }, { default: App }, { AuthProvider }, { ConfirmProvider, ToastProvider }]) => {
    root.render(
      <StrictMode>
        <BrowserRouter>
          <ToastProvider>
            <ConfirmProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </ConfirmProvider>
          </ToastProvider>
        </BrowserRouter>
      </StrictMode>,
    );
  });
}
