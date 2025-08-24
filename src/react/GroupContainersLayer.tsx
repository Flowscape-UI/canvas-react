import React, { useMemo, useRef, useState } from 'react';
import { cameraToCssTransform } from '../core/coords';
import {
  useCamera,
  useNodes,
  useSelectedIds,
  useSelectionActions,
  useHistoryActions,
  useNodeActions,
  useCanvasStore,
  useCanvasActions,
} from '../state/store';
import type { Node, NodeId } from '../types';

/**
 * Renders visual containers for logical groups (nodes with descendants).
 * Containers are purely decorative: dashed rounded rectangles behind nodes.
 * They use world coordinates and inherit camera transform.
 */
export function GroupContainersLayer() {
  const camera = useCamera();
  const nodes = useNodes();
  const { selectOnly, toggleInSelection } = useSelectionActions();
  const { beginHistory, endHistory } = useHistoryActions();
  const { updateNode } = useNodeActions();
  const { panBy } = useCanvasActions();
  // Hovered group id for showing stroke on hover
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);

  // Active drag state shared across container rects
  const dragRef = useRef<{
    parentId: NodeId;
    memberIds: NodeId[];
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    dragging: boolean;
    ctrlMetaAtDown: boolean;
    /** true when dragging the temporary selection container */
    selectionDrag?: boolean;
  } | null>(null);

  // Visual groups from store (purely visual, independent of parentId)
  const visualGroups = useCanvasStore((s) => s.visualGroups);
  const selectedGroupId = useCanvasStore((s) => s.selectedVisualGroupId);
  const hoveredGlobalGroupId = useCanvasStore((s) => s.hoveredVisualGroupId);
  const hoveredGlobalGroupIdSecondary = useCanvasStore((s) => s.hoveredVisualGroupIdSecondary);

  // Compute bbox for each visual group based on member nodes
  const containers = useMemo(() => {
    const nsById = new Map<NodeId, Node>(nodes.map((n) => [n.id, n]));
    const arr: Array<{
      groupId: string;
      left: number;
      top: number;
      right: number;
      bottom: number;
      members: NodeId[];
      area: number;
    }> = [];
    for (const vg of Object.values(visualGroups)) {
      const members = vg.members.filter((id) => nsById.has(id));
      if (members.length < 1) continue;
      let left = Infinity,
        top = Infinity,
        right = -Infinity,
        bottom = -Infinity;
      for (const mid of members) {
        const c = nsById.get(mid)!;
        left = Math.min(left, c.x);
        top = Math.min(top, c.y);
        right = Math.max(right, c.x + c.width);
        bottom = Math.max(bottom, c.y + c.height);
      }
      if (left === Infinity) continue;
      const area = Math.max(0, right - left) * Math.max(0, bottom - top);
      arr.push({ groupId: vg.id, left, top, right, bottom, members, area });
    }
    arr.sort((a, b) => b.area - a.area);
    return arr;
  }, [nodes, visualGroups]);

  // No visual padding: containers and selection frames are tight to bounds

  const DRAG_THRESHOLD_PX = 3;

  // Current multi-selection bbox (>=2 nodes) for the temporary overlay
  const selectedIds = useSelectedIds();
  const selectionBBox = useMemo(() => {
    if (!selectedIds || selectedIds.length < 2) return null;
    const sel = new Set<NodeId>(selectedIds as NodeId[]);
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const n of nodes) {
      if (!sel.has(n.id)) continue;
      left = Math.min(left, n.x);
      top = Math.min(top, n.y);
      right = Math.max(right, n.x + n.width);
      bottom = Math.max(bottom, n.y + n.height);
    }
    if (left === Infinity) return null;
    return { left, top, right, bottom };
  }, [nodes, selectedIds]);

  // Auto-pan bookkeeping (mirrors NodeView)
  const canvasElRef = useRef<HTMLElement | null>(null);
  const autoRafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const edgeSpeedXRef = useRef(0); // screen px/sec, +right, -left
  const edgeSpeedYRef = useRef(0); // screen px/sec, +down, -up
  const EDGE_PX = 24;
  const MAX_SPEED_PX_PER_SEC = 800;

  const stopAutoPan = () => {
    if (autoRafRef.current != null) {
      cancelAnimationFrame(autoRafRef.current);
      autoRafRef.current = null;
    }
    lastTsRef.current = null;
    edgeSpeedXRef.current = 0;
    edgeSpeedYRef.current = 0;
  };

  const autoPanStep = (ts: number) => {
    const st = dragRef.current;
    if (!st || !st.dragging) {
      stopAutoPan();
      return;
    }
    if (lastTsRef.current == null) {
      lastTsRef.current = ts;
      autoRafRef.current = requestAnimationFrame(autoPanStep);
      return;
    }
    const dt = (ts - lastTsRef.current) / 1000;
    lastTsRef.current = ts;

    const sx = edgeSpeedXRef.current;
    const sy = edgeSpeedYRef.current;
    if (sx === 0 && sy === 0) {
      stopAutoPan();
      return;
    }
    const dxScreen = sx * dt;
    const dyScreen = sy * dt;
    const cam = useCanvasStore.getState().camera;
    const dz = cam.zoom || 1;
    const dxWorld = dxScreen / dz;
    const dyWorld = dyScreen / dz;

    // Pan the camera and move by same world delta
    panBy(dxWorld, dyWorld);
    if (st.selectionDrag) {
      // Move all currently selected nodes (and descendants) together
      const { moveSelectedBy } = useCanvasStore.getState();
      moveSelectedBy(dxWorld, dyWorld);
    } else {
      // Group container drag: move explicit members
      const stateNodes = useCanvasStore.getState().nodes;
      for (const id of st.memberIds) {
        const cur = stateNodes[id];
        if (!cur) continue;
        updateNode(id, { x: cur.x + dxWorld, y: cur.y + dyWorld });
      }
    }

    autoRafRef.current = requestAnimationFrame(autoPanStep);
  };

  const ensureAutoPan = () => {
    if (autoRafRef.current == null) {
      lastTsRef.current = null;
      autoRafRef.current = requestAnimationFrame(autoPanStep);
    }
  };

  const updateEdgeSpeeds = (clientX: number, clientY: number) => {
    const root = canvasElRef.current;
    if (!root) {
      edgeSpeedXRef.current = 0;
      edgeSpeedYRef.current = 0;
      stopAutoPan();
      return;
    }
    const rect = root.getBoundingClientRect();
    const leftDist = clientX - rect.left;
    const rightDist = rect.right - clientX;
    const topDist = clientY - rect.top;
    const bottomDist = rect.bottom - clientY;

    const leftDepth = Math.min(Math.max(EDGE_PX - leftDist, 0), EDGE_PX);
    const rightDepth = Math.min(Math.max(EDGE_PX - rightDist, 0), EDGE_PX);
    const topDepth = Math.min(Math.max(EDGE_PX - topDist, 0), EDGE_PX);
    const bottomDepth = Math.min(Math.max(EDGE_PX - bottomDist, 0), EDGE_PX);

    const vx = ((rightDepth - leftDepth) / EDGE_PX) * MAX_SPEED_PX_PER_SEC;
    const vy = ((bottomDepth - topDepth) / EDGE_PX) * MAX_SPEED_PX_PER_SEC;

    edgeSpeedXRef.current = vx;
    edgeSpeedYRef.current = vy;

    if (vx !== 0 || vy !== 0) ensureAutoPan();
    else stopAutoPan();
  };

  // Handlers factory (bound to specific group)
  function makePointerHandlers(groupId: string, memberIds: NodeId[]) {
    const onPointerDown: React.PointerEventHandler<SVGRectElement> = (e) => {
      if (e.button !== 0) return; // LMB only
      // focus canvas for hotkeys
      const closestEl = (e.currentTarget as Element).closest('[data-rc-canvas]');
      if (closestEl && closestEl instanceof HTMLElement) {
        try {
          closestEl.focus({ preventScroll: true } as FocusOptions);
        } catch {
          // noop
        }
      }
      // cache canvas root for edge auto-pan
      canvasElRef.current = closestEl as HTMLElement | null;
      // UX: indicate dragging
      try {
        (e.currentTarget as SVGRectElement).style.cursor = 'grabbing';
      } catch {
        // ignore
      }
      dragRef.current = {
        parentId: groupId as unknown as NodeId,
        memberIds,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        dragging: false,
        ctrlMetaAtDown: Boolean(e.ctrlKey || e.metaKey),
        selectionDrag: false,
      };
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        // ignore for JSDOM
      }
      e.stopPropagation();
      e.preventDefault();
    };

    const onPointerMove: React.PointerEventHandler<SVGRectElement> = (e) => {
      const st = dragRef.current;
      if (!st || st.pointerId !== e.pointerId) return;
      const totalDx = Math.abs(e.clientX - st.startX);
      const totalDy = Math.abs(e.clientY - st.startY);
      if (!st.dragging) {
        if (totalDx > DRAG_THRESHOLD_PX || totalDy > DRAG_THRESHOLD_PX) {
          st.dragging = true;
          beginHistory('group-drag');
        } else {
          return;
        }
      }
      const dxScreen = e.clientX - st.lastX;
      const dyScreen = e.clientY - st.lastY;
      st.lastX = e.clientX;
      st.lastY = e.clientY;
      if (dxScreen === 0 && dyScreen === 0) return;
      const dz = camera.zoom || 1;
      const dxWorld = dxScreen / dz;
      const dyWorld = dyScreen / dz;
      // Move root + descendants explicitly (do not rely on selection)
      for (const id of st.memberIds) {
        const cur = useCanvasStore.getState().nodes[id];
        if (!cur) continue;
        updateNode(id, { x: cur.x + dxWorld, y: cur.y + dyWorld });
      }
      // Edge auto-pan
      updateEdgeSpeeds(e.clientX, e.clientY);
    };

    const finish = (asCancel = false) => {
      const st = dragRef.current;
      if (!st) return;
      stopAutoPan();
      if (st.dragging) {
        endHistory();
      } else if (!asCancel) {
        // Click without drag: selection per spec
        const { selectVisualGroup } = useCanvasStore.getState();
        selectVisualGroup(groupId);
      }
      // Always clear hover on finish so the stroke hides after drop
      try {
        setHoveredGroupId(null);
        const { setHoveredVisualGroupId } = useCanvasStore.getState();
        setHoveredVisualGroupId(null);
      } catch {
        // ignore
      }
      dragRef.current = null;
    };

    const onPointerUp: React.PointerEventHandler<SVGRectElement> = (e) => {
      const st = dragRef.current;
      if (!st || st.pointerId !== e.pointerId) return;
      try {
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      try {
        (e.currentTarget as SVGRectElement).style.cursor = 'grab';
      } catch {
        // ignore
      }
      e.stopPropagation();
      e.preventDefault();
      finish(false);
    };

    const onPointerCancel: React.PointerEventHandler<SVGRectElement> = (e) => {
      try {
        (e.currentTarget as SVGRectElement).style.cursor = 'grab';
      } catch {
        // ignore
      }
      finish(true);
    };

    // Hover tracking for visual-only stroke
    const onPointerEnter: React.PointerEventHandler<SVGRectElement> = () => {
      try {
        setHoveredGroupId(groupId);
        const { setHoveredVisualGroupId } = useCanvasStore.getState();
        setHoveredVisualGroupId(groupId);
      } catch {
        // ignore
      }
    };
    const onPointerLeave: React.PointerEventHandler<SVGRectElement> = () => {
      try {
        // If leaving while dragging, keep active state handled by dragRef
        const st = dragRef.current;
        if (st && st.parentId === (groupId as unknown as NodeId) && st.dragging) return;
        setHoveredGroupId((prev: string | null) => (prev === groupId ? null : prev));
        const { setHoveredVisualGroupId } = useCanvasStore.getState();
        if (useCanvasStore.getState().hoveredVisualGroupId === groupId) {
          setHoveredVisualGroupId(null);
        }
      } catch {
        // ignore
      }
    };

    return {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onPointerEnter,
      onPointerLeave,
    };
  }

  // Handlers for temporary multi-selection container (drag all selected nodes)
  function makeSelectionPointerHandlers() {
    const onPointerDown: React.PointerEventHandler<SVGRectElement> = (e) => {
      if (e.button !== 0) return; // LMB only
      const closestEl = (e.currentTarget as Element).closest('[data-rc-canvas]');
      if (closestEl && closestEl instanceof HTMLElement) {
        try {
          closestEl.focus({ preventScroll: true } as FocusOptions);
        } catch {
          // noop
        }
      }
      canvasElRef.current = closestEl as HTMLElement | null;
      try {
        (e.currentTarget as SVGRectElement).style.cursor = 'grabbing';
      } catch {
        // ignore
      }
      dragRef.current = {
        parentId: '__selection__' as NodeId,
        memberIds: [],
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        dragging: false,
        ctrlMetaAtDown: Boolean(e.ctrlKey || e.metaKey),
        selectionDrag: true,
      };
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        // ignore for JSDOM
      }
      e.stopPropagation();
      e.preventDefault();
    };

    const onPointerMove: React.PointerEventHandler<SVGRectElement> = (e) => {
      const st = dragRef.current;
      if (!st || st.pointerId !== e.pointerId) return;
      const totalDx = Math.abs(e.clientX - st.startX);
      const totalDy = Math.abs(e.clientY - st.startY);
      if (!st.dragging) {
        if (totalDx > DRAG_THRESHOLD_PX || totalDy > DRAG_THRESHOLD_PX) {
          st.dragging = true;
          beginHistory('selection-drag');
        } else {
          return;
        }
      }
      const dxScreen = e.clientX - st.lastX;
      const dyScreen = e.clientY - st.lastY;
      st.lastX = e.clientX;
      st.lastY = e.clientY;
      if (dxScreen === 0 && dyScreen === 0) return;
      const dz = camera.zoom || 1;
      const dxWorld = dxScreen / dz;
      const dyWorld = dyScreen / dz;
      const { moveSelectedBy } = useCanvasStore.getState();
      moveSelectedBy(dxWorld, dyWorld);
      updateEdgeSpeeds(e.clientX, e.clientY);
    };

    const finish = (asCancel = false, upEvent?: React.PointerEvent<SVGRectElement>) => {
      const st = dragRef.current;
      if (!st) return;
      stopAutoPan();
      if (st.dragging) {
        endHistory();
      } else if (!asCancel && upEvent) {
        // Treat click-through behavior: if clicking a selected node, mirror NodeView selection logic
        try {
          const cam = useCanvasStore.getState().camera;
          const dz = cam.zoom || 1;
          const worldX = upEvent.clientX / dz + cam.offsetX;
          const worldY = upEvent.clientY / dz + cam.offsetY;
          const selected = new Set(Object.keys(useCanvasStore.getState().selected));
          let hitId: string | null = null;
          const ns = Object.values(useCanvasStore.getState().nodes) as Node[];
          for (let i = 0; i < ns.length; i++) {
            const n = ns[i];
            if (!selected.has(n.id)) continue;
            const L = n.x,
              T = n.y,
              R = n.x + n.width,
              B = n.y + n.height;
            if (worldX >= L && worldX <= R && worldY >= T && worldY <= B) {
              hitId = n.id;
              break;
            }
          }
          if (hitId) {
            if (st.ctrlMetaAtDown) toggleInSelection(hitId as NodeId);
            else selectOnly(hitId as NodeId);
          }
        } catch {
          // ignore
        }
      }
      dragRef.current = null;
    };

    const onPointerUp: React.PointerEventHandler<SVGRectElement> = (e) => {
      const st = dragRef.current;
      if (!st || st.pointerId !== e.pointerId) return;
      try {
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      try {
        (e.currentTarget as SVGRectElement).style.cursor = 'grab';
      } catch {
        // ignore
      }
      e.stopPropagation();
      e.preventDefault();
      finish(false, e);
    };

    const onPointerCancel: React.PointerEventHandler<SVGRectElement> = (e) => {
      try {
        (e.currentTarget as SVGRectElement).style.cursor = 'grab';
      } catch {
        // ignore
      }
      finish(true);
    };

    return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
  }

  return (
    <>
      {/* Group containers behind nodes */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: cameraToCssTransform(camera),
          transformOrigin: '0 0',
          zIndex: 0, // under nodes
          pointerEvents: 'none',
        }}
      >
        {containers.map((c) => {
          // Base world rect (tight to members)
          let x = c.left;
          let y = c.top;
          let w = c.right - c.left;
          let h = c.bottom - c.top;

          // Apply fixed 8px screen-space padding converted to world units
          // This ensures a small visual gap around grouped members regardless of zoom
          const padWorld = 8 / (camera.zoom || 1);
          x -= padWorld;
          y -= padWorld;
          w += padWorld * 2;
          h += padWorld * 2;

          // Snap rect to 0.5px grid in SCREEN space to reduce antialiasing/tearing
          const dz = camera.zoom || 1;
          const round05 = (v: number) => Math.round(v * 2) / 2;
          const sx = round05(x * dz);
          const sy = round05(y * dz);
          let sw = round05(w * dz);
          let sh = round05(h * dz);
          // Prevent degenerate sizes which may clip fill/stroke
          sw = Math.max(sw, 1);
          sh = Math.max(sh, 1);
          x = sx / dz;
          y = sy / dz;
          w = sw / dz;
          h = sh / dz;
          const handlers = makePointerHandlers(c.groupId, c.members);
          const isActive =
            hoveredGroupId === c.groupId ||
            hoveredGlobalGroupId === c.groupId ||
            hoveredGlobalGroupIdSecondary === c.groupId ||
            (dragRef.current &&
              dragRef.current.parentId === (c.groupId as unknown as NodeId) &&
              dragRef.current.dragging);
          const isSelected = selectedGroupId === c.groupId;
          const showStroke = isActive || isSelected;
          return (
            <svg
              key={c.groupId}
              data-testid="group-container"
              data-parent-id={c.groupId}
              style={{
                position: 'absolute',
                left: `${x}px`,
                top: `${y}px`,
                width: `${w}px`,
                height: `${h}px`,
                overflow: 'visible',
              }}
              width={w}
              height={h}
              viewBox={`0 0 ${w} ${h}`}
              preserveAspectRatio="none"
              shapeRendering="geometricPrecision"
            >
              {/* Visual stroke when hovered/dragging OR when the group is selected */}
              {showStroke && (
                <rect
                  data-testid="group-container-stroke"
                  x={0}
                  y={0}
                  width={w}
                  height={h}
                  fill="none"
                  stroke={isSelected ? 'rgba(59,130,246,1)' : 'rgba(59,130,246,0.9)'}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: 'none' }}
                />
              )}
              {/* Invisible hit rect over full area for drag/select */}
              <rect
                data-testid="group-container-hit"
                x={0}
                y={0}
                width={w}
                height={h}
                fill="transparent"
                style={{ pointerEvents: 'all', cursor: 'grab' }}
                onPointerDown={handlers.onPointerDown}
                onPointerMove={handlers.onPointerMove}
                onPointerUp={handlers.onPointerUp}
                onPointerCancel={handlers.onPointerCancel}
                onPointerEnter={handlers.onPointerEnter}
                onPointerLeave={handlers.onPointerLeave}
              />
            </svg>
          );
        })}
      </div>

      {/* Temporary selection container above nodes (visible when 2+ nodes are selected) */}
      {selectionBBox &&
        (() => {
          // Snap to 0.5px grid with no visual padding for the selection container
          let x = selectionBBox.left;
          let y = selectionBBox.top;
          let w = selectionBBox.right - selectionBBox.left;
          let h = selectionBBox.bottom - selectionBBox.top;
          const dz = camera.zoom || 1;
          const round05 = (v: number) => Math.round(v * 2) / 2;
          const sx = round05(x * dz);
          const sy = round05(y * dz);
          let sw = round05(w * dz);
          let sh = round05(h * dz);
          sw = Math.max(sw, 1);
          sh = Math.max(sh, 1);
          x = sx / dz;
          y = sy / dz;
          w = sw / dz;
          h = sh / dz;
          const handlers = makeSelectionPointerHandlers();
          return (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                transform: cameraToCssTransform(camera),
                transformOrigin: '0 0',
                zIndex: 3, // above nodes
                pointerEvents: 'none',
              }}
            >
              <svg
                data-testid="selection-container"
                style={{
                  position: 'absolute',
                  left: `${x}px`,
                  top: `${y}px`,
                  width: `${w}px`,
                  height: `${h}px`,
                  overflow: 'visible',
                }}
                width={w}
                height={h}
                viewBox={`0 0 ${w} ${h}`}
                preserveAspectRatio="none"
                shapeRendering="geometricPrecision"
              >
                {/* Fill */}
                <rect
                  x={0}
                  y={0}
                  width={w}
                  height={h}
                  // rx={14}
                  // ry={14}
                  fill="none"
                  style={{ pointerEvents: 'none' }}
                />
                {/* Stroke */}
                <rect
                  x={0}
                  y={0}
                  width={w}
                  height={h}
                  // rx={14}
                  // ry={14}
                  fill="transparent"
                  stroke="rgba(59,130,246,0.9)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: 'none' }}
                />
                {/* Hit rect on top for drag/click behavior */}
                <rect
                  data-testid="selection-container-hit"
                  x={0}
                  y={0}
                  width={w}
                  height={h}
                  rx={14}
                  ry={14}
                  fill="transparent"
                  style={{ pointerEvents: 'all', cursor: 'grab' }}
                  onPointerDown={handlers.onPointerDown}
                  onPointerMove={handlers.onPointerMove}
                  onPointerUp={handlers.onPointerUp}
                  onPointerCancel={handlers.onPointerCancel}
                />
              </svg>
            </div>
          );
        })()}
    </>
  );
}
