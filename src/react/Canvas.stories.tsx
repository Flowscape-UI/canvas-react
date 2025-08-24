import type { Meta, StoryObj } from '@storybook/react';
import React, { useState, useRef, useEffect } from 'react';
import { Canvas } from './Canvas';
import { BackgroundDots } from './BackgroundDots';
import { BackgroundCells } from './BackgroundCells';
import { NodeView } from './NodeView';
import { useCanvasNavigation } from './useCanvasNavigation';
import { cameraToCssTransform } from '../core/coords';
import {
  useCamera,
  useNodeActions,
  useNodes,
  useDeleteActions,
  useHistoryActions,
  useCanvasActions,
  useSelectedIds,
  useCanvasStore,
  useClipboardActions,
  useHasClipboard,
} from '../state/store';
import { useCanvasHelpers } from './useCanvasHelpers';
import type { CanvasNavigationOptions } from './useCanvasNavigation';
import type { BackgroundDotsProps } from './BackgroundDots';
import { GroupContainersLayer } from './GroupContainersLayer';

type CanvasStoryArgs = Required<
  Pick<
    CanvasNavigationOptions,
    | 'panButton'
    | 'panModifier'
    | 'wheelZoom'
    | 'wheelModifier'
    | 'wheelBehavior'
    | 'touchpadZoomSensitivityIn'
    | 'touchpadZoomSensitivityOut'
    | 'mouseZoomSensitivityIn'
    | 'mouseZoomSensitivityOut'
    | 'touchpadPanScale'
    | 'mousePanScale'
    | 'doubleClickZoom'
    | 'doubleClickZoomFactor'
    | 'doubleClickZoomOut'
    | 'doubleClickZoomOutModifier'
    | 'doubleClickZoomOutFactor'
    | 'keyboardPan'
    | 'keyboardPanStep'
    | 'keyboardPanSlowStep'
  >
> & {
  bgVariant: 'dots' | 'cells';
  bgSize: NonNullable<BackgroundDotsProps['size']>;
  bgDotRadius: NonNullable<BackgroundDotsProps['dotRadius']>;
  bgLineWidth: number;
  bgColorMinor: NonNullable<BackgroundDotsProps['colorMinor']>;
  bgBaseColor: NonNullable<BackgroundDotsProps['baseColor']>;
  bgDprSnap: boolean;
  canvasWidth: string;
  canvasHeight: string;
  tabIndex: number;
  // Story toggles
  showHistoryPanel: boolean;
  showHints: boolean;
  // Node appearance controls
  nodeUnstyled: boolean;
  nodeBorderColor: string;
  nodeSelectedBorderColor: string;
  nodeBorderWidth: number;
  nodeBorderRadius: number;
  nodeBackground: string;
  nodeTextColor: string;
  nodeShadow: string;
  nodeHoverShadow: string;
  nodeSelectedShadow: string;
  nodePadding: number;
  nodeFontSize: number;
  nodeFontWeight: number;
};

