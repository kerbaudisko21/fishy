// Adding FISHY's Remote Config parameters to a project that may belong to
// another app as well. Publishing replaces the whole template, so nothing
// that is not ours may be changed or lost.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { mergeParameters } from '../remote-config-merge.ts';

const OTHER_APP = {
  welcome_banner: { defaultValue: { value: 'Hello' }, valueType: 'STRING' },
  max_upload_mb: { defaultValue: { value: '25' }, conditionalValues: { ios: { value: '10' } }, valueType: 'NUMBER' },
};
const OURS = {
  scam_rules: { defaultValue: { value: '{"version":14}' }, valueType: 'JSON' },
  gmail_selectors: { defaultValue: { value: '{}' }, valueType: 'JSON' },
};

test('our parameters are added and every other parameter is kept exactly as it was', () => {
  const result = mergeParameters(OTHER_APP, OURS);

  assert.deepEqual(result.added.sort(), ['gmail_selectors', 'scam_rules']);
  assert.deepEqual(result.kept.sort(), ['max_upload_mb', 'welcome_banner']);
  assert.deepEqual(result.parameters.welcome_banner, OTHER_APP.welcome_banner);
  assert.deepEqual(result.parameters.max_upload_mb, OTHER_APP.max_upload_mb);
  assert.deepEqual(result.parameters.scam_rules, OURS.scam_rules);
  assert.equal(Object.keys(result.parameters).length, 4);
});

test('a parameter of ours that changed is updated, and one that did not is left alone', () => {
  const live = { ...OTHER_APP, scam_rules: { defaultValue: { value: '{"version":13}' }, valueType: 'JSON' }, gmail_selectors: OURS.gmail_selectors };

  const result = mergeParameters(live, OURS);

  assert.deepEqual(result.updated, ['scam_rules']);
  assert.deepEqual(result.unchanged, ['gmail_selectors']);
  assert.deepEqual(result.added, []);
  assert.deepEqual(result.parameters.scam_rules, OURS.scam_rules);
});

test('an empty project just gets our parameters', () => {
  const result = mergeParameters({}, OURS);

  assert.deepEqual(result.parameters, OURS);
  assert.deepEqual(result.kept, []);
});

test('the live template is not changed in place', () => {
  const live = structuredClone(OTHER_APP);

  mergeParameters(live, OURS);

  assert.deepEqual(live, OTHER_APP);
});

test('the template file in the repo holds the three parameters the side panel reads', () => {
  const file = JSON.parse(readFileSync(new URL('../../remoteconfig.template.json', import.meta.url), 'utf8')) as { parameters: Record<string, unknown> };

  assert.deepEqual(Object.keys(file.parameters).sort(), ['gmail_selectors', 'meet_caption_selectors', 'scam_rules']);
});
