import { create } from 'zustand';
import type { Camera, Point } from '../core/coords';
import type { Node, NodeId } from '../types';
import { applyPan, clampZoom, zoomAtPoint } from '../core/coords';

// History types (nodes, guides, and visual groups; camera and zoom are excluded)
type NodeChange =
  | { kind: 'add'; node: Node }
  | { kind: 'remove'; node: Node }
  | { kind: 'update'; id: NodeId; before: Node; after: Node };

type GuideChange =
  | { kind: 'add'; guide: Guide }
  | { kind: 'remove'; guide: Guide }
  | { kind: 'clear'; guides: Guide[] }
  | { kind: 'setActive'; before: GuideId | null; after: GuideId | null };

type VisualGroup = { id: string; members: NodeId[] };
type VisualGroupChange = { kind: 'add' | 'remove'; group: VisualGroup };

type HistoryEntry = {
  label?: string;
  changes: NodeChange[];
  guideChanges?: GuideChange[];
  visualGroupChanges?: VisualGroupChange[];
};

// Rulers/Guides UI types (not part of history)
export type GuideId = string;
export type Guide = { id: GuideId; axis: 'x' | 'y'; value: number };

// Alignment helper guides (ephemeral, computed during transform; not in history)
export type AlignGuide = {
  axis: 'x' | 'y';
  at: number; // world coordinate where alignment occurs
  kind: 'edge' | 'center';
  targetId: NodeId | 'selection';
};

// Resize gesture parameters (ephemeral). Kept minimal for MVP-0.0 scaffolding.
export type ResizeSelectionParams = {
  dx: number; // world delta applied to drag
  dy: number; // world delta applied to drag
  anchor?: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
  proportional?: boolean; // Shift
  fromCenter?: boolean; // Alt
  /** Base dimensions at gesture start (world units). If provided, use these instead of current node size for temporary updates. */
  fromWidth?: number;
  fromHeight?: number;
};

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 2.4;

export type CanvasState = {
  readonly camera: Camera;
  readonly nodes: Record<NodeId, Node>;
  /** Map of selected node IDs for O(1) membership checks. */
  readonly selected: Record<NodeId, true>;
  /** UI: box-select (lasso) is active */
  readonly boxSelecting: boolean;
  /** UI: true while a node drag gesture is actively moving (after threshold). */
  readonly isDraggingNode: boolean;
  /** UI: purely visual groups, do NOT affect nodes hierarchy */
  readonly visualGroups: Record<string, { id: string; members: NodeId[] }>;
  /** UI: currently selected visual group id (single-select for now) */
  readonly selectedVisualGroupId: string | null;
  /** UI: currently hovered visual group id (drives container highlight from node hover) */
  readonly hoveredVisualGroupId: string | null;
  /** UI: secondary hovered visual group id for dual highlight (e.g., local group alongside parent) */
  readonly hoveredVisualGroupIdSecondary: string | null;
  /** UI: inner-edit mode target node; when set, drags affect only this node (and its descendants). */
  readonly innerEditNodeId: NodeId | null;
  /** UI: true while a transform gesture is active (resize/rotate/radius). */
  readonly isTransforming: boolean;
  /** Internal counter for add-at-center offset progression. */
  readonly centerAddIndex: number;
  /** Clipboard buffer storing a snapshot of nodes to paste. */
  readonly clipboard: { nodes: Node[] } | null;
  /** Internal counter for paste offset progression. */
  readonly pasteIndex: number;
  /** History stacks (nodes-only). */
  readonly historyPast: HistoryEntry[];
  readonly historyFuture: HistoryEntry[];
  /** Active batch for coalescing changes (e.g., drag). */
  readonly historyBatch: {
    label?: string;
    changes: NodeChange[];
    updateIndexById: Record<NodeId, number>;
    groupChanges?: VisualGroupChange[];
  } | null;
  /** UI: show rulers overlay */
  readonly showRulers: boolean;
  /** UI: collection of guide lines (world-locked) */
  readonly guides: Guide[];
  /** UI: currently active guide (for deletion, highlight) */
  readonly activeGuideId: GuideId | null;
  /** UI: alignment helper guides for snapping (ephemeral) */
  readonly alignmentGuides: AlignGuide[];
  /** UI: current snap offset applied to pointer (world units) */
  readonly snapOffset: { dx: number; dy: number } | null;
  /** UI: ephemeral snap lock on X axis during drag (hysteresis) */
  readonly snapLockX: { at: number; kind: 'edge' | 'center' } | null;
  /** UI: ephemeral snap lock on Y axis during drag (hysteresis) */
  readonly snapLockY: { at: number; kind: 'edge' | 'center' } | null;
  /** UI: global toggle for snapping */
  readonly alignSnapEnabled: boolean;
  /** UI: snapping tolerance in screen pixels */
  readonly alignSnapTolerancePx: number;
};

export type CanvasActions = {
  setCamera: (camera: Camera) => void;
  panBy: (dx: number, dy: number) => void;
  zoomTo: (zoom: number) => void;
  /** Zoom by factor centered at screenPoint (screen coords in px). */
  zoomByAt: (screenPoint: Point, factor: number) => void;
  // Inner-edit mode (UI-only)
  enterInnerEdit: (id: NodeId) => void;
  exitInnerEdit: () => void;
  // Lasso state (UI-only)
  setBoxSelecting: (active: boolean) => void;
  // DnD state (UI-only)
  setDraggingNode: (active: boolean) => void;
  // Rulers/Guides (UI-only, not in history)
  toggleRulers: () => void;
  addGuide: (axis: 'x' | 'y', value: number) => GuideId;
  moveGuideTemporary: (id: GuideId, value: number) => void;
  moveGuide: (id: GuideId, value: number) => void;
  moveGuideCommit: (id: GuideId, fromValue: number, toValue: number) => void;
  removeGuide: (id: GuideId) => void;
  clearGuides: () => void;
  setActiveGuide: (id: GuideId | null) => void;
  // Alignment/snap (UI-only)
  setAlignSnapEnabled: (enabled: boolean) => void;
  setAlignSnapTolerancePx: (px: number) => void;
  setAlignmentGuides: (guides: AlignGuide[]) => void;
  clearAlignmentGuides: () => void;
  setSnapOffset: (offset: { dx: number; dy: number } | null) => void;
  clearSnapOffset: () => void;
  // Nodes CRUD
  addNode: (node: Node) => void;
  /** Add node at the visible center regardless of zoom, with slight diagonal offset per call. */
  addNodeAtCenter: (node: Pick<Node, 'id' | 'width' | 'height'>) => void;
  updateNode: (id: NodeId, patch: Partial<Node>) => void;
  removeNode: (id: NodeId) => void;
  /** Remove multiple nodes at once. */
  removeNodes: (ids: NodeId[]) => void;
  /** Group: assign parentId to given children (no cycles). */
  groupNodes: (parentId: NodeId, childIds: NodeId[]) => void;
  /** Ungroup: clear parentId for given nodes. */
  ungroup: (ids: NodeId[]) => void;
  /** Move all currently selected nodes by dx,dy in WORLD units. */
  moveSelectedBy: (dx: number, dy: number) => void;
  // Selection transforms (Temporary/Commit pattern)
  resizeSelectionTemporary: (params: ResizeSelectionParams) => void;
  resizeSelectionCommit: (
    from: { width: number; height: number },
    to: { width: number; height: number },
  ) => void;
  rotateSelectionTemporary: (deltaAngle: number) => void;
  rotateSelectionCommit: (fromAngle: number, toAngle: number) => void;
  setCornerRadiusTemporary: (value: Node['cornerRadius']) => void;
  setCornerRadiusCommit: (from: Node['cornerRadius'], to: Node['cornerRadius']) => void;
  // Selection (CORE-05a)
  clearSelection: () => void;
  /** Select only the given node id (single selection). */
  selectOnly: (id: NodeId) => void;
  // Selection (CORE-05b)
  addToSelection: (id: NodeId) => void;
  removeFromSelection: (id: NodeId) => void;
  toggleInSelection: (id: NodeId) => void;
  /** Delete all currently selected nodes. */
  deleteSelected: () => void;
  // Visual groups (UI-only)
  createVisualGroupFromSelection: () => void;
  selectVisualGroup: (id: string | null) => void;
  setHoveredVisualGroupId: (id: string | null) => void;
  setHoveredVisualGroupIdSecondary: (id: string | null) => void;
  // Clipboard
  copySelection: () => void;
  cutSelection: () => void;
  pasteClipboard: (position?: Point) => void;
  // History (CORE-06)
  beginHistory: (label?: string) => void;
  endHistory: () => void;
  undo: () => void;
  redo: () => void;
};

export type CanvasStore = CanvasState & CanvasActions;

const initialCamera: Camera = { zoom: 1, offsetX: 0, offsetY: 0 };
const initialNodes: Record<NodeId, Node> = {};
const initialSelected: Record<NodeId, true> = {};
const initialBoxSelecting = false;
const initialIsDraggingNode = false;
const initialVisualGroups: CanvasState['visualGroups'] = {};
const initialSelectedVisualGroupId: CanvasState['selectedVisualGroupId'] = null;
const initialHoveredVisualGroupId: CanvasState['hoveredVisualGroupId'] = null;
const initialHoveredVisualGroupIdSecondary: CanvasState['hoveredVisualGroupIdSecondary'] = null;
const initialInnerEditNodeId: CanvasState['innerEditNodeId'] = null;
const initialIsTransforming = false;
const initialCenterAddIndex = 0;
const initialClipboard: CanvasState['clipboard'] = null;
const initialPasteIndex = 0;
const initialHistoryPast: HistoryEntry[] = [];
const initialHistoryFuture: HistoryEntry[] = [];
const initialShowRulers = true;
const initialGuides: Guide[] = [];
const initialActiveGuideId: GuideId | null = null;
const initialAlignmentGuides: AlignGuide[] = [];
const initialSnapOffset: { dx: number; dy: number } | null = null;
const initialSnapLockX: CanvasState['snapLockX'] = null;
const initialSnapLockY: CanvasState['snapLockY'] = null;
const initialAlignSnapEnabled = true;
const initialAlignSnapTolerancePx = 8;
// Guide history is now integrated into main history system

