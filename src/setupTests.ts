import '@testing-library/react'

/**
 * jsdom implements no 2D context. Rather than let each canvas mount emit a
 * jsdom "Not implemented" error, say so explicitly: `getContext` returns null,
 * which is precisely the contract `GameCanvas` degrades on. Every React-level
 * test therefore exercises the DOM fallback — the path a browser without a
 * usable canvas takes — while the painter itself is tested directly against a
 * stubbed 2D context in `GridCanvas.test.ts`.
 */
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = () => null
}
