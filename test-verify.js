/**
 * Headless Test Script for Core Math & Logic
 */
import { rgbToHsl, hslToRgb } from './src/tools/hue-saturation.js';
import { calculateAspectRatioBounds } from './src/tools/select-rect.js';
import { computeHandleResize, hitTestHandles } from './src/transform.js';
import { floodFillScanline } from './src/tools/fill.js';
import { HistoryManager } from './src/history.js';

// Minimal DOM stub so HistoryManager's cloneDocument path can run headlessly.
// Must exist before any pushState/undo/redo call executes.
globalThis.document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage() {},
      fillText() {},
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      measureText: () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
    })
  })
};

function makePixelBuffer(w, h, fill) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = fill[3];
  }
  return data;
}

const RED = { r: 255, g: 0, b: 0 };

console.log('Testing flood fill (contiguity, tolerance, alpha)...');
{
  // Fills the whole uniform canvas
  const data = makePixelBuffer(4, 4, [100, 100, 100, 255]);
  floodFillScanline(data, 4, 4, 0, 0, RED, 0);
  if (data[0] !== 255 || data[(15 * 4) + 2] !== 0 || data[(15 * 4) + 3] !== 255) {
    throw new Error('Flood fill should cover a uniform canvas');
  }

  // Contiguity: two same-color squares separated by a barrier — only the
  // square containing the seed is filled
  const w = 5, h = 3;
  const grid = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    const v = x === 2 ? 0 : 200; // column of black barrier at x=2
    grid[i * 4] = v; grid[i * 4 + 1] = v; grid[i * 4 + 2] = v; grid[i * 4 + 3] = 255;
  }
  floodFillScanline(grid, w, h, 0, 0, RED, 0);
  const leftFilled = grid[4] === 255 && grid[4 + 1] === 0;
  const rightUntouched = grid[(3 * 4)] === 200;
  if (!leftFilled || !rightUntouched) {
    throw new Error('Flood fill must not jump contiguous barriers');
  }

  // Tolerance: neighbor within tolerance joins, distant color does not
  const tol = new Uint8ClampedArray([250, 250, 250, 255, 240, 240, 240, 255, 10, 10, 10, 255]);
  floodFillScanline(tol, 3, 1, 0, 0, RED, 0.05); // ~5% of 510 ≈ dist 25
  if (tol[4] !== 255 || tol[(2 * 4)] === 255) {
    throw new Error('Tolerance threshold misbehaved');
  }
}
console.log('✅ Flood fill tests passed');

console.log('Testing History labels & entries...');
{
  const fakeDoc = () => ({
    id: 'd', name: 'n', width: 4, height: 4,
    layers: [{ id: 'l1', name: 'L', canvas: { width: 2, height: 2 }, visible: true, opacity: 1, x: 0, y: 0, meta: null }],
    activeLayerId: 'l1',
    selection: null
  });

  const hm = new HistoryManager(30);
  hm.pushState(fakeDoc(), 'op-a');
  hm.pushState(fakeDoc(), 'op-b');

  let entries = hm.getEntries();
  if (!(entries[0].kind === 'current' && entries[1].label === 'op-b' && entries[2].label === 'op-a')) {
    throw new Error('History entries order wrong: ' + JSON.stringify(entries));
  }

  const undoneDoc = hm.undo(fakeDoc());
  if (hm.redoLabels[0] !== 'op-b') throw new Error('Undo should carry its label to redo');

  entries = hm.getEntries();
  if (!(entries[0].kind === 'future' && entries[0].label === 'op-b' && entries[1].kind === 'current')) {
    throw new Error('History should list future steps after undo: ' + JSON.stringify(entries));
  }

  hm.redo(undoneDoc);
  if (hm.undoLabels.length !== 2 || hm.undoLabels[1] !== 'op-b') {
    throw new Error('Redo did not restore label ordering');
  }

  // Depth cap keeps stacks trimmed
  const small = new HistoryManager(2);
  small.pushState(fakeDoc(), 'one');
  small.pushState(fakeDoc(), 'two');
  small.pushState(fakeDoc(), 'three');
  if (small.undoStack.length !== 2 || small.undoLabels.length !== 2 || small.undoLabels[0] !== 'two') {
    throw new Error('History depth cap failed');
  }
}
console.log('✅ History tests passed');

