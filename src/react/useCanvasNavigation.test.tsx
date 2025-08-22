/* @vitest-environment jsdom */

import React, { useRef, act } from 'react';
import ReactDOM from 'react-dom/client';
import { describe, it, expect, beforeEach } from 'vitest';
import { useCanvasNavigation } from './useCanvasNavigation';
import { useCanvasStore } from '../state/store';

function TestHost(props: {
  options?: Parameters<typeof useCanvasNavigation>[1];
  withInput?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useCanvasNavigation(ref, props.options);

  return (
    <div
      data-testid="canvas"
      ref={ref}
      // width/height for getBoundingClientRect() stubbing if needed
      style={{ width: '800px', height: '600px' }}
    >
      {props.withInput ? <input data-testid="inner-input" /> : null}
    </div>
  );
}

async function render(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  // microtask to ensure useEffect ran
  await Promise.resolve();
  return { container, root, unmount: () => root.unmount() };
}

function dispatchKey(el: Element, key: string, code?: string, init?: KeyboardEventInit) {
  const ev = new KeyboardEvent('keydown', {
    key,
    code,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  el.dispatchEvent(ev);
}

function dispatchWheel(el: Element, init: WheelEventInit) {
  const ev = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaMode: 0,
    deltaX: 0,
    deltaY: 0,
    clientX: 100,
    clientY: 100,
    ...init,
  });
  el.dispatchEvent(ev);
}

// Reset camera before each test
beforeEach(() => {
  useCanvasStore.getState().setCamera({ zoom: 1, offsetX: 0, offsetY: 0 });
});

describe('useCanvasNavigation keyboard', () => {
  it('pans with WASD/Arrow keys using base step', async () => {
    const { container, unmount } = await render(
      <TestHost
        options={{
          keyboardPan: true,
          keyboardPanStep: 10,
          keyboardPanSlowStep: 5,
          wheelZoom: false,
          doubleClickZoom: false,
        }}
      />,
    );

    const el = container.querySelector('[data-testid="canvas"]')! as HTMLDivElement;

    // Left (A): dxScreen = +step => panBy(-step, 0) => offsetX -= 10
    dispatchKey(el, 'a');
    expect(useCanvasStore.getState().camera.offsetX).toBe(-10);

    // Right (D): dxScreen = -step => panBy(+step, 0) => offsetX += 10
    dispatchKey(el, 'd');
    expect(useCanvasStore.getState().camera.offsetX).toBe(0);

    // Up (W): dyScreen = +step => panBy(0, -step) => offsetY -= 10
    dispatchKey(el, 'w');
    expect(useCanvasStore.getState().camera.offsetY).toBe(-10);

    // Down (S): dyScreen = -step => panBy(0, +step) => offsetY += 10
    dispatchKey(el, 's');
    expect(useCanvasStore.getState().camera.offsetY).toBe(0);

    unmount();
  });

  it('uses slow step when holding Shift', async () => {
    const { container, unmount } = await render(
      <TestHost
        options={{
          keyboardPan: true,
          keyboardPanStep: 10,
          keyboardPanSlowStep: 5,
          wheelZoom: false,
          doubleClickZoom: false,
        }}
      />,
    );

    const el = container.querySelector('[data-testid="canvas"]')! as HTMLDivElement;
    // Reset offsets
    useCanvasStore.getState().setCamera({ zoom: 1, offsetX: 0, offsetY: 0 });

    // Shift + A => offsetX -= 5
    dispatchKey(el, 'a', undefined, { shiftKey: true });
    expect(useCanvasStore.getState().camera.offsetX).toBe(-5);

    // Shift + W => offsetY -= 5
    dispatchKey(el, 'w', undefined, { shiftKey: true });
    expect(useCanvasStore.getState().camera.offsetY).toBe(-5);

    unmount();
  });

  it("zooms with '+' key around canvas center", async () => {
    const { container, unmount } = await render(
      <TestHost options={{ keyboardPan: true, wheelZoom: false, doubleClickZoom: false }} />,
    );

    const el = container.querySelector('[data-testid="canvas"]')! as HTMLDivElement;

    // Stub getBoundingClientRect to return non-zero size
    const rect = {
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON() {},
    } as DOMRect;
    const originalGetBCR = el.getBoundingClientRect.bind(el);
    el.getBoundingClientRect = () => rect;

    // initial zoom
    expect(useCanvasStore.getState().camera.zoom).toBe(1);

    // Press '+' (Equal)
    dispatchKey(el, '+', 'Equal');

    expect(useCanvasStore.getState().camera.zoom).toBeCloseTo(1.1, 5);

    // restore
    el.getBoundingClientRect = originalGetBCR;
    unmount();
  });

  it('ignores key events originating from inputs/contenteditable', async () => {
    const { container, unmount } = await render(
      <TestHost options={{ keyboardPan: true, keyboardPanStep: 10 }} withInput />,
    );

    const canvas = container.querySelector('[data-testid="canvas"]')! as HTMLDivElement;
    const input = container.querySelector('[data-testid="inner-input"]')! as HTMLInputElement;

    useCanvasStore.getState().setCamera({ zoom: 1, offsetX: 0, offsetY: 0 });

    // Dispatch on input (bubbles to canvas), but handler should early-return
    dispatchKey(input, 'a');
    expect(useCanvasStore.getState().camera.offsetX).toBe(0);

    // Dispatch on canvas to verify it still works
    dispatchKey(canvas, 'a');
    expect(useCanvasStore.getState().camera.offsetX).toBe(-10);

    unmount();
  });
});

describe('useCanvasNavigation wheel / touchpad', () => {
  beforeEach(() => {
    useCanvasStore.getState().setCamera({ zoom: 1, offsetX: 0, offsetY: 0 });
  });

  it('pans with two-finger touchpad scroll (deltaMode: pixels, moderate deltas)', async () => {
    const { container, unmount } = await render(<TestHost />);
    const el = container.querySelector('[data-testid="canvas"]')! as HTMLDivElement;

    // Start fresh
    useCanvasStore.getState().setCamera({ zoom: 1, offsetX: 0, offsetY: 0 });

    // Simulate touchpad two-finger scroll: pixel deltas, moderate magnitude
    dispatchWheel(el, { deltaMode: 0, deltaX: 30, deltaY: 10, ctrlKey: false });

    const cam = useCanvasStore.getState().camera;
    expect(cam.offsetX).toBe(30);
    expect(cam.offsetY).toBe(10);

    unmount();
  });

  it('touchpad pan ignores wheelModifier (still pans without modifiers)', async () => {
    const { container, unmount } = await render(<TestHost options={{ wheelModifier: 'ctrl' }} />);
    const el = container.querySelector('[data-testid="canvas"]')! as HTMLDivElement;

    useCanvasStore.getState().setCamera({ zoom: 1, offsetX: 0, offsetY: 0 });
    // No ctrl pressed, but should still pan because it is touchpad scroll
    dispatchWheel(el, { deltaMode: 0, deltaX: -20, deltaY: 15, ctrlKey: false });

    const cam = useCanvasStore.getState().camera;
    expect(cam.offsetX).toBe(-20);
    expect(cam.offsetY).toBe(15);

    unmount();
  });

  it('pinch on touchpad (ctrl+wheel) still zooms', async () => {
    const { container, unmount } = await render(<TestHost />);
    const el = container.querySelector('[data-testid="canvas"]')! as HTMLDivElement;

    useCanvasStore.getState().setCamera({ zoom: 1, offsetX: 0, offsetY: 0 });

    // ctrl+wheel with negative deltaY -> zoom in
    dispatchWheel(el, { ctrlKey: true, deltaY: -100, deltaMode: 0 });

    const cam = useCanvasStore.getState().camera;
    expect(cam.zoom).toBeCloseTo(Math.exp(0.15), 4); // sensitivity 0.0015 => exp(0.15)

    unmount();
  });

  it('mouse wheel (deltaMode: lines) pans vertically by default', async () => {
    const { container, unmount } = await render(<TestHost />);
    const el = container.querySelector('[data-testid="canvas"]')! as HTMLDivElement;

    useCanvasStore.getState().setCamera({ zoom: 1, offsetX: 0, offsetY: 0 });

    // Wheel up (deltaY negative) => vertical pan
    dispatchWheel(el, { deltaMode: 1, deltaY: -3, ctrlKey: false });

    const cam = useCanvasStore.getState().camera;
    expect(cam.offsetX).toBe(0);
    expect(cam.offsetY).toBe(3);

    unmount();
  });

  it('mouse wheel with Shift pans horizontally', async () => {
    const { container, unmount } = await render(<TestHost />);
    const el = container.querySelector('[data-testid="canvas"]')! as HTMLDivElement;

    useCanvasStore.getState().setCamera({ zoom: 1, offsetX: 0, offsetY: 0 });

    // Shift + wheel up (deltaY negative) => horizontal pan to the right
    dispatchWheel(el, { deltaMode: 1, deltaY: -5, shiftKey: true, ctrlKey: false });

    const cam = useCanvasStore.getState().camera;
    expect(cam.offsetX).toBe(5);
    expect(cam.offsetY).toBe(0);

    unmount();
  });

  it('mouse ctrl+wheel zooms (legacy gesture for mouse)', async () => {
    const { container, unmount } = await render(<TestHost />);
    const el = container.querySelector('[data-testid="canvas"]')! as HTMLDivElement;

    useCanvasStore.getState().setCamera({ zoom: 1, offsetX: 0, offsetY: 0 });

    // Ctrl + wheel up (deltaY negative) => zoom in
    dispatchWheel(el, { deltaMode: 1, deltaY: -3, ctrlKey: true });

    const cam = useCanvasStore.getState().camera;
    expect(cam.zoom).toBeCloseTo(Math.exp(0.0015 * 3), 6);

    unmount();
  });

  it('applies touchpadPanScale to two-finger pan deltas', async () => {
    const { container, unmount } = await render(<TestHost options={{ touchpadPanScale: 0.5 }} />);
    const el = container.querySelector('[data-testid="canvas"]')! as HTMLDivElement;

    useCanvasStore.getState().setCamera({ zoom: 1, offsetX: 0, offsetY: 0 });
    // Raw deltas: (30, 10) => scaled by 0.5 => (15, 5)
    dispatchWheel(el, { deltaMode: 0, deltaX: 30, deltaY: 10, ctrlKey: false });

    const cam = useCanvasStore.getState().camera;
    expect(cam.offsetX).toBe(15);
    expect(cam.offsetY).toBe(5);

    unmount();
  });

  it('applies mousePanScale to mouse wheel pan (vertical and Shift+wheel horizontal)', async () => {
    const { container, unmount } = await render(<TestHost options={{ mousePanScale: 2 }} />);
    const el = container.querySelector('[data-testid="canvas"]')! as HTMLDivElement;

    useCanvasStore.getState().setCamera({ zoom: 1, offsetX: 0, offsetY: 0 });
    // Vertical pan: deltaY -3 => base offsetY +3, scaled x2 => +6
    dispatchWheel(el, { deltaMode: 1, deltaY: -3, ctrlKey: false });
    expect(useCanvasStore.getState().camera.offsetX).toBe(0);
    expect(useCanvasStore.getState().camera.offsetY).toBe(6);

    // Horizontal pan with Shift: deltaY -5 => base offsetX +5, scaled x2 => +10
    dispatchWheel(el, { deltaMode: 1, deltaY: -5, shiftKey: true, ctrlKey: false });
    const cam2 = useCanvasStore.getState().camera;
    expect(cam2.offsetX).toBe(10);
    expect(cam2.offsetY).toBe(6);

    unmount();
  });
});
