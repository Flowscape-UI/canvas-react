import { useMemo } from 'react';
import { useCamera } from '../state/store';
import type { Camera } from '../core/coords';

export type TileSize = number | { x: number; y: number };

export type UseWorldLockedTileOptions = {
  size: TileSize; // base size in world units (px)
  dprSnap?: boolean | number; // false = off (default), true = use window.devicePixelRatio, number = explicit DPR
  userOffset?: { x?: number; y?: number }; // extra world-space phase, optional
  camera?: Camera; // optional override
};

export type UseWorldLockedTileResult = {
  scaledX: number;
  scaledY: number;
  offsetX: number;
  offsetY: number;
  style: Pick<CSSStyleDeclaration, 'backgroundSize' | 'backgroundPosition'>;
  styleForLayers: (count: number) => Pick<CSSStyleDeclaration, 'backgroundSize' | 'backgroundPosition'>;
};

function mod(a: number, n: number) {
  return ((a % n) + n) % n;
}

export function useWorldLockedTile(options: UseWorldLockedTileOptions): UseWorldLockedTileResult {
  const cameraState = useCamera();
  const cam = options.camera ?? cameraState;

  return useMemo(() => {
    const sizeX = typeof options.size === 'number' ? options.size : options.size.x;
    const sizeY = typeof options.size === 'number' ? options.size : options.size.y;
    const zoom = cam.zoom;

    // Base scaled size in screen px
    const rawScaledX = Math.max(1, sizeX * zoom);
    const rawScaledY = Math.max(1, sizeY * zoom);

    const extraX = options.userOffset?.x ?? 0;
    const extraY = options.userOffset?.y ?? 0;

    // Optional DPR snapping for subtle seam mitigation
    const dprEnabled = !!options.dprSnap;
    const dpr = dprEnabled
      ? (typeof options.dprSnap === 'number' ? options.dprSnap : (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1))
      : 1;
    const roundTo = (v: number) => Math.round(v * dpr) / dpr;

    // Keep tile size continuous to avoid zoom-induced pattern shifts
    const scaledX = rawScaledX;
    const scaledY = rawScaledY;

    let offX = mod(-(cam.offsetX + extraX) * zoom, scaledX);
    let offY = mod(-(cam.offsetY + extraY) * zoom, scaledY);
    // Snap only offsets to device pixels for crisper lines, without changing tile size
    if (dprEnabled) {
      offX = roundTo(offX);
      offY = roundTo(offY);
    }

    const makeStyle = (layers: number) => {
      const sizeStr = Array(layers).fill(`${scaledX}px ${scaledY}px`).join(', ');
      const posStr = Array(layers).fill(`${offX}px ${offY}px`).join(', ');
      return {
        backgroundSize: sizeStr,
        backgroundPosition: posStr,
      } as Pick<CSSStyleDeclaration, 'backgroundSize' | 'backgroundPosition'>;
    };

    return {
      scaledX,
      scaledY,
      offsetX: offX,
      offsetY: offY,
      style: makeStyle(1),
      styleForLayers: makeStyle,
    };
  }, [cam.offsetX, cam.offsetY, cam.zoom, options.size, options.dprSnap, options.userOffset?.x, options.userOffset?.y]);
}
