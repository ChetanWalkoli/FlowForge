import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';

class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver;
}

if (typeof window !== 'undefined' && !window.DOMMatrixReadOnly) {
  class DOMMatrixReadOnlyPolyfill {
    m22 = 1;
    is2D = true;
    isIdentity = true;
  }
  window.DOMMatrixReadOnly =
    DOMMatrixReadOnlyPolyfill as unknown as typeof DOMMatrixReadOnly;
}
