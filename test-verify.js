/**
 * Headless Test Script for Core Math & Logic
 */
import { rgbToHsl, hslToRgb } from './src/tools/hue-saturation.js';
import { calculateAspectRatioBounds } from './src/tools/select-rect.js';
import { computeHandleResize, hitTestHandles } from './src/transform.js';

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
