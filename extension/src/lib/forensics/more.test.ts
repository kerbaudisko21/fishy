import { describe, expect, it } from 'vitest';
import { aiLabel } from '../../sidepanel/AiStatus';
import { secondOpinionReason } from '../ai/escalate';
import { summary, trustFor } from '../ai/stats';
import { sane } from '../overlay-mask';
import { classifyQr, crc16, emvFields, qrLab } from './qr';

/** Builds an EMVCo payment payload with a correct (or broken) checksum. */
function emv(fields: Array<[string, string]>, breakChecksum = false) {
  const body = fields.map(([t, v]) => `${t}${String(v.length).padStart(2, '0')}${v}`).join('') + '6304';
  const crc = crc16(body);
  return body + (breakChecksum ? (crc === '0000' ? '0001' : '0000') : crc);
}

describe('QR codes', () => {
  it('CRC-16/CCITT-FALSE matches the standard check value', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('reads a QRIS payment code: who it pays, how much, and a correct checksum', () => {
    const code = emv([['00', '01'], ['01', '12'], ['53', '360'], ['54', '250000'], ['58', 'ID'], ['59', 'TOKO SINAR'], ['60', 'JAKARTA']]);
    const q = classifyQr(code);
    expect(q).toMatchObject({ kind: 'payment', merchant: 'TOKO SINAR', city: 'JAKARTA', amount: '250000', currency: 'IDR', checksumOk: true });
    const lab = qrLab(code, [])!;
    expect(lab.hints).toEqual([]);
    expect(lab.rows[0].detail).toContain('TOKO SINAR');
  });

  it('an edited payment code fails its checksum and is flagged', () => {
    const real = emv([['00', '01'], ['59', 'TOKO SINAR'], ['60', 'JAKARTA']]);
    const edited = real.replace('TOKO SINAR', 'TOKO SINAH');
    expect(classifyQr(edited)).toMatchObject({ kind: 'payment', checksumOk: false });
    expect(qrLab(edited, [])!.hints[0].id).toBe('qr_checksum');
  });

  it('a link to a copy of a supplier’s address is flagged; a normal link is not', () => {
    const suppliers = [{ name: 'PT Sinar Logistik', domain: 'sinarlogistik.co.id' }];
    expect(qrLab('https://sinar-logistik.co/pay?inv=9', suppliers)!.hints[0]).toMatchObject({ id: 'qr_risky' });
    expect(qrLab('https://sinarlogistik.co.id/pay', suppliers)!.hints).toEqual([]);
    // The query string never goes on to the cloud lookups.
    expect(qrLab('https://example.com/pay?token=secret', [])!.url).toBe('https://example.com/pay');
  });

  it('broken or odd codes never crash', () => {
    expect(qrLab(null, [])).toBeNull();
    expect(emvFields('0002')).toBeNull();
    expect(classifyQr('000201' + 'x'.repeat(50)).kind).toBe('text');
    expect(classifyQr('https://').kind).toBe('text');
    expect(qrLab('just some text‮', [])!.rows[0].detail).not.toContain('‮');
  });
});

describe('self-tuning escalation', () => {
  const look = (o: object) => ({ assessment: 'likely_ai' as const, signs: [{ sign: 'a', where: '' }], confidence: 'medium' as const, source: 'on_device' as const, ...o });
  it('before enough second opinions, borderline answers go to the cloud', () => {
    expect(secondOpinionReason(look({}), false, { rate: 1, n: 3 })).toMatch(/one sign/);
  });
  it('once Nano agrees almost always, its borderline answers stay on the laptop', () => {
    expect(secondOpinionReason(look({}), false, { rate: 0.95, n: 20 })).toBeNull();
    expect(secondOpinionReason(look({ confidence: 'low', assessment: 'no_clear_signs', signs: [] }), false, { rate: 0.95, n: 20 })).toBeNull();
  });
  it('"couldn’t tell" and a disagreement with the pixel checks always go to the cloud', () => {
    expect(secondOpinionReason(look({ assessment: 'unclear' }), false, { rate: 1, n: 99 })).toMatch(/couldn’t tell/);
    expect(secondOpinionReason(look({ assessment: 'no_clear_signs', signs: [] }), true, { rate: 1, n: 99 })).toMatch(/pixel checks/);
  });
  it('once Nano disagrees often, even its medium answers are checked', () => {
    expect(secondOpinionReason(look({ assessment: 'no_clear_signs', signs: [] }), false, { rate: 0.4, n: 20 })).toMatch(/disagreed/);
    expect(secondOpinionReason(look({ assessment: 'no_clear_signs', signs: [], confidence: 'high' }), false, { rate: 0.4, n: 20 })).toBeNull();
  });
  it('trust is smoothed, and the summary counts calls saved', () => {
    expect(trustFor('picture', {})).toEqual({ rate: 0.5, n: 0 });
    expect(trustFor('picture', { picture: { device: 5, cloud: 2, deviceMs: 5000, cloudMs: 6000, escalations: 2, agreed: 2 } })).toEqual({ rate: 0.75, n: 2 });
    const s = summary({ picture: { device: 6, cloud: 2, deviceMs: 6000, cloudMs: 6000, escalations: 2, agreed: 1 } });
    expect(s).toMatchObject({ answers: 8, cloudCallsSaved: 6, agreement: 0.5 });
    expect(s.onDeviceShare).toBeCloseTo(0.75);
    expect(s.deviceAvgMs).toBe(1000);
  });
});

describe('the floating window’s position, as told through the page', () => {
  it('accepts a sane rectangle', () => {
    expect(sane({ fishy: 'rect', x: 900, y: 12, w: 400, h: 760, vw: 1440, vh: 900 })).toEqual({ x: 900, y: 12, w: 400, h: 760, vw: 1440, vh: 900 });
  });
  it('refuses anything a page could use to black out the call itself', () => {
    expect(sane({ fishy: 'rect', x: 0, y: 0, w: 1440, h: 900, vw: 1440, vh: 900 })).toBeNull();
    expect(sane({ fishy: 'rect', x: 0, y: 0, w: NaN, h: 10, vw: 1440, vh: 900 })).toBeNull();
    expect(sane({ fishy: 'other' })).toBeNull();
    expect(sane(null)).toBeNull();
    expect(sane({ fishy: 'rect', x: '1', y: 0, w: 10, h: 10, vw: 1440, vh: 900 })).toBeNull();
  });
});

describe('where the AI runs: the header chip', () => {
  it('names the state in plain words', () => {
    expect(aiLabel({ nano: 'available', online: true, cloud: true }).text).toBe('Gemini Nano + cloud');
    expect(aiLabel({ nano: 'available', online: false, cloud: true }).text).toBe('Offline · Gemini Nano');
    expect(aiLabel({ nano: 'downloading', online: true, cloud: true }).tone).toBe('wait');
    expect(aiLabel({ nano: 'unavailable', online: true, cloud: true }).text).toBe('Cloud only');
    expect(aiLabel({ nano: 'unavailable', online: false, cloud: true }).text).toBe('Offline · laptop checks');
    expect(aiLabel({ nano: 'unavailable', online: true, cloud: false }).text).toBe('Laptop checks only');
  });
});
