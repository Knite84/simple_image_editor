/**
 * Layer Management Panel
 */

import { createLayer, cloneLayer, getActiveLayer } from './document.js';

export function setupLayersPanel(appState, onLayerChange) {
  const layersList = document.getElementById('layers-list');
  const btnAdd = document.getElementById('btn-add-layer');
  const btnDup = document.getElementById('btn-dup-layer');
  const btnMerge = document.getElementById('btn-merge-layers');
  const btnDel = document.getElementById('btn-del-layer');
  const layerFileInput = document.getElementById('layer-file-input');
  const opacityInput = document.getElementById('layer-opacity');
  const opacityVal = document.getElementById('opacity-val');

  function getMultiSelected() {
    if (!Array.isArray(appState.multiSelectedLayerIds)) {
      appState.multiSelectedLayerIds = [];
    }
    return appState.multiSelectedLayerIds;
  }

  function updateMergeButton() {
    btnMerge.disabled = getMultiSelected().length < 2;
  }

  function renderList() {
    if (!appState.document) return;
    const doc = appState.document;
    layersList.innerHTML = '';
    const multiSelected = getMultiSelected();

    // Render layers reversed so top layer is visually at the top
    const displayLayers = [...doc.layers].reverse();

    displayLayers.forEach((layer, displayIdx) => {
      const actualIdx = doc.layers.indexOf(layer);
      const isTop = actualIdx === doc.layers.length - 1;
      const isBottom = actualIdx === 0;

      const item = document.createElement('div');
      item.className = `layer-item ${layer.id === doc.activeLayerId ? 'active' : ''} ${multiSelected.includes(layer.id) ? 'selected' : ''}`;
      
      // Thumbnail
      const thumb = document.createElement('canvas');
      thumb.className = 'layer-thumb';
      thumb.width = 32;
      thumb.height = 32;
      const tCtx = thumb.getContext('2d');
      tCtx.drawImage(layer.canvas, 0, 0, 32, 32);

      // Layer Name
      const nameSpan = document.createElement('span');
      nameSpan.className = 'layer-name';
      nameSpan.textContent = layer.name;

      // Visibility Toggle
      const visBtn = document.createElement('button');
      visBtn.className = `layer-vis-btn ${!layer.visible ? 'hidden' : ''}`;
      visBtn.textContent = layer.visible ? '👁️' : '👁️‍🗨️';
      visBtn.title = layer.visible ? 'Hide' : 'Show';
      visBtn.onclick = (e) => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        onLayerChange();
      };

      // Order buttons
      const orderControls = document.createElement('div');
      orderControls.style.display = 'flex';
      orderControls.style.flexDirection = 'column';
      orderControls.style.gap = '2px';

      const upBtn = document.createElement('button');
      upBtn.className = 'btn btn-icon btn-sm';
      upBtn.style.padding = '0 3px';
      upBtn.style.fontSize = '8px';
      upBtn.textContent = '▲';
      upBtn.disabled = isTop;
      upBtn.title = 'Move Up';
      upBtn.onclick = (e) => {
        e.stopPropagation();
        if (!isTop) {
          const temp = doc.layers[actualIdx];
          doc.layers[actualIdx] = doc.layers[actualIdx + 1];
          doc.layers[actualIdx + 1] = temp;
          onLayerChange();
        }
      };

      const downBtn = document.createElement('button');
      downBtn.className = 'btn btn-icon btn-sm';
      downBtn.style.padding = '0 3px';
      downBtn.style.fontSize = '8px';
      downBtn.textContent = '▼';
      downBtn.disabled = isBottom;
      downBtn.title = 'Move Down';
      downBtn.onclick = (e) => {
        e.stopPropagation();
        if (!isBottom) {
          const temp = doc.layers[actualIdx];
          doc.layers[actualIdx] = doc.layers[actualIdx - 1];
          doc.layers[actualIdx - 1] = temp;
          onLayerChange();
        }
      };

      orderControls.appendChild(upBtn);
      orderControls.appendChild(downBtn);

      item.onclick = (e) => {
        const multi = getMultiSelected();

        if (e.ctrlKey || e.metaKey) {
          // Toggle membership in the multi-selection
          const pos = multi.indexOf(layer.id);
          if (pos >= 0) {
            multi.splice(pos, 1);
          } else {
            multi.push(layer.id);
            doc.activeLayerId = layer.id;
          }
        } else if (e.shiftKey && doc.activeLayerId) {
          // Range select from the active layer to the clicked layer (z-order)
          const startIdx = doc.layers.findIndex(l => l.id === doc.activeLayerId);
          if (startIdx >= 0) {
            const [lo, hi] = startIdx <= actualIdx ? [startIdx, actualIdx] : [actualIdx, startIdx];
            multi.length = 0;
            for (let i = lo; i <= hi; i++) {
              multi.push(doc.layers[i].id);
            }
          }
        } else {
          // Plain click: single selection
          multi.length = 0;
          doc.activeLayerId = layer.id;
        }

        const active = getActiveLayer(doc);
        if (active) {
          opacityInput.value = Math.round(active.opacity * 100);
          opacityVal.textContent = `${Math.round(active.opacity * 100)}%`;
        }
        updateMergeButton();
        onLayerChange();
      };

      item.appendChild(visBtn);
      item.appendChild(thumb);
      item.appendChild(nameSpan);
      item.appendChild(orderControls);
      layersList.appendChild(item);
    });

    const active = getActiveLayer(doc);
    if (active) {
      opacityInput.value = Math.round(active.opacity * 100);
      opacityVal.textContent = `${Math.round(active.opacity * 100)}%`;
    }
    updateMergeButton();
  }

  // Import Image as New Layer
  layerFileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file || !appState.document) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const doc = appState.document;
        appState.history.pushState(doc);

        const imgW = img.naturalWidth || img.width;
        const imgH = img.naturalHeight || img.height;
        // Center within document
        const x = Math.round((doc.width - imgW) / 2);
        const y = Math.round((doc.height - imgH) / 2);

        const newL = createLayer(
          null,
          file.name.replace(/\.[^/.]+$/, ''),
          imgW,
          imgH,
          img,
          x,
          y
        );

        doc.layers.push(newL);
        doc.activeLayerId = newL.id;
        layerFileInput.value = '';
        onLayerChange();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Add Layer
  btnAdd.onclick = () => {
    if (!appState.document) return;
    const doc = appState.document;
    appState.history.pushState(doc);
    const newL = createLayer(null, `Layer ${doc.layers.length + 1}`, doc.width, doc.height);
    doc.layers.push(newL);
    doc.activeLayerId = newL.id;
    onLayerChange();
  };

  // Duplicate Layer
  btnDup.onclick = () => {
    if (!appState.document) return;
    const doc = appState.document;
    const active = getActiveLayer(doc);
    if (!active) return;
    appState.history.pushState(doc);

    const dup = cloneLayer(active);
    dup.id = `layer-${Date.now()}`;
    dup.name = `${active.name} (Copy)`;
    const idx = doc.layers.indexOf(active);
    doc.layers.splice(idx + 1, 0, dup);
    doc.activeLayerId = dup.id;
    onLayerChange();
  };

  // Merge Selected Layers
  btnMerge.onclick = () => {
    if (!appState.document) return;
    const doc = appState.document;
    const ids = getMultiSelected();
    if (ids.length < 2) return;

    // Resolve selected layers in document (z) order, bottom-most first
    const selected = doc.layers.filter(l => ids.includes(l.id));
    if (selected.length < 2) return;

    appState.history.pushState(doc);

    // Composite selected layers onto a document-sized canvas; the bottom-most
    // selected layer becomes the merged layer (keeps its id and z-position)
    const bottom = selected[0];
    const mergedCanvas = document.createElement('canvas');
    mergedCanvas.width = doc.width;
    mergedCanvas.height = doc.height;
    const mCtx = mergedCanvas.getContext('2d', { willReadFrequently: true });
    for (const layer of selected) {
      if (!layer.visible || layer.opacity <= 0) continue;
      mCtx.globalAlpha = layer.opacity;
      mCtx.drawImage(layer.canvas, layer.x, layer.y);
    }

    bottom.canvas = mergedCanvas;
    bottom.x = 0;
    bottom.y = 0;
    bottom.opacity = 1;
    bottom.visible = true;

    doc.layers = doc.layers.filter(l => !ids.includes(l.id) || l.id === bottom.id);
    doc.activeLayerId = bottom.id;
    appState.multiSelectedLayerIds = [];
    updateMergeButton();
    onLayerChange();
  };

  // Delete Layer
  btnDel.onclick = () => {
    if (!appState.document) return;
    const doc = appState.document;
    if (doc.layers.length <= 1) {
      alert('Cannot delete the only remaining layer.');
      return;
    }
    const active = getActiveLayer(doc);
    if (!active) return;
    appState.history.pushState(doc);

    const idx = doc.layers.indexOf(active);
    doc.layers.splice(idx, 1);
    const nextActive = doc.layers[Math.max(0, idx - 1)];
    doc.activeLayerId = nextActive.id;
    const multi = getMultiSelected();
    const pos = multi.indexOf(active.id);
    if (pos >= 0) multi.splice(pos, 1);
    updateMergeButton();
    onLayerChange();
  };

  // Layer Opacity
  opacityInput.oninput = () => {
    if (!appState.document) return;
    const active = getActiveLayer(appState.document);
    if (!active) return;
    active.opacity = Math.max(0, Math.min(1, (parseInt(opacityInput.value, 10) || 0) / 100));
    opacityVal.textContent = `${opacityInput.value}%`;
    onLayerChange();
  };

  return {
    render: renderList
  };
}
