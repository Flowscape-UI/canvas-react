import { useEffect } from 'react';
import type { RefObject } from 'react';
import { useCanvasStore } from '../state/store';
import { screenToWorld } from '../core/coords';

export type CanvasNavigationOptions = {
  panButton?: 1 | 2; // middle | right (left is reserved for selection)
  panModifier?: 'none' | 'shift' | 'alt' | 'ctrl';
  wheelZoom?: boolean;
  wheelModifier?: 'none' | 'shift' | 'alt' | 'ctrl'; // убрать отсюда shift
  doubleClickZoom?: boolean; // zoom-in on double left click
  doubleClickZoomFactor?: number; // factor per double click (e.g., 2)
  doubleClickZoomOut?: boolean; // enable zoom-out gesture on double click with modifier
  doubleClickZoomOutModifier?: 'none' | 'shift' | 'alt' | 'ctrl';
  doubleClickZoomOutFactor?: number; // factor for zoom-out (divides zoom)
  keyboardPan?: boolean /** Enable keyboard panning with arrows/WASD */;
  keyboardPanStep?: number /** Base step in screen pixels per key press */;
  keyboardPanSlowStep?: number /** Slow step in screen pixels when holding Shift */;
  /** Overall wheel behavior policy. 'auto' enables modern UX: mouse pan (Y/Shift->X), Ctrl+wheel zoom, touchpad pan and pinch zoom. 'zoom' preserves legacy behavior where wheel zooms by default. 'pan' forces wheel to pan, zoom only with Ctrl+wheel/pinch. */
  wheelBehavior?: 'auto' | 'zoom' | 'pan';
  /** Touchpad-only zoom sensitivities (pixels-based deltas). If omitted, defaults to 0.0015. */
  touchpadZoomSensitivityIn?: number;
  touchpadZoomSensitivityOut?: number;
  /** Mouse Ctrl+wheel zoom sensitivities. If omitted, defaults to 0.0015. */
  mouseZoomSensitivityIn?: number;
  mouseZoomSensitivityOut?: number;
  /** Scale multiplier for touchpad two-finger wheel panning (screen-space deltas). Default: 1 */
  touchpadPanScale?: number;
  /** Scale multiplier for mouse wheel panning (screen-space deltas, incl. Shift+wheel horizontal). Default: 1 */
  mousePanScale?: number;
};

