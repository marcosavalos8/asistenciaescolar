import {
  addDoc, collection, deleteDoc, doc, getCountFromServer, onSnapshot, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { COL, db } from "@/lib/firebase";
import { withTimeout } from "@/lib/errors";
import type { Group } from "@/types";
import type { Actor } from "./users";

export function subscribeGroups(cb: (groups: Group[]) => void, onError: (e: unknown) => void) {
  return onSnapshot(
    collection(db, COL.groups),
    (snap) =>
      cb(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Group)
          .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true })),
      ),
    onError,
  );
}

export async function createGroup(actor: Actor, name: string, description: string): Promise<string> {
  const ref = await withTimeout(
    addDoc(collection(db, COL.groups), {
      name: name.trim(),
      description: description.trim(),
      active: true,
      createdAt: serverTimestamp(),
      createdBy: actor.uid,
    }),
  );
  return ref.id;
}

export function updateGroup(id: string, data: Partial<Pick<Group, "name" | "description" | "active">>) {
  return withTimeout(updateDoc(doc(db, COL.groups, id), data));
}

/** Conteo agregado: 1 lectura por cada 1000 alumnos, sin descargar los documentos. */
export async function countStudentsInGroup(groupId: string): Promise<number> {
  const snap = await getCountFromServer(query(collection(db, COL.students), where("groupId", "==", groupId)));
  return snap.data().count;
}

export async function deleteGroup(id: string) {
  const n = await countStudentsInGroup(id);
  if (n > 0) throw new Error(`El grupo tiene ${n} alumno(s). Muévelos o elimínalos antes de borrar el grupo.`);
  await withTimeout(deleteDoc(doc(db, COL.groups, id)));
}