const meta: Meta<typeof Playground> = {
  title: 'Core/Canvas',
  component: Playground,
  tags: ['dev'],
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    bgVariant: {
      control: { type: 'radio' },
      options: ['dots', 'cells'],
      name: 'bg.variant',
    },
    panButton: {
      control: { type: 'radio' },
      options: [1, 2],
      mapping: { 1: 1, 2: 2 },
      description:
        'Mouse button for panning (1=middle, 2=right). Left button is reserved for selection/box-select.',
    },
    panModifier: {
      control: { type: 'select' },
      options: ['none', 'shift', 'alt', 'ctrl'],
    },
    wheelZoom: { control: 'boolean' },
    wheelModifier: {
      control: { type: 'select' },
      options: ['none', 'alt', 'ctrl'],
    },
    wheelBehavior: {
      control: { type: 'select' },
      options: ['auto', 'zoom', 'pan'],
      description:
        "'auto': mouse=pan (Y / Shift->X), Ctrl+wheel=zoom; touchpad: two-finger pan, pinch zoom. 'zoom': legacy zoom by wheel. 'pan': wheel always pans; zoom only with Ctrl.",
    },
    touchpadZoomSensitivityIn: {
      control: { type: 'number', min: 0.0001, max: 0.01, step: 0.0001 },
      description: 'Sensitivity for touchpad zoom-in (pixels-based deltas)',
    },
    touchpadZoomSensitivityOut: {
      control: { type: 'number', min: 0.0001, max: 0.01, step: 0.0001 },
      description: 'Sensitivity for touchpad zoom-out (pixels-based deltas)',
    },
    mouseZoomSensitivityIn: {
      control: { type: 'number', min: 0.0001, max: 0.01, step: 0.0001 },
      description: 'Sensitivity for mouse Ctrl+wheel zoom-in',
    },
    mouseZoomSensitivityOut: {
      control: { type: 'number', min: 0.0001, max: 0.01, step: 0.0001 },
      description: 'Sensitivity for mouse Ctrl+wheel zoom-out',
    },
    touchpadPanScale: {
      control: { type: 'number', min: 0.25, max: 8, step: 0.25 },
      description: 'Multiplier for two-finger touchpad pan speed',
    },
    mousePanScale: {
      control: { type: 'number', min: 0.25, max: 8, step: 0.25 },
      description: 'Multiplier for mouse wheel pan speed (Y, Shift->X)',
    },
    doubleClickZoom: { control: 'boolean' },
    doubleClickZoomFactor: { control: { type: 'number', min: 1, max: 4, step: 0.25 } },
    doubleClickZoomOut: { control: 'boolean' },
    doubleClickZoomOutModifier: {
      control: { type: 'select' },
      options: ['none', 'shift', 'alt', 'ctrl'],
    },
    doubleClickZoomOutFactor: { control: { type: 'number', min: 1, max: 4, step: 0.25 } },
    keyboardPan: { control: 'boolean' },
    keyboardPanStep: { control: { type: 'number', min: 1, max: 200, step: 1 } },
    keyboardPanSlowStep: { control: { type: 'number', min: 1, max: 200, step: 1 } },

    bgSize: { control: { type: 'number', min: 4, max: 64, step: 1 }, name: 'bg.size' },
    bgDotRadius: { control: { type: 'number', min: 0.5, max: 4, step: 0.1 }, name: 'bg.dotRadius' },
    bgLineWidth: { control: { type: 'number', min: 0.5, max: 8, step: 0.5 }, name: 'bg.lineWidth' },
    bgColorMinor: { control: 'color', name: 'bg.colorMinor' },
    bgBaseColor: { control: 'color', name: 'bg.baseColor' },
    bgDprSnap: {
      control: 'boolean',
      name: 'bg.dprSnap',
      description: 'Snap background tiling to device pixels for crisp lines/dots',
    },

    nodeUnstyled: { control: 'boolean', name: 'node.unstyled' },
    nodeBorderColor: { control: 'color', name: 'node.borderColor' },
    nodeSelectedBorderColor: { control: 'color', name: 'node.selectedBorderColor' },
    nodeBorderWidth: {
      control: { type: 'number', min: 0, max: 8, step: 1 },
      name: 'node.borderWidth',
    },
    nodeBorderRadius: {
      control: { type: 'number', min: 0, max: 40, step: 1 },
      name: 'node.borderRadius',
    },
    nodeBackground: { control: 'color', name: 'node.background' },
    nodeTextColor: { control: 'color', name: 'node.textColor' },
    nodeShadow: { control: { type: 'text' }, name: 'node.shadow' },
    nodeHoverShadow: { control: { type: 'text' }, name: 'node.hoverShadow' },
    nodeSelectedShadow: { control: { type: 'text' }, name: 'node.selectedShadow' },
    nodePadding: { control: { type: 'number', min: 0, max: 40, step: 1 }, name: 'node.padding' },
    nodeFontSize: { control: { type: 'number', min: 8, max: 48, step: 1 }, name: 'node.fontSize' },
    nodeFontWeight: {
      control: { type: 'number', min: 100, max: 900, step: 100 },
      name: 'node.fontWeight',
    },

    canvasWidth: { control: { type: 'text' } },
    canvasHeight: { control: { type: 'text' } },
    tabIndex: { control: { type: 'number', min: -1, max: 10, step: 1 } },
    showHistoryPanel: { control: 'boolean' },
    showHints: { control: 'boolean' },
  },
  args: {
    bgVariant: 'dots',
    panButton: 1,
    panModifier: 'none',
    wheelZoom: true,
    wheelModifier: 'ctrl',
    wheelBehavior: 'auto',
    touchpadZoomSensitivityIn: 0.0015,
    touchpadZoomSensitivityOut: 0.0015,
    mouseZoomSensitivityIn: 0.0015,
    mouseZoomSensitivityOut: 0.0015,
    touchpadPanScale: 1,
    mousePanScale: 4,
    doubleClickZoom: true,
    doubleClickZoomFactor: 2,
    doubleClickZoomOut: true,
    doubleClickZoomOutModifier: 'alt',
    doubleClickZoomOutFactor: 2,
    keyboardPan: true,
    keyboardPanStep: 50,
    keyboardPanSlowStep: 25,

    bgSize: 24,
    bgDotRadius: 1.2,
    bgLineWidth: 1,
    bgColorMinor: '#91919a',
    bgBaseColor: '#f7f9fb',
    bgDprSnap: true,

    canvasWidth: '100vw',
    canvasHeight: '100vh',
    tabIndex: 0,
    showHistoryPanel: false,
    showHints: true,

    // Node defaults (match NodeView defaultAppearance)
    nodeUnstyled: false,
    nodeBorderColor: '#E5E7EB',
    nodeSelectedBorderColor: '#ff0073',
    nodeBorderWidth: 1,
    nodeBorderRadius: 18,
    nodeBackground: '#FFFFFF',
    nodeTextColor: '#111827',
    nodeShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.05)',
    nodeHoverShadow: '0 8px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)',
    nodeSelectedShadow: '0 8px 20px rgba(255,0,115,0.18), 0 2px 6px rgba(17,24,39,0.08)',
    nodePadding: 10,
    nodeFontSize: 14,
    nodeFontWeight: 600,
  },
};

