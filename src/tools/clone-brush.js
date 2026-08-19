/**
 * Clone Brush Tool & Op
 * Stamp-based sampling with radial soft gradient edge, interpolation for fast strokes, and aligned mode
 */

import { registerOp } from '../ops.js';
import { getActiveLayer } from '../document.js';

let brushMaskCache = new Map();

/**
 * Pre-renders radial soft gradient circular mask for performance
 */
export function getCircularBrushMask(size, hardness = 0.5) {
  const key = `${size}-${hardness}`;
  if (brushMaskCache.has(key)) {
    return brushMaskCache.get(key);
  }

  const radius = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(radius, radius, radius * hardness, radius, radius, radius);
  grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(radius, radius, radius, 0, Math.PI * 2);
  ctx.fill();

  brushMaskCache.set(key, canvas);
  return canvas;
}

/**
 * Applies a single circular soft clone stamp from source layer onto destination ctx
 */
export function applyStamp(destCtx, sourceCanvas, sourceX, sourceY, targetX, targetY, size, hardness = 0.5) {
  const radius = size / 2;
  const sx = sourceX - radius;
  const sy = sourceY - radius;
  const dx = targetX - radius;
  const dy = targetY - radius;

  // Offscreen stamp buffer
  const stampCanvas = document.createElement('canvas');
  stampCanvas.width = size;
  stampCanvas.height = size;
  const stampCtx = stampCanvas.getContext('2d');

  // Draw source pixels
  stampCtx.drawImage(sourceCanvas, sx, sy, size, size, 0, 0, size, size);

  // Mask with soft radial gradient using destination-in
  stampCtx.globalCompositeOperation = 'destination-in';
  const mask = getCircularBrushMask(size, hardness);
  stampCtx.drawImage(mask, 0, 0);

  // Draw onto active layer
  destCtx.drawImage(stampCanvas, dx, dy);
}

/**
 * Interpolates points along a line to prevent gaps when mouse moves rapidly
 */
export function interpolateStroke(x0, y0, x1, y1, spacing, callback) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) {
    callback(x0, y0);
    return;
  }

  const steps = Math.max(1, Math.ceil(dist / spacing));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    callback(x0 + dx * t, y0 + dy * t);
  }
}

/**
 * Apply full clone brush stroke op
 */
registerOp('clone-stroke', (doc, params) => {
  const activeLayer = getActiveLayer(doc);
  if (!activeLayer || !params.stamps || params.stamps.length === 0) return doc;

  const size = params.size || 40;
  const hardness = params.hardness || 0.4;
  const sourceOffset = params.sourceOffset || { x: 0, y: 0 };

  // Sample from snapshot of active layer before stroke
  const sourceSnapshot = document.createElement('canvas');
  sourceSnapshot.width = activeLayer.canvas.width;
  sourceSnapshot.height = activeLayer.canvas.height;
  sourceSnapshot.getContext('2d').drawImage(activeLayer.canvas, 0, 0);

  const destCtx = activeLayer.canvas.getContext('2d', { willReadFrequently: true });

  for (const stamp of params.stamps) {
    const targetX = stamp.x;
    const targetY = stamp.y;
    const sourceX = targetX + sourceOffset.x;
    const sourceY = targetY + sourceOffset.y;

    applyStamp(destCtx, sourceSnapshot, sourceX, sourceY, targetX, targetY, size, hardness);
  }

  return doc;
});
