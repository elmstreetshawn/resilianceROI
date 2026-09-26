import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement the Blob URL APIs (works fine in real browsers) - components
// like PlacementCanvas that preview a local File via URL.createObjectURL need a stub.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:mock-url';
}
if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => {};
}
