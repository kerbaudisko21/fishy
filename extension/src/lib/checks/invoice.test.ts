import { describe, expect, it } from 'vitest';
import { compareAccount, editTraces, findAccounts, invoiceNumber, invoiceTotal, parsePdfDate } from './invoice';

const TEXT = `PT Sinar Logistik
Invoice No: INV-SL-2611
Total due: USD 186,400.00
Please transfer to Bank Teluk
Account No: 123-456-9032
Account name: Sinar Logistik Global
WhatsApp +62 857 1234 2219`;

describe('invoice text', () => {
  it('reads the account, bank and holder', () => {
    expect(findAccounts(TEXT)).toEqual([{ bank: 'Bank Teluk', number: '1234569032', holder: 'Sinar Logistik Global' }]);
  });

  it('reads an account with the bank name between label and number', () => {
    expect(findAccounts('Use the new account: Bank Teluk 123-456-9032.')).toEqual([{ bank: 'Bank Teluk', number: '1234569032', holder: undefined }]);
  });

  it('reads the invoice number and total', () => {
    expect(invoiceNumber(TEXT)).toBe('INV-SL-2611');
    expect(invoiceTotal(TEXT)).toEqual({ value: 186400, currency: 'USD' });
    expect(invoiceTotal('Jumlah tagihan: Rp 2.450.000.000')).toEqual({ value: 2450000000, currency: 'IDR' });
  });

  it('flags a changed bank account against the record (R4)', () => {
    const usual = { bank: 'Bank Karang', masked: '•••• 4471', holder: 'PT Sinar Logistik' };
    expect(compareAccount(findAccounts(TEXT), usual).changed).toBe(true);
    expect(compareAccount(findAccounts('Bank Karang Account: 8890 1234 4471'), usual).changed).toBe(false);
  });
});

describe('edit traces', () => {
  it('parses PDF dates', () => {
    expect(parsePdfDate("D:20261118093000+07'00'")?.toISOString()).toBe('2026-11-18T02:30:00.000Z');
  });

  it('flags an edit made days later in an online editor, and a different font on the bank line', () => {
    const items = editTraces({
      created: parsePdfDate('D:20261118093000Z'),
      modified: parsePdfDate('D:20261121080000Z'),
      producer: 'iLovePDF',
      accountFont: 'g_d0_f3',
      mainFont: 'g_d0_f1',
    });
    expect(items.map((i) => i.ok)).toEqual([false, false]);
    expect(items[0].detail).toContain('online PDF editor');
  });

  it('passes an untouched file', () => {
    expect(editTraces({ created: parsePdfDate('D:20261118093000Z'), modified: parsePdfDate('D:20261118093000Z') })[0].ok).toBe(true);
  });
});
