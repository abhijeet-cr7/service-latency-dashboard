import '@testing-library/jest-dom/vitest';

// jsdom performs no layout, so every element measures 0×0 and a virtualised
// list would render no rows. Give elements a nominal viewport size.
Object.defineProperties(HTMLElement.prototype, {
  offsetHeight: { configurable: true, get: () => 420 },
  offsetWidth: { configurable: true, get: () => 800 },
});
