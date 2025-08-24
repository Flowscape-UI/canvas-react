// Shared test setup for Vitest
// Suppress React act warnings in jsdom environment
// See: https://react.dev/reference/react/StrictMode#turn-off-warning-about-not-wrapping-updates-in-act
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// You can add more shared mocks/polyfills here if needed.
