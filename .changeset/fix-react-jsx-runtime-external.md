---
"@flowscape-ui/canvas-react": patch
---

Fix: mark `react/jsx-runtime` and `react/jsx-dev-runtime` as externals in Rollup to avoid bundling React internals. This prevents runtime errors like `ReactCurrentOwner`/`__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED` under secure runtimes and mixed React environments.
