import React, { forwardRef, useRef, useState } from 'react';
import {
  useSelectionActions,
  useHistoryActions,
  useCanvasStore,
  useShowRulers,
  useRulersActions,
  useInnerEditActions,
} from '../state/store';
import { Rulers } from './Rulers';
import type { NodeId, Node } from '../types';

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
  const { setActiveGuide } = useRulersActions();
  const { exitInnerEdit } = useInnerEditActions();
  const showRulers = useShowRulers();

  const [boxStart, setBoxStart] = useState<{ x: number; y: number } | null>(null);
  const [boxEnd, setBoxEnd] = useState<{ x: number; y: number } | null>(null);
  const isBoxSelecting = boxStart != null && boxEnd != null;
  const activePointerIdRef = useRef<number | null>(null);
  // Снимок выделения на момент старта прямоугольного выделения (для additive на отпускании)
  const initialSelectionRef = useRef<Record<NodeId, true> | null>(null);
  const DRAG_THRESHOLD_PX = 3; // movement beyond this cancels deselect
  const shouldMaybeDeselectRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  // --- Автопрокрутка при рамочном выделении ---
  const rootElRef = useRef<HTMLElement | null>(null);
  const lastClientXRef = useRef(0);
  const lastClientYRef = useRef(0);
  const autoPanRafRef = useRef<number | null>(null);
  const EDGE_PX = 32;
  const AUTO_PAN_MIN_PX = 4;
  const AUTO_PAN_MAX_PX = 24;
  // refs со свежими значениями состояния для rAF-цикла
  const isBoxSelectingRef = useRef(false);
  const boxStartRef = useRef<{ x: number; y: number } | null>(null);
  const boxEndRef = useRef<{ x: number; y: number } | null>(null);
  // Точка начала рамки в МИРОВЫХ координатах (фиксируем на старте, не двигаем при панораме)
  const worldStartRef = useRef<{ x: number; y: number } | null>(null);
  if (isBoxSelectingRef.current !== isBoxSelecting) isBoxSelectingRef.current = isBoxSelecting;
  if (boxStartRef.current !== boxStart) boxStartRef.current = boxStart;
  if (boxEndRef.current !== boxEnd) boxEndRef.current = boxEnd;

  const stopAutoPan = () => {
    if (autoPanRafRef.current != null) {
      try {
        cancelAnimationFrame(autoPanRafRef.current);
      } catch {
        // ignore
      }
      autoPanRafRef.current = null;
    }
  };

  const autoPanTick = () => {
    const el = rootElRef.current;
    if (!el || !isBoxSelectingRef.current) {
      autoPanRafRef.current = null;
      return;
    }
    const rect = el.getBoundingClientRect();
    const x = lastClientXRef.current;
    const y = lastClientYRef.current;
    let vxPx = 0;
    let vyPx = 0;
    const leftZone = rect.left + EDGE_PX;
    const rightZone = rect.right - EDGE_PX;
    const topZone = rect.top + EDGE_PX;
    const bottomZone = rect.bottom - EDGE_PX;
    if (x < leftZone) vxPx = -(leftZone - x);
    else if (x > rightZone) vxPx = x - rightZone;
    if (y < topZone) vyPx = -(topZone - y);
    else if (y > bottomZone) vyPx = y - bottomZone;
    // Преобразуем «насколько зашли в зону» в скорость, с минимумом/максимумом
    const scale = (d: number) => {
      const mag = Math.min(Math.max(Math.abs(d), 0), EDGE_PX);
      if (mag <= 0) return 0;
      const v = (mag / EDGE_PX) * AUTO_PAN_MAX_PX;
      return Math.max(v, AUTO_PAN_MIN_PX) * Math.sign(d);
    };
    const sx = scale(vxPx);
    const sy = scale(vyPx);
    if (sx === 0 && sy === 0) {
      // Нет автопрокрутки — прекратим цикл до следующего движения указателя
      autoPanRafRef.current = null;
      return;
    }
    const st = useCanvasStore.getState();
    const { panBy } = st;
    const zoom = st.camera.zoom || 1;
    const dxWorld = sx / zoom;
    const dyWorld = sy / zoom;
    panBy(dxWorld, dyWorld);
    // Форсируем перерисовку, чтобы оверлей пересчитался относительно новой камеры
    setBoxEnd((prev) => (prev ? { x: prev.x, y: prev.y } : prev));
    // Обновим «живое» выделение с УЧЁТОМ новой камеры после panBy, якорь — worldStartRef
    const { camera, nodes, clearSelection, addToSelection } = useCanvasStore.getState();
    const startWorld = worldStartRef.current!;
    const endPt = boxEndRef.current!;
    if (startWorld && endPt) {
      const invZoom = 1 / (camera.zoom || 1);
      const endWorldX = endPt.x * invZoom + camera.offsetX;
      const endWorldY = endPt.y * invZoom + camera.offsetY;
      const worldLeft = Math.min(startWorld.x, endWorldX);
      const worldTop = Math.min(startWorld.y, endWorldY);
      const worldRight = Math.max(startWorld.x, endWorldX);
      const worldBottom = Math.max(startWorld.y, endWorldY);
      const hits: NodeId[] = [];
      for (const n of Object.values(nodes) as Node[]) {
        const nLeft = n.x;
        const nTop = n.y;
        const nRight = n.x + n.width;
        const nBottom = n.y + n.height;
        const intersects =
          nRight >= worldLeft && nLeft <= worldRight && nBottom >= worldTop && nTop <= worldBottom;
        if (intersects) hits.push(n.id);
      }
      clearSelection();
      for (const id of hits) addToSelection(id);
    }
    autoPanRafRef.current = requestAnimationFrame(autoPanTick);
  };

  const ensureAutoPan = (el: HTMLElement) => {
    rootElRef.current = el;
    if (autoPanRafRef.current == null) {
      autoPanRafRef.current = requestAnimationFrame(autoPanTick);
    }
  };

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
    // Только левая кнопка. NodeView останавливает всплытие, значит здесь — пустая область.
    // Не останавливаем всплытие — панорамирование средней кнопкой останется рабочим.
    if (e.button === 0) {
      shouldMaybeDeselectRef.current = true;
      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
      lastClientXRef.current = e.clientX;
      lastClientYRef.current = e.clientY;
      rootElRef.current = root;
    }
  };

  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    const root = e.currentTarget as HTMLElement;
    const rect = root.getBoundingClientRect();
    // Обновляем прямоугольник выделения, если он активен
    if (isBoxSelecting) {
      lastClientXRef.current = e.clientX;
      lastClientYRef.current = e.clientY;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setBoxEnd({ x, y });
      // «живое» выделение: пересчитываем пересечения и отражаем границы сразу
      const end = { x, y };
      const { camera, nodes, clearSelection, addToSelection } = useCanvasStore.getState();
      const invZoom = 1 / (camera.zoom || 1);
      const startWorld = worldStartRef.current!;
      const endWorldX = end.x * invZoom + camera.offsetX;
      const endWorldY = end.y * invZoom + camera.offsetY;
      const worldLeft = Math.min(startWorld.x, endWorldX);
      const worldTop = Math.min(startWorld.y, endWorldY);
      const worldRight = Math.max(startWorld.x, endWorldX);
      const worldBottom = Math.max(startWorld.y, endWorldY);
      const hits: NodeId[] = [];
      for (const n of Object.values(nodes) as Node[]) {
        const nLeft = n.x;
        const nTop = n.y;
        const nRight = n.x + n.width;
        const nBottom = n.y + n.height;
        const intersects =
          nRight >= worldLeft && nLeft <= worldRight && nBottom >= worldTop && nTop <= worldBottom;
        if (intersects) hits.push(n.id);
      }
      // Во время drag показываем только текущее «хит» выделение (replace превью)
      clearSelection();
      for (const id of hits) addToSelection(id);
      shouldMaybeDeselectRef.current = false;
      ensureAutoPan(root);
      return;
    }
    // Если ещё не активировали box-select — проверим порог и стартуем
    if (shouldMaybeDeselectRef.current) {
      const dx = Math.abs(e.clientX - startXRef.current);
      const dy = Math.abs(e.clientY - startYRef.current);
      if (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) {
        // Начинаем прямоугольное выделение от первоначальной точки
        const startX = startXRef.current - rect.left;
        const startY = startYRef.current - rect.top;
        setBoxStart({ x: startX, y: startY });
        const currX = e.clientX - rect.left;
        const currY = e.clientY - rect.top;
        setBoxEnd({ x: currX, y: currY });
        activePointerIdRef.current = e.pointerId;
        // Снимок исходного выделения для additive на отпускании
        initialSelectionRef.current = { ...useCanvasStore.getState().selected };
        // Зафиксируем мировую точку старта
        {
          const cam = useCanvasStore.getState().camera;
          const invZ = 1 / (cam.zoom || 1);
          worldStartRef.current = {
            x: startX * invZ + cam.offsetX,
            y: startY * invZ + cam.offsetY,
          };
        }
        try {
          const el = e.currentTarget as Element;
          if ('setPointerCapture' in el) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore — DOM API присутствует в браузере
            el.setPointerCapture(e.pointerId);
          }
        } catch {
          // ignore
        }
        shouldMaybeDeselectRef.current = false;
        lastClientXRef.current = e.clientX;
        lastClientYRef.current = e.clientY;
        ensureAutoPan(root);
      }
    }
  };

  const onPointerUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
    // Завершаем прямоугольное выделение, если активно.
    // Используем признак захвата/старта (activePointerIdRef + worldStartRef),
    // так как React мог ещё не перерендерить isBoxSelecting к этому событию.
    if (activePointerIdRef.current != null && worldStartRef.current) {
      // вычисляем прямоугольник в мировых координатах из экранных
      const root = e.currentTarget as HTMLElement;
      const rect = root.getBoundingClientRect();
      const endPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const { camera, nodes, clearSelection, addToSelection } = useCanvasStore.getState();
      const invZoom = 1 / (camera.zoom || 1);
      const startWorld = worldStartRef.current!;
      const endWorldX = endPt.x * invZoom + camera.offsetX;
      const endWorldY = endPt.y * invZoom + camera.offsetY;
      const worldLeft = Math.min(startWorld.x, endWorldX);
      const worldTop = Math.min(startWorld.y, endWorldY);
      const worldRight = Math.max(startWorld.x, endWorldX);
      const worldBottom = Math.max(startWorld.y, endWorldY);
      const hits: NodeId[] = [];
      for (const n of Object.values(nodes) as Node[]) {
        const nLeft = n.x;
        const nTop = n.y;
        const nRight = n.x + n.width;
        const nBottom = n.y + n.height;
        const intersects =
          nRight >= worldLeft && nLeft <= worldRight && nBottom >= worldTop && nTop <= worldBottom;
        if (intersects) hits.push(n.id);
      }
      const additive = e.ctrlKey || e.metaKey;
      const snapshot = initialSelectionRef.current || {};
      clearSelection();
      if (additive) {
        for (const id of Object.keys(snapshot) as NodeId[]) addToSelection(id);
      }
      for (const id of hits) addToSelection(id);

      // сбрасываем состояние box-select и освобождаем захват указателя
      setBoxStart(null);
      setBoxEnd(null);
      initialSelectionRef.current = null;
      worldStartRef.current = null;
      stopAutoPan();
      const target = e.currentTarget as Element;
      const pid = activePointerIdRef.current;
      if (pid != null && target && 'releasePointerCapture' in target) {
        try {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore — DOM API присутствует в браузере
          target.releasePointerCapture(pid);
        } catch {
          // ignore
        }
      }
      activePointerIdRef.current = null;
    } else {
      // «Чистый клик» по пустому месту — снять выделение и активную guide
      if (e.button === 0 && shouldMaybeDeselectRef.current) {
        clearSelection();
        setActiveGuide(null);
        // Exit inner-edit mode if active
        try {
          const { innerEditNodeId } = useCanvasStore.getState();
          if (innerEditNodeId) exitInnerEdit();
        } catch {
          // ignore
        }
        try {
          const { selectVisualGroup } = useCanvasStore.getState();
          selectVisualGroup(null);
        } catch {
          // ignore
        }
      }
    }
    shouldMaybeDeselectRef.current = false;
  };

  const onPointerCancel: React.PointerEventHandler<HTMLDivElement> = () => {
    shouldMaybeDeselectRef.current = false;
    stopAutoPan();
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

  // Подготовим оверлей прямоугольника
  let overlay: React.ReactNode = null;
  if (isBoxSelecting) {
    // Визуализируем рамку относительно МИРОВОГО старта, чтобы она не «ехала» со сценой при панораме
    const startWorld = worldStartRef.current;
    const { camera } = useCanvasStore.getState();
    const z = camera.zoom || 1;
    const sx = startWorld ? (startWorld.x - camera.offsetX) * z : boxStart!.x;
    const sy = startWorld ? (startWorld.y - camera.offsetY) * z : boxStart!.y;
    const ex = boxEnd!.x;
    const ey = boxEnd!.y;
    const x1 = Math.min(sx, ex);
    const y1 = Math.min(sy, ey);
    const x2 = Math.max(sx, ex);
    const y2 = Math.max(sy, ey);
    overlay = (
      <div
        aria-hidden
        data-rc-box
        style={{
          position: 'absolute',
          left: x1,
          top: y1,
          width: Math.max(0, x2 - x1),
          height: Math.max(0, y2 - y1),
          pointerEvents: 'none',
          zIndex: 2,
          background: 'rgba(59, 130, 246, 0.08)',
          outline: '1px solid rgba(59, 130, 246, 0.9)',
          boxShadow: 'inset 0 0 0 1px rgba(59,130,246,0.4)',
        }}
      />
    );
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{
        position: 'relative',
        cursor: 'pointer',
        // Во время рамочного выделения запрещаем выделение текста внутри нод
        userSelect: isBoxSelecting ? 'none' : undefined,
        ...style,
      }}
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
      <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
        {showRulers ? <Rulers /> : null}
        {children}
      </div>
      {overlay}
    </div>
  );
});
