import { useMemo, useState } from "react";
import { useStaff } from "@/hooks/useAuth";
import { useAppData } from "@/hooks/useAppData";
import { errorMessage } from "@/lib/errors";
import { validateImport, type ImportRowResult } from "@/lib/importStudents";
import { downloadText, toCsv } from "@/lib/csv";
import { normalizeText } from "@/lib/text";
import { createGroup } from "@/services/groups";
import { getAllStudentsOnce, importStudents } from "@/services/students";
import { Alert, Button, Field, Modal, inputCls, useToast } from "./ui";

async function readRows(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    const data = await readSheet(file);
    return data.map((r) => r.map((c) => (c === null || c === undefined ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))));
  }
  if (name.endsWith(".xls")) throw new Error("El formato .xls antiguo no es compatible. Guarda el archivo como .xlsx o .csv.");
  const Papa = (await import("papaparse")).default;
  const text = await file.text();
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy", delimiter: "" });
  if (parsed.errors.length && !parsed.data.length) throw new Error("No se pudo leer el CSV: " + parsed.errors[0].message);
  return parsed.data;
}

export default function ImportDialog({ defaultGroupId, onClose }: { defaultGroupId: string | null; onClose: () => void }) {
  const { actor } = useStaff();
  const { groups } = useAppData();
  const toast = useToast();
  const [targetGroup, setTargetGroup] = useState(defaultGroupId ?? "");
  const [rows, setRows] = useState<string[][] | null>(null);
  const [existing, setExisting] = useState<Awaited<ReturnType<typeof getAllStudentsOnce>> | null>(null);
  const [fileName, setFileName] = useState("");
  const [createMissing, setCreateMissing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setBusy(true);
    try {
      if (f.size > 5 * 1024 * 1024) throw new Error("El archivo es demasiado grande (máx. 5 MB).");
      const [r, ex] = await Promise.all([readRows(f), existing ? Promise.resolve(existing) : getAllStudentsOnce()]);
      setRows(r);
      setExisting(ex);
      setFileName(f.name);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const validation = useMemo(() => {
    if (!rows || !existing) return null;
    return validateImport(rows, { groups, existingStudents: existing, defaultGroupId: targetGroup || null });
  }, [rows, existing, groups, targetGroup]);

  const okRows = validation?.results.filter((r) => r.status === "ok" && (r.groupId || createMissing)) ?? [];
  const counts = validation
    ? {
        ok: validation.results.filter((r) => r.status === "ok").length,
        dup: validation.results.filter((r) => r.status === "duplicate").length,
        err: validation.results.filter((r) => r.status === "error").length,
      }
    : null;

  const run = async () => {
    if (!validation) return;
    setBusy(true);
    setError(null);
    try {
      // Crea los grupos que no existen (si se eligió) y resuelve sus ids.
      const newIds = new Map<string, string>();
      if (createMissing) {
        for (const name of validation.missingGroups) newIds.set(normalizeText(name), await createGroup(actor, name, ""));
      }
      const toWrite = okRows
        .map((r) => ({ fullName: r.fullName, enrollmentId: r.enrollmentId, groupId: r.groupId ?? newIds.get(normalizeText(r.groupName)) ?? "" }))
        .filter((r) => r.groupId);
      await importStudents(actor, toWrite, setProgress);
      toast(`${toWrite.length} alumno(s) importado(s)`);
      onClose();
    } catch (e) {
      setError(errorMessage(e) + " Puede que una parte se haya importado: vuelve a cargar el archivo, los existentes se marcarán como duplicados.");
      setExisting(null);
      setRows(null);
      setBusy(false);
    }
  };

  const downloadTemplate = () =>
    downloadText("plantilla_alumnos.csv", toCsv(["nombre", "matricula", "grupo"], [["Ana López García", "A001", groups[0]?.name ?? "2A"]]));

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title="Importar alumnos"
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={run} loading={busy && !!validation} disabled={!okRows.length}>
            Importar {okRows.length || ""} alumno(s)
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Archivo <b>.csv</b> o <b>.xlsx</b> con encabezados <code>nombre</code>, <code>matricula</code> (opcional) y <code>grupo</code>.
          También se aceptan columnas separadas «nombres», «apellido paterno», «apellido materno».{" "}
          <button className="text-brand-700 underline" onClick={downloadTemplate}>Descargar plantilla</button>
        </p>
        <Field label="Grupo de destino" hint="Se usa para las filas sin grupo (o si el archivo no tiene esa columna).">
          <select className={inputCls} value={targetGroup} onChange={(e) => setTargetGroup(e.target.value)}>
            <option value="">— Usar la columna «grupo» del archivo —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </Field>
        <input
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => onFile(e.target.files?.[0])}
          disabled={busy}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:font-semibold file:text-brand-700"
        />
        {error && <Alert>{error}</Alert>}
        {validation?.headerError && <Alert>{validation.headerError}</Alert>}
        {busy && validation && <Alert kind="info">Importando… {progress}/{okRows.length}</Alert>}

        {validation && counts && !validation.headerError && (
          <>
            <p className="text-sm">
              <b>{fileName}</b>: {counts.ok} nuevos · {counts.dup} duplicados (se omiten) · {counts.err} con errores (se omiten)
            </p>
            {validation.missingGroups.length > 0 && (
              <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                <input type="checkbox" className="mt-1" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
                <span>
                  Crear los grupos que no existen: <b>{validation.missingGroups.join(", ")}</b>. Si no lo marcas, esas filas se omiten.
                </span>
              </label>
            )}
            <PreviewTable rows={validation.results} />
          </>
        )}
      </div>
    </Modal>
  );
}

function PreviewTable({ rows }: { rows: ImportRowResult[] }) {
  const style = { ok: "text-emerald-700", duplicate: "text-amber-700", error: "text-rose-700" };
  const label = { ok: "Nuevo", duplicate: "Duplicado", error: "Error" };
  return (
    <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-2 py-2">Fila</th>
            <th className="px-2 py-2">Nombre</th>
            <th className="px-2 py-2">Matrícula</th>
            <th className="px-2 py-2">Grupo</th>
            <th className="px-2 py-2">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.line}>
              <td className="px-2 py-1.5 text-slate-500">{r.line}</td>
              <td className="px-2 py-1.5">{r.fullName || "—"}</td>
              <td className="px-2 py-1.5">{r.enrollmentId ?? ""}</td>
              <td className="px-2 py-1.5">{r.groupName}{!r.groupId && r.groupName ? " (nuevo)" : ""}</td>
              <td className={`px-2 py-1.5 font-medium ${style[r.status]}`}>
                {label[r.status]}
                {r.message && <span className="block text-xs font-normal">{r.message}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
