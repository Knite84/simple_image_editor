# Implementation Plan: Static Web Image Editor (Full Build)

Covers: core tools (select/crop/export/resize), stretch tools (lasso, hue/sat,
feather, delete, layers, clone brush), and batch record/replay. Structured so
later features extend the model rather than rewrite it.

Where a decision is genuinely a UI/UX judgment call rather than a technical
one, an assumption is stated explicitly (marked **[ASSUMPTION]**) so it's easy
to spot and override later.

---

## 1. Foundational Data Model

Everything else in this plan is a consumer of this model. Get this right
first; almost nothing else is architecturally risky if this is solid.

```
Document
├── id, name
├── width, height                 // document pixel dimensions
├── layers: Layer[]               // ordered bottom → top
├── activeLayerId: string
├── selection: Selection | null
└── history: HistoryEntry[]       // see §8

Layer
├── id, name
├── canvas: HTMLCanvasElement     // this layer's own pixel data (source of truth)
├── visible: boolean
├── opacity: number (0–1)
└── x, y                          // offset within document

Selection
├── type: 'rect' | 'lasso'
├── path: Path2D
├── bounds: {x, y, w, h}          // bounding box, always present regardless of type
└── feather: number (px)          // 0 = hard edge

Op                                 // a single recordable/replayable action
├── name: string                   // 'select-rect', 'crop', 'hue-saturation', etc.
├── params: object                 // fully describes the operation, no hidden state
└── (pure function elsewhere: applyOp(document, op) → document)
```

**Rule that makes everything downstream easy:** every tool is written as a
pure-ish function `applyOp(document, op) → newDocument`, never as an
event-handler that mutates canvas pixels inline. The event handler's only
job is to compute `op.params` (e.g. from a mouse drag) and call `applyOp`.
This single rule is what makes recording, undo, and batch replay all fall
out for free instead of being separate systems.

**Compositor**: a function `renderComposite(document) → canvas` that loops
visible layers bottom-to-top and draws them onto a fresh canvas. This is the
*only* thing ever shown on screen or exported — never a live/mutated display
canvas. Cheap now, and this is the seam where opacity/blend-modes/lasso
preview/etc. all attach later without touching earlier code.

---

## 2. Coordinate Spaces

- `viewScale`: ratio between on-screen canvas size and document pixel size
  (handles zoom/fit-to-window/high-DPI displays).
- All mouse/pointer/touch handlers convert screen → document coordinates
  immediately: `docX = (screenX - canvasRect.left) / viewScale`. Every tool
  (selection, lasso, clone brush) works purely in document coordinates from
  that point on.
- Built once in `coords.js`, used everywhere. This is what keeps selection
  coordinates meaningful later when batch replay has to reason about
  "the same region" across images of different displayed sizes.

---

## 3. Selection Tools

### Rect select (free + fixed ratio)
- Drag defines a rect in document coordinates.
- Ratio lock ("3x4", "3x2", custom): parse to `ratio = w/h`; on drag, derive
  the constrained dimension from whichever axis is "driving" the gesture.
- Produces `Selection { type: 'rect', path: Path2D via rect(), bounds }`.

### Lasso select (free-form)
- Track pointer path as an array of `{x, y}` points while dragging; on
  release, close the path back to the start point.
- Build a `Path2D` via `moveTo`/`lineTo` through the recorded points.
  **[ASSUMPTION]** No smoothing/simplification of the raw point path in v1 —
  a jittery hand-drawn lasso stays jittery. (Cheap upgrade later: run a
  simplification pass, e.g. Douglas-Peucker, on the point array before
  building the Path2D.)
- `bounds` = bounding box of the point array, computed the same way
  regardless of selection type — this is why rect and lasso can share every
  downstream consumer (crop, delete, feather all just read `bounds`/`path`).
- if possible, when a user crops from a lasso selection, the entirety of the selection should be bounded by a rectangular selection before being cropped.

