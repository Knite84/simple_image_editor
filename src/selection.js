/**
 * Selection Data Model & Feathering Mask Helper
 * 
 * Selection:
 * {
 *   type: 'rect' | 'lasso',
 *   path: Path2D,
 *   bounds: { x, y, w, h },
 *   points?: [{x, y}],
 *   feather: number
 * }
 */

export function createRectSelection(x, y, w, h, feather = 0) {
  const normX = w < 0 ? x + w : x;
  const normY = h < 0 ? y + h : y;
  const normW = Math.abs(w);
  const normH = Math.abs(h);

  const path = new Path2D();
  path.rect(normX, normY, normW, normH);

  return {
    type: 'rect',
    path,
    bounds: { x: Math.round(normX), y: Math.round(normY), w: Math.round(normW), h: Math.round(normH) },
    feather: Math.max(0, feather || 0)
  };
}

export function createLassoSelection(points, feather = 0) {
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
    path,
    points: points.map(p => ({ x: p.x, y: p.y })),
    bounds: {
      x: Math.round(minX),
      y: Math.round(minY),
      w: Math.round(Math.max(1, maxX - minX)),
      h: Math.round(Math.max(1, maxY - minY))
    },
    feather: Math.max(0, feather || 0)
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
 * Generates an offscreen alpha mask canvas for a selection (with feathering)
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

  // Draw crisp mask
  ctx.fillStyle = '#ffffff';
  if (selection.type === 'rect') {
    const { x, y, w, h } = selection.bounds;
    ctx.fillRect(x, y, w, h);
  } else if (selection.path) {
    ctx.fill(selection.path);
  }

  if (selection.feather > 0) {
    const imgData = ctx.getImageData(0, 0, docWidth, docHeight);
    const data = imgData.data;
    const totalPixels = docWidth * docHeight;
    const alphaChannel = new Uint8ClampedArray(totalPixels);
    
    // Extract alpha (or red channel, since drawn white)
    for (let i = 0; i < totalPixels; i++) {
      alphaChannel[i] = data[i * 4 + 3];
    }

    const blurredAlpha = new Uint8ClampedArray(totalPixels);
    // 2 passes of box blur approximate gaussian blur closely
    boxBlur(alphaChannel, blurredAlpha, docWidth, docHeight, selection.feather);
    boxBlur(blurredAlpha, alphaChannel, docWidth, docHeight, selection.feather);

    // Put blurred alpha back
    for (let i = 0; i < totalPixels; i++) {
      const a = alphaChannel[i];
      data[i * 4] = 255;
      data[i * 4 + 1] = 255;
      data[i * 4 + 2] = 255;
      data[i * 4 + 3] = a;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  return maskCanvas;
}
