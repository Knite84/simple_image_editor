/**
 * Photo Editor - Main Application Controller
 */

import { createDocument, createDocumentFromImage, createLayer, renderComposite, cloneDocument, getActiveLayer, renderTextCanvas } from './document.js';
import { Viewport } from './coords.js';
import { HistoryManager } from './history.js';
import { applyOp } from './ops.js';
import { ActionRecorder } from './recorder.js';
import { setupLayersPanel } from './layers-panel.js';
import { setupHistoryPanel } from './history-panel.js';
import { showExportModal } from './tools/export.js';
import { showBatchQueueModal } from './batch-queue.js';
import { calculateAspectRatioBounds } from './tools/select-rect.js';
import { interpolateStroke, applyStamp, getCircularBrushMask } from './tools/clone-brush.js';
import { getLayerHslTargets, applyHslToImageData } from './tools/hue-saturation.js';
import { getSelectionMask, computeSelectionOutline } from './selection.js';

import { getHandlePositions, hitTestHandles, computeHandleResize, HANDLE_IDS, CORNER_HANDLES, HANDLE_CURSORS } from './transform.js';

// Load tool op handlers
import './tools/select-rect.js';
import './tools/select-lasso.js';
import './tools/crop.js';
import './tools/resize.js';
import './tools/rotate.js';
import './tools/hue-saturation.js';
import './tools/blur.js';
import './tools/fill.js';
import './tools/text.js';
import './tools/delete.js';
import './tools/clone-brush.js';
import './tools/move.js';

// Application State
export const appState = {
  document: null,
  activeTool: 'select-rect',
  viewport: null,
  history: new HistoryManager(20),
  recorder: new ActionRecorder(),
  layersUI: null,
  multiSelectedLayerIds: [],

  // Viewport navigation & pan state
  isSpacePressed: false,
  isPanning: false,
  panStartPos: null,

  // Tool interaction states
  isPointerDown: false,
  dragStartDocPos: null,
  currentDocPos: null,
  lassoPoints: [],
  selDragMode: 'new', // 'new' | 'add' | 'subtract' for in-flight selection drags,

  // Move Tool state
  moveStartLayerPos: null,
  moveDelta: { x: 0, y: 0 },

  // Interactive layer transform state (Transform tool handles)
  transformDrag: null,   // { layerId, handleId, startRect, previewRect }
  transformHover: null,  // hovered handle id or null

  // Canvas-edge snap guides while dragging a layer (Transform tool)
  snapGuides: null,      // { vertical: number[], horizontal: number[] }

  // Shared color state: set by the Dropper, consumed by Fill / Text
  primaryColor: '#000000',

  // Text tool live-edit session
  textEditSession: null, // { layerId, originalMeta } while editing a text layer

  // Clone Brush state
  cloneSource: null, // { x, y }
  isSettingCloneSource: false,
  cloneCurrentStroke: [], // stamps
  cloneStrokeOffset: null, // { x, y } fixed during aligned stroke
  cloneBrushSize: 40,
  cloneBrushHardness: 0.4,

  // HSL Proxy Preview state
  hslProxyCanvas: null,
  isHslPreviewing: false
};

// DOM References
const displayCanvas = document.getElementById('display-canvas');
const overlayCanvas = document.getElementById('overlay-canvas');
const canvasViewport = document.getElementById('canvas-viewport');
const fileInput = document.getElementById('file-input');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const btnRotateCw = document.getElementById('btn-rotate-cw');
const btnRotateCcw = document.getElementById('btn-rotate-ccw');
const btnRecord = document.getElementById('btn-record');
const recordBtnLabel = document.getElementById('record-btn-label');
const btnBatchModal = document.getElementById('btn-batch-modal');
const btnExportModal = document.getElementById('btn-export-modal');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnFitScreen = document.getElementById('btn-fit-screen');
const zoomPercentage = document.getElementById('zoom-percentage');
const docDimensions = document.getElementById('doc-dimensions');
const layersPane = document.getElementById('tab-layers');

// Tool options elements
const toolButtons = document.querySelectorAll('.tool-btn');
const selectRatio = document.getElementById('select-ratio');
const optRatioWidth = document.getElementById('opt-ratio-width');
const optRatioHeight = document.getElementById('opt-ratio-height');
const optRectFeather = document.getElementById('opt-rect-feather');
const optLassoFeather = document.getElementById('opt-lasso-feather');
const optRectMode = document.getElementById('opt-rect-mode');
const optLassoMode = document.getElementById('opt-lasso-mode');
const btnRectDeselect = document.getElementById('btn-rect-deselect');
const btnLassoDeselect = document.getElementById('btn-lasso-deselect');

const btnApplyCrop = document.getElementById('btn-apply-crop');
const resizeW = document.getElementById('resize-w');
const resizeH = document.getElementById('resize-h');
const resizeScope = document.getElementById('resize-scope');
const resizeLockRatio = document.getElementById('resize-lock-ratio');
const btnApplyResize = document.getElementById('btn-apply-resize');
const snapToCanvasInput = document.getElementById('snap-to-canvas');

const hslH = document.getElementById('hsl-h');
const hslS = document.getElementById('hsl-s');
const hslL = document.getElementById('hsl-l');
const hslHVal = document.getElementById('hsl-h-val');
const hslSVal = document.getElementById('hsl-s-val');
const hslLVal = document.getElementById('hsl-l-val');
const btnApplyHsl = document.getElementById('btn-apply-hsl');
const btnResetHsl = document.getElementById('btn-reset-hsl');

const blurStrength = document.getElementById('blur-strength');
const blurStrengthVal = document.getElementById('blur-strength-val');
const blurSize = document.getElementById('blur-size');
const blurSizeVal = document.getElementById('blur-size-val');
const btnApplyBlur = document.getElementById('btn-apply-blur');

const dropperSwatch = document.getElementById('dropper-swatch');
const dropperHex = document.getElementById('dropper-hex');
const btnCopyHex = document.getElementById('btn-copy-hex');

const fillColorInput = document.getElementById('fill-color');
const fillOpacity = document.getElementById('fill-opacity');
const fillOpacityVal = document.getElementById('fill-opacity-val');
const fillTolerance = document.getElementById('fill-tolerance');
const fillToleranceVal = document.getElementById('fill-tolerance-val');

const textContentInput = document.getElementById('text-content');
const textFontFace = document.getElementById('text-font-face');
const textFontSize = document.getElementById('text-font-size');
const textColorInput = document.getElementById('text-color');
const btnApplyText = document.getElementById('btn-apply-text');
const btnRasterizeText = document.getElementById('btn-rasterize-text');

const btnApplyDelete = document.getElementById('btn-apply-delete');
const deleteFillColor = document.getElementById('delete-fill-color');

const cloneSize = document.getElementById('clone-size');
const cloneSizeVal = document.getElementById('clone-size-val');
const cloneHardness = document.getElementById('clone-hardness');
const cloneHardnessVal = document.getElementById('clone-hardness-val');
const btnSetSource = document.getElementById('btn-set-source');
const cloneSourceStatus = document.getElementById('clone-source-status');

// Actions List elements
const actionsList = document.getElementById('actions-list');
const btnClearActions = document.getElementById('btn-clear-actions');
const btnExportActions = document.getElementById('btn-export-actions');
const loadActionsInput = document.getElementById('load-actions-input');

// Initialize Viewport
appState.viewport = new Viewport(canvasViewport, displayCanvas);

// Initialize Layers Panel
appState.layersUI = setupLayersPanel(appState, () => {
  handleActiveLayerChangeForText();
  renderApp();
}, () => {
  // A photo was just added as a layer: make Transform active so it can be
  // immediately moved/resized into place
  activateTransformForNewLayer();
});

// Initialize History Panel (rendered from history.onChange notifications)
appState.historyUI = setupHistoryPanel(appState, () => {
  renderApp();
});

/**
 * Resolves the active aspect ratio for the Rect tool as a "W:H" string.
 * Returns 'free' when Free is selected or the custom fields hold no valid positive values.
 */
function getActiveRectRatio() {
  if (selectRatio.value === 'free') return 'free';
  const w = parseFloat(optRatioWidth.value);
  const h = parseFloat(optRatioHeight.value);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 'free';
  return `${w}:${h}`;
}