console.log('Testing HSL conversion...');
const [h, s, l] = rgbToHsl(255, 0, 0); // Pure red
console.log('Red -> HSL:', { h, s, l });
if (h !== 0 || Math.abs(s - 1) > 0.01 || Math.abs(l - 0.5) > 0.01) {
  throw new Error('HSL conversion failed for pure red');
}

const [r, g, b] = hslToRgb(h, s, l);
console.log('HSL -> RGB:', { r, g, b });
if (r !== 255 || g !== 0 || b !== 0) {
  throw new Error('RGB conversion failed for pure red');
}

console.log('Testing Aspect Ratio calculations...');
const bounds16_9 = calculateAspectRatioBounds(0, 0, 160, 90, '16:9');
console.log('16:9 bounds:', bounds16_9);
if (bounds16_9.w !== 160 || bounds16_9.h !== 90) {
  throw new Error('Aspect ratio 16:9 calculation failed');
}

const boundsSquare = calculateAspectRatioBounds(10, 10, 110, 60, '1:1');
console.log('1:1 bounds:', boundsSquare);
if (boundsSquare.w !== boundsSquare.h) {
  throw new Error('Square aspect ratio failed');
}

console.log('Testing Transform handle geometry...');
const baseRect = { x: 10, y: 10, w: 100, h: 50 };

// SE corner proportional drag (ratios equal -> exact)
const seProp = computeHandleResize(baseRect, 'se', 160, 85, true);
if (seProp.x !== 10 || seProp.y !== 10 || seProp.w !== 150 || seProp.h !== 75) {
  throw new Error('SE proportional corner failed: ' + JSON.stringify(seProp));
}

// NE corner proportional drag (opposite corner pinned, dominant axis wins)
const neProp = computeHandleResize(baseRect, 'ne', 110, 20, true);
if (neProp.x !== 10 || neProp.y !== 10 || neProp.w !== 100 || neProp.h !== 50) {
  throw new Error('NE proportional corner failed: ' + JSON.stringify(neProp));
}

// E edge stretches width only
const eEdge = computeHandleResize({ x: 0, y: 0, w: 100, h: 100 }, 'e', 200, 500, false);
if (eEdge.w !== 200 || eEdge.h !== 100 || eEdge.x !== 0 || eEdge.y !== 0) {
  throw new Error('E edge stretch failed: ' + JSON.stringify(eEdge));
}

// W edge keeps right edge pinned and moves x left
const wEdge = computeHandleResize({ x: 10, y: 10, w: 90, h: 90 }, 'w', -10, 55, false);
if (wEdge.x !== -10 || wEdge.w !== 110 || wEdge.h !== 90 || wEdge.y !== 10) {
  throw new Error('W edge stretch failed: ' + JSON.stringify(wEdge));
}

// Free corner stretch (keepRatio=false) is independent per axis
const freeCorner = computeHandleResize(baseRect, 'sw', 20, 200, false);
if (freeCorner.w !== 90 || freeCorner.h !== 190 || freeCorner.x !== 20 || freeCorner.y !== 10) {
  throw new Error('Free corner stretch failed: ' + JSON.stringify(freeCorner));
}

// Dimensions clamp to minimum instead of flipping through the anchor
const clamped = computeHandleResize(baseRect, 'se', -500, -500, false);
if (clamped.w < 1 || clamped.h < 1) {
  throw new Error('Min size clamp failed: ' + JSON.stringify(clamped));
}

// Hit testing finds the nearest handle within tolerance
const hit = hitTestHandles(baseRect, 12, 11, 5);
if (hit !== 'nw') {
  throw new Error('Handle hit test failed, expected nw got: ' + hit);
}
const miss = hitTestHandles(baseRect, 200, 200, 5);
if (miss !== null) {
  throw new Error('Handle hit test should miss, got: ' + miss);
}

console.log('✅ All math & core helper tests passed successfully!');
