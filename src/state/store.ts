import { create } from 'zustand';
import type { Camera, Point } from '../core/coords';
import type { Node, NodeId } from '../types';
import { applyPan, clampZoom, zoomAtPoint } from '../core/coords';

// History types (nodes + camera pan; zoom is intentionally excluded)
type NodeChange =
  | { kind: 'add'; node: Node }
  | { kind: 'remove'; node: Node }
  | { kind: 'update'; id: NodeId; before: Node; after: Node }
  | { kind: 'cameraMove'; dx: number; dy: number };

type HistoryEntry = {
  label?: string;
  changes: NodeChange[];
};

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 2.4;

export type CanvasState = {
  readonly camera: Camera;
  readonly nodes: Record<NodeId, Node>;
  /** Map of selected node IDs for O(1) membership checks. */
  readonly selected: Record<NodeId, true>;
  /** Internal counter for add-at-center offset progression. */
  readonly centerAddIndex: number;
  /** History stacks (nodes-only). */
  readonly historyPast: HistoryEntry[];
  readonly historyFuture: HistoryEntry[];
  /** Active batch for coalescing changes (e.g., drag). */
  readonly historyBatch: {
    label?: string;
    changes: NodeChange[];
    updateIndexById: Record<NodeId, number>;
    /** Index of coalesced cameraMove within changes, if any */
    cameraMoveIndex?: number;
  } | null;
};

