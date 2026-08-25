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

## Deployment

Pushes to `main` trigger the GitHub Actions workflow (`.github/workflows/deploy.yml`), which builds the site and publishes `dist/` to GitHub Pages. Requires the repo's **Settings → Pages → Source** to be set to **GitHub Actions**.
