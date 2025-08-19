import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { Canvas, type CanvasProps } from './Canvas';

const meta: Meta<typeof Canvas> = {
  title: 'Core/Canvas',
  component: Canvas,
  tags: ['autodocs'],
  argTypes: {
    className: { control: 'text' },
    style: { control: 'object' },
    children: { control: false },
  },
};

export default meta;

type Story = StoryObj<typeof Canvas>;

export const Basic: Story = {
  args: {
    style: { width: 800, height: 600, border: '1px solid #ddd' },
    children: (
      <div style={{ padding: 16 }}>
        <strong>@flowscape-ui/canvas-react</strong>
        <div style={{ marginTop: 8, color: '#666' }}>
          Базовый пример холста. Добавляйте свои компоненты как children.
        </div>
      </div>
    ),
  } satisfies CanvasProps,
};