### Feather
- Not a separate "shape" — a property of the current `Selection`
  (`selection.feather = N`), applied at *consumption* time, not at draw
  time. This matters: feathering is implemented once, in a shared helper
  `getSelectionMask(selection) → alphaMaskCanvas`, used by both crop-adjacent
  ops and delete. Implementation:
  1. Render `selection.path` filled white on black into an offscreen canvas
     (this is the hard-edged mask).
  2. Blur that mask by N px (`ctx.filter = 'blur(Npx)'` on a copy, or a
     manual box-blur pass for consistent cross-browser results — canvas
     `filter` blur support/quality varies slightly across browsers, so
     **[ASSUMPTION]**: implement a small manual box-blur function rather
     than relying on `ctx.filter`, to keep exported results consistent).
  3. Return the blurred mask; consumers read its alpha channel per-pixel as
     a multiplier.

---

## 4. Layers

- Panel UI: list of layers (top-to-bottom visually, matches typical editor
  convention even though the array is stored bottom-to-top — reverse for
  display), each row with visibility toggle, name, thumbnail.
- **Add layer**: push new blank (transparent) or duplicate-of-active canvas
  onto `document.layers`, set as active.
- **Delete layer**: remove from array; if it was active, active becomes the
  layer below it (or above, if it was the bottom one). **[ASSUMPTION]**:
  block deleting the last remaining layer — a document must always have ≥1
  layer.
- **Reorder**: drag-and-drop in the panel reorders the array; re-run
  compositor.
- **Hide/show**: toggles `layer.visible`; compositor skips hidden layers.
- Every tool below operates against `document.layers[document.activeLayerId]`
  specifically — this was true from the core build and stays true here.

---

## 5. Pixel-Level Tools

### Hue & Saturation
- `applyOp(doc, {name: 'hue-saturation', hue, saturation, lightness})`:
  read active layer's `ImageData`, convert each pixel RGB→HSL, apply deltas,
  convert back, write `ImageData`.
- If a selection is active, only pixels inside `selection.bounds` are
  touched, weighted by the feather mask if `feather > 0` (blend adjusted
  pixel with original by mask alpha).
- **[ASSUMPTION]** Live slider preview operates on a downsampled proxy
  image (e.g. capped at ~1000px on the long edge) for responsiveness, with
  the full-resolution op applied once on slider release/blur — full-res
  HSL conversion on every `input` event on a large image will visibly lag.

### Delete (fill color or transparent)
- Requires an active selection.
- Uses the same `getSelectionMask` helper as feather.
- Transparent mode: for each pixel in bounds, `newAlpha = oldAlpha × (1 - maskAlpha)`.
- Solid-color mode: composite the chosen color into the layer using
  `maskAlpha` as the blend weight (so feathered edges fade into the fill
  color rather than hard-cutting).
- Because this reuses the mask helper, feathered delete is not extra work —
  it's automatic once feather (§3) exists.

### Clone Brush
- **Source point**: Alt/Option+click (or a "set source" mode button —
  **[ASSUMPTION]**: support both, since not all trackpads/browsers handle
  Alt-click consistently) sets `sourceX, sourceY` on the active layer.
