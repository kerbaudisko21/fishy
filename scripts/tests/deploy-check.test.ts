// The check that runs before every deploy.
//
// A deploy can go wrong quietly: the web pages build in demo mode when their
// Firebase settings are missing, and one wrong setting turns on real phone
// calls. This check stops the first kind and says the second kind out loud.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkDeploy, parseEnv } from '../deploy-check.ts';
import type { DeployFiles } from '../deploy-check.ts';

const FUNCTIONS_ENV = `
PUBLIC_BASE_URL=https://fishy-demo-1234.web.app
COMPANY_NAME=Ombakura Freight
COMPANY_DOMAIN=ombakura-freight.example
CALLS_ENABLED=false
CALL_ALLOWLIST=
APPROVAL_PAGE_ENABLED=true
`;

const WEB_ENV = {
  VITE_FIREBASE_API_KEY: 'web-api-key',
  VITE_FIREBASE_PROJECT_ID: 'fishy-demo-1234',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000',
  VITE_RECAPTCHA_ENTERPRISE_KEY: 'site-key',
};

function files(overrides: Partial<DeployFiles> = {}): DeployFiles {
  return {
    firebaserc: JSON.stringify({ projects: { default: 'fishy-demo-1234' } }),
    functionsEnv: (projectId) => (projectId === 'fishy-demo-1234' ? FUNCTIONS_ENV : null),
    webEnv: WEB_ENV,
    ...overrides,
  };
}

const errors = (f: DeployFiles) => checkDeploy(f).findings.filter((finding) => finding.level === 'error').map((finding) => finding.message);
const warnings = (f: DeployFiles) => checkDeploy(f).findings.filter((finding) => finding.level === 'warning').map((finding) => finding.message);
const withFunctionsEnv = (text: string) => files({ functionsEnv: () => text });

test('a complete setup passes, and says which project it is for', () => {
  const result = checkDeploy(files());

  assert.equal(result.ok, true);
  assert.equal(result.projectId, 'fishy-demo-1234');
  assert.deepEqual(errors(files()), []);
});

test('the summary says whether real calls and the approval page are on', () => {
  const { summary } = checkDeploy(files());

  assert.ok(summary.includes('Real phone calls: OFF'));
  assert.ok(summary.includes('Web approval page: ON'));
});

test('a deploy without a project is stopped', () => {
  assert.match(errors(files({ firebaserc: null }))[0] ?? '', /\.firebaserc/);
  assert.match(errors(files({ firebaserc: '{ not json' }))[0] ?? '', /\.firebaserc/);
  assert.match(errors(files({ firebaserc: JSON.stringify({ projects: {} }) }))[0] ?? '', /\.firebaserc/);
});

test('the placeholder project ID from the example file is refused', () => {
  const f = files({ firebaserc: JSON.stringify({ projects: { default: 'your-firebase-project-id' } }) });

  assert.equal(checkDeploy(f).ok, false);
  assert.match(errors(f)[0] ?? '', /your own project ID/);
});

test('a deploy without the settings file for this project is stopped', () => {
  const f = files({ functionsEnv: () => null });

  assert.equal(checkDeploy(f).ok, false);
  assert.match(errors(f).join('\n'), /functions\/\.env\.fishy-demo-1234/);
});

for (const [name, value] of Object.entries({
  'is missing': '',
  'is not https': 'http://fishy-demo-1234.web.app',
  'ends with a slash': 'https://fishy-demo-1234.web.app/',
  'is still the example value': 'https://your-project-id.web.app',
  'has a path': 'https://fishy-demo-1234.web.app/approve',
})) {
  test(`a public address that ${name} is refused`, () => {
    const f = withFunctionsEnv(FUNCTIONS_ENV.replace('https://fishy-demo-1234.web.app', value));

    assert.equal(checkDeploy(f).ok, false);
    assert.match(errors(f).join('\n'), /PUBLIC_BASE_URL/);
  });
}

