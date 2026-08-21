/**
 * Photo Editor - Main Application Controller
 */

import { createDocument, createDocumentFromImage, createLayer, renderComposite, cloneDocument, getActiveLayer } from './document.js';
import { Viewport } from './coords.js';
import { HistoryManager } from './history.js';
import { applyOp } from './ops.js';
import { ActionRecorder } from './recorder.js';
import { setupLayersPanel } from './layers-panel.js';
import { showExportModal } from './tools/export.js';
import { showBatchQueueModal } from './batch-queue.js';
import { calculateAspectRatioBounds } from './tools/select-rect.js';
import { interpolateStroke, applyStamp, getCircularBrushMask } from './tools/clone-brush.js';
import { getLayerHslTargets, applyHslToImageData } from './tools/hue-saturation.js';

import { getHandlePositions, hitTestHandles, computeHandleResize, HANDLE_IDS, CORNER_HANDLES, HANDLE_CURSORS } from './transform.js';

// Load tool op handlers
import './tools/select-rect.js';
import './tools/select-lasso.js';
import './tools/crop.js';
import './tools/resize.js';
import './tools/hue-saturation.js';
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

  // Move Tool state
  moveStartLayerPos: null,
  moveDelta: { x: 0, y: 0 },

  // Interactive layer transform state (Transform tool handles)
  transformDrag: null,   // { layerId, handleId, startRect, previewRect }
  transformHover: null,  // hovered handle id or null

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
const btnRecord = document.getElementById('btn-record');
const recordBtnLabel = document.getElementById('record-btn-label');
const btnBatchModal = document.getElementById('btn-batch-modal');
const btnExportModal = document.getElementById('btn-export-modal');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnFitScreen = document.getElementById('btn-fit-screen');
const zoomPercentage = document.getElementById('zoom-percentage');
const docDimensions = document.getElementById('doc-dimensions');

// Tool options elements
const toolButtons = document.querySelectorAll('.tool-btn');
const selectRatio = document.getElementById('select-ratio');
const optRatioWidth = document.getElementById('opt-ratio-width');
const optRatioHeight = document.getElementById('opt-ratio-height');
const optRectFeather = document.getElementById('opt-rect-feather');
const optLassoFeather = document.getElementById('opt-lasso-feather');
const btnRectDeselect = document.getElementById('btn-rect-deselect');
const btnLassoDeselect = document.getElementById('btn-lasso-deselect');

const btnApplyCrop = document.getElementById('btn-apply-crop');
const resizeW = document.getElementById('resize-w');
const resizeH = document.getElementById('resize-h');
const resizeScope = document.getElementById('resize-scope');
const resizeLockRatio = document.getElementById('resize-lock-ratio');
const btnApplyResize = document.getElementById('btn-apply-resize');

const hslH = document.getElementById('hsl-h');
const hslS = document.getElementById('hsl-s');
const hslL = document.getElementById('hsl-l');
const hslHVal = document.getElementById('hsl-h-val');
const hslSVal = document.getElementById('hsl-s-val');
const hslLVal = document.getElementById('hsl-l-val');
const btnApplyHsl = document.getElementById('btn-apply-hsl');
const btnResetHsl = document.getElementById('btn-reset-hsl');

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
 * Execute an operation on the document with Undo snapshot and Recorder capture
 */
export function executeOp(op, record = true) {
  if (!appState.document || !op) return;

  // 1. Push state to Undo History before mutating
  appState.history.pushState(appState.document);

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
    overlayCanvas.width = doc.width;
    overlayCanvas.height = doc.height;
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

  // Sync overlay canvas CSS size to display canvas so pointer coords align correctly
  overlayCanvas.style.width = displayCanvas.style.width;
  overlayCanvas.style.height = displayCanvas.style.height;

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
function renderOverlay() {
  if (!appState.document) return;
  const doc = appState.document;
  const ctx = overlayCanvas.getContext('2d');
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  // 1. Render active selection with marching ants
  if (doc.selection) {
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.lineDashOffset = marchingAntsOffset;

    // Black background stroke
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.setLineDash([6, 6]);
    if (doc.selection.type === 'rect') {
      const { x, y, w, h } = doc.selection.bounds;
      ctx.strokeRect(x, y, w, h);
    } else if (doc.selection.path) {
      ctx.stroke(doc.selection.path);
    }

    // White foreground stroke
    ctx.strokeStyle = '#ffffff';
    ctx.lineDashOffset = marchingAntsOffset + 6;
    if (doc.selection.type === 'rect') {
      const { x, y, w, h } = doc.selection.bounds;
      ctx.strokeRect(x, y, w, h);
    } else if (doc.selection.path) {
      ctx.stroke(doc.selection.path);
    }

    ctx.restore();
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
        ctx.save();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
        ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
        ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
        ctx.restore();
      }
    } else if (appState.activeTool === 'select-lasso' && appState.lassoPoints.length > 1) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
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
          activeLayer.x = appState.moveStartLayerPos.x + dx;
          activeLayer.y = appState.moveStartLayerPos.y + dy;
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
        params: { bounds, feather }
      });
    } else if (appState.document.selection) {
      // Plain click (no drag) clears the current selection
      executeOp({ name: 'clear-selection' });
    }
  } else if (appState.activeTool === 'select-lasso') {
    const feather = parseInt(optLassoFeather.value, 10) || 0;
    if (appState.lassoPoints.length >= 3) {
      executeOp({
        name: 'select-lasso',
        params: { points: appState.lassoPoints, feather }
      });
    } else if (appState.document.selection) {
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
              appState.history.pushState(doc);

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

appState.history.onChange(({ canUndo, canRedo }) => {
  btnUndo.disabled = !canUndo;
  btnRedo.disabled = !canRedo;
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
