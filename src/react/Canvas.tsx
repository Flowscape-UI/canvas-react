import React, { forwardRef, useRef } from 'react';
import { useSelectionActions, useHistoryActions } from '../state/store';

export type CanvasProps = {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  /** Optional background component rendered behind content (e.g., <BackgroundDots />). */
  background?: React.ReactNode;
  /** Optional CSS background styling for the built-in background layer. */
  backgroundStyle?: React.CSSProperties;
  /**
   * tabIndex applied to the Canvas root to enable keyboard navigation.
   * Defaults to 0 (focusable).
   */
  tabIndex?: number;
};

export const Canvas = forwardRef<HTMLDivElement, CanvasProps>(function Canvas(
  { className, style, children, background, backgroundStyle, tabIndex = 0 }: CanvasProps,
  ref,
) {
  const { clearSelection } = useSelectionActions();
  const { undo, redo } = useHistoryActions();

  // Track whether this interaction should clear selection (i.e., true click without drag)
  const shouldMaybeDeselectRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const DRAG_THRESHOLD_PX = 3; // movement beyond this cancels deselect

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    // Focus canvas so it receives keyboard events (Delete/Backspace, arrows, etc.)
    const root = e.currentTarget as HTMLElement;
    const tabindexAttr = root.getAttribute('tabindex');
    const isFocusDisabled = tabindexAttr === '-1';
    if (!isFocusDisabled && typeof root.focus === 'function') {
      try {
        root.focus({ preventScroll: true } as FocusOptions);
      } catch {
        // ignore
      }
    }
    // Only consider left button. NodeView stops propagation, so this only
    // fires for empty canvas area. Do not stop propagation to keep pan working.
    if (e.button === 0) {
      shouldMaybeDeselectRef.current = true;
      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
    }
  };

  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!shouldMaybeDeselectRef.current) return;
    const dx = Math.abs(e.clientX - startXRef.current);
    const dy = Math.abs(e.clientY - startYRef.current);
    if (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) {
      // Treat as pan/drag; do not deselect on pointer up
      shouldMaybeDeselectRef.current = false;
    }
  };

  const onPointerUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (e.button === 0 && shouldMaybeDeselectRef.current) {
      clearSelection();
    }
    shouldMaybeDeselectRef.current = false;
  };

  const onPointerCancel: React.PointerEventHandler<HTMLDivElement> = () => {
    shouldMaybeDeselectRef.current = false;
  };

  const onContextMenu: React.MouseEventHandler<HTMLDivElement> = (e) => {
    // Disable the browser's context menu when interacting with the canvas
    e.preventDefault();
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    // Undo/Redo shortcuts: Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{ position: 'relative', cursor: 'pointer', ...style }}
      tabIndex={tabIndex}
      data-rc-canvas
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          ...backgroundStyle,
        }}
      >
        {background}
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
});
