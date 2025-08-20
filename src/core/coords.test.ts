import { describe, it, expect } from 'vitest';
import {
  worldToScreen,
  screenToWorld,
  clampZoom,
  zoomAtPoint,
  type Camera,
  type Point,
} from './coords';

describe('coords', () => {
  it('worldToScreen and screenToWorld roundtrip', () => {
    const camera: Camera = { zoom: 2, offsetX: 5, offsetY: -5 };
    const world: Point = { x: 10, y: 20 };

    const screen = worldToScreen(world, camera);
    expect(screen).toEqual({ x: (10 - 5) * 2, y: (20 - -5) * 2 });

    const back = screenToWorld(screen, camera);
    expect(back).toEqual(world);
  });

  it('clampZoom keeps zoom within bounds', () => {
    expect(clampZoom(0.05)).toBeCloseTo(0.1);
    expect(clampZoom(10)).toBeCloseTo(5);
    expect(clampZoom(1)).toBeCloseTo(1);
  });

  it('zoomAtPoint keeps the target screen point stationary', () => {
    const camera: Camera = { zoom: 1, offsetX: 0, offsetY: 0 };
    const p: Point = { x: 100, y: 50 }; // screen point in px

    const next = zoomAtPoint(camera, p, 2);

    // The world point under p before zoom
    const worldBefore = screenToWorld(p, camera);
    // After zoom, that same world point should map to the same screen point
    const screenAfter = worldToScreen(worldBefore, next);

    expect(screenAfter.x).toBeCloseTo(p.x, 6);
    expect(screenAfter.y).toBeCloseTo(p.y, 6);
  });
});