// Internal flag: suppress history recording during undo/redo replay
let __isReplayingHistory = false;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const useCanvasStore = create<CanvasStore>()((set, get) => ({
  camera: initialCamera,
  nodes: initialNodes,
  selected: initialSelected,
  boxSelecting: initialBoxSelecting,
  isDraggingNode: initialIsDraggingNode,
  visualGroups: initialVisualGroups,
  selectedVisualGroupId: initialSelectedVisualGroupId,
  hoveredVisualGroupId: initialHoveredVisualGroupId,
  hoveredVisualGroupIdSecondary: initialHoveredVisualGroupIdSecondary,
  innerEditNodeId: initialInnerEditNodeId,
  isTransforming: initialIsTransforming,
  centerAddIndex: initialCenterAddIndex,
  clipboard: initialClipboard,
  pasteIndex: initialPasteIndex,
  historyPast: initialHistoryPast,
  historyFuture: initialHistoryFuture,
  historyBatch: null,
  showRulers: initialShowRulers,
  guides: initialGuides,
  activeGuideId: initialActiveGuideId,
  alignmentGuides: initialAlignmentGuides,
  snapOffset: initialSnapOffset,
  snapLockX: initialSnapLockX,
  snapLockY: initialSnapLockY,
  alignSnapEnabled: initialAlignSnapEnabled,
  alignSnapTolerancePx: initialAlignSnapTolerancePx,

  setCamera: (camera) => set({ camera }),

  panBy: (dx, dy) =>
    set((s) => ({
      camera: applyPan(s.camera, dx, dy),
    })),

  zoomTo: (zoom) =>
    set((s) => ({
      camera: { ...s.camera, zoom: clampZoom(zoom, MIN_ZOOM, MAX_ZOOM) },
    })),

  zoomByAt: (screenPoint, factor) =>
    set((s) => ({ camera: zoomAtPoint(s.camera, screenPoint, factor, MIN_ZOOM, MAX_ZOOM) })),

  // --- Inner-edit UI state ---
  enterInnerEdit: (id) => set({ innerEditNodeId: id }),
  exitInnerEdit: () => set({ innerEditNodeId: null }),

  // --- Lasso UI state ---
  setBoxSelecting: (active) => set({ boxSelecting: active }),
  // --- DnD UI state ---
  setDraggingNode: (active) => set({ isDraggingNode: active }),

  // --- Rulers/Guides UI ---
  toggleRulers: () => set((s) => ({ showRulers: !s.showRulers })),
  addGuide: (axis, value) => {
    const id = `guide-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    set((s) => {
      const newGuide = { id, axis, value };
      const newGuides = [...s.guides, newGuide];
      if (__isReplayingHistory) {
        return { guides: newGuides } as Partial<CanvasStore> as CanvasStore;
      }
      // Save to main history system
      const entry: HistoryEntry = {
        changes: [],
        guideChanges: [{ kind: 'add', guide: newGuide }],
      };
      return {
        guides: newGuides,
        historyPast: [...s.historyPast, entry],
        historyFuture: [],
      } as Partial<CanvasStore> as CanvasStore;
    });
    return id;
  },
  moveGuideTemporary: (id: GuideId, value: number) =>
    set((s) => {
      const newGuides = s.guides.map((g) => (g.id === id ? { ...g, value } : g));
      return { guides: newGuides } as Partial<CanvasStore> as CanvasStore;
    }),
  moveGuide: (id, value) =>
    set((s) => {
      const oldGuide = s.guides.find((g) => g.id === id);
      if (!oldGuide) return {} as Partial<CanvasStore> as CanvasStore;
      const newGuides = s.guides.map((g) => (g.id === id ? { ...g, value } : g));
      if (__isReplayingHistory) {
        return { guides: newGuides } as Partial<CanvasStore> as CanvasStore;
      }
      // Save to main history system
      const entry: HistoryEntry = {
        changes: [],
        guideChanges: [
          { kind: 'remove', guide: oldGuide },
          { kind: 'add', guide: { ...oldGuide, value } },
        ],
      };
      return {
        guides: newGuides,
        historyPast: [...s.historyPast, entry],
        historyFuture: [],
      } as Partial<CanvasStore> as CanvasStore;
    }),
  moveGuideCommit: (id, fromValue, toValue) =>
    set((s) => {
      const guide = s.guides.find((g) => g.id === id);
      if (!guide) return {} as Partial<CanvasStore> as CanvasStore;

      // Guide should already be at toValue from temporary moves
      if (__isReplayingHistory) {
        const newGuides = s.guides.map((g) => (g.id === id ? { ...g, value: toValue } : g));
        return { guides: newGuides } as Partial<CanvasStore> as CanvasStore;
      }

      // Only create history entry if position actually changed
      if (fromValue === toValue) {
        return {} as Partial<CanvasStore> as CanvasStore;
      }

      // Save to main history system with original and final positions
      const entry: HistoryEntry = {
        changes: [],
        guideChanges: [
          { kind: 'remove', guide: { ...guide, value: fromValue } },
          { kind: 'add', guide: { ...guide, value: toValue } },
        ],
      };
      return {
        historyPast: [...s.historyPast, entry],
        historyFuture: [],
      } as Partial<CanvasStore> as CanvasStore;
    }),
  removeGuide: (id) =>
    set((s) => {
      const removedGuide = s.guides.find((g) => g.id === id);
      if (!removedGuide) return {} as Partial<CanvasStore> as CanvasStore;
      const newGuides = s.guides.filter((g) => g.id !== id);
      const newActiveGuideId = s.activeGuideId === id ? null : s.activeGuideId;
      if (__isReplayingHistory) {
        return {
          guides: newGuides,
          activeGuideId: newActiveGuideId,
        } as Partial<CanvasStore> as CanvasStore;
      }
      // Save to main history system
      const entry: HistoryEntry = {
        changes: [],
        guideChanges: [{ kind: 'remove', guide: removedGuide }],
      };
      return {
        guides: newGuides,
        activeGuideId: newActiveGuideId,
        historyPast: [...s.historyPast, entry],
        historyFuture: [],
      } as Partial<CanvasStore> as CanvasStore;
    }),
  clearGuides: () =>
    set((s) => {
      if (s.guides.length === 0) return {} as Partial<CanvasStore> as CanvasStore;
      if (__isReplayingHistory) {
        return {
          guides: [],
          activeGuideId: null,
        } as Partial<CanvasStore> as CanvasStore;
      }
      // Save to main history system
      const entry: HistoryEntry = {
        changes: [],
        guideChanges: [{ kind: 'clear', guides: s.guides }],
      };
      return {
        guides: [],
        activeGuideId: null,
        historyPast: [...s.historyPast, entry],
        historyFuture: [],
      } as Partial<CanvasStore> as CanvasStore;
    }),
  setActiveGuide: (id) => set({ activeGuideId: id }),

  // --- Alignment/Snap UI state ---
  setAlignSnapEnabled: (enabled) => set({ alignSnapEnabled: enabled }),
  setAlignSnapTolerancePx: (px) => set({ alignSnapTolerancePx: px }),
  setAlignmentGuides: (guides) => set({ alignmentGuides: guides }),
  clearAlignmentGuides: () => set({ alignmentGuides: [] }),
  setSnapOffset: (offset) => set({ snapOffset: offset }),
  clearSnapOffset: () => set({ snapOffset: null }),

  // Nodes CRUD
  addNode: (node) =>
    set((s) => {
      const nextNodes = { ...s.nodes, [node.id]: node } as Record<NodeId, Node>;
      if (__isReplayingHistory) return { nodes: nextNodes } as Partial<CanvasStore> as CanvasStore;
      if (s.historyBatch) {
        const batch = s.historyBatch;
        return {
          nodes: nextNodes,
          historyBatch: { ...batch, changes: [...batch.changes, { kind: 'add', node }] },
        } as Partial<CanvasStore> as CanvasStore;
      }
      const entry: HistoryEntry = { changes: [{ kind: 'add', node }] };
      return {
        nodes: nextNodes,
        historyPast: [...s.historyPast, entry],
        historyFuture: [],
      } as Partial<CanvasStore> as CanvasStore;
    }),

  // --- Selection transforms (Temporary/Commit) ---
  resizeSelectionTemporary: (params) => {
    set((s) => {
      // Mark gesture active
      const partial: Partial<CanvasStore> = { isTransforming: true } as Partial<CanvasStore>;
      // Determine primary target: innerEdit node, else single selection
      let targetId: NodeId | null = null;
      if (s.innerEditNodeId && s.nodes[s.innerEditNodeId]) targetId = s.innerEditNodeId;
      else {
        const ids = Object.keys(s.selected) as NodeId[];
        if (ids.length === 1) targetId = ids[0];
      }
      if (!targetId) return partial as Partial<CanvasStore> as CanvasStore;

      const n = s.nodes[targetId];
      if (!n) return partial as Partial<CanvasStore> as CanvasStore;

      const dx = params.dx || 0;
      const dy = params.dy || 0;
      const baseW = params.fromWidth != null ? params.fromWidth : (n.width ?? 0);
      const baseH = params.fromHeight != null ? params.fromHeight : (n.height ?? 0);
      let newW = Math.max(1, baseW + dx);
      let newH = Math.max(1, baseH + dy);

      if (params.proportional) {
        const aspect = (baseW || 1) / Math.max(1, baseH || 1);
        if (Math.abs(dx) > Math.abs(dy)) newH = Math.max(1, newW / Math.max(0.01, aspect));
        else newW = Math.max(1, newH * Math.max(0.01, aspect));
      }

      if (params.fromCenter) {
        const k2 = 2;
        newW = Math.max(1, baseW + (newW - baseW) * k2);
        newH = Math.max(1, baseH + (newH - baseH) * k2);
      }

      // Live update without history (UI-temporary)
      const nextNodes = { ...s.nodes, [targetId]: { ...n, width: newW, height: newH } } as Record<
        NodeId,
        Node
      >;
      return {
        ...(partial as CanvasStore),
        nodes: nextNodes,
      } as Partial<CanvasStore> as CanvasStore;
    });
  },
  resizeSelectionCommit: (from, to) => {
    set((s) => {
      // Determine primary target: innerEdit node, else single selection
      let targetId: NodeId | null = null;
      if (s.innerEditNodeId && s.nodes[s.innerEditNodeId]) targetId = s.innerEditNodeId;
      else {
        const ids = Object.keys(s.selected) as NodeId[];
        if (ids.length === 1) targetId = ids[0];
      }

      if (!targetId) return { isTransforming: false } as Partial<CanvasStore> as CanvasStore;
      const n = s.nodes[targetId];
      if (!n) return { isTransforming: false } as Partial<CanvasStore> as CanvasStore;

      const changed =
        Math.round(from.width ?? 0) !== Math.round(to.width ?? 0) ||
        Math.round(from.height ?? 0) !== Math.round(to.height ?? 0);
      if (!changed) return { isTransforming: false } as Partial<CanvasStore> as CanvasStore;

      // Commit with history (coalesced if inside a batch)
      if (!__isReplayingHistory) get().beginHistory('resize');
      get().updateNode(targetId, { width: Math.max(1, to.width), height: Math.max(1, to.height) });
      if (!__isReplayingHistory) get().endHistory();
      return { isTransforming: false } as Partial<CanvasStore> as CanvasStore;
    });
  },
  rotateSelectionTemporary: (deltaAngle) => {
    void deltaAngle;
    set({ isTransforming: true });
  },
  rotateSelectionCommit: (fromAngle, toAngle) => {
    const s = get();
    const delta = toAngle - fromAngle;
    if (delta === 0) {
      set({ isTransforming: false } as Partial<CanvasStore> as CanvasStore);
      return;
    }
    // Collect selection with inner-edit scoping (same as moveSelectedBy)
    let selIds = Object.keys(s.selected) as NodeId[];
    if (s.innerEditNodeId) {
      const gid = s.selectedVisualGroupId;
      if (gid && s.visualGroups[gid]) {
        const members = new Set<NodeId>(s.visualGroups[gid].members as NodeId[]);
        selIds = selIds.filter((id) => members.has(id));
      } else {
        const scopeRoot = s.innerEditNodeId;
        const isWithinScope = (id: NodeId): boolean => {
          let cur: NodeId | null | undefined = id;
          while (cur != null) {
            if (cur === scopeRoot) return true;
            cur = s.nodes[cur]?.parentId ?? null;
          }
          return false;
        };
        selIds = selIds.filter(isWithinScope);
      }
    }
    if (selIds.length === 0) {
      set({ isTransforming: false } as Partial<CanvasStore> as CanvasStore);
      return;
    }
    if (!__isReplayingHistory) get().beginHistory('rotate');
    for (const id of selIds) {
      const n = s.nodes[id];
      const current = n?.rotation ?? 0;
      get().updateNode(id, { rotation: current + delta });
    }
    if (!__isReplayingHistory) get().endHistory();
    set({ isTransforming: false } as Partial<CanvasStore> as CanvasStore);
  },
  setCornerRadiusTemporary: (value) => {
    set((s) => {
      // mark gesture active
      const partial: Partial<CanvasStore> = { isTransforming: true } as Partial<CanvasStore>;
      // Determine primary target: innerEdit node, else single selection
      let targetId: NodeId | null = null;
      if (s.innerEditNodeId && s.nodes[s.innerEditNodeId]) targetId = s.innerEditNodeId;
      else {
        const ids = Object.keys(s.selected) as NodeId[];
        if (ids.length === 1) targetId = ids[0];
      }
      if (!targetId) return partial as Partial<CanvasStore> as CanvasStore;
      const n = s.nodes[targetId];
      if (!n) return partial as Partial<CanvasStore> as CanvasStore;

      const nextNodes = { ...s.nodes, [targetId]: { ...n, cornerRadius: value } } as Record<
        NodeId,
        Node
      >;
      return {
        ...(partial as CanvasStore),
        nodes: nextNodes,
      } as Partial<CanvasStore> as CanvasStore;
    });
  },
  setCornerRadiusCommit: (_from, to) => {
    const s = get();
    let selIds = Object.keys(s.selected) as NodeId[];
    if (s.innerEditNodeId) {
      const gid = s.selectedVisualGroupId;
      if (gid && s.visualGroups[gid]) {
        const members = new Set<NodeId>(s.visualGroups[gid].members as NodeId[]);
        selIds = selIds.filter((id) => members.has(id));
      } else {
        const scopeRoot = s.innerEditNodeId;
        const isWithinScope = (id: NodeId): boolean => {
          let cur: NodeId | null | undefined = id;
          while (cur != null) {
            if (cur === scopeRoot) return true;
            cur = s.nodes[cur]?.parentId ?? null;
          }
          return false;
        };
        selIds = selIds.filter(isWithinScope);
      }
    }
    if (selIds.length === 0) {
      set({ isTransforming: false } as Partial<CanvasStore> as CanvasStore);
      return;
    }
    if (!__isReplayingHistory) get().beginHistory('cornerRadius');
    for (const id of selIds) {
      get().updateNode(id, { cornerRadius: to });
    }
    if (!__isReplayingHistory) get().endHistory();
    set({ isTransforming: false } as Partial<CanvasStore> as CanvasStore);
  },
  addNodeAtCenter: (node) =>
    set((s) => {
      const stepPx = 16; // screen px per step
      const modulo = 12; // wrap to avoid drifting too far
      const k = s.centerAddIndex % modulo;
      // Compute screen center (viewport). For nested layouts, users can use useCanvasHelpers.
      const screenCx = typeof window !== 'undefined' ? window.innerWidth / 2 : 0;
      const screenCy = typeof window !== 'undefined' ? window.innerHeight / 2 : 0;
      // Convert to world and normalize offset by zoom
      const zoom = s.camera.zoom;
      const cx = screenCx / zoom + s.camera.offsetX;
      const cy = screenCy / zoom + s.camera.offsetY;
      const dxWorld = (k * stepPx) / zoom;
      const dyWorld = (k * stepPx) / zoom;
      const x = cx - node.width / 2 + dxWorld;
      const y = cy - node.height / 2 + dyWorld;
      const placed: Node = { id: node.id, x, y, width: node.width, height: node.height };
      const nextNodes = { ...s.nodes, [node.id]: placed } as Record<NodeId, Node>;
      if (__isReplayingHistory) {
        return {
          nodes: nextNodes,
          centerAddIndex: s.centerAddIndex + 1,
        } as Partial<CanvasStore> as CanvasStore;
      }
      if (s.historyBatch) {
        const batch = s.historyBatch;
        return {
          nodes: nextNodes,
          centerAddIndex: s.centerAddIndex + 1,
          historyBatch: { ...batch, changes: [...batch.changes, { kind: 'add', node: placed }] },
        } as Partial<CanvasStore> as CanvasStore;
      }
      const entry: HistoryEntry = { changes: [{ kind: 'add', node: placed }] };
      return {
        nodes: nextNodes,
        centerAddIndex: s.centerAddIndex + 1,
        historyPast: [...s.historyPast, entry],
        historyFuture: [],
      } as Partial<CanvasStore> as CanvasStore;
    }),
  updateNode: (id, patch) =>
    set((s) => {
      const current = s.nodes[id];
      if (!current) return { nodes: s.nodes } as Partial<CanvasStore> as CanvasStore;
      const updated: Node = { ...current, ...patch } as Node;
      const nextNodes = { ...s.nodes, [id]: updated } as Record<NodeId, Node>;
      if (__isReplayingHistory) return { nodes: nextNodes } as Partial<CanvasStore> as CanvasStore;
      if (s.historyBatch) {
        const batch = s.historyBatch;
        const idx = batch.updateIndexById[id];
        if (idx == null) {
          const newIdx = batch.changes.length;
          const newChanges = [
            ...batch.changes,
            { kind: 'update', id, before: current, after: updated } as NodeChange,
          ];
          const newMap = { ...batch.updateIndexById, [id]: newIdx } as Record<NodeId, number>;
          return {
            nodes: nextNodes,
            historyBatch: { ...batch, changes: newChanges, updateIndexById: newMap },
          } as Partial<CanvasStore> as CanvasStore;
        } else {
          const newChanges = batch.changes.slice();
          const prev = newChanges[idx] as Extract<NodeChange, { kind: 'update' }>;
          newChanges[idx] = {
            kind: 'update',
            id,
            before: prev.kind === 'update' ? prev.before : current,
            after: updated,
          } as NodeChange;
          return {
            nodes: nextNodes,
            historyBatch: { ...batch, changes: newChanges },
          } as Partial<CanvasStore> as CanvasStore;
        }
      }
      const entry: HistoryEntry = {
        changes: [{ kind: 'update', id, before: current, after: updated }],
      };
      return {
        nodes: nextNodes,
        historyPast: [...s.historyPast, entry],
        historyFuture: [],
      } as Partial<CanvasStore> as CanvasStore;
    }),
  removeNode: (id) =>
    set((s) => {
      if (!s.nodes[id]) return { nodes: s.nodes } as Partial<CanvasStore> as CanvasStore;
      const next = { ...s.nodes } as Record<NodeId, Node>;
      const removed = next[id];
      delete next[id];
      // clear parentId for immediate children of the removed node
      const childUpdates: { id: NodeId; before: Node; after: Node }[] = [];
      for (const [cid, cn] of Object.entries(next) as [NodeId, Node][]) {
        if (cn.parentId === id) {
          const updated = { ...cn, parentId: null } as Node;
          next[cid] = updated;
          childUpdates.push({ id: cid, before: cn, after: updated });
        }
      }
      // also remove from selection if present
      if (s.selected[id]) {
        const sel = { ...s.selected };
        delete sel[id];
        if (!__isReplayingHistory) {
          if (s.historyBatch) {
            const batch = s.historyBatch;
            // merge updates with coalescing
            const newChanges = batch.changes.slice();
            const newMap = { ...batch.updateIndexById } as Record<NodeId, number>;
            for (const u of childUpdates) {
              const idx = newMap[u.id];
              if (idx == null) {
                const newIdx = newChanges.length;
                newChanges.push({ kind: 'update', id: u.id, before: u.before, after: u.after });
                newMap[u.id] = newIdx;
              } else {
                const prev = newChanges[idx] as Extract<NodeChange, { kind: 'update' }>;
                newChanges[idx] = { kind: 'update', id: u.id, before: prev.before, after: u.after };
              }
            }
            newChanges.push({ kind: 'remove', node: removed });
            return {
              nodes: next,
              selected: sel,
              historyBatch: { ...batch, changes: newChanges, updateIndexById: newMap },
            } as Partial<CanvasStore> as CanvasStore;
          }
          const entry: HistoryEntry = {
            changes: [
              ...childUpdates.map(
                (u) =>
                  ({ kind: 'update', id: u.id, before: u.before, after: u.after }) as NodeChange,
              ),
              { kind: 'remove', node: removed },
            ],
          };
          return {
            nodes: next,
            selected: sel,
            historyPast: [...s.historyPast, entry],
            historyFuture: [],
          } as Partial<CanvasStore> as CanvasStore;
        }
        return { nodes: next, selected: sel } as Partial<CanvasStore> as CanvasStore;
      }
      if (!__isReplayingHistory) {
        if (s.historyBatch) {
          const batch = s.historyBatch;
          const newChanges = batch.changes.slice();
          const newMap = { ...batch.updateIndexById } as Record<NodeId, number>;
          for (const u of childUpdates) {
            const idx = newMap[u.id];
            if (idx == null) {
              const newIdx = newChanges.length;
              newChanges.push({ kind: 'update', id: u.id, before: u.before, after: u.after });
              newMap[u.id] = newIdx;
            } else {
              const prev = newChanges[idx] as Extract<NodeChange, { kind: 'update' }>;
              newChanges[idx] = { kind: 'update', id: u.id, before: prev.before, after: u.after };
            }
          }
          newChanges.push({ kind: 'remove', node: removed });
          return {
            nodes: next,
            historyBatch: { ...batch, changes: newChanges, updateIndexById: newMap },
          } as Partial<CanvasStore> as CanvasStore;
        }
        const entry: HistoryEntry = {
          changes: [
            ...childUpdates.map(
              (u) => ({ kind: 'update', id: u.id, before: u.before, after: u.after }) as NodeChange,
            ),
            { kind: 'remove', node: removed },
          ],
        };
        return {
          nodes: next,
          historyPast: [...s.historyPast, entry],
          historyFuture: [],
        } as Partial<CanvasStore> as CanvasStore;
      }
      return { nodes: next } as Partial<CanvasStore> as CanvasStore;
    }),
  removeNodes: (ids) =>
    set((s) => {
      if (!ids || ids.length === 0) return {} as Partial<CanvasStore> as CanvasStore;
      let changed = false;
      const nextNodes: Record<NodeId, Node> = { ...s.nodes };
      const removedList: Node[] = [];
      const removedSet = new Set<NodeId>();
      for (const id of ids) {
        if (nextNodes[id]) {
          removedList.push(nextNodes[id]);
          delete nextNodes[id];
          removedSet.add(id);
          changed = true;
        }
      }
      if (!changed) return {} as Partial<CanvasStore> as CanvasStore;
      // clean up selection entries
      let selChanged = false;
      const nextSel = { ...s.selected };
      for (const id of ids) {
        if (nextSel[id]) {
          delete nextSel[id];
          selChanged = true;
        }
      }
      // clear parentId for children that pointed to any removed id
      const childUpdates: { id: NodeId; before: Node; after: Node }[] = [];
      for (const [cid, cn] of Object.entries(nextNodes) as [NodeId, Node][]) {
        if (cn.parentId && removedSet.has(cn.parentId)) {
          const updated = { ...cn, parentId: null } as Node;
          nextNodes[cid] = updated;
          childUpdates.push({ id: cid, before: cn, after: updated });
        }
      }
      if (__isReplayingHistory) {
        return selChanged
          ? ({ nodes: nextNodes, selected: nextSel } as Partial<CanvasStore> as CanvasStore)
          : ({ nodes: nextNodes } as Partial<CanvasStore> as CanvasStore);
      }
      if (s.historyBatch) {
        const batch = s.historyBatch;
        const newChanges = batch.changes.slice();
        const newMap = { ...batch.updateIndexById } as Record<NodeId, number>;
        for (const u of childUpdates) {
          const idx = newMap[u.id];
          if (idx == null) {
            const newIdx = newChanges.length;
            newChanges.push({ kind: 'update', id: u.id, before: u.before, after: u.after });
            newMap[u.id] = newIdx;
          } else {
            const prev = newChanges[idx] as Extract<NodeChange, { kind: 'update' }>;
            newChanges[idx] = { kind: 'update', id: u.id, before: prev.before, after: u.after };
          }
        }
        for (const n of removedList) newChanges.push({ kind: 'remove', node: n });
        const newBatch = { ...batch, changes: newChanges, updateIndexById: newMap };
        return selChanged
          ? ({
              nodes: nextNodes,
              selected: nextSel,
              historyBatch: newBatch,
            } as Partial<CanvasStore> as CanvasStore)
          : ({ nodes: nextNodes, historyBatch: newBatch } as Partial<CanvasStore> as CanvasStore);
      }
      const entry: HistoryEntry = {
        changes: [
          ...childUpdates.map(
            (u) => ({ kind: 'update', id: u.id, before: u.before, after: u.after }) as NodeChange,
          ),
          ...removedList.map((n) => ({ kind: 'remove', node: n }) as NodeChange),
        ],
      };
      return selChanged
        ? ({
            nodes: nextNodes,
            selected: nextSel,
            historyPast: [...s.historyPast, entry],
            historyFuture: [],
          } as Partial<CanvasStore> as CanvasStore)
        : ({
            nodes: nextNodes,
            historyPast: [...s.historyPast, entry],
            historyFuture: [],
          } as Partial<CanvasStore> as CanvasStore);
    }),
  groupNodes: (parentId, childIds) =>
    set((s) => {
      if (!parentId || !childIds || childIds.length === 0)
        return {} as Partial<CanvasStore> as CanvasStore;
      const parent = s.nodes[parentId];
      if (!parent) return {} as Partial<CanvasStore> as CanvasStore;
      const nextNodes: Record<NodeId, Node> = { ...s.nodes };
      const updates: { id: NodeId; before: Node; after: Node }[] = [];
      for (const cid of childIds) {
        const child = s.nodes[cid];
        if (!child) continue;
        if (cid === parentId) continue; // cannot parent self
        // cycle check: parent chain of parent must not include child id
        let p: NodeId | null | undefined = parentId;
        let cycle = false;
        while (p != null) {
          if (p === cid) {
            cycle = true;
            break;
          }
          p = s.nodes[p]?.parentId ?? null;
        }
        if (cycle) continue;
        if (child.parentId === parentId) continue; // already grouped
        const updated = { ...child, parentId } as Node;
        nextNodes[cid] = updated;
        updates.push({ id: cid, before: child, after: updated });
      }
      if (updates.length === 0) return {} as Partial<CanvasStore> as CanvasStore;
      if (__isReplayingHistory) return { nodes: nextNodes } as Partial<CanvasStore> as CanvasStore;
      if (s.historyBatch) {
        const batch = s.historyBatch;
        const newChanges = batch.changes.slice();
        const newMap = { ...batch.updateIndexById } as Record<NodeId, number>;
        for (const u of updates) {
          const idx = newMap[u.id];
          if (idx == null) {
            const newIdx = newChanges.length;
            newChanges.push({ kind: 'update', id: u.id, before: u.before, after: u.after });
            newMap[u.id] = newIdx;
          } else {
            const prev = newChanges[idx] as Extract<NodeChange, { kind: 'update' }>;
            newChanges[idx] = { kind: 'update', id: u.id, before: prev.before, after: u.after };
          }
        }
        return {
          nodes: nextNodes,
          historyBatch: { ...batch, changes: newChanges, updateIndexById: newMap },
        } as Partial<CanvasStore> as CanvasStore;
      }
      const entry: HistoryEntry = {
        changes: updates.map((u) => ({
          kind: 'update',
          id: u.id,
          before: u.before,
          after: u.after,
        })),
      };
      return {
        nodes: nextNodes,
        historyPast: [...s.historyPast, entry],
        historyFuture: [],
      } as Partial<CanvasStore> as CanvasStore;
    }),
  ungroup: (ids) =>
    set((s) => {
      if (!ids || ids.length === 0) return {} as Partial<CanvasStore> as CanvasStore;
      const nextNodes: Record<NodeId, Node> = { ...s.nodes };
      const updates: { id: NodeId; before: Node; after: Node }[] = [];
      for (const id of ids) {
        const n = s.nodes[id];
        if (!n) continue;
        if (n.parentId == null) continue;
        const updated = { ...n, parentId: null } as Node;
        nextNodes[id] = updated;
        updates.push({ id, before: n, after: updated });
      }
      if (updates.length === 0) return {} as Partial<CanvasStore> as CanvasStore;
      if (__isReplayingHistory) return { nodes: nextNodes } as Partial<CanvasStore> as CanvasStore;
      if (s.historyBatch) {
        const batch = s.historyBatch;
        const newChanges = batch.changes.slice();
        const newMap = { ...batch.updateIndexById } as Record<NodeId, number>;
        for (const u of updates) {
          const idx = newMap[u.id];
          if (idx == null) {
            const newIdx = newChanges.length;
            newChanges.push({ kind: 'update', id: u.id, before: u.before, after: u.after });
            newMap[u.id] = newIdx;
          } else {
            const prev = newChanges[idx] as Extract<NodeChange, { kind: 'update' }>;
            newChanges[idx] = { kind: 'update', id: u.id, before: prev.before, after: u.after };
          }
        }
        return {
          nodes: nextNodes,
          historyBatch: { ...batch, changes: newChanges, updateIndexById: newMap },
        } as Partial<CanvasStore> as CanvasStore;
      }
      const entry: HistoryEntry = {
        changes: updates.map((u) => ({
          kind: 'update',
          id: u.id,
          before: u.before,
          after: u.after,
        })),
      };
      return {
        nodes: nextNodes,
        historyPast: [...s.historyPast, entry],
        historyFuture: [],
      } as Partial<CanvasStore> as CanvasStore;
    }),
  moveSelectedBy: (dx, dy) =>
    set((s) => {
      if (dx === 0 && dy === 0) return {} as Partial<CanvasStore> as CanvasStore;
      // Start from current selection and optionally scope to inner-edit subtree
      let selIds = Object.keys(s.selected) as NodeId[];
      if (s.innerEditNodeId) {
        // If a visual group is selected while in inner-edit, scope movement to that group's members
        const gid = s.selectedVisualGroupId;
        if (gid && s.visualGroups[gid]) {
          const members = new Set<NodeId>(s.visualGroups[gid].members as NodeId[]);
          selIds = selIds.filter((id) => members.has(id));
        } else {
          const scopeRoot = s.innerEditNodeId;
          const isWithinScope = (id: NodeId): boolean => {
            let cur: NodeId | null | undefined = id;
            while (cur != null) {
              if (cur === scopeRoot) return true;
              cur = s.nodes[cur]?.parentId ?? null;
            }
            return false;
          };
          selIds = selIds.filter(isWithinScope);
        }
      }
      if (selIds.length === 0) return {} as Partial<CanvasStore> as CanvasStore;
      // Build children map to collect all descendants
      const childrenByParent = new Map<NodeId, NodeId[]>();
      for (const [id, n] of Object.entries(s.nodes) as [NodeId, Node][]) {
        if (n.parentId) {
          const arr = childrenByParent.get(n.parentId) || [];
          arr.push(id);
          childrenByParent.set(n.parentId, arr);
        }
      }
      const toMove = new Set<NodeId>(selIds);
      const queue: NodeId[] = selIds.slice();
      while (queue.length) {
        const pid = queue.shift() as NodeId;
        const kids = childrenByParent.get(pid);
        if (!kids) continue;
        for (const cid of kids) {
          if (!toMove.has(cid)) {
            toMove.add(cid);
            queue.push(cid);
          }
        }
      }
      // --- Alignment snapping (ephemeral) ---
      let dxApplied = dx;
      let dyApplied = dy;
      const guidesEphemeral: AlignGuide[] = [];
      let snapDx = 0;
      let snapDy = 0;
      let nextSnapLockX = s.snapLockX;
      let nextSnapLockY = s.snapLockY;
      // Compute snapping only during an active drag batch (gesture), not for programmatic moves
      if (s.alignSnapEnabled && s.historyBatch) {
        const zoom = s.camera.zoom || 1;
        const tolWorld = (s.alignSnapTolerancePx || 0) / zoom;
        if (tolWorld > 0) {
          // Compute selection bounding box (selected ids only, not descendants)
          let selLeft = Infinity,
            selTop = Infinity,
            selRight = -Infinity,
            selBottom = -Infinity;
          for (const id of selIds) {
            const n = s.nodes[id];
            if (!n) continue;
            selLeft = Math.min(selLeft, n.x);
            selTop = Math.min(selTop, n.y);
            selRight = Math.max(selRight, n.x + n.width);
            selBottom = Math.max(selBottom, n.y + n.height);
          }
          if (selLeft !== Infinity) {
            const selW = Math.max(0, selRight - selLeft);
            const selH = Math.max(0, selBottom - selTop);
            const selCx = selLeft + selW / 2;
            const selCy = selTop + selH / 2;
            // Collect target positions from static nodes (not moving) and guides
            type Target = { axis: 'x' | 'y'; at: number; targetId: NodeId | 'selection' };
            const targetsX: Target[] = [];
            const targetsY: Target[] = [];
            for (const [id, n] of Object.entries(s.nodes) as [NodeId, Node][]) {
              if (toMove.has(id)) continue;
              const left = n.x;
              const top = n.y;
              const right = n.x + n.width;
              const bottom = n.y + n.height;
              const cx = left + n.width / 2;
              const cy = top + n.height / 2;
              targetsX.push({ axis: 'x', at: left, targetId: id });
              targetsX.push({ axis: 'x', at: cx, targetId: id });
              targetsX.push({ axis: 'x', at: right, targetId: id });
              targetsY.push({ axis: 'y', at: top, targetId: id });
              targetsY.push({ axis: 'y', at: cy, targetId: id });
              targetsY.push({ axis: 'y', at: bottom, targetId: id });
            }
            for (const g of s.guides) {
              if (g.axis === 'x') targetsX.push({ axis: 'x', at: g.value, targetId: 'selection' });
              else targetsY.push({ axis: 'y', at: g.value, targetId: 'selection' });
            }
            // Current moved features
            const leftMoved = selLeft + dx;
            const rightMoved = selRight + dx;
            const cxMoved = selCx + dx;
            const topMoved = selTop + dy;
            const bottomMoved = selBottom + dy;
            const cyMoved = selCy + dy;
            // Find best X snap
            let bestX: { corr: number; guide: AlignGuide } | null = null;
            for (const t of targetsX) {
              const dL = t.at - leftMoved;
              const dC = t.at - cxMoved;
              const dR = t.at - rightMoved;
              const cand: Array<{ corr: number; kind: 'edge' | 'center' }> = [
                { corr: dL, kind: 'edge' },
                { corr: dC, kind: 'center' },
                { corr: dR, kind: 'edge' },
              ];
              for (const c of cand) {
                const ad = Math.abs(c.corr);
                if (ad <= tolWorld) {
                  if (!bestX || ad < Math.abs(bestX.corr)) {
                    bestX = {
                      corr: c.corr,
                      guide: { axis: 'x', at: t.at, kind: c.kind, targetId: t.targetId },
                    };
                  }
                }
              }
            }
            // Find best Y snap
            let bestY: { corr: number; guide: AlignGuide } | null = null;
            for (const t of targetsY) {
              const dT = t.at - topMoved;
              const dC = t.at - cyMoved;
              const dB = t.at - bottomMoved;
              const cand: Array<{ corr: number; kind: 'edge' | 'center' }> = [
                { corr: dT, kind: 'edge' },
                { corr: dC, kind: 'center' },
                { corr: dB, kind: 'edge' },
              ];
              for (const c of cand) {
                const ad = Math.abs(c.corr);
                if (ad <= tolWorld) {
                  if (!bestY || ad < Math.abs(bestY.corr)) {
                    bestY = {
                      corr: c.corr,
                      guide: { axis: 'y', at: t.at, kind: c.kind, targetId: t.targetId },
                    };
                  }
                }
              }
            }
            // X-axis snap lock with hysteresis
            const deadband = tolWorld * 0.5;
            if (nextSnapLockX) {
              // Compute corr to lock.at using current moved features
              const dL = nextSnapLockX.at - (selLeft + dx);
              const dC = nextSnapLockX.at - (selCx + dx);
              const dR = nextSnapLockX.at - (selRight + dx);
              const candX: Array<{ corr: number; kind: 'edge' | 'center' }> = [
                { corr: dL, kind: 'edge' },
                { corr: dC, kind: 'center' },
                { corr: dR, kind: 'edge' },
              ];
              const corr = candX.reduce(
                (best, c) => (Math.abs(c.corr) < Math.abs(best.corr) ? c : best),
                { corr: candX[0].corr, kind: candX[0].kind },
              );
              // Unlock if moving away and exceeded deadband
              if (
                dx !== 0 &&
                Math.sign(dx) !== Math.sign(corr.corr) &&
                Math.abs(corr.corr) > deadband
              ) {
                nextSnapLockX = null;
              } else {
                // Stay locked: snap exactly
                dxApplied = dx + corr.corr;
                snapDx = corr.corr;
                guidesEphemeral.push({
                  axis: 'x',
                  at: nextSnapLockX.at,
                  kind: corr.kind,
                  targetId: 'selection',
                });
              }
            }
            if (!nextSnapLockX && bestX) {
              // Lock when approaching within tolerance and moving toward the guide
              if (dx !== 0 && Math.sign(dx) === Math.sign(bestX.corr)) {
                nextSnapLockX = { at: bestX.guide.at, kind: bestX.guide.kind };
                dxApplied = dx + bestX.corr;
                snapDx = bestX.corr;
                guidesEphemeral.push(bestX.guide);
              } else {
                // Not locking (e.g., corr ~= 0 or moving away) — still show guide for UX
                guidesEphemeral.push(bestX.guide);
              }
            }
            // If we had a locked Y but not X, or vice versa, ensure guides still reflect proximity
            // Y-axis snap lock with hysteresis
            if (nextSnapLockY) {
              const dT = nextSnapLockY.at - (selTop + dy);
              const dC = nextSnapLockY.at - (selCy + dy);
              const dB = nextSnapLockY.at - (selBottom + dy);
              const candY: Array<{ corr: number; kind: 'edge' | 'center' }> = [
                { corr: dT, kind: 'edge' },
                { corr: dC, kind: 'center' },
                { corr: dB, kind: 'edge' },
              ];
              const corr = candY.reduce(
                (best, c) => (Math.abs(c.corr) < Math.abs(best.corr) ? c : best),
                { corr: candY[0].corr, kind: candY[0].kind },
              );
              if (
                dy !== 0 &&
                Math.sign(dy) !== Math.sign(corr.corr) &&
                Math.abs(corr.corr) > deadband
              ) {
                nextSnapLockY = null;
              } else {
                dyApplied = dy + corr.corr;
                snapDy = corr.corr;
                guidesEphemeral.push({
                  axis: 'y',
                  at: nextSnapLockY.at,
                  kind: corr.kind,
                  targetId: 'selection',
                });
              }
            }
            if (!nextSnapLockY && bestY) {
              if (dy !== 0 && Math.sign(dy) === Math.sign(bestY.corr)) {
                nextSnapLockY = { at: bestY.guide.at, kind: bestY.guide.kind };
                dyApplied = dy + bestY.corr;
                snapDy = bestY.corr;
                guidesEphemeral.push(bestY.guide);
              } else {
                guidesEphemeral.push(bestY.guide);
              }
            }
          }
        }
      }
      let changed = false;
      const nextNodes: Record<NodeId, Node> = { ...s.nodes };
      const updates: { id: NodeId; before: Node; after: Node }[] = [];
      for (const id of toMove) {
        const n = s.nodes[id];
        if (!n) continue;
        const moved = { ...n, x: n.x + dxApplied, y: n.y + dyApplied } as Node;
        nextNodes[id] = moved;
        updates.push({ id, before: n, after: moved });
        changed = true;
      }
      if (!changed) return {} as Partial<CanvasStore> as CanvasStore;
      if (__isReplayingHistory)
        return {
          nodes: nextNodes,
          alignmentGuides: guidesEphemeral,
          snapOffset: guidesEphemeral.length ? { dx: snapDx, dy: snapDy } : null,
          snapLockX: nextSnapLockX,
          snapLockY: nextSnapLockY,
        } as Partial<CanvasStore> as CanvasStore;
      if (s.historyBatch) {
        const batch = s.historyBatch;
        // merge each update with per-node coalescing
        const newChanges = batch.changes.slice();
        const newMap = { ...batch.updateIndexById } as Record<NodeId, number>;
        for (const u of updates) {
          const idx = newMap[u.id];
          if (idx == null) {
            const newIdx = newChanges.length;
            newChanges.push({ kind: 'update', id: u.id, before: u.before, after: u.after });
            newMap[u.id] = newIdx;
          } else {
            const prev = newChanges[idx] as Extract<NodeChange, { kind: 'update' }>;
            newChanges[idx] = { kind: 'update', id: u.id, before: prev.before, after: u.after };
          }
        }
        return {
          nodes: nextNodes,
          alignmentGuides: guidesEphemeral,
          snapOffset: guidesEphemeral.length ? { dx: snapDx, dy: snapDy } : null,
          snapLockX: nextSnapLockX,
          snapLockY: nextSnapLockY,
          historyBatch: { ...batch, changes: newChanges, updateIndexById: newMap },
        } as Partial<CanvasStore> as CanvasStore;
      }
      const entry: HistoryEntry = {
        changes: updates.map((u) => ({
          kind: 'update',
          id: u.id,
          before: u.before,
          after: u.after,
        })),
      };
      return {
        nodes: nextNodes,
        alignmentGuides: guidesEphemeral,
        snapOffset: guidesEphemeral.length ? { dx: snapDx, dy: snapDy } : null,
        snapLockX: nextSnapLockX,
        snapLockY: nextSnapLockY,
        historyPast: [...s.historyPast, entry],
        historyFuture: [],
      } as Partial<CanvasStore> as CanvasStore;
    }),

  // Selection
  deleteSelected: () => {
    const s = get();
    const gid = s.selectedVisualGroupId;
    const group = gid ? s.visualGroups[gid] : undefined;
    if (gid && group) {
      // Compute ids to delete: group's members plus any additionally selected nodes outside the group
      const selectedIds = Object.keys(s.selected) as NodeId[];
      const membersSet = new Set<NodeId>(group.members as NodeId[]);
      const extra = selectedIds.filter((id) => !membersSet.has(id));
      const idsToRemove = Array.from(new Set<NodeId>([...group.members, ...extra]));

      if (!__isReplayingHistory) get().beginHistory('Delete group');
      // Record group removal and remove from state
      set((state) => {
        const batch = state.historyBatch;
        let nextBatch = batch || null;
        if (!__isReplayingHistory && batch) {
          const gc = (batch.groupChanges || []).slice();
          gc.push({ kind: 'remove', group });
          nextBatch = { ...batch, groupChanges: gc } as typeof batch;
        }
        const newVg = { ...state.visualGroups };
        delete newVg[group.id];
        const clearHover = (id: string | null) => (id === group.id ? null : id);
        const partial: Partial<CanvasStore> = {
          visualGroups: newVg,
          selectedVisualGroupId: clearHover(state.selectedVisualGroupId),
          hoveredVisualGroupId: clearHover(state.hoveredVisualGroupId),
          hoveredVisualGroupIdSecondary: clearHover(state.hoveredVisualGroupIdSecondary),
          selected: state.selected, // will be cleaned by removeNodes and then cleared below
          ...(!__isReplayingHistory && nextBatch ? { historyBatch: nextBatch } : {}),
        } as Partial<CanvasStore>;
        return partial as Partial<CanvasStore> as CanvasStore;
      });
      // Remove nodes (will append to the same history batch)
      get().removeNodes(idsToRemove);
      // Clear selection at the end
      set({ selected: {} } as Partial<CanvasStore> as CanvasStore);
      if (!__isReplayingHistory) get().endHistory();
      return;
    }
    // Default: delete only selected nodes
    const ids = Object.keys(get().selected) as NodeId[];
    if (ids.length === 0) return;
    get().removeNodes(ids);
    set({ selected: {} } as Partial<CanvasStore> as CanvasStore);
  },
  clearSelection: () => set({ selected: {} }),
  selectOnly: (id) => set({ selected: { [id]: true } }),
  addToSelection: (id) =>
    set((s) => {
      if (s.selected[id]) return { selected: s.selected } as Partial<CanvasStore> as CanvasStore;
      return { selected: { ...s.selected, [id]: true } } as Partial<CanvasStore> as CanvasStore;
    }),
  removeFromSelection: (id) =>
    set((s) => {
      if (!s.selected[id]) return { selected: s.selected } as Partial<CanvasStore> as CanvasStore;
      const sel = { ...s.selected };
      delete sel[id];
      return { selected: sel } as Partial<CanvasStore> as CanvasStore;
    }),
  toggleInSelection: (id) =>
    set((s) => {
      if (s.selected[id]) {
        const sel = { ...s.selected };
        delete sel[id];
        return { selected: sel } as Partial<CanvasStore> as CanvasStore;
      }
      return { selected: { ...s.selected, [id]: true } } as Partial<CanvasStore> as CanvasStore;
    }),

  // Visual groups (UI-only)
  createVisualGroupFromSelection: () =>
    set((s) => {
      // Start from explicitly selected node ids
      const selectedIds = Object.keys(s.selected) as NodeId[];
      if (!selectedIds || selectedIds.length < 2) return {} as Partial<CanvasStore> as CanvasStore;

      // If selection touches any existing visual groups, include ALL their members
      // so the newly created group visually contains those groups.
      const union = new Set<NodeId>(selectedIds);
      for (const vg of Object.values(s.visualGroups)) {
        // Does this group contain at least one selected node?
        let touches = false;
        for (const id of selectedIds) {
          if (vg.members.includes(id)) {
            touches = true;
            break;
          }
        }
        if (touches) {
          for (const m of vg.members) union.add(m as NodeId);
        }
      }

      // Create a stable-ish id
      const id = `vg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const vg = { id, members: Array.from(union) };
      return {
        visualGroups: { ...s.visualGroups, [id]: vg },
        selectedVisualGroupId: id,
      } as Partial<CanvasStore> as CanvasStore;
    }),
  selectVisualGroup: (id) => set({ selectedVisualGroupId: id }),
  setHoveredVisualGroupId: (id) => set({ hoveredVisualGroupId: id }),
  setHoveredVisualGroupIdSecondary: (id) => set({ hoveredVisualGroupIdSecondary: id }),

  // Clipboard actions
  copySelection: () =>
    set((s) => {
      const selIds = Object.keys(s.selected) as NodeId[];
      if (selIds.length === 0) return { clipboard: null } as Partial<CanvasStore> as CanvasStore;

      // Build children map from current nodes
      const childrenByParent = new Map<NodeId, NodeId[]>();
      for (const [id, n] of Object.entries(s.nodes) as [NodeId, Node][]) {
        if (n.parentId) {
          const arr = childrenByParent.get(n.parentId) || [];
          arr.push(id);
          childrenByParent.set(n.parentId, arr);
        }
      }
      // Collect closure: selected + all descendants
      const toCopy = new Set<NodeId>(selIds);
      const queue: NodeId[] = selIds.slice();
      while (queue.length) {
        const pid = queue.shift() as NodeId;
        const kids = childrenByParent.get(pid);
        if (!kids) continue;
        for (const cid of kids) {
          if (!toCopy.has(cid)) {
            toCopy.add(cid);
            queue.push(cid);
          }
        }
      }
      const nodes: Node[] = [];
      for (const id of toCopy) {
        const n = s.nodes[id];
        if (n) nodes.push({ ...n });
      }
      return { clipboard: { nodes } } as Partial<CanvasStore> as CanvasStore;
    }),
  cutSelection: () => {
    const { copySelection, deleteSelected } = get();
    copySelection();
    deleteSelected();
  },
  pasteClipboard: (position?: Point) => {
    const s = get();
    const clip = s.clipboard;
    if (!clip || clip.nodes.length === 0) return;

    // Unique id generator based on existing ids and base id
    const existing = new Set(Object.keys(s.nodes));
    const genId = (base: string): string => {
      let candidate = `${base}-copy`;
      if (!existing.has(candidate)) {
        existing.add(candidate);
        return candidate;
      }
      let i = 2;
      candidate = `${base}-copy${i}`;
      while (existing.has(candidate)) {
        i += 1;
        candidate = `${base}-copy${i}`;
      }
      existing.add(candidate);
      return candidate;
    };

    // Compute paste delta (world units)
    let dx = 0;
    let dy = 0;
    if (position) {
      // Align clipboard bbox top-left to provided world position
      let minX = Infinity;
      let minY = Infinity;
      for (const n of clip.nodes) {
        if (n.x < minX) minX = n.x;
        if (n.y < minY) minY = n.y;
      }
      if (Number.isFinite(minX) && Number.isFinite(minY)) {
        dx = position.x - minX;
        dy = position.y - minY;
      }
    } else {
      // Default diagonal nudge like before
      const stepWorld = 16;
      const modulo = 12;
      const k = (s.pasteIndex % modulo) + 1; // start from 1 so first paste is nudged
      dx = k * stepWorld;
      dy = k * stepWorld;
    }

    // Build id remap and compute depth to add parents before children
    const originalById = new Map<NodeId, Node>();
    for (const n of clip.nodes) originalById.set(n.id, n);
    const remap = new Map<NodeId, NodeId>();
    for (const n of clip.nodes) remap.set(n.id, genId(n.id));

    const depthOf = (id: NodeId): number => {
      let d = 0;
      let p = originalById.get(id)?.parentId ?? null;
      while (p && originalById.has(p)) {
        d++;
        p = originalById.get(p)?.parentId ?? null;
      }
      return d;
    };

    const sorted = clip.nodes.slice().sort((a, b) => depthOf(a.id) - depthOf(b.id));

    // Begin a history batch so paste is a single undoable step
    get().beginHistory('paste');
    const newIds: NodeId[] = [];
    for (const n of sorted) {
      const newId = remap.get(n.id) as NodeId;
      const parentId =
        n.parentId && remap.has(n.parentId) ? (remap.get(n.parentId) as NodeId) : null;
      const cloned: Node = {
        id: newId,
        x: n.x + dx,
        y: n.y + dy,
        width: n.width,
        height: n.height,
        parentId,
      };
      get().addNode(cloned);
      newIds.push(newId);
    }
    get().endHistory();
    // Select pasted nodes and increment paste index
    set((state) => {
      const sel: Record<NodeId, true> = {};
      for (const id of newIds) sel[id] = true;
      return {
        selected: sel,
        pasteIndex: state.pasteIndex + 1,
      } as Partial<CanvasStore> as CanvasStore;
    });
  },

  // --- History actions ---
  beginHistory: (label) =>
    set((s) => {
      if (s.historyBatch) return {} as Partial<CanvasStore> as CanvasStore;
      return {
        historyBatch: { label, changes: [], updateIndexById: {}, groupChanges: [] },
      } as Partial<CanvasStore> as CanvasStore;
    }),
  endHistory: () =>
    set((s) => {
      const batch = s.historyBatch;
      if (!batch) return {} as Partial<CanvasStore> as CanvasStore;
      if (batch.changes.length === 0) {
        // if there are no node changes but there are group changes, still record
        if (!batch.groupChanges || batch.groupChanges.length === 0)
          return {
            historyBatch: null,
            alignmentGuides: [],
            snapOffset: null,
            snapLockX: null,
            snapLockY: null,
          } as Partial<CanvasStore> as CanvasStore;
      }
      const entry: HistoryEntry = { label: batch.label, changes: batch.changes };
      if (batch.groupChanges && batch.groupChanges.length > 0) {
        entry.visualGroupChanges = batch.groupChanges;
      }
      return {
        historyPast: [...s.historyPast, entry],
        historyFuture: [],
        historyBatch: null,
        alignmentGuides: [],
        snapOffset: null,
        snapLockX: null,
        snapLockY: null,
      } as Partial<CanvasStore> as CanvasStore;
    }),
  undo: () =>
    set((s) => {
      if (s.historyBatch || s.historyPast.length === 0)
        return {} as Partial<CanvasStore> as CanvasStore;
      const past = s.historyPast.slice();
      const entry = past.pop() as HistoryEntry;
      const future = s.historyFuture.slice();
      future.unshift(entry);
      // Apply inverse of entry
      __isReplayingHistory = true;
      try {
        // Determine reference bbox for visibility check BEFORE applying inverse
        let bboxLeft = Infinity,
          bboxTop = Infinity,
          bboxRight = -Infinity,
          bboxBottom = -Infinity;
        let hasRef = false;
        for (const ch of entry.changes) {
          if (ch.kind === 'add' && 'node' in ch) {
            // Node will be removed on undo; use its geometry as reference
            const n = ch.node;
            bboxLeft = Math.min(bboxLeft, n.x);
            bboxTop = Math.min(bboxTop, n.y);
            bboxRight = Math.max(bboxRight, n.x + n.width);
            bboxBottom = Math.max(bboxBottom, n.y + n.height);
            hasRef = true;
          } else if (ch.kind === 'remove' && 'node' in ch) {
            // Node will be re-added; use its geometry
            const n = ch.node;
            bboxLeft = Math.min(bboxLeft, n.x);
            bboxTop = Math.min(bboxTop, n.y);
            bboxRight = Math.max(bboxRight, n.x + n.width);
            bboxBottom = Math.max(bboxBottom, n.y + n.height);
            hasRef = true;
          } else if (ch.kind === 'update') {
            // Undo returns to 'before'
            const n = ch.before;
            bboxLeft = Math.min(bboxLeft, n.x);
            bboxTop = Math.min(bboxTop, n.y);
            bboxRight = Math.max(bboxRight, n.x + n.width);
            bboxBottom = Math.max(bboxBottom, n.y + n.height);
            hasRef = true;
          }
        }
        // Check visibility in current camera
        let cam = s.camera;
        if (hasRef) {
          const w = typeof window !== 'undefined' ? window.innerWidth : 0;
          const h = typeof window !== 'undefined' ? window.innerHeight : 0;
          const zoom = cam.zoom || 1;
          const viewLeft = cam.offsetX;
          const viewTop = cam.offsetY;
          const viewRight = viewLeft + w / zoom;
          const viewBottom = viewTop + h / zoom;
          const isOutside =
            bboxRight < viewLeft ||
            bboxLeft > viewRight ||
            bboxBottom < viewTop ||
            bboxTop > viewBottom;
          if (isOutside) {
            const cx = (bboxLeft + bboxRight) / 2;
            const cy = (bboxTop + bboxBottom) / 2;
            cam = { zoom: cam.zoom, offsetX: cx - w / (2 * zoom), offsetY: cy - h / (2 * zoom) };
          }
        }
        // Build new nodes map by applying inverse of changes
        const nodes = { ...s.nodes } as Record<NodeId, Node>;
        for (let i = entry.changes.length - 1; i >= 0; i--) {
          const ch = entry.changes[i];
          if (ch.kind === 'add') {
            delete nodes[ch.node.id];
          } else if (ch.kind === 'remove') {
            nodes[ch.node.id] = ch.node;
          } else if (ch.kind === 'update') {
            nodes[ch.id] = ch.before;
          }
        }
        // Apply inverse of visual group changes
        const visualGroups = { ...s.visualGroups } as Record<string, VisualGroup>;
        if (entry.visualGroupChanges && entry.visualGroupChanges.length > 0) {
          for (let i = entry.visualGroupChanges.length - 1; i >= 0; i--) {
            const gc = entry.visualGroupChanges[i];
            if (gc.kind === 'add') {
              // undo add -> remove group
              delete visualGroups[gc.group.id];
            } else if (gc.kind === 'remove') {
              // undo remove -> add group back
              visualGroups[gc.group.id] = gc.group;
            }
          }
        }
        // Clean selection of non-existing ids
        const nextSel: Record<NodeId, true> = {};
        for (const id of Object.keys(s.selected) as NodeId[]) {
          if (nodes[id]) nextSel[id] = true;
        }
        // Clean group selection/hover if pointing to non-existing groups
        let selectedVisualGroupId = s.selectedVisualGroupId;
        if (selectedVisualGroupId && !visualGroups[selectedVisualGroupId])
          selectedVisualGroupId = null;
        let hoveredVisualGroupId = s.hoveredVisualGroupId;
        if (hoveredVisualGroupId && !visualGroups[hoveredVisualGroupId])
          hoveredVisualGroupId = null;
        let hoveredVisualGroupIdSecondary = s.hoveredVisualGroupIdSecondary;
        if (hoveredVisualGroupIdSecondary && !visualGroups[hoveredVisualGroupIdSecondary])
          hoveredVisualGroupIdSecondary = null;
        // Apply guide changes (if any)
        let guides = s.guides;
        let activeGuideId = s.activeGuideId;
        if (entry.guideChanges) {
          for (let i = entry.guideChanges.length - 1; i >= 0; i--) {
            const gc = entry.guideChanges[i];
            if (gc.kind === 'add') {
              // Undo add: remove the guide
              guides = guides.filter((g) => g.id !== gc.guide.id);
              if (activeGuideId === gc.guide.id) activeGuideId = null;
            } else if (gc.kind === 'remove') {
              // Undo remove: add the guide back
              guides = [...guides, gc.guide];
            } else if (gc.kind === 'clear') {
              // Undo clear: restore all guides
              guides = gc.guides;
            }
          }
        }
        return {
          nodes,
          camera: cam,
          selected: nextSel,
          visualGroups,
          selectedVisualGroupId,
          hoveredVisualGroupId,
          hoveredVisualGroupIdSecondary,
          guides,
          activeGuideId,
          historyPast: past,
          historyFuture: future,
        } as Partial<CanvasStore> as CanvasStore;
      } finally {
        __isReplayingHistory = false;
      }
    }),
  redo: () =>
    set((s) => {
      if (s.historyBatch || s.historyFuture.length === 0)
        return {} as Partial<CanvasStore> as CanvasStore;
      const future = s.historyFuture.slice();
      const entry = future.shift() as HistoryEntry;
      const past = s.historyPast.slice();
      past.push(entry);
      __isReplayingHistory = true;
      try {
        // Determine reference bbox BEFORE applying redo
        let bboxLeft = Infinity,
          bboxTop = Infinity,
          bboxRight = -Infinity,
          bboxBottom = -Infinity;
        let hasRef = false;
        for (const ch of entry.changes) {
          if (ch.kind === 'add') {
            const n = ch.node; // will appear after redo
            bboxLeft = Math.min(bboxLeft, n.x);
            bboxTop = Math.min(bboxTop, n.y);
            bboxRight = Math.max(bboxRight, n.x + n.width);
            bboxBottom = Math.max(bboxBottom, n.y + n.height);
            hasRef = true;
          } else if (ch.kind === 'remove') {
            const n = ch.node; // will disappear after redo; still use its geometry
            bboxLeft = Math.min(bboxLeft, n.x);
            bboxTop = Math.min(bboxTop, n.y);
            bboxRight = Math.max(bboxRight, n.x + n.width);
            bboxBottom = Math.max(bboxBottom, n.y + n.height);
            hasRef = true;
          } else if (ch.kind === 'update') {
            const n = ch.after; // redo applies 'after'
            bboxLeft = Math.min(bboxLeft, n.x);
            bboxTop = Math.min(bboxTop, n.y);
            bboxRight = Math.max(bboxRight, n.x + n.width);
            bboxBottom = Math.max(bboxBottom, n.y + n.height);
            hasRef = true;
          }
        }
        let cam = s.camera;
        if (hasRef) {
          const w = typeof window !== 'undefined' ? window.innerWidth : 0;
          const h = typeof window !== 'undefined' ? window.innerHeight : 0;
          const zoom = cam.zoom || 1;
          const viewLeft = cam.offsetX;
          const viewTop = cam.offsetY;
          const viewRight = viewLeft + w / zoom;
          const viewBottom = viewTop + h / zoom;
          const isOutside =
            bboxRight < viewLeft ||
            bboxLeft > viewRight ||
            bboxBottom < viewTop ||
            bboxTop > viewBottom;
          if (isOutside) {
            const cx = (bboxLeft + bboxRight) / 2;
            const cy = (bboxTop + bboxBottom) / 2;
            cam = { zoom: cam.zoom, offsetX: cx - w / (2 * zoom), offsetY: cy - h / (2 * zoom) };
          }
        }
        // Apply changes
        const nodes = { ...s.nodes } as Record<NodeId, Node>;
        for (const ch of entry.changes) {
          if (ch.kind === 'add') {
            nodes[ch.node.id] = ch.node;
          } else if (ch.kind === 'remove') {
            delete nodes[ch.node.id];
          } else if (ch.kind === 'update') {
            nodes[ch.id] = ch.after;
          }
        }
        // Apply visual group changes forward
        const visualGroups = { ...s.visualGroups } as Record<string, VisualGroup>;
        if (entry.visualGroupChanges && entry.visualGroupChanges.length > 0) {
          for (const gc of entry.visualGroupChanges) {
            if (gc.kind === 'add') {
              visualGroups[gc.group.id] = gc.group;
            } else if (gc.kind === 'remove') {
              delete visualGroups[gc.group.id];
            }
          }
        }
        const nextSel: Record<NodeId, true> = {};
        for (const id of Object.keys(s.selected) as NodeId[]) {
          if (nodes[id]) nextSel[id] = true;
        }
        // Clean group selection/hover if pointing to non-existing groups
        let selectedVisualGroupId = s.selectedVisualGroupId;
        if (selectedVisualGroupId && !visualGroups[selectedVisualGroupId])
          selectedVisualGroupId = null;
        let hoveredVisualGroupId = s.hoveredVisualGroupId;
        if (hoveredVisualGroupId && !visualGroups[hoveredVisualGroupId])
          hoveredVisualGroupId = null;
        let hoveredVisualGroupIdSecondary = s.hoveredVisualGroupIdSecondary;
        if (hoveredVisualGroupIdSecondary && !visualGroups[hoveredVisualGroupIdSecondary])
          hoveredVisualGroupIdSecondary = null;
        // Apply guide changes (if any)
        let guides = s.guides;
        let activeGuideId = s.activeGuideId;
        if (entry.guideChanges) {
          for (const gc of entry.guideChanges) {
            if (gc.kind === 'add') {
              // Redo add: add the guide
              guides = [...guides, gc.guide];
            } else if (gc.kind === 'remove') {
              // Redo remove: remove the guide
              guides = guides.filter((g) => g.id !== gc.guide.id);
              if (activeGuideId === gc.guide.id) activeGuideId = null;
            } else if (gc.kind === 'clear') {
              // Redo clear: clear all guides
              guides = [];
              activeGuideId = null;
            }
          }
        }
        return {
          nodes,
          camera: cam,
          selected: nextSel,
          visualGroups,
          selectedVisualGroupId,
          hoveredVisualGroupId,
          hoveredVisualGroupIdSecondary,
          guides,
          activeGuideId,
          historyPast: past,
          historyFuture: future,
        } as Partial<CanvasStore> as CanvasStore;
      } finally {
        __isReplayingHistory = false;
      }
    }),
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

// Inner-edit selectors/actions
export function useInnerEdit(): NodeId | null {
  return useCanvasStore((s) => s.innerEditNodeId);
}

export function useInnerEditActions(): Pick<CanvasActions, 'enterInnerEdit' | 'exitInnerEdit'> {
  return useCanvasStore((s) => ({
    enterInnerEdit: s.enterInnerEdit,
    exitInnerEdit: s.exitInnerEdit,
  }));
}

// Nodes selectors/actions
export function useNodes(): Node[] {
  return useCanvasStore((s) => Object.values(s.nodes));
}

export function useNode(id: NodeId): Node | undefined {
  return useCanvasStore((s) => s.nodes[id]);
}

export function useNodeActions(): Pick<
  CanvasActions,
  'addNode' | 'addNodeAtCenter' | 'updateNode' | 'removeNode'
> {
  return useCanvasStore((s) => ({
    addNode: s.addNode,
    addNodeAtCenter: s.addNodeAtCenter,
    updateNode: s.updateNode,
    removeNode: s.removeNode,
  }));
}

// Bulk deletion helpers
export function useDeleteActions(): Pick<CanvasActions, 'removeNodes' | 'deleteSelected'> {
  return useCanvasStore((s) => ({
    removeNodes: s.removeNodes,
    deleteSelected: s.deleteSelected,
  }));
}

// Selection selectors/actions
export function useSelectedIds(): NodeId[] {
  return useCanvasStore((s) => Object.keys(s.selected));
}

export function useIsSelected(id: NodeId): boolean {
  return useCanvasStore((s) => Boolean(s.selected[id]));
}

export function useSelectionActions(): Pick<
  CanvasActions,
  'clearSelection' | 'selectOnly' | 'addToSelection' | 'removeFromSelection' | 'toggleInSelection'
> {
  return useCanvasStore((s) => ({
    clearSelection: s.clearSelection,
    selectOnly: s.selectOnly,
    addToSelection: s.addToSelection,
    removeFromSelection: s.removeFromSelection,
    toggleInSelection: s.toggleInSelection,
  }));
}

// DnD actions
export function useDndActions(): Pick<CanvasActions, 'moveSelectedBy'> {
  return useCanvasStore((s) => ({
    moveSelectedBy: s.moveSelectedBy,
  }));
}

// Grouping actions
export function useGroupingActions(): Pick<CanvasActions, 'groupNodes' | 'ungroup'> {
  return useCanvasStore((s) => ({
    groupNodes: s.groupNodes,
    ungroup: s.ungroup,
  }));
}

// History actions
export function useHistoryActions(): Pick<
  CanvasActions,
  'beginHistory' | 'endHistory' | 'undo' | 'redo'
> {
  return useCanvasStore((s) => ({
    beginHistory: s.beginHistory,
    endHistory: s.endHistory,
    undo: s.undo,
    redo: s.redo,
  }));
}

// Clipboard actions/selectors
export function useClipboardActions(): Pick<
  CanvasActions,
  'copySelection' | 'cutSelection' | 'pasteClipboard'
> {
  return useCanvasStore((s) => ({
    copySelection: s.copySelection,
    cutSelection: s.cutSelection,
    pasteClipboard: s.pasteClipboard,
  }));
}

export function useHasClipboard(): boolean {
  return useCanvasStore((s) => Boolean(s.clipboard && s.clipboard.nodes.length > 0));
}

// Rulers/Guides selectors & actions
export function useShowRulers(): boolean {
  return useCanvasStore((s) => s.showRulers);
}

export function useGuides(): Guide[] {
  return useCanvasStore((s) => s.guides);
}

export function useActiveGuideId(): GuideId | null {
  return useCanvasStore((s) => s.activeGuideId);
}

export function useRulersActions(): Pick<
  CanvasActions,
  | 'toggleRulers'
  | 'addGuide'
  | 'moveGuideTemporary'
  | 'moveGuide'
  | 'moveGuideCommit'
  | 'removeGuide'
  | 'clearGuides'
  | 'setActiveGuide'
> {
  return useCanvasStore((s) => ({
    toggleRulers: s.toggleRulers,
    addGuide: s.addGuide,
    moveGuideTemporary: s.moveGuideTemporary,
    moveGuide: s.moveGuide,
    moveGuideCommit: s.moveGuideCommit,
    removeGuide: s.removeGuide,
    clearGuides: s.clearGuides,
    setActiveGuide: s.setActiveGuide,
  }));
}

// Transform & overlay helpers
export function useIsTransforming(): boolean {
  return useCanvasStore((s) => s.isTransforming);
}

export function useActiveEditNodeId(): NodeId | null {
  return useCanvasStore((s) => {
    if (s.innerEditNodeId) return s.innerEditNodeId;
    const ids = Object.keys(s.selected) as NodeId[];
    return ids.length === 1 ? (ids[0] as NodeId) : null;
  });
}

export function useEditBoundingBox(): {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
} | null {
  return useCanvasStore((s) => {
    const active = s.innerEditNodeId;
    const selectedIds = Object.keys(s.selected) as NodeId[];
    const ids: NodeId[] = active
      ? [active]
      : selectedIds.length > 0
        ? (selectedIds as NodeId[])
        : [];
    if (ids.length === 0) return null;
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const id of ids) {
      const n = s.nodes[id];
      if (!n) continue;
      left = Math.min(left, n.x);
      top = Math.min(top, n.y);
      right = Math.max(right, n.x + n.width);
      bottom = Math.max(bottom, n.y + n.height);
    }
    if (
      !Number.isFinite(left) ||
      !Number.isFinite(top) ||
      !Number.isFinite(right) ||
      !Number.isFinite(bottom)
    )
      return null;
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    return { left, top, right, bottom, width, height };
  });
}
