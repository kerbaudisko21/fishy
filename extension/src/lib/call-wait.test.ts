import { describe, expect, it } from 'vitest';
import { safeApprovalUrl, waitingFor } from './call-wait';

// While a check waits for its answer, the panel says where the answer will come
// from. It must never say "calling" when no phone call was placed.

const BUDI = { who: 'Budi', phoneMasked: '+62 812 •••• 4410' };
const LINK = 'https://fishy-demo-1234.web.app/?t=check-1.secret-token-0123456789';

describe('what the panel says while a check waits', () => {
  it('before the server answers, and when a call was placed, it says it is calling the number on record', () => {
    for (const started of [undefined, { call: 'placed' as const, reason: null, approvalUrl: null }]) {
      const w = waitingFor(BUDI, started);

      expect(w.pill).toBe('Calling');
      expect(w.title).toBe('Calling the real Budi…');
      expect(w.line).toContain('+62 812 •••• 4410');
      expect(w.approvalUrl).toBeNull();
    }
  });

  it('when a call was placed, the approval page is not offered, even if the server sent a link', () => {
    const w = waitingFor(BUDI, { call: 'placed', reason: null, approvalUrl: LINK });

    expect(w.pill).toBe('Calling');
    expect(w.approvalUrl).toBeNull();
  });

  it('when no call was placed and there is an approval page, it says so and offers the page', () => {
    const w = waitingFor(BUDI, { call: 'not_placed', reason: 'calls_disabled', approvalUrl: LINK });

    expect(w.pill).toBe('Waiting');
    expect(w.title).toBe('Waiting for the real Budi…');
    expect(w.line).toContain('No phone call was placed');
    expect(w.line).toContain('phone calls are switched off');
    expect(w.line).not.toContain('press 1 or 2');
    expect(w.approvalUrl).toBe(LINK);
  });

  it('says why no call was placed, in plain words', () => {
    const line = (reason: string) => waitingFor(BUDI, { call: 'not_placed', reason, approvalUrl: LINK }).line;

    expect(line('not_on_allowlist')).toContain('not on the list of numbers that may be called');
    expect(line('daily_cap_reached')).toContain('limit of calls for today');
    expect(line('provider_error')).toContain('phone service did not take the call');
    expect(line('something_new')).toContain('No phone call was placed.');
  });

  it('when no call was placed and there is no page, it does not pretend to call', () => {
    const w = waitingFor(BUDI, { call: 'not_placed', reason: 'calls_disabled', approvalUrl: null });

    expect(w.pill).toBe('Not called');
    expect(w.line).toContain('No phone call was placed');
    expect(w.approvalUrl).toBeNull();
  });
});

describe('the approval link', () => {
  it('is kept only when it is a secure web address', () => {
    expect(safeApprovalUrl(LINK)).toBe(LINK);
    for (const bad of ['http://fishy-demo-1234.web.app/?t=x', 'javascript:alert(1)', 'not a link', '', null, undefined, 42]) {
      expect(safeApprovalUrl(bad)).toBeNull();
    }
  });
});
