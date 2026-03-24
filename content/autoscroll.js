/**
 * Manages automatic scrolling to the next reel when the current video ends.
 * Provides a toggle button on the Instagram UI to enable/disable autoscroll.
 */
class AutoScroll {
  /** @type {boolean} Whether autoscroll is enabled */
  static autoscrollEnabled = false;

  static #eventsPublisher = new EventPublisher();

  /** @type {WeakMap<HTMLVideoElement, Function>} Stores event listeners for cleanup */
  static #videoEndListeners = new WeakMap();

  static #HTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6.416 14.5V11m0 0V4.75a1.75 1.75 0 1 1 3.5 0V10l3.077.478c1.929.289 2.893.434 3.572.84c1.122.673 1.935 1.682 1.935 3.156c0 1.026-.254 1.715-.87 3.565c-.392 1.174-.587 1.76-.906 2.225a4 4 0 0 1-2.193 1.58c-.541.156-1.16.156-2.397.156h-1.405c-1.785 0-2.677 0-3.443-.335a4 4 0 0 1-.96-.593c-.642-.535-1.04-1.333-1.839-2.93c-.647-1.294-.97-1.94-.986-2.612a3 3 0 0 1 .115-.895c.184-.646.66-1.19 1.614-2.28zM18 2v6m0-6c-.7 0-2.008 1.994-2.5 2.5M18 2c.7 0 2.009 1.994 2.5 2.5" />
    </svg>
  `

  static #Event = {
    "AUTOSCROLL_TOGGLE": "autoscroll-toggle",
  }

  static #StorageKeys = {
    "autoscrollKey": "reelsleek-autoscroll-enabled",
  }

  /**
   * Sets the autoscroll state and persists the preference.
   * @param {boolean} enabled - Whether autoscroll should be enabled
   */
  static setAutoscrollEnabled(enabled) {
    this.autoscrollEnabled = enabled;
    this.#eventsPublisher.publish(this.#Event.AUTOSCROLL_TOGGLE);
    this.#saveStates();
  }

  /**
   * Toggles the autoscroll state.
   * @private
   */
  static #toggleAutoscroll() {
    this.setAutoscrollEnabled(!this.autoscrollEnabled);
  }

  /**
   * Saves the autoscroll state to browser storage.
   * @private
   */
  static #saveStates() {
    browser.storage.local.set({
      [this.#StorageKeys.autoscrollKey]: this.autoscrollEnabled
    });
  }

  /**
   * Loads saved autoscroll state from browser storage.
   * @private
   * @returns {Promise<void>}
   */
  static async #loadStates() {
    const result = await browser.storage.local.get([
      this.#StorageKeys.autoscrollKey,
    ]);

    this.autoscrollEnabled = result[this.#StorageKeys.autoscrollKey] ?? this.autoscrollEnabled
  }

  /**
   * Initializes the AutoScroll class by loading saved state.
   * Should be called once on page load.
   * @returns {Promise<void>}
   */
  static async setup() {
    await this.#loadStates();
    this.#attachKeybinds();
  }

  static #attachKeybinds() {
    document.body.addEventListener("keydown", (e) => {
      if (isInput()) return;
      if (e.code === "KeyA") {
        if (!window.location.href.includes("/reels")) return;
        stopEvent(e);
        this.#toggleAutoscroll();
      }
    });
  }

  /**
   * Handles video end event and scrolls to next reel if autoscroll is enabled.
   * Skips if in fullscreen, not on reels page, or a dialog is open.
   * @private
   */
  static #onVideoEnded() {
    console.debug('[Autoscroll] video ended, scrolling ? ', this.autoscrollEnabled);
    if (!this.autoscrollEnabled) return;
    if (VideoControl.fullscreenOn) return;
    if (!window.location.href.includes("reels")) return;
    if (document.querySelector('[role="dialog"]')) return;

    try {
      console.debug('[Autoscroll] trying to click on the next reel button')
      const nextButton = document.querySelectorAll('div[role="toolbar"] div[role="button"]')[1];
      nextButton?.click();
      console.debug('[Autoscroll] button', nextButton, 'clicked');
    } catch { /* no-op */ }
  }

  /**
   * Attaches autoscroll toggle button to the Instagram toolbar and listens for video end events.
   * Skips if already attached or if the toolbar cannot be found.
   * @param {HTMLVideoElement} video - The video element to attach autoscroll to
   */
  static attach(video) {
    if (video.dataset.reelsleekAutoscrollAttached) return;
    if (!window.location.href.includes('/reels/')) return;

    const button = document.createElement("button");
    button.className = "reelsleek-autoscroll";
    button.setAttribute("aria-pressed", String(this.autoscrollEnabled));
    button.setAttribute("aria-label", "Toggle autoscroll");
    button.title = "Toggle autoscroll (A)";
    appendParsedHTML(button, this.#HTML);

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      this.#toggleAutoscroll();
    });

    const buttonSubscriber = new EventSubscriber(button);
    buttonSubscriber.subscribe(this.#Event.AUTOSCROLL_TOGGLE, () => {
      button.setAttribute("aria-pressed", String(this.autoscrollEnabled));
    });
    this.#eventsPublisher.addSubscriber(buttonSubscriber);

    if (ToolbarMode.isCustom()) {
      const toolbarContainer = video.parentElement.querySelector('.reelsleek-toolbar-container');
      if (!toolbarContainer) return;
      toolbarContainer.appendChild(button);
    } else {
      const parent = getNthParent(video, 7);
      if (!parent) return;
      const toolbar = parent.nextElementSibling;
      if (!toolbar) return;
      const children = [...toolbar.children];
      toolbar.insertBefore(button, children[children.length - 2]);
    }

    // Store the listener function so we can remove it later
    const endListener = () => this.#onVideoEnded();
    this.#videoEndListeners.set(video, endListener);
    video.addEventListener('ended', endListener);

    video.dataset.reelsleekAutoscrollAttached = "true";
  }

  /**
   * Detaches autoscroll button from the toolbar.
   * @param {HTMLVideoElement} video - The video element whose toolbar contains the button
   */
  static detach(video) {
    if (!video.dataset.reelsleekAutoscrollAttached) return;

    // Remove the event listener from the video
    const endListener = this.#videoEndListeners.get(video);
    if (endListener) {
      video.removeEventListener('ended', endListener);
      this.#videoEndListeners.delete(video);
    }

    // Find button in custom toolbar or native Instagram toolbar
    const button = video.parentElement.querySelector('.reelsleek-autoscroll')
      ?? getNthParent(video, 7)?.nextElementSibling?.querySelector('.reelsleek-autoscroll');
    button?.remove();

    delete video.dataset.reelsleekAutoscrollAttached;
  }

  /**
   * Resets autoscroll button for a video by detaching and reattaching.
   * @param {HTMLVideoElement} video - The video element to reset autoscroll for
   */
  static reset(video) {
    this.detach(video);
    this.attach(video);
  }

  /**
   * Resets autoscroll buttons for all video elements on the page.
   */
  static resetAll() {
    const videos = getCleanVideos();
    videos.forEach(video => {
      this.reset(video);
    });
  }
}
