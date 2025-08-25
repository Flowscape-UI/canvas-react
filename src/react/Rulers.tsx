import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCamera, useGuides, useRulersActions, useActiveGuideId } from '../state/store';
import type { GuideId } from '../state/store';

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Feature-detect ResizeObserver (undefined in jsdom/SSR). If absent, set size once.
    const RO: typeof ResizeObserver | undefined =
      typeof ResizeObserver === 'function' ? ResizeObserver : undefined;
    if (!RO) {
      setSize({ width: el.clientWidth, height: el.clientHeight });
      return;
    }
    const ro = new RO(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    setSize({ width: el.clientWidth, height: el.clientHeight });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size } as const;
}

function chooseStep(zoom: number) {
  // Aim for 60..140 px between major ticks
  const targetMin = 60;
  const targetMax = 140;
  const bases = [1, 2, 5];
  // Iterate finite scales to satisfy lint (no while(true))
  for (let unit = 1; unit <= 1e6; unit *= 10) {
    for (const b of bases) {
      const step = unit * b; // world units
      const px = step * zoom;
      if (px >= targetMin && px <= targetMax) return step;
    }
  }
  return 1e6;
}

export function Rulers() {
  const camera = useCamera();
  const guides = useGuides();
  const activeGuideId = useActiveGuideId();
  const { addGuide, moveGuideTemporary, moveGuideCommit, removeGuide, setActiveGuide } =
    useRulersActions();

  // Track hovered guide for visual feedback
  const [hoveredGuideId, setHoveredGuideId] = useState<GuideId | null>(null);

  const { ref, width, height } = useElementSize<HTMLDivElement>();

  // Keyboard shortcuts for active guide
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeGuideId && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        removeGuide(activeGuideId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeGuideId, removeGuide]);

  const { stepWorld, stepPx, firstX, firstY } = useMemo(() => {
    const z = camera.zoom || 1;
    const step = chooseStep(z);
    const stepPx = step * z;
    // world coord at left/top screen edge
    const worldAtLeft = camera.offsetX;
    const worldAtTop = camera.offsetY;
    // first tick <= edge
    const firstX = Math.floor(worldAtLeft / step) * step;
    const firstY = Math.floor(worldAtTop / step) * step;
    return { stepWorld: step, stepPx, firstX, firstY };
  }, [camera.offsetX, camera.offsetY, camera.zoom]);

  // Drag state for creating or moving guides
  const dragRef = useRef<{
    mode: 'create' | 'move';
    axis: 'x' | 'y';
    id: GuideId | null;
    startValue?: number; // Store initial position for history
  } | null>(null);

  const onTopDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    // Start creating a horizontal guide (axis 'y')
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture?.(e.pointerId);
    dragRef.current = { mode: 'create', axis: 'y', id: null };
    e.preventDefault();
    e.stopPropagation();
  };

  const onLeftDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    // Start creating a vertical guide (axis 'x')
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture?.(e.pointerId);
    dragRef.current = { mode: 'create', axis: 'x', id: null };
    e.preventDefault();
    e.stopPropagation();
  };

  const rootOnPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const z = camera.zoom || 1;
    const host = ref.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (drag.mode === 'create') {
      // Lazily allocate guide on first move; then keep moving
      if (!drag.id) {
        if (drag.axis === 'x') {
          const worldX = x / z + camera.offsetX;
          const id = addGuide('x', worldX);
          dragRef.current = { ...drag, id };
          setActiveGuide(id);
        } else {
          const worldY = y / z + camera.offsetY;
          const id = addGuide('y', worldY);
          dragRef.current = { ...drag, id };
          setActiveGuide(id);
        }
      } else {
        if (drag.axis === 'x') {
          const worldX = x / z + camera.offsetX;
          moveGuideTemporary(drag.id, worldX);
        } else {
          const worldY = y / z + camera.offsetY;
          moveGuideTemporary(drag.id, worldY);
        }
      }
    } else if (drag.mode === 'move' && drag.id) {
      if (drag.axis === 'x') {
        const worldX = x / z + camera.offsetX;
        moveGuideTemporary(drag.id, worldX);
      } else {
        const worldY = y / z + camera.offsetY;
        moveGuideTemporary(drag.id, worldY);
      }
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const rootOnPointerUp: React.PointerEventHandler<HTMLDivElement> = () => {
    const drag = dragRef.current;
    if (drag?.mode === 'move' && drag.id && drag.startValue !== undefined) {
      // Get current position and save to history if it changed
      const currentGuide = guides.find((g) => g.id === drag.id);
      if (currentGuide && currentGuide.value !== drag.startValue) {
        moveGuideCommit(drag.id, drag.startValue, currentGuide.value);
      }
    }
    dragRef.current = null;
  };

  const onGuideDown = useCallback(
    (id: GuideId, axis: 'x' | 'y'): React.PointerEventHandler<HTMLDivElement> => {
      return (e) => {
        setActiveGuide(id);
        const guide = guides.find((g) => g.id === id);
        const el = e.currentTarget as HTMLElement;
        el.setPointerCapture?.(e.pointerId);
        dragRef.current = { mode: 'move', axis, id, startValue: guide?.value };
        e.preventDefault();
        e.stopPropagation();
      };
    },
    [setActiveGuide, guides],
  );

  const rulerBg = '#f0f3f7';
  const tickColor = '#a3a9b3';
  const labelColor = '#616975';
  const lineColor = '#1e90ff';

  // Render ticks and labels for top ruler
  const topTicks = useMemo(() => {
    const z = camera.zoom || 1;
    const items: React.ReactNode[] = [];
    if (width <= 0) return items;
    const count = Math.ceil(width / stepPx) + 2;
    for (let i = 0; i < count; i++) {
      const worldX = firstX + i * stepWorld;
      const x = (worldX - camera.offsetX) * z;
      items.push(
        <div
          key={worldX}
          style={{ position: 'absolute', left: x, top: 0, height: '100%', pointerEvents: 'none' }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 12,
              width: 1,
              height: 12,
              background: tickColor,
            }}
          />
          <div style={{ position: 'absolute', left: 4, top: 2, fontSize: 10, color: labelColor }}>
            {Math.round(worldX)}
          </div>
        </div>,
      );
    }
    return items;
  }, [width, stepPx, stepWorld, firstX, camera.offsetX, camera.zoom]);

  // Render ticks and labels for left ruler
  const leftTicks = useMemo(() => {
    const z = camera.zoom || 1;
    const items: React.ReactNode[] = [];
    if (height <= 0) return items;
    const count = Math.ceil(height / stepPx) + 2;
    for (let i = 0; i < count; i++) {
      const worldY = firstY + i * stepWorld;
      const y = (worldY - camera.offsetY) * z;
      items.push(
        <div
          key={worldY}
          style={{ position: 'absolute', top: y, left: 0, width: '100%', pointerEvents: 'none' }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 12,
              width: 12,
              height: 1,
              background: tickColor,
            }}
          />
          <div style={{ position: 'absolute', top: 2, left: 2, fontSize: 10, color: labelColor }}>
            {Math.round(worldY)}
          </div>
        </div>,
      );
    }
    return items;
  }, [height, stepPx, stepWorld, firstY, camera.offsetY, camera.zoom]);

  // Render guide lines
  const guideLines = useMemo(() => {
    const z = camera.zoom || 1;
    const lines: React.ReactNode[] = [];
    for (const g of guides) {
      const isActive = g.id === activeGuideId;
      const isHovered = g.id === hoveredGuideId;

      // Enhanced visual states
      const getLineColor = () => {
        if (isActive) return lineColor;
        if (isHovered) return '#60a5fa'; // lighter blue on hover
        return '#3b82f6'; // default blue
      };

      const getLineWidth = () => {
        if (isActive) return 2;
        if (isHovered) return 2;
        return 1;
      };

      const getHitAreaSize = () => 12; // consistent hit area to prevent hover jitter

      if (g.axis === 'x') {
        const x = (g.value - camera.offsetX) * z;
        if (x < -4 || x > width + 4) continue;
        const hitWidth = getHitAreaSize();
        lines.push(
          <div
            key={g.id}
            style={{
              position: 'absolute',
              left: x - hitWidth / 2,
              top: 24,
              bottom: 0,
              width: hitWidth,
              cursor: 'ew-resize',
              transition: 'width 0.15s ease',
              pointerEvents: 'auto',
            }}
            onPointerDown={onGuideDown(g.id, 'x')}
            onPointerEnter={() => setHoveredGuideId(g.id)}
            onPointerOver={() => setHoveredGuideId(g.id)}
            onPointerLeave={() => setHoveredGuideId(null)}
            data-rc-guide=""
            data-rc-guide-axis="x"
            data-rc-guide-id={g.id}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                bottom: 0,
                width: getLineWidth(),
                background: getLineColor(),
                transform: 'translateX(-50%)',
                transition: 'all 0.15s ease',
                boxShadow: isHovered ? '0 0 6px rgba(96, 165, 250, 0.5)' : 'none',
              }}
              data-rc-guide-line=""
            />
          </div>,
        );
      } else {
        const y = (g.value - camera.offsetY) * z;
        if (y < -4 || y > height + 4) continue;
        const hitHeight = getHitAreaSize();
        lines.push(
          <div
            key={g.id}
            style={{
              position: 'absolute',
              top: y - hitHeight / 2,
              left: 24,
              right: 0,
              height: hitHeight,
              cursor: 'ns-resize',
              transition: 'height 0.15s ease',
              pointerEvents: 'auto',
            }}
            onPointerDown={onGuideDown(g.id, 'y')}
            onPointerEnter={() => setHoveredGuideId(g.id)}
            onPointerOver={() => setHoveredGuideId(g.id)}
            onPointerLeave={() => setHoveredGuideId(null)}
            data-rc-guide=""
            data-rc-guide-axis="y"
            data-rc-guide-id={g.id}
          >
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: 0,
                right: 0,
                height: getLineWidth(),
                background: getLineColor(),
                transform: 'translateY(-50%)',
                transition: 'all 0.15s ease',
                boxShadow: isHovered ? '0 0 6px rgba(96, 165, 250, 0.5)' : 'none',
              }}
              data-rc-guide-line=""
            />
          </div>,
        );
      }
    }
    return lines;
  }, [
    guides,
    activeGuideId,
    hoveredGuideId,
    camera.offsetX,
    camera.offsetY,
    camera.zoom,
    width,
    height,
    onGuideDown,
    setHoveredGuideId,
  ]);

  return (
    <div
      ref={ref}
      onPointerMove={rootOnPointerMove}
      onPointerUp={rootOnPointerUp}
      style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}
      aria-hidden
      data-rc-rulers
    >
      {/* Corner square */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 24,
          height: 24,
          background: rulerBg,
          borderRight: '1px solid #d3d9e1',
          borderBottom: '1px solid #d3d9e1',
        }}
      />
      {/* Top ruler */}
      <div
        onPointerDown={onTopDown}
        style={{
          position: 'absolute',
          left: 24,
          right: 0,
          top: 0,
          height: 24,
          background: rulerBg,
          borderBottom: '1px solid #d3d9e1',
          pointerEvents: 'auto',
          overflow: 'hidden',
          cursor: 'ns-resize', // vertical arrows for creating horizontal guides
        }}
        data-rc-ruler-top
      >
        <div style={{ position: 'absolute', inset: 0 }}>{topTicks}</div>
      </div>
      {/* Left ruler */}
      <div
        onPointerDown={onLeftDown}
        style={{
          position: 'absolute',
          top: 24,
          bottom: 0,
          left: 0,
          width: 24,
          background: rulerBg,
          borderRight: '1px solid #d3d9e1',
          pointerEvents: 'auto',
          overflow: 'hidden',
          cursor: 'ew-resize', // horizontal arrows for creating vertical guides
        }}
        data-rc-ruler-left
      >
        <div style={{ position: 'absolute', inset: 0 }}>{leftTicks}</div>
      </div>

      {/* Guide lines overlay (inside content area) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
        }}
      >
        {guideLines}
      </div>
    </div>
  );
}
