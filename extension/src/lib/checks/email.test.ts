import { describe, expect, it } from 'vitest';
import { parseHeaders } from './email';


describe('forged Authentication-Results (security review M4)', () => {
  it('ignores a dmarc=pass the sender added below Gmail\'s own header', () => {
    const raw = 'Authentication-Results: mx.google.com; spf=softfail smtp.mailfrom=x@sinar-logistik.co\nAuthentication-Results: mx.google.com; dmarc=pass\nFrom: x@sinar-logistik.co\n\nbody';
    expect(parseHeaders(raw).dmarc).toBeUndefined();
    expect(parseHeaders(raw).spf).toBe('softfail');
  });

  it('ignores a topmost header that Gmail did not write', () => {
    expect(parseHeaders('Authentication-Results: evil.example; dmarc=pass\n\nbody').dmarc).toBeUndefined();
  });
});
