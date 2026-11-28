import type { CheckItem, ForensicHint, MediaForensics } from '../types';
import { readJpeg } from './jpeg';
import { elaFromPixels, gridPatternFromPixels, heatPixels, noiseFromPixels } from './picture-math';
import { fft } from './voice-math';

/*
 * The laptop's own look at a picture's pixels and structure, before any AI. Nothing leaves the
 * laptop. Each finding is a hint for a person to look at, never a verdict on its own.
 */

export interface PictureLab extends MediaForensics {
  /** For Gemini: what was measured, in a short paragraph. */
  measured: string;
}

const MAX_PIXELS = 16_000_000;
const RESAVE_QUALITY = 0.9;

function pixelsOf(source: CanvasImageSource, w: number, h: number) {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  return { canvas, data: ctx.getImageData(0, 0, w, h).data };
}

/** How different the EXIF thumbnail is from the picture, 0–255 (greyscale mean difference). */
async function thumbnailDifference(thumb: Uint8Array, bitmap: ImageBitmap): Promise<{ diff: number; aspect: number } | null> {
  try {
    const t = await createImageBitmap(new Blob([thumb.slice()], { type: 'image/jpeg' }));
    const w = t.width;
    const h = t.height;
    const a = pixelsOf(t, w, h).data;
    const b = pixelsOf(bitmap, w, h).data;
    t.close();
    let sum = 0;
    for (let i = 0; i < a.length; i += 4) sum += Math.abs((a[i] + a[i + 1] + a[i + 2]) / 3 - (b[i] + b[i + 1] + b[i + 2]) / 3);
    const aspect = Math.abs(w / h - bitmap.width / bitmap.height) / (bitmap.width / bitmap.height);
    return { diff: sum / (w * h), aspect };
  } catch {
    return null;
  }
}

export async function analysePicture(blob: Blob, bytes: Uint8Array, camera?: string): Promise<PictureLab> {
  const hints: ForensicHint[] = [];
  const rows: CheckItem[] = [];
  const measured: string[] = [];
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    return { hints, rows: [{ ok: true, title: 'Pixel checks', detail: 'This browser can’t run them.' }], measured: '' };
  }
  const jpeg = readJpeg(bytes);
  const bitmap = await createImageBitmap(blob);
  try {
    // A scaled copy would hide the traces these checks look for, so only huge pictures are scaled.
    const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (bitmap.width * bitmap.height)));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const { canvas, data } = pixelsOf(bitmap, w, h);

    // 1. How it was saved: the encoder's tables, and the camera's own preview.
    if (jpeg?.quality) {
      const how = jpeg.standardTables ? `standard software tables at quality ${jpeg.quality}` : `its own tables (about quality ${jpeg.quality}), as cameras use`;
      measured.push(`JPEG saved with ${how}.`);
      if (camera && jpeg.standardTables) {
        hints.push({ id: 'resaved', strength: 1, text: `The file names a camera (${camera}), but it was last saved by software, not the camera.` });
        rows.push({ ok: false, title: 'Saved again after the camera', detail: `Names ${camera}, but carries standard software tables (quality ${jpeg.quality})` });
      } else {
        rows.push({ ok: true, title: 'How it was saved', detail: jpeg.standardTables ? `By software, quality ${jpeg.quality}. Normal for pictures from chat apps and the web.` : `With a camera’s own tables, about quality ${jpeg.quality}` });
      }
    }
    if (jpeg?.thumbnail) {
      const t = await thumbnailDifference(jpeg.thumbnail, bitmap);
      if (t) {
        measured.push(`EXIF preview differs from the picture by ${t.diff.toFixed(1)}/255${t.aspect > 0.05 ? `, different shape (${Math.round(t.aspect * 100)}%)` : ''}.`);
        if (t.diff > 18 || t.aspect > 0.05) {
          hints.push({ id: 'thumbnail', strength: 2, text: 'The small preview the camera stored no longer matches the picture: it was changed or cropped after it was taken.' });
          rows.push({ ok: false, title: 'Camera preview doesn’t match', detail: t.aspect > 0.05 ? 'The preview has a different shape: the picture was cropped' : 'The preview shows something different from the picture' });
        } else {
          rows.push({ ok: true, title: 'Camera preview matches', detail: 'A match doesn’t prove the picture is real; editors can rewrite it' });
        }
      }
    }

    // 2. The grain. Shown, not scored: tested on clean and forged pictures, text and sharp edges
    //    made it flag clean pictures as often as forged ones.
    const noise = noiseFromPixels(data, w, h);
    rows.push({
      ok: true,
      title: 'Grain',
      detail: noise.patch ? `The ${noise.patch.place} is ${noise.patch.kind} than the rest. Worth a look, but text and sharp edges do this too, so it isn’t scored.` : 'Even across the picture',
    });

    // 3. Re-save (ELA), JPEG only. 4. The grid pattern of AI generators, not for JPEG.
    let heatmap: string | undefined;
    const isJpeg = !!jpeg;
    if (isJpeg && scale === 1) {
      // 3. Re-save (ELA).
      const resavedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: RESAVE_QUALITY });
      const resavedBitmap = await createImageBitmap(resavedBlob);
      const resaved = pixelsOf(resavedBitmap, w, h).data;
      resavedBitmap.close();
      // Shown as a heat map for a person to look at, not scored: in testing, text and sharp edges
      // lit up on clean pictures as often as a pasted-in part did on forged ones.
      const { map, patch } = elaFromPixels(data, resaved, w, h);
      const heat = new OffscreenCanvas(w, h);
      heat.getContext('2d')!.putImageData(new ImageData(heatPixels(map, w, h) as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
      heatmap = URL.createObjectURL(await heat.convertToBlob({ type: 'image/png' }));
      rows.push({
        ok: true,
        title: 'Re-save heat map',
        detail: patch ? `Brightest in the ${patch.place}. Look there for a pasted-in part; text and edges light up too, so FISHY doesn’t score it.` : 'No part stands out. Shown for you to look at; not scored.',
      });
    } else if (!isJpeg) {
      const grid = gridPatternFromPixels(data, w, h, fft);
      if (grid) {
        measured.push(`Grid pattern check: ${grid.peaks} of 6 grid frequencies stand out (strongest ${grid.ratio.toFixed(1)}×).`);
        if (grid.peaks >= 2) {
          hints.push({ id: 'grid', strength: 2, text: 'The fine grain hides a repeating grid pattern that AI image generators often leave.' });
          rows.push({ ok: false, title: 'Hidden grid pattern', detail: `${grid.peaks} grid frequencies stand out, up to ${grid.ratio.toFixed(0)}×` });
        } else {
          rows.push({ ok: true, title: 'No grid pattern', detail: 'Its absence proves nothing: resizing and compression remove it' });
        }
      }
    }
    return { hints, rows, heatmap, measured: measured.join(' ') };
  } finally {
    bitmap.close();
  }
}
