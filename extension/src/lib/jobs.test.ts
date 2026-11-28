import { describe, expect, it } from 'vitest';
import { validJob } from './jobs';

describe('work handed to the panel (shortcut, right-click, banner)', () => {
  const now = 1_000_000;
  it('takes well-formed, recent jobs', () => {
    expect(validJob({ kind: 'site', tabId: 3, at: now - 1000 }, now)).toMatchObject({ kind: 'site' });
    expect(validJob({ kind: 'link', tabId: 3, at: now, url: 'https://example.com' }, now)).toMatchObject({ kind: 'link' });
    expect(validJob({ kind: 'text', tabId: 3, at: now, text: 'pay today' }, now)).toMatchObject({ kind: 'text' });
  });
  it('drops stale, future, unknown or malformed jobs', () => {
    expect(validJob({ kind: 'site', tabId: 3, at: now - 61_000 }, now)).toBeNull();
    expect(validJob({ kind: 'site', tabId: 3, at: now + 60_000 }, now)).toBeNull();
    expect(validJob({ kind: 'delete-everything', tabId: 3, at: now }, now)).toBeNull();
    expect(validJob({ kind: 'picture', tabId: 3, at: now }, now)).toBeNull();
    expect(validJob({ kind: 'link', tabId: '3', at: now, url: 'x' }, now)).toBeNull();
    expect(validJob(null, now)).toBeNull();
    expect(validJob('site', now)).toBeNull();
  });
});