/**
 * Resolves the effective selection mode for the active selection tool.
 * Keyboard modifiers win over the Mode dropdown: Alt = Subtract, Shift = Add.
 */
function resolveSelectionMode(e) {
  if (e && e.altKey) return 'subtract';
  if (e && e.shiftKey) return 'add';
  const select = appState.activeTool === 'select-lasso' ? optLassoMode : optRectMode;
  return (select && select.value) || 'new';
}

/**
 * Execute an operation on the document with Undo snapshot and Recorder capture
 */
export function executeOp(op, record = true) {
  if (!appState.document || !op) return;

  // 1. Push state to Undo History before mutating
  appState.history.pushState(appState.document, op.name);

  // 2. Dispatch pure op
  appState.document = applyOp(appState.document, op);

  // 3. Record op if recording
  if (record) {
    appState.recorder.recordOp(op, appState.document);
  }

  // 4. Render
  renderApp();
}

/**
 * Redraws display canvas, updates size & layer UI
 */
export function renderApp() {
  if (!appState.document) return;
  const doc = appState.document;

  if (displayCanvas.width !== doc.width || displayCanvas.height !== doc.height) {
    displayCanvas.width = doc.width;
    displayCanvas.height = doc.height;
  }

  // Draw Composite
  const ctx = displayCanvas.getContext('2d');
  ctx.clearRect(0, 0, doc.width, doc.height);

  if (appState.isHslPreviewing && appState.hslProxyCanvas) {
    ctx.drawImage(appState.hslProxyCanvas, 0, 0, doc.width, doc.height);
  } else {
    let overrides = null;
    if (appState.transformDrag) {
      overrides = new Map([[appState.transformDrag.layerId, appState.transformDrag.previewRect]]);
    }
    const composite = renderComposite(doc, overrides);
    ctx.drawImage(composite, 0, 0);
  }

  // Update Footer & Viewport
  docDimensions.textContent = `${doc.width} × ${doc.height} px`;
  zoomPercentage.textContent = `${Math.round(appState.viewport.zoom * 100)}%`;
  appState.viewport.updateTransform(doc);

  // Update Resize inputs if not focused
  if (document.activeElement !== resizeW && document.activeElement !== resizeH) {
    const basis = getResizeBasis();
    if (basis) {
      resizeW.value = basis.w;
      resizeH.value = basis.h;
    }
  }

  appState.layersUI.render();
  renderOverlay();
}

/**
 * Marching Ants & Selection / Brush Overlay Renderer
 */
let marchingAntsOffset = 0;

// Cached raster mask of the committed selection + scratch canvases for the
// live add/subtract preview (reused across animation frames)
const selectionPreviewCache = { key: null, canvas: null };
const selectionOutlineCache = { key: null, result: null };
const previewScratch = document.createElement('canvas');
const previewTint = document.createElement('canvas');

/**
 * Combined-boundary outline for the committed selection (cached per selection
 * object identity), so marching ants trace the merged region instead of each
 * part's raw outline.
 */
function getCommittedSelectionOutline(doc) {
  if (!doc.selection) return null;
  if (selectionOutlineCache.key !== doc.selection || !selectionOutlineCache.result) {
    selectionOutlineCache.result = computeSelectionOutline(doc.selection, doc.width, doc.height);
    selectionOutlineCache.key = doc.selection;
  }
  return selectionOutlineCache.result;
}

function getCommittedSelectionMaskCanvas(doc) {
  if (!doc.selection) return null;
  if (selectionPreviewCache.key !== doc.selection ||
      !selectionPreviewCache.canvas ||
      selectionPreviewCache.canvas.width !== doc.width ||
      selectionPreviewCache.canvas.height !== doc.height) {
    selectionPreviewCache.canvas = getSelectionMask(doc.selection, doc.width, doc.height);
    selectionPreviewCache.key = doc.selection;
  }
  return selectionPreviewCache.canvas;
}

/**
 * Tints a white-alpha mask canvas with the given color (source-in fill)
 */
function tintMaskCanvas(maskCanvas, color, docW, docH) {
  if (previewTint.width !== docW || previewTint.height !== docH) {
    previewTint.width = docW;
    previewTint.height = docH;
  }
  const tctx = previewTint.getContext('2d');
  tctx.clearRect(0, 0, docW, docH);
  tctx.globalCompositeOperation = 'source-over';
  tctx.drawImage(maskCanvas, 0, 0);
  tctx.globalCompositeOperation = 'source-in';
  tctx.fillStyle = color;
  tctx.fillRect(0, 0, docW, docH);
  tctx.globalCompositeOperation = 'source-over';
  return previewTint;
}

