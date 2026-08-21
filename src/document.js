/**
 * Document & Layer Data Model and Compositor
 * 
 * Model:
 * Document: { id, name, width, height, layers: Layer[], activeLayerId, selection, history }
 * Layer: { id, name, canvas: HTMLCanvasElement, visible: boolean, opacity: number, x: number, y: number }
 */

export function createLayer(id, name, width, height, initialCanvasOrImage = null, x = 0, y = 0, opacity = 1, visible = true) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  
  if (initialCanvasOrImage) {
    ctx.drawImage(initialCanvasOrImage, 0, 0, canvas.width, canvas.height);
  }

  return {
    id: id || `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: name || 'Layer',
    canvas,
    visible: visible !== false,
    opacity: typeof opacity === 'number' ? Math.max(0, Math.min(1, opacity)) : 1,
    x: x || 0,
    y: y || 0
  };
}

export function cloneLayer(layer) {
  const newCanvas = document.createElement('canvas');
  newCanvas.width = layer.canvas.width;
  newCanvas.height = layer.canvas.height;
  const ctx = newCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(layer.canvas, 0, 0);

  return {
    id: layer.id,
    name: layer.name,
    canvas: newCanvas,
    visible: layer.visible,
    opacity: layer.opacity,
    x: layer.x,
    y: layer.y
  };
}

export function createDocument(name = 'Untitled', width = 800, height = 600) {
  const baseLayer = createLayer('layer-bg', 'Background', width, height);
  // Fill initial background white
  const ctx = baseLayer.canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  return {
    id: `doc-${Date.now()}`,
    name,
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    layers: [baseLayer],
    activeLayerId: baseLayer.id,
    selection: null
  };
}

export function createDocumentFromImage(imageElement, name = 'Image') {
  const width = imageElement.naturalWidth || imageElement.width || 800;
  const height = imageElement.naturalHeight || imageElement.height || 600;
  const baseLayer = createLayer('layer-1', 'Background', width, height, imageElement);

  return {
    id: `doc-${Date.now()}`,
    name,
    width,
    height,
    layers: [baseLayer],
    activeLayerId: baseLayer.id,
    selection: null
  };
}

export function cloneDocument(doc) {
  return {
    id: doc.id,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    layers: doc.layers.map(cloneLayer),
    activeLayerId: doc.activeLayerId,
    selection: doc.selection ? {
      type: doc.selection.type,
      path: doc.selection.path,
      bounds: { ...doc.selection.bounds },
      points: doc.selection.points ? doc.selection.points.map(p => ({ ...p })) : null,
      feather: doc.selection.feather || 0
    } : null
  };
}

export function getActiveLayer(doc) {
  return doc.layers.find(l => l.id === doc.activeLayerId) || doc.layers[0] || null;
}

/**
 * Pure compositor: loops visible layers bottom-to-top and draws onto a fresh canvas.
 * @param {Object} doc - Document instance
 * @param {Map|null} layerOverrides - Optional Map of layerId -> {x, y, w, h} used to
 *        draw a layer scaled/repositioned (e.g. live transform preview) without
 *        mutating its real pixels.
 * @param {string|null} excludeLayerId - Optional layer id to omit from the composite
 * @returns {HTMLCanvasElement} Composite canvas
 */
export function renderComposite(doc, layerOverrides = null, excludeLayerId = null) {
  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = Math.max(1, doc.width);
  compositeCanvas.height = Math.max(1, doc.height);
  const ctx = compositeCanvas.getContext('2d');

  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    if (excludeLayerId && layer.id === excludeLayerId) continue;

    const override = layerOverrides ? layerOverrides.get(layer.id) : null;

    ctx.save();
    ctx.globalAlpha = layer.opacity;
    if (override) {
      ctx.drawImage(layer.canvas, override.x, override.y, override.w, override.h);
    } else {
      ctx.drawImage(layer.canvas, layer.x, layer.y);
    }
    ctx.restore();
  }

  return compositeCanvas;
}
