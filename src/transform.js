/**
 * Pure geometry helpers for interactive layer transform handles.
 * No DOM dependencies — safe to unit test headlessly.
 */

export const CORNER_HANDLES = ['nw', 'ne', 'se', 'sw'];
export const HANDLE_IDS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export const HANDLE_CURSORS = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize'
};

/**
 * Returns the 8 handle positions for a rect { x, y, w, h }
 */
export function getHandlePositions(rect) {
  const { x, y, w, h } = rect;
  const midX = x + w / 2;
  const midY = y + h / 2;
  return {
    nw: { x, y },
    n: { x: midX, y },
    ne: { x: x + w, y },
    e: { x: x + w, y: midY },
    se: { x: x + w, y: y + h },
    s: { x: midX, y: y + h },
    sw: { x, y: y + h },
    w: { x, y: midY }
  };
}

/**
 * Finds which handle (if any) is within tolerance of a point.
 * @param {Object} rect - { x, y, w, h }
 * @param {number} px - point x
 * @param {number} py - point y
 * @param {number} tolerance - max distance in the same units as the rect
 * @returns {string|null} handle id or null
 */
export function hitTestHandles(rect, px, py, tolerance) {
  const positions = getHandlePositions(rect);
  let closest = null;
  let closestDist = Infinity;
  for (const id of HANDLE_IDS) {
    const p = positions[id];
    const dist = Math.hypot(px - p.x, py - p.y);
    if (dist <= tolerance && dist < closestDist) {
      closest = id;
      closestDist = dist;
    }
  }
  return closest;
}

/**
 * Computes the new rect when dragging one handle of a rect.
 *
 * Rules:
 * - Corner handles scale proportionally when keepRatio is true; the opposite
 *   corner stays pinned. With keepRatio false both axes stretch independently.
 * - Edge handles stretch a single axis; the opposite edge stays pinned.
 * - Result dimensions are clamped to >= minSize (no flipping through the anchor).
 *
 * @param {Object} startRect - { x, y, w, h } rect at drag start
 * @param {string} handleId - nw|n|ne|e|se|s|sw|w
 * @param {number} posX - pointer x
 * @param {number} posY - pointer y
 * @param {boolean} keepRatio - constrain corner drags to the original aspect ratio
 * @param {number} minSize - minimum width/height
 * @returns {Object} new rect { x, y, w, h } (rounded)
 */
export function computeHandleResize(startRect, handleId, posX, posY, keepRatio, minSize = 1) {
  const s = startRect;
  const horizontal = handleId.includes('e') || handleId.includes('w');
  const vertical = handleId.includes('n') || handleId.includes('s');

  if (!horizontal && !vertical) return { ...s };

  // Anchor point that stays fixed while dragging
  const anchorX = handleId.includes('w') ? s.x + s.w : handleId.includes('e') ? s.x : s.x + s.w / 2;
  const anchorY = handleId.includes('n') ? s.y + s.h : handleId.includes('s') ? s.y : s.y + s.h / 2;

  let newW = s.w;
  let newH = s.h;

  if (horizontal) {
    newW = Math.max(minSize, handleId.includes('w') ? anchorX - posX : posX - anchorX);
  }
  if (vertical) {
    newH = Math.max(minSize, handleId.includes('n') ? anchorY - posY : posY - anchorY);
  }

  if (keepRatio && horizontal && vertical) {
    const ratio = Math.max(newW / s.w, newH / s.h);
    newW = Math.max(minSize, s.w * ratio);
    newH = Math.max(minSize, s.h * ratio);
  }

  const newX = horizontal && handleId.includes('w') ? anchorX - newW : s.x;
  const newY = vertical && handleId.includes('n') ? anchorY - newH : s.y;

  return {
    x: Math.round(newX),
    y: Math.round(newY),
    w: Math.round(newW),
    h: Math.round(newH)
  };
}
