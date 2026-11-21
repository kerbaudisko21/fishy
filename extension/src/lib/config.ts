const env = import.meta.env;

/** Runs on the synthetic demo company instead of live Meet/Gmail data. */
export const DEMO = env.VITE_DEMO_MODE !== 'false';

/** True once extension/.env.local has a Firebase web config. Without it, FISHY runs fully offline. */
export const FIREBASE_READY = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);

/** False when the panel is opened as a plain web page (design preview), where chrome.* APIs do not exist. */
export const IN_EXTENSION = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

/** Cloud Functions region; must match functions/src/index.ts. */
export const REGION = 'asia-southeast2';

/** Minutes before an unanswered call escalates to the next approver (deck: 10 min). */
export const ESCALATE_MINUTES = 10;