export default meta;

type Story = StoryObj<typeof Playground>;

function WorldLayer({ args }: { args: CanvasStoryArgs }) {
  const camera = useCamera();
  const nodes = useNodes();
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: cameraToCssTransform(camera),
        transformOrigin: '0 0',
        zIndex: 1,
      }}
    >
      {nodes.map((n) => (
        <NodeView
          key={n.id}
          node={n}
          unstyled={args.nodeUnstyled}
          appearance={{
            borderColor: args.nodeBorderColor,
            selectedBorderColor: args.nodeSelectedBorderColor,
            borderWidth: args.nodeBorderWidth,
            borderRadius: args.nodeBorderRadius,
            background: args.nodeBackground,
            textColor: args.nodeTextColor,
            shadow: args.nodeShadow,
            hoverShadow: args.nodeHoverShadow,
            selectedShadow: args.nodeSelectedShadow,
            padding: args.nodePadding,
            fontSize: args.nodeFontSize,
            fontWeight: args.nodeFontWeight,
          }}
        >
          New node - {n.id}
        </NodeView>
      ))}
    </div>
  );
}

function Controls({
  rootRef,
  showHistoryControls,
}: {
  rootRef: React.RefObject<HTMLDivElement>;
  showHistoryControls?: boolean;
}) {
  const { updateNode, removeNode } = useNodeActions();
  const { deleteSelected } = useDeleteActions();
  const nodes = useNodes();
  const selectedIds = useSelectedIds();
  const { copySelection, cutSelection, pasteClipboard } = useClipboardActions();
  const hasClipboard = useHasClipboard();
  const counterRef = useRef(1);
  const [targetId, setTargetId] = useState('');
  const { addNodeAtCenter } = useCanvasHelpers(rootRef);
  const { undo, redo } = useHistoryActions();
  const { panBy } = useCanvasActions();

  const add = () => {
    const id = `n${counterRef.current++}`;
    addNodeAtCenter({ id, width: 100, height: 60 });
  };

  const updateFirstNode = () => {
    if (nodes.length === 0) return;
    const first = nodes[0];
    updateNode(first.id, { x: first.x + 10, y: first.y + 6 });
  };

  const updateLastNode = () => {
    if (nodes.length === 0) return;
    const last = nodes[nodes.length - 1];
    updateNode(last.id, { x: last.x + 10, y: last.y + 6 });
  };

  const removeFirstNode = () => {
    if (nodes.length === 0) return;
    const first = nodes[0];
    removeNode(first.id);
  };

  const removeLastNode = () => {
    if (nodes.length === 0) return;
    const last = nodes[nodes.length - 1];
    removeNode(last.id);
  };

  const updateNodeById = () => {
    if (!targetId) return;
    const node = nodes.find((n) => n.id === targetId);
    if (!node) return;
    updateNode(node.id, { x: node.x + 10, y: node.y + 6 });
  };

  const removeNodeById = () => {
    if (!targetId) return;
    removeNode(targetId);
  };

  const removeSelectedNodes = () => {
    deleteSelected();
  };

  const panAway = () => {
    // Pan a large amount to move current nodes off-screen for demo
    panBy(2000, 1500);
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        marginBottom: 8,
        flexWrap: 'wrap',
      }}
    >
      <button type="button" onClick={add}>
        Add
      </button>
      <button type="button" onClick={updateFirstNode}>
        Update First
      </button>
      <button type="button" onClick={updateLastNode}>
        Update Last
      </button>
      <button type="button" onClick={removeFirstNode}>
        Remove First
      </button>
      <button type="button" onClick={removeLastNode}>
        Remove Last
      </button>
      <input
        type="text"
        value={targetId}
        onChange={(e) => setTargetId(e.target.value)}
        placeholder="id..."
        style={{ padding: 4, border: '1px solid #ddd', borderRadius: 4 }}
      />
      <button type="button" onClick={updateNodeById}>
        Update by Id
      </button>
      <button type="button" onClick={removeNodeById}>
        Remove by Id
      </button>
      <button type="button" onClick={removeSelectedNodes}>
        Delete Selected
      </button>
      <span style={{ margin: '0 4px', color: '#999' }}>|</span>
      <button
        type="button"
        onClick={copySelection}
        disabled={selectedIds.length === 0}
        title={
          selectedIds.length === 0 ? 'Select nodes to copy' : 'Copy selected nodes (Ctrl/Cmd+C)'
        }
      >
        Copy
      </button>
      <button
        type="button"
        onClick={cutSelection}
        disabled={selectedIds.length === 0}
        title={selectedIds.length === 0 ? 'Select nodes to cut' : 'Cut selected nodes (Ctrl/Cmd+X)'}
      >
        Cut
      </button>
      <button
        type="button"
        onClick={() => pasteClipboard({ x: 100, y: 100 })}
        disabled={!hasClipboard}
        title={!hasClipboard ? 'Clipboard is empty' : 'Paste (Ctrl/Cmd+V)'}
      >
        Paste
      </button>
      <span style={{ color: '#555' }}>count: {nodes.length}</span>
      {showHistoryControls ? (
        <>
          <span style={{ margin: '0 8px', color: '#999' }}>|</span>
          <button type="button" onClick={undo}>
            Undo
          </button>
          <button type="button" onClick={redo}>
            Redo
          </button>
          <button type="button" onClick={panAway}>
            Pan Away
          </button>
        </>
      ) : null}
    </div>
  );
}

