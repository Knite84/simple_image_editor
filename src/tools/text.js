/**
 * Text Tool & Ops
 * Text always lives on its own layer with editable metadata (layer.meta).
 * Rasterizing strips the metadata, leaving plain pixels.
 */

import { registerOp } from '../ops.js';
import { createLayer, getActiveLayer, renderTextCanvas } from '../document.js';

function clampFontSize(value, fallback = 48) {
  return Math.max(8, Math.min(400, parseInt(value, 10) || fallback));
}

function buildTextLayer(doc, meta) {
  const { canvas, offsetX, offsetY } = renderTextCanvas(meta);
  const layer = createLayer(
    null,
    `Text: ${(meta.text || '').slice(0, 20) || 'Text'}`,
    canvas.width,
    canvas.height,
    null,
    Math.round(meta.anchorX + offsetX),
    Math.round(meta.anchorY + offsetY)
  );
  layer.meta = { ...meta };
  layer.canvas.getContext('2d', { willReadFrequently: true }).drawImage(canvas, 0, 0);
  return layer;
}

registerOp('add-text-layer', (doc, params) => {
  const meta = {
    kind: 'text',
    text: typeof params.text === 'string' ? params.text : 'Text',
    fontFace: params.fontFace || 'Arial',
    fontSize: clampFontSize(params.fontSize),
    color: params.color || '#000000',
    anchorX: Number.isFinite(params.x) ? Math.round(params.x) : Math.round(doc.width / 2),
    anchorY: Number.isFinite(params.y) ? Math.round(params.y) : Math.round(doc.height / 2)
  };

  const layer = buildTextLayer(doc, meta);
  doc.layers.push(layer);
  doc.activeLayerId = layer.id;

  return doc;
});

registerOp('update-text-layer', (doc, params) => {
  const layer = doc.layers.find(l => l.id === params.layerId) || getActiveLayer(doc);
  if (!layer || !layer.meta || layer.meta.kind !== 'text') return doc;

  if (typeof params.text === 'string') layer.meta.text = params.text;
  if (params.fontFace) layer.meta.fontFace = params.fontFace;
  if (params.fontSize) layer.meta.fontSize = clampFontSize(params.fontSize, layer.meta.fontSize);
  if (params.color) layer.meta.color = params.color;

  const { canvas, offsetX, offsetY } = renderTextCanvas(layer.meta);
  layer.canvas.width = canvas.width;
  layer.canvas.height = canvas.height;
  layer.canvas.getContext('2d', { willReadFrequently: true }).drawImage(canvas, 0, 0);
  layer.x = Math.round(layer.meta.anchorX + offsetX);
  layer.y = Math.round(layer.meta.anchorY + offsetY);

  return doc;
});

registerOp('rasterize-layer', (doc, params) => {
  const layer = doc.layers.find(l => l.id === params.layerId) || getActiveLayer(doc);
  if (!layer || !layer.meta || layer.meta.kind !== 'text') return doc;

  // Pixels are already rendered onto the layer canvas; drop editability
  delete layer.meta;
  layer.name = `${layer.name} (rasterized)`;

  return doc;
});
