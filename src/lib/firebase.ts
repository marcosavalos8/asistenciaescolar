import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const app = initializeApp(firebaseConfig);

// App Check solo si el proyecto lo exige (enforcement). Se carga bajo demanda.
const recaptchaKey = env.VITE_RECAPTCHA_SITE_KEY;
if (recaptchaKey) {
  import("firebase/app-check").then(({ initializeAppCheck, ReCaptchaV3Provider }) => {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaKey),
      isTokenAutoRefreshEnabled: true,
    });
  });
}

export const auth = getAuth(app);
export const db = getFirestore(app);

/**
 * Todas las colecciones llevan el prefijo `asis_` porque el proyecto Firebase
 * se comparte con otra aplicación (citasFacil), que ya usa `users`, etc.
 */
export const COL = {
  users: "asis_users",
  invites: "asis_invites",
  settings: "asis_settings",
  groups: "asis_groups",
  students: "asis_students",
  sessions: "asis_sessions",
  records: "asis_records",
  audit: "asis_audit",
} as const;