export type CanvasActions = {
  setCamera: (camera: Camera) => void;
  panBy: (dx: number, dy: number) => void;
  zoomTo: (zoom: number) => void;
  /** Zoom by factor centered at screenPoint (screen coords in px). */
  zoomByAt: (screenPoint: Point, factor: number) => void;
  // Nodes CRUD
  addNode: (node: Node) => void;
  /** Add node at the visible center regardless of zoom, with slight diagonal offset per call. */
  addNodeAtCenter: (node: Pick<Node, 'id' | 'width' | 'height'>) => void;
  updateNode: (id: NodeId, patch: Partial<Node>) => void;
  removeNode: (id: NodeId) => void;
  /** Remove multiple nodes at once. */
  removeNodes: (ids: NodeId[]) => void;
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
const initialCenterAddIndex = 0;
const initialHistoryPast: HistoryEntry[] = [];
const initialHistoryFuture: HistoryEntry[] = [];

// Internal flag: suppress history recording during undo/redo replay
let __isReplayingHistory = false;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const useCanvasStore = create<CanvasStore>()((set, get) => ({
  camera: initialCamera,
  nodes: initialNodes,
  selected: initialSelected,
  centerAddIndex: initialCenterAddIndex,
  historyPast: initialHistoryPast,
  historyFuture: initialHistoryFuture,
  historyBatch: null,

  setCamera: (camera) => set({ camera }),

  panBy: (dx, dy) =>
    set((s) => {
      const nextCamera = applyPan(s.camera, dx, dy);
      if (__isReplayingHistory) return { camera: nextCamera } as Partial<CanvasStore> as CanvasStore;
      if (s.historyBatch) {
        const batch = s.historyBatch;
        const idx = batch.cameraMoveIndex;
        if (idx == null) {
          const newChanges = [...batch.changes, { kind: 'cameraMove', dx, dy } as NodeChange];
          return {
            camera: nextCamera,
            historyBatch: { ...batch, changes: newChanges, cameraMoveIndex: newChanges.length - 1 },
          } as Partial<CanvasStore> as CanvasStore;
        } else {
          const newChanges = batch.changes.slice();
          const prev = newChanges[idx] as Extract<NodeChange, { kind: 'cameraMove' }>;
          newChanges[idx] = { kind: 'cameraMove', dx: prev.dx + dx, dy: prev.dy + dy };
          return {
            camera: nextCamera,
            historyBatch: { ...batch, changes: newChanges },
          } as Partial<CanvasStore> as CanvasStore;
        }
      }
      const entry: HistoryEntry = { changes: [{ kind: 'cameraMove', dx, dy }] };
      return {
        camera: nextCamera,
        historyPast: [...s.historyPast, entry],
        historyFuture: [],
      } as Partial<CanvasStore> as CanvasStore;
    }),

  zoomTo: (zoom) =>
    set((s) => ({
      camera: { ...s.camera, zoom: clampZoom(zoom, MIN_ZOOM, MAX_ZOOM) },
    })),

  zoomByAt: (screenPoint, factor) =>
    set((s) => ({ camera: zoomAtPoint(s.camera, screenPoint, factor, MIN_ZOOM, MAX_ZOOM) })),

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
          const newChanges = [...batch.changes, { kind: 'update', id, before: current, after: updated } as NodeChange];
          const newMap = { ...batch.updateIndexById, [id]: newIdx } as Record<NodeId, number>;
          return { nodes: nextNodes, historyBatch: { ...batch, changes: newChanges, updateIndexById: newMap } } as Partial<CanvasStore> as CanvasStore;
        } else {
          const newChanges = batch.changes.slice();
          const prev = newChanges[idx] as Extract<NodeChange, { kind: 'update' }>;
          newChanges[idx] = { kind: 'update', id, before: prev.kind === 'update' ? prev.before : current, after: updated } as NodeChange;
          return { nodes: nextNodes, historyBatch: { ...batch, changes: newChanges } } as Partial<CanvasStore> as CanvasStore;
        }
      }
      const entry: HistoryEntry = { changes: [{ kind: 'update', id, before: current, after: updated }] };
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
      // also remove from selection if present
      if (s.selected[id]) {
        const sel = { ...s.selected };
        delete sel[id];
        if (!__isReplayingHistory) {
          if (s.historyBatch) {
            const batch = s.historyBatch;
            return {
              nodes: next,
              selected: sel,
              historyBatch: { ...batch, changes: [...batch.changes, { kind: 'remove', node: removed }] },
            } as Partial<CanvasStore> as CanvasStore;
          }
          const entry: HistoryEntry = { changes: [{ kind: 'remove', node: removed }] };
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
          return { nodes: next, historyBatch: { ...batch, changes: [...batch.changes, { kind: 'remove', node: removed }] } } as Partial<CanvasStore> as CanvasStore;
        }
        const entry: HistoryEntry = { changes: [{ kind: 'remove', node: removed }] };
        return { nodes: next, historyPast: [...s.historyPast, entry], historyFuture: [] } as Partial<CanvasStore> as CanvasStore;
      }
      return { nodes: next } as Partial<CanvasStore> as CanvasStore;
    }),
  removeNodes: (ids) =>
    set((s) => {
      if (!ids || ids.length === 0) return {} as Partial<CanvasStore> as CanvasStore;
      let changed = false;
      const nextNodes: Record<NodeId, Node> = { ...s.nodes };
      const removedList: Node[] = [];
      for (const id of ids) {
        if (nextNodes[id]) {
          removedList.push(nextNodes[id]);
          delete nextNodes[id];
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
      if (__isReplayingHistory) {
        return selChanged
          ? ({ nodes: nextNodes, selected: nextSel } as Partial<CanvasStore> as CanvasStore)
          : ({ nodes: nextNodes } as Partial<CanvasStore> as CanvasStore);
      }
      if (s.historyBatch) {
        const batch = s.historyBatch;
        const removeChanges = removedList.map((n) => ({ kind: 'remove', node: n } as NodeChange));
        const newBatch = { ...batch, changes: [...batch.changes, ...removeChanges] };
        return selChanged
          ? ({ nodes: nextNodes, selected: nextSel, historyBatch: newBatch } as Partial<CanvasStore> as CanvasStore)
          : ({ nodes: nextNodes, historyBatch: newBatch } as Partial<CanvasStore> as CanvasStore);
      }
      const entry: HistoryEntry = { changes: removedList.map((n) => ({ kind: 'remove', node: n })) };
      return selChanged
        ? ({ nodes: nextNodes, selected: nextSel, historyPast: [...s.historyPast, entry], historyFuture: [] } as Partial<CanvasStore> as CanvasStore)
        : ({ nodes: nextNodes, historyPast: [...s.historyPast, entry], historyFuture: [] } as Partial<CanvasStore> as CanvasStore);
    }),
  moveSelectedBy: (dx, dy) =>
    set((s) => {
      if (dx === 0 && dy === 0) return {} as Partial<CanvasStore> as CanvasStore;
      const selIds = Object.keys(s.selected) as NodeId[];
      if (selIds.length === 0) return {} as Partial<CanvasStore> as CanvasStore;
      let changed = false;
      const nextNodes: Record<NodeId, Node> = { ...s.nodes };
      const updates: { id: NodeId; before: Node; after: Node }[] = [];
      for (const id of selIds) {
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
        return { nodes: nextNodes, historyBatch: { ...batch, changes: newChanges, updateIndexById: newMap } } as Partial<CanvasStore> as CanvasStore;
      }
      const entry: HistoryEntry = { changes: updates.map((u) => ({ kind: 'update', id: u.id, before: u.before, after: u.after })) };
      return { nodes: nextNodes, historyPast: [...s.historyPast, entry], historyFuture: [] } as Partial<CanvasStore> as CanvasStore;
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

  // --- History actions ---
  beginHistory: (label) =>
    set((s) => {
      if (s.historyBatch) return {} as Partial<CanvasStore> as CanvasStore;
      return {
        historyBatch: { label, changes: [], updateIndexById: {}, cameraMoveIndex: undefined },
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
      if (s.historyBatch || s.historyPast.length === 0) return {} as Partial<CanvasStore> as CanvasStore;
      const past = s.historyPast.slice();
      const entry = past.pop() as HistoryEntry;
      const future = s.historyFuture.slice();
      future.unshift(entry);
      // Apply inverse of entry
      __isReplayingHistory = true;
      try {
        // Build new nodes map and camera by applying inverse of changes
        const nodes = { ...s.nodes } as Record<NodeId, Node>;
        let cam = s.camera;
        for (let i = entry.changes.length - 1; i >= 0; i--) {
          const ch = entry.changes[i];
          if (ch.kind === 'add') {
            delete nodes[ch.node.id];
          } else if (ch.kind === 'remove') {
            nodes[ch.node.id] = ch.node;
          } else if (ch.kind === 'update') {
            nodes[ch.id] = ch.before;
          } else if (ch.kind === 'cameraMove') {
            cam = applyPan(cam, -ch.dx, -ch.dy);
          }
        }
        // Clean selection of non-existing ids
        const nextSel: Record<NodeId, true> = {};
        for (const id of Object.keys(s.selected) as NodeId[]) {
          if (nodes[id]) nextSel[id] = true;
        }
        return {
          nodes,
          camera: cam,
          selected: nextSel,
          historyPast: past,
          historyFuture: future,
        } as Partial<CanvasStore> as CanvasStore;
      } finally {
        __isReplayingHistory = false;
      }
    }),
  redo: () =>
    set((s) => {
      if (s.historyBatch || s.historyFuture.length === 0) return {} as Partial<CanvasStore> as CanvasStore;
      const future = s.historyFuture.slice();
      const entry = future.shift() as HistoryEntry;
      const past = s.historyPast.slice();
      past.push(entry);
      __isReplayingHistory = true;
      try {
        const nodes = { ...s.nodes } as Record<NodeId, Node>;
        let cam = s.camera;
        for (const ch of entry.changes) {
          if (ch.kind === 'add') {
            nodes[ch.node.id] = ch.node;
          } else if (ch.kind === 'remove') {
            delete nodes[ch.node.id];
          } else if (ch.kind === 'update') {
            nodes[ch.id] = ch.after;
          } else if (ch.kind === 'cameraMove') {
            cam = applyPan(cam, ch.dx, ch.dy);
          }
        }
        const nextSel: Record<NodeId, true> = {};
        for (const id of Object.keys(s.selected) as NodeId[]) {
          if (nodes[id]) nextSel[id] = true;
        }
        return {
          nodes,
          camera: cam,
          selected: nextSel,
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

// History actions
export function useHistoryActions(): Pick<CanvasActions, 'beginHistory' | 'endHistory' | 'undo' | 'redo'> {
  return useCanvasStore((s) => ({
    beginHistory: s.beginHistory,
    endHistory: s.endHistory,
    undo: s.undo,
    redo: s.redo,
  }));
}