function renderOverlay() {
  if (!appState.document) return;
  const doc = appState.document;

  // The overlay covers the whole viewport (not just the document) so things
  // like transform anchors stay visible when a layer extends past the canvas
  if (overlayCanvas.width !== canvasViewport.clientWidth || overlayCanvas.height !== canvasViewport.clientHeight) {
    overlayCanvas.width = canvasViewport.clientWidth;
    overlayCanvas.height = canvasViewport.clientHeight;
  }

  const ctx = overlayCanvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  // Map document coordinates onto viewport pixels for all drawing below
  const vpRect = canvasViewport.getBoundingClientRect();
  const canvasRect = displayCanvas.getBoundingClientRect();
  const viewScale = doc.width > 0 ? canvasRect.width / doc.width : appState.viewport.zoom;
  ctx.setTransform(viewScale, 0, 0, viewScale, canvasRect.left - vpRect.left, canvasRect.top - vpRect.top);

  // 1. Render active selection with marching ants tracing the combined boundary
  if (doc.selection) {
    const outline = getCommittedSelectionOutline(doc);
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);

    const strokeOutline = (dashOffset) => {
      ctx.lineDashOffset = dashOffset;
      if (outline && outline.path) {
        ctx.stroke(outline.path);
      } else if (doc.selection.type === 'rect') {
        const { x, y, w, h } = doc.selection.bounds;
        ctx.strokeRect(x, y, w, h);
      } else if (doc.selection.path) {
        ctx.stroke(doc.selection.path);
      }
    };

    // Black background stroke
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    strokeOutline(marchingAntsOffset);

    // White foreground stroke
    ctx.strokeStyle = '#ffffff';
    strokeOutline(marchingAntsOffset + 6);

    ctx.restore();
  }

  // 1.2 Effective-selection tint: shows the actual combined masked area.
  //     Multi-part selections always get a faint fill; during add/subtract
  //     drags the in-flight shape is composited in so the union/difference
  //     updates live while drawing.
  const isSelectionDrag = appState.isPointerDown &&
    (appState.activeTool === 'select-rect' || appState.activeTool === 'select-lasso');
  const showResultTint = (doc.selection && doc.selection.parts && doc.selection.parts.length > 1) ||
    (isSelectionDrag && appState.selDragMode !== 'new' && doc.selection);

  if (showResultTint) {
    let maskCanvas = getCommittedSelectionMaskCanvas(doc);

    if (maskCanvas && isSelectionDrag && appState.selDragMode !== 'new') {
      if (previewScratch.width !== doc.width || previewScratch.height !== doc.height) {
        previewScratch.width = doc.width;
        previewScratch.height = doc.height;
      }
      const sctx = previewScratch.getContext('2d');
      sctx.clearRect(0, 0, previewScratch.width, previewScratch.height);
      sctx.globalCompositeOperation = 'source-over';
      sctx.drawImage(maskCanvas, 0, 0);

      // Composite the in-flight shape into the mask copy
      sctx.globalCompositeOperation = appState.selDragMode === 'subtract' ? 'destination-out' : 'source-over';
      sctx.fillStyle = '#ffffff';
      if (appState.activeTool === 'select-rect' && appState.dragStartDocPos && appState.currentDocPos) {
        const inFlightBounds = calculateAspectRatioBounds(
          appState.dragStartDocPos.x,
          appState.dragStartDocPos.y,
          appState.currentDocPos.x,
          appState.currentDocPos.y,
          getActiveRectRatio()
        );
        sctx.fillRect(inFlightBounds.x, inFlightBounds.y, inFlightBounds.w, inFlightBounds.h);
      } else if (appState.activeTool === 'select-lasso' && appState.lassoPoints.length > 2) {
        const inFlightPath = new Path2D();
        inFlightPath.moveTo(appState.lassoPoints[0].x, appState.lassoPoints[0].y);
        for (let i = 1; i < appState.lassoPoints.length; i++) {
          inFlightPath.lineTo(appState.lassoPoints[i].x, appState.lassoPoints[i].y);
        }
        inFlightPath.closePath();
        sctx.fill(inFlightPath);
      }

      maskCanvas = previewScratch;
    }

    if (maskCanvas) {
      const tintColor = isSelectionDrag && appState.selDragMode === 'subtract' ? '#ef4444'
        : isSelectionDrag && appState.selDragMode === 'add' ? '#10b981'
        : '#3b82f6';
      const tinted = tintMaskCanvas(maskCanvas, tintColor, doc.width, doc.height);
      ctx.save();
      ctx.globalAlpha = isSelectionDrag ? 0.3 : 0.14;
      ctx.drawImage(tinted, 0, 0);
      ctx.restore();
    }
  }

  // 1.5 Render layer transform handles (Transform tool, no active selection)
  if (appState.activeTool === 'transform' && !doc.selection) {
    const layer = getActiveLayer(doc);
    if (layer) {
      const rect = appState.transformDrag && appState.transformDrag.layerId === layer.id
        ? appState.transformDrag.previewRect
        : { x: layer.x, y: layer.y, w: layer.canvas.width, h: layer.canvas.height };
      const zoom = appState.viewport.zoom || 1;
      const positions = getHandlePositions(rect);
      const handleSize = 8 / zoom;
      const lineWidth = 1 / zoom;

      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

      for (const id of HANDLE_IDS) {
        const p = positions[id];
        ctx.fillStyle = appState.transformHover === id ? '#3b82f6' : '#ffffff';
        ctx.beginPath();
        ctx.rect(p.x - handleSize / 2, p.y - handleSize / 2, handleSize, handleSize);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // 1.6 Canvas-edge snap guides during Transform layer drags
  if (appState.snapGuides && (appState.snapGuides.vertical.length || appState.snapGuides.horizontal.length)) {
    const ext = Math.max(doc.width, doc.height);
    ctx.save();
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 1 / viewScale;
    ctx.setLineDash([6 / viewScale, 4 / viewScale]);
    ctx.beginPath();
    for (const gx of appState.snapGuides.vertical) {
      ctx.moveTo(gx, -ext);
      ctx.lineTo(gx, doc.height + ext);
    }
    for (const gy of appState.snapGuides.horizontal) {
      ctx.moveTo(-ext, gy);
      ctx.lineTo(doc.width + ext, gy);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 2. Render live dragging selection preview
  if (appState.isPointerDown) {
    if (appState.activeTool === 'select-rect' || appState.activeTool === 'crop') {
      if (appState.dragStartDocPos && appState.currentDocPos) {
        const ratio = appState.activeTool === 'select-rect' ? getActiveRectRatio() : 'free';
        const bounds = calculateAspectRatioBounds(
          appState.dragStartDocPos.x,
          appState.dragStartDocPos.y,
          appState.currentDocPos.x,
          appState.currentDocPos.y,
          ratio
        );
        const previewColor = appState.selDragMode === 'add' ? '#10b981'
          : appState.selDragMode === 'subtract' ? '#ef4444'
          : '#3b82f6';
        ctx.save();
        ctx.strokeStyle = previewColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
        ctx.fillStyle = `${previewColor}1a`;
        ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
        ctx.restore();
      }
    } else if (appState.activeTool === 'select-lasso' && appState.lassoPoints.length > 1) {
      const previewColor = appState.selDragMode === 'add' ? '#10b981'
        : appState.selDragMode === 'subtract' ? '#ef4444'
        : '#3b82f6';
      ctx.save();
      ctx.strokeStyle = previewColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(appState.lassoPoints[0].x, appState.lassoPoints[0].y);
      for (let i = 1; i < appState.lassoPoints.length; i++) {
        ctx.lineTo(appState.lassoPoints[i].x, appState.lassoPoints[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // 3. Render Clone Brush cursor & source crosshair
  if (appState.activeTool === 'clone-brush') {
    if (appState.cloneSource) {
      // Draw Source target crosshair
      ctx.save();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(appState.cloneSource.x, appState.cloneSource.y, 8, 0, Math.PI * 2);
      ctx.moveTo(appState.cloneSource.x - 14, appState.cloneSource.y);
      ctx.lineTo(appState.cloneSource.x + 14, appState.cloneSource.y);
      ctx.moveTo(appState.cloneSource.x, appState.cloneSource.y - 14);
      ctx.lineTo(appState.cloneSource.x, appState.cloneSource.y + 14);
      ctx.stroke();
      ctx.restore();
    }

    if (appState.currentDocPos) {
      // Draw brush radius circle
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(appState.currentDocPos.x, appState.currentDocPos.y, appState.cloneBrushSize / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// Marching ants animation loop
function animateMarchingAnts() {
  marchingAntsOffset = (marchingAntsOffset + 0.5) % 12;
  if (appState.document && (appState.document.selection || appState.isPointerDown || appState.activeTool === 'clone-brush')) {
    renderOverlay();
  }
  requestAnimationFrame(animateMarchingAnts);
}
requestAnimationFrame(animateMarchingAnts);

// Keep the viewport-sized overlay in sync on window resizes
window.addEventListener('resize', () => {
  if (appState.document) renderOverlay();
});

/**
 * Setup Tool Switcher
 */
// Canvas Viewport Wheel Scrolling and Pinch/Ctrl Zooming
canvasViewport.addEventListener('wheel', (e) => {
  if (!appState.document) return;
  e.preventDefault();

  if (e.ctrlKey || e.metaKey) {
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    appState.viewport.setZoom(appState.viewport.zoom * zoomFactor, appState.document, e.clientX, e.clientY);
    zoomPercentage.textContent = `${Math.round(appState.viewport.zoom * 100)}%`;
  } else if (e.shiftKey) {
    appState.viewport.pan(-e.deltaY, 0, appState.document);
  } else {
    appState.viewport.pan(-e.deltaX, -e.deltaY, appState.document);
  }
}, { passive: false });

/**
 * Setup Tool Switcher
 */
function setActiveTool(toolName) {
  const previousTool = appState.activeTool;
  appState.activeTool = toolName;

  // Discard unapplied HSL preview state when leaving the Hue/Sat tool,
  // so adjustments don't leak into work on a new selection
  if (previousTool === 'hue-saturation' && toolName !== 'hue-saturation') {
    resetHslPreview();
  }

  // Commit pending text edits when leaving the Text tool
  if (previousTool === 'text' && toolName !== 'text') {
    commitTextEdit();
    btnRasterizeText.disabled = true;
  }

  if (toolName === 'text') {
    const t = getActiveTextLayer();
    if (t) loadTextSession(t);
  }

  appState.snapGuides = null;

  toolButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === toolName);
  });

  // Toggle tool option bars
  const optionGroups = document.querySelectorAll('.tool-option-group');
  optionGroups.forEach(og => og.style.display = 'none');

  const activeGroup = document.getElementById(`opt-${toolName}`);
  if (activeGroup) activeGroup.style.display = 'flex';

  if (toolName === 'pan') {
    canvasViewport.style.cursor = 'grab';
  } else if (toolName === 'transform') {
    canvasViewport.style.cursor = 'move';
  } else {
    canvasViewport.style.cursor = '';
  }

  renderOverlay();
}

toolButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    setActiveTool(btn.dataset.tool);
  });
});

/**
 * Activates the Transform tool after an image was imported as a layer.
 * Also points the size controls at the active layer, since repositioning /
 * resizing that fresh layer is the expected next action.
 */
function activateTransformForNewLayer() {
  resizeScope.value = 'layer';
  setActiveTool('transform');
}

// ---- Text Tool: live editing session ----
// While a text layer is being edited, changes preview directly on the layer
// (no history spam); commitTextEdit() snapshots once via update-text-layer.

function getActiveTextLayer() {
  const doc = appState.document;
  if (!doc) return null;
  const layer = getActiveLayer(doc);
  return layer && layer.meta && layer.meta.kind === 'text' ? layer : null;
}

function readTextBarValues() {
  return {
    text: textContentInput.value,
    fontFace: textFontFace.value,
    fontSize: parseInt(textFontSize.value, 10) || 48,
    color: textColorInput.value
  };
}

function syncTextBarFromLayer(layer) {
  textContentInput.value = layer.meta.text;
  textFontFace.value = layer.meta.fontFace;
  if (![...textFontFace.options].some(o => o.value === layer.meta.fontFace)) {
    textFontFace.value = 'Arial';
  } else {
    textFontFace.value = layer.meta.fontFace;
  }
  textFontSize.value = layer.meta.fontSize;
  textColorInput.value = layer.meta.color;
}

/** Renders layer.meta onto the layer canvas, keeping meta.anchorX/Y fixed. */
function applyTextMetaToLayer(layer) {
  const { canvas, offsetX, offsetY } = renderTextCanvas(layer.meta);
  layer.canvas.width = canvas.width;
  layer.canvas.height = canvas.height;
  layer.canvas.getContext('2d', { willReadFrequently: true }).drawImage(canvas, 0, 0);
  layer.x = Math.round(layer.meta.anchorX + offsetX);
  layer.y = Math.round(layer.meta.anchorY + offsetY);
}

function loadTextSession(layer) {
  appState.textEditSession = {
    layerId: layer.id,
    originalMeta: JSON.parse(JSON.stringify(layer.meta))
  };
  syncTextBarFromLayer(layer);
  btnRasterizeText.disabled = false;
}

/** Live-previews options-bar values onto the session's text layer. */
function previewTextEdit() {
  const doc = appState.document;
  const s = appState.textEditSession;
  if (!doc || !s) return;
  const layer = doc.layers.find(l => l.id === s.layerId);
  if (!layer || !layer.meta || layer.meta.kind !== 'text') return;

  const v = readTextBarValues();
  layer.meta = {
    ...layer.meta,
    text: v.text,
    fontFace: v.fontFace,
    fontSize: Math.max(8, Math.min(400, v.fontSize)),
    color: v.color
  };
  applyTextMetaToLayer(layer);
  renderApp();
}

/**
 * Commits the in-flight session as one history entry. Restores pre-edit
 * pixels/meta first so executeOp's snapshot captures the original state.
 */
function commitTextEdit() {
  const s = appState.textEditSession;
  if (!s) return;
  appState.textEditSession = null;

  const doc = appState.document;
  const layer = doc && doc.layers.find(l => l.id === s.layerId);
  if (!layer || !layer.meta || layer.meta.kind !== 'text') return;

  const orig = s.originalMeta;
  const changed = ['text', 'fontFace', 'fontSize', 'color']
    .some(k => (orig[k] ?? '') !== (layer.meta[k] ?? ''));

  if (!changed) return;

  layer.meta = { ...orig };
  applyTextMetaToLayer(layer);

  const cur = readTextBarValues();
  executeOp({
    name: 'update-text-layer',
    params: {
      layerId: layer.id,
      text: cur.text,
      fontFace: cur.fontFace,
      fontSize: cur.fontSize,
      color: cur.color
    }
  });
}

/** Discards the in-flight session, restoring the pre-edit state. */
function cancelTextEdit() {
  const s = appState.textEditSession;
  if (!s) return;
  appState.textEditSession = null;

  const doc = appState.document;
  const layer = doc && doc.layers.find(l => l.id === s.layerId);
  if (!layer || !layer.meta || layer.meta.kind !== 'text') return;

  layer.meta = { ...s.originalMeta };
  applyTextMetaToLayer(layer);
  syncTextBarFromLayer(layer);
  renderApp();
}

/** Called whenever the active layer may have changed while Text is active. */
function handleActiveLayerChangeForText() {
  if (appState.activeTool !== 'text') return;
  commitTextEdit();
  const t = getActiveTextLayer();
  if (t) {
    loadTextSession(t);
  } else {
    btnRasterizeText.disabled = true;
  }
}

/**
 * Commits an interactive layer transform drag via the transform-layer op.
 * The layer's real pixels were never mutated during the preview, so the
 * op's history snapshot captures the pre-drag state automatically.
 */
function commitTransformDrag() {
  const d = appState.transformDrag;
  appState.transformDrag = null;
  const r = d.previewRect;
  const s = d.startRect;
  if (r.w !== s.w || r.h !== s.h || r.x !== s.x || r.y !== s.y) {
    executeOp({
      name: 'transform-layer',
      params: { layerId: d.layerId, width: r.w, height: r.h, x: r.x, y: r.y }
    });
  } else {
    renderApp();
  }
}

/**
 * Cancels an interactive layer transform drag (Esc), discarding the preview
 */
function cancelTransformDrag() {
  appState.transformDrag = null;
  renderApp();
}

/**
 * Snaps a dragging layer rect to the canvas edges/center when enabled.
 * Populates appState.snapGuides with the doc-space lines that matched, so
 * renderOverlay can draw them. Threshold is 8 screen px regardless of zoom.
 */
function applySnapToCanvas(rect) {
  const doc = appState.document;
  const guides = { vertical: [], horizontal: [] };
  appState.snapGuides = guides;
  if (!snapToCanvasInput.checked) return rect;

  const threshold = 8 / (appState.viewport.zoom || 1);
  let x = rect.x;
  let y = rect.y;

  const xTargets = [
    { pos: 0, delta: -x },
    { pos: doc.width, delta: doc.width - (rect.x + rect.w) },
    { pos: doc.width / 2, delta: doc.width / 2 - (rect.x + rect.w / 2) }
  ];
  const yTargets = [
    { pos: 0, delta: -y },
    { pos: doc.height, delta: doc.height - (rect.y + rect.h) },
    { pos: doc.height / 2, delta: doc.height / 2 - (rect.y + rect.h / 2) }
  ];

  xTargets.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
  yTargets.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));

  if (Math.abs(xTargets[0].delta) <= threshold) {
    x += xTargets[0].delta;
    guides.vertical.push(xTargets[0].pos);
  }
  if (Math.abs(yTargets[0].delta) <= threshold) {
    y += yTargets[0].delta;
    guides.horizontal.push(yTargets[0].pos);
  }

  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Pointer / Canvas Event Routing
 */
canvasViewport.addEventListener('pointerdown', (e) => {
  if (!appState.document) return;
  const docPos = appState.viewport.screenToDoc(e, appState.document);

  // Check if Middle Mouse Button (button 1) or Spacebar held or Pan tool active -> Pan
  if (e.button === 1 || appState.isSpacePressed || appState.activeTool === 'pan') {
    appState.isPanning = true;
    appState.panStartPos = { x: e.clientX, y: e.clientY };
    canvasViewport.style.cursor = 'grabbing';
    return;
  }

  // Check Alt + Click for Clone Brush source
  if (appState.activeTool === 'clone-brush') {
    if (e.altKey || appState.isSettingCloneSource) {
      appState.cloneSource = { x: docPos.x, y: docPos.y };
      appState.isSettingCloneSource = false;
      btnSetSource.classList.remove('btn-primary');
      btnSetSource.classList.add('btn-secondary');
      cloneSourceStatus.textContent = `Source: (${docPos.x}, ${docPos.y})`;
      renderOverlay();
      return;
    }
  }

  // Dropper: dedicated tool, or Alt+Click from tools that don't reserve Alt
  // (selection tools use Alt for subtract; clone brush uses it for source)
  const altIsReserved = appState.activeTool === 'clone-brush' ||
    appState.activeTool === 'select-rect' ||
    appState.activeTool === 'select-lasso';
  if (appState.activeTool === 'dropper' || (e.altKey && !altIsReserved)) {
    sampleColorAt(docPos);
    return;
  }

  // Fill: bucket click on the active layer
  if (appState.activeTool === 'fill') {
    const layer = getActiveLayer(appState.document);
    if (!layer) return;
    const lx = docPos.x - layer.x;
    const ly = docPos.y - layer.y;
    if (lx < 0 || ly < 0 || lx >= layer.canvas.width || ly >= layer.canvas.height) return;
    executeOp({
      name: 'fill',
      params: {
        x: docPos.x,
        y: docPos.y,
        color: fillColorInput.value,
        opacity: parseInt(fillOpacity.value, 10) / 100,
        tolerance: parseInt(fillTolerance.value, 10) / 100
      }
    });
    return;
  }

  // Text: click places a new editable text layer anchored at the click point
  if (appState.activeTool === 'text') {
    commitTextEdit(); // flush any prior session
    executeOp({
      name: 'add-text-layer',
      params: {
        x: docPos.x,
        y: docPos.y,
        ...readTextBarValues()
      }
    });
    const created = getActiveLayer(appState.document);
    if (created && created.meta && created.meta.kind === 'text') {
      loadTextSession(created);
      textContentInput.focus();
      textContentInput.select();
    }
    return;
  }

  // Transform handle drag start (Transform tool, no selection)
  if (appState.activeTool === 'transform' && !appState.document.selection) {
    const layer = getActiveLayer(appState.document);
    if (layer) {
      const tol = 6 / appState.viewport.zoom;
      const rect = { x: layer.x, y: layer.y, w: layer.canvas.width, h: layer.canvas.height };
      const hit = hitTestHandles(rect, docPos.rawX, docPos.rawY, tol);
      if (hit) {
        appState.transformDrag = {
          layerId: layer.id,
          handleId: hit,
          startRect: { ...rect },
          previewRect: { ...rect }
        };
        renderApp();
        return;
      }
    }
  }

  if (appState.activeTool === 'select-rect' || appState.activeTool === 'select-lasso') {
    appState.selDragMode = resolveSelectionMode(e);
  }

  appState.isPointerDown = true;
  appState.dragStartDocPos = docPos;
  appState.currentDocPos = docPos;

  if (appState.activeTool === 'transform') {
    if (appState.document.selection) {
      appState.moveStartDocPos = { ...docPos };
      appState.moveDelta = { x: 0, y: 0 };
    } else {
      const activeLayer = getActiveLayer(appState.document);
      if (activeLayer) {
        appState.moveStartLayerPos = { x: activeLayer.x, y: activeLayer.y };
      }
    }
  } else if (appState.activeTool === 'select-lasso') {
    appState.lassoPoints = [{ x: docPos.x, y: docPos.y }];
  } else if (appState.activeTool === 'clone-brush') {
    if (appState.cloneSource) {
      appState.cloneCurrentStroke = [{ x: docPos.x, y: docPos.y }];
      appState.cloneStrokeOffset = {
        x: appState.cloneSource.x - docPos.x,
        y: appState.cloneSource.y - docPos.y
      };

      // Perform live visual stamp
      const activeLayer = getActiveLayer(appState.document);
      if (activeLayer) {
        const destCtx = activeLayer.canvas.getContext('2d', { willReadFrequently: true });
        const sourceX = docPos.x + appState.cloneStrokeOffset.x;
        const sourceY = docPos.y + appState.cloneStrokeOffset.y;
        applyStamp(destCtx, activeLayer.canvas, sourceX, sourceY, docPos.x, docPos.y, appState.cloneBrushSize, appState.cloneBrushHardness);
        renderApp();
      }
    }
  }

  renderOverlay();
});

window.addEventListener('pointermove', (e) => {
  if (!appState.document) return;

  // Handle live panning
  if (appState.isPanning && appState.panStartPos) {
    const dx = e.clientX - appState.panStartPos.x;
    const dy = e.clientY - appState.panStartPos.y;
    appState.viewport.pan(dx, dy, appState.document);
    appState.panStartPos = { x: e.clientX, y: e.clientY };
    return;
  }

  const docPos = appState.viewport.screenToDoc(e, appState.document);
  appState.currentDocPos = docPos;

  // Live layer transform drag
  if (appState.transformDrag) {
    const d = appState.transformDrag;
    const isCorner = CORNER_HANDLES.includes(d.handleId);
    const keepRatio = isCorner && !e.shiftKey;
    d.previewRect = computeHandleResize(d.startRect, d.handleId, docPos.rawX, docPos.rawY, keepRatio);
    renderApp();
    return;
  }

  // Transform handle hover feedback (Transform tool)
  if (appState.activeTool === 'transform' && !appState.isPointerDown && !appState.document.selection) {
    const layer = getActiveLayer(appState.document);
    if (layer) {
      const tol = 6 / appState.viewport.zoom;
      const rect = { x: layer.x, y: layer.y, w: layer.canvas.width, h: layer.canvas.height };
      const hit = hitTestHandles(rect, docPos.rawX, docPos.rawY, tol);
      if (hit !== appState.transformHover) {
        appState.transformHover = hit;
        renderOverlay();
      }
      canvasViewport.style.cursor = hit ? HANDLE_CURSORS[hit] : 'move';
    }
  }

  if (appState.isPointerDown) {
    if (appState.activeTool === 'select-rect' || appState.activeTool === 'select-lasso') {
      appState.selDragMode = resolveSelectionMode(e);
    }

    if (appState.activeTool === 'transform') {
      if (appState.document.selection) {
        appState.moveDelta = {
          x: docPos.x - appState.moveStartDocPos.x,
          y: docPos.y - appState.moveStartDocPos.y
        };
        renderOverlay();
      } else {
        const activeLayer = getActiveLayer(appState.document);
        if (activeLayer && appState.moveStartLayerPos) {
          const dx = docPos.x - appState.dragStartDocPos.x;
          const dy = docPos.y - appState.dragStartDocPos.y;
          const free = {
            x: appState.moveStartLayerPos.x + dx,
            y: appState.moveStartLayerPos.y + dy,
            w: activeLayer.canvas.width,
            h: activeLayer.canvas.height
          };
          const snapped = applySnapToCanvas(free);
          activeLayer.x = snapped.x;
          activeLayer.y = snapped.y;
          renderApp();
        }
      }
    } else if (appState.activeTool === 'select-lasso') {
      const last = appState.lassoPoints[appState.lassoPoints.length - 1];
      if (Math.hypot(docPos.x - last.x, docPos.y - last.y) > 3) {
        appState.lassoPoints.push({ x: docPos.x, y: docPos.y });
      }
    } else if (appState.activeTool === 'clone-brush' && appState.cloneSource && appState.cloneStrokeOffset) {
      const lastStamp = appState.cloneCurrentStroke[appState.cloneCurrentStroke.length - 1] || appState.dragStartDocPos;
      const activeLayer = getActiveLayer(appState.document);
      const spacing = Math.max(2, appState.cloneBrushSize * 0.2);

      interpolateStroke(lastStamp.x, lastStamp.y, docPos.x, docPos.y, spacing, (ix, iy) => {
        const pt = { x: Math.round(ix), y: Math.round(iy) };
        appState.cloneCurrentStroke.push(pt);
        if (activeLayer) {
          const destCtx = activeLayer.canvas.getContext('2d', { willReadFrequently: true });
          const sx = pt.x + appState.cloneStrokeOffset.x;
          const sy = pt.y + appState.cloneStrokeOffset.y;
          applyStamp(destCtx, activeLayer.canvas, sx, sy, pt.x, pt.y, appState.cloneBrushSize, appState.cloneBrushHardness);
        }
      });
      renderApp();
    }
  }

  renderOverlay();
});

window.addEventListener('pointerup', (e) => {
  if (appState.isPanning) {
    appState.isPanning = false;
    appState.panStartPos = null;
    canvasViewport.style.cursor = appState.activeTool === 'pan' ? 'grab' : (appState.activeTool === 'transform' ? 'move' : '');
    return;
  }

  // Commit interactive layer transform
  if (appState.transformDrag) {
    commitTransformDrag();
    return;
  }

  if (!appState.isPointerDown) return;
  appState.isPointerDown = false;
  const docPos = appState.currentDocPos;

  if (appState.activeTool === 'transform') {
    if (appState.document.selection) {
      const dx = appState.moveDelta.x;
      const dy = appState.moveDelta.y;
      appState.moveDelta = { x: 0, y: 0 };
      if (dx !== 0 || dy !== 0) {
        executeOp({
          name: 'move-selection',
          params: { deltaX: dx, deltaY: dy }
        });
      }
    } else {
      const activeLayer = getActiveLayer(appState.document);
      if (activeLayer && appState.moveStartLayerPos) {
        const finalX = activeLayer.x;
        const finalY = activeLayer.y;
        appState.snapGuides = null;
        // Reset layer x, y before executeOp so pushState captures original position
        activeLayer.x = appState.moveStartLayerPos.x;
        activeLayer.y = appState.moveStartLayerPos.y;

        const deltaX = finalX - appState.moveStartLayerPos.x;
        const deltaY = finalY - appState.moveStartLayerPos.y;
        if (deltaX !== 0 || deltaY !== 0) {
          executeOp({
            name: 'move-layer',
            params: {
              layerId: activeLayer.id,
              deltaX,
              deltaY
            }
          });
        }
      }
    }
  } else if (appState.activeTool === 'select-rect') {
    const ratio = getActiveRectRatio();
    const feather = parseInt(optRectFeather.value, 10) || 0;
    const mode = appState.selDragMode || 'new';
    appState.selDragMode = 'new';
    const bounds = calculateAspectRatioBounds(
      appState.dragStartDocPos.x,
      appState.dragStartDocPos.y,
      docPos.x,
      docPos.y,
      ratio
    );
    if (bounds.w > 3 && bounds.h > 3) {
      executeOp({
        name: 'select-rect',
        params: { bounds, feather, mode }
      });
    } else if (appState.document.selection && mode === 'new') {
      // Plain click (no drag) clears the current selection
      executeOp({ name: 'clear-selection' });
    }
  } else if (appState.activeTool === 'select-lasso') {
    const feather = parseInt(optLassoFeather.value, 10) || 0;
    const mode = appState.selDragMode || 'new';
    appState.selDragMode = 'new';
    if (appState.lassoPoints.length >= 3) {
      executeOp({
        name: 'select-lasso',
        params: { points: appState.lassoPoints, feather, mode }
      });
    } else if (appState.document.selection && mode === 'new') {
      // Plain click (no drag) clears the current selection
      executeOp({ name: 'clear-selection' });
    }
    appState.lassoPoints = [];
  } else if (appState.activeTool === 'crop') {
    const bounds = calculateAspectRatioBounds(
      appState.dragStartDocPos.x,
      appState.dragStartDocPos.y,
      docPos.x,
      docPos.y,
      'free'
    );
    if (bounds.w > 5 && bounds.h > 5) {
      executeOp({
        name: 'select-rect',
        params: { bounds, feather: 0 }
      });
    }
  } else if (appState.activeTool === 'clone-brush' && appState.cloneSource && appState.cloneCurrentStroke.length > 0) {
    // Record clone-stroke op
    if (appState.recorder.isRecording) {
      appState.recorder.recordOp({
        name: 'clone-stroke',
        params: {
          stamps: appState.cloneCurrentStroke,
          sourceOffset: appState.cloneStrokeOffset,
          size: appState.cloneBrushSize,
          hardness: appState.cloneBrushHardness
        }
      }, appState.document);
    }
    appState.cloneCurrentStroke = [];
  }

  renderApp();
});

/**
 * Tool Actions Wiring
 */
// Clear Selection
btnRectDeselect.onclick = () => executeOp({ name: 'clear-selection' });
btnLassoDeselect.onclick = () => executeOp({ name: 'clear-selection' });

// Rotate Active Layer 90°
btnRotateCw.onclick = () => {
  if (appState.document) executeOp({ name: 'rotate-layer', params: { direction: 'cw' } });
};
btnRotateCcw.onclick = () => {
  if (appState.document) executeOp({ name: 'rotate-layer', params: { direction: 'ccw' } });
};

// Feather applies to the active selection immediately (select first, feather after)
const applySelectionFeather = (featherInput) => {
  const sel = appState.document && appState.document.selection;
  if (!sel) return;
  const feather = Math.max(0, parseInt(featherInput.value, 10) || 0);
  if (sel.feather === feather) return;
  executeOp({ name: 'set-selection-feather', params: { feather } });
};
optRectFeather.oninput = () => applySelectionFeather(optRectFeather);
optLassoFeather.oninput = () => applySelectionFeather(optLassoFeather);

// Rect Aspect Ratio
selectRatio.onchange = () => {
  const value = selectRatio.value;
  if (value === 'free' || value === 'custom') return;
  const [rw, rh] = value.split(':').map(Number);
  optRatioWidth.value = rw;
  optRatioHeight.value = rh;
};
const syncCustomRatioFromFields = () => {
  if (selectRatio.value !== 'custom') selectRatio.value = 'custom';
};
optRatioWidth.oninput = syncCustomRatioFromFields;
optRatioHeight.oninput = syncCustomRatioFromFields;

// Crop Action
btnApplyCrop.onclick = () => {
  if (!appState.document) return;
  if (!appState.document.selection) {
    alert('Please drag to create a crop selection box first.');
    return;
  }
  executeOp({
    name: 'crop',
    params: { bounds: appState.document.selection.bounds }
  });
};

// Resize Action
function getResizeBasis() {
  if (!appState.document) return null;
  if (resizeScope.value === 'layer') {
    const layer = getActiveLayer(appState.document);
    if (layer) return { w: layer.canvas.width, h: layer.canvas.height };
  }
  return { w: appState.document.width, h: appState.document.height };
}
resizeScope.onchange = () => {
  const basis = getResizeBasis();
  if (basis) {
    resizeW.value = basis.w;
    resizeH.value = basis.h;
  }
};
resizeLockRatio.onchange = () => {
  const basis = getResizeBasis();
  if (!basis) return;
  resizeH.value = Math.round(parseInt(resizeW.value, 10) * (basis.h / basis.w));
};
resizeW.oninput = () => {
  const basis = getResizeBasis();
  if (resizeLockRatio.checked && basis) {
    const nw = parseInt(resizeW.value, 10) || 1;
    resizeH.value = Math.round(nw * (basis.h / basis.w));
  }
};
resizeH.oninput = () => {
  const basis = getResizeBasis();
  if (resizeLockRatio.checked && basis) {
    const nh = parseInt(resizeH.value, 10) || 1;
    resizeW.value = Math.round(nh * (basis.w / basis.h));
  }
};
btnApplyResize.onclick = () => {
  const w = parseInt(resizeW.value, 10);
  const h = parseInt(resizeH.value, 10);
  if (w > 0 && h > 0 && appState.document) {
    if (resizeScope.value === 'layer') {
      const layer = getActiveLayer(appState.document);
      if (!layer || (w === layer.canvas.width && h === layer.canvas.height)) return;
      executeOp({
        name: 'transform-layer',
        params: { layerId: layer.id, width: w, height: h }
      });
    } else {
      executeOp({
        name: 'resize',
        params: { width: w, height: h }
      });
    }
  }
};

// HSL Proxy Preview & Apply
function resetHslPreview() {
  hslH.value = 0;
  hslS.value = 0;
  hslL.value = 0;
  hslHVal.textContent = '0°';
  hslSVal.textContent = '0%';
  hslLVal.textContent = '0%';
  appState.isHslPreviewing = false;
  appState.hslProxyCanvas = null;
}

function updateHslPreview() {
  if (!appState.document) return;
  const h = parseInt(hslH.value, 10);
  const s = parseInt(hslS.value, 10);
  const l = parseInt(hslL.value, 10);

  hslHVal.textContent = `${h}°`;
  hslSVal.textContent = `${s}%`;
  hslLVal.textContent = `${l}%`;

  if (h === 0 && s === 0 && l === 0) {
    appState.isHslPreviewing = false;
    renderApp();
    return;
  }

  // Create or reuse proxy canvas
  if (!appState.hslProxyCanvas) {
    appState.hslProxyCanvas = document.createElement('canvas');
  }
  const proxy = appState.hslProxyCanvas;
  proxy.width = doc.width;
  proxy.height = doc.height;
  const pCtx = proxy.getContext('2d');

  // HSL only ever affects the active layer, so the preview must too:
  // composite everything except the active layer, then draw the active
  // layer with the adjustment applied (mirroring the hue-saturation op)
  const activeLayer = getActiveLayer(doc);
  const base = renderComposite(doc, null, activeLayer ? activeLayer.id : null);
  pCtx.drawImage(base, 0, 0);

  if (activeLayer && activeLayer.visible && activeLayer.opacity > 0) {
    const lw = activeLayer.canvas.width;
    const lh = activeLayer.canvas.height;
    const tmp = document.createElement('canvas');
    tmp.width = lw;
    tmp.height = lh;
    const tCtx = tmp.getContext('2d', { willReadFrequently: true });
    tCtx.drawImage(activeLayer.canvas, 0, 0);

    const imgData = tCtx.getImageData(0, 0, lw, lh);
    const { maskData, bounds } = getLayerHslTargets(doc, activeLayer);
    applyHslToImageData(imgData, maskData, h, s, l, bounds, lw, lh);
    tCtx.putImageData(imgData, 0, 0);

    pCtx.globalAlpha = activeLayer.opacity;
    pCtx.drawImage(tmp, activeLayer.x, activeLayer.y);
    pCtx.globalAlpha = 1;
  }

  appState.isHslPreviewing = true;
  renderApp();
}

hslH.oninput = updateHslPreview;
hslS.oninput = updateHslPreview;
hslL.oninput = updateHslPreview;

btnResetHsl.onclick = () => {
  resetHslPreview();
  renderApp();
};

btnApplyHsl.onclick = () => {
  const h = parseInt(hslH.value, 10);
  const s = parseInt(hslS.value, 10);
  const l = parseInt(hslL.value, 10);

  resetHslPreview();
  if (h !== 0 || s !== 0 || l !== 0) {
    executeOp({
      name: 'hue-saturation',
      params: { hue: h, saturation: s, lightness: l }
    });
  }
};

// Blur Controls
blurStrength.oninput = () => {
  blurStrengthVal.textContent = `${blurStrength.value}%`;
};
blurSize.oninput = () => {
  blurSizeVal.textContent = `${blurSize.value}px`;
};
btnApplyBlur.onclick = () => {
  if (!appState.document) return;
  executeOp({
    name: 'blur',
    params: {
      radius: parseInt(blurSize.value, 10) || 8,
      strength: (parseInt(blurStrength.value, 10) || 0) / 100
    }
  });
};

// Delete Action
btnApplyDelete.onclick = () => {
  if (!appState.document || !appState.document.selection) {
    alert('Please create an active selection to delete.');
    return;
  }
  const mode = document.querySelector('input[name="delete-mode"]:checked').value;
  const color = deleteFillColor.value;
  executeOp({
    name: 'delete',
    params: { mode, color }
  });
};

// Clone Brush Controls
cloneSize.oninput = (e) => {
  appState.cloneBrushSize = parseInt(e.target.value, 10);
  cloneSizeVal.textContent = `${appState.cloneBrushSize}px`;
  renderOverlay();
};
cloneHardness.oninput = (e) => {
  appState.cloneBrushHardness = parseInt(e.target.value, 10) / 100;
  cloneHardnessVal.textContent = `${e.target.value}%`;
};
btnSetSource.onclick = () => {
  appState.isSettingCloneSource = true;
  btnSetSource.classList.remove('btn-secondary');
  btnSetSource.classList.add('btn-primary');
  cloneSourceStatus.textContent = 'Click on image to set sample point...';
};

// Dropper / Color Sampling
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Samples the composited pixel under docPos from the display canvas,
 * stores it as appState.primaryColor and updates the dropper UI.
 */
function sampleColorAt(docPos) {
  if (!appState.document) return;
  const x = Math.floor(docPos.rawX);
  const y = Math.floor(docPos.rawY);
  const doc = appState.document;
  if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return;

  const px = displayCanvas.getContext('2d').getImageData(x, y, 1, 1).data;
  const hex = rgbToHex(px[0], px[1], px[2]);
  appState.primaryColor = hex;

  dropperSwatch.style.background = hex;
  dropperHex.textContent = hex.toUpperCase();
  fillColorInput.value = hex;
}

btnCopyHex.onclick = () => {
  if (dropperHex.textContent && dropperHex.textContent !== '—') {
    navigator.clipboard.writeText(dropperHex.textContent);
  }
};

// Fill Controls
fillColorInput.value = appState.primaryColor;
fillColorInput.oninput = () => {
  appState.primaryColor = fillColorInput.value;
};
fillOpacity.oninput = () => {
  fillOpacityVal.textContent = `${fillOpacity.value}%`;
};
fillTolerance.oninput = () => {
  fillToleranceVal.textContent = `${fillTolerance.value}`;
};

// Text Controls
[textContentInput, textFontFace, textFontSize, textColorInput].forEach(el => {
  el.addEventListener('input', () => {
    if (appState.textEditSession) previewTextEdit();
  });
});
textContentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    commitTextEdit();
    textContentInput.blur();
  }
});

btnApplyText.onclick = () => {
  const t = getActiveTextLayer();
  if (!t) {
    alert('Click the canvas to create a text layer first.');
    return;
  }
  const desired = readTextBarValues();
  const hasSessionForLayer = appState.textEditSession &&
    appState.textEditSession.layerId === t.id;
  if (!hasSessionForLayer) loadTextSession(t);

  // Force bar values back in case loading clobbered them with stored meta
  textContentInput.value = desired.text;
  textFontFace.value = desired.fontFace;
  textFontSize.value = desired.fontSize;
  textColorInput.value = desired.color;

  previewTextEdit();
  commitTextEdit();
};

btnRasterizeText.onclick = () => {
  commitTextEdit();
  const t = getActiveTextLayer();
  if (!t) return;
  executeOp({ name: 'rasterize-layer', params: { layerId: t.id } });
  btnRasterizeText.disabled = true;
};

// Recorder UI
btnRecord.onclick = () => {
  const isRec = appState.recorder.toggle();
  btnRecord.classList.toggle('recording', isRec);
  recordBtnLabel.textContent = isRec ? 'Recording...' : 'Record';
};

appState.recorder.onChange(({ isRecording, actions }) => {
  btnRecord.classList.toggle('recording', isRecording);
  recordBtnLabel.textContent = isRecording ? 'Recording...' : 'Record';

  if (actions.length === 0) {
    actionsList.innerHTML = '<p class="empty-state">No steps recorded. Hit Record to capture actions.</p>';
    return;
  }

  actionsList.innerHTML = '';
  actions.forEach((act, idx) => {
    const item = document.createElement('div');
    item.className = 'layer-item';
    item.style.justifyContent = 'space-between';
    item.innerHTML = `
      <span style="font-family: monospace; font-size: 11px;">${idx + 1}. <strong>${act.name}</strong></span>
      <button class="btn btn-icon btn-sm" style="color: var(--danger-color); padding: 2px 5px;" title="Remove Step">✕</button>
    `;
    item.querySelector('button').onclick = () => {
      appState.recorder.removeStep(idx);
    };
    actionsList.appendChild(item);
  });
});

btnClearActions.onclick = () => appState.recorder.clear();
btnExportActions.onclick = () => appState.recorder.exportToJson();
loadActionsInput.onchange = (e) => {
  if (e.target.files[0]) {
    appState.recorder.importFromJson(e.target.files[0]);
    loadActionsInput.value = '';
  }
};

// Modals
btnExportModal.onclick = () => {
  if (appState.document) showExportModal(appState.document);
};
btnBatchModal.onclick = () => {
  showBatchQueueModal(appState.recorder);
};

// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
    return;
  }

  // Cancel active layer transform drag
  if (e.key === 'Escape' && appState.transformDrag) {
    e.preventDefault();
    cancelTransformDrag();
    return;
  }

  // Cancel in-flight text editing session
  if (e.key === 'Escape' && appState.textEditSession && e.target.tagName !== 'INPUT') {
    e.preventDefault();
    cancelTextEdit();
    return;
  }

  // Spacebar pan mode
  if (e.code === 'Space') {
    e.preventDefault();
    if (!appState.isSpacePressed) {
      appState.isSpacePressed = true;
      canvasViewport.style.cursor = 'grab';
    }
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) {
      if (appState.history.canRedo()) {
        appState.document = appState.history.redo(appState.document);
        renderApp();
      }
    } else {
      if (appState.history.canUndo()) {
        appState.document = appState.history.undo(appState.document);
        renderApp();
      }
    }
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    if (appState.history.canRedo()) {
      appState.document = appState.history.redo(appState.document);
      renderApp();
    }
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    executeOp({ name: 'clear-selection' });
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (appState.document && appState.document.selection) {
      e.preventDefault();
      executeOp({ name: 'delete', params: { mode: 'transparent' } });
    }
  } else if (e.key === '[') {
    appState.cloneBrushSize = Math.max(5, appState.cloneBrushSize - 5);
    cloneSize.value = appState.cloneBrushSize;
    cloneSizeVal.textContent = `${appState.cloneBrushSize}px`;
    renderOverlay();
  } else if (e.key === ']') {
    appState.cloneBrushSize = Math.min(200, appState.cloneBrushSize + 5);
    cloneSize.value = appState.cloneBrushSize;
    cloneSizeVal.textContent = `${appState.cloneBrushSize}px`;
    renderOverlay();
  } else if (e.key.toLowerCase() === 'v') {
    setActiveTool('transform');
  } else if (e.key.toLowerCase() === 'h') {
    setActiveTool('pan');
  } else if (e.key.toLowerCase() === 'm') {
    setActiveTool('select-rect');
  } else if (e.key.toLowerCase() === 'l') {
    setActiveTool('select-lasso');
  } else if (e.key.toLowerCase() === 'c') {
    setActiveTool('crop');
  } else if (e.key.toLowerCase() === 'r') {
    setActiveTool('transform');
  } else if (e.key.toLowerCase() === 'u') {
    setActiveTool('hue-saturation');
  } else if (e.key.toLowerCase() === 'b') {
    setActiveTool('blur');
  } else if (e.key.toLowerCase() === 'i') {
    setActiveTool('dropper');
  } else if (e.key.toLowerCase() === 'g') {
    setActiveTool('fill');
  } else if (e.key.toLowerCase() === 't') {
    setActiveTool('text');
  } else if (e.key.toLowerCase() === 's') {
    setActiveTool('clone-brush');
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    appState.isSpacePressed = false;
    canvasViewport.style.cursor = appState.activeTool === 'pan' ? 'grab' : (appState.activeTool === 'transform' ? 'move' : '');
  }
});

