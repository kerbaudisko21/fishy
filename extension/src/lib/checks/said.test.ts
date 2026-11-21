import { describe, expect, it } from 'vitest';
import { judgeAuth, parseHeaders } from './email';
import { findAmounts, looksLikeName, mainAmount, parseCaptionText } from './said';

describe('captions', () => {
  it('tells speaker labels from caption lines', () => {
    expect(looksLikeName('Budi Santoso')).toBe(true);
    expect(looksLikeName('You')).toBe(true);
    expect(looksLikeName('Keep this between us.')).toBe(false);
    expect(looksLikeName('Pay 186k today')).toBe(false);
  });

  it('assigns each caption line to its speaker', () => {
    expect(parseCaptionText('Budi Santoso\nRina, I need this paid today.\nKeep it quiet.\nYou\nOkay, I will check.')).toEqual([
      { speaker: 'Budi Santoso', text: 'Rina, I need this paid today.' },
      { speaker: 'Budi Santoso', text: 'Keep it quiet.' },
      { speaker: 'You', text: 'Okay, I will check.' },
    ]);
  });
});

describe('amounts', () => {
  it.each([
    ['Wire $186,400 before three', { value: 186400, currency: 'USD' }],
    ['about USD 186k', { value: 186000, currency: 'USD' }],
    ['transfer Rp 2.450.000.000 hari ini', { value: 2450000000, currency: 'IDR' }],
    ['Rp 2,4 miliar', { value: 2400000000, currency: 'IDR' }],
    ['one hundred and 186 thousand dollars', { value: 186000, currency: 'USD' }],
  ])('reads %s', (text, expected) => expect(mainAmount(text)).toEqual(expected));

  it('ignores plain numbers', () => {
    expect(findAmounts('Room 4410 at 3 pm')).toEqual([]);
  });
});

describe('sender authentication', () => {
  const RAW = `Received: from x
Authentication-Results: mx.google.com;
       dkim=none;
       spf=softfail (google.com: domain of transitioning billing@sinar-logistik.co) smtp.mailfrom=billing@sinar-logistik.co;
       dmarc=fail (p=NONE sp=NONE dis=NONE) header.from=sinar-logistik.co
From: Sinar Logistik Billing <billing@sinar-logistik.co>
Reply-To: <sinar.finance@gmail.com>
Subject: Updated bank details

Body text`;

  it('reads DMARC, SPF, DKIM and Reply-To', () => {
    expect(parseHeaders(RAW)).toEqual({ dmarc: 'fail', spf: 'softfail', dkim: 'none', replyTo: 'sinar.finance@gmail.com' });
  });

  it('fails a DMARC fail with a webmail reply-to, and passes a clean sender', () => {
    const bad = judgeAuth('billing@sinar-logistik.co', parseHeaders(RAW));
    expect(bad.failed).toBe(true);
    expect(bad.detail).toBe('DMARC: fail · reply-to is a free webmail address');
    expect(judgeAuth('billing@sinarlogistik.co.id', { dmarc: 'pass' }).failed).toBe(false);
  });
});
