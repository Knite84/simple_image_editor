/**
 * Clipboard Tool & Paste Layer Op
 */

import { registerOp } from '../ops.js';
import { createLayer } from '../document.js';

/**
 * Paste clipboard pixels as their own new layer.
 * params.canvas: source canvas holding the copied pixels
 * params.docX / params.docY: layer position in document coordinates
 */
registerOp('paste-clipboard-layer', (doc, params) => {
  if (!params || !params.canvas) return doc;

  const layer = createLayer(
    null,
    params.name || `Pasted Layer ${doc.layers.length + 1}`,
    params.canvas.width,
    params.canvas.height,
    params.canvas,
    params.docX || 0,
    params.docY || 0
  );

  doc.layers.push(layer);
  doc.activeLayerId = layer.id;
  // The copied region is now baked into its own layer, so drop the selection:
  // keeping it would make the Transform tool drag just the marching ants
  // (selection move) instead of the freshly pasted layer.
  doc.selection = null;
  return doc;
});
