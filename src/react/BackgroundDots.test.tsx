/* @vitest-environment jsdom */

import React, { act } from 'react';
import ReactDOM from 'react-dom/client';
import { describe, it, expect, beforeEach } from 'vitest';
import { BackgroundDots } from './BackgroundDots';
import { useCanvasStore } from '../state/store';

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

// Reset camera before each test
beforeEach(() => {
  useCanvasStore.getState().setCamera({ zoom: 1, offsetX: 0, offsetY: 0 });
});

describe('BackgroundDots (world-locked, smooth)', () => {
  it('keeps backgroundPosition constant while backgroundSize scales with zoom', async () => {
    const { container, unmount } = await render(<BackgroundDots size={24} />);
    const el = container.firstElementChild as HTMLDivElement;
    expect(el).toBeTruthy();

    // Initial state: zoom=1
    expect(el.style.backgroundPosition).toBe('0px 0px');
    expect(el.style.backgroundSize).toBe('24px 24px');

    // Zoom to 1.5
    await act(async () => {
      useCanvasStore.getState().setCamera({ zoom: 1.5, offsetX: 0, offsetY: 0 });
    });

    // Position remains fixed, size updates (24 * 1.5 = 36)
    expect(el.style.backgroundPosition).toBe('0px 0px');
    expect(el.style.backgroundSize).toBe('36px 36px');

    unmount();
  });

  it('moves phase with pan and scales phase smoothly with zoom (no jitter)', async () => {
    const size = 24;
    const { container, unmount } = await render(<BackgroundDots size={size} />);
    const el = container.firstElementChild as HTMLDivElement;

    const mod = (a: number, n: number) => ((a % n) + n) % n;

    // Apply pan at zoom=1
    await act(async () => {
      useCanvasStore.getState().setCamera({ zoom: 1, offsetX: 30, offsetY: 10 });
    });
    // scaled = 24, off = mod(-offset*zoom, scaled)
    expect(el.style.backgroundSize).toBe('24px 24px');
    expect(el.style.backgroundPosition).toBe(`${mod(-30, 24)}px ${mod(-10, 24)}px`);

    // Increase zoom to 1.5: scaled = 36, phase recomputed smoothly
    await act(async () => {
      useCanvasStore.getState().setCamera({ zoom: 1.5, offsetX: 30, offsetY: 10 });
    });
    expect(el.style.backgroundSize).toBe('36px 36px');
    expect(el.style.backgroundPosition).toBe(`${mod(-30 * 1.5, 36)}px ${mod(-10 * 1.5, 36)}px`);

    // The ratio off/zoom remains constant for fixed offsets (sanity check of smoothness)
    const off1x = mod(-30, 24);
    const off2x = mod(-45, 36);
    expect(off2x / 1.5).toBeCloseTo(off1x / 1, 6);

    unmount();
  });
});
