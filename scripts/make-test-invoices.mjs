// Writes two synthetic invoices from the demo supplier into test-fixtures/, for testing the
// invoice check by hand (Gmail attachment, or drop into "Check it yourself").
//
//   invoice-sinar-fishy.pdf  account changed to Mandiri ....9032 (a known scam account in the demo),
//                            edited 3 days after it was made in an online editor, account line in another font
//   invoice-sinar-clean.pdf  the usual BCA ....4471, never edited, one font
//
// Plain PDF written by hand, no dependencies. Demo data only: no real company or account.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-fixtures');
mkdirSync(out, { recursive: true });

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** lines: [text, size, font ('F1' Helvetica, 'F2' Helvetica-Bold, 'F3' Courier), gapBefore] */
function pdf({ lines, info }) {
  let y = 790;
  const ops = ['BT'];
  for (const [text, size = 11, font = 'F1', gap = 0] of lines) {
    y -= gap + size + 6;
    ops.push(`/${font} ${size} Tf 1 0 0 1 56 ${y} Tm (${esc(text)}) Tj`);
  }
  ops.push('ET');
  const stream = ops.join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
    `<< ${Object.entries(info).map(([k, v]) => `/${k} (${esc(v)})`).join(' ')} >>`,
  ];

  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return body;
}

const header = [
  ['PT Sinar Logistik', 18, 'F2'],
  ['Jl. Contoh Raya 12, Jakarta 10110  |  billing@sinarlogistik.co.id', 9],
  ['INVOICE No: SL/2026/1187', 14, 'F2', 18],
  ['Date: 18 Nov 2026    Due: 21 Nov 2026', 10],
  ['Bill to: Kalindra Group, Finance Department', 10],
  ['Description', 11, 'F2', 16],
  ['Sea freight Jakarta - Singapore, 14 containers (Oct-Nov)     USD 171,500.00', 10],
  ['Port handling and customs clearance                          USD 14,900.00', 10],
  ['Total due: USD 186,400.00', 13, 'F2', 12],
  ['Please pay to:', 11, 'F2', 18],
];

const fishy = pdf({
  lines: [
    ...header,
    // The swapped line: another font, like a number pasted over the original.
    ['Account: Mandiri 123-456-9032', 11, 'F3'],
    ['Account name: Sinar Logistik Global', 11],
    ['Our bank details have changed. Please use the new account above for this and future payments.', 9, 'F1', 14],
    ['Kindly process today to avoid a delay to your shipment.', 9],
  ],
  info: {
    Title: 'Invoice SL/2026/1187',
    Producer: 'iLovePDF',
    CreationDate: "D:20261115090000+07'00'",
    ModDate: "D:20261118074500+07'00'",
  },
});

const clean = pdf({
  lines: [
    ...header,
    ['Account: BCA 012-345-4471', 11],
    ['Account name: PT Sinar Logistik', 11],
    ['Thank you for your business.', 9, 'F1', 14],
  ],
  info: {
    Title: 'Invoice SL/2026/1187',
    Producer: 'Microsoft Word for Microsoft 365',
    CreationDate: "D:20261118090000+07'00'",
    ModDate: "D:20261118090000+07'00'",
  },
});

writeFileSync(join(out, 'invoice-sinar-fishy.pdf'), fishy, 'latin1');
writeFileSync(join(out, 'invoice-sinar-clean.pdf'), clean, 'latin1');
console.log(`Wrote invoice-sinar-fishy.pdf and invoice-sinar-clean.pdf to ${out}`);
