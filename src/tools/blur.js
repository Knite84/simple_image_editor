/**
 * Blur Tool & Op
 * Gaussian-style blur (via canvas filter) applied to the active layer,
 * clipped to the current selection when one exists.
 */

import { registerOp } from '../ops.js';
import { getActiveLayer } from '../document.js';
import { getLayerHslTargets } from './hue-saturation.js';

/**
 * Blurs a region of a layer in place.
 * @param {Object} layer - target layer
 * @param {number} radius - blur radius in px
 * @param {number} strength - 0..1 blend between original and blurred
 * @param {ImageData|null} maskData - layer-space selection mask (alpha carries weight)
 * @param {{x:number,y:number,w:number,h:number}} bounds - layer-local region to process
 */
export function blurLayerRegion(layer, radius, strength, maskData, bounds) {
  const bx = Math.round(bounds.x);
  const by = Math.round(bounds.y);
  const bw = Math.round(bounds.w);
  const bh = Math.round(bounds.h);
  if (bw <= 0 || bh <= 0 || radius <= 0 || strength <= 0) return;

  // Source crop of the layer
  const src = document.createElement('canvas');
  src.width = bw;
  src.height = bh;
  const srcCtx = src.getContext('2d', { willReadFrequently: true });
  srcCtx.drawImage(layer.canvas, -bx, -by);

  // Blurred copy (GPU-accelerated canvas filter)
  const blurred = document.createElement('canvas');
  blurred.width = bw;
  blurred.height = bh;
  const blurCtx = blurred.getContext('2d', { willReadFrequently: true });
  blurCtx.filter = `blur(${radius}px)`;
  blurCtx.drawImage(src, 0, 0);
  blurCtx.filter = 'none';

  // Blend original -> blurred by strength
  const mix = document.createElement('canvas');
  mix.width = bw;
  mix.height = bh;
  const mixCtx = mix.getContext('2d', { willReadFrequently: true });
  mixCtx.drawImage(src, 0, 0);
  mixCtx.globalAlpha = Math.max(0, Math.min(1, strength));
  mixCtx.drawImage(blurred, 0, 0);
  mixCtx.globalAlpha = 1;

  // Clip the blended result to the selection mask (soft feather weights preserved)
  if (maskData) {
    const maskCrop = document.createElement('canvas');
    maskCrop.width = bw;
    maskCrop.height = bh;
    const mcCtx = maskCrop.getContext('2d', { willReadFrequently: true });
    mcCtx.putImageData(maskData, -bx, -by);
    mixCtx.globalCompositeOperation = 'destination-in';
    mixCtx.drawImage(maskCrop, 0, 0);
    mixCtx.globalCompositeOperation = 'source-over';
  }

  const layerCtx = layer.canvas.getContext('2d', { willReadFrequently: true });
  layerCtx.drawImage(mix, bx, by);
}

registerOp('blur', (doc, params) => {
  const layer = getActiveLayer(doc);
  if (!layer) return doc;

  const radius = Math.max(1, Math.round(params.radius || 1));
  const strength = Math.max(0, Math.min(1, typeof params.strength === 'number' ? params.strength : 1));

  const { maskData, bounds } = getLayerHslTargets(doc, layer);
  blurLayerRegion(layer, radius, strength, maskData, bounds);

  return doc;
});
