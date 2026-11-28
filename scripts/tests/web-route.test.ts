import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pageFor } from '../../web/src/route.ts';

test('the bare address opens Try FISHY, not an approval with no link to check', () => {
  assert.equal(pageFor('/', ''), 'try');
  assert.equal(pageFor('', ''), 'try');
  assert.equal(pageFor('/index.html', ''), 'try');
});

test('an address that carries a one-time link opens the approval page', () => {
  assert.equal(pageFor('/', '?t=abc123'), 'approval');
});

test('a link whose token was cut off still opens the approval page, which says the link no longer works', () => {
  assert.equal(pageFor('/', '?t='), 'approval');
});

test('?demo opens the approval page on demo data', () => {
  assert.equal(pageFor('/', '?demo'), 'approval');
  assert.equal(pageFor('/', '?demo=1'), 'approval');
});

test('a query that is neither a link nor ?demo does not open the approval page', () => {
  assert.equal(pageFor('/', '?utm_source=devpost'), 'try');
});

test('/try and /incident keep their own pages, whatever the query says', () => {
  assert.equal(pageFor('/try', ''), 'try');
  assert.equal(pageFor('/try', '?t=abc123'), 'try');
  assert.equal(pageFor('/incident', '?id=abc'), 'incident');
  assert.equal(pageFor('/incident', '?demo'), 'incident');
});