// Clipboard Image Paste Handler (Ctrl+V from browser/clipboard -> Auto New Layer)
window.addEventListener('paste', (e) => {
  if (e.clipboardData && e.clipboardData.items) {
    for (const item of e.clipboardData.items) {
      if (item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        if (!blob) continue;

        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            if (!appState.document) {
              loadNewImage(img, 'Pasted Image');
            } else {
              const doc = appState.document;
              appState.history.pushState(doc, 'paste-layer');

              const imgW = img.naturalWidth || img.width;
              const imgH = img.naturalHeight || img.height;
              // Center layer in current document
              const x = Math.round((doc.width - imgW) / 2);
              const y = Math.round((doc.height - imgH) / 2);

              const newL = createLayer(
                null,
                `Pasted Layer ${doc.layers.length + 1}`,
                imgW,
                imgH,
                img,
                x,
                y
              );

              doc.layers.push(newL);
              doc.activeLayerId = newL.id;
              activateTransformForNewLayer();
              renderApp();
            }
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(blob);
        e.preventDefault();
        break;
      }
    }
  }
});

// Drag & Drop Image Files from File Explorer -> New Layer(s)
function loadDroppedImageFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => resolve({ img, name: file.name });
      img.onerror = () => resolve(null);
      img.src = event.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function addDroppedImagesAsLayers(files) {
  const results = (await Promise.all(files.map(loadDroppedImageFile))).filter(Boolean);
  if (results.length === 0) return;

  let doc = appState.document;
  // No open document: first dropped image becomes the new document
  if (!doc) {
    loadNewImage(results[0].img, results[0].name);
    doc = appState.document;
    results.shift();
  }
  if (!doc || results.length === 0) return;

  appState.history.pushState(doc, 'drop-images');

  for (const { img, name } of results) {
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    // Center layer in current document
    const x = Math.round((doc.width - imgW) / 2);
    const y = Math.round((doc.height - imgH) / 2);

    const newL = createLayer(
      null,
      name.replace(/\.[^/.]+$/, ''),
      imgW,
      imgH,
      img,
      x,
      y
    );

    doc.layers.push(newL);
    doc.activeLayerId = newL.id;
  }

  appState.multiSelectedLayerIds = [];
  activateTransformForNewLayer();
  renderApp();
}

