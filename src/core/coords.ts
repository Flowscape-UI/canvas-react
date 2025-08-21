export type Point = { x: number; y: number };
export type Camera = { zoom: number; offsetX: number; offsetY: number };

export function worldToScreen(p: Point, camera: Camera): Point {
  return {
    x: (p.x - camera.offsetX) * camera.zoom,
    y: (p.y - camera.offsetY) * camera.zoom,
  };
}

export function screenToWorld(p: Point, camera: Camera): Point {
  return {
    x: p.x / camera.zoom + camera.offsetX,
    y: p.y / camera.zoom + camera.offsetY,
  };
}

/**
 * Clamp a zoom value to sane defaults (10%..500%).
 * You can override min/max if needed.
 */
export function clampZoom(zoom: number, min = 0.1, max = 5): number {
  if (!Number.isFinite(zoom)) return min;
  if (zoom < min) return min;
  if (zoom > max) return max;
  return zoom;
}

/**
 * Apply pan in WORLD units. Positive dx moves the camera right (content appears to move left).
 */
export function applyPan(camera: Camera, dx: number, dy: number): Camera {
  return {
    zoom: camera.zoom,
    offsetX: camera.offsetX + dx,
    offsetY: camera.offsetY + dy,
  };
}

/**
 * Zoom at a specific SCREEN point, keeping that point visually stationary.
 * factor > 1 zooms in; factor < 1 zooms out.
 */
export function zoomAtPoint(camera: Camera, screenPoint: Point, factor: number, min = 0.1, max = 5): Camera {
  const targetWorld = screenToWorld(screenPoint, camera);
  const nextZoom = clampZoom(camera.zoom * factor, min, max);
  // Solve for offsets so that worldToScreen(targetWorld, nextCamera) == screenPoint
  const nextOffsetX = targetWorld.x - screenPoint.x / nextZoom;
  const nextOffsetY = targetWorld.y - screenPoint.y / nextZoom;
  return { zoom: nextZoom, offsetX: nextOffsetX, offsetY: nextOffsetY };
}

/**
 * Compute a CSS transform for a content layer representing WORLD space.
 * Usage example: style={{ transform: cameraToCssTransform(camera) }}
 */
export function cameraToCssTransform(camera: Camera): string {
  // CSS applies transform functions right-to-left.
  // We need translate first, then scale to satisfy: screen = (x - offset) * zoom.
  // Therefore write: scale(...) translate(...), so translate runs first.
  return `scale(${camera.zoom}) translate(${-camera.offsetX}px, ${-camera.offsetY}px)`;
}
