import { initializeApp, type FirebaseApp } from 'firebase/app';
import { CustomProvider, initializeAppCheck } from 'firebase/app-check';
import { getAuth, signInAnonymously } from 'firebase/auth/web-extension';
import { FIREBASE_READY } from './config';

const env = import.meta.env;
let app: FirebaseApp | undefined;

/**
 * The Firebase app, created on first use so the panel works offline (demo) without a config.
 * Throws when extension/.env.local is not filled in.
 */
export function firebaseApp(): FirebaseApp {
  if (!FIREBASE_READY) throw new Error('Firebase is not configured: fill in extension/.env.local.');
  if (app) return app;

  app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });

  /*
   * App Check is required by Firebase AI Logic.
   * A Manifest V3 extension cannot load reCAPTCHA (no remote scripts), so the demo build uses a
   * debug token, which #BuildHybridAI accepts. The CustomProvider only exists so the SDK loads no
   * script; with the debug token set, the SDK exchanges the debug token instead of calling it.
   */
  if (env.VITE_APPCHECK_DEBUG_TOKEN) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_APPCHECK_DEBUG_TOKEN;
  }
  initializeAppCheck(app, {
    provider: new CustomProvider({
      getToken: () => Promise.reject(new Error('No attestation provider in the extension. Set VITE_APPCHECK_DEBUG_TOKEN.')),
    }),
    isTokenAutoRefreshEnabled: true,
  });

  return app;
}

/** Anonymous sign-in for the demo; Firestore rules only let signed-in users read the directory. */
export async function ensureSignedIn() {
  const auth = getAuth(firebaseApp());
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser!;
}
