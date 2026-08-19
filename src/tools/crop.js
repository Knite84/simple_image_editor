/**
 * Crop Tool & Op
 * Crops the document and all layers to the selection bounds (or provided bounds rect)
 */

import { registerOp } from '../ops.js';

registerOp('crop', (doc, params) => {
  let bounds = params.bounds;
  
  if (!bounds && doc.selection) {
    bounds = doc.selection.bounds;
  }

  if (!bounds || bounds.w <= 0 || bounds.h <= 0) {
    return doc;
  }

  const cropX = Math.max(0, Math.round(bounds.x));
  const cropY = Math.max(0, Math.round(bounds.y));
  const cropW = Math.max(1, Math.min(doc.width - cropX, Math.round(bounds.w)));
  const cropH = Math.max(1, Math.min(doc.height - cropY, Math.round(bounds.h)));

  // Redraw each layer cropped to the new dimensions
  for (const layer of doc.layers) {
    const newCanvas = document.createElement('canvas');
    newCanvas.width = cropW;
    newCanvas.height = cropH;
    const ctx = newCanvas.getContext('2d', { willReadFrequently: true });

    // Draw previous layer shifted by -cropX, -cropY
    ctx.drawImage(layer.canvas, layer.x - cropX, layer.y - cropY);

    layer.canvas = newCanvas;
    layer.x = 0;
    layer.y = 0;
  }

  doc.width = cropW;
  doc.height = cropH;
  doc.selection = null; // Clear selection after crop

  return doc;
});
