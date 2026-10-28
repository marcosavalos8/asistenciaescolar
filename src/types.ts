import type { Timestamp } from "firebase/firestore";

export type Role = "admin" | "teacher";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
  createdAt?: Timestamp | null;
  createdBy?: string;
  lastSeen?: Timestamp | null;
}

export interface Invite {
  email: string;
  displayName: string;
  role: Role;
  createdAt?: Timestamp | null;
  createdBy: string;
}

export interface InstitutionSettings {
  name: string;
  timezone: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  active: boolean;
  createdAt?: Timestamp | null;
}

export interface Student {
  id: string;
  fullName: string;
  nameLower: string;
  enrollmentId: string | null;
  groupId: string;
  active: boolean;
  qrToken: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export type AttendanceStatus = "present" | "late" | "absent" | "justified";
export type RecordMethod = "qr" | "manual" | "auto";

export interface SessionTotals {
  total: number;
  present: number;
  late: number;
  absent: number;
  justified: number;
}

export interface AttendanceSession {
  id: string;
  groupId: string;
  groupName: string;
  date: string; // YYYY-MM-DD en la zona horaria de la institución
  label: string;
  status: "open" | "closed";
  startedAt?: Timestamp | null;
  startedBy: string;
  startedByName: string;
  closedAt?: Timestamp | null;
  closedBy?: string;
  closedByName?: string;
  totals?: SessionTotals | null;
}

export interface AttendanceRecord {
  id: string; // `${sessionId}_${studentId}`
  sessionId: string;
  studentId: string;
  studentName: string;
  enrollmentId: string | null;
  groupId: string;
  groupName: string;
  date: string;
  status: AttendanceStatus;
  method: RecordMethod;
  recordedAt?: Timestamp | null;
  recordedBy: string;
  recordedByName: string;
  note?: string;
  correctionCount: number;
  updatedAt?: Timestamp | null;
  updatedBy?: string;
  updatedByName?: string;
}
