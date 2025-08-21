import { useEffect } from 'react';
import type { RefObject } from 'react';
import { useCanvasStore } from '../state/store';

export type CanvasNavigationOptions = {
  panButton?: 0 | 1 | 2; // left | middle | right
  panModifier?: 'none' | 'shift' | 'alt' | 'ctrl';
  wheelZoom?: boolean;
  wheelModifier?: 'none' | 'shift' | 'alt' | 'ctrl'; // убрать отсюда shift
  wheelSensitivity?: number; // higher = faster zoom
  doubleClickZoom?: boolean; // zoom-in on double left click
  doubleClickZoomFactor?: number; // factor per double click (e.g., 2)
  doubleClickZoomOut?: boolean; // enable zoom-out gesture on double click with modifier
  doubleClickZoomOutModifier?: 'none' | 'shift' | 'alt' | 'ctrl';
  doubleClickZoomOutFactor?: number; // factor for zoom-out (divides zoom)
  keyboardPan?: boolean /** Enable keyboard panning with arrows/WASD */;
  keyboardPanStep?: number /** Base step in screen pixels per key press */;
  keyboardPanSlowStep?: number /** Slow step in screen pixels when holding Shift */;
};

const defaultOptions: Required<CanvasNavigationOptions> = {
  panButton: 0,
  panModifier: 'none',
  wheelZoom: true,
  wheelModifier: 'none',
  wheelSensitivity: 0.0015,
  doubleClickZoom: true,
  doubleClickZoomFactor: 2,
  doubleClickZoomOut: true,
  doubleClickZoomOutModifier: 'alt',
  doubleClickZoomOutFactor: 2,
  keyboardPan: true,
  keyboardPanStep: 50,
  keyboardPanSlowStep: 25,
};

function hasSetPointerCapture(
  el: Element,
): el is Element & { setPointerCapture(id: number): void } {
  return 'setPointerCapture' in el;
}

function hasReleasePointerCapture(
  el: Element,
): el is Element & { releasePointerCapture(id: number): void } {
  return 'releasePointerCapture' in el;
}

/**
 * Attach interactive navigation (pan/zoom) to a Canvas root element.
 * Usage:
 * const ref = useRef<HTMLDivElement>(null);
 * useCanvasNavigation(ref, { panButton: 0 });
 */
