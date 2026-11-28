/*
 * Where each sign is: Gemini answers with a box on a 0–1000 scale, [ymin, xmin, ymax, xmax]
 * (the convention Gemini is trained on). FISHY turns it into fractions of the picture, and for a
 * sheet of video frames, works out which frame the box is in and where inside that frame.
 */

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A model's box, checked: four numbers in 0–1000, in order, not a sliver. Null otherwise. */
export function parseBox(v: unknown): Box | null {
  if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const [ymin, xmin, ymax, xmax] = (v as number[]).map((n) => Math.max(0, Math.min(1000, n)) / 1000);
  if (xmax - xmin < 0.01 || ymax - ymin < 0.01) return null;
  return { x0: xmin, y0: ymin, x1: xmax, y1: ymax };
}

/**
 * A box on the numbered sheet of `count` frames (laid out `cols` across) → the frame it is in
 * (0-based) and the box inside that frame. The frame is the one holding the box's centre.
 */
export function boxOnSheet(box: Box, count: number, cols = 3): { frame: number; box: Box } | null {
  const across = Math.min(cols, count);
  const rows = Math.ceil(count / cols);
  const cw = 1 / across;
  const ch = 1 / rows;
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const col = Math.min(across - 1, Math.floor(cx / cw));
  const row = Math.min(rows - 1, Math.floor(cy / ch));
  const frame = row * cols + col;
  if (frame >= count) return null;
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  return {
    frame,
    box: { x0: clamp((box.x0 - col * cw) / cw), y0: clamp((box.y0 - row * ch) / ch), x1: clamp((box.x1 - col * cw) / cw), y1: clamp((box.y1 - row * ch) / ch) },
  };
}
