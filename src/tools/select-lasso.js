/**
 * Freehand Lasso Selection Tool & Op
 */

import { createLassoSelection } from '../selection.js';
import { registerOp } from '../ops.js';

/**
 * Register 'select-lasso' op
 */
registerOp('select-lasso', (doc, params) => {
  if (!params || !params.points || params.points.length < 3) {
    doc.selection = null;
    return doc;
  }
  const feather = params.feather || 0;
  doc.selection = createLassoSelection(params.points, feather);
  return doc;
});
