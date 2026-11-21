import { initializeApp } from 'firebase/app';
import { CustomProvider, initializeAppCheck } from 'firebase/app-check';
import { getAuth, signInAnonymously } from 'firebase/auth/web-extension';

const env = import.meta.env;

export const firebaseApp = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});

/*
 * App Check is required by Firebase AI Logic.
 * A Manifest V3 extension cannot load reCAPTCHA (no remote scripts), so the demo
 * build uses a debug token, which #BuildHybridAI accepts. The CustomProvider below
 * only exists so the SDK loads no script; with the debug token set, the SDK
 * exchanges the debug token instead of calling it.
 */
if (env.VITE_APPCHECK_DEBUG_TOKEN) {
  (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
    env.VITE_APPCHECK_DEBUG_TOKEN;
}

export const appCheck = initializeAppCheck(firebaseApp, {
  provider: new CustomProvider({
    getToken: () => Promise.reject(new Error('No attestation provider in the extension. Set VITE_APPCHECK_DEBUG_TOKEN.')),
  }),
  isTokenAutoRefreshEnabled: true,
});

/** Anonymous sign-in for the demo; Firestore rules only let signed-in users read the directory. */
export const auth = getAuth(firebaseApp);
export async function ensureSignedIn() {
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser;
}
