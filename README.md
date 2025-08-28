# @flowscape-ui/canvas-react

[![npm version](https://img.shields.io/npm/v/%40flowscape-ui%2Fcanvas-react?logo=npm&color=CB3837)](https://www.npmjs.com/package/@flowscape-ui/canvas-react)
[![Storybook](https://img.shields.io/badge/Storybook-Live-FF4785?logo=storybook&logoColor=white)](https://flowscape-ui.github.io/canvas-react/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Donate-Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=000)](https://buymeacoffee.com/flowscape)

High-performance React library for an interactive infinite canvas with nodes, pan/zoom, selection, history, and a plugin-friendly architecture.

## What's new in 1.1.1 (MVP‑0.3)

- Edit Frame overlay for selected nodes:
  - Corner resize handles at all 4 corners. Shift — keep aspect ratio. Alt — resize from center.
  - Rotate handles — circular handles outside corners, rotation around the node center. Angle‑based math relative to center.
  - Corner‑radius (inner dots) — dots inside the frame: drag to change the radius, Ctrl — uniform radius for all four corners.
  - Size badge under the frame during resize, values shown in world units (zoom‑aware).
- UX/History: temporary updates during drag and a single commit on left‑button release. Undo/Redo reverts the entire gesture in one step.
- Handle geometry now uses local coordinates inside a single rotated frame container — handles stay aligned at any rotation.

## Install

Peer deps: React 18+

```bash
bun add @flowscape-ui/canvas-react
# or
npm i @flowscape-ui/canvas-react
```

## Features
- Everything from MVP‑0.2 (see below), plus the new Edit Frame overlay (see next section).

### Edit Frame Overlay (selection UI)

Shown when a single node is selected. For a node inside a group, double‑click enters inner‑edit, and the frame appears only around that node.

Capabilities:

- Resize: drag corner handles
  - Shift — keep aspect ratio
  - Alt — resize from center
- Rotate: drag circular handles outside corners
  - Rotates around the node center
  - Uses an angle relative to center with a "rotate" cursor
- Corner‑radius: drag inner dots near each corner
  - Ctrl — uniform radius for all four corners
  - Radius is clamped to half of the shorter side
- Size badge: shows current W×H below the frame during resize

Gesture behavior and history:

- During drag, updates are temporary (not recorded in history)
- On left‑button release, a single history commit is created
- `Undo/Redo` reverts/reapplies the entire gesture in one step

Example: zero‑config — the frame and handles appear automatically when a node is selected:

```tsx
import { Canvas, NodeView, useNodes } from '@flowscape-ui/canvas-react';

export default function EditFrameDemo() {
  const nodes = useNodes();
  return (
    <Canvas style={{ width: 800, height: 600, border: '1px solid #ddd' }}>
      {nodes.map((n) => (
        <NodeView key={n.id} node={n}>
          <div style={{ padding: 8 }}>Node {n.id}</div>
        </NodeView>
      ))}
    </Canvas>
  );
}
```

UX tips:

- Rotate/resize/radius work only while the left mouse button is pressed; the gesture auto‑finishes on release or `pointercancel`.
- Panning with LMB is disabled over handles; use the middle button (default) or right button — see `useCanvasNavigation`.

## Features (MVP-0.2)
- Pan/Zoom with mouse and keyboard. Default zoom bounds: 0.5–2.4 (50–240%).
- Nodes API (add/update/remove). Minimal `NodeView` to render arbitrary content inside nodes via `children`.
- Visual Groups (UI-only): nodes can belong to purely visual groups that render rounded selection frames behind nodes.
- Selection & Grouping:
  - Click node: selects the node (unless group selection rules apply, see below).
  - Ctrl/Cmd + Click: toggles a node in the selection set.
  - Empty click: clears selection.
  - Ctrl/Cmd + G: create a visual group from the current selection (2+ nodes).
- Drag & History:
  - Drag nodes (single or multi-select) with coalesced history; Undo/Redo reverts/applies the whole drag as one action.
  - Edge auto‑pan when dragging or performing a box selection.

- Clipboard:
  - Ctrl/Cmd + C/X/V to Copy/Cut/Paste selection.
  - First paste offsets nodes to avoid exact overlap; hierarchy is preserved.

- Rulers & Guides:
  - Horizontal/vertical rulers; drag from a ruler to create a guide.
  - Hover highlights and larger hit area for easier grabbing.
  - Delete/Backspace removes the active guide. Guide drags commit as a single undoable step.

### MVP‑0.2 UX improvements

#### Inner‑edit mode (double‑click)
- Double‑click on a node inside a group enters a persistent inner‑edit mode for that node.
- While inner‑edit is active:
  - Nodes inside the selected group behave like ordinary nodes (their own selection/hover UI is shown).
  - You can select and move individual nodes inside the group; the mode persists until you click on empty canvas.

#### Group selection vs node selection
- Outside inner‑edit: clicking a node that belongs to a visual group selects the group frame (nodes do not show individual selected UI).
- Inside inner‑edit: nodes in the selected group show regular selection/hover/drag behavior.

#### Box selection (lasso) preview and drop
- When the box touches a group, the preview does not highlight inner nodes; instead it highlights the group frame.
- Group + node: preview shows the group frame plus any outside nodes hit by the lasso, and renders one combined overlay frame covering the union of the group and those nodes. Drop selects exactly that.
- Multiple groups: preview highlights all intersected groups and renders one combined overlay frame covering all of them. Drop selects the primary group frame (secondary remains visually highlighted). Node‑level preview inside groups is suppressed.

These rules make the preview during drag match the final selection after mouse up.

### Example: Basic Canvas with Navigation and Node Views

```tsx
import {
  Canvas,
  NodeView,
  useNodeActions,
  useNodes,
  useCanvasNavigation,
} from '@flowscape-ui/canvas-react';
import { useRef, useEffect } from 'react';

export default function Example() {
  const ref = useRef<HTMLDivElement | null>(null);
  useCanvasNavigation(ref, { panButton: 1 }); // pan with middle button (or 2 for right)
  const nodes = useNodes();
  const { addNode } = useNodeActions();

  useEffect(() => {
    addNode({ id: 'a', x: 50, y: 50, width: 120, height: 60 });
    addNode({ id: 'b', x: 240, y: 160, width: 120, height: 60 });
  }, [addNode]);

  return (
    <Canvas ref={ref} style={{ width: 800, height: 600, border: '1px solid #ddd' }}>
      {nodes.map((n) => (
        <NodeView key={n.id} node={n}>
          <div style={{ padding: 8 }}>
            <strong>Node {n.id}</strong>
          </div>
        </NodeView>
      ))}
    </Canvas>
  );
}
```

#### Migration from `wheelSensitivity` (breaking)

The legacy `wheelSensitivity` option has been removed. Use the device‑specific sensitivity props instead. Defaults are `0.0015`.

Before:

```tsx
useCanvasNavigation(ref, {
  wheelBehavior: 'auto',
  wheelModifier: 'ctrl',
  wheelSensitivity: 0.002,
});
```

After:

```tsx
useCanvasNavigation(ref, {
  wheelBehavior: 'auto',
  wheelModifier: 'ctrl',
  mouseZoomSensitivityIn: 0.002,
  mouseZoomSensitivityOut: 0.002,
  touchpadZoomSensitivityIn: 0.0015, // optional override
  touchpadZoomSensitivityOut: 0.0015, // optional override
});
```

### Add nodes at the visible center (regardless of zoom)

You can add nodes at the current visual center using the store action `addNodeAtCenter`:

```tsx
import { Canvas, useNodeActions } from '@flowscape-ui/canvas-react';
import { useRef } from 'react';

export default function CenterAddExample() {
  const { addNodeAtCenter } = useNodeActions();
  return (
    <>
      <button onClick={() => addNodeAtCenter({ id: crypto.randomUUID(), width: 120, height: 60 })}>
        Add at center
      </button>
      <Canvas style={{ width: 800, height: 600, border: '1px solid #ddd' }} />
    </>
  );
}
```

For embedded canvases where the element may not fill the viewport, use the helper hook `useCanvasHelpers(rootRef)` which computes the center of the actual element:

```tsx
import { Canvas, useCanvasHelpers } from '@flowscape-ui/canvas-react';
import { useRef } from 'react';

export default function EmbeddedCenterAdd() {
  const ref = useRef<HTMLDivElement | null>(null);
  const { addNodeAtCenter } = useCanvasHelpers(ref);
  return (
    <>
      <button onClick={() => addNodeAtCenter({ id: crypto.randomUUID(), width: 120, height: 60 })}>
        Add at center
      </button>
      <Canvas ref={ref} style={{ width: 640, height: 480, border: '1px solid #ddd' }} />
    </>
  );
}
```

Notes:

- The placement includes a small diagonal offset per subsequent node so that multiple adds do not overlap completely.
- The visual offset is stable across zoom levels.

## NodeView appearance (appearance, unstyled)

`NodeView` supports a minimal built-in look that you can customize or fully opt out of:

- `appearance?: Partial<NodeAppearance>` — selectively override visual tokens.
- `unstyled?: boolean` — disable built-in look entirely; you render your own HTML/CSS.

Defaults are a pill-like card: rounded corners, soft border and shadow, white background. If no `children` are provided, `NodeView` renders a centered label “New Node”. When `children` are provided, `NodeView` does not impose padding, centering or typography on your content (container visuals like border/background/shadow still apply unless `unstyled`).

Shape of `NodeAppearance`:

```ts
type NodeAppearance = {
  borderColor: string;
  selectedBorderColor: string;
  borderWidth: number;
  borderRadius: number;
  background: string;
  textColor: string;
  shadow: string;
  hoverShadow: string;
  selectedShadow?: string;
  padding: number; // applied only when no children
  fontSize: number; // applied only when no children
  fontWeight: number; // applied only when no children
};
```

### Example: Customizing NodeView visuals

```tsx
import { Canvas, NodeView, useNodes } from '@flowscape-ui/canvas-react';

export default function StyledNodes() {
  const nodes = useNodes();
  return (
    <Canvas style={{ width: 800, height: 600, border: '1px solid #ddd' }}>
      {nodes.map((n) => (
        <NodeView
          key={n.id}
          node={n}
          appearance={{
            borderColor: '#E5E7EB',
            selectedBorderColor: '#ff0073',
            borderWidth: 1,
            borderRadius: 18,
            background: '#fff',
            textColor: '#111827',
            shadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.05)',
            hoverShadow: '0 8px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)',
            selectedShadow: '0 8px 20px rgba(255,0,115,0.18), 0 2px 6px rgba(17,24,39,0.08)',
          }}
        >
          <div style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#10b981' }} />
            <strong>My Node {n.id}</strong>
          </div>
        </NodeView>
      ))}
    </Canvas>
  );
}
```

If you prefer to fully control visuals:

```tsx
<NodeView node={node} unstyled>
  <div className="my-card">Custom content</div>
  {/* Your CSS decides everything */}
  {/* Position/size still come from node.x/y/width/height */}
  {/* DnD and selection behavior are preserved */}
  {/* Tip: add your own shadows/rounded/borders via CSS classes */}
</NodeView>
```

### Selection Behavior

- Click on a node: it becomes the only selected node.
- Ctrl/Cmd + Click: toggles the clicked node in the selection set.
- Click on empty space (no mouse movement): clears selection.
- Left-drag on empty space performs box selection. Panning uses the middle (button 1) or right (button 2) mouse button.

### Keyboard & Shortcuts

- WASD/Arrow keys to pan (Shift reduces step).
- Mouse wheel zoom (configurable), double-click zoom.
- Zoom bounds: 0.5–2.4.
- Delete/Backspace: deletes all currently selected nodes.
- Ctrl/Cmd + C: copy selection.
- Ctrl/Cmd + X: cut selection.
- Ctrl/Cmd + V: paste clipboard (first paste offsets; hierarchy preserved).
- Focus behavior: the canvas automatically focuses itself on pointer down (both on nodes and empty area) so shortcuts work immediately. The root is focusable via `tabIndex` (default `0`); you can override with `<Canvas tabIndex={-1} />` to disable focus, or another value to suit your app.
- Shortcuts are ignored when the event originates from text inputs or contenteditable elements.

## Navigation Options (Wheel & Touchpad)

The hook `useCanvasNavigation(ref, options)` supports modern and legacy wheel behaviors. Default zoom bounds are 0.5–2.4 (50–240%).

- **wheelBehavior**: `'auto' | 'zoom' | 'pan'`
  - `'auto'` (default):
    - Mouse wheel pans vertically; `Shift+wheel` pans horizontally.
    - `Ctrl+wheel` zooms.
    - Touchpad: two-finger pan; pinch (`Ctrl+wheel`) zooms.
  - `'zoom'`: legacy — wheel zooms by default (respects `wheelModifier`).
  - `'pan'`: wheel always pans; zoom only with `Ctrl+wheel`/pinch.

- **wheelModifier**: `'none' | 'alt' | 'ctrl'`
  - In `'auto'`/`'pan'` modes, the modifier is ignored for pinch/`Ctrl+wheel` zoom to avoid breaking native gestures.
  - `Shift` is reserved for horizontal panning and therefore not available as a wheel modifier.

  - **Zoom sensitivities**:
    - `touchpadZoomSensitivityIn`, `touchpadZoomSensitivityOut` — for pixel-based touchpad pinch.
    - `mouseZoomSensitivityIn`, `mouseZoomSensitivityOut` — for mouse `Ctrl+wheel` zoom.
    - Defaults: if omitted, each sensitivity defaults to `0.0015`.

  - **Pan multipliers**:
    - `touchpadPanScale` — multiplier for two-finger touchpad pan speed. Defaults to `1`.
    - `mousePanScale` — multiplier for mouse wheel pan speed (vertical) and `Shift+wheel` (horizontal). Defaults to `1`.

### Example

```tsx
import { useCanvasNavigation } from '@flowscape-ui/canvas-react';
import { useRef } from 'react';

export default function Example() {
  const ref = useRef<HTMLDivElement | null>(null);
  useCanvasNavigation(ref, {
    panButton: 1,
    panModifier: 'none',
    wheelZoom: true,
    wheelModifier: 'ctrl',
    wheelBehavior: 'auto', // mouse: pan (Y / Shift->X), Ctrl+wheel: zoom; touchpad: two-finger pan + pinch zoom
    touchpadZoomSensitivityIn: 0.0015,
    touchpadZoomSensitivityOut: 0.0015,
    mouseZoomSensitivityIn: 0.0015,
    mouseZoomSensitivityOut: 0.0015,
    // Faster mouse pan, slightly slower touchpad pan
    mousePanScale: 1.5,
    touchpadPanScale: 0.8,
    doubleClickZoom: true,
    doubleClickZoomFactor: 2,
    doubleClickZoomOut: true,
    doubleClickZoomOutModifier: 'alt',
    doubleClickZoomOutFactor: 2,
    keyboardPan: true,
    keyboardPanStep: 50,
    keyboardPanSlowStep: 25,
  });

  return <Canvas ref={ref} style={{ width: 800, height: 600 }} />;
}
```

## World‑locked Backgrounds and dprSnap

- __Purpose__: keep dotted/gridded backgrounds crisp on high‑DPR displays during pan/zoom by snapping background phase to device pixels.
- __How__: only the offsets (backgroundPosition) are DPR‑snapped; the tile size (backgroundSize) stays continuous to avoid jumps while zooming. Implemented in `useWorldLockedTile()`.
- __Defaults__:
  - `BackgroundDots`/`BackgroundCells`: `dprSnap = true` (uses `window.devicePixelRatio` when available).
  - `useWorldLockedTile`: off by default — pass `true` or a number to enable.
- __When to use__: keep enabled for 1px lines/small dots to prevent blur and seams. Disable only if you need subpixel phase animation and can accept anti‑aliasing.
- __SSR/tests__: pass a number (e.g. `2`) to force DPR when `window` is not available.

Examples:

```tsx
// Dots: crisp by default
<BackgroundDots size={24} />

// Disable snapping (may blur on some zoom levels)
<BackgroundDots size={24} dprSnap={false} />
```

```tsx
// Cells: crisp 1px grid lines
<BackgroundCells size={24} lineWidth={1} />

// Force a fixed DPR (useful in tests/SSR)
<BackgroundCells size={24} dprSnap={2} />
```

Direct hook usage:

```tsx
const { style } = useWorldLockedTile({ size: 32, dprSnap: true });
return <div style={{ position: 'absolute', inset: 0, backgroundImage: '...', ...style }} />;
```

## Rulers & Guides

- Drag from the top ruler to create a horizontal guide; drag from the left ruler to create a vertical guide.
- Guides have hover highlights and a larger hit area to make selection/grab easier.
- Press Delete/Backspace to remove the currently active guide.
- Dragging a guide commits as a single history entry (undo/redo moves it back/forth in one step).

### Drag & History Behavior

- Dragging a node starts a coalesced history batch; intermediate updates are merged.
- Undo/Redo reverts/applies the entire drag in one step.
- Canvas panning is suppressed while dragging over nodes (hit-tested by `data-rc-nodeid`).

#### Camera & History

- Camera panning and zoom are transient UI state and are not recorded in history.
- Undo/Redo do not change the camera if only camera moves occurred (no node changes).
- When Undo/Redo re-adds or reveals nodes that are currently off-screen, the camera recenters to bring them into view. This happens at the same zoom level.
- Default zoom bounds remain 0.5–2.4 (50–240%).

Tip for demos/tests: Add a node, remove it, pan the camera away, then Undo — the view recenters on the restored node.

## Usage (very basic)

```tsx
import { Canvas } from '@flowscape-ui/canvas-react';

export default function App() {
  return <Canvas style={{ width: 800, height: 600, border: '1px solid #ddd' }} />;
}
```

## License

Apache-2.0
