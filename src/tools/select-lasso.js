/**
 * Freehand Lasso Selection Tool & Op
 */

import { createLassoSelection, createLassoPart, combineSelection } from '../selection.js';
import { registerOp } from '../ops.js';

/**
 * Register 'select-lasso' op
 * params.mode: 'new' (replace) | 'add' | 'subtract' — add/subtract combine with existing selection
 */
registerOp('select-lasso', (doc, params) => {
  const mode = (params && params.mode) || 'new';

  if (!params || !params.points || params.points.length < 3) {
    if (mode === 'new') doc.selection = null;
    return doc;
  }
  const feather = params.feather || 0;

  // Add/subtract with no selection to modify behaves as a fresh selection
  const effectiveMode = doc.selection ? mode : 'new';

  if (effectiveMode !== 'new') {
    const part = createLassoPart(params.points);
    if (!part) return doc;
    part.op = effectiveMode === 'subtract' ? 'subtract' : 'add';
    doc.selection = combineSelection(doc.selection, part, feather);
  } else {
    doc.selection = createLassoSelection(params.points, feather);
  }
  return doc;
});
