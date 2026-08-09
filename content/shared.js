/**
 * Subscribes to events and executes actions when events are published.
 * Uses WeakRef to prevent memory leaks by allowing garbage collection of elements.
 */
class EventSubscriber {
  #element;
  #actions = new Map();

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
  update(event, ...args) {
    if (!this.#element.deref) return;
    this.#actions.get(event)?.(...args);
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
  #subscribers = new Set();

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
  publish(event, ...args) {
    this.#subscribers.forEach((sub) => sub.update(event, ...args));
  }
}

/**
 * Gets all video elements that are not external preview thumbnails.
 * Filters for videos with blob URLs or no src (Instagram's actual reel videos).
 * @returns {HTMLVideoElement[]} Array of filtered video elements
 */
function getCleanVideos() {
  return [...document.querySelectorAll("video")].filter(
    (v) => !v.src || v.src.startsWith("blob"),
  );
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Parses HTML string and appends the resulting nodes to a container.
 * @param {HTMLElement} container - The container to append nodes to
 * @param {string} html - The HTML string to parse and append
 */
function appendParsedHTML(container, html) {
  const nodes = new DOMParser().parseFromString(html, "text/html").body
    .childNodes;
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
  console.debug("[ensureNotInput]", tagName, type, isContentEditable);
  // Ignore text input fields
  if (tagName === "INPUT" && (type === "text" || type === "search"))
    return true;
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

  static get mode() {
    return this.#mode;
  }

  static isCustom() {
    return this.#mode === "custom";
  }

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
    document.body.classList.toggle(
      "reelsleek-custom-toolbar",
      this.#mode === "custom",
    );
  }
}

/**
 * Controls the corner radius of the floating control panels (fullscreen
 * container, play button, audio control) — "sm" (squared) or "round".
 * Purely a CSS toggle: applying it just flips a body class that base.css
 * uses to swap the shared --reelsleek-control-radius-mode token.
 */
class ControlRadius {
  static #mode = "sm";

  static #StorageKey = "reelsleek-control-radius-mode";

  static get mode() {
    return this.#mode;
  }

  static async setup() {
    const result = await browser.storage.local.get([this.#StorageKey]);
    this.#mode = result[this.#StorageKey] ?? "sm";
    this.#applyBodyClass();
  }

  static setMode(mode) {
    this.#mode = mode;
    browser.storage.local.set({ [this.#StorageKey]: mode });
    this.#applyBodyClass();
  }

  static #applyBodyClass() {
    document.body.classList.toggle(
      "reelsleek-radius-round",
      this.#mode === "round",
    );
  }
}

/**
 * Controls the relative order in which the four toggleable feature buttons
 * (theater mode, autoscroll, download, rotate) are attached to a video.
 * Since each module's DOM-insertion logic places its button immediately
 * adjacent to whatever was inserted just before it (in both custom-toolbar
 * and native-IG modes), simply calling .attach() in this order is enough to
 * control their actual on-page visual order — no extra DOM surgery needed.
 */
class FeatureOrder {
  static #StorageKey = "reelsleek-controls-feature-order";
  static #defaultOrder = ["theater", "autoscroll", "download", "rotate"];

  static order = [...FeatureOrder.#defaultOrder];

  static async setup() {
    const result = await browser.storage.local.get([FeatureOrder.#StorageKey]);
    FeatureOrder.order = FeatureOrder.#normalize(result[FeatureOrder.#StorageKey]);
  }

  /**
   * @param {string[]} order
   */
  static setOrder(order) {
    FeatureOrder.order = FeatureOrder.#normalize(order);
    browser.storage.local.set({
      [FeatureOrder.#StorageKey]: FeatureOrder.order,
    });
  }

  /**
   * Ensures a saved order only contains known feature ids, and appends any
   * ids missing from it (e.g. a feature added in a later version) at the end.
   * @param {unknown} order
   * @returns {string[]}
   */
  static #normalize(order) {
    if (!Array.isArray(order)) return [...FeatureOrder.#defaultOrder];
    const valid = order.filter((id) => FeatureOrder.#defaultOrder.includes(id));
    const missing = FeatureOrder.#defaultOrder.filter((id) => !valid.includes(id));
    return [...valid, ...missing];
  }

  /**
   * Attaches the four reorderable feature modules to a video in the user's
   * chosen order. Fullscreen/audio/ambient are unaffected — they aren't
   * user-orderable.
   * @param {HTMLVideoElement} video
   */
  static attachAll(video) {
    const attachers = {
      theater: () => TheaterMode.attach(video),
      autoscroll: () => AutoScroll.attach(video),
      download: () => Download.attach(video),
      rotate: () => Rotate.attach(video),
    };
    FeatureOrder.order.forEach((id) => attachers[id]?.());
  }

  /**
   * Detaches and re-attaches all four reorderable features on every video,
   * guaranteeing they land in the user's chosen order — used whenever the
   * order itself changes, or a previously-disabled feature comes back on
   * (so it re-inserts at its saved position rather than just at the end).
   */
  static reattachAll() {
    const videos = getCleanVideos();
    videos.forEach((video) => {
      Download.detach(video);
      TheaterMode.detach(video);
      Rotate.detach(video);
      AutoScroll.detach(video);
    });
    videos.forEach((video) => FeatureOrder.attachAll(video));
  }
}

function attachToolbar(video) {
  //do not attach toolbar to reels if not in custom mode
  if (PageHandler.isReel() && !ToolbarMode.isCustom()) return;
  //do not attach if its a story
  if (PageHandler.isStorie()) return;
  //do not attach toolbar if already present
  if (video.parentElement.querySelector(".reelsleek-toolbar")) return;

  const logoUrl = browser.runtime.getURL("icons/logo-no-bg.png");
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

function addKeybind(key, action) {
  document.body.addEventListener("keydown", async (e) => {
    if (isInput()) return;
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (e.code === key) {
      action?.(e);
    }
  });
}

/**
 * Central registry + dispatcher for user-overridable keyboard shortcuts.
 * Modules register their shortcuts once via registerKeybind(); the active
 * key for each one is resolved at keydown-time, so overrides saved from the
 * popup take effect immediately without any module re-registering anything.
 */
class Keybinds {
  static #StorageKey = "reelsleek-keybind-overrides";

  /** @type {Map<string, {id:string, defaultKey:string, label:string, category:string, action:Function}>} */
  static #registry = new Map();
  static #order = [];
  static #overrides = {};
  static #listenerAttached = false;

  /**
   * Registers a user-configurable shortcut.
   * @param {string} id - Stable identifier, used for storage + popup wiring.
   * @param {string} defaultKey - Default KeyboardEvent.code (e.g. "KeyD").
   * @param {string} label - Human readable description shown in the popup.
   * @param {string} category - Grouping shown in the popup (e.g. "Playback").
   * @param {(e: KeyboardEvent) => void} action - Handler to run when pressed.
   */
  static register(id, defaultKey, label, category, action) {
    if (!Keybinds.#registry.has(id)) Keybinds.#order.push(id);
    Keybinds.#registry.set(id, { id, defaultKey, label, category, action });
    Keybinds.#ensureListener();
  }

  static #ensureListener() {
    if (Keybinds.#listenerAttached) return;
    Keybinds.#listenerAttached = true;
    document.body.addEventListener("keydown", (e) => {
      if (isInput()) return;
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      for (const def of Keybinds.#registry.values()) {
        const active = Keybinds.#overrides[def.id] ?? def.defaultKey;
        if (active && e.code === active) {
          def.action(e);
        }
      }
    });
  }

  /**
   * Loads any saved overrides from storage. Should be awaited early during
   * page setup, before the user has a realistic chance to press a key.
   */
  static async setup() {
    const result = await browser.storage.local.get([Keybinds.#StorageKey]);
    Keybinds.#overrides = result[Keybinds.#StorageKey] ?? {};
    Keybinds.applyTitles(document);
  }

  static #persist() {
    browser.storage.local.set({
      [Keybinds.#StorageKey]: Keybinds.#overrides,
    });
    Keybinds.applyTitles(document);
  }

  /**
   * @param {string} id
   * @returns {string|null} The currently active KeyboardEvent.code for this shortcut.
   */
  static keyFor(id) {
    const def = Keybinds.#registry.get(id);
    if (!def) return null;
    return Keybinds.#overrides[id] ?? def.defaultKey;
  }

  /**
   * @returns {Array<{id:string,label:string,category:string,defaultKey:string,key:string,isCustom:boolean}>}
   */
  static list() {
    return Keybinds.#order
      .map((id) => Keybinds.#registry.get(id))
      .filter(Boolean)
      .map((def) => ({
        id: def.id,
        label: def.label,
        category: def.category,
        defaultKey: def.defaultKey,
        key: Keybinds.#overrides[def.id] ?? def.defaultKey,
        isCustom: Object.prototype.hasOwnProperty.call(
          Keybinds.#overrides,
          def.id,
        ),
      }));
  }

  /**
   * @param {string} key - KeyboardEvent.code to check.
   * @param {string} excludeId - Id to exclude from the search (the one being reassigned).
   * @returns {string|null} The id of the shortcut already bound to `key`, if any.
   */
  static findConflict(key, excludeId) {
    for (const def of Keybinds.#registry.values()) {
      if (def.id === excludeId) continue;
      const active = Keybinds.#overrides[def.id] ?? def.defaultKey;
      if (active === key) return def.id;
    }
    return null;
  }

  /**
   * Assigns a new key to a shortcut, persists it, and clears the key from
   * any other shortcut that was already using it (last write wins).
   * @param {string} id
   * @param {string} key
   */
  static setKey(id, key) {
    if (!Keybinds.#registry.has(id))
      return { ok: false, error: "Unknown keybind" };
    if (!key) return { ok: false, error: "No key provided" };

    const conflictId = Keybinds.findConflict(key, id);
    let clearedLabel = null;
    if (conflictId) {
      delete Keybinds.#overrides[conflictId];
      clearedLabel = Keybinds.#registry.get(conflictId)?.label ?? null;
    }
    Keybinds.#overrides[id] = key;
    Keybinds.#persist();
    return { ok: true, clearedLabel };
  }

  static resetKey(id) {
    delete Keybinds.#overrides[id];
    Keybinds.#persist();
    return { ok: true };
  }

  static resetAll() {
    Keybinds.#overrides = {};
    Keybinds.#persist();
    return { ok: true };
  }

  /**
   * Keeps `title` attributes of elements marked with [data-keybind-id] in
   * sync with the currently active key, e.g. "Download video (D)".
   * Safe to call on a detached DocumentFragment before it's inserted.
   * @param {ParentNode} root
   */
  static applyTitles(root) {
    root?.querySelectorAll?.("[data-keybind-id]").forEach((el) => {
      const id = el.dataset.keybindId;
      const base = el.dataset.keybindTitle;
      if (!base) return;
      const key = Keybinds.keyFor(id);
      el.title = key ? `${base} (${formatKeybindLabel(key)})` : base;
    });
  }
}

/**
 * Registers a user-configurable keyboard shortcut. Thin wrapper around
 * Keybinds.register() so call sites read consistently with the fixed,
 * non-configurable addKeybind() above.
 * @param {string} id
 * @param {string} defaultKey
 * @param {string} label
 * @param {string} category
 * @param {(e: KeyboardEvent) => void} action
 */
function registerKeybind(id, defaultKey, label, category, action) {
  Keybinds.register(id, defaultKey, label, category, action);
}

class PageHandler {
  static #videoType = {
    STORIE: "storie",
    REEL: "reel",
    POST: "post",
    FEED: "feed",
    MESSAGE: "message",
  };

  static getVideoType() {
    const pathname = window.location.pathname;
    if (pathname.includes("/stories/")) {
      return this.#videoType.STORIE;
    } else if (pathname.includes("/reels/")) {
      return this.#videoType.REEL;
    } else if (pathname.includes("/p/")) {
      return this.#videoType.POST;
    } else if (pathname.includes("/direct/")) {
      return this.#videoType.MESSAGE;
    }
    return this.#videoType.FEED;
  }

  static isStorie() {
    return this.getVideoType() == this.#videoType.STORIE;
  }

  static isReel() {
    return this.getVideoType() == this.#videoType.REEL;
  }

  static isPost() {
    return this.getVideoType() == this.#videoType.POST;
  }

  static isFeed() {
    return this.getVideoType() == this.#videoType.FEED;
  }

  static isMessage() {
    return this.getVideoType() == this.#videoType.MESSAGE;
  }

  /**
   * Extracts the shortcode/id segment from a reel or post URL, e.g.
   * "/reel/ABC123/" or "/p/ABC123/" -> "ABC123".
   * @returns {string|null} The shortcode, or null if the current page has none
   */
  static getShortcode() {
    const match = window.location.pathname.match(
      /\/(?:reel|reels|p|tv)\/([^/]+)/,
    );
    return match ? match[1] : null;
  }
}

const getToolbar = (video) => {
  if(PageHandler.isReel()) {
    const parent = video.closest('[style*="--x-width"]');
    if (!parent) return null;
    const toolbar = parent.nextElementSibling;
    if (!toolbar) return null;
    return toolbar;
  }

  if (PageHandler.isFeed()) {
    const article = video.closest('article');
    if (!article) return null;
    return article.querySelector('section > div') || null;
  }
  return null;
}
