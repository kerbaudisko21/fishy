// Decides whether a deploy may go ahead. No files or network in here, so it
// can be tested. scripts/predeploy.ts reads the files and prints the result.
//
// A deploy can go wrong quietly in two ways, and this check is for both:
// - The web pages build in demo mode when their Firebase settings are
//   missing. They would look fine and work for nobody.
// - One setting turns on real phone calls. That is allowed, but it is never
//   silent: the summary says it, with how many numbers can be called.

export interface DeployFiles {
  /** The text of .firebaserc, or null if there is none. */
  firebaserc: string | null;
  /** The text of the Functions settings for a project (functions/.env and functions/.env.<projectId>), or null. */
  functionsEnv(projectId: string): string | null;
  /** The settings the web pages are built with (web/.env* and VITE_* from the environment). */
  webEnv: Record<string, string | undefined>;
}

export interface Finding {
  level: 'error' | 'warning';
  message: string;
}

export interface DeployCheck {
  /** False when the deploy must not go ahead. */
  ok: boolean;
  projectId: string | null;
  findings: Finding[];
  /** A few plain lines: which project, which switches are on, what the check cannot see. */
  summary: string;
}

const PLACEHOLDER_PROJECT = 'your-firebase-project-id';
const PLACEHOLDER_SITE = 'your-hosting-site-id';
/** The deploy target in firebase.json. .firebaserc says which Hosting site it stands for. */
const HOSTING_TARGET = 'fishy';
const WEB_REQUIRED = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'];

/** Reads KEY=VALUE lines. Comments, blank lines and anything else are skipped. */
export function parseEnv(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || line.trim().startsWith('#')) {
      continue;
    }
    const [, key = '', raw = ''] = match;
    const quoted = /^(['"])(.*)\1$/.exec(raw);
    values[key] = quoted ? (quoted[2] ?? '') : raw;
  }
  return values;
}

function readProjectId(firebaserc: string | null): string | null {
  if (firebaserc === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(firebaserc);
    const projects = (parsed as { projects?: Record<string, unknown> } | null)?.projects;
    return typeof projects?.default === 'string' && projects.default !== '' ? projects.default : null;
  } catch {
    return null;
  }
}

/** The Hosting site FISHY's pages go to, from the "targets" part of .firebaserc. */
function readHostingSite(firebaserc: string | null, projectId: string): string | null {
  try {
    const parsed = JSON.parse(firebaserc ?? '') as { targets?: Record<string, { hosting?: Record<string, unknown> }> };
    const sites = parsed.targets?.[projectId]?.hosting?.[HOSTING_TARGET];
    const site: unknown = Array.isArray(sites) ? sites[0] : undefined;
    return typeof site === 'string' && site !== '' ? site : null;
  } catch {
    return null;
  }
}

function checkBaseUrl(value: string | undefined): string | null {
  if (!value) {
    return 'PUBLIC_BASE_URL is not set. It is the address of the Hosting site, such as https://<project-id>.web.app.';
  }
  if (value.includes('your-project-id')) {
    return 'PUBLIC_BASE_URL is still the example value. Put the address of your own Hosting site in it.';
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'PUBLIC_BASE_URL is not a web address.';
  }
  if (url.protocol !== 'https:') {
    return 'PUBLIC_BASE_URL must start with https://. The phone provider only calls back to a secure address.';
  }
  if (value.endsWith('/') || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    return 'PUBLIC_BASE_URL must be the site address alone: no path and no slash at the end.';
  }
  return null;
}

const isOn = (value: string | undefined): boolean => value?.trim().toLowerCase() === 'true';

