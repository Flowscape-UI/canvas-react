# @flowscape-ui/canvas-react

## 0.1.2

### Patch Changes

- [`3d2a6c0`](https://github.com/Flowscape-UI/canvas-react/commit/3d2a6c0f98a3b0d9509fb566550aee700cc734ca) Thanks [@binary-shadow](https://github.com/binary-shadow)! - Fix: mark `react/jsx-runtime` and `react/jsx-dev-runtime` as externals in Rollup to avoid bundling React internals. This prevents runtime errors like `ReactCurrentOwner`/`__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED` under secure runtimes and mixed React environments.

## 0.1.1

### Patch Changes

- [`18e6463`](https://github.com/Flowscape-UI/canvas-react/commit/18e646301d67f422b385fcf7211504a010fe61d6) Thanks [@binary-shadow](https://github.com/binary-shadow)! - chore(release): initial release setup via CI and Changesets
  - Add CI workflow (typecheck/lint/test/build/storybook:build)
  - Add Release workflow (Changesets + npm publish with provenance)
  - Add repository policies (SECURITY.md, CONTRIBUTING.md, CODEOWNERS)
