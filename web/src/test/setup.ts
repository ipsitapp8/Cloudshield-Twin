import '@testing-library/jest-dom/vitest'

// Older jsdom doesn't implement ResizeObserver, which @xyflow/react requires.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub

if (!('IS_REACT_ACT_ENVIRONMENT' in globalThis)) {
  // @ts-expect-error -- react-dom test flag
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
}
