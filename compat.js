// Cross-browser compatibility shim.
// Firefox exposes the WebExtension API as `browser.*` (always Promise-based).
// Chrome MV3 exposes it as `chrome.*` (Promise-based since Chrome 88+).
// This shim makes `browser` available in Chrome by aliasing it to `chrome`.
if (typeof globalThis.browser === 'undefined') {
  globalThis.browser = chrome;
}
