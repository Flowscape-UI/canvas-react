# @flowscape-ui/canvas-react

## 1.1.1

### Patch Changes

- [#23](https://github.com/Flowscape-UI/canvas-react/pull/23) [`5ab554b`](https://github.com/Flowscape-UI/canvas-react/commit/5ab554bb34f4f87f2cc51fac5c52047cea6762ff) Thanks [@binary-shadow](https://github.com/binary-shadow)! - MVP 0.3: Edit Frame handles and UX improvements

  Added
  - Edit Frame overlay: corner resize handles (4 corners). Shift keeps aspect; Alt resizes from center.
  - Rotate handles: dedicated circular handles outside corners; rotation around node center. Angle-based rotation math.
  - Corner‑radius handles (inner dots): drag to change radius; Ctrl — uniform radius for all four corners.
  - Size badge (W×H) under the frame during resize with zoom-aware values.

  Changed
  - Resize uses fixed opposite corner; temporary vs commit updates ensure a single clean history entry per gesture.
  - Corner‑radius gesture UX: finishes strictly on LMB release, guards by pointerId, commits on pointercancel.
  - Handle positioning now happens inside a single rotated container so handles stay aligned while rotating.

  Fixed
  - Prevent "stuck drag" after radius gesture due to missing button state checks.
  - Rotate/radius/resize handle misalignment when node is rotated.
  - Minor cursor/title hints for handle tooltips.

## 1.1.0

### Minor Changes

- [#14](https://github.com/Flowscape-UI/canvas-react/pull/14) [`1f0991c`](https://github.com/Flowscape-UI/canvas-react/commit/1f0991c0baee961a2a2eb8c998146961dbddc17b) Thanks [@NiceArti](https://github.com/NiceArti)! - MVP 0.2

  Added
  - Inner‑edit mode: double‑click a node inside a visual group to enter a persistent inner‑edit. While active, nodes in the selected group behave like ordinary nodes (their own selection/hover UI), can be selected/toggled/dragged individually. Mode persists until clicking on empty canvas.
  - Box selection (lasso) preview parity with drop:
    - Touching a group highlights the group frame (no inner node preview).
    - Group + outside node(s): preview shows the group frame, highlights outside nodes only, and renders a single combined overlay covering the union. Drop selects exactly that.
    - Multiple groups: preview highlights all intersected group frames and renders one combined overlay covering all selected groups.
  - Edge auto‑pan during lasso (parity with node drag).
  - Clipboard (Copy/Cut/Paste):
    - Ctrl/Cmd + C/X/V keyboard shortcuts.
    - First paste offsets nodes to avoid exact overlap; hierarchy is preserved.
    - Store actions support programmatic copy/cut/paste.
  - Rulers & Guides:
    - Drag from top/left ruler to create horizontal/vertical guides.
    - Hover highlights and larger hit area for easier grabbing.
    - Delete/Backspace removes the active guide.
    - Guide drags commit as a single undoable step (clean undo/redo).

  Changed
  - Clicking a node that belongs to a visual group (outside inner‑edit) selects the group frame; inner node selection visuals are suppressed.
  - While inner‑edit is active, node selection/hover visuals inside the selected group are enabled and behave like ordinary nodes.
  - Default zoom bounds changed to 0.5–2.4 (50–240%).

  Fixed
  - Incorrect lasso preview that appeared to select inner nodes of a group instead of the group frame.
  - Lasso preview mismatch between drag and drop when selecting between a group and nodes outside it.
  - Preview when intersecting two groups: now shows frames of all intersected groups plus a single combined overlay.

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
