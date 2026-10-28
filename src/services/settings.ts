import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { COL, db } from "@/lib/firebase";
import { withTimeout } from "@/lib/errors";
import type { InstitutionSettings } from "@/types";
import type { Actor } from "./users";

export const DEFAULT_SETTINGS: InstitutionSettings = {
  name: "Mi institución",
  timezone: "America/Mexico_City",
};

const ref = () => doc(db, COL.settings, "institution");

export function subscribeSettings(cb: (s: InstitutionSettings, exists: boolean) => void, onError: (e: unknown) => void) {
  return onSnapshot(
    ref(),
    (snap) => cb(snap.exists() ? { ...DEFAULT_SETTINGS, ...(snap.data() as InstitutionSettings) } : DEFAULT_SETTINGS, snap.exists()),
    onError,
  );
}

export function saveSettings(actor: Actor, s: InstitutionSettings) {
  return withTimeout(
    setDoc(ref(), { name: s.name, timezone: s.timezone, updatedAt: serverTimestamp(), updatedBy: actor.uid }),
  );
}
