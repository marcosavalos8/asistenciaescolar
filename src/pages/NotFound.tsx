import { Link } from "react-router-dom";
import { EmptyState, btnCls } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState title="Página no encontrada">
      <Link to="/" className={btnCls("primary", "sm")}>Ir al inicio</Link>
    </EmptyState>
  );
}
