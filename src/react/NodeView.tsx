import React, { forwardRef, useEffect, useRef, useState } from 'react';
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
  useInnerEdit,
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
  const { selectOnly, toggleInSelection, clearSelection } = useSelectionActions();
  const { moveSelectedBy } = useDndActions();
  const camera = useCamera();
  const { panBy } = useCanvasActions();
  const { enterInnerEdit, exitInnerEdit } = useInnerEditActions();
  const { beginHistory, endHistory } = useHistoryActions();
  const setDraggingNode = useCanvasStore((s) => s.setDraggingNode);
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
  const lastHoverVgIdRef = useRef<string | null>(null);
  const lastHoverVgIdSecondaryRef = useRef<string | null>(null);
  // Drag modality bookkeeping
  const ctrlMetaAtDownRef = useRef(false);
  const dragGroupMembersRef = useRef<NodeId[] | null>(null);
  const clickedInsideInnerEditRef = useRef(false);
  // Double-click drag scope mode for this node: default -> largest group, groupLocal -> smallest containing group, node -> single node
  const dragScopeModeRef = useRef<'default' | 'groupLocal' | 'node'>('default');
  // Context of the currently toggled group (members), used to detect outside clicks for reset
  const dragScopeContextGroupMembersRef = useRef<NodeId[] | null>(null);
  // When we pre-handle double-click in onPointerDown (for double-click-and-hold), skip the upcoming onDoubleClick
  const skipNextDoubleClickRef = useRef(false);
  // Double-click detection for pointerdown (React PointerEvent.detail can be unreliable)
  const DOUBLE_CLICK_MS = 350;
  const lastDownTsRef = useRef(0);
  const clickCountRef = useRef(0);
  // Track a possible double-click-and-hold sequence; finalized on drag start
  const doubleClickHoldCandidateRef = useRef(false);
  // When true, this gesture should drag only this node regardless of persistent mode
  const forceNodeDragGestureRef = useRef(false);

  // Reset drag-scope mode when user clicks outside the stored group context (only for groupLocal)
  useEffect(() => {
    const onDocPointerDown = (ev: PointerEvent) => {
      const mode = dragScopeModeRef.current;
      // Only manage outside-click reset for the temporary groupLocal highlight mode
      if (mode !== 'groupLocal') return;
      // Determine clicked node id, if any
      const target = ev.target as Element | null;
      const nodeEl = target?.closest?.('[data-rc-nodeid]') as HTMLElement | null;
      const clickedNodeId = nodeEl?.getAttribute('data-rc-nodeid') as NodeId | undefined;
      const members = dragScopeContextGroupMembersRef.current;
      const insideGroup = !!(clickedNodeId && members && members.includes(clickedNodeId));
      if (!insideGroup) {
        // Reset mode and context; also exit inner-edit so user must double-click again
        dragScopeModeRef.current = 'default';
        dragScopeContextGroupMembersRef.current = null;
        try {
          exitInnerEdit();
        } catch {
          // ignore
        }
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown, { capture: true });
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Whether this node belongs to any visual group
  const nodeIsInAnyVisualGroup = useCanvasStore((s) => {
    const groups = Object.values(s.visualGroups);
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].members.includes(node.id as NodeId)) return true;
    }
    return false;
  });

  const onDoubleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (skipNextDoubleClickRef.current) {
      skipNextDoubleClickRef.current = false;
      return;
    }
    // Enter inner-edit mode for this node (persistent until empty-area click). Left button only.
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    // Persistently scope drags to this node subtree
    dragScopeModeRef.current = 'node';
    enterInnerEdit(node.id);
    // Select the node so it behaves like an ordinary selected node inside the group
    try {
      selectOnly(node.id as NodeId);
    } catch {
      // ignore
    }
    // Also select the largest containing visual group for frame highlight
    try {
      const st = useCanvasStore.getState();
      const groups = Object.values(st.visualGroups);
      let chosenId: string | null = null;
      let bestArea = -Infinity;
      for (const vg of groups) {
        if (!vg.members.includes(node.id as NodeId)) continue;
        let left = Infinity,
          top = Infinity,
          right = -Infinity,
          bottom = -Infinity;
        for (const mid of vg.members) {
          const n = st.nodes[mid as NodeId];
          if (!n) continue;
          left = Math.min(left, n.x);
          top = Math.min(top, n.y);
          right = Math.max(right, n.x + n.width);
          bottom = Math.max(bottom, n.y + n.height);
        }
        if (left === Infinity) continue;
        const area = Math.max(0, right - left) * Math.max(0, bottom - top);
        if (area > bestArea) {
          bestArea = area;
          chosenId = vg.id;
        }
      }
      st.selectVisualGroup(chosenId);
    } catch {
      // ignore
    }

    // Reset double-click counters to avoid accidental pre-toggle on subsequent pointerdowns
    clickCountRef.current = 0;
    lastDownTsRef.current = 0;
  };
  // Merge appearance props and set up content helpers
  const A = { ...defaultAppearance, ...(appearance ?? {}) } as NodeAppearance;
  // Visual: derive rotation and border radius from node data
  const rotationDeg = node.rotation ?? 0;
  const transformRotate = rotationDeg ? `rotate(${rotationDeg}deg)` : undefined;
  const corner = node.cornerRadius;
  let borderRadiusApplied: number | string | undefined = undefined;
  if (!unstyled) {
    if (corner != null) {
      if (typeof corner === 'number') borderRadiusApplied = corner;
      else borderRadiusApplied = `${corner.tl}px ${corner.tr}px ${corner.br}px ${corner.bl}px`;
    } else {
      borderRadiusApplied = A.borderRadius;
    }
  }
  const hasCustomChildren = children != null;
  const contentLabel = 'New Node';
  const innerEditId = useInnerEdit();
  const selectedGroupId = useCanvasStore((s) => s.selectedVisualGroupId);
  const nodeInSelectedGroup = useCanvasStore((s) => {
    const gid = s.selectedVisualGroupId;
    if (!gid) return false;
    const vg = s.visualGroups[gid];
    return vg ? vg.members.includes(node.id as NodeId) : false;
  });
  const innerEditActive = Boolean(innerEditId);
  // Visual rules:
  // - Default: grouped nodes do NOT show selection UI
  // - Inner-edit: nodes in the selected group behave like ordinary nodes (show selection/hover)
  // - The double-clicked node is NOT forced to look selected; selection drives visuals
  const showSelectedUi =
    (innerEditActive && nodeInSelectedGroup && isSelected) ||
    (!nodeIsInAnyVisualGroup && isSelected);
  // When inner-edit ends (via empty-area click in Canvas), return to default drag scope
  useEffect(() => {
    if (!innerEditId) {
      dragScopeModeRef.current = 'default';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [innerEditId]);
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

    // Time-based double-click detection to support double-click-and-hold
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const last = lastDownTsRef.current || 0;
    if (now - last <= DOUBLE_CLICK_MS) {
      clickCountRef.current = (clickCountRef.current || 0) + 1;
    } else {
      clickCountRef.current = 1;
    }
    lastDownTsRef.current = now;

    if (clickCountRef.current === 2) {
      // Mark as potential double-click-and-hold; final decision will be made on drag start
      doubleClickHoldCandidateRef.current = true;
    }

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
    const clickedInside = innerEditId
      ? isWithinScope(node.id as NodeId) || (selectedGroupId != null && nodeInSelectedGroup)
      : false;
    clickedInsideInnerEditRef.current = clickedInside;
    // Do NOT exit inner-edit on clicking another node; inner-edit persists until empty area click

    // Record modifier state at down time
    ctrlMetaAtDownRef.current = !!(e.ctrlKey || e.metaKey);

    // If Ctrl/Cmd at down on a node that belongs to a visual group,
    // select that group's frame instead of toggling node selection,
    // EXCEPT when inner-edit is active and the node belongs to the selected group
    if (
      ctrlMetaAtDownRef.current &&
      nodeIsInAnyVisualGroup &&
      !(innerEditActive && nodeInSelectedGroup)
    ) {
      try {
        const st2 = useCanvasStore.getState();
        const groups = Object.values(st2.visualGroups);
        let chosenId: string | null = null;
        let bestArea = -Infinity;
        for (const vg of groups) {
          if (!vg.members.includes(node.id as NodeId)) continue;
          let left = Infinity,
            top = Infinity,
            right = -Infinity,
            bottom = -Infinity;
          for (const mid of vg.members) {
            const n = st2.nodes[mid as NodeId];
            if (!n) continue;
            left = Math.min(left, n.x);
            top = Math.min(top, n.y);
            right = Math.max(right, n.x + n.width);
            bottom = Math.max(bottom, n.y + n.height);
          }
          if (left === Infinity) continue;
          const area = Math.max(0, right - left) * Math.max(0, bottom - top);
          if (area > bestArea) {
            bestArea = area;
            chosenId = vg.id;
          }
        }
        clearSelection();
        st2.selectVisualGroup(chosenId);
      } catch {
        // ignore
      }
    }

    // Decide potential drag scope honoring double-click mode
    if (!ctrlMetaAtDownRef.current) {
      const mode = dragScopeModeRef.current;
      const nodeScopeActive =
        (mode === 'node' && !!innerEditId) ||
        clickedInside ||
        (innerEditActive && nodeInSelectedGroup);
      if (nodeScopeActive) {
        // Explicit node scope while inner-edit active, or clicked inside inner-edit -> single-node drag
        dragGroupMembersRef.current = null;
      } else {
        const groups = Object.values(st.visualGroups);
        let chosen: { id: string; members: NodeId[] } | null = null;
        if (groups.length > 0) {
          if (mode === 'groupLocal') {
            // Choose SMALLEST containing visual group (local)
            let bestArea = Infinity;
            for (const vg of groups) {
              if (!vg.members.includes(node.id as NodeId)) continue;
              let left = Infinity,
                top = Infinity,
                right = -Infinity,
                bottom = -Infinity;
              for (const mid of vg.members) {
                const n = st.nodes[mid as NodeId];
                if (!n) continue;
                left = Math.min(left, n.x);
                top = Math.min(top, n.y);
                right = Math.max(right, n.x + n.width);
                bottom = Math.max(bottom, n.y + n.height);
              }
              if (left === Infinity) continue;
              const area = Math.max(0, right - left) * Math.max(0, bottom - top);
              if (area < bestArea) {
                bestArea = area;
                chosen = { id: vg.id, members: vg.members.slice() as NodeId[] };
              }
            }
          } else {
            // Default behavior: choose LARGEST containing visual group if any
            let bestArea = -Infinity;
            for (const vg of groups) {
              if (!vg.members.includes(node.id as NodeId)) continue;
              let left = Infinity,
                top = Infinity,
                right = -Infinity,
                bottom = -Infinity;
              for (const mid of vg.members) {
                const n = st.nodes[mid as NodeId];
                if (!n) continue;
                left = Math.min(left, n.x);
                top = Math.min(top, n.y);
                right = Math.max(right, n.x + n.width);
                bottom = Math.max(bottom, n.y + n.height);
              }
              if (left === Infinity) continue;
              const area = Math.max(0, right - left) * Math.max(0, bottom - top);
              if (area > bestArea) {
                bestArea = area;
                chosen = { id: vg.id, members: vg.members.slice() as NodeId[] };
              }
            }
          }
        }
        dragGroupMembersRef.current = chosen ? chosen.members : null;
      }
    } else {
      // Ctrl/Cmd: do not group-drag; selection toggling applies
      dragGroupMembersRef.current = null;
    }

    // Multi-select toggle remains immediate when Ctrl/Cmd is pressed.
    // While inner-edit is active inside a group, allow toggling nodes within that group.
    if (
      ctrlMetaAtDownRef.current &&
      (!nodeIsInAnyVisualGroup || (innerEditActive && nodeInSelectedGroup))
    ) {
      toggleInSelection(node.id as NodeId);
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
        // Transition into dragging: decide selection now
        if (doubleClickHoldCandidateRef.current) {
          // This is a double-click-and-hold -> force node-only drag for this gesture
          forceNodeDragGestureRef.current = true;
          skipNextDoubleClickRef.current = true; // suppress the upcoming onDoubleClick
          doubleClickHoldCandidateRef.current = false;
        }
        if (!ctrlMetaAtDownRef.current) {
          if (
            !forceNodeDragGestureRef.current &&
            dragGroupMembersRef.current &&
            dragGroupMembersRef.current.length > 0
          ) {
            const ids = dragGroupMembersRef.current as NodeId[];
            // Replace selection with full group
            selectOnly(ids[0]);
            for (let i = 1; i < ids.length; i++) {
              // Avoid duplicates
              if (!useCanvasStore.getState().selected[ids[i]]) {
                useCanvasStore.getState().addToSelection(ids[i]);
              }
            }
            // Also select the visual group frame for clarity
            try {
              const st3 = useCanvasStore.getState();
              const groups = Object.values(st3.visualGroups);
              let chosenId: string | null = null;
              let bestArea = -Infinity;
              for (const vg of groups) {
                if (!vg.members.includes(node.id as NodeId)) continue;
                let left = Infinity,
                  top = Infinity,
                  right = -Infinity,
                  bottom = -Infinity;
                for (const mid of vg.members) {
                  const n = st3.nodes[mid as NodeId];
                  if (!n) continue;
                  left = Math.min(left, n.x);
                  top = Math.min(top, n.y);
                  right = Math.max(right, n.x + n.width);
                  bottom = Math.max(bottom, n.y + n.height);
                }
                if (left === Infinity) continue;
                const area = Math.max(0, right - left) * Math.max(0, bottom - top);
                if (area > bestArea) {
                  bestArea = area;
                  chosenId = vg.id;
                }
              }
              st3.selectVisualGroup(chosenId);
            } catch {
              // ignore
            }
          } else {
            // Single-node drag; in inner-edit treat like normal node
            selectOnly(node.id as NodeId);
          }
        }
        draggingRef.current = true;
        try {
          setDraggingNode(true);
        } catch {
          // ignore
        }
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
    // Keep cursor anchored to the node when snapping applies extra correction.
    // We compensate our pointer bookkeeping by the snapOffset (world) converted to screen px.
    try {
      const st = useCanvasStore.getState();
      const so = st.snapOffset; // { dx, dy } in WORLD coordinates
      if (so && (so.dx !== 0 || so.dy !== 0)) {
        lastXRef.current += so.dx * dz;
        lastYRef.current += so.dy * dz;
      }
    } catch {
      // ignore
    }

    // Update edge speeds for auto-pan and start/stop RAF accordingly
    updateEdgeSpeeds(e.clientX, e.clientY);
  };

  const finishDrag = () => {
    draggingRef.current = false;
    pointerIdRef.current = null;
    stopAutoPan();
    try {
      setDraggingNode(false);
    } catch {
      // ignore
    }
    // Clear gesture-scoped flags
    forceNodeDragGestureRef.current = false;
    doubleClickHoldCandidateRef.current = false;
    if (historyStartedRef.current) {
      endHistory();
      historyStartedRef.current = false;
    }
    // Clear ephemeral snapping UI state
    try {
      const st = useCanvasStore.getState();
      st.clearAlignmentGuides();
      st.clearSnapOffset();
    } catch {
      // ignore
    }
  };

  const onPointerUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (pointerIdRef.current == null) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(pointerIdRef.current);
    } catch {
      // ignore
    }
    // If this was a click (no drag)
    if (!draggingRef.current) {
      if (!ctrlMetaAtDownRef.current) {
        // In inner-edit mode within the selected group, behave like a normal node
        if (innerEditActive && nodeInSelectedGroup) {
          selectOnly(node.id as NodeId);
        } else if (nodeIsInAnyVisualGroup) {
          // Outside inner-edit: clicking grouped node selects the group frame
          try {
            const st2 = useCanvasStore.getState();
            const groups = Object.values(st2.visualGroups);
            let chosenId: string | null = null;
            let bestArea = -Infinity;
            for (const vg of groups) {
              if (!vg.members.includes(node.id as NodeId)) continue;
              let left = Infinity,
                top = Infinity,
                right = -Infinity,
                bottom = -Infinity;
              for (const mid of vg.members) {
                const n = st2.nodes[mid as NodeId];
                if (!n) continue;
                left = Math.min(left, n.x);
                top = Math.min(top, n.y);
                right = Math.max(right, n.x + n.width);
                bottom = Math.max(bottom, n.y + n.height);
              }
              if (left === Infinity) continue;
              const area = Math.max(0, right - left) * Math.max(0, bottom - top);
              if (area > bestArea) {
                bestArea = area;
                chosenId = vg.id;
              }
            }
            clearSelection();
            st2.selectVisualGroup(chosenId);
          } catch {
            // ignore
          }
        } else {
          selectOnly(node.id as NodeId);
        }
      }
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
          : `${A.borderWidth}px solid ${showSelectedUi ? A.selectedBorderColor : A.borderColor}`,
        borderRadius: borderRadiusApplied,
        transform: transformRotate,
        background: unstyled ? undefined : A.background,
        color: unstyled ? undefined : A.textColor,
        overflow: 'hidden',
        boxShadow: unstyled
          ? undefined
          : isHovered
            ? A.hoverShadow
            : showSelectedUi
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
      onPointerEnter={() => {
        setIsHovered(true);
        try {
          // Determine largest and smallest visual groups containing this node (for dual highlight)
          const st = useCanvasStore.getState();
          const groups = Object.values(st.visualGroups);
          if (!groups || groups.length === 0) return;
          let largestId: string | null = null;
          let largestArea = -Infinity;
          let smallestId: string | null = null;
          let smallestArea = Infinity;
          for (const vg of groups) {
            if (!vg.members.includes(node.id)) continue;
            let left = Infinity,
              top = Infinity,
              right = -Infinity,
              bottom = -Infinity;
            for (const mid of vg.members) {
              const n = st.nodes[mid];
              if (!n) continue;
              left = Math.min(left, n.x);
              top = Math.min(top, n.y);
              right = Math.max(right, n.x + n.width);
              bottom = Math.max(bottom, n.y + n.height);
            }
            if (left === Infinity) continue;
            const area = Math.max(0, right - left) * Math.max(0, bottom - top);
            if (area > largestArea) {
              largestArea = area;
              largestId = vg.id;
            }
            if (area < smallestArea) {
              smallestArea = area;
              smallestId = vg.id;
            }
          }
          if (largestId) {
            lastHoverVgIdRef.current = largestId;
            st.setHoveredVisualGroupId(largestId);
          }
          const secondaryId = smallestId && smallestId !== largestId ? smallestId : null;
          lastHoverVgIdSecondaryRef.current = secondaryId;
          st.setHoveredVisualGroupIdSecondary(secondaryId);
        } catch {
          // ignore
        }
      }}
      onPointerLeave={() => {
        setIsHovered(false);
        try {
          const st = useCanvasStore.getState();
          const last = lastHoverVgIdRef.current;
          if (last && st.hoveredVisualGroupId === last) {
            st.setHoveredVisualGroupId(null);
          }
          const lastSec = lastHoverVgIdSecondaryRef.current;
          if (lastSec && st.hoveredVisualGroupIdSecondary === lastSec) {
            st.setHoveredVisualGroupIdSecondary(null);
          } else if (!lastSec && st.hoveredVisualGroupIdSecondary != null) {
            // If we previously set null secondary for this node, also clear any residual
            st.setHoveredVisualGroupIdSecondary(null);
          }
          lastHoverVgIdRef.current = null;
          lastHoverVgIdSecondaryRef.current = null;
        } catch {
          // ignore
        }
      }}
      data-rc-nodeid={node.id}
    >
      {hasCustomChildren ? children : contentLabel}
    </div>
  );
});
