/**
 * Rotate Op
 * Rotates a single layer's pixels in 90° steps around its own center,
 * adjusting x/y so the layer's visual center stays fixed.
 */

import { registerOp } from '../ops.js';

function rotateCanvas90(sourceCanvas, direction) {
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  const rotated = document.createElement('canvas');
  rotated.width = sh;
  rotated.height = sw;
  const ctx = rotated.getContext('2d', { willReadFrequently: true });

  if (direction === 'ccw') {
    ctx.translate(0, sw);
    ctx.rotate(-Math.PI / 2);
  } else {
    ctx.translate(sh, 0);
    ctx.rotate(Math.PI / 2);
  }
  ctx.drawImage(sourceCanvas, 0, 0);

  return rotated;
}

registerOp('rotate-layer', (doc, params) => {
  const layer = doc.layers.find(l => l.id === (params.layerId || doc.activeLayerId));
  if (!layer) return doc;

  const direction = params.direction === 'ccw' ? 'ccw' : 'cw';
  const centerX = layer.x + layer.canvas.width / 2;
  const centerY = layer.y + layer.canvas.height / 2;

  layer.canvas = rotateCanvas90(layer.canvas, direction);
  layer.x = Math.round(centerX - layer.canvas.width / 2);
  layer.y = Math.round(centerY - layer.canvas.height / 2);

  return doc;
});
