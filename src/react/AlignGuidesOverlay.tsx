import React from 'react';
import { useCanvasStore } from '../state/store';

/**
 * Overlay for rendering ephemeral alignment guides during drag/transform.
 * Guides are provided in WORLD coordinates and converted to SCREEN using the camera.
 */
export function AlignGuidesOverlay(): JSX.Element | null {
  const alignmentGuides = useCanvasStore((s) => s.alignmentGuides);
  const camera = useCanvasStore((s) => s.camera);
  const nodes = useCanvasStore((s) => s.nodes);
  const alignSnapTolerancePx = useCanvasStore((s) => s.alignSnapTolerancePx);

  if (!alignmentGuides || alignmentGuides.length === 0) return null;

  const z = camera.zoom || 1;
  const offsetX = camera.offsetX;
  const offsetY = camera.offsetY;

  const EPS = 1e-6;
  // Helper: get nodes that align with a guide value along axis
  const nodesAlignedToX = (x: number) => {
    const out: { top: number; bottom: number }[] = [];
    const tolWorld = (alignSnapTolerancePx || 0) / (camera.zoom || 1);
    for (const [, n] of Object.entries(nodes)) {
      const left = n.x;
      const right = n.x + n.width;
      const cx = n.x + n.width / 2;
      const eq = Math.abs(left - x) < EPS || Math.abs(cx - x) < EPS || Math.abs(right - x) < EPS;
      // Near: allow any node (selected or static) within tolerance so extent spans across remote nodes
      const near =
        Math.abs(left - x) <= tolWorld ||
        Math.abs(cx - x) <= tolWorld ||
        Math.abs(right - x) <= tolWorld;
      if (eq || near) {
        out.push({ top: n.y, bottom: n.y + n.height });
      }
    }
    return out;
  };
  const nodesAlignedToY = (y: number) => {
    const out: { left: number; right: number }[] = [];
    const tolWorld = (alignSnapTolerancePx || 0) / (camera.zoom || 1);
    for (const [, n] of Object.entries(nodes)) {
      const top = n.y;
      const bottom = n.y + n.height;
      const cy = n.y + n.height / 2;
      const eq = Math.abs(top - y) < EPS || Math.abs(cy - y) < EPS || Math.abs(bottom - y) < EPS;
      const near =
        Math.abs(top - y) <= tolWorld ||
        Math.abs(cy - y) <= tolWorld ||
        Math.abs(bottom - y) <= tolWorld;
      if (eq || near) {
        out.push({ left: n.x, right: n.x + n.width });
      }
    }
    return out;
  };

  return (
    <div
      aria-hidden
      data-rc-align-guides
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      {alignmentGuides.map((g, i) => {
        const key = `${g.axis}-${g.kind}-${g.targetId}-${g.at}-${i}`;
        const isVertical = g.axis === 'x';
        const screen = isVertical ? (g.at - offsetX) * z : (g.at - offsetY) * z;
        const color = g.kind === 'center' ? 'rgba(168, 85, 247, 0.9)' : 'rgba(236, 72, 153, 0.95)';
        const secondary =
          g.kind === 'center' ? 'rgba(168, 85, 247, 0.35)' : 'rgba(236, 72, 153, 0.35)';
        const styleCommon: React.CSSProperties = {
          position: 'absolute',
          pointerEvents: 'none',
        };
        if (isVertical) {
          // Bound the vertical segment to the furthest aligned nodes
          const aligned = nodesAlignedToX(g.at);
          if (aligned.length < 2) return null; // avoid tiny segments when only dragged node is near
          const topWorld = aligned.length ? Math.min(...aligned.map((a) => a.top)) : offsetY; // fallback to viewport
          const bottomWorld = aligned.length
            ? Math.max(...aligned.map((a) => a.bottom))
            : offsetY + (1 / z) * (typeof window !== 'undefined' ? window.innerHeight : 0);
          const topScreen = (topWorld - offsetY) * z;
          const bottomScreen = (bottomWorld - offsetY) * z;
          const height = Math.max(0, Math.round(bottomScreen) - Math.round(topScreen));
          return (
            <div
              key={key}
              style={{
                ...styleCommon,
                left: Math.round(screen) + 0.5,
                top: Math.round(topScreen),
                height,
              }}
            >
              {/* bold center line */}
              <div
                style={{
                  position: 'absolute',
                  left: -1,
                  top: 0,
                  width: 2,
                  height,
                  backgroundColor: color,
                  opacity: 0.9,
                }}
              />
              {/* faint halo */}
              <div
                style={{
                  position: 'absolute',
                  left: -2.5,
                  top: 0,
                  width: 5,
                  height,
                  background: `linear-gradient(to right, transparent, ${secondary}, transparent)`,
                }}
              />
            </div>
          );
        }
        // Horizontal bounded segment
        const aligned = nodesAlignedToY(g.at);
        if (aligned.length < 2) return null; // avoid tiny segments when only dragged node is near
        const leftWorld = aligned.length ? Math.min(...aligned.map((a) => a.left)) : offsetX;
        const rightWorld = aligned.length
          ? Math.max(...aligned.map((a) => a.right))
          : offsetX + (1 / z) * (typeof window !== 'undefined' ? window.innerWidth : 0);
        const leftScreen = (leftWorld - offsetX) * z;
        const rightScreen = (rightWorld - offsetX) * z;
        const width = Math.max(0, Math.round(rightScreen) - Math.round(leftScreen));
        return (
          <div
            key={key}
            style={{
              ...styleCommon,
              top: Math.round(screen) + 0.5,
              left: Math.round(leftScreen),
              width,
            }}
          >
            {/* bold center line */}
            <div
              style={{
                position: 'absolute',
                top: -1,
                left: 0,
                height: 2,
                width,
                backgroundColor: color,
                opacity: 0.9,
              }}
            />
            {/* faint halo */}
            <div
              style={{
                position: 'absolute',
                top: -2.5,
                left: 0,
                height: 5,
                width,
                background: `linear-gradient(to bottom, transparent, ${secondary}, transparent)`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
