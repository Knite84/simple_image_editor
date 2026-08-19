/**
 * Coordinate space transformations and viewport management
 */

export class Viewport {
  constructor(containerElement, displayCanvas) {
    this.container = containerElement;
    this.canvas = displayCanvas;
    this.zoom = 1; // 1 = 100%
    this.panX = 0; // offset in px relative to container center
    this.panY = 0;
  }

  /**
   * Calculates viewScale based on zoom and devicePixelRatio
   */
  getViewScale() {
    return this.zoom;
  }

  /**
   * Convert screen pointer event coordinates to document pixel coordinates
   * @param {MouseEvent|PointerEvent|TouchEvent} event 
   * @param {Object} doc - Current Document
   * @returns {{x: number, y: number, inBounds: boolean}}
   */
  screenToDoc(event, doc) {
    const canvasRect = this.canvas.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;

    const screenX = clientX - canvasRect.left;
    const screenY = clientY - canvasRect.top;

    const docX = (screenX / canvasRect.width) * doc.width;
    const docY = (screenY / canvasRect.height) * doc.height;

    const inBounds = docX >= 0 && docX <= doc.width && docY >= 0 && docY <= doc.height;

    return {
      x: Math.round(docX),
      y: Math.round(docY),
      rawX: docX,
      rawY: docY,
      inBounds
    };
  }

  /**
   * Convert document coordinates to screen pixel coordinates relative to display canvas
   */
  docToScreen(docX, docY, doc) {
    const canvasRect = this.canvas.getBoundingClientRect();
    return {
      x: (docX / doc.width) * canvasRect.width,
      y: (docY / doc.height) * canvasRect.height
    };
  }

  /**
   * Fit document nicely inside container viewport with padding
   */
  fitToWindow(doc) {
    const containerRect = this.container.getBoundingClientRect();
    const pad = 40; // padding
    const availW = Math.max(100, containerRect.width - pad);
    const availH = Math.max(100, containerRect.height - pad);

    const scaleX = availW / doc.width;
    const scaleY = availH / doc.height;
    this.zoom = Math.min(1, Math.min(scaleX, scaleY));
    this.panX = 0;
    this.panY = 0;
    this.updateTransform(doc);
  }

  /**
   * Set explicit zoom level centered on viewport
   */
  setZoom(zoomFactor, doc, originScreenX = null, originScreenY = null) {
    const minZoom = 0.05;
    const maxZoom = 32.0;
    this.zoom = Math.max(minZoom, Math.min(maxZoom, zoomFactor));
    this.updateTransform(doc);
  }

  /**
   * Apply CSS transform & dimensions to display canvas
   */
  updateTransform(doc) {
    if (!doc) return;
    const displayW = Math.round(doc.width * this.zoom);
    const displayH = Math.round(doc.height * this.zoom);

    this.canvas.style.width = `${displayW}px`;
    this.canvas.style.height = `${displayH}px`;
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
  }
}
