import { create } from 'zustand';
import type { Camera, Point } from '../core/coords';
import type { Node, NodeId } from '../types';
import { applyPan, clampZoom, zoomAtPoint } from '../core/coords';

// History types (nodes and guides; camera and zoom are excluded)
type NodeChange =
  | { kind: 'add'; node: Node }
  | { kind: 'remove'; node: Node }
  | { kind: 'update'; id: NodeId; before: Node; after: Node };

type GuideChange =
  | { kind: 'add'; guide: Guide }
  | { kind: 'remove'; guide: Guide }
  | { kind: 'clear'; guides: Guide[] }
  | { kind: 'setActive'; before: GuideId | null; after: GuideId | null };

type HistoryEntry = {
  label?: string;
  changes: NodeChange[];
  guideChanges?: GuideChange[];
};

// Rulers/Guides UI types (not part of history)
export type GuideId = string;
export type Guide = { id: GuideId; axis: 'x' | 'y'; value: number };

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 2.4;

export type CanvasState = {
  readonly camera: Camera;
  readonly nodes: Record<NodeId, Node>;
  /** Map of selected node IDs for O(1) membership checks. */
  readonly selected: Record<NodeId, true>;
  /** UI: box-select (lasso) is active */
  readonly boxSelecting: boolean;
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
  } | null;
  /** UI: show rulers overlay */
  readonly showRulers: boolean;
  /** UI: collection of guide lines (world-locked) */
  readonly guides: Guide[];
  /** UI: currently active guide (for deletion, highlight) */
  readonly activeGuideId: GuideId | null;
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
  // Rulers/Guides (UI-only, not in history)
  toggleRulers: () => void;
  addGuide: (axis: 'x' | 'y', value: number) => GuideId;
  moveGuideTemporary: (id: GuideId, value: number) => void;
  moveGuide: (id: GuideId, value: number) => void;
  moveGuideCommit: (id: GuideId, fromValue: number, toValue: number) => void;
  removeGuide: (id: GuideId) => void;
  clearGuides: () => void;
  setActiveGuide: (id: GuideId | null) => void;
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
const initialVisualGroups: CanvasState['visualGroups'] = {};
const initialSelectedVisualGroupId: CanvasState['selectedVisualGroupId'] = null;
const initialHoveredVisualGroupId: CanvasState['hoveredVisualGroupId'] = null;
const initialHoveredVisualGroupIdSecondary: CanvasState['hoveredVisualGroupIdSecondary'] = null;
const initialInnerEditNodeId: CanvasState['innerEditNodeId'] = null;
const initialCenterAddIndex = 0;
const initialClipboard: CanvasState['clipboard'] = null;
const initialPasteIndex = 0;
const initialHistoryPast: HistoryEntry[] = [];
const initialHistoryFuture: HistoryEntry[] = [];
const initialShowRulers = true;
const initialGuides: Guide[] = [];
const initialActiveGuideId: GuideId | null = null;
// Guide history is now integrated into main history system

// Internal flag: suppress history recording during undo/redo replay
let __isReplayingHistory = false;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const useCanvasStore = create<CanvasStore>()((set, get) => ({
  camera: initialCamera,
  nodes: initialNodes,
  selected: initialSelected,
  boxSelecting: initialBoxSelecting,
  visualGroups: initialVisualGroups,
  selectedVisualGroupId: initialSelectedVisualGroupId,
  hoveredVisualGroupId: initialHoveredVisualGroupId,
  hoveredVisualGroupIdSecondary: initialHoveredVisualGroupIdSecondary,
  innerEditNodeId: initialInnerEditNodeId,
  centerAddIndex: initialCenterAddIndex,
  clipboard: initialClipboard,
  pasteIndex: initialPasteIndex,
  historyPast: initialHistoryPast,
  historyFuture: initialHistoryFuture,
  historyBatch: null,
  showRulers: initialShowRulers,
  guides: initialGuides,
  activeGuideId: initialActiveGuideId,

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
      let changed = false;
      const nextNodes: Record<NodeId, Node> = { ...s.nodes };
      const updates: { id: NodeId; before: Node; after: Node }[] = [];
      for (const id of toMove) {
        const n = s.nodes[id];
        if (!n) continue;
        const moved = { ...n, x: n.x + dx, y: n.y + dy } as Node;
        nextNodes[id] = moved;
        updates.push({ id, before: n, after: moved });
        changed = true;
      }
      if (!changed) return {} as Partial<CanvasStore> as CanvasStore;
      if (__isReplayingHistory) return { nodes: nextNodes } as Partial<CanvasStore> as CanvasStore;
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

  // Selection
  deleteSelected: () =>
    set(() => {
      const ids = Object.keys(get().selected) as NodeId[];
      if (ids.length === 0) return {} as Partial<CanvasStore> as CanvasStore;
      // Use removeNodes to record history in bulk
      get().removeNodes(ids);
      return { selected: {} } as Partial<CanvasStore> as CanvasStore;
    }),
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
        historyBatch: { label, changes: [], updateIndexById: {} },
      } as Partial<CanvasStore> as CanvasStore;
    }),
  endHistory: () =>
    set((s) => {
      const batch = s.historyBatch;
      if (!batch) return {} as Partial<CanvasStore> as CanvasStore;
      if (batch.changes.length === 0) {
        return { historyBatch: null } as Partial<CanvasStore> as CanvasStore;
      }
      const entry: HistoryEntry = { label: batch.label, changes: batch.changes };
      return {
        historyPast: [...s.historyPast, entry],
        historyFuture: [],
        historyBatch: null,
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
        // Clean selection of non-existing ids
        const nextSel: Record<NodeId, true> = {};
        for (const id of Object.keys(s.selected) as NodeId[]) {
          if (nodes[id]) nextSel[id] = true;
        }
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
        const nextSel: Record<NodeId, true> = {};
        for (const id of Object.keys(s.selected) as NodeId[]) {
          if (nodes[id]) nextSel[id] = true;
        }
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
