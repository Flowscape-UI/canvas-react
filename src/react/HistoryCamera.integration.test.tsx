/* @vitest-environment jsdom */

import React, { useRef, act } from 'react';
import ReactDOM from 'react-dom/client';
import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasNavigation } from './useCanvasNavigation';
import { useCanvasStore } from '../state/store';
import type { CanvasStore } from '../state/store';

function TestHost() {
  const ref = useRef<HTMLDivElement>(null);
  // Mount navigation to simulate a real canvas host; disable zoom shortcuts to avoid warnings/noise
  useCanvasNavigation(ref, {
    panButton: 0,
    panModifier: 'none',
    wheelZoom: false,
    doubleClickZoom: false,
  });
  return <div data-rc-canvas ref={ref} style={{ width: 800, height: 600 }} />;
}

async function render(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  // wait microtask + macrotask to allow effects to mount
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  return {
    container,
    root,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

function resetStore() {
  useCanvasStore.setState({
    camera: { zoom: 1, offsetX: 0, offsetY: 0 },
    nodes: {},
    selected: {},
    centerAddIndex: 0,
    historyPast: [],
    historyFuture: [],
    historyBatch: null,
  } as Partial<CanvasStore>);
}

describe('React integration: undo re-add recenters camera when node is off-screen', () => {
  beforeEach(() => {
    resetStore();
    // Ensure viewport size is deterministic for camera centering logic
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
    // Some React DOM codepaths check global Window constructor; provide a fallback in jsdom
    if (!(globalThis as unknown as { Window?: unknown }).Window) {
      (globalThis as unknown as { Window: unknown }).Window = (window as unknown as { constructor: unknown }).constructor;
    }
  });

  it('recenters viewport to re-added node bbox center on undo remove', async () => {
    const { unmount } = await render(<TestHost />);

    // Arrange: add node at origin, pan far away so it is off-screen, then remove
    useCanvasStore.getState().addNode({ id: 'ri1', x: 0, y: 0, width: 100, height: 60 });
    useCanvasStore.getState().panBy(5000, 5000);
    useCanvasStore.getState().removeNode('ri1');

    // Act: undo -> should re-add and center camera to node bbox
    useCanvasStore.getState().undo();

    const s = useCanvasStore.getState();
    expect(s.nodes['ri1']).toBeDefined();
    // With zoom=1 and window 800x600, center of node (50,30) -> offset should be -350,-270
    expect(s.camera.offsetX).toBeCloseTo(-350, 6);
    expect(s.camera.offsetY).toBeCloseTo(-270, 6);

    await unmount();
  });
});
