/**
 * History Panel
 * Visual listing of the undo/redo timeline with click-to-jump entries.
 */

export function setupHistoryPanel(appState, renderApp) {
  const historyList = document.getElementById('history-list');

  /**
   * Jumps to the state that had `targetUndoDepth` snapshots behind it.
   * Uses undo()/redo() steps so redo/undo stacks stay consistent.
   */
  function jumpTo(targetUndoDepth) {
    if (!appState.document) return;
    let doc = appState.document;
    let changed = false;
    while (appState.history.undoStack.length > targetUndoDepth) {
      doc = appState.history.undo(doc);
      changed = true;
    }
    while (appState.history.undoStack.length < targetUndoDepth) {
      doc = appState.history.redo(doc);
      changed = true;
    }
    if (changed) {
      appState.document = doc;
      renderApp();
    }
  }

  function render(historyState) {
    if (!appState.document || !historyState || !Array.isArray(historyState.entries)) return;
    const entries = historyState.entries;

    if (entries.length <= 1 && entries[0]?.kind === 'current') {
      historyList.innerHTML = '<p class="empty-state">No steps yet. Actions will appear here.</p>';
      return;
    }

    historyList.innerHTML = '';
    entries.forEach((entry) => {
      const item = document.createElement('div');
      item.className = 'layer-item history-item';
      item.style.justifyContent = 'space-between';
      if (entry.kind === 'current') item.classList.add('current');
      if (entry.kind === 'future') item.classList.add('future');

      const prefix = entry.kind === 'past' ? `<strong>${entry.depth + 1}.</strong> `
        : entry.kind === 'future' ? '↷ '
        : '● ';
      item.innerHTML = `
        <span style="font-family: monospace; font-size: 11px; overflow: hidden; text-overflow: ellipsis;">
          ${prefix}${entry.label}
        </span>
      `;

      item.onclick = () => {
        if (entry.kind === 'past') jumpTo(entry.depth);
        else if (entry.kind === 'future') jumpTo(entry.depth + 1);
      };

      historyList.appendChild(item);
    });
  }

  return { render };
}
