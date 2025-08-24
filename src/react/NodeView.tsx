import React, { forwardRef, useRef, useState } from 'react';
import type { Node, NodeId } from '../types';
import {
  useDndActions,
  useIsSelected,
  useSelectionActions,
  useCamera,
  useCanvasActions,
  useHistoryActions,
  useCanvasStore,
  useInnerEditActions,
} from '../state/store';

type NodeAppearance = {
  borderColor: string;
  selectedBorderColor: string;
  borderWidth: number;
  borderRadius: number;
  background: string;
  textColor: string;
  shadow: string;
  hoverShadow: string;
  selectedShadow?: string;
  padding: number;
  fontSize: number;
  fontWeight: number;
};

export type NodeViewProps = {
  node: Node;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  appearance?: Partial<NodeAppearance>;
  unstyled?: boolean;
};

/**
 * Minimal node view: absolutely positioned box at node's world coords.
 * You can pass children to render arbitrary HTML content inside the node.
 */
export const NodeView = forwardRef<HTMLDivElement, NodeViewProps>(function NodeView(
  { node, className, style, children, appearance, unstyled }: NodeViewProps,
  ref,
) {
  const isSelected = useIsSelected(node.id);
  const { selectOnly, toggleInSelection } = useSelectionActions();
  const { moveSelectedBy } = useDndActions();
  const camera = useCamera();
  const { panBy } = useCanvasActions();
  const { enterInnerEdit, exitInnerEdit } = useInnerEditActions();
  const { beginHistory, endHistory } = useHistoryActions();
  // Grouping is triggered exclusively via Ctrl/Cmd+G keyboard shortcut handled in useCanvasNavigation.

  // Drag bookkeeping
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const lastXRef = useRef(0);
  const lastYRef = useRef(0);
  const draggingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const historyStartedRef = useRef(false);
  const DRAG_THRESHOLD_PX = 3;
  const [isHovered, setIsHovered] = useState(false);

  // Appearance defaults (pill-like as on the reference image)
  const defaultAppearance: NodeAppearance = {
    borderColor: '#E5E7EB',
    selectedBorderColor: '#ff0073',
    borderWidth: 1,
    borderRadius: 18,
    background: '#FFFFFF',
    textColor: '#111827',
    shadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.05)',
    hoverShadow: '0 8px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)',
    selectedShadow: '0 8px 20px rgba(255,0,115,0.18), 0 2px 6px rgba(17,24,39,0.08)',
    padding: 10,
    fontSize: 14,
    fontWeight: 600,
  };

  const onDoubleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    // Enter inner-edit on this node. Left button only.
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    enterInnerEdit(node.id);
  };
  const A = { ...defaultAppearance, ...(appearance ?? {}) } as NodeAppearance;
  const hasCustomChildren = children != null;
  const contentLabel = 'New Node';

  // Auto-pan bookkeeping
  const canvasElRef = useRef<HTMLElement | null>(null);
  const autoRafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const edgeSpeedXRef = useRef(0); // screen px/sec, +right, -left
  const edgeSpeedYRef = useRef(0); // screen px/sec, +down, -up
  const EDGE_PX = 24; // activation zone size
  const MAX_SPEED_PX_PER_SEC = 800; // max auto-pan speed

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
    if (!draggingRef.current) {
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
      // No active edge pressure; stop until next pointer move updates speeds
      stopAutoPan();
      return;
    }
    const dxScreen = sx * dt;
    const dyScreen = sy * dt;
    const dz = camera.zoom || 1;
    const dxWorld = dxScreen / dz;
    const dyWorld = dyScreen / dz;
    // Pan the canvas and move nodes by the SAME world delta to keep node under cursor
    panBy(dxWorld, dyWorld);
    moveSelectedBy(dxWorld, dyWorld);

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

    // screen velocity: right/bottom -> positive, left/top -> negative
    const vx = ((rightDepth - leftDepth) / EDGE_PX) * MAX_SPEED_PX_PER_SEC;
    const vy = ((bottomDepth - topDepth) / EDGE_PX) * MAX_SPEED_PX_PER_SEC;

    edgeSpeedXRef.current = vx;
    edgeSpeedYRef.current = vy;

    if (vx !== 0 || vy !== 0) ensureAutoPan();
    else stopAutoPan();
  };

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    // Left button only
    if (e.button !== 0) return;
    // Determine which id to act on.
    const st = useCanvasStore.getState();
    const innerEditId = st.innerEditNodeId;
    // Helper: is clicked node within current inner-edit scope?
    const isWithinScope = (id: NodeId): boolean => {
      if (!innerEditId) return false;
      let cur: NodeId | null | undefined = id;
      while (cur != null) {
        if (cur === innerEditId) return true;
        cur = st.nodes[cur]?.parentId ?? null;
      }
      return false;
    };
    // Compute group root by walking parentId chain
    const rootId: NodeId = (() => {
      let cur: NodeId | null = node.id as NodeId;
      while (cur != null) {
        const p: NodeId | null = (st.nodes[cur] && st.nodes[cur].parentId) || null;
        if (p == null) break;
        cur = p;
      }
      return cur as NodeId;
    })();
    // If in inner-edit and clicked inside scope -> act on the node itself; else act on root
    const clickedInside = innerEditId ? isWithinScope(node.id as NodeId) : false;
    if (innerEditId && !clickedInside) {
      // Clicked outside inner-edit -> leave it
      exitInnerEdit();
    }
    const targetId = clickedInside ? (node.id as NodeId) : (rootId || node.id);

    // Multi-select: Ctrl/Cmd toggles membership. Shift is reserved for future.
    if (e.ctrlKey || e.metaKey) {
      toggleInSelection(targetId);
    } else if (!useCanvasStore.getState().selected[targetId]) {
      // If target is not selected, select only it. If already selected, preserve current multi-selection
      selectOnly(targetId);
    }
    // Stop propagation so canvas navigation doesn't start panning on node click
    e.stopPropagation();
    // Prevent default to avoid text selection side-effects
    e.preventDefault();

    // Prepare for potential drag
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    lastXRef.current = e.clientX;
    lastYRef.current = e.clientY;
    draggingRef.current = false;
    pointerIdRef.current = e.pointerId;
    // cache canvas root for edge auto-pan
    canvasElRef.current = (e.currentTarget as HTMLElement).closest(
      '[data-rc-canvas]',
    ) as HTMLElement | null;
    // Ensure canvas receives keyboard events (Delete/Backspace etc.)
    const canvasEl = canvasElRef.current;
    if (canvasEl) {
      const tabindexAttr = canvasEl.getAttribute('tabindex');
      const isFocusDisabled = tabindexAttr === '-1';
      if (!isFocusDisabled && typeof (canvasEl as HTMLElement).focus === 'function') {
        try {
          (canvasEl as HTMLElement).focus({ preventScroll: true } as FocusOptions);
        } catch {
          // ignore
        }
      }
    }
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore if capture is not available
    }
  };

  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (pointerIdRef.current == null) return;
    // calculate total movement from start to decide if it's a drag
    const totalDx = Math.abs(e.clientX - startXRef.current);
    const totalDy = Math.abs(e.clientY - startYRef.current);
    if (!draggingRef.current) {
      if (totalDx > DRAG_THRESHOLD_PX || totalDy > DRAG_THRESHOLD_PX) {
        draggingRef.current = true;
        if (!historyStartedRef.current) {
          beginHistory();
          historyStartedRef.current = true;
        }
      } else {
        return;
      }
    }
    // Incremental movement since last event (screen px)
    const dxScreen = e.clientX - lastXRef.current;
    const dyScreen = e.clientY - lastYRef.current;
    lastXRef.current = e.clientX;
    lastYRef.current = e.clientY;
    if (dxScreen === 0 && dyScreen === 0) return;
    // Convert to WORLD delta using current zoom
    const dz = camera.zoom || 1;
    moveSelectedBy(dxScreen / dz, dyScreen / dz);

    // Update edge speeds for auto-pan and start/stop RAF accordingly
    updateEdgeSpeeds(e.clientX, e.clientY);
  };

  const finishDrag = () => {
    draggingRef.current = false;
    pointerIdRef.current = null;
    stopAutoPan();
    if (historyStartedRef.current) {
      endHistory();
      historyStartedRef.current = false;
    }
  };

  const onPointerUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (pointerIdRef.current == null) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(pointerIdRef.current);
    } catch {
      // ignore
    }
    // No auto-grouping on drop; grouping is Ctrl/Cmd+G only
    finishDrag();
  };

  const onPointerCancel: React.PointerEventHandler<HTMLDivElement> = () => {
    finishDrag();
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        boxSizing: 'border-box',
        border: unstyled
          ? undefined
          : `${A.borderWidth}px solid ${isSelected ? A.selectedBorderColor : A.borderColor}`,
        borderRadius: unstyled ? undefined : A.borderRadius,
        background: unstyled ? undefined : A.background,
        color: unstyled ? undefined : A.textColor,
        overflow: 'hidden',
        boxShadow: unstyled
          ? undefined
          : isHovered
            ? A.hoverShadow
            : isSelected
              ? A.selectedShadow || A.shadow
              : A.shadow,
        transition: 'box-shadow 120ms ease',
        padding: unstyled ? undefined : hasCustomChildren ? undefined : A.padding,
        display: hasCustomChildren ? undefined : 'flex',
        alignItems: hasCustomChildren ? undefined : 'center',
        justifyContent: hasCustomChildren ? undefined : 'center',
        fontSize: hasCustomChildren ? undefined : A.fontSize,
        fontWeight: hasCustomChildren ? undefined : A.fontWeight,
        ...style,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDoubleClick={onDoubleClick}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      data-rc-nodeid={node.id}
    >
      {hasCustomChildren ? children : contentLabel}
    </div>
  );
});
