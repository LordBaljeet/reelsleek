
/**
 * Manages audio/volume controls for videos including mute button and volume slider.
 * Syncs with Instagram's native mute button and persists user preferences.
 */
class AudioControl {
  /** @type {boolean} Whether audio is muted */
  static muted = false;

  /** @type {number} Volume level (0.0 to 1.0) */
  static volume = 0.1;

  /** @type {string} Orientation of the volume slider ("horizontal" or "vertical") */
  static orientation = "horizontal";

  /** @type {boolean} Whether the volume control is always visible */
  static alwaysVisible = true;

  static #saveTimer = null;
  static #nativeSynced = false;
  static #eventsPublisher = new EventPublisher();

  /** @type {WeakMap<HTMLVideoElement, Function>} Stores event listeners for cleanup */
  static #videoListeners = new WeakMap();

  static #Event = {
    "VOLUME_CHANGE": "volume-change",
    "MUTE_CHANGE": "mute-change",
    "ORIENT_CHANGE": "orient-change",
    "VISIBILITY_CHANGE": "visibility-change",
  }

  static #StorageKeys = {
    "volumeKey": "reelsleek-audiocontrol-volume",
    "orientKey": "reelsleek-audiocontrol-orientation",
    "visibilityKey": "reelsleek-audiocontrol-visibility",
  }

  static #HTML = `
    <button class="reelsleek-mute-button" aria-label="Toggle mute">
      <svg class="reelsleek-volume-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path class="reelsleek-vi-speaker" d="
          M2.003 11.716C2.04 9.873 2.059 8.952 2.671 8.164
          C2.783 8.02 2.947 7.849 3.084 7.733
          C3.836 7.097 4.83 7.097 6.817 7.097
          C7.527 7.097 7.882 7.097 8.22 7.005
          C8.291 6.985 8.36 6.963 8.429 6.938
          C8.759 6.817 9.056 6.608 9.649 6.192
          L14.138 4.082
          C14.326 4.151 14.508 4.25 14.671 4.372
          C15.519 5.007 15.584 6.487 15.713 9.445
          C15.761 10.541 15.793 11.479 15.793 12
          C15.793 12.522 15.761 13.459 15.713 14.555
          C15.584 17.513 15.519 18.993 14.671 19.628
          C14.508 19.75 14.326 19.849 14.138 19.918
          L9.649 17.808
          C9.056 17.392 8.759 17.183 8.429 17.062
          C8.36 17.037 8.291 17.015 8.22 16.996
          C7.882 16.903 7.527 16.903 6.817 16.903
          C4.83 16.903 3.836 16.903 3.084 16.267
          C2.947 16.151 2.783 15.98 2.671 15.836
          C2.059 15.048 2.04 14.127 2.003 12.285
          C2.001 12.188 2 12.093 2 12
          C2 11.907 2.001 11.812 2.003 11.716Z
        " fill="#fff"/>
        <g class="reelsleek-vi-waves">
          <path opacity="0.5" d="
            M19.489 5.552C19.782 5.292 20.217 5.334 20.461 5.646
            C21.2 6.6 21.639 8.082 21.9 9.85
            C22 10.541 22 11.279 22 12
            C22 12.721 22 13.459 21.9 14.15
            C21.639 15.918 21.2 17.4 20.461 18.354
            C20.217 18.666 19.782 18.708 19.489 18.448
            C19.198 18.19 19.158 17.729 19.398 17.417
            C19.96 16.68 20.337 15.419 20.565 13.795
            C20.655 13.161 20.655 10.839 20.565 10.205
            C20.337 8.581 19.96 7.32 19.398 6.583
            C19.158 6.271 19.198 5.81 19.489 5.552Z
          " fill="#fff"/>
          <path opacity="0.8" d="
            M17.757 8.416C18.09 8.219 18.51 8.347 18.695 8.702
            C19.07 9.415 19.241 10.545 19.241 12
            C19.241 13.455 19.07 14.585 18.695 15.298
            C18.51 15.653 18.09 15.781 17.757 15.585
            C17.427 15.389 17.306 14.947 17.485 14.594
            C17.754 14.065 17.862 13.127 17.862 12
            C17.862 10.873 17.754 9.935 17.485 9.406
            C17.306 9.053 17.427 8.611 17.757 8.416Z
          " fill="#fff"/>
        </g>
        <line class="reelsleek-vi-slash"
          x1="20.5" y1="3.5" x2="3.5" y2="20.5"
          stroke="#fff" stroke-width="1.8" stroke-linecap="round"
        />
      </svg>
    </button>
    <div class="reelsleek-slider-container">
      <input type="range" class="reelsleek-volume-slider" min="0" max="100" aria-label="Volume">
    </div>
  `;

  /**
   * Finds Instagram's native mute button in the DOM.
   * @param {HTMLVideoElement} [video] - Optional video element to search from
   * @returns {HTMLElement|null} The native mute button element or null if not found
   * @private
   */
  static #findNativeMuteButton(video) {
    if (!VideoControl.currentlyPlayingVideo && !video) return null;
    const targetVideo = video || VideoControl.currentlyPlayingVideo;
    const svg = targetVideo.parentElement?.querySelector(
      'div[role="group"] div > div[role="button"] > svg, div[role="group"] div.html-div > button > div > svg',
    );
    if (!svg) return;
    return svg.closest('button, [role="button"]');
  }

  /**
   * Clicks Instagram's native mute button if found.
   * @private
   */
  static #clickNativeMuteButton() {
    const button = this.#findNativeMuteButton();
    if (!button) return;
    button.click();
  }

  /**
   * Syncs with Instagram's native mute button on first page load.
   * Only runs once per page load.
   * @private
   */
  static #syncNativeMuteOnFirstLoad() {
    if (this.#nativeSynced) return;
    this.#clickNativeMuteButton();

    const video = [...document.querySelectorAll("video")].find(
      (v) => !v.src || v.src.startsWith("blob"),
    );
    if (video && video.muted !== this.muted) {
      this.#clickNativeMuteButton();
    }

    this.#nativeSynced = true;
  }

  /**
   * Sets the muted state and syncs with native button and video elements.
   * @param {boolean} muted - Whether to mute the audio
   * @private
   */
  static #setMuted(muted) {
    this.muted = muted;
    this.#clickNativeMuteButton();
    this.#eventsPublisher.publish(this.#Event.MUTE_CHANGE);
    VideoControl.currentlyPlayingVideo.volume = this.volume
    VideoControl.currentlyPlayingVideo.muted = this.muted
  }

  /**
   * Toggles the mute state. If unmuting with zero volume, sets volume to 10%.
   * @private
   */
  static #toggleMute() {
    this.#setMuted(!this.muted);
    if (!this.muted && this.volume == 0) {
      this.#setVolume(0.1);
    }
  }

  /**
   * Sets the volume level and updates mute state if necessary.
   * @param {number} volume - Volume level (0.0 to 1.0)
   * @private
   */
  static #setVolume(volume) {
    this.volume = volume;
    if (this.volume > 0 && this.muted) {
      this.#toggleMute();
    } else if (this.volume === 0 && !this.muted) {
      this.#toggleMute();
    }
    this.#eventsPublisher.publish(this.#Event.VOLUME_CHANGE);
    this.#saveStates();
    VideoControl.currentlyPlayingVideo.volume = this.volume
    VideoControl.currentlyPlayingVideo.muted = this.muted
  }

  /**
   * Sets the orientation of the volume slider and persists the preference.
   * @param {string} orientation - "horizontal" or "vertical"
   */
  static setOrientation(orientation) {
    this.orientation = orientation;
    this.#eventsPublisher.publish(this.#Event.ORIENT_CHANGE);
    this.#saveStates();
  }

  /**
   * Sets whether the volume control is always visible and persists the preference.
   * @param {boolean} visibility - Whether the control should always be visible
   */
  static setVisibility(visibility) {
    this.alwaysVisible = visibility;
    this.#eventsPublisher.publish(this.#Event.VISIBILITY_CHANGE);
    document.body.classList.toggle("reelsleek-volume-always-visible", visibility);
    this.#saveStates();
  }

  /**
   * Saves current audio control state to browser storage with debouncing.
   * @private
   */
  static #saveStates() {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      browser.storage.local.set({
        [this.#StorageKeys.orientKey]: this.orientation,
        [this.#StorageKeys.visibilityKey]: this.alwaysVisible,
        [this.#StorageKeys.volumeKey]: this.volume > 0 ? this.volume : 0.1
      });
    }, 300);
  }

  /**
   * Loads saved audio control state from browser storage.
   * @private
   * @returns {Promise<void>}
   */
  static async #loadStates() {
    const result = await browser.storage.local.get([
      this.#StorageKeys.volumeKey,
      this.#StorageKeys.orientKey,
      this.#StorageKeys.visibilityKey,
    ]);

    this.volume = result[this.#StorageKeys.volumeKey] ?? this.volume
    this.orientation = result[this.#StorageKeys.orientKey] ?? this.orientation
    this.alwaysVisible = result[this.#StorageKeys.visibilityKey] ?? this.alwaysVisible
  }

  /**
   * Attaches keyboard event listeners for audio control shortcuts.
   * Supports: M (mute toggle), - (volume down), = (volume up)
   * @private
   */
  static #attachKeybinds() {
    document.body.addEventListener("keydown", (e) => {
      if(isInput()) return;

      switch (e.code) {
        case "KeyM":
          this.#toggleMute();
          break;

        case "Minus":
          //reduce volume by 10%
          this.#setVolume(Math.max(this.volume - 0.1, 0));
          break;

        case "Equal":
          //increase volume by 10%
          this.#setVolume(Math.min(this.volume + 0.1, 1));
          break;
      }
    });
  }

  /**
   * Initializes the AudioControl class by loading saved states and attaching keyboard shortcuts.
   * Should be called once on page load.
   * @returns {Promise<void>}
   */
  static async setup() {
    await this.#loadStates();
    this.#attachKeybinds();
    document.body.classList.toggle("reelsleek-volume-always-visible", this.alwaysVisible);
  }

  /**
   * Attaches audio controls (mute button and volume slider) to a video element.
   * Skips if already attached. Syncs with Instagram's native mute button on first load.
   * @param {HTMLVideoElement} video - The video element to attach controls to
   */
  static attach(video) {
    this.#syncNativeMuteOnFirstLoad();

    if (video.dataset.reelsleekAudioControlAttached) return;
    video.volume = this.volume;
    video.muted = this.muted;

    const container = document.createElement("div");
    container.className = "reelsleek-audio-control";
    container.dataset.orientation = this.orientation;
    appendParsedHTML(container, this.#HTML);
    video.parentElement.prepend(container);

    {
      const containerSubscriber = new EventSubscriber(container);
      containerSubscriber.subscribe(this.#Event.ORIENT_CHANGE, () => {
        container.dataset.orientation = this.orientation;
      })
      this.#eventsPublisher.addSubscriber(containerSubscriber);
    }

    const slider = container.querySelector("input");
    slider.value = this.muted ? 0 : this.volume * 100;
    slider.setAttribute("orient", this.orientation);

    // ── Setup Events that affect volume slider ────────────────────────────────
    {
      const sliderSubscriber = new EventSubscriber(slider);
      sliderSubscriber.subscribe(this.#Event.VOLUME_CHANGE, () => {
        slider.value = this.volume * 100;
      })
      sliderSubscriber.subscribe(this.#Event.MUTE_CHANGE, () => {
        if (this.muted) slider.value = 0;
        else slider.value = this.volume * 100;
      })
      sliderSubscriber.subscribe(this.#Event.ORIENT_CHANGE, () => {
        slider.setAttribute("orient", this.orientation);
      })
      this.#eventsPublisher.addSubscriber(sliderSubscriber);
    }

    const button = container.querySelector("button");
    button.classList.toggle("muted", this.muted);

    // ── Setup Events that affect mute button ──────────────────────────────────
    {
      const buttonSubscriber = new EventSubscriber(button);
      buttonSubscriber.subscribe(this.#Event.MUTE_CHANGE, () => {
        button.classList.toggle("muted", this.muted);
      });
      this.#eventsPublisher.addSubscriber(buttonSubscriber);
    }

    slider.addEventListener("input", (e) => {
      e.stopPropagation();
      this.#setVolume(slider.value / 100);
    });
    slider.addEventListener("click", (e) => e.stopPropagation());

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      this.#toggleMute();
    });

    // Store event listener for cleanup
    const playListener = () => {
      video.volume = this.volume;
      video.muted = this.muted;
    };
    video.addEventListener('play', playListener);
    this.#videoListeners.set(video, playListener);

    video.dataset.reelsleekAudioControlAttached = "true";
  }

  /**
   * Detaches audio controls from a video element.
   * @param {HTMLVideoElement} video - The video element to detach controls from
   */
  static detach(video) {
    // Remove event listener from video
    const playListener = this.#videoListeners.get(video);
    if (playListener) {
      video.removeEventListener('play', playListener);
      this.#videoListeners.delete(video);
    }

    video.parentElement.querySelector('.reelsleek-audio-control').remove()
    delete video.dataset.reelsleekAudioControlAttached;
  }

  /**
   * Resets audio controls for a video by detaching and reattaching.
   * @param {HTMLVideoElement} video - The video element to reset controls for
   */
  static reset(video) {
    this.detach(video);
    this.attach(video);
  }

  /**
   * Resets audio controls for all video elements on the page.
   */
  static resetAll() {
    const videos = getCleanVideos()
    videos.forEach(v => {
      this.reset(v);
    });
  }

}