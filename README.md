# @flowscape-ui/canvas-react

[![npm version](https://img.shields.io/npm/v/%40flowscape-ui%2Fcanvas-react?logo=npm&color=CB3837)](https://www.npmjs.com/package/@flowscape-ui/canvas-react)
[![Storybook](https://img.shields.io/badge/Storybook-Live-FF4785?logo=storybook&logoColor=white)](https://flowscape-ui.github.io/canvas-react/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Donate-Buy%20Me%20a%20Coffee-FFDD00?logo=buymeacoffee&logoColor=000)](https://buymeacoffee.com/flowscape)

High-performance React library for an interactive infinite canvas with nodes, pan/zoom, selection, history, and a plugin-friendly architecture.

## Install

Peer deps: React 18+

```bash
bun add @flowscape-ui/canvas-react
# or
npm i @flowscape-ui/canvas-react
```

## Features (MVP-0.1)

- Pan/Zoom with mouse and keyboard. Default zoom bounds: 0.6–2.4 (60–240%).
- Nodes API (add/update/remove). Minimal `NodeView` to render arbitrary content inside nodes via `children`.
- Selection:
  - Single select: left-click on a node.
  - Multi-select: Ctrl/Cmd + left-click toggles node in selection.
  - Deselect: left-click on empty canvas area (a simple click without dragging).
  - Shift is reserved for future features (e.g., range/box selection).
 - Drag & History:
   - Drag nodes (single or multi-select) without panning the canvas thanks to hit-testing.
   - Dragging batches updates into a single history entry; Undo/Redo reverts/applies the whole drag as one action.

### Example: Basic Canvas with Navigation and Node Views

```tsx
import { Canvas, NodeView, useNodeActions, useNodes, useCanvasNavigation } from '@flowscape-ui/canvas-react';
import { useRef, useEffect } from 'react';

export default function Example() {
  const ref = useRef<HTMLDivElement | null>(null);
  useCanvasNavigation(ref, { panButton: 0 });
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
  padding: number;      // applied only when no children
  fontSize: number;     // applied only when no children
  fontWeight: number;   // applied only when no children
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
- Dragging on empty space pans the canvas and does not change selection.

### Keyboard & Shortcuts

- WASD/Arrow keys to pan (Shift reduces step).
- Mouse wheel zoom (configurable), double-click zoom.
- Zoom bounds: 0.6–2.4.
- Delete/Backspace: deletes all currently selected nodes.
- Focus behavior: the canvas automatically focuses itself on pointer down (both on nodes and empty area) so shortcuts work immediately. The root is focusable via `tabIndex` (default `0`); you can override with `<Canvas tabIndex={-1} />` to disable focus, or another value to suit your app.
- Shortcuts are ignored when the event originates from text inputs or contenteditable elements.

### Drag & History Behavior

- Dragging a node starts a coalesced history batch; intermediate updates are merged.
- Undo/Redo reverts/applies the entire drag in one step.
- Canvas panning is suppressed while dragging over nodes (hit-tested by `data-rc-nodeid`).

## Usage (very basic)

```tsx
import { Canvas } from '@flowscape-ui/canvas-react';

export default function App() {
  return <Canvas style={{ width: 800, height: 600, border: '1px solid #ddd' }} />;
}
```

## License

Apache-2.0
