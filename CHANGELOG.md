# @flowscape-ui/canvas-react

## 1.0.0

### Major Changes

- Remove deprecated `wheelSensitivity`; clarify zoom sensitivities; document `dprSnap`.
  - BREAKING: removed `wheelSensitivity` from `useCanvasNavigation` and Storybook controls.
    - Legacy `wheelBehavior: 'zoom'` now uses device-specific sensitivities consistently.
    - Migration:
      - Before:
        ```ts
        useCanvasNavigation(ref, {
          wheelBehavior: 'auto',
          wheelModifier: 'ctrl',
          wheelSensitivity: 0.002,
        });
        ```
      - After:
        ```ts
        useCanvasNavigation(ref, {
          wheelBehavior: 'auto',
          wheelModifier: 'ctrl',
          mouseZoomSensitivityIn: 0.002,
          mouseZoomSensitivityOut: 0.002,
          // optional touchpad overrides
          touchpadZoomSensitivityIn: 0.0015,
          touchpadZoomSensitivityOut: 0.0015,
        });
        ```
  - Zoom sensitivity defaults: when omitted, each of `mouseZoomSensitivityIn/Out` and `touchpadZoomSensitivityIn/Out` defaults to `0.0015`.
  - Docs: added a dedicated `dprSnap` section for world-locked backgrounds (`BackgroundDots`, `BackgroundCells`) with examples and SSR/test guidance (numeric DPR override).
  - Docs: updated Navigation Options section and added a migration note with before/after snippets.
  - Behavior note: in `'auto'`/`'pan'`, the wheel modifier is ignored for pinch/`Ctrl+wheel` zoom; `Shift` is reserved for horizontal panning.
  - Housekeeping: rebuilt `dist/` and Storybook static.

## 0.1.3

### Patch Changes

- [#11](https://github.com/Flowscape-UI/canvas-react/pull/11) [`4f29868`](https://github.com/Flowscape-UI/canvas-react/commit/4f298683d15ceedfa47a6eb2359e0b4376927264) Thanks [@binary-shadow](https://github.com/binary-shadow)! - - test: add NodeView drag-and-drop UI test verifying hit-testing (no canvas pan), node move, and single history batch
  - chore: add PointerEvent polyfill for jsdom tests
  - docs(README): document DnD behavior, hit-testing, and history batching/undo-redo
  - docs(tasklist): mark CORE-05c/CORE-05d/CORE-06 and CORE-05 as done

## 0.1.2

### Patch Changes

- [`3d2a6c0`](https://github.com/Flowscape-UI/canvas-react/commit/3d2a6c0f98a3b0d9509fb566550aee700cc734ca) Thanks [@binary-shadow](https://github.com/binary-shadow)! - Fix: mark `react/jsx-runtime` and `react/jsx-dev-runtime` as externals in Rollup to avoid bundling React internals. This prevents runtime errors like `ReactCurrentOwner`/`__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED` under secure runtimes and mixed React environments.

## 0.1.1

### Patch Changes

- [`18e6463`](https://github.com/Flowscape-UI/canvas-react/commit/18e646301d67f422b385fcf7211504a010fe61d6) Thanks [@binary-shadow](https://github.com/binary-shadow)! - chore(release): initial release setup via CI and Changesets
  - Add CI workflow (typecheck/lint/test/build/storybook:build)
  - Add Release workflow (Changesets + npm publish with provenance)
  - Add repository policies (SECURITY.md, CONTRIBUTING.md, CODEOWNERS)
