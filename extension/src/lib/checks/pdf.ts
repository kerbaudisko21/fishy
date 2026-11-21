import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parsePdfDate, type PdfFacts } from './invoice';

/**
 * Reads an invoice PDF on the laptop with pdf.js: its text, edit dates, producer,
 * and which font the account number is set in. Nothing is uploaded.
 */
export async function readPdf(data: ArrayBuffer, accountDigits?: (text: string) => string | undefined): Promise<{ text: string; facts: PdfFacts }> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const { info } = (await doc.getMetadata()) as unknown as { info: Record<string, string | undefined> };

  const lines: string[] = [];
  const fontCount = new Map<string, number>();
  const items: Array<{ str: string; font: string }> = [];
  for (let p = 1; p <= Math.min(doc.numPages, 5); p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    let line = '';
    for (const it of content.items) {
      if (!('str' in it)) continue;
      items.push({ str: it.str, font: it.fontName });
      if (it.str.trim()) fontCount.set(it.fontName, (fontCount.get(it.fontName) ?? 0) + it.str.length);
      line += it.str;
      if (it.hasEOL) {
        lines.push(line);
        line = '';
      } else line += ' ';
    }
    if (line.trim()) lines.push(line);
  }
  await doc.destroy();

  const text = lines.map((l) => l.replace(/\s+/g, ' ').trim()).join('\n');
  const mainFont = [...fontCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const digits = accountDigits?.(text);
  const accountFont = digits ? items.find((i) => i.str.replace(/\D/g, '').includes(digits.slice(-4)))?.font : undefined;

  return {
    text,
    facts: {
      created: parsePdfDate(info.CreationDate),
      modified: parsePdfDate(info.ModDate),
      producer: [info.Producer, info.Creator].filter(Boolean).join(' · ') || undefined,
      accountFont,
      mainFont,
    },
  };
}
