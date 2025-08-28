import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCanvasStore } from '../state/store';
import type { Node, NodeId } from '../types';

// Screen-space padding around the frame (in CSS pixels)
const FRAME_PADDING_PX = 8;
const HANDLE_SIZE_PX = 8; // square handles for resize
const ROTATE_HANDLE_OFFSET_PX = 14; // distance from corner outward
const ROTATE_HANDLE_SIZE_PX = 12; // circular rotate handle
const RADIUS_HANDLE_SIZE_PX = 10; // circular corner-radius handle
const RADIUS_HANDLE_INSET_PX = 10; // inset from corner towards center

function getPrimaryNodeForEdit(
  nodes: Record<NodeId, Node>,
  selected: Record<NodeId, true>,
  innerEditNodeId: NodeId | null,
): Node | null {
  if (innerEditNodeId && nodes[innerEditNodeId]) return nodes[innerEditNodeId] as Node;
  const ids = Object.keys(selected) as NodeId[];
  if (ids.length === 1) return nodes[ids[0]] || null;
  return null;
}

export const EditFrameOverlay: React.FC = () => {
  const {
    camera,
    nodes,
    selected,
    innerEditNodeId,
    isDraggingNode,
    resizeSelectionTemporary,
    resizeSelectionCommit,
    rotateSelectionTemporary,
    rotateSelectionCommit,
    setCornerRadiusTemporary,
    setCornerRadiusCommit,
  } = useCanvasStore();

  const node = useMemo(
    () => getPrimaryNodeForEdit(nodes, selected, innerEditNodeId),
    [nodes, selected, innerEditNodeId],
  );

  // Local gesture state (so we can compute from->to for commits)
  const gestureRef = useRef<null | {
    type: 'resize' | 'rotate' | 'radius';
    anchor?: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
    from: { width: number; height: number; rotation: number; cx: number; cy: number };
    tmp: { width: number; height: number; rotation: number };
    pointerId: number;
    startClientX: number;
    startClientY: number;
    fromCenter: boolean;
    proportional: boolean;
    startAngleDeg?: number; // only for rotate
    // for radius
    corner?: 'tl' | 'tr' | 'br' | 'bl';
    startCornerRadius?: Node['cornerRadius'];
    uniform?: boolean;
  }>(null);

  // Convert world to screen
  const z = camera.zoom || 1;

  // Derived screen bbox and transform
  const screen = useMemo(() => {
    if (!node)
      return null as null | {
        x: number;
        y: number;
        w: number;
        h: number;
        rotation: number;
        cx: number;
        cy: number;
      };
    const w = Math.max(0, node.width);
    const h = Math.max(0, node.height);
    const x = (node.x - camera.offsetX) * z;
    const y = (node.y - camera.offsetY) * z;
    const rotation = node.rotation || 0;
    const cx = x + (w * z) / 2;
    const cy = y + (h * z) / 2;
    return { x, y, w: w * z, h: h * z, rotation, cx, cy };
  }, [node, camera.offsetX, camera.offsetY, z]);

  // Apply in-gesture temporary dimensions if any
  const [liveDims, setLiveDims] = useState<{ w: number; h: number; rotation: number } | null>(null);
  useEffect(() => {
    // Reset live dimensions when node changes
    setLiveDims(null);
    gestureRef.current = null;
  }, [node?.id]);

  // Global handlers during gesture to avoid CSS pointer-events issues
  useEffect(() => {
    const doCommit = () => {
      const g = gestureRef.current;
      if (!g) return;
      if (g.type === 'rotate') {
        const toAngle = liveDims?.rotation ?? g.from.rotation;
        rotateSelectionCommit(g.from.rotation, toAngle);
      } else if (g.type === 'resize') {
        const toW = Math.max(1, (liveDims?.w ?? screen?.w ?? 0) / z);
        const toH = Math.max(1, (liveDims?.h ?? screen?.h ?? 0) / z);
        resizeSelectionCommit(
          { width: g.from.width, height: g.from.height },
          { width: toW, height: toH },
        );
      } else if (g.type === 'radius') {
        const currentNodeId = innerEditNodeId || (Object.keys(selected)[0] as NodeId | undefined);
        const currentNode = currentNodeId ? useCanvasStore.getState().nodes[currentNodeId] : null;
        const to = currentNode?.cornerRadius;
        setCornerRadiusCommit(
          g.startCornerRadius as Node['cornerRadius'],
          to as Node['cornerRadius'],
        );
      }
      gestureRef.current = null;
    };

    const onMove = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g) return;
      if (e.pointerId !== g.pointerId) return;
      // If left mouse button is no longer pressed - commit and stop gesture
      if (typeof e.buttons === 'number' && (e.buttons & 1) === 0) {
        doCommit();
        return;
      }
      const dxPx = e.clientX - g.startClientX || 0;
      const dyPx = e.clientY - g.startClientY || 0;

      if (g.type === 'rotate') {
        // Angle-based rotation around center: delta between current vector and start vector
        const cx = g.from.cx;
        const cy = g.from.cy;
        const curAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
        const startAngle =
          g.startAngleDeg ?? Math.atan2(g.startClientY - cy, g.startClientX - cx) * (180 / Math.PI);
        let deltaDeg = curAngle - startAngle;
        // normalize to [-180, 180]
        deltaDeg = ((((deltaDeg + 180) % 360) + 360) % 360) - 180;
        const next = g.from.rotation + deltaDeg;
        setLiveDims((prev) => ({
          w: prev?.w ?? screen?.w ?? 0,
          h: prev?.h ?? screen?.h ?? 0,
          rotation: next,
        }));
        rotateSelectionTemporary(deltaDeg);
        return;
      }

      if (g.type === 'radius') {
        const invZ = 1 / (camera.zoom || 1);
        // Positive when moving inward toward the center from the active corner
        const sx = anchorXSign(g.anchor);
        const sy = anchorYSign(g.anchor);
        const inwardPx = -((sx as number) * dxPx + (sy as number) * dyPx);
        const deltaWorld = inwardPx * invZ;
        const minHalf = Math.max(0, Math.min(g.from.width, g.from.height) / 2);
        const start = g.startCornerRadius;
        let nextValue: Node['cornerRadius'] | undefined = undefined;
        const uniform = (e.ctrlKey ?? false) || !!g.uniform;
        if (uniform) {
          const base = typeof start === 'number' ? (start ?? 0) : 0;
          const v = Math.max(0, Math.min(minHalf, (base as number) + deltaWorld));
          nextValue = v;
        } else {
          const baseObj = (
            typeof start === 'object' && start ? start : { tl: 0, tr: 0, br: 0, bl: 0 }
          ) as { tl: number; tr: number; br: number; bl: number };
          const cur: { tl: number; tr: number; br: number; bl: number } = { ...baseObj };
          const key = (g.corner ?? 'tl') as 'tl' | 'tr' | 'br' | 'bl';
          const v = Math.max(0, Math.min(minHalf, (cur[key] || 0) + deltaWorld));
          cur[key] = v;
          nextValue = cur;
        }
        if (nextValue != null) setCornerRadiusTemporary(nextValue);
        return;
      }

      // resize: convert screen pixels to world units
      const invZ = 1 / (camera.zoom || 1);
      const dxWorld = dxPx * invZ * (anchorXSign(g.anchor) as number);
      const dyWorld = dyPx * invZ * (anchorYSign(g.anchor) as number);

      let newW = Math.max(
        1,
        g.from.width + dxWorld * (g.proportional ? Math.sign(g.from.width) : 1),
      );
      let newH = Math.max(
        1,
        g.from.height + dyWorld * (g.proportional ? Math.sign(g.from.height) : 1),
      );

      if (g.proportional) {
        const aspect = g.from.width / Math.max(1, g.from.height);
        if (Math.abs(dxWorld) > Math.abs(dyWorld))
          newH = Math.max(1, newW / Math.max(0.01, aspect));
        else newW = Math.max(1, newH * Math.max(0.01, aspect));
      }

      // Center-resize: adjust both sides equally by doubling deltas
      if (g.fromCenter) {
        const k2 = 2; // double the delta
        newW = Math.max(1, g.from.width + (newW - g.from.width) * k2);
        newH = Math.max(1, g.from.height + (newH - g.from.height) * k2);
      }

      setLiveDims({ w: newW * z, h: newH * z, rotation: g.from.rotation });
      resizeSelectionTemporary({
        dx: dxWorld,
        dy: dyWorld,
        anchor: g.anchor,
        proportional: g.proportional,
        fromCenter: g.fromCenter,
        fromWidth: g.from.width,
        fromHeight: g.from.height,
      });
    };

    const onUp = () => doCommit();
    const onCancel = () => doCommit();

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onCancel, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera.zoom, screen?.w, screen?.h, z, liveDims?.rotation]);

  // Hide overlay if nothing to show
  if (!node || !screen) return null;

  const rotation = liveDims?.rotation ?? screen.rotation;
  const w = liveDims?.w ?? screen.w;
  const h = liveDims?.h ?? screen.h;

  const frameLeft = screen.x - FRAME_PADDING_PX;
  const frameTop = screen.y - FRAME_PADDING_PX;
  const frameWidth = w + FRAME_PADDING_PX * 2;
  const frameHeight = h + FRAME_PADDING_PX * 2;

  // Size badge (world units) shown during resize
  const isResizing = (gestureRef.current?.type ?? null) === 'resize';

  // During real node drag (after threshold), hide the edit frame to reduce visual noise
  if (isDraggingNode && !isResizing) return null;
  const displayWWorld = Math.max(1, Math.round(((liveDims?.w ?? screen.w) as number) / z));
  const displayHWorld = Math.max(1, Math.round(((liveDims?.h ?? screen.h) as number) / z));
  const badgeLeft = frameLeft + frameWidth / 2;
  const badgeTop = frameTop + frameHeight + 8; // gap below frame

  // Handle helpers (local coordinates inside rotated container)
  type Anchor = 'nw' | 'ne' | 'se' | 'sw';
  const anchors: Anchor[] = ['nw', 'ne', 'se', 'sw'];
  const anchorPosLocal = (
    a: Anchor,
  ): { x: number; y: number; cursor: React.CSSProperties['cursor'] } => {
    const cs: Record<Anchor, React.CSSProperties['cursor']> = {
      nw: rotationCursor('nw', rotation),
      ne: rotationCursor('ne', rotation),
      se: rotationCursor('se', rotation),
      sw: rotationCursor('sw', rotation),
    };
    switch (a) {
      case 'nw':
        return { x: 0, y: 0, cursor: cs.nw };
      case 'ne':
        return { x: frameWidth, y: 0, cursor: cs.ne };
      case 'se':
        return { x: frameWidth, y: frameHeight, cursor: cs.se };
      case 'sw':
        return { x: 0, y: frameHeight, cursor: cs.sw };
    }
  };

  // Rotate handle positions (local): a bit outside each corner along its outward diagonal
  const rotateHandlePosLocal = (a: Anchor): { x: number; y: number } => {
    const p = anchorPosLocal(a);
    const dx = a === 'ne' || a === 'se' ? ROTATE_HANDLE_OFFSET_PX : -ROTATE_HANDLE_OFFSET_PX;
    const dy = a === 'se' || a === 'sw' ? ROTATE_HANDLE_OFFSET_PX : -ROTATE_HANDLE_OFFSET_PX;
    return { x: p.x + dx, y: p.y + dy };
  };

  // Corner-radius handle positions (local): slightly inside each corner
  const radiusHandlePosLocal = (a: Anchor): { x: number; y: number } => {
    const p = anchorPosLocal(a);
    const sx = anchorXSign(a);
    const sy = anchorYSign(a);
    const dx = -(sx as number) * RADIUS_HANDLE_INSET_PX;
    const dy = -(sy as number) * RADIUS_HANDLE_INSET_PX;
    return { x: p.x + dx, y: p.y + dy };
  };

  function rotationCursor(anchor: Anchor, deg: number): React.CSSProperties['cursor'] {
    // Choose a resize cursor based on current rotation to feel natural
    const norm = ((deg % 360) + 360) % 360;
    // Base mapping at 0deg
    const base: Record<Anchor, string> = {
      nw: 'nwse-resize',
      ne: 'nesw-resize',
      se: 'nwse-resize',
      sw: 'nesw-resize',
    };
    // Every ~45deg swap
    const idx = Math.round(norm / 45) % 2; // 0 or 1 flips mappings
    if (idx === 0) return base[anchor] as React.CSSProperties['cursor'];
    // swap the two
    const swapped: Record<Anchor, string> = {
      nw: 'nesw-resize',
      ne: 'nwse-resize',
      se: 'nesw-resize',
      sw: 'nwse-resize',
    };
    return swapped[anchor] as React.CSSProperties['cursor'];
  }

  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>, anchor: Anchor) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const el = e.currentTarget as Element & { setPointerCapture?: (id: number) => void };
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }

    const from = {
      width: node.width,
      height: node.height,
      rotation: node.rotation || 0,
      cx: screen.cx,
      cy: screen.cy,
    };
    gestureRef.current = {
      type: 'resize',
      anchor,
      from,
      tmp: { width: from.width, height: from.height, rotation: from.rotation },
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      fromCenter: e.altKey,
      proportional: e.shiftKey,
    };
    setLiveDims({ w: screen.w, h: screen.h, rotation: from.rotation });
  };

  const onRadiusHandlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    anchor: Anchor,
    corner: 'tl' | 'tr' | 'br' | 'bl',
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const el = e.currentTarget as Element & { setPointerCapture?: (id: number) => void };
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }

    if (!screen) return;
    const from = {
      width: node.width,
      height: node.height,
      rotation: node.rotation || 0,
      cx: screen.cx,
      cy: screen.cy,
    };
    const startCornerRadius = node.cornerRadius;
    gestureRef.current = {
      type: 'radius',
      anchor,
      corner,
      from,
      startCornerRadius,
      tmp: { width: from.width, height: from.height, rotation: from.rotation },
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      fromCenter: false,
      proportional: false,
      uniform: e.ctrlKey,
    };
  };

  const onRotateHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>, anchor: Anchor) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const el = e.currentTarget as Element & { setPointerCapture?: (id: number) => void };
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }

    const from = {
      width: node.width,
      height: node.height,
      rotation: node.rotation || 0,
      cx: screen.cx,
      cy: screen.cy,
    };
    const startAngleDeg =
      Math.atan2(e.clientY - screen.cy, e.clientX - screen.cx) * (180 / Math.PI);
    gestureRef.current = {
      type: 'rotate',
      anchor,
      from,
      tmp: { width: from.width, height: from.height, rotation: from.rotation },
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      fromCenter: false,
      proportional: false,
      startAngleDeg,
    };
    setLiveDims({ w: screen.w, h: screen.h, rotation: from.rotation });
  };

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 3,
      }}
    >
      {/* Rotated frame container: all handles inside so they rotate together */}
      <div
        style={{
          position: 'absolute',
          left: frameLeft,
          top: frameTop,
          width: frameWidth,
          height: frameHeight,
          transform: `rotate(${rotation}deg)`,
          transformOrigin: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            outline: '1px solid rgba(59, 130, 246, 0.9)',
            boxShadow: 'inset 0 0 0 1px rgba(59,130,246,0.4)',
            borderRadius: 2,
            pointerEvents: 'none',
          }}
        />

        {/* Corner resize handles (local) */}
        {anchors.map((a) => {
          const pos = anchorPosLocal(a);
          return (
            <div
              key={a}
              onPointerDown={(e) => onHandlePointerDown(e, a)}
              style={{
                position: 'absolute',
                left: pos.x - HANDLE_SIZE_PX / 2,
                top: pos.y - HANDLE_SIZE_PX / 2,
                width: HANDLE_SIZE_PX,
                height: HANDLE_SIZE_PX,
                background: '#fff',
                border: '1px solid rgba(59,130,246,0.9)',
                borderRadius: 2,
                boxSizing: 'border-box',
                cursor: pos.cursor,
                pointerEvents: 'auto',
                zIndex: 4,
              }}
              title={'Drag corner to resize. Shift: keep aspect. Alt: resize from center.'}
            />
          );
        })}

        {/* Corner radius handles (local, inside corners) */}
        {anchors.map((a) => {
          const pos = radiusHandlePosLocal(a);
          const corner: Record<Anchor, 'tl' | 'tr' | 'br' | 'bl'> = {
            nw: 'tl',
            ne: 'tr',
            se: 'br',
            sw: 'bl',
          };
          return (
            <div
              key={`rad-${a}`}
              onPointerDown={(e) => onRadiusHandlePointerDown(e, a, corner[a])}
              style={{
                position: 'absolute',
                left: pos.x - RADIUS_HANDLE_SIZE_PX / 2,
                top: pos.y - RADIUS_HANDLE_SIZE_PX / 2,
                width: RADIUS_HANDLE_SIZE_PX,
                height: RADIUS_HANDLE_SIZE_PX,
                background: '#fff',
                border: '1px solid rgba(59,130,246,0.9)',
                borderRadius: RADIUS_HANDLE_SIZE_PX / 2,
                boxSizing: 'border-box',
                cursor: 'pointer',
                pointerEvents: 'auto',
                zIndex: 5,
              }}
              title={'Corner radius. Drag inward to increase. Ctrl: uniform radius.'}
            />
          );
        })}

        {/* Rotate handles (local, outside corners) */}
        {anchors.map((a) => {
          const pos = rotateHandlePosLocal(a);
          return (
            <div
              key={`rot-${a}`}
              onPointerDown={(e) => onRotateHandlePointerDown(e, a)}
              style={{
                position: 'absolute',
                left: pos.x - ROTATE_HANDLE_SIZE_PX / 2,
                top: pos.y - ROTATE_HANDLE_SIZE_PX / 2,
                width: ROTATE_HANDLE_SIZE_PX,
                height: ROTATE_HANDLE_SIZE_PX,
                background: '#fff',
                border: '1px solid rgba(59,130,246,0.9)',
                borderRadius: ROTATE_HANDLE_SIZE_PX / 2,
                boxSizing: 'border-box',
                cursor: 'grab',
                pointerEvents: 'auto',
                zIndex: 5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title={'Rotate around center'}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderTop: '2px solid rgba(59,130,246,0.9)',
                  borderRight: '2px solid rgba(59,130,246,0.9)',
                  borderRadius: 2,
                  transform:
                    a === 'nw'
                      ? 'rotate(-135deg)'
                      : a === 'ne'
                        ? 'rotate(-45deg)'
                        : a === 'se'
                          ? 'rotate(45deg)'
                          : 'rotate(135deg)',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Size badge (w × h) under the frame during resize */}
      {isResizing ? (
        <div
          style={{
            position: 'absolute',
            left: badgeLeft,
            top: badgeTop,
            transform: 'translateX(-50%)',
            background: 'rgba(59,130,246,1)',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.4,
            fontWeight: 600,
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            pointerEvents: 'none',
            zIndex: 6,
            whiteSpace: 'nowrap',
          }}
        >
          {displayWWorld} × {displayHWorld}
        </div>
      ) : null}
    </div>
  );
};

function anchorXSign(a?: string): -1 | 0 | 1 {
  if (!a) return 0;
  if (a === 'nw' || a === 'sw' || a === 'w') return -1;
  if (a === 'ne' || a === 'se' || a === 'e') return 1;
  return 0;
}
function anchorYSign(a?: string): -1 | 0 | 1 {
  if (!a) return 0;
  if (a === 'nw' || a === 'ne' || a === 'n') return -1;
  if (a === 'sw' || a === 'se' || a === 's') return 1;
  return 0;
}
