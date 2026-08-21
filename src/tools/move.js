/**
 * Move Tool & Op Handlers
 * Supports moving entire layers or moving selected regions within active layer (defaulting to transparency)
 */

import { registerOp } from '../ops.js';
import { getActiveLayer } from '../document.js';
import { getSelectionMask, translateSelection } from '../selection.js';

/**
 * Op: Move Layer
 */
registerOp('move-layer', (doc, params) => {
  const layer = doc.layers.find(l => l.id === (params.layerId || doc.activeLayerId));
  if (!layer) return doc;

  layer.x += Math.round(params.deltaX || 0);
  layer.y += Math.round(params.deltaY || 0);
  return doc;
});

/**
 * Op: Move Selection Content within Layer
 * Cuts the selected content leaving transparency, and composites it at the new offset
 */
registerOp('move-selection', (doc, params) => {
  const activeLayer = getActiveLayer(doc);
  if (!activeLayer || !doc.selection) return doc;

  const dx = Math.round(params.deltaX || 0);
  const dy = Math.round(params.deltaY || 0);

  if (dx === 0 && dy === 0) return doc;

  const sel = doc.selection;

  // 1. Generate mask of selection
  const maskCanvas = getSelectionMask(sel, doc.width, doc.height);
  const maskData = maskCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, doc.width, doc.height).data;

  // 2. Extract selected content to offscreen canvas
  const extractCanvas = document.createElement('canvas');
  extractCanvas.width = doc.width;
  extractCanvas.height = doc.height;
  const extractCtx = extractCanvas.getContext('2d', { willReadFrequently: true });

  const layerCtx = activeLayer.canvas.getContext('2d', { willReadFrequently: true });
  const layerImgData = layerCtx.getImageData(0, 0, activeLayer.canvas.width, activeLayer.canvas.height);
  const layerData = layerImgData.data;

  const extractedImgData = extractCtx.createImageData(doc.width, doc.height);
  const extractedData = extractedImgData.data;

  // Cut pixels from layer and copy into extracted buffer
  for (let y = 0; y < doc.height; y++) {
    for (let x = 0; x < doc.width; x++) {
      const idx = (y * doc.width + x) * 4;
      const maskA = maskData[idx + 3] / 255;
      if (maskA <= 0) continue;

      // Copy to extracted buffer with mask weighting
      extractedData[idx] = layerData[idx];
      extractedData[idx + 1] = layerData[idx + 1];
      extractedData[idx + 2] = layerData[idx + 2];
      extractedData[idx + 3] = Math.round(layerData[idx + 3] * maskA);

      // Leave transparency in source layer
      layerData[idx + 3] = Math.round(layerData[idx + 3] * (1 - maskA));
    }
  }

  // Put modified layer data back (source area is now transparent)
  layerCtx.putImageData(layerImgData, 0, 0);

  // Put extracted content onto extracted canvas
  extractCtx.putImageData(extractedImgData, 0, 0);

  // 3. Draw extracted content shifted by (dx, dy) onto active layer
  layerCtx.drawImage(extractCanvas, dx, dy);

  // 4. Update selection geometry (all parts) to new location
  doc.selection = translateSelection(sel, dx, dy);

  return doc;
});
