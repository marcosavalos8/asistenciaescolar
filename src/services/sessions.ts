import {
  addDoc, collection, doc, getDocs, increment, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where,
  writeBatch, type FieldValue, type QueryConstraint,
} from "firebase/firestore";
import { COL, db } from "@/lib/firebase";
import { withTimeout } from "@/lib/errors";
import { recordId } from "@/lib/attendance";
import type { AttendanceSession, AttendanceStatus, Group, SessionTotals, Student } from "@/types";
import type { Actor } from "./users";

const col = () => collection(db, COL.sessions);

function fromSnap(d: { id: string; data: () => unknown }): AttendanceSession {
  return { id: d.id, ...(d.data() as Omit<AttendanceSession, "id">) };
}

export async function createSession(actor: Actor, group: Group, date: string, label: string): Promise<string> {
  const ref = await withTimeout(
    addDoc(col(), {
      groupId: group.id,
      groupName: group.name,
      date,
      label: label.trim(),
      status: "open",
      startedAt: serverTimestamp(),
      startedBy: actor.uid,
      startedByName: actor.name,
      totals: null,
    }),
  );
  return ref.id;
}

export async function getSessionsForGroupDate(groupId: string, date: string): Promise<AttendanceSession[]> {
  const snap = await withTimeout(getDocs(query(col(), where("groupId", "==", groupId), where("date", "==", date))));
  return snap.docs.map(fromSnap).sort((a, b) => (a.startedAt?.toMillis() ?? 0) - (b.startedAt?.toMillis() ?? 0));
}

export function subscribeSession(id: string, cb: (s: AttendanceSession | null) => void, onError: (e: unknown) => void) {
  return onSnapshot(doc(db, COL.sessions, id), (snap) => cb(snap.exists() ? fromSnap(snap) : null), onError);
}

export function subscribeSessionsByDate(date: string, cb: (s: AttendanceSession[]) => void, onError: (e: unknown) => void) {
  return onSnapshot(query(col(), where("date", "==", date)), (snap) => cb(snap.docs.map(fromSnap)), onError);
}

export async function listSessions(opts: { from: string; to: string; groupId?: string | null }): Promise<AttendanceSession[]> {
  const c: QueryConstraint[] = [];
  if (opts.groupId) c.push(where("groupId", "==", opts.groupId));
  c.push(where("date", ">=", opts.from), where("date", "<=", opts.to), orderBy("date", "desc"), limit(500));
  const snap = await withTimeout(getDocs(query(col(), ...c)), 15000);
  return snap.docs.map(fromSnap);
}

/**
 * Cierra la sesión. Si `absentFor` trae alumnos, primero crea sus registros
 * como "Ausente" (método "auto"); al final marca la sesión como cerrada.
 */
export async function closeSession(
  actor: Actor,
  session: AttendanceSession,
  absentFor: Student[],
  totals: SessionTotals,
) {
  const CHUNK = 400;
  for (let i = 0; i < absentFor.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const s of absentFor.slice(i, i + CHUNK)) {
      batch.set(doc(db, COL.records, recordId(session.id, s.id)), {
        sessionId: session.id,
        studentId: s.id,
        studentName: s.fullName,
        enrollmentId: s.enrollmentId ?? null,
        groupId: session.groupId,
        groupName: session.groupName,
        date: session.date,
        status: "absent",
        method: "auto",
        recordedAt: serverTimestamp(),
        recordedBy: actor.uid,
        recordedByName: actor.name,
        correctionCount: 0,
      });
    }
    await withTimeout(batch.commit(), 20000);
  }
  await withTimeout(
    updateDoc(doc(db, COL.sessions, session.id), {
      status: "closed",
      closedAt: serverTimestamp(),
      closedBy: actor.uid,
      closedByName: actor.name,
      totals,
    }),
  );
}

/** Ajusta los totales guardados de una sesión cerrada tras una corrección (solo admin). */
export function adjustClosedTotals(sessionId: string, from: AttendanceStatus | null, to: AttendanceStatus) {
  if (from === to) return Promise.resolve();
  const data: Record<string, FieldValue> = { [`totals.${to}`]: increment(1) };
  if (from) data[`totals.${from}`] = increment(-1);
  return withTimeout(updateDoc(doc(db, COL.sessions, sessionId), data));
}
