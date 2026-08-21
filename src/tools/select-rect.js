/**
 * Rectangular Selection Tool & Op
 */

import { createRectSelection, createLassoSelection } from '../selection.js';
import { registerOp } from '../ops.js';

/**
 * Register 'select-rect' op
 */
registerOp('select-rect', (doc, params) => {
  if (!params || !params.bounds) {
    doc.selection = null;
    return doc;
  }
  const { x, y, w, h } = params.bounds;
  const feather = params.feather || 0;
  doc.selection = createRectSelection(x, y, w, h, feather);
  return doc;
});

registerOp('clear-selection', (doc) => {
  doc.selection = null;
  return doc;
});

/**
 * Re-applies feathering to the existing selection without altering its geometry
 */
registerOp('set-selection-feather', (doc, params) => {
  const sel = doc.selection;
  if (!sel) return doc;

  const feather = Math.max(0, params.feather || 0);

  if (sel.type === 'rect') {
    const { x, y, w, h } = sel.bounds;
    doc.selection = createRectSelection(x, y, w, h, feather);
  } else if (sel.points && sel.points.length >= 3) {
    doc.selection = createLassoSelection(sel.points, feather);
  }

  return doc;
});

/**
 * Computes constrained dimensions given an aspect ratio string (e.g. "1:1", "3:2", "4:3", "16:9")
 */
export function calculateAspectRatioBounds(startX, startY, currentX, currentY, ratioStr) {
  let w = currentX - startX;
  let h = currentY - startY;

  if (!ratioStr || ratioStr === 'free') {
    return {
      x: w < 0 ? startX + w : startX,
      y: h < 0 ? startY + h : startY,
      w: Math.abs(w),
      h: Math.abs(h)
    };
  }

  const [rw, rh] = ratioStr.split(':').map(Number);
  if (!rw || !rh) {
    return {
      x: w < 0 ? startX + w : startX,
      y: h < 0 ? startY + h : startY,
      w: Math.abs(w),
      h: Math.abs(h)
    };
  }

  const targetRatio = rw / rh;
  const absW = Math.abs(w);
  const absH = Math.abs(h);

  let newW = absW;
  let newH = absH;

  // Decide driving axis
  if (absW / targetRatio >= absH) {
    newH = absW / targetRatio;
  } else {
    newW = absH * targetRatio;
  }

  const signX = w < 0 ? -1 : 1;
  const signY = h < 0 ? -1 : 1;

  const finalX = signX < 0 ? startX - newW : startX;
  const finalY = signY < 0 ? startY - newH : startY;

  return {
    x: Math.round(finalX),
    y: Math.round(finalY),
    w: Math.round(newW),
    h: Math.round(newH)
  };
}
