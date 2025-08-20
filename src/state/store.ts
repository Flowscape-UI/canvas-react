import { create } from 'zustand';
import type { Camera, Point } from '../core/coords';
import { applyPan, clampZoom, zoomAtPoint } from '../core/coords';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;

export type CanvasState = {
  readonly camera: Camera;
};

export type CanvasActions = {
  setCamera: (camera: Camera) => void;
  panBy: (dx: number, dy: number) => void;
  zoomTo: (zoom: number) => void;
  /** Zoom by factor centered at screenPoint (screen coords in px). */
  zoomByAt: (screenPoint: Point, factor: number) => void;
};

export type CanvasStore = CanvasState & CanvasActions;

const initialCamera: Camera = { zoom: 1, offsetX: 0, offsetY: 0 };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const useCanvasStore = create<CanvasStore>()((set, get) => ({
  camera: initialCamera,

  setCamera: (camera) => set({ camera }),

  panBy: (dx, dy) => set((s) => ({ camera: applyPan(s.camera, dx, dy) })),

  zoomTo: (zoom) =>
    set((s) => ({
      camera: { ...s.camera, zoom: clampZoom(zoom, MIN_ZOOM, MAX_ZOOM) },
    })),

  zoomByAt: (screenPoint, factor) =>
    set((s) => ({ camera: zoomAtPoint(s.camera, screenPoint, factor, MIN_ZOOM, MAX_ZOOM) })),
}));

// Convenience hooks
export function useCamera(): Camera {
  return useCanvasStore((s) => s.camera);
}

export function useCanvasActions(): Pick<
  CanvasActions,
  'setCamera' | 'panBy' | 'zoomTo' | 'zoomByAt'
> {
  return useCanvasStore((s) => ({
    setCamera: s.setCamera,
    panBy: s.panBy,
    zoomTo: s.zoomTo,
    zoomByAt: s.zoomByAt,
  }));
}
