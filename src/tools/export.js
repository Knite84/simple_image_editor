/**
 * Export Helper & Modal
 * Renders composite document to blob and downloads as file
 */

import { renderComposite } from '../document.js';

export function exportDocumentAsBlob(doc, format = 'image/webp', quality = 1) {
  return new Promise((resolve) => {
    const compositeCanvas = renderComposite(doc);
    compositeCanvas.toBlob((blob) => {
      resolve(blob);
    }, format, quality);
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function showExportModal(doc) {
  const modalContainer = document.getElementById('modal-container');
  modalContainer.innerHTML = `
    <div class="modal-backdrop" id="export-backdrop">
      <div class="modal-content">
        <div class="modal-header">
          <span class="modal-title">Export Image</span>
          <button class="btn btn-icon btn-sm" id="btn-close-export">✕</button>
        </div>
        <div class="modal-body">
          <div style="display: flex; flex-direction: column; gap: 14px;">
            <div>
              <label style="display: block; margin-bottom: 6px; font-weight: 500;">File Name:</label>
              <input type="text" id="export-name" value="${doc.name.replace(/\.[^/.]+$/, '')}" style="width: 100%; padding: 6px 10px; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px;" />
            </div>
            <div>
              <label style="display: block; margin-bottom: 6px; font-weight: 500;">Format:</label>
              <select id="export-format" style="width: 100%; padding: 6px 10px; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px;">
                <option value="image/png">PNG (.png) - Lossless with Transparency</option>
                <option value="image/jpeg">JPEG (.jpg) - Standard Compressed</option>
                <option value="image/webp" selected>WebP (.webp) - Modern Web Compressed</option>
              </select>
            </div>
            <div id="quality-container">
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <label style="font-weight: 500;">Quality:</label>
                <span id="export-quality-val">100%</span>
              </div>
              <input type="range" id="export-quality" min="10" max="100" value="100" style="width: 100%;" />
            </div>
            ${'showSaveFilePicker' in window ? `
            <div>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="export-choose-location" checked />
                <span style="font-weight: 500;">Choose save location (pick folder &amp; file name)</span>
              </label>
            </div>` : ''}
            <div style="font-size: 11px; color: var(--text-muted);">
              Export Dimensions: <strong>${doc.width} × ${doc.height} px</strong>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-cancel-export">Cancel</button>
          <button class="btn btn-primary" id="btn-do-export">Download</button>
        </div>
      </div>
    </div>
  `;

  const formatSelect = document.getElementById('export-format');
  const qualityContainer = document.getElementById('quality-container');
  const qualitySlider = document.getElementById('export-quality');
  const qualityVal = document.getElementById('export-quality-val');
  const btnClose = document.getElementById('btn-close-export');
  const btnCancel = document.getElementById('btn-cancel-export');
  const btnDoExport = document.getElementById('btn-do-export');
  const backdrop = document.getElementById('export-backdrop');

  function close() {
    modalContainer.innerHTML = '';
  }

  formatSelect.addEventListener('change', () => {
    qualityContainer.style.display = formatSelect.value === 'image/png' ? 'none' : 'block';
  });

  qualitySlider.addEventListener('input', () => {
    qualityVal.textContent = `${qualitySlider.value}%`;
  });

  btnClose.onclick = close;
  btnCancel.onclick = close;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };

  btnDoExport.onclick = async () => {
    const filename = (document.getElementById('export-name').value || 'image').trim();
    const format = formatSelect.value;
    const quality = parseInt(qualitySlider.value, 10) / 100;
    const chooseLocation = document.getElementById('export-choose-location')?.checked;

    let ext = 'png';
    if (format === 'image/jpeg') ext = 'jpg';
    if (format === 'image/webp') ext = 'webp';

    const fullName = `${filename}.${ext}`;
    const blob = await exportDocumentAsBlob(doc, format, quality);

    if (chooseLocation && window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fullName,
          types: [{ description: ext.toUpperCase(), accept: { [format]: [`.${ext}`] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        downloadBlob(blob, fullName);
      }
    } else {
      downloadBlob(blob, fullName);
    }
    close();
  };
}
