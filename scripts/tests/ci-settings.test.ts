// The settings files for a deploy from GitHub Actions.
//
// On a laptop a person writes .firebaserc and the two .env files by hand. In
// the deploy workflow nobody is there, so they are built from the repository's
// Actions secrets and variables. The same pre-deploy check then reads them.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ciSettings } from '../ci-settings.ts';
import { checkDeploy, parseEnv } from '../deploy-check.ts';

const ENV = {
  GCP_PROJECT_ID: 'fishy-demo-1234',
  HOSTING_SITE: 'fishy-demo-pages',
  FIREBASE_WEB_API_KEY: 'web-api-key',
  FIREBASE_WEB_APP_ID: '1:000000000000:web:0000000000000000',
};

function files(env: Record<string, string | undefined>) {
  const result = ciSettings(env);
  assert.equal(result.ok, true, result.ok ? '' : result.problems.join('; '));
  if (!result.ok) {
    throw new Error('unreachable');
  }
  return result.files;
}

const functionsOf = (env: Record<string, string | undefined>) => parseEnv(files(env).functionsEnv);
const webOf = (env: Record<string, string | undefined>) => parseEnv(files(env).webEnv);

test('the smallest set of values gives three files that pass the pre-deploy check', () => {
  const f = files(ENV);

  assert.equal(f.functionsEnvPath, 'functions/.env.fishy-demo-1234');
  const check = checkDeploy({ firebaserc: f.firebaserc, functionsEnv: () => f.functionsEnv, webEnv: parseEnv(f.webEnv) });
  assert.deepEqual(
    check.findings.filter((finding) => finding.level === 'error'),
    [],
  );
  assert.equal(check.ok, true);
  assert.equal(check.projectId, 'fishy-demo-1234');
  assert.ok(check.summary.includes('Hosting site: fishy-demo-pages'));
});

test('what is left out gets the usual value: the site address, and the account made for FISHY', () => {
  const settings = functionsOf(ENV);

  assert.equal(settings.PUBLIC_BASE_URL, 'https://fishy-demo-pages.web.app');
  assert.equal(settings.RUNTIME_SERVICE_ACCOUNT, 'fishy-functions@fishy-demo-1234.iam.gserviceaccount.com');
  assert.equal(webOf(ENV).VITE_FIREBASE_AUTH_DOMAIN, 'fishy-demo-1234.firebaseapp.com');
  assert.equal(webOf(ENV).VITE_FIREBASE_PROJECT_ID, 'fishy-demo-1234');
});

test('real calls and the approval page are off unless switched on with the word true', () => {
  assert.equal(functionsOf(ENV).CALLS_ENABLED, 'false');
  assert.equal(functionsOf(ENV).APPROVAL_PAGE_ENABLED, 'false');

  for (const notTrue of ['', '1', 'yes', 'on', 'enabled', 'truee']) {
    assert.equal(functionsOf({ ...ENV, CALLS_ENABLED: notTrue }).CALLS_ENABLED, 'false', `"${notTrue}" must not switch calls on`);
  }
  for (const yes of ['true', 'TRUE', ' true ']) {
    assert.equal(functionsOf({ ...ENV, CALLS_ENABLED: yes }).CALLS_ENABLED, 'true');
    assert.equal(functionsOf({ ...ENV, APPROVAL_PAGE_ENABLED: yes }).APPROVAL_PAGE_ENABLED, 'true');
  }
});

test('the other settings are passed through as given', () => {
  const settings = functionsOf({
    ...ENV,
    PUBLIC_BASE_URL: 'https://check.ombakura-freight.example',
    RUNTIME_SERVICE_ACCOUNT: 'other-runner@fishy-demo-1234.iam.gserviceaccount.com',
    COMPANY_NAME: 'Ombakura Freight',
    COMPANY_DOMAIN: 'ombakura-freight.example',
    TWILIO_FROM: '+12025550100',
    CALL_ALLOWLIST: '+12025550143, +12025550144',
    CALLS_DAILY_CAP: '5',
  });

  assert.equal(settings.PUBLIC_BASE_URL, 'https://check.ombakura-freight.example');
  assert.equal(settings.RUNTIME_SERVICE_ACCOUNT, 'other-runner@fishy-demo-1234.iam.gserviceaccount.com');
  assert.equal(settings.COMPANY_NAME, 'Ombakura Freight');
  assert.equal(settings.COMPANY_DOMAIN, 'ombakura-freight.example');
  assert.equal(settings.TWILIO_FROM, '+12025550100');
  assert.equal(settings.CALL_ALLOWLIST, '+12025550143, +12025550144');
  assert.equal(settings.CALLS_DAILY_CAP, '5');
});