function setupImageDropTarget(target) {
  let dragDepth = 0;

  function setHighlight(on) {
    target.style.outline = on ? '2px dashed var(--accent-color)' : '';
    target.style.outlineOffset = on ? '-2px' : '';
  }

  target.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    dragDepth++;
    setHighlight(true);
  });

  target.addEventListener('dragover', (e) => {
    e.preventDefault(); // Required for drop to fire
  });

  target.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setHighlight(false);
  });

  target.addEventListener('drop', (e) => {
    e.preventDefault(); // Prevent browser opening the file
    dragDepth = 0;
    setHighlight(false);

    const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) addDroppedImagesAsLayers(files);
  });
}

setupImageDropTarget(canvasViewport);
setupImageDropTarget(layersPane);

// Load sample / image functions
export function loadNewImage(imageOrCanvas, filename = 'Image') {
  appState.document = createDocumentFromImage(imageOrCanvas, filename);
  appState.history.clear();
  appState.viewport.fitToWindow(appState.document);
  renderApp();
}

function generateSampleImage() {
  const width = 1200;
  const height = 800;
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = width;
  sampleCanvas.height = height;
  const ctx = sampleCanvas.getContext('2d');

  // Scenic sunset sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.7);
  skyGrad.addColorStop(0, '#0f172a');
  skyGrad.addColorStop(0.3, '#312e81');
  skyGrad.addColorStop(0.6, '#db2777');
  skyGrad.addColorStop(0.85, '#f97316');
  skyGrad.addColorStop(1, '#fde047');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, height);

  // Glowing Sun
  const sunGrad = ctx.createRadialGradient(width * 0.5, height * 0.55, 10, width * 0.5, height * 0.55, 120);
  sunGrad.addColorStop(0, '#ffffff');
  sunGrad.addColorStop(0.3, '#fef08a');
  sunGrad.addColorStop(0.7, '#f97316');
  sunGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.55, 120, 0, Math.PI * 2);
  ctx.fill();

  // Mountain silhouettes
  ctx.fillStyle = '#1e1b4b';
  ctx.beginPath();
  ctx.moveTo(0, height * 0.7);
  ctx.lineTo(width * 0.2, height * 0.45);
  ctx.lineTo(width * 0.45, height * 0.65);
  ctx.lineTo(width * 0.7, height * 0.4);
  ctx.lineTo(width * 0.9, height * 0.6);
  ctx.lineTo(width, height * 0.55);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  // Foreground hills
  ctx.fillStyle = '#09090b';
  ctx.beginPath();
  ctx.moveTo(0, height * 0.75);
  ctx.quadraticCurveTo(width * 0.35, height * 0.68, width * 0.6, height * 0.85);
  ctx.quadraticCurveTo(width * 0.85, height * 0.95, width, height * 0.8);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  // Sample watermark text
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = 'bold 24px -apple-system, sans-serif';
  ctx.fillText('PhotoEditor Studio • Sample 1200×800', 40, height - 40);

  return sampleCanvas;
}

