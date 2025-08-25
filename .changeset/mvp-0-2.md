---
"@flowscape-ui/canvas-react": minor
---

MVP 0.2

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

