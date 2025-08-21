import React from 'react';
import { useCamera } from '../state/store';

export type BackgroundDotsProps = {
  size?: number; // base grid step in world units (px)
  dotRadius?: number; // dot radius in screen px
  colorMinor?: string;
  colorMajor?: string;
  baseColor?: string;
  majorEvery?: number; // emphasize each Nth row/column
  style?: React.CSSProperties;
};

/**
 * Viewport-filling dotted background that is locked to WORLD coordinates
 * (moves with pan, respects zoom via scaled cell size) but is NOT scaled itself.
 * Place as a direct child of the canvas container (not inside the transformed world).
 */
export function BackgroundDots({
  size = 24,
  dotRadius = 1.2,
  colorMinor = '#91919a',
  baseColor = '#f7f9fb',
  style,
}: BackgroundDotsProps) {
  const camera = useCamera();

  // Build dot layers
  const minor = `radial-gradient(${colorMinor} ${dotRadius}px, transparent ${dotRadius}px)`;
  // Scale cell size by zoom and snap to integer px to prevent tiling seams.
  const scaled = Math.max(1, Math.round(size * camera.zoom));
  // Offsets snapped to integers to avoid half-pixel artifacts
  const mod = (a: number, n: number) => ((a % n) + n) % n;
  const baseOffX = -camera.offsetX * camera.zoom;
  const baseOffY = -camera.offsetY * camera.zoom;
  const offX = Math.round(mod(baseOffX, scaled));
  const offY = Math.round(mod(baseOffY, scaled));

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        backgroundColor: baseColor,
        backgroundImage: `${minor}`,
        backgroundSize: `${scaled}px ${scaled}px`,
        backgroundPosition: `${offX}px ${offY}px`,
        ...style,
      }}
    />
  );
}
