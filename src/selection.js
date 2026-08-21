/**
 * Selection Data Model & Feathering Mask Helper
 *
 * Selection:
 * {
 *   type: 'rect' | 'lasso' | 'composite',
 *   parts: [{ type, op: 'add' | 'subtract', path: Path2D, bounds, points? }],
 *   path: Path2D,            // combined outline of all parts (for stroke rendering)
 *   bounds: { x, y, w, h },  // union bounding box across all parts
 *   feather: number
 * }
 */

/**
 * Creates a rectangular selection part (defaults to additive)
 */
export function createRectPart(x, y, w, h, op = 'add') {
  const normX = w < 0 ? x + w : x;
  const normY = h < 0 ? y + h : y;
  const normW = Math.abs(w);
  const normH = Math.abs(h);

  const bounds = {
    x: Math.round(normX),
    y: Math.round(normY),
    w: Math.round(normW),
    h: Math.round(normH)
  };

  const path = new Path2D();
  path.rect(bounds.x, bounds.y, bounds.w, bounds.h);

  return { type: 'rect', op, path, bounds };
}

/**
 * Creates a freehand lasso selection part (defaults to additive)
 */
export function createLassoPart(points, op = 'add') {
  if (!points || points.length < 3) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const path = new Path2D();
  path.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) path.lineTo(p.x, p.y);
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  path.closePath();

  return {
    type: 'lasso',
    op,
    path,
    points: points.map(p => ({ x: p.x, y: p.y })),
    bounds: {
      x: Math.round(minX),
      y: Math.round(minY),
      w: Math.round(Math.max(1, maxX - minX)),
      h: Math.round(Math.max(1, maxY - minY))
    }
  };
}

/**
 * Normalizes any selection (multi-part or legacy single-shape) into a flat list of parts
 */
export function getSelectionParts(selection) {
  if (!selection) return [];

  if (Array.isArray(selection.parts) && selection.parts.length > 0) {
    return selection.parts.map(p => ({
      type: p.type,
      op: p.op === 'subtract' ? 'subtract' : 'add',
      path: p.path,
      bounds: { ...p.bounds },
      points: p.points ? p.points.map(pt => ({ x: pt.x, y: pt.y })) : undefined
    }));
  }

  // Legacy single-shape selections
  if (selection.type === 'rect') {
    return [createRectPart(selection.bounds.x, selection.bounds.y, selection.bounds.w, selection.bounds.h)];
  }
  if (selection.points && selection.points.length >= 3) {
    const part = createLassoPart(selection.points);
    if (part) return [part];
  }

  return [];
}

function computeUnionBounds(parts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const part of parts) {
    minX = Math.min(minX, part.bounds.x);
    minY = Math.min(minY, part.bounds.y);
    maxX = Math.max(maxX, part.bounds.x + part.bounds.w);
    maxY = Math.max(maxY, part.bounds.y + part.bounds.h);
  }

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function buildCombinedPath(parts) {
  const combined = new Path2D();
  for (const part of parts) combined.addPath(part.path);
  return combined;
}

/**
 * Builds a selection from an ordered list of parts.
 * Mask compositing applies parts in order: adds paint, subtracts erase.
 */
export function createCompositeSelection(parts, feather = 0) {
  const cleanParts = (parts || []).filter(Boolean);
  if (cleanParts.length === 0) return null;

  return {
    type: cleanParts.length === 1 ? cleanParts[0].type : 'composite',
    parts: cleanParts,
    path: buildCombinedPath(cleanParts),
    bounds: computeUnionBounds(cleanParts),
    feather: Math.max(0, feather || 0)
  };
}

export function createRectSelection(x, y, w, h, feather = 0) {
  return createCompositeSelection([createRectPart(x, y, w, h)], feather);
}

export function createLassoSelection(points, feather = 0) {
  return createCompositeSelection([createLassoPart(points)], feather);
}

/**
 * Combines a new shape part into an existing selection ('add' or 'subtract').
 * A missing existing selection starts a fresh one, so add/subtract degrade gracefully to new.
 */
export function combineSelection(existing, part, feather = 0) {
  const baseParts = getSelectionParts(existing);
  return createCompositeSelection(
    [...baseParts, part],
    feather != null ? feather : (existing ? existing.feather : 0)
  );
}

