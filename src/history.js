/**
 * Snapshot-based Undo / Redo History Stack
 * Keeps up to maxStates full document snapshots.
 */

import { cloneDocument } from './document.js';

export class HistoryManager {
  constructor(maxStates = 20) {
    this.maxStates = maxStates;
    this.undoStack = []; // Document[]
    this.redoStack = []; // Document[]
    this.listeners = new Set();
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    const state = {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length
    };
    for (const cb of this.listeners) {
      cb(state);
    }
  }

  /**
   * Push current document state before executing an operation
   */
  pushState(doc) {
    this.undoStack.push(cloneDocument(doc));
    if (this.undoStack.length > this.maxStates) {
      this.undoStack.shift();
    }
    // Any new action clears the redo branch
    this.redoStack = [];
    this.notify();
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Performs undo: returns the previous document state, pushing current to redo
   */
  undo(currentDoc) {
    if (!this.canUndo()) return currentDoc;
    const prevState = this.undoStack.pop();
    this.redoStack.push(cloneDocument(currentDoc));
    this.notify();
    return prevState;
  }

  /**
   * Performs redo: returns the forward document state, pushing current to undo
   */
  redo(currentDoc) {
    if (!this.canRedo()) return currentDoc;
    const nextState = this.redoStack.pop();
    this.undoStack.push(cloneDocument(currentDoc));
    this.notify();
    return nextState;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }
}
