import "@testing-library/jest-dom/vitest"

// Radix UI (DropdownMenu/ContextMenu) in jsdom può richiedere PointerEvent/ResizeObserver.
if (typeof globalThis.PointerEvent === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.PointerEvent = globalThis.MouseEvent as any
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
