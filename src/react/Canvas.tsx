import React, { forwardRef, useEffect, useRef, useState } from 'react';
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

  // Helper: update hovered visual group highlights for given node ids
  const updateHoverForIds = (ids: NodeId[]) => {
    try {
      const st = useCanvasStore.getState();
      const setPrimary = st.setHoveredVisualGroupId;
      const setSecondary = st.setHoveredVisualGroupIdSecondary;
      if (!ids || ids.length === 0) {
        setPrimary(null);
        setSecondary(null);
        return;
      }
      const groups = Object.values(st.visualGroups);
      if (!groups || groups.length === 0) {
        setPrimary(null);
        setSecondary(null);
        return;
      }
      // Candidates that contain ALL ids
      const candidates = groups.filter((vg) => ids.every((id) => vg.members.includes(id)));
      if (candidates.length === 0) {
        setPrimary(null);
        setSecondary(null);
        return;
      }
      let largestId: string | null = null;
      let largestArea = -Infinity;
      let smallestId: string | null = null;
      let smallestArea = Infinity;
      for (const vg of candidates) {
        let left = Infinity,
          top = Infinity,
          right = -Infinity,
          bottom = -Infinity;
        for (const mid of vg.members) {
          const n = st.nodes[mid as NodeId];
          if (!n) continue;
          left = Math.min(left, n.x);
          top = Math.min(top, n.y);
          right = Math.max(right, n.x + n.width);
          bottom = Math.max(bottom, n.y + n.height);
        }
        if (left === Infinity) continue;
        const area = Math.max(0, right - left) * Math.max(0, bottom - top);
        if (area > largestArea) {
          largestArea = area;
          largestId = vg.id;
        }
        if (area < smallestArea) {
          smallestArea = area;
          smallestId = vg.id;
        }
      }
      setPrimary(largestId);
      const secondaryId = smallestId && smallestId !== largestId ? smallestId : null;
      setSecondary(secondaryId);
    } catch {
      // ignore
    }
  };

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

  // Global Ctrl/Cmd+G so grouping works even if Canvas isn't focused
  useEffect(() => {
    function isTextInput(element: Element | null): boolean {
      if (!element || !(element instanceof HTMLElement)) return false;
      const tag = element.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (element.isContentEditable) return true;
      return false;
    }
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (isTextInput(e.target as Element)) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const code = e.code;
        if (code === 'KeyG') {
          const { selected, createVisualGroupFromSelection } = useCanvasStore.getState();
          if (Object.keys(selected).length >= 2) {
            e.preventDefault();
            createVisualGroupFromSelection();
          }
        }
      }
    };
    window.addEventListener('keydown', onWindowKeyDown);
    return () => window.removeEventListener('keydown', onWindowKeyDown);
  }, []);

  // Capture-phase focus: ensure the canvas gets focus even when child components
  // stop propagation of pointer events (e.g., NodeView). This guarantees our
  // onKeyDown will receive keyboard shortcuts after any click inside the canvas.
  const onPointerDownCapture: React.PointerEventHandler<HTMLDivElement> = (e) => {
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
      // Lasso behavior: if any hit nodes belong to a visual group,
      // do NOT select nodes; instead, hover the most relevant group.
      const st = useCanvasStore.getState();
      const groups = Object.values(st.visualGroups);
      let primaryGroupId: string | null = null;
      let secondaryGroupId: string | null = null;
      if (groups.length > 0 && hits.length > 0) {
        type Candidate = { id: string; hitCount: number; area: number };
        const candidates: Candidate[] = [];
        for (const vg of groups) {
          let count = 0;
          for (const hid of hits) if (vg.members.includes(hid as NodeId)) count++;
          if (count > 0) {
            let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
            for (const mid of vg.members) {
              const n = st.nodes[mid as NodeId];
              if (!n) continue;
              L = Math.min(L, n.x);
              T = Math.min(T, n.y);
              R = Math.max(R, n.x + n.width);
              B = Math.max(B, n.y + n.height);
            }
            if (L !== Infinity) candidates.push({ id: vg.id, hitCount: count, area: Math.max(0, R - L) * Math.max(0, B - T) });
          }
        }
        if (candidates.length > 0) {
          candidates.sort((a, b) => (b.hitCount - a.hitCount) || (b.area - a.area));
          primaryGroupId = candidates[0]?.id || null;
          secondaryGroupId = candidates[1]?.id || null;
        }
      }
      if (primaryGroupId) {
        // Clear any node selection preview and hover the group
        clearSelection();
        try {
          st.setHoveredVisualGroupId(primaryGroupId);
          st.setHoveredVisualGroupIdSecondary(secondaryGroupId || null);
        } catch {
          // ignore
        }
      } else {
        // No grouped hits: live node selection preview as before
        clearSelection();
        for (const id of hits) addToSelection(id);
        updateHoverForIds(hits);
      }
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
      // Update hovered visual group highlights based on live hits
      updateHoverForIds(hits);
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
      // Lasso finalization: if any hit node belongs to a visual group, select that group instead of nodes
      const st = useCanvasStore.getState();
      const groups = Object.values(st.visualGroups);
      let chosenGroupId: string | null = null;
      let secondGroupId: string | null = null;
      if (groups.length > 0 && hits.length > 0) {
        type Candidate = { id: string; hitCount: number; area: number };
        const candidates: Candidate[] = [];
        for (const vg of groups) {
          let count = 0;
          for (const hid of hits) if (vg.members.includes(hid as NodeId)) count++;
          if (count > 0) {
            let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
            for (const mid of vg.members) {
              const n = st.nodes[mid as NodeId];
              if (!n) continue;
              L = Math.min(L, n.x);
              T = Math.min(T, n.y);
              R = Math.max(R, n.x + n.width);
              B = Math.max(B, n.y + n.height);
            }
            if (L !== Infinity) candidates.push({ id: vg.id, hitCount: count, area: Math.max(0, R - L) * Math.max(0, B - T) });
          }
        }
        if (candidates.length > 0) {
          candidates.sort((a, b) => (b.hitCount - a.hitCount) || (b.area - a.area));
          chosenGroupId = candidates[0]?.id || null;
          secondGroupId = candidates[1]?.id || null;
        }
      }

      const additive = e.ctrlKey || e.metaKey;
      const snapshot = initialSelectionRef.current || {};
      clearSelection();
      if (chosenGroupId) {
        // Select the chosen group frame AND any nodes outside that group hit by the lasso
        const vg = st.visualGroups[chosenGroupId];
        const memberSet = new Set<NodeId>(vg ? (vg.members as NodeId[]) : []);
        const outside = hits.filter((id) => !memberSet.has(id as NodeId));
        if (additive) {
          for (const id of Object.keys(snapshot) as NodeId[]) addToSelection(id);
        }
        for (const id of outside) addToSelection(id);
        st.selectVisualGroup(chosenGroupId);
        // If a second group also intersects, provide secondary hover highlight for UX feedback
        if (secondGroupId && secondGroupId !== chosenGroupId) {
          try {
            st.setHoveredVisualGroupIdSecondary(secondGroupId);
          } catch {
            // ignore
          }
        }
      } else {
        // Standard node selection behavior
        if (additive) {
          for (const id of Object.keys(snapshot) as NodeId[]) addToSelection(id);
        }
        for (const id of hits) addToSelection(id);
      }

      // сбрасываем состояние box-select и освобождаем захват указателя
      setBoxStart(null);
      setBoxEnd(null);
      initialSelectionRef.current = null;
      worldStartRef.current = null;
      stopAutoPan();
      // Clear hover highlights when box selection ends
      try {
        const st2 = useCanvasStore.getState();
        st2.setHoveredVisualGroupId(null);
        st2.setHoveredVisualGroupIdSecondary(null);
      } catch {
        // ignore
      }
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
        // Also clear any hovered visual group highlights
        try {
          const st3 = useCanvasStore.getState();
          st3.setHoveredVisualGroupId(null);
          st3.setHoveredVisualGroupIdSecondary(null);
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
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }

    // Escape: exit inner-edit if active; otherwise clear node and visual group selections
    if (e.code === 'Escape') {
      const { innerEditNodeId, selectVisualGroup } = useCanvasStore.getState();
      if (innerEditNodeId) {
        e.preventDefault();
        exitInnerEdit();
        return;
      }
      e.preventDefault();
      clearSelection();
      selectVisualGroup(null);
      return;
    }

    // Grouping: Ctrl/Cmd + G (works even if useCanvasNavigation hook isn't attached)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      const code = e.code;
      if (code === 'KeyG') {
        const { selected, createVisualGroupFromSelection } = useCanvasStore.getState();
        if (Object.keys(selected).length >= 2) {
          e.preventDefault();
          createVisualGroupFromSelection();
          return;
        }
      }
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
      onPointerDownCapture={onPointerDownCapture}
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
      <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>{children}</div>
      {overlay}
      {showRulers ? <Rulers /> : null}
    </div>
  );
});