/** The numbers on the allowlist, shown by their last four digits only. */
function allowlist(setting: string | undefined): { any: boolean; shown: string[] } {
  const entries = (setting ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  return {
    any: entries.includes('*'),
    shown: entries.filter((entry) => entry !== '*').map((entry) => `•••• ${entry.replace(/\D/g, '').slice(-4)}`),
  };
}

export function checkDeploy(files: DeployFiles): DeployCheck {
  const findings: Finding[] = [];
  const error = (message: string) => findings.push({ level: 'error', message });
  const warning = (message: string) => findings.push({ level: 'warning', message });

  const projectId = readProjectId(files.firebaserc);
  if (projectId === null) {
    error('There is no project to deploy to. Copy .firebaserc.example to .firebaserc and put your project ID in it.');
    return { ok: false, projectId: null, findings, summary: 'No project is set.' };
  }
  if (projectId === PLACEHOLDER_PROJECT) {
    error('.firebaserc still holds the example value. Put your own project ID in it.');
    return { ok: false, projectId: null, findings, summary: 'No project is set.' };
  }

  // FISHY deploys to a Hosting site of its own, so it can never replace another app's site.
  const site = readHostingSite(files.firebaserc, projectId);
  if (site === null || site === PLACEHOLDER_SITE) {
    error(
      `.firebaserc does not say which Hosting site FISHY's pages go to. Create one and name it: ` +
        `npx firebase-tools hosting:sites:create <site-id>, then npx firebase-tools target:apply hosting ${HOSTING_TARGET} <site-id>.`,
    );
  }

  const functionsText = files.functionsEnv(projectId);
  const settings = functionsText === null ? {} : parseEnv(functionsText);
  if (functionsText === null) {
    error(`functions/.env.${projectId} is missing. Copy functions/.env.example to that name and fill it in.`);
  } else {
    const problem = checkBaseUrl(settings.PUBLIC_BASE_URL);
    if (problem) {
      error(problem);
    } else if (site !== null && site !== PLACEHOLDER_SITE) {
      const host = new URL(settings.PUBLIC_BASE_URL ?? '').host;
      if (host !== `${site}.web.app` && host !== `${site}.firebaseapp.com`) {
        warning(
          `PUBLIC_BASE_URL is ${host}, but the pages deploy to the site "${site}" (${site}.web.app). ` +
            'Unless that is a custom domain of this site, the phone callbacks and the approval link will go to the wrong place.',
        );
      }
    }
    if (!settings.COMPANY_NAME) {
      warning('COMPANY_NAME is empty. The approval page will not say which company is asking.');
    }
  }

  const callsOn = isOn(settings.CALLS_ENABLED);
  const pageOn = isOn(settings.APPROVAL_PAGE_ENABLED);
  const allowed = allowlist(settings.CALL_ALLOWLIST);
  if (callsOn) {
    if (allowed.any) {
      warning('Real phone calls are ON and CALL_ALLOWLIST is "*": ANY number in the directory can be called.');
    } else if (allowed.shown.length === 0) {
      warning('Real phone calls are ON but no number is on CALL_ALLOWLIST, so nobody can be called.');
    } else {
      const count = allowed.shown.length;
      warning(`Real phone calls are ON for ${count} number${count === 1 ? '' : 's'}: ${allowed.shown.join(', ')}.`);
    }
  }
  if (functionsText !== null && !callsOn && !pageOn) {
    warning('Calls are off and the approval page is off, so nobody can answer a check. Every check will end as "no answer".');
  }

  const missing = WEB_REQUIRED.filter((key) => !files.webEnv[key]);
  if (missing.length > 0) {
    error(
      `The web pages have no ${missing.join(', ')}. They would be deployed in demo mode and work for nobody. ` +
        'Copy web/.env.example to web/.env.local and fill it in.',
    );
  } else if (files.webEnv.VITE_FIREBASE_PROJECT_ID !== projectId) {
    error(
      `The web pages are set up for "${files.webEnv.VITE_FIREBASE_PROJECT_ID}", but this deploy goes to "${projectId}". ` +
        'Make web/.env.local and .firebaserc name the same project.',
    );
  }
  if (pageOn && missing.length === 0 && !files.webEnv.VITE_RECAPTCHA_ENTERPRISE_KEY) {
    warning(
      'The approval page is on, but the web pages have no VITE_RECAPTCHA_ENTERPRISE_KEY. ' +
        'Without a reCAPTCHA key they get no App Check token, so the page cannot load a request.',
    );
  }

  const summary = [
    `Project: ${projectId}`,
    `Hosting site: ${site !== null && site !== PLACEHOLDER_SITE ? site : 'not set'}`,
    'Firestore database: fishy (FISHY\'s own; "(default)" is never touched)',
    `Real phone calls: ${callsOn ? 'ON' : 'OFF'}`,
    `Web approval page: ${pageOn ? 'ON' : 'OFF'}`,
    'Not checked here: the secrets FISHY_TWILIO_ACCOUNT_SID and FISHY_TWILIO_AUTH_TOKEN must exist before the first deploy.',
    'Without a phone account yet, set both to the word not-set and leave calls off.',
  ].join('\n');

  return { ok: findings.every((finding) => finding.level !== 'error'), projectId, findings, summary };
}