/**
 * Returns a copy of the selection with every part translated by (dx, dy)
 */
export function translateSelection(selection, dx, dy) {
  if (!selection) return null;

  const movedParts = getSelectionParts(selection)
    .map(part => {
      let rebuilt;
      if (part.type === 'rect') {
        rebuilt = createRectPart(part.bounds.x + dx, part.bounds.y + dy, part.bounds.w, part.bounds.h);
      } else {
        rebuilt = createLassoPart((part.points || []).map(p => ({ x: p.x + dx, y: p.y + dy })));
      }
      if (rebuilt) rebuilt.op = part.op;
      return rebuilt;
    })
    .filter(Boolean);

  return createCompositeSelection(movedParts, selection.feather);
}

/**
 * Returns selection bounds expanded by the feather spread so pixel operations
 * don't clip the outward feather gradient. The mask blur is two sequential
 * box-blur passes of radius r, so alpha spreads up to 2r beyond the geometric
 * bounds. Consumers still clamp these to document dimensions.
 */
export function getFeatheredBounds(selection) {
  const { x, y, w, h } = selection.bounds;
  const pad = Math.ceil((selection.feather || 0) * 2);
  return {
    x: x - pad,
    y: y - pad,
    w: w + pad * 2,
    h: h + pad * 2
  };
}

/**
 * Fast 1D Box Blur pass for deterministic cross-browser alpha mask feathering
 */
function boxBlurH(scl, tcl, w, h, r) {
  const arrSize = w * h;
  const iarr = 1 / (r + r + 1);
  for (let i = 0; i < h; i++) {
    let ti = i * w;
    let li = ti;
    let ri = ti + r;
    const fv = scl[ti];
    const lv = scl[ti + w - 1];
    let val = (r + 1) * fv;
    for (let j = 0; j < r; j++) val += scl[ti + j];
    for (let j = 0; j <= r; j++) {
      val += scl[ri++] - fv;
      tcl[ti++] = Math.round(val * iarr);
    }
    for (let j = r + 1; j < w - r; j++) {
      val += scl[ri++] - scl[li++];
      tcl[ti++] = Math.round(val * iarr);
    }
    for (let j = w - r; j < w; j++) {
      val += lv - scl[li++];
      tcl[ti++] = Math.round(val * iarr);
    }
  }
}

function boxBlurT(scl, tcl, w, h, r) {
  const iarr = 1 / (r + r + 1);
  for (let i = 0; i < w; i++) {
    let ti = i;
    let li = ti;
    let ri = ti + r * w;
    const fv = scl[ti];
    const lv = scl[ti + w * (h - 1)];
    let val = (r + 1) * fv;
    for (let j = 0; j < r; j++) val += scl[ti + j * w];
    for (let j = 0; j <= r; j++) {
      val += scl[ri] - fv;
      tcl[ti] = Math.round(val * iarr);
      ri += w;
      ti += w;
    }
    for (let j = r + 1; j < h - r; j++) {
      val += scl[ri] - scl[li];
      tcl[ti] = Math.round(val * iarr);
      li += w;
      ri += w;
      ti += w;
    }
    for (let j = h - r; j < h; j++) {
      val += lv - scl[li];
      tcl[ti] = Math.round(val * iarr);
      li += w;
      ti += w;
    }
  }
}

function boxBlur(sourceAlpha, targetAlpha, w, h, radius) {
  const r = Math.max(1, Math.round(radius));
  const temp = new Uint8ClampedArray(w * h);
  boxBlurH(sourceAlpha, temp, w, h, r);
  boxBlurT(temp, targetAlpha, w, h, r);
}

/**
 * Draws a single part's crisp silhouette onto a context
 */
function drawPartSilhouette(ctx, part) {
  ctx.fillStyle = '#ffffff';
  if (part.type === 'rect') {
    const { x, y, w, h } = part.bounds;
    ctx.fillRect(x, y, w, h);
  } else if (part.path) {
    ctx.fill(part.path);
  }
}

/**
 * Blurs a canvas' alpha channel in place (two box-blur passes approximating gaussian)
 */
