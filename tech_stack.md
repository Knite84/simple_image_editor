# Tech Stack

## Runtime & Tooling

| Concern | Choice | Notes |
|---|---|---|
| Language | Vanilla JavaScript (ES modules) | No framework, no TypeScript |
| Build tool / dev server | Vite 5 | `npm run dev` (port 3000), `npm run build`, `npm run preview` |
| Node version | 20 (CI), 18+ works locally | |
| Dependencies | `jszip` only | Used exclusively by `src/batch-queue.js` to zip batch exports |
| Styling | Plain CSS + custom properties (`style.css`) | No preprocessor |
| Tests | `node test-verify.js` | Headless checks of pure math/logic modules only |
| Lint / typecheck | None configured | `npm run build` is the primary automated verification |

## Rendering Model

- HTML5 Canvas 2D API. Two stacked canvases in `.canvas-wrapper`:
  - `#display-canvas` — composited document image
  - `#overlay-canvas` — marching ants, transform handles, brush cursors (redrawn per animation frame)
- Document is recomposited from layers on every change; no incremental dirty-region tracking.

## Architecture

### Data model (`src/document.js`)
- `Document`: `{ id, name, width, height, layers[], activeLayerId, selection }`
- `Layer`: `{ id, name, canvas (HTMLCanvasElement), visible, opacity, x, y }`
- `cloneDocument()` is a deep clone incl. all layer canvases — used for history snapshots AND op purity.

### Op registry pattern (`src/ops.js` + `src/tools/*.js`) — the core convention
- Every document mutation is a **registered op**: `registerOp(name, handler)` where handler is pure: `(docClone, params) => doc`.
- `applyOp(doc, op)` clones the document first, then dispatches. Handlers never mutate the original.
- Single UI entry point: `executeOp(op)` in `main.js`, which does history push → applyOp → action-recorder capture → `renderApp()`. Features that go through it get undo/redo and batch replay for free.
- Ops are serialized as `{ name, params }` JSON by the ActionRecorder, so **params must contain only plain data** (ids, numbers, point arrays — never canvases/DOM refs).
- Interactive previews (transform drags, HSL sliders) mutate nothing persistent: they render via `renderComposite(doc, layerOverrides, excludeLayerId)` or proxy canvases, then commit a real op on release/apply.

### Supporting modules
- `src/history.js` — full-snapshot undo manager (depth 20) built on `cloneDocument`
- `src/recorder.js` — records op list, export/import JSON
- `src/batch-queue.js` — replays recorded ops onto fresh images; zips results with jszip
- `src/coords.js` — `Viewport` class: zoom/pan, screen↔doc coordinate conversion
- `src/selection.js` — selection mask rasterization & combined outline paths
- `src/transform.js` — pure geometry helpers for resize handles (unit-testable, no DOM)
- `src/layers-panel.js` — layers sidebar UI
- `src/main.js` — app-state singleton, DOM refs, ALL event wiring, render loop (~1500 lines)

## Deployment

- `.github/workflows/deploy.yml` on push to `main`: `npm ci` → `npm run build` → upload `dist/` → GitHub Pages (via `actions/deploy-pages`).
- Requires repo setting **Settings → Pages → Source: "GitHub Actions"** (see agent_lessons_learned.md).
- Workflow creates `dist/.nojekyll` itself; no Jekyll processing wanted.
- Note: `dist/` is **committed** to this repo (not gitignored) — rebuild and commit after source changes to keep it honest, even though CI builds its own copy.