// File and sample buttons
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      loadNewImage(img, file.name);
      fileInput.value = '';
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

// Zoom Controls
btnZoomIn.addEventListener('click', () => {
  if (!appState.document) return;
  appState.viewport.setZoom(appState.viewport.zoom * 1.25, appState.document);
  zoomPercentage.textContent = `${Math.round(appState.viewport.zoom * 100)}%`;
});

btnZoomOut.addEventListener('click', () => {
  if (!appState.document) return;
  appState.viewport.setZoom(appState.viewport.zoom / 1.25, appState.document);
  zoomPercentage.textContent = `${Math.round(appState.viewport.zoom * 100)}%`;
});

btnFitScreen.addEventListener('click', () => {
  if (!appState.document) return;
  appState.viewport.fitToWindow(appState.document);
  zoomPercentage.textContent = `${Math.round(appState.viewport.zoom * 100)}%`;
});

// Undo / Redo listeners
btnUndo.addEventListener('click', () => {
  if (appState.history.canUndo()) {
    appState.document = appState.history.undo(appState.document);
    renderApp();
  }
});

btnRedo.addEventListener('click', () => {
  if (appState.history.canRedo()) {
    appState.document = appState.history.redo(appState.document);
    renderApp();
  }
});

appState.history.onChange((state) => {
  btnUndo.disabled = !state.canUndo;
  btnRedo.disabled = !state.canRedo;
  if (appState.historyUI) appState.historyUI.render(state);
});

// Sidebar tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const tabId = `tab-${btn.dataset.tab}`;
    const content = document.getElementById(tabId);
    if (content) content.classList.add('active');
  });
});

// Init on load
window.addEventListener('DOMContentLoaded', () => {
  const sample = generateSampleImage();
  loadNewImage(sample, 'Sunset_Sample.png');
});
