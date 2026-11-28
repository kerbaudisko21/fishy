// Small helpers shared by the picture checks: a grid of blocks, its median, and the largest patch
// of flagged blocks that touch each other. Pure functions, so they run in tests without a canvas.

export interface Box {
  /** Left, top, right, bottom, as fractions of the picture (0–1). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Cluster {
  /** Blocks in the largest connected patch. */
  size: number;
  box: Box;
}

export function median(values: ArrayLike<number>): number {
  const sorted = Array.from(values).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function percentile(values: ArrayLike<number>, p: number): number {
  const sorted = Array.from(values).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))];
}

/** The largest 4-connected patch of `true` blocks in a cols × rows grid. */
export function largestCluster(flags: ArrayLike<boolean>, cols: number, rows: number): Cluster | null {
  const seen = new Uint8Array(cols * rows);
  let best: Cluster | null = null;
  for (let start = 0; start < cols * rows; start++) {
    if (!flags[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let size = 0;
    let cx0 = cols, cy0 = rows, cx1 = 0, cy1 = 0;
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % cols;
      const y = (i / cols) | 0;
      cx0 = Math.min(cx0, x); cy0 = Math.min(cy0, y); cx1 = Math.max(cx1, x); cy1 = Math.max(cy1, y);
      const next = [x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1, y > 0 ? i - cols : -1, y < rows - 1 ? i + cols : -1];
      for (const n of next) {
        if (n >= 0 && flags[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (!best || size > best.size) best = { size, box: { x0: cx0 / cols, y0: cy0 / rows, x1: (cx1 + 1) / cols, y1: (cy1 + 1) / rows } };
  }
  return best;
}

/** Where a box sits, in words a person can find: "top left", "centre", "bottom right". */
export function placeOf(box: Box): string {
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const v = cy < 0.34 ? 'top' : cy > 0.66 ? 'bottom' : '';
  const h = cx < 0.34 ? 'left' : cx > 0.66 ? 'right' : '';
  if (!v && !h) return 'centre';
  return [v, h].filter(Boolean).join(' ');
}
