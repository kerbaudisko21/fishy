import { describe, expect, it } from 'vitest';
import { redact } from './redact';

describe('redact', () => {
  it('removes emails, phone numbers, account numbers and links', () => {
    const out = redact(
      'Pay Bank Teluk 1234569032 today. Call +62 857 1234 2219 or mail billing@sinar-logistik.co, see https://sinar-logistik.co/inv',
    );
    expect(out).not.toMatch(/1234569032|2219|billing@|https:/);
    expect(out).toContain('Pay Bank Teluk [number] today');
  });

  it('keeps the pressure wording the tactic reader needs', () => {
    expect(redact('Keep this between us, it must go out before three.')).toBe(
      'Keep this between us, it must go out before three.',
    );
  });
});
