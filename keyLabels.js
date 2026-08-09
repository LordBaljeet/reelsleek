/**
 * Shared key-code formatting helpers.
 * Loaded by both the content scripts (to keep control titles like
 * "Download video (D)" in sync) and the popup (to render the Keybinds tab).
 */

const KEYBIND_LABEL_OVERRIDES = {
  Space: "Space",
  ArrowRight: "→",
  ArrowLeft: "←",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Minus: "−",
  Equal: "=",
  Escape: "Esc",
  Tab: "Tab",
  Backquote: "`",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
};

/**
 * Formats a KeyboardEvent.code into a short human-readable label.
 * e.g. "KeyD" -> "D", "ArrowRight" -> "→", "Digit1" -> "1"
 * @param {string} code
 * @returns {string}
 */
function formatKeybindLabel(code) {
  if (!code) return "—";
  if (KEYBIND_LABEL_OVERRIDES[code]) return KEYBIND_LABEL_OVERRIDES[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

/**
 * Keys that can't be reassigned via the popup's key-capture control
 * (used to escape/cancel the capture instead).
 */
const KEYBIND_RESERVED_CODES = new Set(["Escape", "Tab"]);
