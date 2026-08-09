/**
 * UI & LIFECYCLE MODULE: AutoScrollModule
 * Manages localized DOM placement and contextual media events.
 */
class AutoScrollModule {
  constructor(video, templateElement, isEnabled, toggleCallback, eventsPublisher, toggleEvent, onVideoEndedCallback) {
    this.video = video;
    this.button = null;
    this.onVideoEnded = onVideoEndedCallback;

    if (!templateElement) return;

    // 1. Extract structural fragments from the external asset
    const clone = document.importNode(templateElement.content, true);
    Keybinds.applyTitles(clone);
    this.button = clone.querySelector(".reelsleek-autoscroll");
    if (!this.button) return;

    // 2. Setup interactivity configurations
    this.button.setAttribute("aria-pressed", String(isEnabled));
    this.button.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleCallback();
    });

    // 3. Register state sync bindings
    this.buttonSubscriber = new EventSubscriber(this.button);
    this.buttonSubscriber.subscribe(toggleEvent, () => {
      this.button.setAttribute("aria-pressed", String(AutoScroll.autoscrollEnabled));
    });
    eventsPublisher.addSubscriber(this.buttonSubscriber);

    // 4. Inject into layout nodes
    this.#injectUI(clone);

    // 5. Connect media pipeline loops directly to this component instance
    this.mediaListener = () => this.onVideoEnded();
    this.video.addEventListener("ended", this.mediaListener);
  }

  #injectUI(fragment) {
    if (ToolbarMode.isCustom()) {
      const toolbarContainer = this.video.parentElement.querySelector('.reelsleek-toolbar-container');
      if (!toolbarContainer || toolbarContainer.querySelector('.reelsleek-autoscroll')) return;
      toolbarContainer.appendChild(fragment);
    } else {
      const toolbar = getToolbar(this.video);
      if (!toolbar || toolbar.querySelector('.reelsleek-autoscroll')) return;
      const children = [...toolbar.children];
      toolbar.insertBefore(fragment, children[children.length - 2]);
    }
  }

  destroy() {
    // Drop media pipeline triggers cleanly
    if (this.mediaListener) {
      this.video.removeEventListener("ended", this.mediaListener);
    }
    // Remove the tracking layout node from the view layer
    this.button?.remove();
  }
}

/**
 * MAIN CONTROLLER / ORCHESTRATOR
 * Manages extension preferences, physical state modifications, and application keybind loops.
 */
class AutoScroll {
  /** @type {boolean} Whether autoscroll is enabled */
  static autoscrollEnabled = false;

  /** @type {boolean} Whether the autoscroll feature is present/usable at all */
  static featureEnabled = true;

  static #eventsPublisher = new EventPublisher();

  static #template = null;

  /** @type {WeakMap<HTMLVideoElement, AutoScrollModule>} Holds active architectural wrappers */
  static #videoInstances = new WeakMap();