const defaultOptions: Required<CanvasNavigationOptions> = {
  panButton: 1,
  panModifier: 'none',
  wheelZoom: true,
  wheelModifier: 'none',
  doubleClickZoom: true,
  doubleClickZoomFactor: 2,
  doubleClickZoomOut: true,
  doubleClickZoomOutModifier: 'alt',
  doubleClickZoomOutFactor: 2,
  keyboardPan: true,
  keyboardPanStep: 50,
  keyboardPanSlowStep: 25,
  wheelBehavior: 'auto',
  touchpadZoomSensitivityIn: 0.0015,
  touchpadZoomSensitivityOut: 0.0015,
  mouseZoomSensitivityIn: 0.0015,
  mouseZoomSensitivityOut: 0.0015,
  touchpadPanScale: 1,
  mousePanScale: 1,
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
 * useCanvasNavigation(ref, { panButton: 1 }); // pan with middle button (or 2 for right)
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
    // Track last known pointer position (client coordinates) over the canvas
    let hasLastPointer = false;
    let lastClientX = 0;
    let lastClientY = 0;

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
      // Do not allow panning with the left button even if misconfigured
      if (e.button === 0) return;
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
      // Always update last hover position
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      hasLastPointer = true;
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

    function onPointerCancel(e: PointerEvent) {
      if (!isPanning) return;
      isPanning = false;
      try {
        const { endHistory } = useCanvasStore.getState();
        endHistory();
      } catch {
        // ignore
      }
      if (prevCursor !== null) {
        rootEl.style.cursor = prevCursor;
      }
      const target = e.target as Element | null;
      if (target && hasReleasePointerCapture(target)) {
        try {
          target.releasePointerCapture((e as PointerEvent).pointerId);
        } catch {
          // ignore
        }
      }
    }

    function onWheel(e: WheelEvent) {
      const currentEl = ref.current;
      if (!currentEl) return;

      const rect = currentEl.getBoundingClientRect();
      const screenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      // Update last pointer position from wheel events as well
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      hasLastPointer = true;

      // Heuristic detection
      const isPinchZoom = e.ctrlKey === true; // treat Ctrl+wheel as pinch/zoom for both mouse and touchpad
      const isPixelDelta = e.deltaMode === 0;
      // Previous implementation gated touchpad by magnitude (<50), which could flip classification
      // when a trackpad emitted larger deltas, causing apparent direction reversals. Stabilize by
      // classifying any pixel-delta wheel (without Ctrl) as touchpad scroll.
      const isLikelyTouchpadScroll = !isPinchZoom && isPixelDelta;

      // Helper: perform zoom using appropriate sensitivity
      const doZoom = (device: 'touchpad' | 'mouse') => {
        if (!opts.wheelZoom) return;
        // In auto/pan modes, ignore wheelModifier for pinch/ctrl zoom to avoid breaking gestures.
        if (opts.wheelBehavior === 'zoom') {
          // Honor wheelModifier only in legacy zoom mode
          if (!wheelModifierPressed(e)) return;
        }
        e.preventDefault();
        const sensIn =
          device === 'touchpad' ? opts.touchpadZoomSensitivityIn : opts.mouseZoomSensitivityIn;
        const sensOut =
          device === 'touchpad' ? opts.touchpadZoomSensitivityOut : opts.mouseZoomSensitivityOut;
        const sensitivity = e.deltaY < 0 ? sensIn : sensOut;
        const factor = Math.exp(-e.deltaY * sensitivity);
        const { zoomByAt } = useCanvasStore.getState();
        zoomByAt(screenPoint, factor);
      };

      // Helper: pan by deltas in screen space converted to world space
      const doPan = (dxScreen: number, dyScreen: number) => {
        const { camera, panBy } = useCanvasStore.getState();
        const invZoom = 1 / camera.zoom;
        const dxWorld = dxScreen * invZoom;
        const dyWorld = dyScreen * invZoom;
        if (dxWorld !== 0 || dyWorld !== 0) panBy(dxWorld, dyWorld);
      };

      const behavior = opts.wheelBehavior;

      // 1) Zoom if Ctrl (pinch/intentional zoom) regardless of device
      if (isPinchZoom) {
        doZoom(isPixelDelta ? 'touchpad' : 'mouse');
        return;
      }

      // 2) Behavior selection
      if (behavior === 'zoom') {
        // Legacy: wheel = zoom by default
        if (!opts.wheelZoom) return;
        if (!wheelModifierPressed(e)) return;
        // Use device-specific sensitivities (same as pinch/Ctrl+wheel):
        // pixel delta -> touchpad; otherwise -> mouse
        doZoom(isPixelDelta ? 'touchpad' : 'mouse');
        return;
      }

      if (behavior === 'pan') {
        // Always pan with wheel (zoom only with Ctrl handled above)
        e.preventDefault();
        if (isLikelyTouchpadScroll) {
          doPan(e.deltaX * opts.touchpadPanScale, e.deltaY * opts.touchpadPanScale);
        } else {
          // Mouse: Shift => horizontal, else vertical
          if (e.shiftKey) doPan(-e.deltaY * opts.mousePanScale, 0);
          else doPan(0, -e.deltaY * opts.mousePanScale);
        }
        return;
      }

      // behavior === 'auto'
      if (isLikelyTouchpadScroll) {
        // Touchpad: natural two-finger scroll pans in both axes
        e.preventDefault();
        doPan(e.deltaX * opts.touchpadPanScale, e.deltaY * opts.touchpadPanScale);
        return;
      }

      // Mouse: pan vertically by default, Shift => horizontal pan
      e.preventDefault();
      if (e.shiftKey) doPan(-e.deltaY * opts.mousePanScale, 0);
      else doPan(0, -e.deltaY * opts.mousePanScale);
    }

    function onDblClick(e: MouseEvent) {
      if (!opts.doubleClickZoom) return;
      // Only respond to left-button double click
      if (e.button !== 0) return;
      // Ignore double-clicks that originate on a node (NodeView handles inner-edit)
      if (isFromNode(e.target)) return;
      e.preventDefault();
      const currentEl = ref.current;
      if (!currentEl) return;
      const rect = currentEl.getBoundingClientRect();
      const screenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      // Update last pointer position from dblclick
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      hasLastPointer = true;
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
    window.addEventListener('pointercancel', onPointerCancel);
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

      // Escape exits inner-edit mode if active
      if (e.key === 'Escape') {
        const { innerEditNodeId, exitInnerEdit } = useCanvasStore.getState();
        if (innerEditNodeId) {
          e.preventDefault();
          exitInnerEdit();
          return;
        }
      }

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

      // Clipboard: Ctrl/Cmd + C / X / V
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const keyLower = e.key.toLowerCase();
        if (keyLower === 'g') {
          const { selected, createVisualGroupFromSelection } = useCanvasStore.getState();
          if (Object.keys(selected).length >= 2) {
            e.preventDefault();
            createVisualGroupFromSelection();
            return;
          }
        }
        if (keyLower === 'c') {
          const { selected, copySelection } = useCanvasStore.getState();
          if (Object.keys(selected).length > 0) {
            e.preventDefault();
            copySelection();
            return;
          }
        } else if (keyLower === 'x') {
          const { selected, cutSelection } = useCanvasStore.getState();
          if (Object.keys(selected).length > 0) {
            e.preventDefault();
            cutSelection();
            return;
          }
        } else if (keyLower === 'v') {
          e.preventDefault();
          const { camera, pasteClipboard } = useCanvasStore.getState();
          const currentEl = ref.current;
          if (currentEl && hasLastPointer) {
            const rect = currentEl.getBoundingClientRect();
            const screenPoint = { x: lastClientX - rect.left, y: lastClientY - rect.top };
            const worldPoint = screenToWorld(screenPoint, camera);
            pasteClipboard(worldPoint);
          } else {
            pasteClipboard();
          }
          return;
        }
      }

      // Toggle rulers: Ctrl/Cmd + H
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const keyLower = e.key.toLowerCase();
        if (keyLower === 'h') {
          e.preventDefault();
          const { toggleRulers } = useCanvasStore.getState();
          toggleRulers();
          return;
        }
      }

      // deletion of active guide via Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { activeGuideId, removeGuide, setActiveGuide } = useCanvasStore.getState();
        if (activeGuideId) {
          e.preventDefault();
          removeGuide(activeGuideId);
          setActiveGuide(null);
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
      window.removeEventListener('pointercancel', onPointerCancel);
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
    opts.wheelBehavior,
    opts.touchpadZoomSensitivityIn,
    opts.touchpadZoomSensitivityOut,
    opts.mouseZoomSensitivityIn,
    opts.mouseZoomSensitivityOut,
    opts.doubleClickZoom,
    opts.doubleClickZoomFactor,
    opts.doubleClickZoomOut,
    opts.doubleClickZoomOutModifier,
    opts.doubleClickZoomOutFactor,
    opts.keyboardPan,
    opts.keyboardPanStep,
    opts.keyboardPanSlowStep,
    opts.touchpadPanScale,
    opts.mousePanScale,
  ]);
}
