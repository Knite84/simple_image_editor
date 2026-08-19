/**
 * Hue, Saturation & Lightness (HSL) Tool & Op
 */

import { registerOp } from '../ops.js';
import { getActiveLayer } from '../document.js';
import { getSelectionMask } from '../selection.js';

// RGB <-> HSL Math Helpers
export function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}

export function hslToRgb(h, s, l) {
  h = (h % 360) / 360;
  if (h < 0) h += 1;
  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Apply HSL adjustments to an ImageData buffer with optional selection mask weighting
 */
export function applyHslToImageData(imageData, maskData, deltaHue, deltaSat, deltaLight, bounds = null, docW = 0, docH = 0) {
  const data = imageData.data;
  const satMultiplier = (100 + deltaSat) / 100; // -100 to +100% -> 0.0 to 2.0
  const lightFactor = deltaLight / 100; // -100 to +100% -> -1.0 to 1.0

  const startX = bounds ? Math.max(0, bounds.x) : 0;
  const startY = bounds ? Math.max(0, bounds.y) : 0;
  const endX = bounds ? Math.min(docW || imageData.width, bounds.x + bounds.w) : imageData.width;
  const endY = bounds ? Math.min(docH || imageData.height, bounds.y + bounds.h) : imageData.height;

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const idx = (y * imageData.width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha === 0) continue;

      let weight = 1;
      if (maskData) {
        weight = maskData.data[idx + 3] / 255;
      }
      if (weight <= 0) continue;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const [origH, origS, origL] = rgbToHsl(r, g, b);

      // Apply deltas
      let newH = (origH + deltaHue) % 360;
      if (newH < 0) newH += 360;

      let newS = Math.max(0, Math.min(1, origS * satMultiplier));
      
      let newL = origL;
      if (lightFactor > 0) {
        newL = origL + (1 - origL) * lightFactor;
      } else if (lightFactor < 0) {
        newL = origL + origL * lightFactor;
      }
      newL = Math.max(0, Math.min(1, newL));

      const [adjR, adjG, adjB] = hslToRgb(newH, newS, newL);

      // Blend with original by mask weight
      data[idx] = Math.round(r + (adjR - r) * weight);
      data[idx + 1] = Math.round(g + (adjG - g) * weight);
      data[idx + 2] = Math.round(b + (adjB - b) * weight);
    }
  }
}

registerOp('hue-saturation', (doc, params) => {
  const activeLayer = getActiveLayer(doc);
  if (!activeLayer) return doc;

  const deltaHue = params.hue || 0;
  const deltaSat = params.saturation || 0;
  const deltaLight = params.lightness || 0;

  if (deltaHue === 0 && deltaSat === 0 && deltaLight === 0) {
    return doc;
  }

  const ctx = activeLayer.canvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, activeLayer.canvas.width, activeLayer.canvas.height);

  let maskData = null;
  let bounds = null;

  if (doc.selection) {
    const maskCanvas = getSelectionMask(doc.selection, doc.width, doc.height);
    maskData = maskCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, doc.width, doc.height);
    bounds = doc.selection.bounds;
  }

  applyHslToImageData(imgData, maskData, deltaHue, deltaSat, deltaLight, bounds, doc.width, doc.height);
  ctx.putImageData(imgData, 0, 0);

  return doc;
});
