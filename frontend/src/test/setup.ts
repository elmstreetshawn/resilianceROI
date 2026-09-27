import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement the Blob URL APIs (works fine in real browsers) - components
// like PlacementCanvas that preview a local File via URL.createObjectURL need a stub.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:mock-url';
}
if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => {};
}

// jsdom doesn't actually decode images - setting an <img>'s .src never fires
// onload/onerror the way a real browser does, which is how SiteSurvey's client-side
// dimension check (new Image() + .src = objectURL) reads a photo's real width/height.
// Stub it to "load" async with generous default dimensions, so a photo that isn't
// deliberately too small in other ways (byte size, MIME type) doesn't hang forever
// waiting for an event jsdom will never send.
class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 1200;
  naturalHeight = 900;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}
// @ts-expect-error - a deliberately partial stand-in for HTMLImageElement, not the real thing
globalThis.Image = MockImage;
