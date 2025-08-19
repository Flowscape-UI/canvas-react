import type React from 'react';

export type CanvasProps = {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

export function Canvas({ className, style, children }: CanvasProps) {
  return (
    <div className={className} style={style} data-rc-canvas>
      {children}
    </div>
  );
}
