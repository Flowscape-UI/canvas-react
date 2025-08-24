/* @vitest-environment jsdom */

import React, { act } from 'react';
import ReactDOM from 'react-dom/client';
import { describe, it, expect, beforeEach } from 'vitest';
import { GroupContainersLayer } from './GroupContainersLayer';
import { useCanvasStore } from '../state/store';
import type { Node } from '../types';

// Polyfill PointerEvent for jsdom if missing
type PointerEventCtor = { new (type: string, eventInitDict?: PointerEventInit): PointerEvent };
const g = globalThis as unknown as { PointerEvent?: PointerEventCtor };
if (typeof g.PointerEvent === 'undefined') {
  class FakePointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  }
  g.PointerEvent = FakePointerEvent as unknown as PointerEventCtor;
}

async function render(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  await Promise.resolve();
  return { container, root, unmount: () => root.unmount() };
}

function add(n: Node) {
  useCanvasStore.getState().addNode(n);
}

describe('GroupContainersLayer', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      camera: { zoom: 1, offsetX: 0, offsetY: 0 },
      nodes: {},
      selected: {},
      visualGroups: {},
      selectedVisualGroupId: null,
      centerAddIndex: 0,
      historyPast: [],
      historyFuture: [],
      historyBatch: null,
    });
  });

  it('renders containers for visual groups with correct bbox (including nested-like cases)', async () => {
    // Nodes
    add({ id: 'P', x: 0, y: 0, width: 80, height: 40 });
    add({ id: 'c1', x: 120, y: 20, width: 60, height: 30 });
    add({ id: 'c2', x: 40, y: 120, width: 50, height: 50 });
    add({ id: 'g1', x: 160, y: 40, width: 30, height: 30 });
    // Create two visual groups analogous to parentId-based roots:
    // G-P: members [P, c1, c2, g1]; G-c1: members [c1, g1]
    useCanvasStore.setState((s) => ({
      ...s,
      visualGroups: {
        'G-P': { id: 'G-P', members: ['P', 'c1', 'c2', 'g1'] },
        'G-c1': { id: 'G-c1', members: ['c1', 'g1'] },
      },
    }));

    const { container, unmount } = await render(<GroupContainersLayer />);

    const containers = container.querySelectorAll<HTMLElement>('[data-testid="group-container"]');
    expect(containers.length).toBe(2);

    const getByGroup = (gid: string) =>
      Array.from(containers).find((el) => el.getAttribute('data-parent-id') === gid)!;

    const PAD = 8; // at zoom=1

    // For G-P: bbox over P, c1, c2, g1
    const p = getByGroup('G-P');
    expect(p).toBeTruthy();
    const leftP = Math.min(0, 120, 40, 160) - PAD;
    const topP = Math.min(0, 20, 120, 40) - PAD;
    const rightP = Math.max(0 + 80, 120 + 60, 40 + 50, 160 + 30) + PAD;
    const bottomP = Math.max(0 + 40, 20 + 30, 120 + 50, 40 + 30) + PAD;
    const widthP = rightP - leftP;
    const heightP = bottomP - topP;
    expect(p.style.left).toBe(`${leftP}px`);
    expect(p.style.top).toBe(`${topP}px`);
    expect(p.style.width).toBe(`${widthP}px`);
    expect(p.style.height).toBe(`${heightP}px`);

    // For G-c1: bbox over c1 + g1
    const c1 = getByGroup('G-c1');
    expect(c1).toBeTruthy();
    const leftC1 = Math.min(120, 160) - PAD;
    const topC1 = Math.min(20, 40) - PAD;
    const rightC1 = Math.max(120 + 60, 160 + 30) + PAD;
    const bottomC1 = Math.max(20 + 30, 40 + 30) + PAD;
    const widthC1 = rightC1 - leftC1;
    const heightC1 = bottomC1 - topC1;
    expect(c1.style.left).toBe(`${leftC1}px`);
    expect(c1.style.top).toBe(`${topC1}px`);
    expect(c1.style.width).toBe(`${widthC1}px`);
    expect(c1.style.height).toBe(`${heightC1}px`);

    unmount();
  });

  it('applies fixed 8px padding regardless of zoom (converted to world units)', async () => {
    // Setup: group G-R with members R and C
    add({ id: 'R', x: 10, y: 20, width: 40, height: 20 });
    add({ id: 'C', x: 70, y: 40, width: 30, height: 30 });
    useCanvasStore.setState((s) => ({
      ...s,
      camera: { ...s.camera, zoom: 2 },
      visualGroups: { 'G-R': { id: 'G-R', members: ['R', 'C'] } },
    }));

    const { container, unmount } = await render(<GroupContainersLayer />);
    const el = container.querySelector('[data-parent-id="G-R"]') as HTMLElement;
    expect(el).toBeTruthy();
    const PAD = 8 / 2; // 4 world units

    const left = Math.min(10, 70) - PAD;
    const top = Math.min(20, 40) - PAD;
    const right = Math.max(10 + 40, 70 + 30) + PAD;
    const bottom = Math.max(20 + 20, 40 + 30) + PAD;
    const width = right - left;
    const height = bottom - top;
    expect(el.style.left).toBe(`${left}px`);
    expect(el.style.top).toBe(`${top}px`);
    expect(el.style.width).toBe(`${width}px`);
    expect(el.style.height).toBe(`${height}px`);
    unmount();
  });

  it('click on frame selects visual group; drag moves whole group members', async () => {
    // Layout
    add({ id: 'P', x: 0, y: 0, width: 40, height: 40 });
    add({ id: 'c1', x: 60, y: 0, width: 30, height: 30 });
    add({ id: 'c2', x: 0, y: 60, width: 20, height: 20 });
    useCanvasStore.setState((s) => ({
      ...s,
      visualGroups: { 'G-P': { id: 'G-P', members: ['P', 'c1', 'c2'] } },
    }));

    const { container, unmount } = await render(<GroupContainersLayer />);
    const hit = container.querySelector(
      '[data-parent-id="G-P"] [data-testid="group-container-hit"]',
    ) as SVGRectElement;
    expect(hit).toBeTruthy();

    // Plain click -> selects visual group
    hit.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 5, clientY: 5 }),
    );
    hit.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: 5, clientY: 5 }),
    );
    expect(useCanvasStore.getState().selectedVisualGroupId).toBe('G-P');

    // Start drag: exceed threshold and move by 10,15 screen px at zoom=1
    hit.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, clientY: 0 }),
    );
    hit.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 5, clientY: 5 })); // under threshold
    hit.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: 15 })); // start drag
    hit.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: 10, clientY: 15 }),
    );

    const s = useCanvasStore.getState();
    expect(s.nodes['P']).toMatchObject({ x: 10, y: 15 });
    expect(s.nodes['c1']).toMatchObject({ x: 70, y: 15 });
    expect(s.nodes['c2']).toMatchObject({ x: 10, y: 75 });

    unmount();
  });
});
