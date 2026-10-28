import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useAppData } from "@/hooks/useAppData";
import { useStudents } from "@/hooks/useStudents";
import { qrPayload } from "@/lib/qr";
import type { Student } from "@/types";
import { Alert, Button, PageLoader } from "@/components/ui";

export function PrintCard({ student, groupName, institution, big }: { student: Student; groupName: string; institution: string; big?: boolean }) {
  return (
    <div className={`print-card flex flex-col items-center rounded-xl border border-dashed border-slate-400 bg-white text-center ${big ? "p-8" : "p-3"}`}>
      <p className={`${big ? "text-base" : "text-[10px]"} uppercase tracking-wide text-slate-500`}>{institution}</p>
      <QRCodeSVG value={qrPayload(student.qrToken)} size={big ? 320 : 150} level="M" marginSize={2} className="my-1" />
      <p className={`${big ? "text-2xl" : "text-sm"} font-bold leading-tight`}>{student.fullName}</p>
      <p className={`${big ? "text-lg" : "text-xs"} text-slate-600`}>Grupo: {groupName}</p>
    </div>
  );
}

export default function PrintGroup() {
  const { groupId = "" } = useParams();
  const { groupById, settings, groupsLoading } = useAppData();
  const { students, loading, error } = useStudents(groupId);
  const group = groupById.get(groupId);
  const active = students.filter((s) => s.active);

  if (loading || groupsLoading) return <PageLoader />;

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-4 print:p-0">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">QR del grupo {group?.name ?? ""}</h1>
          <p className="text-sm text-slate-600">{active.length} alumno(s) activos. Recorta por la línea punteada.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.close()}>Cerrar</Button>
          <Button onClick={() => window.print()} disabled={!active.length}>Imprimir</Button>
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      {!group && <Alert>Grupo no encontrado.</Alert>}
      <div className="grid grid-cols-3 gap-3 print:gap-2">
        {active.map((s) => (
          <PrintCard key={s.id} student={s} groupName={group?.name ?? ""} institution={settings.name} />
        ))}
      </div>
    </div>
  );
}
