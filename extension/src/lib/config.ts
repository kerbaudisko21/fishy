const env = import.meta.env;

/** Runs on the synthetic demo company instead of live Meet/Gmail data. */
export const DEMO = env.VITE_DEMO_MODE !== 'false';

/** True once extension/.env.local has a Firebase web config. Without it, FISHY runs fully offline. */
export const FIREBASE_READY = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);

/** False when the panel is opened as a plain web page (design preview), where chrome.* APIs do not exist. */
export const IN_EXTENSION = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

/**
 * The Firestore database FISHY keeps its data in. A named one, not "(default)", so FISHY can
 * share a Google Cloud project with another app without touching that app's rules or data.
 * Must match DATABASE_ID in functions/src/call/store-firestore.ts and "database" in firebase.json.
 */
export const DATABASE = 'fishy';

/** Cloud Functions region; must match functions/src/index.ts. */
export const REGION = 'asia-southeast2';

/** Minutes before an unanswered call escalates to the next approver (deck: 10 min). */
export const ESCALATE_MINUTES = 10;