function Playground(args: CanvasStoryArgs) {
  const ref = useRef<HTMLDivElement>(null);
  // Expose store for E2E assertions
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as { __RC_STORE: typeof useCanvasStore }).__RC_STORE = useCanvasStore;
    }
  }, []);
  useCanvasNavigation(ref, {
    panButton: args.panButton,
    panModifier: args.panModifier,
    wheelZoom: args.wheelZoom,
    wheelModifier: args.wheelModifier,
    wheelBehavior: args.wheelBehavior,
    touchpadZoomSensitivityIn: args.touchpadZoomSensitivityIn,
    touchpadZoomSensitivityOut: args.touchpadZoomSensitivityOut,
    mouseZoomSensitivityIn: args.mouseZoomSensitivityIn,
    mouseZoomSensitivityOut: args.mouseZoomSensitivityOut,
    touchpadPanScale: args.touchpadPanScale,
    mousePanScale: args.mousePanScale,
    doubleClickZoom: args.doubleClickZoom,
    doubleClickZoomFactor: args.doubleClickZoomFactor,
    doubleClickZoomOut: args.doubleClickZoomOut,
    doubleClickZoomOutModifier: args.doubleClickZoomOutModifier,
    doubleClickZoomOutFactor: args.doubleClickZoomOutFactor,
    keyboardPan: args.keyboardPan,
    keyboardPanStep: args.keyboardPanStep,
    keyboardPanSlowStep: args.keyboardPanSlowStep,
  });

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas
        ref={ref}
        style={{
          width: args.canvasWidth,
          height: args.canvasHeight,
          border: '1px solid #ddd',
          position: 'relative',
          overflow: 'hidden',
        }}
        tabIndex={args.tabIndex}
        background={
          args.bgVariant === 'cells' ? (
            <BackgroundCells
              size={args.bgSize}
              lineWidth={args.bgLineWidth}
              colorMinor={args.bgColorMinor}
              baseColor={args.bgBaseColor}
              dprSnap={args.bgDprSnap}
            />
          ) : (
            <BackgroundDots
              size={args.bgSize}
              dotRadius={args.bgDotRadius}
              colorMinor={args.bgColorMinor}
              baseColor={args.bgBaseColor}
              dprSnap={args.bgDprSnap}
            />
          )
        }
      >
        <GroupContainersLayer />
        <WorldLayer args={args} />
      </Canvas>
      {args.showHints && (
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            zIndex: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              flexDirection: 'column',
              gap: 6,
              marginBottom: 8,
            }}
          >
            <div
              style={{
                padding: 6,
                background: 'rgba(255,255,255,0.95)',
                border: '1px solid #ddd',
                borderRadius: 4,
                fontSize: 11,
                color: '#333',
                lineHeight: 1.3,
                maxWidth: 320,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 3 }}>Selection</div>
              <div>• Click: select • Ctrl+Click: toggle • Drag empty: box-select</div>
            </div>
            <div
              style={{
                padding: 6,
                background: 'rgba(255,255,255,0.95)',
                border: '1px solid #ddd',
                borderRadius: 4,
                fontSize: 11,
                color: '#333',
                lineHeight: 1.3,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 3 }}>Navigation</div>
              <div>• Wheel: pan • Shift+Wheel: pan horizontal • Ctrl+Wheel: zoom</div>
            </div>
            <div
              style={{
                padding: 6,
                background: 'rgba(255,255,255,0.95)',
                border: '1px solid #ddd',
                borderRadius: 4,
                fontSize: 11,
                color: '#333',
                lineHeight: 1.3,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 3 }}>Grouping</div>
              <div>• Press Ctrl/Cmd+G to group selected nodes</div>
              <div>• Dashed rectangles show groups with invisible hit areas for drag/drop</div>
            </div>
            {args.showHistoryPanel ? (
              <div
                style={{
                  padding: 6,
                  background: 'rgba(255,255,255,0.95)',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  fontSize: 11,
                  color: '#333',
                  lineHeight: 1.3,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 3 }}>History</div>
                <div>• Camera pans not recorded • Undo/Redo recenters off-screen nodes</div>
              </div>
            ) : null}
          </div>
          <Controls rootRef={ref} showHistoryControls={args.showHistoryPanel} />
        </div>
      )}
    </div>
  );
}

export const Basic: Story = {
  args: {
    tabIndex: 10,
    mouseZoomSensitivityIn: 0.03,
    mouseZoomSensitivityOut: 0.03,
    mousePanScale: 15,
    touchpadZoomSensitivityIn: 0.01,
    touchpadZoomSensitivityOut: 0.01,
  },

  render: (args) => <Playground {...args} />,
};

// export const HistoryAndCamera: Story = {
//   name: 'History & Camera',
//   args: {
//     showHistoryPanel: true,
//     mousePanScale: 15,
//     mouseZoomSensitivityIn: 0.03,
//     mouseZoomSensitivityOut: 0.03,
//     panButton: 2,
//   },
//   render: (args) => <Playground {...args} />,
// };
