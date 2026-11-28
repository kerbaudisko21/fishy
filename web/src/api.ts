import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

const env = import.meta.env;

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

/** Without a Firebase config the page runs without Gemini and says so. */
export const CONFIGURED = Boolean(config.apiKey && config.projectId && config.appId);

let app: FirebaseApp | undefined;
/** The Firebase app, with App Check through reCAPTCHA Enterprise (no debug token on the hosted pages). */
export function firebase() {
  if (app) return app;
  app = initializeApp(config);
  if (env.DEV && env.VITE_APPCHECK_DEBUG_TOKEN) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_APPCHECK_DEBUG_TOKEN;
  }
  if (env.VITE_RECAPTCHA_ENTERPRISE_KEY) {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_ENTERPRISE_KEY), isTokenAutoRefreshEnabled: true });
  }
  return app;
}
