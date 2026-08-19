/**
 * Headless Test Script for Core Math & Logic
 */
import { rgbToHsl, hslToRgb } from './src/tools/hue-saturation.js';
import { calculateAspectRatioBounds } from './src/tools/select-rect.js';

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

console.log('✅ All math & core helper tests passed successfully!');
