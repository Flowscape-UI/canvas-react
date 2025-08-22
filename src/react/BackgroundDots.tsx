import React from 'react';
import { useWorldLockedTile } from './useWorldLockedTile';

export type BackgroundDotsProps = {
  size?: number; // base grid step in world units (px)
  dotRadius?: number; // dot radius in screen px
  colorMinor?: string;
  colorMajor?: string;
  baseColor?: string;
  dprSnap?: boolean | number; // optionally snap tile offsets to device pixels
  majorEvery?: number; // emphasize each Nth row/column
  style?: React.CSSProperties;
};

/**
 * Viewport-filling dotted background locked to WORLD coordinates.
 * - Moves with pan (phase depends on camera offsets).
 * - Respects zoom by changing backgroundSize smoothly (no integer rounding).
 * - Avoids jitter during zoom by computing phase from continuous values.
 * Place as a direct child of the canvas container (not inside the transformed world).
 */
export function BackgroundDots({
  size = 24,
  dotRadius = 1.2,
  colorMinor = '#91919a',
  baseColor = '#f7f9fb',
  dprSnap = true,
  style,
}: BackgroundDotsProps) {
  // Build dot layer and compute world-locked tiling
  const minor = `radial-gradient(${colorMinor} ${dotRadius}px, transparent ${dotRadius}px)`;
  const { style: tileStyle } = useWorldLockedTile({ size, dprSnap });

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
        ...tileStyle,
        ...style,
      }}
    />
  );
}