function blurCanvasAlpha(ctx, width, height, radius) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const totalPixels = width * height;
  const alphaChannel = new Uint8ClampedArray(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    alphaChannel[i] = data[i * 4 + 3];
  }

  const blurredAlpha = new Uint8ClampedArray(totalPixels);
  boxBlur(alphaChannel, blurredAlpha, width, height, radius);
  boxBlur(blurredAlpha, alphaChannel, width, height, radius);

  for (let i = 0; i < totalPixels; i++) {
    data[i * 4] = 255;
    data[i * 4 + 1] = 255;
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = alphaChannel[i];
  }
  ctx.putImageData(imgData, 0, 0);
}

/**
 * Rasterizes the selection's effective geometry (adds painted, subtracts erased)
 * into a fresh doc-sized canvas. Ignores feathering.
 */
function rasterizeSelectionCrisp(selection, docWidth, docHeight) {
  const canvas = document.createElement('canvas');
  canvas.width = docWidth;
  canvas.height = docHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  for (const part of getSelectionParts(selection)) {
    ctx.globalCompositeOperation = part.op === 'subtract' ? 'destination-out' : 'source-over';
    drawPartSilhouette(ctx, part);
  }
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

/**
 * Traces the effective (combined) selection boundary as closed polylines using
 * marching squares on the rasterized mask, so additive/subtractive selections
 * render marching ants around the real merged region instead of each part's
 * raw outline.
 *
 * @returns {{path: Path2D, loops: number[][][], totalLength: number}|null}
 *   path is a single Path2D containing every closed loop; loops are raw point
 *   lists (for testing); totalLength is the summed perimeter in px.
 */
export function computeSelectionOutline(selection, docWidth, docHeight) {
  if (!selection || !docWidth || !docHeight) return null;

  // Limit work to the selection's vicinity (small pad for edge-touching shapes)
  const b = selection.bounds;
  const ox = Math.max(0, Math.floor(b.x) - 2);
  const oy = Math.max(0, Math.floor(b.y) - 2);
  const ow = Math.min(docWidth - ox, Math.ceil(b.x + b.w) - ox + 4);
  const oh = Math.min(docHeight - oy, Math.ceil(b.y + b.h) - oy + 4);
  if (ow <= 0 || oh <= 0) return null;

  const full = rasterizeSelectionCrisp(selection, docWidth, docHeight);
  const data = full.getContext('2d', { willReadFrequently: true })
    .getImageData(ox, oy, ow, oh).data;
  const inside = (x, y) => x >= 0 && y >= 0 && x < ow && y < oh && data[(y * ow + x) * 4 + 3] >= 128;

  // Edge-midpoint keys (coords are multiples of 0.5 -> scale x2 for ints)
  const K = (x, y) => (Math.round(x * 2) << 16) ^ Math.round(y * 2);

  // Marching squares: emit one segment per cell pairing its crossed edges
  const segs = [];
  const midT = (cx, cy) => [cx + 1, cy + 0.5];
  const midB = (cx, cy) => [cx + 1, cy + 1.5];
  const midL = (cx, cy) => [cx + 0.5, cy + 1];
  const midR = (cx, cy) => [cx + 1.5, cy + 1];

  for (let cy = -1; cy < oh; cy++) {
    for (let cx = -1; cx < ow; cx++) {
      const tl = inside(cx, cy) ? 1 : 0;
      const tr = inside(cx + 1, cy) ? 2 : 0;
      const br = inside(cx + 1, cy + 1) ? 4 : 0;
      const bl = inside(cx, cy + 1) ? 8 : 0;
      const code = tl | tr | br | bl;
      switch (code) {
        case 1: case 14: segs.push([midL(cx, cy), midT(cx, cy)]); break;
        case 2: case 13: segs.push([midT(cx, cy), midR(cx, cy)]); break;
        case 3: case 12: segs.push([midL(cx, cy), midR(cx, cy)]); break;
        case 4: case 11: segs.push([midR(cx, cy), midB(cx, cy)]); break;
        case 6: case 9: segs.push([midT(cx, cy), midB(cx, cy)]); break;
        case 7: case 8: segs.push([midB(cx, cy), midL(cx, cy)]); break;
        case 5: segs.push([midL(cx, cy), midT(cx, cy)], [midR(cx, cy), midB(cx, cy)]); break;
        case 10: segs.push([midT(cx, cy), midR(cx, cy)], [midB(cx, cy), midL(cx, cy)]); break;
        default: break;
      }
    }
  }

  if (segs.length === 0) return null;

  // Chain segments into closed loops (every vertex has global degree 2)
  const vertexMap = new Map();
  const adj = new Map();
  segs.forEach((seg, i) => {
    for (let end = 0; end < 2; end++) {
      const k = K(seg[end][0], seg[end][1]);
      if (!vertexMap.has(k)) vertexMap.set(k, seg[end]);
      if (!adj.has(k)) adj.set(k, []);
      adj.get(k).push(i);
    }
  });

  const used = new Array(segs.length).fill(false);
  const loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const loop = [segs[i][0], segs[i][1]];
    let guard = 0;
    while (guard++ < segs.length + 1) {
      const tipKey = K(loop[loop.length - 1][0], loop[loop.length - 1][1]);
      const candidates = adj.get(tipKey) || [];
      const nextIdx = candidates.find(s => !used[s]);
      if (nextIdx === undefined) break;
      used[nextIdx] = true;
      const [a, b2] = segs[nextIdx];
      const tip = loop[loop.length - 1];
      loop.push(K(a[0], a[1]) === tipKey ? b2 : a);
    }
    if (loop.length >= 3) loops.push(loop);
  }

  if (loops.length === 0) return null;

  const path = new Path2D();
  let totalLength = 0;
  for (const loop of loops) {
    path.moveTo(loop[0][0] + ox, loop[0][1] + oy);
    for (let p = 1; p < loop.length; p++) {
      path.lineTo(loop[p][0] + ox, loop[p][1] + oy);
      totalLength += Math.hypot(loop[p][0] - loop[p - 1][0], loop[p][1] - loop[p - 1][1]);
    }
    path.closePath();
    totalLength += Math.hypot(loop[0][0] - loop[loop.length - 1][0], loop[0][1] - loop[loop.length - 1][1]);
  }

  return { path, loops, totalLength };
}

