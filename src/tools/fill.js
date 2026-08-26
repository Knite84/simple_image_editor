/**
 * Fill (Paint Bucket) Tool & Op
 * Contiguous flood fill from a clicked pixel, blended at an opacity,
 * clipped to the current selection when one exists.
 */

import { registerOp } from '../ops.js';
import { getActiveLayer } from '../document.js';
import { getSelectionMask } from '../selection.js';

function parseHexColor(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

/**
 * Scanline flood fill. Mutates `data` (RGBA, length w*h*4) in place,
 * replacing matched pixels with fillColor at full strength.
 * A pixel joins the region when its RGBA distance from the SEED color
 * (captured before any writes) is within tolerance (0..1, where 1 matches all).
 * @returns {boolean} true if any pixel was written
 */
export function floodFillScanline(data, w, h, sx, sy, fillColor, tolerance) {
  const idx0 = (sy * w + sx) * 4;
  const tr = data[idx0];
  const tg = data[idx0 + 1];
  const tb = data[idx0 + 2];
  const ta = data[idx0 + 3];
  const tolDist = Math.max(0, Math.min(1, tolerance)) * 510;

  const matches = (px) => {
    const i = px * 4;
    const dr = data[i] - tr;
    const dg = data[i + 1] - tg;
    const db = data[i + 2] - tb;
    const da = data[i + 3] - ta;
    return Math.sqrt(dr * dr + dg * dg + db * db + da * da) <= tolDist;
  };

  const visited = new Uint8Array(w * h);
  const stack = [[sx, sy]];
  let wrote = false;

  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    if (visited[cy * w + cx]) continue;

    // Expand the span left/right along this row
    let x0 = cx;
    while (x0 > 0 && !visited[cy * w + (x0 - 1)] && matches(cy * w + (x0 - 1))) x0--;
    let x1 = cx;
    while (x1 < w - 1 && !visited[cy * w + (x1 + 1)] && matches(cy * w + (x1 + 1))) x1++;

    for (let xi = x0; xi <= x1; xi++) {
      const ii = cy * w + xi;
      visited[ii] = 1;
      const i4 = ii * 4;
      data[i4] = fillColor.r;
      data[i4 + 1] = fillColor.g;
      data[i4 + 2] = fillColor.b;
      data[i4 + 3] = 255;
      wrote = true;

      if (cy > 0 && !visited[ii - w] && matches(ii - w)) stack.push([xi, cy - 1]);
      if (cy < h - 1 && !visited[ii + w] && matches(ii + w)) stack.push([xi, cy + 1]);
    }
  }

  return wrote;
}

registerOp('fill', (doc, params) => {
  const layer = getActiveLayer(doc);
  if (!layer) return doc;

  const lw = layer.canvas.width;
  const lh = layer.canvas.height;
  const lx = Math.round(params.x) - layer.x;
  const ly = Math.round(params.y) - layer.y;
  if (lx < 0 || ly < 0 || lx >= lw || ly >= lh) return doc;

  const fillColor = parseHexColor(params.color || '#000000');
  const opacity = Math.max(0, Math.min(1, typeof params.opacity === 'number' ? params.opacity : 1));
  const tolerance = Math.max(0, Math.min(1, typeof params.tolerance === 'number' ? params.tolerance : 0.25));

  // Selection mask translated into layer space; the seed must be inside it
  let maskData = null;
  if (doc.selection) {
    const docMask = getSelectionMask(doc.selection, doc.width, doc.height);
    const tmp = document.createElement('canvas');
    tmp.width = lw;
    tmp.height = lh;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(docMask, -layer.x, -layer.y);
    maskData = tctx.getImageData(0, 0, lw, lh).data;
    if (maskData[(ly * lw + lx) * 4 + 3] / 255 <= 0) return doc;
  }

  const ctx = layer.canvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, lw, lh);

  // Run the fill at full strength on a copy, then blend copy -> original
  // with per-pixel effective opacity (uniform, scaled by feather weights)
  const filled = new Uint8ClampedArray(imgData.data);
  floodFillScanline(filled, lw, lh, lx, ly, fillColor, tolerance);

  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const wgt = maskData ? maskData[i + 3] / 255 : 1;
    if (wgt <= 0) continue;
    const a = opacity * wgt;
    d[i] += (filled[i] - d[i]) * a;
    d[i + 1] += (filled[i + 1] - d[i + 1]) * a;
    d[i + 2] += (filled[i + 2] - d[i + 2]) * a;
    d[i + 3] += (filled[i + 3] - d[i + 3]) * a;
  }

  ctx.putImageData(imgData, 0, 0);
  return doc;
});
