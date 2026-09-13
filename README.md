# simple_image_editor

A local-first web photo editor with layers, selections, transforms, HSL adjustments, an action recorder, and batch processing.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ (includes `npm`)

### Run Locally (Development)

```bash
npm install    # first time only
npm run dev
```

Then open the URL shown in the terminal (default: `http://localhost:3000`).

> **Important:** Always use `npm run dev`. Do **not** open `index.html` directly by double-clicking it — browsers block ES module loading over `file://` (CORS), so the page will render but every button will be dead.

### Test a Production Build

```bash
npm run build      # outputs to dist/
npm run preview    # serves dist/ locally at http://localhost:4173
```

This is the closest approximation to what GitHub Pages serves.

## Tools & Shortcuts

| Key | Tool |
|---|---|
| V / R | Transform |
| M | Rectangular select |
| L | Lasso select |
| C | Crop |
| U | Hue & Saturation |
| B | Blur |
| G | Fill (paint bucket) |
| T | Text |
| I | Dropper (Alt+Click samples from any tool) |
| S | Clone stamp |
| H / Space | Pan |
| Del | Delete selection contents |
| Ctrl+C | Copy active layer inside selection (whole layer if none) |
| Ctrl+X | Cut selection (copies, then deletes contents) |
| Ctrl+V | Paste as a new layer at original position (falls back to the browser's image paste when the internal clipboard is empty) |
| Ctrl+D | Clear selection |

Marching-ants tip: with the Transform tool active, the vertical move arrows mean a drag will move the layer; a plain arrow cursor means a selection exists, so a drag moves the selection outline instead.

## Inverse Selection

Both the rectangle and lasso tools have an **Inverse Selection** button next to Clear Selection. It flips the selection — selected pixels become deselected and vice versa. Inverting when nothing is selected is a no-op (nothing selected already means "everything").

## Deployment

Pushes to `main` trigger the GitHub Actions workflow (`.github/workflows/deploy.yml`), which builds the site and publishes `dist/` to GitHub Pages. Requires the repo's **Settings → Pages → Source** to be set to **GitHub Actions**.