  static #Event = {
    "AUTOSCROLL_TOGGLE": "autoscroll-toggle",
  };

  static #StorageKeys = {
    "autoscrollKey": "reelsleek-autoscroll-enabled",
    "featureEnabledKey": "reelsleek-autoscroll-feature-enabled",
  };

  /**
   * Enables or disables the autoscroll feature itself (present/usable),
   * as opposed to autoscrollEnabled which is whether it's actively firing.
   * Persists the choice and applies it immediately across the page.
   * @param {boolean} enabled
   */
  static setFeatureEnabled(enabled) {
    AutoScroll.featureEnabled = enabled;
    browser.storage.local.set({
      [AutoScroll.#StorageKeys.featureEnabledKey]: enabled,
    });

    if (enabled) {
      FeatureOrder.reattachAll();
    } else {
      getCleanVideos().forEach((video) => AutoScroll.detach(video));
    }
  }

  /**
   * Sets the autoscroll state and persists the preference.
   * @param {boolean} enabled - Whether autoscroll should be enabled
   */
  static setAutoscrollEnabled(enabled) {
    AutoScroll.autoscrollEnabled = enabled;
    AutoScroll.#eventsPublisher.publish(AutoScroll.#Event.AUTOSCROLL_TOGGLE);
    AutoScroll.#saveStates();
  }

  /**
   * Toggles the autoscroll state.
   */
  static toggleAutoscroll() {
    AutoScroll.setAutoscrollEnabled(!AutoScroll.autoscrollEnabled);
  }

  /**
   * Saves the autoscroll state to browser storage.
   */
  static #saveStates() {
    browser.storage.local.set({
      [AutoScroll.#StorageKeys.autoscrollKey]: AutoScroll.autoscrollEnabled
    });
  }

  /**
   * Loads saved autoscroll state from browser storage.
   */
  static async #loadStates() {
    const result = await browser.storage.local.get([
      AutoScroll.#StorageKeys.autoscrollKey,
      AutoScroll.#StorageKeys.featureEnabledKey,
    ]);
    AutoScroll.autoscrollEnabled = result[AutoScroll.#StorageKeys.autoscrollKey] ?? AutoScroll.autoscrollEnabled;
    AutoScroll.featureEnabled = result[AutoScroll.#StorageKeys.featureEnabledKey] ?? AutoScroll.featureEnabled;
  }

  /**
   * Initializes the AutoScroll class by loading saved state.
   * @returns {Promise<void>}
   */
  static async setup() {
    await AutoScroll.#loadStates();
    AutoScroll.#attachKeybinds();
  }

  static #attachKeybinds() {
    registerKeybind("toggleAutoscroll", "KeyA", "Toggle autoscroll", "Navigation", () => {
      if (!AutoScroll.featureEnabled) return;
      if (!PageHandler.isReel()) return;
      AutoScroll.toggleAutoscroll();
    });
  }

  /**
   * Handles video end event and scrolls to next reel if autoscroll is enabled.
   */
  static handleVideoEnded() {
    console.debug('[Autoscroll] video ended, scrolling ? ', AutoScroll.autoscrollEnabled);
    if (!AutoScroll.autoscrollEnabled) return;
    if (VideoControl.fullscreenOn) return;
    if (!window.location.href.includes("reels")) return;
    if (document.querySelector('[role="dialog"]')) return;

    try {
      const nextButton = document.querySelectorAll('div[role="toolbar"] div[role="button"]')[1];
      nextButton?.click();
    } catch {
      console.debug('[Autoscroll] failed to autoscroll');
    }
  }

  /**
   * Attaches autoscroll toggle button to the Instagram toolbar.
   * @param {HTMLVideoElement} video - The video element to attach autoscroll to
   */
  static attach(video) {
    if (!AutoScroll.featureEnabled) return;
    if (!PageHandler.isReel()) return;
    if (video.dataset.reelsleekAutoscrollAttached) return;

    // Async fallback optimization checks
    if (!AutoScroll.#template) {
      AutoScroll.#loadExternalTemplates().then(() => {
        if (AutoScroll.#template && !video.dataset.reelsleekAutoscrollAttached) {
          AutoScroll.attach(video);
        }
      });
      return;
    }

    const moduleInstance = new AutoScrollModule(
      video,
      AutoScroll.#template,
      AutoScroll.autoscrollEnabled,
      AutoScroll.toggleAutoscroll,
      AutoScroll.#eventsPublisher,
      AutoScroll.#Event.AUTOSCROLL_TOGGLE,
      AutoScroll.handleVideoEnded
    );

    AutoScroll.#videoInstances.set(video, moduleInstance);
    video.dataset.reelsleekAutoscrollAttached = "true";
  }

  /**
   * Detaches autoscroll button from the toolbar.
   * @param {HTMLVideoElement} video - The video element whose toolbar contains the button
   */
  static detach(video) {
    if (!video.dataset.reelsleekAutoscrollAttached) return;

    const instance = AutoScroll.#videoInstances.get(video);
    if (instance) {
      instance.destroy();
      AutoScroll.#videoInstances.delete(video);
    }

    delete video.dataset.reelsleekAutoscrollAttached;
  }

  /**
   * Asynchronously pulls and parses asset documents out of packaged assets.
   */
  static async #loadExternalTemplates() {
    try {
      const fileUrl = browser.runtime.getURL("content/controls.html");
      const response = await fetch(fileUrl);
      const text = await response.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      AutoScroll.#template = doc.getElementById("reelsleek-autoscroll-template");
    } catch (err) {
      console.error("[AutoScroll] Error parsing autoscroll template asset file:", err);
    }
  }

  /**
   * Resets autoscroll button for a video by detaching and reattaching.
   */
  static reset(video) {
    AutoScroll.detach(video);
    AutoScroll.attach(video);
  }

  /**
   * Resets autoscroll buttons for all video elements on the page.
   */
  static resetAll() {
    getCleanVideos().forEach(video => AutoScroll.reset(video));
  }
}
