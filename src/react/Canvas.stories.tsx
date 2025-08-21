import type { Meta, StoryObj } from '@storybook/react';
import React, { useRef, useState } from 'react';
import { Canvas } from './Canvas';
import { BackgroundDots } from './BackgroundDots';
import { NodeView } from './NodeView';
import { useCanvasNavigation } from './useCanvasNavigation';
import { cameraToCssTransform } from '../core/coords';
import { useCamera, useNodeActions, useNodes, useDeleteActions } from '../state/store';
import { useCanvasHelpers } from './useCanvasHelpers';
import type { CanvasNavigationOptions } from './useCanvasNavigation';
import type { BackgroundDotsProps } from './BackgroundDots';

type CanvasStoryArgs = Required<
  Pick<
    CanvasNavigationOptions,
    | 'panButton'
    | 'panModifier'
    | 'wheelZoom'
    | 'wheelModifier'
    | 'wheelSensitivity'
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
  bgSize: NonNullable<BackgroundDotsProps['size']>;
  bgDotRadius: NonNullable<BackgroundDotsProps['dotRadius']>;
  bgColorMinor: NonNullable<BackgroundDotsProps['colorMinor']>;
  bgBaseColor: NonNullable<BackgroundDotsProps['baseColor']>;
  canvasWidth: string;
  canvasHeight: string;
  tabIndex: number;
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
    panButton: {
      control: { type: 'radio' },
      options: [0, 1, 2],
      mapping: { 0: 0, 1: 1, 2: 2 },
      description: 'Mouse button for panning (0=left, 1=middle, 2=right)',
    },
    panModifier: {
      control: { type: 'select' },
      options: ['none', 'shift', 'alt', 'ctrl'],
    },
    wheelZoom: { control: 'boolean' },
    wheelModifier: {
      control: { type: 'select' },
      options: ['none', 'shift', 'alt', 'ctrl'],
    },
    wheelSensitivity: { control: { type: 'number', min: 0.0001, max: 0.01, step: 0.0001 } },
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
    bgColorMinor: { control: 'color', name: 'bg.colorMinor' },
    bgBaseColor: { control: 'color', name: 'bg.baseColor' },

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
  },
  args: {
    panButton: 0,
    panModifier: 'none',
    wheelZoom: true,
    wheelModifier: 'ctrl',
    wheelSensitivity: 0.0015,
    doubleClickZoom: true,
    doubleClickZoomFactor: 2,
    doubleClickZoomOut: true,
    doubleClickZoomOutModifier: 'alt',
    doubleClickZoomOutFactor: 2,
    keyboardPan: true,
    keyboardPanStep: 50,
    keyboardPanSlowStep: 10,

    bgSize: 24,
    bgDotRadius: 1.2,
    bgColorMinor: '#91919a',
    bgBaseColor: '#f7f9fb',

    canvasWidth: '100vw',
    canvasHeight: '100vh',
    tabIndex: 0,

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

function Controls({ rootRef }: { rootRef: React.RefObject<HTMLDivElement> }) {
  const { updateNode, removeNode } = useNodeActions();
  const { deleteSelected } = useDeleteActions();
  const nodes = useNodes();
  const counterRef = useRef(1);
  const [targetId, setTargetId] = useState('');
  const { addNodeAtCenter } = useCanvasHelpers(rootRef);

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
      <span style={{ color: '#555' }}>count: {nodes.length}</span>
    </div>
  );
}

function Playground(args: CanvasStoryArgs) {
  const ref = useRef<HTMLDivElement>(null);
  useCanvasNavigation(ref, {
    panButton: args.panButton,
    panModifier: args.panModifier,
    wheelZoom: args.wheelZoom,
    wheelModifier: args.wheelModifier,
    wheelSensitivity: args.wheelSensitivity,
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
          <BackgroundDots
            size={args.bgSize}
            dotRadius={args.bgDotRadius}
            colorMinor={args.bgColorMinor}
            baseColor={args.bgBaseColor}
          />
        }
      >
        <WorldLayer args={args} />
      </Canvas>
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
          <div
            style={{
              padding: 8,
              background: 'rgba(255,255,255,0.9)',
              border: '1px solid #ddd',
              borderRadius: 6,
              maxWidth: 420,
              fontSize: 12,
              color: '#333',
              lineHeight: 1.4,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Selection tips</div>
            <div>• Click node: select only</div>
            <div>• Ctrl/Cmd + Click: toggle in selection</div>
            <div>• Click empty area (no drag): clear selection</div>
          </div>
          <div
            style={{
              padding: 8,
              background: 'rgba(255,255,255,0.9)',
              border: '1px solid #ddd',
              borderRadius: 6,
              maxWidth: 420,
              fontSize: 12,
              color: '#333',
              lineHeight: 1.4,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Keyboard & focus</div>
            <div>• Press Delete/Backspace to remove selected nodes</div>
            <div>• Canvas auto-focuses on pointer interactions</div>
            <div>• To disable auto-focus, set Canvas tabIndex to -1 (see Controls)</div>
          </div>
        </div>
        <Controls rootRef={ref} />
      </div>
    </div>
  );
}

export const Basic: Story = {
  args: {
    tabIndex: 10,
  },

  render: (args) => <Playground {...args} />,
};