- **Stroke**: on drag, sample stamps at fixed spacing along the pointer path
  (interpolate between events if the gap exceeds spacing, so fast drags
  don't leave gaps). Each stamp:
  `ctx.drawImage(sourceLayerCanvas, sx, sy, size, size, dx, dy, size, size)`
  clipped to a circular, soft-edged brush (radial gradient alpha mask,
  pre-rendered once per brush-size change, reused per stamp for
  performance).
- **Aligned mode** (default, matches Photoshop default): offset between
  source and brush position is fixed for the whole stroke, computed once at
  stroke start, reused across multiple strokes until source is reset.
  **Non-aligned mode**: source resets to the original point every new
  stroke. **[ASSUMPTION]**: aligned is the only mode in v1; non-aligned is
  a small toggle to add later, not core.
- Destructive by default (paints directly onto active layer canvas), which
  matches how the rest of the pixel tools work in this plan (§ "single rule"
  above) — no special-casing needed. Non-destructive cloning (sample-below,
  paint-onto-new-empty-layer) is a **future** mode, not v1, since it just
  means "target a different layer than source," which the layer model
  already supports without new plumbing.
- **Recordability caveat**: clone brush strokes are recorded as the full
  list of stamp points + source offset (see §7) — not resolution-independent
  in the way rect-selects can optionally be. This is called out explicitly
  in §7's batch section, since it's the one tool that doesn't generalize
  cleanly across differently-sized images.

---

## 6. Crop, Resize, Export

*(Same as the core plan — repeated here briefly since everything above
builds on top of them; no changes needed from the original design.)*

- **Crop**: reads `selection.bounds`; for each layer, redraws its canvas
  shifted/sized to bounds; updates `document.width/height`.
- **Resize**: width/height inputs, aspect-lock toggle, recompute on `blur`
  of whichever field changed; each layer's canvas is redrawn at new
  dimensions (step-halving for large downscales to reduce aliasing).
- **Export**: always reads from `renderComposite(document)`, never a single
  layer; format (png/jpg/webp) + quality slider (disabled for png);
  `canvas.toBlob` → object URL → temporary download link.

---

## 7. Record / Replay & Batch Queue

### Recording
- Every user action, because it's already routed through `applyOp(doc, op)`
  (§1's foundational rule), is trivially captured by pushing `op` onto an
  `actionLog: Op[]` array whenever the user has "recording" toggled on.
- Recording UI: a record button (● Start Recording / ■ Stop), a live list of
  captured steps shown as they're added (so the user can see/verify/delete
  a mis-added step before running it against a whole batch), and a name +
  save action that serializes `actionLog` to JSON (stored in
  `localStorage` for simplicity, or offered as a downloadable `.json` file
  the user can re-import — **[ASSUMPTION]**: do both; localStorage for
  quick reuse in-session, file export/import for saving actions long-term
  or sharing).

### Selection coordinate strategy across differently-sized images
This is the one real design fork, flagged in earlier discussion. Store
**both** representations on every `select-rect`/`select-lasso` op at
recording time, so replay can choose:
```
{
  name: 'select-rect',
  absolute: { x: 120, y: 80, w: 900, h: 600 },        // px, source image's own size
  relative: { x: 0.10, y: 0.08, w: 0.75, h: 0.60 },    // fraction of source dims
  sourceDocSize: { w: 1200, h: 1000 }                   // the image the action was recorded against
}
```
At replay time, a per-action-list setting **[ASSUMPTION: default = "relative"]**
decides which representation to scale into the target image's actual
dimensions. Absolute mode is offered as an explicit opt-in for batches the
user knows are uniform-sized (fastest, most literal "same rectangle").
Lasso paths get the same treatment: point coordinates stored both in
absolute px and as fractions of `sourceDocSize`.

**Clone brush strokes** are recorded as raw point paths + source offset, in
the same absolute/relative dual form. **[ASSUMPTION]**: flag clone-brush
steps in the recorded action list with a small warning icon in the UI when
the action is applied to an image of different dimensions than the one it
was recorded on ("this step was recorded on a differently-sized image —
results may not align") — full correctness here is inherently
content-dependent (cloning a specific blemish only makes sense if that
blemish is actually in the same relative spot), so a warning is the honest
answer rather than pretending it always works.

### Queue space
- Multi-file input / drag-and-drop zone → thumbnail strip of pending images.
- **Sequential processing**, not parallel: load image → build a fresh
  single-layer `Document` → run `actionLog` through `applyOp` in order →
  composite → export to blob → discard canvases (`canvas.width = 0` or drop
  references) → advance to next file. **[ASSUMPTION]**: sequential is
  correct here; parallelizing canvas-heavy work across many large images in
  one tab risks memory pressure/crashes for little real benefit given
  `toBlob` is already async.
- Progress UI: "processing 4 of 17," with a cancel button that stops after
  the current image finishes (don't try to abort mid-op — let it complete
  cleanly).
- Output: **[ASSUMPTION]** zip all outputs client-side (small dependency,
  e.g. a lightweight zip library) into one `batch-export.zip` download,
  rather than firing N sequential downloads (which browsers throttle/nag
  after a handful). Offer per-item preview thumbnails of the *output* before
  the final zip, so a bad batch is caught before download rather than after.

---

## 8. Undo/Redo (falls out of the design, worth building alongside)

Because `applyOp` never mutates in place — every op produces a new document
state (new layer canvases where changed) — undo is just: keep
`document.history: Document[]` snapshots (or, more memory-efficient, keep
the `Op[]` list and replay from scratch up to index N). **[ASSUMPTION]**:
snapshot-based undo (keep last ~20 full document states) rather than
replay-based, trading memory for instant undo response; replay-based is a
fallback if memory becomes a real problem with large images.

This isn't a "stretch feature" in this plan — it's presented here because
it costs almost nothing given the architecture above, and skipping it would
be leaving an easy win on the table.

---

## 9. File/Module Structure

```
/index.html
/style.css
/src/
  document.js         // Document + Layer model, compositor
  coords.js           // screen↔document conversion, viewScale
  ops.js              // applyOp dispatcher + op registry
  selection.js         // Selection model, mask/feather helper
  history.js           // undo/redo stack
  tools/
    select-rect.js
    select-lasso.js
    crop.js
    resize.js
    hue-saturation.js
    delete.js
    clone-brush.js
    export.js
  layers-panel.js
  recorder.js           // actionLog capture, save/load actions (JSON)
  batch-queue.js         // queue UI, sequential replay, zip export
  main.js                // wires UI to everything above
```

Every tool file exports one thing: an `applyOp` handler registered into
`ops.js`'s dispatch table, plus (where relevant) the UI glue for its own
controls. New features are new files registering new op types — existing
files stay untouched.

---

## 10. Build Order

1. **`document.js` + compositor** — single-layer doc, load image, render.
2. **`coords.js`** — coordinate conversion, canvas display/zoom-to-fit.
3. **`ops.js` + `history.js`** — dispatcher and undo stack, even before
   there are many ops to dispatch; this is the seam, build it early.
4. **`select-rect.js`** — free + ratio-locked.
5. **`crop.js`, `resize.js`, `export.js`** — core deliverable complete here;
   fully usable tool at this point.
6. **`recorder.js` + `batch-queue.js`** *(moved up deliberately — see note
   below)* — record/replay plumbing against the small op set that exists so
   far (select, crop, resize, export), including the absolute/relative
   coordinate capture from day one.
7. **`select-lasso.js`** — new selection input, same `Selection` shape.
8. **`hue-saturation.js`** — first pixel-level op, establishes the
   selection-mask consumption pattern.
9. **feather** (as a `Selection` property + `getSelectionMask` helper) +
   **`delete.js`** — built together since delete is the first real consumer
   of feathering.
10. **`layers-panel.js`** — add/delete/reorder/hide; retrofit existing ops
    to confirm they already correctly target `activeLayerId` (they should,
    if §1's rule was followed — this step is mostly verification, not new
    logic).
11. **`clone-brush.js`** — brush stamping, aligned-mode stroke tracking,
    recorder integration (including the cross-size warning behavior).

**Why record/replay is pulled earlier than in the original stretch-goal
ordering**: building it against a small, stable op set (select/crop/resize/
export) first means every op added afterward is built *knowing* it has to
serialize cleanly into `{name, params}` and support the absolute/relative
coordinate split where relevant — which is far easier than retrofitting six
tools for recordability at the very end. Same "bake the seam in early"
logic as the layers model.

---

## 11. Summary of Explicit Assumptions (for quick review/override)

- Lasso: no path simplification in v1.
- Feathering: manual box-blur, not `ctx.filter`, for cross-browser
  consistency.
- Can't delete the last layer in a document.
- Hue/sat preview: downsampled proxy while dragging, full-res on release.
- Clone brush: both Alt-click and a source-set button supported; aligned
  mode only in v1; destructive by default.
- Recorded selections store both absolute-px and relative-fraction forms;
  batch replay defaults to relative scaling, with absolute offered as an
  opt-in.
- Clone-brush steps show a warning when replayed against a differently
  sized image, rather than silently mis-cloning.
- Batch processing is sequential, not parallel.
- Batch output is a single zipped download, not N individual downloads.
- Undo uses full-state snapshots (~20 deep), not op-replay-from-scratch.
- Actions save to both localStorage (quick reuse) and exportable JSON
  (portability).

---

Ready to start on step 1 whenever you'd like — same starting point as
before, since nothing in the core sequence changed, it's just now built with
the ops/history/recorder seams in mind from the outset.
