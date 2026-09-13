# Agent Lessons Learned

Read this before starting any session in this repo without prior context. These are things that cost real debugging time once — don't re-learn them.

## 1. "One button is broken" on production usually means "no JavaScript loaded at all"

**Incident:** User reported that image upload stopped working on the GitHub Pages deployment. Actual cause: Pages was publishing the **raw repository root** instead of the built `dist/` artifact (Pages source was set to "Deploy from a branch" instead of "GitHub Actions"). The served `index.html` referenced `/src/main.js`, which 404'd, so **every** feature was dead — but since HTML/CSS render fine statically, it *looked* like an app bug in one feature.

**Lessons:**
- When a user reports a production-only failure, first fetch the live URL and inspect what is actually being served (script tags, asset paths) before reading application code.
- Source `index.html` uses `<script type="module" src="/src/main.js">` — that path only works under a dev server or a correct build. Seeing it on a live site = raw repo being served, not the build.
- The fix may be zero-code: GitHub repo → Settings → Pages → Build and deployment → Source: **GitHub Actions**, then re-run the deploy workflow. Don't go hunting for code bugs when config is the culprit.

## 2. Recognize the `file://` console signature instantly

```
Access to script at 'file:///C:/...' from origin 'null' has been blocked by CORS policy...
net::ERR_FAILED
```

- This means the page was opened from disk by double-clicking `index.html`. ES modules can **never** load over `file://` — this is unfixable by code changes.
- Correct local testing is always `npm run dev` (source) or `npm run preview` (built dist). This is documented in README.md; point the user there rather than debugging.
- **Meta-lesson:** if reported environment ("production", https) doesn't match the evidence in the logs (`file://`, localhost), surface that contradiction early — the user was unknowingly looking at a locally-opened file while diagnosing a different (real) production problem.

## 3. Repo conventions you must follow for new features

- Any change to document state MUST be a registered op (`registerOp` in `src/tools/*.js`) dispatched through `executeOp()` in `main.js`. Bypassing it silently loses undo/redo history and action-recorder/batch-replay support.
- Op params must be JSON-serializable plain data (`layerId` strings, numbers, point arrays). No canvas or DOM references — ops get exported/imported as JSON and replayed onto other documents by the batch queue.
- Interactive previews must not mutate persistent state: use `renderComposite(doc, overrides, excludeId)` / proxy canvases during the interaction, then commit one op at the end (see transform drag + HSL slider + text editing flows).
- Pixel effects must translate doc coords into **layer space** (`layer.x/y` offset, layer-sized strides). The `delete` op once indexed layer pixels with doc-width strides — it only worked by accident on full-size background layers. Fixed; don't regress it (see the `lx/ly` guard in delete.js and fill.js).
- Keyboard shortcuts already claimed in `main.js`: V, R, M, L, C, U, B, G, T, I, S, H, Space, `[`, `]`, Delete/Backspace, Ctrl+Z/Y/C/X/V/D. Check for collisions before binding new ones.
- **Ctrl+V ordering matters:** the keydown handler for Ctrl+V must only `preventDefault()` when the internal clipboard buffer holds content. Otherwise don't touch the event, so the browser still fires its `paste` event and the external image handler (pasting images from other apps) keeps working. Plain `C`/`V`/`X` keys are already claimed by tools, so modifier branches must come first in the keydown `else if` chain.
- Copy/paste model: `copy`/`cut` live in `main.js` (in-memory `appState.clipboard` buffer, doc-space canvas + position); `paste-clipboard-layer` op in `src/tools/clipboard.js` creates the new layer. Paste **clears the selection inside the op** — everything selected was baked into the pasted layer, and keeping it would make a post-paste Transform-tool drag move the marching ants instead of the new layer (this was a real user-reported bug). It passes `record = false` to `executeOp` because a canvas payload can't serialize into the action recorder's JSON log.
- Transform tool's drag is selection-gated (`main.js` pointerdown/move/up): with a selection present it moves only the selection outline (`move-selection` op); without one it moves the layer. Any feature that leaves a selection behind while activating Transform will confuse users — clear the selection or communicate the mode (the cursor Differentiation helper `getTransformCursor()` is the UI signal).
- Alt+Click is reserved: selection tools use it for subtract mode, clone brush for source points, everything else samples color (Dropper).
- Text layers carry `meta`; if you add new layer types with metadata, extend `cloneLayer()` deep-copy or undo snapshots lose editability.

## 4. Verification commands (there is no lint/typecheck)

- `npm run build` — primary automated check; catches syntax/import errors across all modules.
- `node test-verify.js` — headless assertions for pure logic modules (`transform.js`, `hue-saturation.js`, `select-rect.js`). If you add pure helpers, extend this file.
- Canvas/DOM behavior can't be tested headlessly here — verify interactively via dev server.

## 5. Quirks

- `dist/` is tracked in git. After changing source, rebuild and commit `dist/` so it doesn't drift (CI builds its own copy regardless).
- `.gitignore` only excludes the personal notes file; nothing else (including `dist/`) is ignored.
- `main.js` is a ~1500-line controller holding all DOM refs and event wiring — search it thoroughly before assuming something isn't wired up.
- Unreproducible bug report, not yet diagnosed: ~10% of copy/pastes once showed an every-other-row pixel deterioration on screen, non-100% zoom, Chrome/Edge, feather 0. Persisted layer coords are integer-rounded everywhere and extract/paste use integer drawing coords, so sub-pixel `drawImage` resampling appears ruled out — suspicion is display-side CSS scaling (fractional zoom) shimmer rather than corrupted data. Diagnostic first step if it recurs: export the PNG to see whether the artifact persists at pixel level.
