import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { COL, db } from "@/lib/firebase";
import { withTimeout } from "@/lib/errors";
import { generateQrToken } from "@/lib/qr";
import { cleanEnrollment, cleanName, normalizeText } from "@/lib/text";
import type { Student } from "@/types";
import type { Actor } from "./users";

const col = () => collection(db, COL.students);

function fromSnap(d: { id: string; data: () => unknown }): Student {
  return { id: d.id, ...(d.data() as Omit<Student, "id">) };
}

function sortByName(list: Student[]) {
  return list.sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));
}

/** Solo los alumnos de un grupo (nunca la colección completa cuando basta un grupo). */
export function subscribeStudentsByGroup(groupId: string, cb: (s: Student[]) => void, onError: (e: unknown) => void) {
  return onSnapshot(
    query(col(), where("groupId", "==", groupId)),
    (snap) => cb(sortByName(snap.docs.map(fromSnap))),
    onError,
  );
}

export function subscribeAllStudents(cb: (s: Student[]) => void, onError: (e: unknown) => void) {
  return onSnapshot(col(), (snap) => cb(sortByName(snap.docs.map(fromSnap))), onError);
}

export async function getStudentsByGroupOnce(groupId: string): Promise<Student[]> {
  const snap = await withTimeout(getDocs(query(col(), where("groupId", "==", groupId))), 15000);
  return snap.docs.map(fromSnap);
}

export async function getAllStudentsOnce(): Promise<Student[]> {
  const snap = await getDocs(col());
  return snap.docs.map(fromSnap);
}

export async function getStudent(id: string): Promise<Student | null> {
  const snap = await getDoc(doc(db, COL.students, id));
  return snap.exists() ? fromSnap(snap) : null;
}

/** Busca un QR fuera del grupo cargado (1 lectura). */
export async function findStudentByToken(token: string): Promise<Student | null> {
  const snap = await withTimeout(getDocs(query(col(), where("qrToken", "==", token), limit(1))), 8000);
  return snap.empty ? null : fromSnap(snap.docs[0]);
}

async function enrollmentTaken(enrollmentId: string, exceptId?: string) {
  const snap = await getDocs(query(col(), where("enrollmentId", "==", enrollmentId), limit(2)));
  return snap.docs.some((d) => d.id !== exceptId);
}

export interface StudentInput {
  fullName: string;
  enrollmentId: string | null;
  groupId: string;
}

function validate(input: StudentInput) {
  const fullName = cleanName(input.fullName);
  const enrollmentId = cleanEnrollment(input.enrollmentId);
  if (!fullName) throw new Error("El nombre es obligatorio.");
  if (fullName.length > 120) throw new Error("El nombre es demasiado largo.");
  if (enrollmentId && enrollmentId.length > 40) throw new Error("La matrícula es demasiado larga.");
  if (!input.groupId) throw new Error("Selecciona un grupo.");
  return { fullName, enrollmentId, groupId: input.groupId };
}

export async function createStudent(actor: Actor, input: StudentInput): Promise<string> {
  const v = validate(input);
  if (v.enrollmentId && (await enrollmentTaken(v.enrollmentId))) {
    throw new Error(`Ya existe un alumno con la matrícula ${v.enrollmentId}.`);
  }
  const ref = doc(col());
  await withTimeout(
    writeBatch(db)
      .set(ref, {
        ...v,
        nameLower: normalizeText(v.fullName),
        active: true,
        qrToken: generateQrToken(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: actor.uid,
      })
      .commit(),
  );
  return ref.id;
}

export async function updateStudent(id: string, input: StudentInput) {
  const v = validate(input);
  if (v.enrollmentId && (await enrollmentTaken(v.enrollmentId, id))) {
    throw new Error(`Ya existe otro alumno con la matrícula ${v.enrollmentId}.`);
  }
  // El qrToken no cambia: editar el nombre no invalida el QR impreso.
  await withTimeout(
    updateDoc(doc(db, COL.students, id), { ...v, nameLower: normalizeText(v.fullName), updatedAt: serverTimestamp() }),
  );
}

export function setStudentActive(id: string, active: boolean) {
  return withTimeout(updateDoc(doc(db, COL.students, id), { active, updatedAt: serverTimestamp() }));
}

/** Invalida el QR anterior (p. ej. si se perdió o se compartió una foto). */
export function regenerateQr(id: string) {
  return withTimeout(updateDoc(doc(db, COL.students, id), { qrToken: generateQrToken(), updatedAt: serverTimestamp() }));
}

/**
 * Borra solo la ficha del alumno. Sus registros de asistencia se conservan
 * (llevan nombre y grupo copiados como referencia histórica).
 */
export function deleteStudent(id: string) {
  return withTimeout(deleteDoc(doc(db, COL.students, id)));
}

export async function importStudents(
  actor: Actor,
  rows: { fullName: string; enrollmentId: string | null; groupId: string }[],
  onProgress?: (done: number) => void,
) {
  const CHUNK = 400;
  let done = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const r of rows.slice(i, i + CHUNK)) {
      batch.set(doc(col()), {
        fullName: r.fullName,
        nameLower: normalizeText(r.fullName),
        enrollmentId: r.enrollmentId,
        groupId: r.groupId,
        active: true,
        qrToken: generateQrToken(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: actor.uid,
      });
    }
    await withTimeout(batch.commit(), 30000);
    done += Math.min(CHUNK, rows.length - i);
    onProgress?.(done);
  }
}