test('web pages without Firebase settings would deploy in demo mode, so the deploy is stopped', () => {
  const f = files({ webEnv: {} });

  assert.equal(checkDeploy(f).ok, false);
  assert.match(errors(f).join('\n'), /demo mode/);
});

test('web pages set up for another project are refused', () => {
  const f = files({ webEnv: { ...WEB_ENV, VITE_FIREBASE_PROJECT_ID: 'some-other-project' } });

  assert.equal(checkDeploy(f).ok, false);
  assert.match(errors(f).join('\n'), /some-other-project/);
});

test('real calls switched on is said out loud, with how many numbers can be called and none of them in full', () => {
  const f = withFunctionsEnv(
    FUNCTIONS_ENV.replace('CALLS_ENABLED=false', 'CALLS_ENABLED=true').replace('CALL_ALLOWLIST=', 'CALL_ALLOWLIST=+12025550143, +12025550144'),
  );
  const result = checkDeploy(f);

  assert.equal(result.ok, true, 'it is allowed, but never silent');
  assert.ok(result.summary.includes('Real phone calls: ON'));
  assert.match(warnings(f).join('\n'), /2 numbers/);
  const everything = JSON.stringify(result);
  assert.ok(!everything.includes('2025550143'));
  assert.ok(everything.includes('0143'), 'the last four digits are shown so the list can be checked');
});

test('an allowlist of "*" is called out as any number', () => {
  const f = withFunctionsEnv(FUNCTIONS_ENV.replace('CALLS_ENABLED=false', 'CALLS_ENABLED=true').replace('CALL_ALLOWLIST=', 'CALL_ALLOWLIST=*'));

  assert.match(warnings(f).join('\n'), /ANY number/);
});

test('calls on with an empty allowlist: nobody can be called, and the check says so', () => {
  const f = withFunctionsEnv(FUNCTIONS_ENV.replace('CALLS_ENABLED=false', 'CALLS_ENABLED=true'));

  assert.match(warnings(f).join('\n'), /no number is on CALL_ALLOWLIST/);
});

test('with calls off and the approval page off, nobody can answer a check, and the check says so', () => {
  const f = withFunctionsEnv(FUNCTIONS_ENV.replace('APPROVAL_PAGE_ENABLED=true', 'APPROVAL_PAGE_ENABLED=false'));

  assert.equal(checkDeploy(f).ok, true);
  assert.match(warnings(f).join('\n'), /nobody can answer/i);
});

test('the approval page without a reCAPTCHA key cannot load a request, and the check says so', () => {
  const { VITE_RECAPTCHA_ENTERPRISE_KEY: _removed, ...webEnv } = WEB_ENV;
  const f = files({ webEnv });

  assert.match(warnings(f).join('\n'), /reCAPTCHA/);
});

test('a missing company name is a warning, not a stop', () => {
  const f = withFunctionsEnv(FUNCTIONS_ENV.replace('COMPANY_NAME=Ombakura Freight', 'COMPANY_NAME='));

  assert.equal(checkDeploy(f).ok, true);
  assert.match(warnings(f).join('\n'), /COMPANY_NAME/);
});

test('the phone secrets are always mentioned, because the check cannot see them', () => {
  assert.ok(checkDeploy(files()).summary.includes('TWILIO_ACCOUNT_SID'));
});

test('settings files are read the usual way: comments, blank lines, quotes and spaces', () => {
  assert.deepEqual(
    parseEnv(`
# a comment
PUBLIC_BASE_URL = "https://fishy-demo-1234.web.app"
COMPANY_NAME='Ombakura Freight'
EMPTY=
export CALLS_ENABLED=true
not a setting
`),
    { PUBLIC_BASE_URL: 'https://fishy-demo-1234.web.app', COMPANY_NAME: 'Ombakura Freight', EMPTY: '', CALLS_ENABLED: 'true' },
  );
});
