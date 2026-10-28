import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "success";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-900 disabled:bg-brand-600/50",
  secondary: "bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50",
  danger: "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-600/50",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-600/50",
  ghost: "text-slate-700 hover:bg-slate-100 disabled:opacity-50",
};

/** Clases de botón, también para <Link> con aspecto de botón. */
export function btnCls(variant: Variant = "primary", size: "sm" | "md" | "lg" = "md") {
  const sz = size === "lg" ? "min-h-[56px] px-6 text-lg" : size === "sm" ? "min-h-[36px] px-3 text-sm" : "min-h-[44px] px-4";
  return `inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed ${sz} ${VARIANTS[variant]}`;
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      className={`${btnCls(variant, size)} ${className}`}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

export function Spinner({ small, label }: { small?: boolean; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <span className={`${small ? "h-4 w-4" : "h-6 w-6"} animate-spin rounded-full border-2 border-current border-t-transparent`} />
      {label && <span className="text-slate-600">{label}</span>}
    </span>
  );
}

export function PageLoader({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="flex justify-center py-16 text-brand-600">
      <Spinner label={label} />
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "warning" | "info" | "success"; children: ReactNode }) {
  const s = {
    error: "border-rose-200 bg-rose-50 text-rose-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[kind];
  return <div className={`rounded-xl border px-4 py-3 text-sm ${s}`} role={kind === "error" ? "alert" : undefined}>{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100";

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white outline-none sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

interface ConfirmOpts {
  title: string;
  message: ReactNode;
  confirmText?: string;
  danger?: boolean;
}

const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(() => Promise.resolve(false));

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<(v: boolean) => void>();
  const confirm = useCallback((o: ConfirmOpts) => {
    setOpts(o);
    return new Promise<boolean>((res) => (resolver.current = res));
  }, []);
  const close = (v: boolean) => {
    resolver.current?.(v);
    setOpts(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!opts}
        onClose={() => close(false)}
        title={opts?.title ?? ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>Cancelar</Button>
            <Button variant={opts?.danger ? "danger" : "primary"} onClick={() => close(true)}>{opts?.confirmText ?? "Confirmar"}</Button>
          </>
        }
      >
        <div className="text-slate-700">{opts?.message}</div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);

type Toast = { id: number; text: string; kind: "success" | "error" | "info" };
const ToastCtx = createContext<(text: string, kind?: Toast["kind"]) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast["kind"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
              t.kind === "error" ? "bg-rose-600" : t.kind === "info" ? "bg-slate-800" : "bg-emerald-600"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

export function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${className}`}>{children}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
      <p className="font-semibold text-slate-700">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}
