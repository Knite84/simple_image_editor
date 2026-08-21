/**
 * Delete / Fill Tool & Op
 * Deletes selection or fills with solid color using mask weighting for feathered edges
 */

import { registerOp } from '../ops.js';
import { getActiveLayer } from '../document.js';
import { getSelectionMask, getFeatheredBounds } from '../selection.js';

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

registerOp('delete', (doc, params) => {
  const activeLayer = getActiveLayer(doc);
  if (!activeLayer || !doc.selection) return doc;

  const mode = params.mode || 'transparent'; // 'transparent' | 'color'
  const fillColor = params.color ? parseHexColor(params.color) : { r: 255, g: 255, b: 255 };

  const maskCanvas = getSelectionMask(doc.selection, doc.width, doc.height);
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
  const maskData = maskCtx.getImageData(0, 0, doc.width, doc.height).data;

  const layerCtx = activeLayer.canvas.getContext('2d', { willReadFrequently: true });
  const layerImgData = layerCtx.getImageData(0, 0, activeLayer.canvas.width, activeLayer.canvas.height);
  const layerData = layerImgData.data;

  const bounds = getFeatheredBounds(doc.selection);
  const startX = Math.max(0, bounds.x);
  const startY = Math.max(0, bounds.y);
  const endX = Math.min(doc.width, bounds.x + bounds.w);
  const endY = Math.min(doc.height, bounds.y + bounds.h);

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const idx = (y * doc.width + x) * 4;
      const maskAlpha = maskData[idx + 3] / 255;
      if (maskAlpha <= 0) continue;

      if (mode === 'transparent') {
        layerData[idx + 3] = Math.round(layerData[idx + 3] * (1 - maskAlpha));
      } else {
        // Solid color fill blended by mask alpha
        const currentR = layerData[idx];
        const currentG = layerData[idx + 1];
        const currentB = layerData[idx + 2];
        const currentA = layerData[idx + 3];

        layerData[idx] = Math.round(currentR + (fillColor.r - currentR) * maskAlpha);
        layerData[idx + 1] = Math.round(currentG + (fillColor.g - currentG) * maskAlpha);
        layerData[idx + 2] = Math.round(currentB + (fillColor.b - currentB) * maskAlpha);
        layerData[idx + 3] = Math.round(currentA + (255 - currentA) * maskAlpha);
      }
    }
  }

  layerCtx.putImageData(layerImgData, 0, 0);
  return doc;
});