/**
 * Generates an offscreen alpha mask canvas for a selection (with feathering)
 *
 * Each part is feathered individually, then composited in order
 * (adds paint, subtracts erase), so subtracted holes keep their own soft
 * edge instead of the whole-mask blur leaking alpha back into them.
 *
 * @param {Object} selection
 * @param {number} docWidth
 * @param {number} docHeight
 * @returns {HTMLCanvasElement} Mask canvas where alpha (0..255) represents selection weight
 */
export function getSelectionMask(selection, docWidth, docHeight) {
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = docWidth;
  maskCanvas.height = docHeight;
  const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });

  if (!selection) {
    // No selection = entire canvas is selected (100% white/opaque)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, docWidth, docHeight);
    return maskCanvas;
  }

  const parts = getSelectionParts(selection);
  if (parts.length === 0) return maskCanvas;

  const feather = selection.feather > 0 ? Math.round(selection.feather) : 0;

  if (feather <= 0) {
    // Crisp path: paint parts directly in order
    for (const part of parts) {
      ctx.globalCompositeOperation = part.op === 'subtract' ? 'destination-out' : 'source-over';
      drawPartSilhouette(ctx, part);
    }
    ctx.globalCompositeOperation = 'source-over';
    return maskCanvas;
  }

  // Feathered path: render & blur each part on its own layer first
  for (const part of parts) {
    const scratch = document.createElement('canvas');
    scratch.width = docWidth;
    scratch.height = docHeight;
    const scratchCtx = scratch.getContext('2d', { willReadFrequently: true });
    drawPartSilhouette(scratchCtx, part);
    blurCanvasAlpha(scratchCtx, docWidth, docHeight, feather);

    ctx.globalCompositeOperation = part.op === 'subtract' ? 'destination-out' : 'source-over';
    ctx.drawImage(scratch, 0, 0);
  }
  ctx.globalCompositeOperation = 'source-over';

  return maskCanvas;
}
