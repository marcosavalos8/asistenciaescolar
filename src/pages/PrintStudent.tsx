import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAppData } from "@/hooks/useAppData";
import { errorMessage } from "@/lib/errors";
import { getStudent } from "@/services/students";
import type { Student } from "@/types";
import { Alert, Button, PageLoader } from "@/components/ui";
import { PrintCard } from "./PrintGroup";

export default function PrintStudent() {
  const { studentId = "" } = useParams();
  const { groupById, settings } = useAppData();
  const [student, setStudent] = useState<Student | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStudent(studentId).then(setStudent, (e) => setError(errorMessage(e)));
  }, [studentId]);

  if (error) return <div className="p-4"><Alert>{error}</Alert></div>;
  if (student === undefined) return <PageLoader />;
  if (!student) return <div className="p-4"><Alert>Alumno no encontrado.</Alert></div>;

  return (
    <div className="mx-auto max-w-md p-4">
      <div className="no-print mb-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => window.close()}>Cerrar</Button>
        <Button onClick={() => window.print()}>Imprimir</Button>
      </div>
      <PrintCard student={student} groupName={groupById.get(student.groupId)?.name ?? ""} institution={settings.name} big />
    </div>
  );
}
