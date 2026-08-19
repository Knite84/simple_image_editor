/**
 * Action Recorder & Serialization Manager
 * Captures operations with dual absolute/relative coordinate mappings
 */

export class ActionRecorder {
  constructor() {
    this.isRecording = false;
    this.actionLog = []; // Op[]
    this.listeners = new Set();
    this.loadFromLocalStorage();
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    for (const cb of this.listeners) {
      cb({
        isRecording: this.isRecording,
        actions: this.actionLog
      });
    }
  }

  start() {
    this.isRecording = true;
    this.notify();
  }

  stop() {
    this.isRecording = false;
    this.notify();
  }

  toggle() {
    this.isRecording = !this.isRecording;
    this.notify();
    return this.isRecording;
  }

  clear() {
    this.actionLog = [];
    this.saveToLocalStorage();
    this.notify();
  }

  removeStep(index) {
    if (index >= 0 && index < this.actionLog.length) {
      this.actionLog.splice(index, 1);
      this.saveToLocalStorage();
      this.notify();
    }
  }

  /**
   * Records an op with dual absolute/relative coordinates
   */
  recordOp(op, doc) {
    if (!this.isRecording || !op) return;

    const recordedOp = {
      id: `op-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name: op.name,
      params: JSON.parse(JSON.stringify(op.params || {})),
      sourceDocSize: { w: doc.width, h: doc.height }
    };

    // Calculate relative fractions for coordinates
    if (op.name === 'select-rect' && op.params.bounds) {
      const b = op.params.bounds;
      recordedOp.absolute = { ...b };
      recordedOp.relative = {
        x: b.x / doc.width,
        y: b.y / doc.height,
        w: b.w / doc.width,
        h: b.h / doc.height
      };
    } else if (op.name === 'select-lasso' && op.params.points) {
      recordedOp.absolute = op.params.points.map(p => ({ ...p }));
      recordedOp.relative = op.params.points.map(p => ({
        x: p.x / doc.width,
        y: p.y / doc.height
      }));
    } else if (op.name === 'crop' && op.params.bounds) {
      const b = op.params.bounds;
      recordedOp.absolute = { ...b };
      recordedOp.relative = {
        x: b.x / doc.width,
        y: b.y / doc.height,
        w: b.w / doc.width,
        h: b.h / doc.height
      };
    } else if (op.name === 'clone-stroke' && op.params.stamps) {
      recordedOp.absolute = {
        stamps: op.params.stamps.map(s => ({ ...s })),
        sourceOffset: { ...op.params.sourceOffset }
      };
      recordedOp.relative = {
        stamps: op.params.stamps.map(s => ({
          x: s.x / doc.width,
          y: s.y / doc.height
        })),
        sourceOffset: {
          x: op.params.sourceOffset.x / doc.width,
          y: op.params.sourceOffset.y / doc.height
        }
      };
    }

    this.actionLog.push(recordedOp);
    this.saveToLocalStorage();
    this.notify();
  }

  saveToLocalStorage() {
    try {
      localStorage.setItem('photo_editor_saved_actions', JSON.stringify(this.actionLog));
    } catch (e) {
      console.warn('Could not save actions to localStorage', e);
    }
  }

  loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem('photo_editor_saved_actions');
      if (raw) {
        this.actionLog = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Could not load actions from localStorage', e);
    }
  }

  exportToJson() {
    const data = JSON.stringify({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      actions: this.actionLog
    }, null, 2);

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `photo-editor-actions-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  importFromJson(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (Array.isArray(parsed.actions)) {
            this.actionLog = parsed.actions;
            this.saveToLocalStorage();
            this.notify();
            resolve(this.actionLog);
          } else {
            reject(new Error('Invalid action JSON format'));
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  }
}
