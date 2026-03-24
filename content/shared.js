
/**
 * Subscribes to events and executes actions when events are published.
 * Uses WeakRef to prevent memory leaks by allowing garbage collection of elements.
 */
class EventSubscriber {
  #element;
  #actions = new Map()

  /**
   * Creates an event subscriber for an element.
   * @param {HTMLElement} el - The element to subscribe events for
   */
  constructor(el) {
    this.#element = new WeakRef(el);
  }

  /**
   * Updates the subscriber by executing the action for the given event.
   * @param {string} event - The event type to handle
   */
  update(event) {
    if (!this.#element.deref) return;
    this.#actions.get(event)?.();
  }

  /**
   * Subscribes an action to an event type.
   * @param {string} event - The event type to subscribe to
   * @param {Function} action - The action to execute when the event is published
   */
  subscribe(event, action) {
    this.#actions.set(event, action);
  }

  /**
   * Unsubscribes from an event type.
   * @param {string} event - The event type to unsubscribe from
   */
  unsubscribe(event) {
    this.#actions.delete(event);
  }

}

/**
 * Publishes events to registered subscribers.
 * Implements a simple pub-sub pattern for event handling.
 */
class EventPublisher {
  #subscribers = new Set()

  /**
   * Adds a subscriber to receive event notifications.
   * @param {EventSubscriber} subscriber - The subscriber to add
   */
  addSubscriber(subscriber) {
    this.#subscribers.add(subscriber);
  }

  /**
   * Removes a subscriber from receiving event notifications.
   * @param {EventSubscriber} subscriber - The subscriber to remove
   */
  removeSubscriber(subscriber) {
    this.#subscribers.delete(subscriber);
  }

  /**
   * Publishes an event to all subscribers.
   * @param {string} event - The event type to publish
   */
  publish(event) {
    this.#subscribers.forEach(sub => sub.update(event));
  }
}

/**
 * Gets all video elements that are not external preview thumbnails.
 * Filters for videos with blob URLs or no src (Instagram's actual reel videos).
 * @returns {HTMLVideoElement[]} Array of filtered video elements
 */
function getCleanVideos() {
  return [...document.querySelectorAll('video')].filter(v =>
    !v.src || v.src.startsWith("blob")
  )
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Parses HTML string and appends the resulting nodes to a container.
 * @param {HTMLElement} container - The container to append nodes to
 * @param {string} html - The HTML string to parse and append
 */
function appendParsedHTML(container, html) {
  const nodes = new DOMParser().parseFromString(html, "text/html").body.childNodes;
  for (const child of nodes) {
    container.appendChild(document.adoptNode(child));
  }
}

/**
 * Checks if the currently focused element is a text input field.
 * Used to prevent keyboard shortcuts from triggering while user is typing.
 * @returns {boolean|undefined} Returns early if the active element is an input field
 */
function isInput() {
  const { tagName, type, isContentEditable } = document.activeElement ?? {};
  console.debug('[ensureNotInput]', tagName, type, isContentEditable)
  // Ignore text input fields
  if (tagName === "INPUT" && (type === "text" || type === "search")) return true;
  if (tagName === "TEXTAREA" || isContentEditable) return true;
  return false;
}

/**
 * Stops event propagation and prevents default behavior.
 * @param {Event} event - The event to stop
 */
function stopEvent(event) {
  event.stopPropagation();
  event.stopImmediatePropagation();
  event.preventDefault();
}

/**
 * Recursively gets the nth parent element.
 * @param {HTMLElement|null} element - The starting element
 * @param {number} height - The number of parent levels to traverse
 * @returns {HTMLElement|null} The nth parent element or null if not found
 */
function getNthParent(element, height) {
  if (height == 0) return element;
  if (!element && height > 0) return null;
  return getNthParent(element.parentElement, --height);
}

/**
 * Manages the toolbar mode preference (custom vs native Instagram toolbar).
 * Persists the choice to browser storage and reflects it as a body class.
 */
class ToolbarMode {
  static #mode = "custom";

  static #StorageKey = "reelsleek-toolbar-mode";

  static get mode() { return this.#mode; }

  static isCustom() { return this.#mode === "custom"; }

  static async setup() {
    const result = await browser.storage.local.get([this.#StorageKey]);
    this.#mode = result[this.#StorageKey] ?? "custom";
    this.#applyBodyClass();
  }

  static setMode(mode) {
    this.#mode = mode;
    browser.storage.local.set({ [this.#StorageKey]: mode });
    this.#applyBodyClass();
  }

  static #applyBodyClass() {
    document.body.classList.toggle("reelsleek-custom-toolbar", this.#mode === "custom");
  }
}

function attachToolbar(video) {
  if (!ToolbarMode.isCustom()) return;
  if (video.parentElement.querySelector('.reelsleek-toolbar')) return;

  const logoUrl = browser.runtime.getURL('icons/logo-no-bg.png');
  const html = `
    <button class="reelsleek-toolbar-toggle" aria-label="ReelSleek Controls" title="ReelSleek Controls">
      <img class="reelsleek-toolbar-logo" src="${logoUrl}" alt="ReelSleek">
    </button>
    <div class="reelsleek-toolbar-container"></div>
  `;

  const container = document.createElement("div");
  container.className = "reelsleek-toolbar";
  appendParsedHTML(container, html);

  video.parentElement.prepend(container);
}