/**
 * UI MODULE: TheaterModeModule
 * Handles local layout injections, DOM positioning lookups, and interface mutations.
 */
class TheaterModeModule {
  constructor(video, templateElement, isEnabled, toggleCallback, eventsPublisher, toggleEvent) {
    this.video = video;
    this.button = null;

    if (!templateElement) return;

    // 1. Deep clone structural component elements out of the document template node
    const clone = document.importNode(templateElement.content, true);
    this.button = clone.querySelector(".reelsleek-theater-mode");
    if (!this.button) return;

    // 2. Assign configuration attributes and interactions
    this.button.setAttribute("aria-pressed", String(isEnabled));
    this.button.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleCallback();
    });

    // 3. Register state subscriber updates directly to the node instance
    this.buttonSubscriber = new EventSubscriber(this.button);
    this.buttonSubscriber.subscribe(toggleEvent, () => {
      this.button.setAttribute("aria-pressed", String(TheaterMode.enabled));
    });
    eventsPublisher.addSubscriber(this.buttonSubscriber);

    // 4. Inject structural components into targeted document nodes
    this.#injectUI(clone);
  }

  #injectUI(fragment) {
    if (ToolbarMode.isCustom()) {
      const toolbarContainer = this.video.parentElement.querySelector('.reelsleek-toolbar-container');
      if (!toolbarContainer || toolbarContainer.querySelector('.reelsleek-theater-mode')) return;
      toolbarContainer.appendChild(fragment);
    } else {
      const parent = this.video.closest('[style*="--x-width"]');
      if (!parent) return;
      const toolbar = parent.nextElementSibling;
      if (!toolbar || toolbar.querySelector('.reelsleek-theater-mode')) return;
      const children = [...toolbar.children];
      toolbar.insertBefore(fragment, children[children.length - 2]);
    }
  }

  destroy() {
    this.button?.remove();
  }
}

/**
 * MAIN CONTROLLER / ORCHESTRATOR
 * Manages display cycles, keybind listeners, state changes, and module mapping loops.
 */
class TheaterMode {
  /** @type {boolean} Whether theater mode is enabled */
  static enabled = false;

  static #eventsPublisher = new EventPublisher();

  static #Event = {
    "THEATER_TOGGLE": "theater-toggle",
  };

  /** @type {HTMLTemplateElement|null} Stores the cached template element */
  static #template = null;

  /** @type {WeakMap<HTMLVideoElement, TheaterModeModule>} Tracks active component instances */
  static #videoInstances = new WeakMap();

  /**
   * Sets the theater mode state and persists the preference.
   * @param {boolean} enabled - Whether theater mode should be enabled
   */
  static setTheaterModeEnabled(enabled) {
    TheaterMode.enabled = enabled;
    document.body.classList.toggle('theater-mode-active', enabled);
    TheaterMode.#eventsPublisher.publish(TheaterMode.#Event.THEATER_TOGGLE);
  }

  /**
   * Toggles the theater mode viewport state layout bounds.
   * Safe from context loss!
   */
  static toggleTheaterMode() {
    if (!VideoControl.fullscreenOn) {
      TheaterMode.setTheaterModeEnabled(!TheaterMode.enabled);
    }
    VideoControl.setFullscreen(false);
    
    if (TheaterMode.enabled) {
      const fullscreenTarget = document.body;
      fullscreenTarget.requestFullscreen().catch((err) => {
        console.error(`[TheaterMode] Fullscreen error: ${err.message}`);
      });
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  }

  /**
   * Attaches keyboard event listeners for video control shortcuts.
   * @private
   */
  static #attachKeybinds() {
    addKeybind("KeyT", () => {
      if (!PageHandler.isReel()) return;
      TheaterMode.toggleTheaterMode();
    });
  }

  /**
   * Asynchronously pulls and parses asset documents out of package assets
   */
  static async #loadExternalTemplates() {
    try {
      const fileUrl = browser.runtime.getURL("content/controls.html");
      const response = await fetch(fileUrl);
      const text = await response.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      TheaterMode.#template = doc.getElementById("reelsleek-theater-template");
    } catch (err) {
      console.error("[TheaterMode] Error parsing theater template asset file:", err);
    }
  }

  /**
   * Initializes the TheaterMode class layout variables.
   * @returns {Promise<void>}
   */
  static async setup() {
    await TheaterMode.#loadExternalTemplates();
    TheaterMode.#attachKeybinds();
    
    document.body.addEventListener('fullscreenchange', (e) => {
      if (e.target == document.body && !document.fullscreenElement) {
        TheaterMode.setTheaterModeEnabled(false);
      }
    });
  }

  /**
   * Attaches structural theater elements to specified target interfaces.
   * @param {HTMLVideoElement} video - The target rendering component video element
   */
  static attach(video) {
    if (video.dataset.reelsleekTheaterModeAttached) return;
    if (!window.location.href.includes('/reels/')) return;

    // Instantiate the modular component layout block with safe parameters
    const moduleInstance = new TheaterModeModule(
      video,
      TheaterMode.#template,
      TheaterMode.enabled,
      TheaterMode.toggleTheaterMode,
      TheaterMode.#eventsPublisher,
      TheaterMode.#Event.THEATER_TOGGLE
    );

    TheaterMode.#videoInstances.set(video, moduleInstance);
    video.dataset.reelsleekTheaterModeAttached = "true";
  }

  /**
   * Detaches and de-allocates module instances from memory.
   * @param {HTMLVideoElement} video - Target source node
   */
  static detach(video) {
    if (!video.dataset.reelsleekTheaterModeAttached) return;

    const instance = TheaterMode.#videoInstances.get(video);
    if (instance) {
      instance.destroy();
      TheaterMode.#videoInstances.delete(video);
    }

    delete video.dataset.reelsleekTheaterModeAttached;
  }

  /**
   * Resets theater toggle component alignments across target updates.
   */
  static reset(video) {
    TheaterMode.detach(video);
    TheaterMode.attach(video);
  }

  /**
   * Dispatches complete resetting iterations over valid rendering streams.
   */
  static resetAll() {
    getCleanVideos().forEach(video => TheaterMode.reset(video));
  }
}