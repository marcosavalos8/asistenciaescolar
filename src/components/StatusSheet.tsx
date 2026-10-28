import { useState } from "react";
import { STATUS_LABEL, STATUS_ORDER, STATUS_STYLE } from "@/lib/attendance";
import { errorMessage } from "@/lib/errors";
import type { AttendanceStatus } from "@/types";
import { Alert, Field, Modal, inputCls } from "./ui";

/** Hoja para registrar o corregir el estado de un alumno. */
export default function StatusSheet({
  title,
  subtitle,
  current,
  onClose,
  onPick,
}: {
  title: string;
  subtitle?: string;
  current: AttendanceStatus | null;
  onClose: () => void;
  onPick: (status: AttendanceStatus, note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<AttendanceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (s: AttendanceStatus) => {
    if (s === current) return onClose();
    setBusy(s);
    setError(null);
    try {
      await onPick(s, note);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  };

  return (
    <Modal open onClose={busy ? () => undefined : onClose} title={title}>
      {subtitle && <p className="-mt-1 mb-3 text-sm text-slate-600">{subtitle}</p>}
      <div className="grid grid-cols-2 gap-2">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => pick(s)}
            disabled={!!busy}
            className={`min-h-[64px] rounded-2xl border-2 text-lg font-semibold disabled:opacity-60 ${STATUS_STYLE[s]} ${current === s ? "ring-4 ring-slate-400" : ""}`}
          >
            {busy === s ? "Guardando…" : STATUS_LABEL[s]}
            {current === s && <span className="block text-xs font-normal">Estado actual</span>}
          </button>
        ))}
      </div>
      {current && (
        <div className="mt-4">
          <Field label="Motivo de la corrección (opcional)">
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ej. llegó tarde, presentó justificante" />
          </Field>
        </div>
      )}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </Modal>
  );
}
