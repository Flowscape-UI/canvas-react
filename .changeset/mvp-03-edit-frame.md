---
'@flowscape-ui/canvas-react': patch
---

MVP 0.3: Edit Frame handles and UX improvements

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
