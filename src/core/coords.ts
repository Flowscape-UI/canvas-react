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
