import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { AppDataProvider } from "./hooks/useAppData";
import Layout from "./components/Layout";
import { PageLoader } from "./components/ui";
import Login from "./pages/Login";
import NoAccess from "./pages/NoAccess";
import Dashboard from "./pages/Dashboard";

// Carga diferida: el escáner, la importación y los informes no se descargan
// hasta que se usan (importante en redes móviles).
const Students = lazy(() => import("./pages/Students"));
const StudentDetail = lazy(() => import("./pages/StudentDetail"));
const Groups = lazy(() => import("./pages/Groups"));
const AttendanceStart = lazy(() => import("./pages/AttendanceStart"));
const AttendanceLive = lazy(() => import("./pages/AttendanceLive"));
const AttendanceReview = lazy(() => import("./pages/AttendanceReview"));
const History = lazy(() => import("./pages/History"));
const SessionDetail = lazy(() => import("./pages/SessionDetail"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const More = lazy(() => import("./pages/More"));
const PrintGroup = lazy(() => import("./pages/PrintGroup"));
const PrintStudent = lazy(() => import("./pages/PrintStudent"));
const NotFound = lazy(() => import("./pages/NotFound"));

export default function App() {
  const { state } = useAuth();

  if (state.status === "loading") return <PageLoader label="Iniciando…" />;
  if (state.status === "signedOut") return <Login />;
  if (state.status === "noAccess") return <NoAccess user={state.user} invite={state.invite} error={state.error} />;

  return (
    <AppDataProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/pasar-lista/:sessionId" element={<AttendanceLive />} />
          <Route path="/imprimir/grupo/:groupId" element={<PrintGroup />} />
          <Route path="/imprimir/alumno/:studentId" element={<PrintStudent />} />
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="pasar-lista" element={<AttendanceStart />} />
            <Route path="pasar-lista/:sessionId/revisar" element={<AttendanceReview />} />
            <Route path="alumnos" element={<Students />} />
            <Route path="alumnos/:studentId" element={<StudentDetail />} />
            <Route path="grupos" element={<Groups />} />
            <Route path="historial" element={<History />} />
            <Route path="historial/:sessionId" element={<SessionDetail />} />
            <Route path="informes" element={<Reports />} />
            <Route path="configuracion" element={<Settings />} />
            <Route path="mas" element={<More />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </AppDataProvider>
  );
}
