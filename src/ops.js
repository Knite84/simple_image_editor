/**
 * Operation Dispatcher & Registry
 * Rule: applyOp(doc, op) -> newDoc
 * Op: { name: string, params: object, absolute?: object, relative?: object, sourceDocSize?: object }
 */

import { cloneDocument } from './document.js';

const opRegistry = new Map();

/**
 * Register a pure op handler
 * @param {string} opName 
 * @param {(doc: Object, params: Object) => Object} handler - pure function returning modified/cloned doc
 */
export function registerOp(opName, handler) {
  opRegistry.set(opName, handler);
}

/**
 * Dispatches an operation against a document
 * @param {Object} document 
 * @param {{name: string, params: Object}} op 
 * @returns {Object} New document state
 */
export function applyOp(document, op) {
  if (!op || !op.name) {
    console.error('Invalid op:', op);
    return document;
  }

  const handler = opRegistry.get(op.name);
  if (!handler) {
    console.warn(`Op handler "${op.name}" not registered.`);
    return document;
  }

  // Clone document before applying handler to guarantee purity
  const workingDoc = cloneDocument(document);
  return handler(workingDoc, op.params || {});
}

/**
 * Helper to check if op is registered
 */
export function hasOp(opName) {
  return opRegistry.has(opName);
}
