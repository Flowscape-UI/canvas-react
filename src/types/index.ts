export type NodeId = string;

export type Node = {
  id: NodeId;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation in degrees, clockwise. Defaults to 0 when omitted. */
  rotation?: number;
  /** Corner radius: either uniform number or per-corner radii. Defaults to 0 when omitted. */
  cornerRadius?: number | { tl: number; tr: number; br: number; bl: number };
  /**
   * Optional logical parent for grouping. If set, this node is considered a child of `parentId`.
   * Invariants:
   *  - parent chain must be acyclic (no cycles)
   *  - `parentId` references an existing node id when non-null
   *  - `parentId` must not equal this node's id
   *
   * MVP note: groups are logical only (no container geometry). Moving a parent moves all descendants.
   */
  parentId?: NodeId | null;
};