export function useCanvasNavigation(
  ref: RefObject<HTMLElement>,
  options?: CanvasNavigationOptions,
): void {
  const opts = { ...defaultOptions, ...(options ?? {}) };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const rootEl = el as HTMLElement;
    let isPanning = false;
    let lastX = 0;
    let lastY = 0;
    let prevCursor: string | null = null;

    // ensure pointer events behave for pan/zoom
    const prevTouchAction = el.style.touchAction;
    el.style.touchAction = 'none';

    function modifierPressed(ev: PointerEvent | WheelEvent): boolean {
      switch (opts.panModifier) {
        case 'none':
          return true;
        case 'shift':
          return ev.shiftKey === true;
        case 'alt':
          return ev.altKey === true;
        case 'ctrl':
          return ev.ctrlKey === true || ev.metaKey === true;
        default:
          return true;
      }
    }

    function isFromNode(target: EventTarget | null): boolean {
      if (!(target instanceof Element)) return false;
      return !!target.closest('[data-rc-nodeid]');
    }

    function wheelModifierPressed(ev: WheelEvent): boolean {
      switch (opts.wheelModifier) {
        case 'none':
          return true;
        case 'shift':
          return ev.shiftKey === true;
        case 'alt':
          return ev.altKey === true;
        case 'ctrl':
          return ev.ctrlKey === true || ev.metaKey === true;
        default:
          return true;
      }
    }

    function onPointerDown(e: PointerEvent) {
      if (e.button !== opts.panButton) return;
      if (!modifierPressed(e)) return;
      // Do not start panning when interacting with a Node element
      if (isFromNode(e.target)) return;

      isPanning = true;
      lastX = e.clientX;
      lastY = e.clientY;
      // start a history batch so the whole drag is a single undoable step
      try {
        const { beginHistory } = useCanvasStore.getState();
        beginHistory('camera-pan');
      } catch {
        // ignore
      }
      // switch cursor to indicate panning state
      if (prevCursor === null) prevCursor = rootEl.style.cursor;
      rootEl.style.cursor = 'grabbing';
      const target = e.target as Element | null;
      if (target && hasSetPointerCapture(target)) {
        target.setPointerCapture(e.pointerId);
      }
      // focus the canvas so it can receive keyboard events (respect tabindex=-1)
      const tabindexAttr = rootEl.getAttribute('tabindex');
      const isFocusDisabled = tabindexAttr === '-1';
      if (!isFocusDisabled && typeof rootEl.focus === 'function') {
        try {
          rootEl.focus({ preventScroll: true } as FocusOptions);
        } catch {
          // ignore
        }
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (!isPanning) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      const { camera, panBy } = useCanvasStore.getState();
      const invZoom = 1 / camera.zoom;
      // convert screen delta to world delta so content follows the cursor
      panBy(-dx * invZoom, -dy * invZoom);
    }

    function onPointerUp(e: PointerEvent) {
      if (!isPanning) return;
      isPanning = false;
      // end history batch started on pointerdown
      try {
        const { endHistory } = useCanvasStore.getState();
        endHistory();
      } catch {
        // ignore
      }
      // restore previous cursor
      if (prevCursor !== null) {
        rootEl.style.cursor = prevCursor;
      }
      const target = e.target as Element | null;
      if (target && hasReleasePointerCapture(target)) {
        target.releasePointerCapture(e.pointerId);
      }
    }

    function onWheel(e: WheelEvent) {
      if (!opts.wheelZoom) return;
      if (!wheelModifierPressed(e)) return;
      // Allow trackpad zoom on Mac with ctrl+wheel; also regular wheel
      e.preventDefault();
      const currentEl = ref.current;
      if (!currentEl) return;
      const rect = currentEl.getBoundingClientRect();
      const screenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      const sensitivity = opts.wheelSensitivity;
      const factor = Math.exp(-e.deltaY * sensitivity);

      const { zoomByAt } = useCanvasStore.getState();
      zoomByAt(screenPoint, factor);
    }

    function onDblClick(e: MouseEvent) {
      if (!opts.doubleClickZoom) return;
      // Only respond to left-button double click
      if (e.button !== 0) return;
      e.preventDefault();
      const currentEl = ref.current;
      if (!currentEl) return;
      const rect = currentEl.getBoundingClientRect();
      const screenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      // If zoom-out is enabled and its modifier is held, perform zoom-out
      let factor = opts.doubleClickZoomFactor;
      const outMod = opts.doubleClickZoomOutModifier;
      const outModActive = (() => {
        switch (outMod) {
          case 'none':
            return true;
          case 'shift':
            return e.shiftKey === true;
          case 'alt':
            return e.altKey === true;
          case 'ctrl':
            return e.ctrlKey === true || e.metaKey === true;
          default:
            return false;
        }
      })();
      if (opts.doubleClickZoomOut && outModActive) {
        factor = 1 / (opts.doubleClickZoomOutFactor || 2);
      }
      const { zoomByAt } = useCanvasStore.getState();
      zoomByAt(screenPoint, factor);
    }

    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('dblclick', onDblClick);
    // keyboard navigation: arrows/WASD to pan (if enabled), +/- to zoom at center
    function isTextInput(element: Element | null): boolean {
      if (!element || !(element instanceof HTMLElement)) return false;
      const tag = element.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (element.isContentEditable) return true;
      return false;
    }

    function onKeyDown(e: KeyboardEvent) {
      // ignore if typing in inputs/contenteditable
      if (isTextInput(e.target as Element)) return;

      const { camera, panBy, zoomByAt } = useCanvasStore.getState();
      const invZoom = 1 / camera.zoom;

      if (opts.keyboardPan) {
        let dxScreen = 0;
        let dyScreen = 0;
        const slow = e.shiftKey; // Shift = slow
        let step = opts.keyboardPanStep;
        if (slow) step = opts.keyboardPanSlowStep;

        switch (e.key) {
          case 'ArrowLeft':
          case 'a':
          case 'A':
            dxScreen = step;
            break;
          case 'ArrowRight':
          case 'd':
          case 'D':
            dxScreen = -step;
            break;
          case 'ArrowUp':
          case 'w':
          case 'W':
            dyScreen = step;
            break;
          case 'ArrowDown':
          case 's':
          case 'S':
            dyScreen = -step;
            break;
        }

        if (dxScreen !== 0 || dyScreen !== 0) {
          e.preventDefault(); // prevent page/scroll keys
          panBy(-dxScreen * invZoom, -dyScreen * invZoom);
          return;
        }
      }

      // deletion: Delete / Backspace removes selected nodes
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { selected, deleteSelected } = useCanvasStore.getState();
        if (Object.keys(selected).length > 0) {
          e.preventDefault();
          deleteSelected();
        }
        return;
      }

      // zoom with +/- (including numpad and '=' as '+')
      const code = e.code;
      const key = e.key;
      const isPlus = key === '+' || key === '=' || code === 'Equal' || code === 'NumpadAdd';
      const isMinus = key === '-' || code === 'Minus' || code === 'NumpadSubtract';
      if (isPlus || isMinus) {
        e.preventDefault();
        const factor = isPlus ? 1.1 : 1 / 1.1;
        const currentEl = ref.current;
        if (!currentEl) return;
        const rect = currentEl.getBoundingClientRect();
        const screenPoint = { x: rect.width / 2, y: rect.height / 2 };
        zoomByAt(screenPoint, factor);
      }
    }

    el.addEventListener('keydown', onKeyDown);

    return () => {
      rootEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      rootEl.removeEventListener('wheel', onWheel);
      rootEl.removeEventListener('dblclick', onDblClick);
      rootEl.removeEventListener('keydown', onKeyDown);
      // ensure cursor is restored if effect is torn down mid-pan
      if (prevCursor !== null) rootEl.style.cursor = prevCursor;
      rootEl.style.touchAction = prevTouchAction;
    };
  }, [
    ref,
    opts.panButton,
    opts.panModifier,
    opts.wheelZoom,
    opts.wheelModifier,
    opts.wheelSensitivity,
    opts.doubleClickZoom,
    opts.doubleClickZoomFactor,
    opts.doubleClickZoomOut,
    opts.doubleClickZoomOutModifier,
    opts.doubleClickZoomOutFactor,
    opts.keyboardPan,
    opts.keyboardPanStep,
    opts.keyboardPanSlowStep,
  ]);
}
