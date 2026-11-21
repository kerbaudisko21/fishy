import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';

const env = import.meta.env;

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

/** Without a Firebase config the pages run on demo data (for design review and the video). */
export const CONFIGURED = Boolean(config.apiKey && config.projectId && config.appId);

let app: FirebaseApp | undefined;
function firebase() {
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

const call = async <I, O>(name: string, data: I) => (await httpsCallable<I, O>(getFunctions(firebase(), 'asia-southeast2'), name)(data)).data;

/* ---------- Web approval (the phone menu's twin) ---------- */

export interface ApprovalRequest {
  approverName: string;
  company: string;
  amount: { value: number; currency: string };
  payee: string;
  context: string;
  expiresAt: number;
}

export const getApproval = (token: string) => call<{ token: string }, ApprovalRequest>('getApproval', { token });

export interface ApprovalAnswer {
  token: string;
  answer: 'yes' | 'no';
  pin: string;
}
export const answerApproval = (data: ApprovalAnswer) => call<ApprovalAnswer, { ok: true }>('answerApproval', data);

/* ---------- Incident report (finance manager, audit) ---------- */

export interface Incident {
  id: string;
  at: number;
  status: 'stopped' | 'confirmed' | 'open';
  where: string;
  targeted: string;
  posedAs: string;
  askedFor: string;
  confirmed: string;
  flags: string[];
  handled: boolean;
}

export const getIncident = (id: string) => call<{ id: string }, Incident>('getIncident', { id });
export const markHandled = (id: string) => call<{ id: string }, { ok: true }>('markIncidentHandled', { id });
export const getAuditLog = (id: string) => call<{ id: string }, { entries: Array<{ at: number; what: string }> }>('getAuditLog', { id });

/**
 * Team alerts via Firebase Cloud Messaging: asks for permission, gets this browser's token
 * and registers it. The push carries a summary only, never message text.
 */
export async function turnOnAlerts(): Promise<'on' | 'denied' | 'unsupported'> {
  if (!(await isSupported()) || !env.VITE_FCM_VAPID_KEY) return 'unsupported';
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const sw = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${new URLSearchParams(config as Record<string, string>)}`);
  const token = await getToken(getMessaging(firebase()), { vapidKey: env.VITE_FCM_VAPID_KEY, serviceWorkerRegistration: sw });
  await call<{ token: string }, { ok: true }>('registerAlertToken', { token });
  return 'on';
}
