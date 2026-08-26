/**
 * Snapshot-based Undo / Redo History Stack
 * Keeps up to maxStates full document snapshots, each labeled with the name
 * of the action that follows it (used by the History panel).
 */

import { cloneDocument } from './document.js';

export class HistoryManager {
  constructor(maxStates = 30) {
    this.maxStates = maxStates;
    this.undoStack = [];      // Document[]
    this.redoStack = [];      // Document[]
    this.undoLabels = [];     // Action that leads FROM each undo snapshot forward
    this.redoLabels = [];     // Action that re-applies each redo snapshot
    this.listeners = new Set();
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * View model for the History panel, newest position first.
   * entries[i] = { kind: 'past'|'current'|'future', label, depth }
   * - past:   snapshot at undoStack[depth]; clicking jumps to it via undos
   * - future: state reachable after `depth+1` redos; label is the action to re-apply
   */
  getEntries() {
    const entries = [];
    for (let j = this.redoLabels.length - 1; j >= 0; j--) {
      entries.push({ kind: 'future', label: this.redoLabels[j], depth: j });
    }
    entries.push({ kind: 'current', label: 'Current', depth: 0 });
    for (let i = this.undoLabels.length - 1; i >= 0; i--) {
      entries.push({ kind: 'past', label: this.undoLabels[i], depth: i });
    }
    return entries;
  }

  notify() {
    const state = {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      entries: this.getEntries()
    };
    for (const cb of this.listeners) {
      cb(state);
    }
  }

  /**
   * Push current document state before executing an operation
   */
  pushState(doc, label = 'Change') {
    this.undoStack.push(cloneDocument(doc));
    this.undoLabels.push(label);
    if (this.undoStack.length > this.maxStates) {
      this.undoStack.shift();
      this.undoLabels.shift();
    }
    // Any new action clears the redo branch
    this.redoStack = [];
    this.redoLabels = [];
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
    const label = this.undoLabels.pop();
    this.redoStack.push(cloneDocument(currentDoc));
    this.redoLabels.push(label);
    this.notify();
    return prevState;
  }

  /**
   * Performs redo: returns the forward document state, pushing current to undo
   */
  redo(currentDoc) {
    if (!this.canRedo()) return currentDoc;
    const nextState = this.redoStack.pop();
    const label = this.redoLabels.pop();
    this.undoStack.push(cloneDocument(currentDoc));
    this.undoLabels.push(label);
    this.notify();
    return nextState;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.undoLabels = [];
    this.redoLabels = [];
    this.notify();
  }
}