test('a daily limit that is not a whole number is left out, so the built-in limit applies', () => {
  for (const bad of ['', 'many', '-1', '2.5']) {
    assert.equal('CALLS_DAILY_CAP' in functionsOf({ ...ENV, CALLS_DAILY_CAP: bad }), false);
  }
});

test('the web pages get their Firebase settings, and never an App Check debug token', () => {
  const web = webOf({
    ...ENV,
    FIREBASE_AUTH_DOMAIN: 'login.ombakura-freight.example',
    FIREBASE_MESSAGING_SENDER_ID: '000000000000',
    RECAPTCHA_ENTERPRISE_KEY: 'site-key',
    FCM_VAPID_KEY: 'push-key',
    VITE_APPCHECK_DEBUG_TOKEN: 'a-debug-token',
    APPCHECK_DEBUG_TOKEN: 'a-debug-token',
  });

  assert.deepEqual(web, {
    VITE_FIREBASE_API_KEY: 'web-api-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'login.ombakura-freight.example',
    VITE_FIREBASE_PROJECT_ID: 'fishy-demo-1234',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
    VITE_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000',
    VITE_RECAPTCHA_ENTERPRISE_KEY: 'site-key',
    VITE_FCM_VAPID_KEY: 'push-key',
  });
  assert.ok(!JSON.stringify(files({ ...ENV, VITE_APPCHECK_DEBUG_TOKEN: 'a-debug-token' })).includes('a-debug-token'));
});

test('the web pages are told which Gemini API the cloud model uses, when the repository says', () => {
  // The hosted pages call Gemini through Firebase AI Logic too. Left unset, they use the
  // Gemini Developer API, which a project on trial credit refuses.
  assert.equal(webOf({ ...ENV, AI_PROVIDER: 'agent-platform' }).VITE_AI_PROVIDER, 'agent-platform');
  assert.equal(webOf({ ...ENV, AI_PROVIDER: 'developer' }).VITE_AI_PROVIDER, 'developer');
  assert.equal(webOf({ ...ENV, AI_PROVIDER: '  Agent-Platform ' }).VITE_AI_PROVIDER, 'agent-platform');
});

test('with no Gemini API named, the line is left out and the pages use their built-in choice', () => {
  assert.ok(!('VITE_AI_PROVIDER' in webOf(ENV)));
  assert.ok(!('VITE_AI_PROVIDER' in webOf({ ...ENV, AI_PROVIDER: '  ' })));
});

test('a Gemini API name that is not one of the two is refused, not quietly replaced', () => {
  const result = ciSettings({ ...ENV, AI_PROVIDER: 'vertex' });

  assert.equal(result.ok, false);
  assert.deepEqual(result.ok ? [] : result.problems, ['AI_PROVIDER must be "developer" or "agent-platform", not "vertex".']);
});

for (const name of Object.keys(ENV)) {
  test(`without ${name} nothing is written, and the answer names it`, () => {
    const result = ciSettings({ ...ENV, [name]: '  ' });

    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.problems.join('\n').includes(name));
  });
}

test('a value with a line break is refused, so it cannot bring a second setting with it', () => {
  const result = ciSettings({ ...ENV, COMPANY_NAME: 'Ombakura Freight\nCALLS_ENABLED=true' });

  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.problems.join('\n').includes('COMPANY_NAME'));
});

test('a project ID or site ID that is not an ID is refused, because both become file names and addresses', () => {
  for (const [name, value] of [
    ['GCP_PROJECT_ID', '../somewhere-else'],
    ['GCP_PROJECT_ID', 'Has Spaces'],
    ['HOSTING_SITE', 'evil.example/path'],
  ] as const) {
    const result = ciSettings({ ...ENV, [name]: value });

    assert.equal(result.ok, false, `${name}=${value}`);
    assert.ok(!result.ok && result.problems.join('\n').includes(name));
  }
});
