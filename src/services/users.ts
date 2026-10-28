import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch,
} from "firebase/firestore";
import { COL, db } from "@/lib/firebase";
import { withTimeout } from "@/lib/errors";
import type { AppUser, Invite, Role } from "@/types";

export interface Actor {
  uid: string;
  name: string;
}

export function subscribeMyUser(
  uid: string,
  cb: (user: AppUser | null, pending: boolean) => void,
  onError: (e: unknown) => void,
) {
  return onSnapshot(
    doc(db, COL.users, uid),
    { includeMetadataChanges: true },
    (snap) => cb(snap.exists() ? ({ uid: snap.id, ...snap.data() } as AppUser) : null, snap.metadata.hasPendingWrites),
    onError,
  );
}

export function touchLastSeen(uid: string) {
  return updateDoc(doc(db, COL.users, uid), { lastSeen: serverTimestamp() });
}

export async function getInviteFor(email: string): Promise<Invite | null> {
  const snap = await getDoc(doc(db, COL.invites, email.toLowerCase()));
  return snap.exists() ? (snap.data() as Invite) : null;
}

/** El usuario invitado (con correo verificado) crea su propio perfil y consume la invitación. */
export async function claimInvite(uid: string, email: string, invite: Invite) {
  const batch = writeBatch(db);
  batch.set(doc(db, COL.users, uid), {
    email: email.toLowerCase(),
    displayName: invite.displayName || email,
    role: invite.role,
    active: true,
    createdAt: serverTimestamp(),
    createdBy: invite.createdBy,
  });
  batch.delete(doc(db, COL.invites, email.toLowerCase()));
  await withTimeout(batch.commit());
}

export async function listUsers(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, COL.users));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as AppUser).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function listInvites(): Promise<Invite[]> {
  const snap = await getDocs(collection(db, COL.invites));
  return snap.docs.map((d) => d.data() as Invite);
}

export async function addUserByUid(actor: Actor, uid: string, email: string, displayName: string, role: Role) {
  await withTimeout(
    setDoc(doc(db, COL.users, uid), {
      email: email.toLowerCase(),
      displayName,
      role,
      active: true,
      createdAt: serverTimestamp(),
      createdBy: actor.uid,
    }),
  );
}

export async function createInvite(actor: Actor, email: string, displayName: string, role: Role) {
  const id = email.trim().toLowerCase();
  await withTimeout(
    setDoc(doc(db, COL.invites, id), { email: id, displayName, role, createdAt: serverTimestamp(), createdBy: actor.uid }),
  );
}

export function deleteInvite(email: string) {
  return withTimeout(deleteDoc(doc(db, COL.invites, email.toLowerCase())));
}

export function updateUser(uid: string, data: Partial<Pick<AppUser, "role" | "active" | "displayName">>) {
  return withTimeout(updateDoc(doc(db, COL.users, uid), data));
}

export function removeUser(uid: string) {
  return withTimeout(deleteDoc(doc(db, COL.users, uid)));
}
