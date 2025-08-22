import React from 'react';
import { useWorldLockedTile } from './useWorldLockedTile';

export type BackgroundCellsProps = {
  size?: number; // base cell size in world units (px)
  lineWidth?: number; // grid line width in screen px
  colorMinor?: string; // line color
  baseColor?: string; // background fill color
  dprSnap?: boolean | number; // snap tile size/offset to device pixels to avoid anti-aliased thicker lines
  style?: React.CSSProperties;
};

/**
 * Viewport-filling background of cells (grid) locked to WORLD coordinates.
 * Uses the same world-locked smooth tiling as BackgroundDots.
 */
export function BackgroundCells({
  size = 24,
  lineWidth = 1,
  colorMinor = '#91919a',
  baseColor = '#f7f9fb',
  dprSnap = true,
  style,
}: BackgroundCellsProps) {
  const { styleForLayers } = useWorldLockedTile({ size, dprSnap });
  const tileStyle = styleForLayers(2);

  // Two orthogonal 1px lines per cell: vertical + horizontal
  // The transparent stop at 0 then a thin colored line then transparent again.
  const vertical = `linear-gradient(to right, ${colorMinor} ${lineWidth}px, transparent ${lineWidth}px)`;
  const horizontal = `linear-gradient(to bottom, ${colorMinor} ${lineWidth}px, transparent ${lineWidth}px)`;

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        backgroundColor: baseColor,
        backgroundImage: `${vertical}, ${horizontal}`,
        backgroundRepeat: 'repeat, repeat',
        ...tileStyle,
        ...style,
      }}
    />
  );
}
