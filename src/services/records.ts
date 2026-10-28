import {
  collection, doc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, where,
  type QueryConstraint,
} from "firebase/firestore";
import { COL, db } from "@/lib/firebase";
import { withTimeout } from "@/lib/errors";
import { recordId } from "@/lib/attendance";
import type { AttendanceRecord, AttendanceSession, AttendanceStatus, RecordMethod, Student } from "@/types";
import type { Actor } from "./users";

const col = () => collection(db, COL.records);

function fromSnap(d: { id: string; data: () => unknown }): AttendanceRecord {
  return { id: d.id, ...(d.data() as Omit<AttendanceRecord, "id">) };
}

export function subscribeSessionRecords(
  sessionId: string,
  cb: (records: AttendanceRecord[], fromCache: boolean) => void,
  onError: (e: unknown) => void,
) {
  return onSnapshot(
    query(col(), where("sessionId", "==", sessionId)),
    { includeMetadataChanges: true },
    (snap) => cb(snap.docs.map(fromSnap), snap.metadata.fromCache),
    onError,
  );
}

export async function getSessionRecords(sessionId: string): Promise<AttendanceRecord[]> {
  const snap = await withTimeout(getDocs(query(col(), where("sessionId", "==", sessionId))));
  return snap.docs.map(fromSnap);
}

export type RegisterResult =
  | { result: "created"; record: AttendanceRecord }
  | { result: "exists"; record: AttendanceRecord };

/**
 * Registra la asistencia con id determinista `${sessionId}_${studentId}` dentro
 * de una transacción: si ya existe, no escribe nada y devuelve "exists".
 * Las transacciones fallan sin conexión, así que nunca se confirma algo que no
 * llegó al servidor. Las reglas de Firestore impiden además sobrescribirlo.
 */
export async function registerAttendance(
  actor: Actor,
  session: AttendanceSession,
  student: Student,
  method: RecordMethod,
  status: AttendanceStatus = "present",
): Promise<RegisterResult> {
  const ref = doc(db, COL.records, recordId(session.id, student.id));
  return withTimeout(
    runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) return { result: "exists", record: fromSnap(snap) } as const;
      const data = {
        sessionId: session.id,
        studentId: student.id,
        studentName: student.fullName,
        enrollmentId: student.enrollmentId ?? null,
        groupId: session.groupId,
        groupName: session.groupName,
        date: session.date,
        status,
        method,
        recordedAt: serverTimestamp(),
        recordedBy: actor.uid,
        recordedByName: actor.name,
        correctionCount: 0,
      };
      tx.set(ref, data);
      return { result: "created", record: { id: ref.id, ...data, recordedAt: null } } as const;
    }),
    10000,
  );
}

/**
 * Cambia el estado de un registro y deja constancia en `asis_audit`
 * (id `${recordId}_${n}`; las reglas exigen que exista en la misma transacción).
 */
export async function correctRecord(actor: Actor, rec: AttendanceRecord, status: AttendanceStatus, note: string) {
  const ref = doc(db, COL.records, rec.id);
  return withTimeout(
    runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw Object.assign(new Error("El registro no existe."), { code: "not-found" });
      const cur = snap.data() as AttendanceRecord;
      const n = (cur.correctionCount ?? 0) + 1;
      tx.update(ref, {
        status,
        note: note.trim().slice(0, 300),
        correctionCount: n,
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
        updatedByName: actor.name,
      });
      tx.set(doc(db, COL.audit, `${rec.id}_${n}`), {
        type: "record_correction",
        recordId: rec.id,
        sessionId: cur.sessionId,
        studentId: cur.studentId,
        studentName: cur.studentName,
        from: cur.status,
        to: status,
        note: note.trim().slice(0, 300),
        by: actor.uid,
        byName: actor.name,
        at: serverTimestamp(),
      });
      return cur.status;
    }),
    10000,
  );
}

export async function listRecordsByStudent(studentId: string, from?: string, to?: string): Promise<AttendanceRecord[]> {
  const c: QueryConstraint[] = [where("studentId", "==", studentId)];
  if (from) c.push(where("date", ">=", from));
  if (to) c.push(where("date", "<=", to));
  c.push(orderBy("date", "desc"), limit(1000));
  const snap = await withTimeout(getDocs(query(col(), ...c)), 15000);
  return snap.docs.map(fromSnap);
}

export async function listRecordsByGroupRange(groupId: string, from: string, to: string): Promise<AttendanceRecord[]> {
  const snap = await withTimeout(
    getDocs(
      query(col(), where("groupId", "==", groupId), where("date", ">=", from), where("date", "<=", to), orderBy("date", "desc"), limit(10000)),
    ),
    20000,
  );
  return snap.docs.map(fromSnap);
}

export async function listAuditForRecord(recordIdValue: string) {
  const snap = await getDocs(query(collection(db, COL.audit), where("recordId", "==", recordIdValue)));
  return snap.docs
    .map((d) => d.data() as { from: AttendanceStatus; to: AttendanceStatus; byName: string; note?: string; at?: { toDate(): Date } | null })
    .sort((a, b) => (a.at?.toDate().getTime() ?? 0) - (b.at?.toDate().getTime() ?? 0));
}
