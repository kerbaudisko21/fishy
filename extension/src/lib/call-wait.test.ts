import { describe, expect, it } from 'vitest';
import { callUpdate, safeApprovalUrl, unanswered, waitingFor } from './call-wait';

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

// A check that ended without an answer. The panel must say what really happened: "didn't answer"
// is wrong when nobody was called, and wrong when the person answered but the PIN never came.
describe('what the panel says when a check ended without an answer', () => {
  it('says the person did not answer when the call rang out', () => {
    for (const reason of ['no_answer', null, undefined, 'something_new']) {
      const u = unanswered('Budi', reason);

      expect(u.pill).toBe('No answer');
      expect(u.title).toBe('Budi didn’t answer.');
      expect(u.line).toContain('Keep holding the payment');
    }
  });

  it('never says "didn’t answer" when no phone call was placed', () => {
    const u = unanswered('Budi', 'calls_disabled');

    expect(u.pill).toBe('Not called');
    expect(u.title).toBe('Budi was not called.');
    expect(u.line).toContain('No phone call was placed: phone calls are switched off.');
    expect(u.line).toContain('Keep holding the payment');
  });

  it('gives the reason for every way a call is not placed', () => {
    expect(unanswered('Budi', 'not_on_allowlist').line).toContain('not on the list of numbers that may be called');
    expect(unanswered('Budi', 'daily_cap_reached').line).toContain('limit of calls for today');
    expect(unanswered('Budi', 'provider_error').line).toContain('phone service did not take the call');
  });

  it('says nothing is confirmed when the right PIN never came', () => {
    const u = unanswered('Budi', 'pin_failed');

    expect(u.pill).toBe('Not confirmed');
    expect(u.title).toBe('Budi didn’t confirm.');
    expect(u.line).toContain('PIN');
    expect(u.line).toContain('Keep holding the payment');
  });
});

describe('the call state the server writes on a check', () => {
  it('passes on the state and why there was no answer', () => {
    expect(callUpdate({ state: 'no_answer', reason: 'calls_disabled', placed: false })).toEqual({ state: 'no_answer', reason: 'calls_disabled' });
    expect(callUpdate({ state: 'ringing', reason: null })).toEqual({ state: 'ringing' });
  });

  it('leaves out what the server did not write, so it never erases what the panel knows', () => {
    const update = callUpdate({ state: 'ringing' });

    expect(update).toEqual({ state: 'ringing' });
    expect(Object.keys(update ?? {})).toEqual(['state']);
    // The countdown to the next approver is set by the panel and must survive this update.
    expect({ state: 'ringing', escalateAt: 123, ...update }).toEqual({ state: 'ringing', escalateAt: 123 });
  });

  it('ignores a document with no call, or a state the panel does not know', () => {
    for (const bad of [undefined, null, 'ringing', {}, { state: 'paid' }, { state: 42 }]) {
      expect(callUpdate(bad)).toBeNull();
    }
  });

  it('keeps only a short, plain reason', () => {
    expect(callUpdate({ state: 'no_answer', reason: 42 })).toEqual({ state: 'no_answer' });
    expect(callUpdate({ state: 'no_answer', reason: 'x'.repeat(200) })).toEqual({ state: 'no_answer' });
  });
});
