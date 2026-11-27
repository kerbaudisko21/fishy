// Builds the three settings files a deploy needs, for the deploy workflow.
//
// On a laptop a person writes .firebaserc, functions/.env.<project> and
// web/.env.local by hand (see the README). In GitHub Actions nobody is there,
// so they are built here from the repository's Actions secrets and variables.
// `npm run deploy` then runs the same pre-deploy check on them.
//
// No files or network in here, so it can be tested. ci-write-settings.ts
// writes the files.

export interface CiFiles {
  firebaserc: string;
  /** Where the Functions settings go: functions/.env.<project>. */
  functionsEnvPath: string;
  functionsEnv: string;
  webEnv: string;
}

export type CiSettings = { ok: true; files: CiFiles } | { ok: false; problems: string[] };

const REQUIRED = ['GCP_PROJECT_ID', 'HOSTING_SITE', 'FIREBASE_WEB_API_KEY', 'FIREBASE_WEB_APP_ID'] as const;
const OPTIONAL = [
  'PUBLIC_BASE_URL',
  'RUNTIME_SERVICE_ACCOUNT',
  'COMPANY_NAME',
  'COMPANY_DOMAIN',
  'TWILIO_FROM',
  'CALLS_ENABLED',
  'CALL_ALLOWLIST',
  'CALLS_DAILY_CAP',
  'APPROVAL_PAGE_ENABLED',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_MESSAGING_SENDER_ID',
  'RECAPTCHA_ENTERPRISE_KEY',
  'FCM_VAPID_KEY',
  'AI_PROVIDER',
] as const;

// Which Gemini API the hosted pages' cloud model uses. The same two names, read the same way,
// as VITE_AI_PROVIDER in extension/src/lib/ai/provider.ts.
const AI_PROVIDERS = ['developer', 'agent-platform'];

// Both end up in file names and web addresses, so they must be plain IDs.
const ID = /^[a-z0-9][a-z0-9-]{2,40}[a-z0-9]$/;

/** A switch is on only for the word "true". Anything else, or nothing, is off. */
const onOff = (value: string): 'true' | 'false' => (value.toLowerCase() === 'true' ? 'true' : 'false');

const lines = (pairs: [string, string][]): string => pairs.map(([key, value]) => `${key}=${value}`).join('\n') + '\n';

export function ciSettings(env: Record<string, string | undefined>): CiSettings {
  const problems: string[] = [];
  const value = (name: string): string => (env[name] ?? '').trim();

  for (const name of [...REQUIRED, ...OPTIONAL]) {
    // Each value becomes one line of a settings file. A line break would add a second setting.
    if (/[\r\n]/.test(value(name))) {
      problems.push(`${name} has a line break in it.`);
    }
  }
  for (const name of REQUIRED) {
    if (value(name) === '') {
      problems.push(`${name} is not set.`);
    }
  }
  for (const name of ['GCP_PROJECT_ID', 'HOSTING_SITE']) {
    if (value(name) !== '' && !ID.test(value(name))) {
      problems.push(`${name} is not a valid ID: small letters, digits and hyphens only.`);
    }
  }
  // A wrong name must not fall back quietly: the built-in choice may be the API the project refuses.
  const aiProvider = value('AI_PROVIDER').toLowerCase();
  if (aiProvider !== '' && !AI_PROVIDERS.includes(aiProvider)) {
    problems.push(`AI_PROVIDER must be "developer" or "agent-platform", not "${value('AI_PROVIDER')}".`);
  }
  if (problems.length > 0) {
    return { ok: false, problems };
  }

  const project = value('GCP_PROJECT_ID');
  const site = value('HOSTING_SITE');

  const functionsEnv: [string, string][] = [
    ['PUBLIC_BASE_URL', value('PUBLIC_BASE_URL') || `https://${site}.web.app`],
    ['RUNTIME_SERVICE_ACCOUNT', value('RUNTIME_SERVICE_ACCOUNT') || `fishy-functions@${project}.iam.gserviceaccount.com`],
    ['COMPANY_NAME', value('COMPANY_NAME')],
    ['COMPANY_DOMAIN', value('COMPANY_DOMAIN')],
    ['TWILIO_FROM', value('TWILIO_FROM')],
    ['CALLS_ENABLED', onOff(value('CALLS_ENABLED'))],
    ['CALL_ALLOWLIST', value('CALL_ALLOWLIST')],
    ['APPROVAL_PAGE_ENABLED', onOff(value('APPROVAL_PAGE_ENABLED'))],
  ];
  if (/^\d+$/.test(value('CALLS_DAILY_CAP'))) {
    functionsEnv.push(['CALLS_DAILY_CAP', value('CALLS_DAILY_CAP')]);
  }

  // An App Check debug token is for a developer's own laptop. It is never
  // written here, so it can never ship in the hosted pages.
  const webEnv: [string, string][] = [
    ['VITE_FIREBASE_API_KEY', value('FIREBASE_WEB_API_KEY')],
    ['VITE_FIREBASE_AUTH_DOMAIN', value('FIREBASE_AUTH_DOMAIN') || `${project}.firebaseapp.com`],
    ['VITE_FIREBASE_PROJECT_ID', project],
    ['VITE_FIREBASE_MESSAGING_SENDER_ID', value('FIREBASE_MESSAGING_SENDER_ID')],
    ['VITE_FIREBASE_APP_ID', value('FIREBASE_WEB_APP_ID')],
    ['VITE_RECAPTCHA_ENTERPRISE_KEY', value('RECAPTCHA_ENTERPRISE_KEY')],
    ['VITE_FCM_VAPID_KEY', value('FCM_VAPID_KEY')],
  ];
  // Left out when not named, so the pages keep their built-in choice (the Gemini Developer API).
  if (aiProvider !== '') {
    webEnv.push(['VITE_AI_PROVIDER', aiProvider]);
  }

  return {
    ok: true,
    files: {
      firebaserc: JSON.stringify({ projects: { default: project }, targets: { [project]: { hosting: { fishy: [site] } } } }, null, 2) + '\n',
      functionsEnvPath: `functions/.env.${project}`,
      functionsEnv: lines(functionsEnv),
      webEnv: lines(webEnv),
    },
  };
}
