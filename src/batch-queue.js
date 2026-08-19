/**
 * Batch Queue Processing Engine & Modal
 * Executes recorded action lists across multiple files sequentially, with live previews and client-side ZIP packaging
 */

import JSZip from 'jszip';
import { createDocumentFromImage, renderComposite } from './document.js';
import { applyOp } from './ops.js';
import { exportDocumentAsBlob, downloadBlob } from './tools/export.js';

/**
 * Re-maps an operation's parameters to target document dimensions based on strategy
 */
function prepareOpForTargetDoc(op, targetDoc, strategy = 'relative') {
  const opCopy = {
    name: op.name,
    params: JSON.parse(JSON.stringify(op.params || {}))
  };

  const targetW = targetDoc.width;
  const targetH = targetDoc.height;

  if (strategy === 'relative' && op.relative) {
    if (op.name === 'select-rect' || op.name === 'crop') {
      opCopy.params.bounds = {
        x: Math.round(op.relative.x * targetW),
        y: Math.round(op.relative.y * targetH),
        w: Math.round(op.relative.w * targetW),
        h: Math.round(op.relative.h * targetH)
      };
    } else if (op.name === 'select-lasso' && Array.isArray(op.relative)) {
      opCopy.params.points = op.relative.map(p => ({
        x: Math.round(p.x * targetW),
        y: Math.round(p.y * targetH)
      }));
    } else if (op.name === 'clone-stroke') {
      opCopy.params.stamps = op.relative.stamps.map(s => ({
        x: Math.round(s.x * targetW),
        y: Math.round(s.y * targetH)
      }));
      opCopy.params.sourceOffset = {
        x: Math.round(op.relative.sourceOffset.x * targetW),
        y: Math.round(op.relative.sourceOffset.y * targetH)
      };
    }
  } else if (strategy === 'absolute' && op.absolute) {
    if (op.name === 'select-rect' || op.name === 'crop') {
      opCopy.params.bounds = { ...op.absolute };
    } else if (op.name === 'select-lasso') {
      opCopy.params.points = op.absolute.map(p => ({ ...p }));
    } else if (op.name === 'clone-stroke') {
      opCopy.params.stamps = op.absolute.stamps.map(s => ({ ...s }));
      opCopy.params.sourceOffset = { ...op.absolute.sourceOffset };
    }
  }

  return opCopy;
}

