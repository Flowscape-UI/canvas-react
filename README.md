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

## Usage (very basic)

```tsx
import { Canvas } from '@flowscape-ui/canvas-react';

export default function App() {
  return <Canvas style={{ width: 800, height: 600, border: '1px solid #ddd' }} />;
}
```

## License

Apache-2.0
