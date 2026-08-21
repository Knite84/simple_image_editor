/**
 * Resize Tool & Op
 * Scales document and all layers using step-down downsampling for high visual fidelity
 */

import { registerOp } from '../ops.js';

/**
 * Step-down halving helper to downsample with high quality and avoid aliasing
 */
function scaleCanvasWithStepDown(sourceCanvas, targetW, targetH) {
  let currentW = sourceCanvas.width;
  let currentH = sourceCanvas.height;
  let currentCanvas = sourceCanvas;

  // Step-down halve while current dimensions are > 2x target
  while (currentW * 0.5 >= targetW && currentH * 0.5 >= targetH) {
    const halfW = Math.max(targetW, Math.floor(currentW * 0.5));
    const halfH = Math.max(targetH, Math.floor(currentH * 0.5));

    const stepCanvas = document.createElement('canvas');
    stepCanvas.width = halfW;
    stepCanvas.height = halfH;
    const stepCtx = stepCanvas.getContext('2d', { willReadFrequently: true });
    stepCtx.imageSmoothingEnabled = true;
    stepCtx.imageSmoothingQuality = 'high';
    stepCtx.drawImage(currentCanvas, 0, 0, halfW, halfH);

    currentCanvas = stepCanvas;
    currentW = halfW;
    currentH = halfH;
  }

  // Final draw to exact target dimensions
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = targetW;
  finalCanvas.height = targetH;
  const finalCtx = finalCanvas.getContext('2d', { willReadFrequently: true });
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';
  finalCtx.drawImage(currentCanvas, 0, 0, targetW, targetH);

  return finalCanvas;
}

registerOp('resize', (doc, params) => {
  const targetW = Math.max(1, Math.round(params.width || doc.width));
  const targetH = Math.max(1, Math.round(params.height || doc.height));

  if (targetW === doc.width && targetH === doc.height) {
    return doc;
  }

  const scaleRatioX = targetW / doc.width;
  const scaleRatioY = targetH / doc.height;

  for (const layer of doc.layers) {
    const layerTargetW = Math.max(1, Math.round(layer.canvas.width * scaleRatioX));
    const layerTargetH = Math.max(1, Math.round(layer.canvas.height * scaleRatioY));

    layer.canvas = scaleCanvasWithStepDown(layer.canvas, layerTargetW, layerTargetH);
    layer.x = Math.round(layer.x * scaleRatioX);
    layer.y = Math.round(layer.y * scaleRatioY);
  }

  doc.width = targetW;
  doc.height = targetH;
  doc.selection = null;

  return doc;
});

/**
 * Op: Transform Layer
 * Scales a single layer's canvas. Anchors the result at the layer's center
 * unless explicit x/y coordinates are provided (used by interactive handles).
 */
registerOp('transform-layer', (doc, params) => {
  const layer = doc.layers.find(l => l.id === (params.layerId || doc.activeLayerId));
  if (!layer) return doc;

  const targetW = Math.max(1, Math.round(params.width || layer.canvas.width));
  const targetH = Math.max(1, Math.round(params.height || layer.canvas.height));

  let newX, newY;
  if (Number.isFinite(params.x) && Number.isFinite(params.y)) {
    newX = Math.round(params.x);
    newY = Math.round(params.y);
  } else {
    // Center anchor: keep the layer's visual center fixed
    newX = Math.round(layer.x + (layer.canvas.width - targetW) / 2);
    newY = Math.round(layer.y + (layer.canvas.height - targetH) / 2);
  }

  if (targetW !== layer.canvas.width || targetH !== layer.canvas.height) {
    layer.canvas = scaleCanvasWithStepDown(layer.canvas, targetW, targetH);
  }
  layer.x = newX;
  layer.y = newY;

  return doc;
});