export function showBatchQueueModal(actionRecorder) {
  const actions = actionRecorder.actionLog;
  const modalContainer = document.getElementById('modal-container');

  const hasCloneSteps = actions.some(a => a.name === 'clone-stroke');

  modalContainer.innerHTML = `
    <div class="modal-backdrop" id="batch-backdrop">
      <div class="modal-content" style="max-width: 680px;">
        <div class="modal-header">
          <span class="modal-title">⚡ Batch Queue Replay</span>
          <button class="btn btn-icon btn-sm" id="btn-close-batch">✕</button>
        </div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: 16px;">
          <!-- Action Summary -->
          <div style="background: var(--bg-panel-light); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 14px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              <strong>Actions to Replay: ${actions.length} step(s)</strong>
              <span style="color: var(--text-muted); font-size: 11px;">(Configured in Recorded Actions)</span>
            </div>
            <div style="font-size: 12px; color: var(--text-muted); max-height: 80px; overflow-y: auto;">
              ${actions.length === 0 ? '⚠️ No actions recorded. Please record operations first.' : actions.map((a, i) => `${i + 1}. <code>${a.name}</code>`).join(' &nbsp;→&nbsp; ')}
            </div>
            ${hasCloneSteps ? `
              <div style="margin-top: 8px; font-size: 11px; color: #fbbf24; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 4px; padding: 6px 8px;">
                ⚠️ <strong>Note:</strong> Recorded actions contain a Clone Brush step. Clone strokes depend on content positioning and may produce unintended results on differently sized images.
              </div>
            ` : ''}
          </div>

          <!-- Scaling Strategy -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
            <label style="font-weight: 500;">Coordinate Strategy:</label>
            <select id="batch-coord-strategy" style="padding: 4px 8px; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px;">
              <option value="relative" selected>Relative % Scaling (Recommended for mixed sizes)</option>
              <option value="absolute">Absolute Pixel Position (Exact coordinates)</option>
            </select>
          </div>

          <!-- File Dropzone -->
          <div id="batch-dropzone" style="border: 2px dashed var(--border-color); border-radius: 8px; padding: 24px; text-align: center; cursor: pointer; transition: border-color 0.2s;">
            <span style="font-size: 24px; display: block; margin-bottom: 6px;">📁</span>
            <span style="font-weight: 500; font-size: 13px;">Drag & drop multiple image files here</span>
            <span style="display: block; font-size: 11px; color: var(--text-muted); margin-top: 4px;">or click to select files</span>
            <input type="file" id="batch-file-input" multiple accept="image/*" style="display: none;" />
          </div>

          <!-- Queue Progress & Preview list -->
          <div id="batch-queue-section" style="display: none;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span id="batch-progress-text" style="font-weight: 600;">Processing (0/0)...</span>
              <div id="batch-progress-bar-container" style="width: 180px; height: 8px; background: var(--bg-input); border-radius: 4px; overflow: hidden;">
                <div id="batch-progress-bar" style="width: 0%; height: 100%; background: var(--accent-color); transition: width 0.2s;"></div>
              </div>
            </div>
            <div id="batch-results-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; max-height: 200px; overflow-y: auto; padding: 4px;">
              <!-- Dynamic Result Cards -->
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-cancel-batch">Close</button>
          <button class="btn btn-primary" id="btn-start-batch" ${actions.length === 0 ? 'disabled' : ''}>
            Start Batch & Download Zip
          </button>
        </div>
      </div>
    </div>
  `;

  const btnClose = document.getElementById('btn-close-batch');
  const btnCancel = document.getElementById('btn-cancel-batch');
  const btnStart = document.getElementById('btn-start-batch');
  const dropzone = document.getElementById('batch-dropzone');
  const fileInput = document.getElementById('batch-file-input');
  const queueSection = document.getElementById('batch-queue-section');
  const progressText = document.getElementById('batch-progress-text');
  const progressBar = document.getElementById('batch-progress-bar');
  const resultsList = document.getElementById('batch-results-list');
  const strategySelect = document.getElementById('batch-coord-strategy');
  const backdrop = document.getElementById('batch-backdrop');

  let selectedFiles = [];
  let isCancelled = false;

  function close() {
    isCancelled = true;
    modalContainer.innerHTML = '';
  }

  btnClose.onclick = close;
  btnCancel.onclick = close;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };

  dropzone.onclick = () => fileInput.click();
  fileInput.onchange = (e) => {
    selectedFiles = Array.from(e.target.files);
    dropzone.innerHTML = `<span style="font-size: 20px;">✅</span> <strong>${selectedFiles.length} file(s) selected</strong><div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Click to change selection</div>`;
  };

  dropzone.ondragover = (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--accent-color)';
  };
  dropzone.ondragleave = () => {
    dropzone.style.borderColor = 'var(--border-color)';
  };
  dropzone.ondrop = (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--border-color)';
    selectedFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    dropzone.innerHTML = `<span style="font-size: 20px;">✅</span> <strong>${selectedFiles.length} file(s) selected</strong><div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Click to change selection</div>`;
  };

  btnStart.onclick = async () => {
    if (selectedFiles.length === 0) {
      alert('Please select at least one image file to process.');
      return;
    }

    btnStart.disabled = true;
    queueSection.style.display = 'block';
    resultsList.innerHTML = '';
    const strategy = strategySelect.value;
    const zip = new JSZip();

    const total = selectedFiles.length;

    for (let i = 0; i < total; i++) {
      if (isCancelled) break;
      const file = selectedFiles[i];

      progressText.textContent = `Processing ${i + 1} of ${total}: ${file.name}`;
      progressBar.style.width = `${Math.round(((i + 1) / total) * 100)}%`;

      try {
        // Load image into HTMLImageElement
        const img = await loadImageFile(file);
        
        // Build fresh single-layer Document
        let doc = createDocumentFromImage(img, file.name);

        // Run recorded actions sequentially through applyOp
        for (const action of actions) {
          const preparedOp = prepareOpForTargetDoc(action, doc, strategy);
          doc = applyOp(doc, preparedOp);
        }

        // Export to Blob
        const blob = await exportDocumentAsBlob(doc, 'image/png');
        
        // Add to JSZip
        const cleanName = file.name.replace(/\.[^/.]+$/, '');
        zip.file(`${cleanName}-processed.png`, blob);

        // Generate UI thumbnail
        const thumbUrl = URL.createObjectURL(blob);
        const card = document.createElement('div');
        card.style.cssText = 'background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; text-align: center; font-size: 10px;';
        card.innerHTML = `
          <img src="${thumbUrl}" style="width: 100%; height: 75px; object-fit: contain; border-radius: 4px; margin-bottom: 4px;" />
          <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${file.name}</div>
          <div style="color: var(--success-color); font-weight: 500;">✓ Done (${doc.width}×${doc.height})</div>
        `;
        resultsList.appendChild(card);

        // Discard canvas buffers to free memory
        for (const layer of doc.layers) {
          layer.canvas.width = 0;
          layer.canvas.height = 0;
        }
      } catch (err) {
        console.error(`Failed to process ${file.name}:`, err);
      }
    }

    if (!isCancelled) {
      progressText.textContent = `Packaging ZIP archive...`;
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(zipBlob, `batch-processed-${Date.now()}.zip`);
      progressText.textContent = `✅ Batch complete! Downloaded zip.`;
    }
  };
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
