/**
 * Pruebas de las reglas de Firestore contra el emulador.
 * Ejecutar con:  npm run test:rules   (requiere Java 11+ y firebase-tools)
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc, doc, getDoc, getDocs, collection, runTransaction, serverTimestamp, setDoc, updateDoc, writeBatch,
} from "firebase/firestore";

let env: RulesTestEnvironment;

const ADMIN = "admin1";
const TEACHER = "teacher1";
const OUTSIDER = "citasUser"; // usuario de citasFacil sin acceso a asistencia
const TOKEN = "AAAAAAAAAAAAAAAAAAAAAA";

const asAdmin = () => env.authenticatedContext(ADMIN, { email: "admin@x.com", email_verified: true }).firestore();
const asTeacher = () => env.authenticatedContext(TEACHER, { email: "t@x.com", email_verified: true }).firestore();
const asOutsider = () => env.authenticatedContext(OUTSIDER, { email: "o@x.com", email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

function recordData(uid: string, over: Record<string, unknown> = {}) {
  return {
    sessionId: "s1", studentId: "st1", studentName: "Ana López", enrollmentId: null, groupId: "g1", groupName: "2A",
    date: "2026-10-27", status: "present", method: "qr", recordedAt: serverTimestamp(), recordedBy: uid,
    recordedByName: "Docente", correctionCount: 0, ...over,
  };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-asistencia",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
afterAll(() => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "asis_users", ADMIN), { email: "admin@x.com", displayName: "Admin", role: "admin", active: true });
    await setDoc(doc(db, "asis_users", TEACHER), { email: "t@x.com", displayName: "Docente", role: "teacher", active: true });
    await setDoc(doc(db, "asis_groups", "g1"), { name: "2A", description: "", active: true });
    await setDoc(doc(db, "asis_students", "st1"), {
      fullName: "Ana López", nameLower: "ana lopez", enrollmentId: null, groupId: "g1", active: true, qrToken: TOKEN,
    });
    await setDoc(doc(db, "asis_sessions", "s1"), {
      groupId: "g1", groupName: "2A", date: "2026-10-27", label: "", status: "open", startedBy: TEACHER, startedByName: "Docente", totals: null,
    });
    await setDoc(doc(db, "asis_sessions", "closed1"), {
      groupId: "g1", groupName: "2A", date: "2026-10-20", label: "", status: "closed", startedBy: TEACHER, startedByName: "Docente", totals: { total: 1, present: 1, late: 0, absent: 0, justified: 0 },
    });
  });
});

describe("acceso", () => {
  it("nadie sin sesión lee alumnos", async () => {
    await assertFails(getDocs(collection(anon(), "asis_students")));
  });
  it("un usuario autenticado de otra app (citasFacil) no lee alumnos", async () => {
    await assertFails(getDocs(collection(asOutsider(), "asis_students")));
    await assertFails(getDoc(doc(asOutsider(), "asis_students", "st1")));
  });
  it("un docente activo sí lee alumnos", async () => {
    await assertSucceeds(getDocs(collection(asTeacher(), "asis_students")));
  });
  it("un docente desactivado pierde el acceso", async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), "asis_users", TEACHER), { active: false }));
    await assertFails(getDocs(collection(asTeacher(), "asis_students")));
  });
});

describe("usuarios y permisos", () => {
  it("nadie puede autoasignarse un perfil o rol", async () => {
    await assertFails(setDoc(doc(asOutsider(), "asis_users", OUTSIDER), { email: "o@x.com", displayName: "X", role: "admin", active: true, createdAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(asTeacher(), "asis_users", TEACHER), { role: "admin" }));
    await assertFails(updateDoc(doc(asTeacher(), "asis_users", TEACHER), { active: true, role: "admin" }));
  });
  it("cada quien puede cambiar su nombre visible", async () => {
    await assertSucceeds(updateDoc(doc(asTeacher(), "asis_users", TEACHER), { displayName: "Profe" }));
  });
  it("el admin no puede degradarse a sí mismo", async () => {
    await assertFails(updateDoc(doc(asAdmin(), "asis_users", ADMIN), { role: "teacher" }));
  });
  it("invitación: solo con correo verificado y con el rol invitado", async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), "asis_invites", "nuevo@x.com"), { email: "nuevo@x.com", displayName: "Nuevo", role: "teacher", createdBy: ADMIN }),
    );
    const unverified = env.authenticatedContext("u2", { email: "Nuevo@x.com", email_verified: false }).firestore();
    const verified = env.authenticatedContext("u2", { email: "Nuevo@x.com", email_verified: true }).firestore();
    const base = { email: "nuevo@x.com", displayName: "Nuevo", active: true, createdAt: serverTimestamp(), createdBy: ADMIN };
    await assertFails(setDoc(doc(unverified, "asis_users", "u2"), { ...base, role: "teacher" }));
    await assertFails(setDoc(doc(verified, "asis_users", "u2"), { ...base, role: "admin" }));
    const b = writeBatch(verified);
    b.set(doc(verified, "asis_users", "u2"), { ...base, role: "teacher" });
    b.delete(doc(verified, "asis_invites", "nuevo@x.com"));
    await assertSucceeds(b.commit());
  });
  it("solo admin gestiona alumnos", async () => {
    const data = { fullName: "Luis", nameLower: "luis", enrollmentId: null, groupId: "g1", active: true, qrToken: TOKEN, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: TEACHER };
    await assertFails(setDoc(doc(asTeacher(), "asis_students", "n1"), data));
    await assertSucceeds(setDoc(doc(asAdmin(), "asis_students", "n1"), { ...data, createdBy: ADMIN }));
    await assertFails(updateDoc(doc(asTeacher(), "asis_students", "st1"), { active: false, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(asAdmin(), "asis_students", "st1"), { active: false, updatedAt: serverTimestamp() }));
  });
  it("valida tipos y campos de alumno", async () => {
    await assertFails(
      setDoc(doc(asAdmin(), "asis_students", "n2"), {
        fullName: 123, nameLower: "x", enrollmentId: null, groupId: "g1", active: true, qrToken: TOKEN, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: ADMIN,
      }),
    );
    await assertFails(updateDoc(doc(asAdmin(), "asis_students", "st1"), { hacked: true, updatedAt: serverTimestamp() }));
  });
});

describe("registros de asistencia", () => {
  it("crea un registro válido con id determinista", async () => {
    await assertSucceeds(setDoc(doc(asTeacher(), "asis_records", "s1_st1"), recordData(TEACHER)));
  });
  it("rechaza id no determinista, otro autor, hora del cliente o estado inválido", async () => {
    const db = asTeacher();
    await assertFails(setDoc(doc(db, "asis_records", "otro"), recordData(TEACHER)));
    await assertFails(setDoc(doc(db, "asis_records", "s1_st1"), recordData(ADMIN)));
    await assertFails(setDoc(doc(db, "asis_records", "s1_st1"), recordData(TEACHER, { recordedAt: new Date() })));
    await assertFails(setDoc(doc(db, "asis_records", "s1_st1"), recordData(TEACHER, { status: "fantasma" })));
    await assertFails(setDoc(doc(db, "asis_records", "s1_st1"), recordData(TEACHER, { groupId: "otroGrupo" })));
  });
  it("no se puede sobrescribir (duplicar) un registro existente", async () => {
    const db = asTeacher();
    await assertSucceeds(setDoc(doc(db, "asis_records", "s1_st1"), recordData(TEACHER)));
    await assertFails(setDoc(doc(db, "asis_records", "s1_st1"), recordData(TEACHER, { status: "present" })));
  });
  it("registros nunca se borran", async () => {
    await assertSucceeds(setDoc(doc(asTeacher(), "asis_records", "s1_st1"), recordData(TEACHER)));
    await assertFails(deleteDoc(doc(asAdmin(), "asis_records", "s1_st1")));
  });
  it("una corrección exige entrada de auditoría en la misma transacción", async () => {
    const db = asTeacher();
    await assertSucceeds(setDoc(doc(db, "asis_records", "s1_st1"), recordData(TEACHER)));
    const upd = { status: "late", note: "", correctionCount: 1, updatedAt: serverTimestamp(), updatedBy: TEACHER, updatedByName: "Docente" };
    await assertFails(updateDoc(doc(db, "asis_records", "s1_st1"), upd));
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        tx.update(doc(db, "asis_records", "s1_st1"), upd);
        tx.set(doc(db, "asis_audit", "s1_st1_1"), {
          type: "record_correction", recordId: "s1_st1", sessionId: "s1", studentId: "st1", studentName: "Ana López",
          from: "present", to: "late", note: "", by: TEACHER, byName: "Docente", at: serverTimestamp(),
        });
      }),
    );
    await assertFails(updateDoc(doc(db, "asis_audit", "s1_st1_1"), { to: "present" }));
  });
  it("sesión cerrada: el docente no puede registrar ni corregir; el admin sí", async () => {
    const data = recordData(TEACHER, { sessionId: "closed1", date: "2026-10-20", method: "manual" });
    await assertFails(setDoc(doc(asTeacher(), "asis_records", "closed1_st1"), data));
    await assertSucceeds(setDoc(doc(asAdmin(), "asis_records", "closed1_st1"), { ...data, recordedBy: ADMIN }));
  });
});

describe("sesiones", () => {
  it("un docente crea y cierra; no puede reabrir", async () => {
    const db = asTeacher();
    await assertSucceeds(
      setDoc(doc(db, "asis_sessions", "n1"), {
        groupId: "g1", groupName: "2A", date: "2026-10-27", label: "", status: "open", startedAt: serverTimestamp(), startedBy: TEACHER, startedByName: "Docente", totals: null,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(db, "asis_sessions", "n1"), {
        status: "closed", closedAt: serverTimestamp(), closedBy: TEACHER, closedByName: "Docente", totals: { total: 0, present: 0, late: 0, absent: 0, justified: 0 },
      }),
    );
    await assertFails(updateDoc(doc(db, "asis_sessions", "n1"), { status: "open" }));
    await assertSucceeds(updateDoc(doc(asAdmin(), "asis_sessions", "n1"), { status: "open" }));
    await assertFails(updateDoc(doc(asAdmin(), "asis_sessions", "n1"), { date: "2020-01-01" }));
    await assertFails(deleteDoc(doc(asAdmin(), "asis_sessions", "n1")));
  });
  it("rechaza sesiones de grupos inexistentes o con fecha inválida", async () => {
    const base = { groupId: "g1", groupName: "2A", date: "2026-10-27", label: "", status: "open", startedAt: serverTimestamp(), startedBy: TEACHER, startedByName: "Docente", totals: null };
    await assertFails(setDoc(doc(asTeacher(), "asis_sessions", "x1"), { ...base, groupId: "nope" }));
    await assertFails(setDoc(doc(asTeacher(), "asis_sessions", "x2"), { ...base, date: "27/10/2026" }));
  });
});
