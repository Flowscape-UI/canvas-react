import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { Canvas } from './Canvas';
import { useCamera, useCanvasActions } from '../state/store';
import { cameraToCssTransform } from '../core/coords';

const meta: Meta<typeof Canvas> = {
  title: 'Core/Camera',
  component: Canvas,
  tags: ['dev'],
};

export default meta;

type Story = StoryObj<typeof Canvas>;

function Controls() {
  const camera = useCamera();
  const { panBy, zoomTo, zoomByAt } = useCanvasActions();

  const anchor = { x: 400, y: 300 }; // center of 800x600 viewport

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
      <button type="button" onClick={() => zoomByAt(anchor, 1.25)}>Zoom In</button>
      <button type="button" onClick={() => zoomByAt(anchor, 0.8)}>Zoom Out</button>
      <button type="button" onClick={() => panBy(-50, 0)}>←</button>
      <button type="button" onClick={() => panBy(50, 0)}>→</button>
      <button type="button" onClick={() => panBy(0, -50)}>↑</button>
      <button type="button" onClick={() => panBy(0, 50)}>↓</button>
      <button type="button" onClick={() => zoomTo(1)}>Reset Zoom</button>
      <span style={{ marginLeft: 8, color: '#555' }}>
        zoom: {camera.zoom.toFixed(2)} | offset: ({camera.offsetX.toFixed(0)}, {camera.offsetY.toFixed(0)})
      </span>
    </div>
  );
}

function WorldLayer() {
  const camera = useCamera();
  return (
    <div style={{ position: 'absolute', inset: 0, transform: cameraToCssTransform(camera), transformOrigin: '0 0' }}>
      {/* Big world area with a light grid */}
      <div
        style={{
          position: 'relative',
          width: 2000,
          height: 2000,
          backgroundImage:
            'repeating-linear-gradient(0deg, #f8f8f8 0 19px, #eaeaea 19px 20px), repeating-linear-gradient(90deg, #f8f8f8 0 19px, #eaeaea 19px 20px)',
        }}
      >
        {/* Markers at known world coords */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 12, background: '#e11', borderRadius: 2 }} />
        <div style={{ position: 'absolute', left: 100, top: 100, width: 12, height: 12, background: '#16f', borderRadius: 2 }} />
        <div style={{ position: 'absolute', left: 400, top: 300, width: 12, height: 12, background: '#1a1', borderRadius: 2 }} />
      </div>
    </div>
  );
}

export const Playground: Story = {
  render: () => (
    <div>
      <Controls />
      <Canvas style={{ width: 800, height: 600, border: '1px solid #ddd', position: 'relative', overflow: 'hidden' }}>
        <WorldLayer />
      </Canvas>
    </div>
  ),
};
