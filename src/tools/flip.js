/**
 * Flip Op
 * Mirrors a single layer's pixels in place.
 * axis 'x' mirrors across the vertical axis (left/right),
 * axis 'y' mirrors across the horizontal axis (top/bottom).
 * The layer's x/y position is unchanged since canvas size stays the same.
 */

import { registerOp } from '../ops.js';

function flipCanvas(sourceCanvas, axis) {
  const flipped = document.createElement('canvas');
  flipped.width = sourceCanvas.width;
  flipped.height = sourceCanvas.height;
  const ctx = flipped.getContext('2d', { willReadFrequently: true });

  if (axis === 'y') {
    ctx.translate(0, sourceCanvas.height);
    ctx.scale(1, -1);
  } else {
    ctx.translate(sourceCanvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(sourceCanvas, 0, 0);

  return flipped;
}

registerOp('flip-layer', (doc, params) => {
  const layer = doc.layers.find(l => l.id === (params.layerId || doc.activeLayerId));
  if (!layer) return doc;

  layer.canvas = flipCanvas(layer.canvas, params.axis === 'y' ? 'y' : 'x');

  return doc;
});
