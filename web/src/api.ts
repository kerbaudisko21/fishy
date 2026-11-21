import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getFunctions, httpsCallable } from 'firebase/functions';

const env = import.meta.env;

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});

if (env.DEV && env.VITE_APPCHECK_DEBUG_TOKEN) {
  (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_APPCHECK_DEBUG_TOKEN;
}
if (env.VITE_RECAPTCHA_ENTERPRISE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_ENTERPRISE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

const functions = getFunctions(app, 'asia-southeast2');

export interface ApprovalAnswer {
  token: string;
  answer: 'yes' | 'no';
  pin: string;
}

export const answerApproval = (data: ApprovalAnswer) => httpsCallable<ApprovalAnswer, { ok: true }>(functions, 'answerApproval')(data);
