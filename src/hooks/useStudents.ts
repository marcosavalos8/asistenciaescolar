import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { subscribeAllStudents, subscribeStudentsByGroup } from "@/services/students";
import type { Student } from "@/types";

/** groupId: id de un grupo, "all" para todos, o null para no cargar nada. */
export function useStudents(groupId: string | "all" | null) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(Boolean(groupId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStudents([]);
    setError(null);
    if (!groupId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const onData = (s: Student[]) => {
      setStudents(s);
      setLoading(false);
    };
    const onError = (e: unknown) => {
      setError(errorMessage(e));
      setLoading(false);
    };
    return groupId === "all" ? subscribeAllStudents(onData, onError) : subscribeStudentsByGroup(groupId, onData, onError);
  }, [groupId]);

  return { students, loading, error };
}
