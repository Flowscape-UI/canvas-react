import { useRef } from 'react';
import type { RefObject } from 'react';
import { screenToWorld } from '../core/coords';
import { useCamera, useNodeActions } from '../state/store';
import type { Node, NodeId } from '../types';

export type AddNodeAtCenterInput = {
  id: NodeId;
  width: number;
  height: number;
  // Optional patch to extend Node in future
  data?: Partial<Node>;
};

export type AddAtCenterOptions = {
  stepPx?: number; // screen px per step
  modulo?: number; // wrap steps to avoid drifting too far
};

/**
 * React helpers bound to a specific Canvas root element.
 * Provides addNodeAtCenter() that places nodes at the visual center regardless of zoom,
 * with a small diagonal offset for subsequent nodes.
 */
export function useCanvasHelpers(rootRef: RefObject<HTMLElement>, options?: AddAtCenterOptions) {
  const camera = useCamera();
  const { addNode } = useNodeActions();
  const offsetIndexRef = useRef(0);
  const stepPx = options?.stepPx ?? 16;
  const modulo = options?.modulo ?? 12;

  function getWorldCenter() {
    const root = rootRef.current;
    if (root) {
      const r = root.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      return screenToWorld({ x: cx, y: cy }, camera);
    }
    // Fallback: viewport center
    const cx = typeof window !== 'undefined' ? window.innerWidth / 2 : 0;
    const cy = typeof window !== 'undefined' ? window.innerHeight / 2 : 0;
    return screenToWorld({ x: cx, y: cy }, camera);
  }

  function addNodeAtCenter(input: AddNodeAtCenterInput) {
    const centerWorld = getWorldCenter();
    const k = offsetIndexRef.current % modulo;
    const dxWorld = (k * stepPx) / camera.zoom;
    const dyWorld = (k * stepPx) / camera.zoom;
    const x = centerWorld.x - input.width / 2 + dxWorld;
    const y = centerWorld.y - input.height / 2 + dyWorld;
    addNode({ id: input.id, x, y, width: input.width, height: input.height });
    offsetIndexRef.current += 1;
  }

  function resetCenterOffset() {
    offsetIndexRef.current = 0;
  }

  return { addNodeAtCenter, resetCenterOffset };
}
