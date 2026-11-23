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

/**
 * The first page as a PNG, drawn on the laptop, so Gemini can look at the document the way a person
 * does (a pasted logo, one line in another font). Takes a copy of the bytes: pdf.js may detach them.
 */
export async function renderFirstPage(data: ArrayBuffer, maxSide = 1400): Promise<Blob> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(3, maxSide / Math.max(base.width, base.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The page could not be drawn.'))), 'image/png'));
  } finally {
    await doc.destroy();
  }
}
