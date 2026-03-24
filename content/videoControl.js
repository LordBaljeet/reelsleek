/**
 * Manages video playback controls including seekbar, fullscreen, and keyboard shortcuts.
 * Tracks the currently playing video and provides control UI elements.
 */
class VideoControl {
  /** @type {HTMLVideoElement|null} The currently playing video element */
  static currentlyPlayingVideo = null;

  /** @type {boolean} Whether the seekbar is always visible */
  static alwaysVisible = true;

  static fullscreenOn = false;

  static #StorageKeys = {
    "visibilityKey": "reelsleek-videocontrol-visibility",
  }

  /** @type {WeakMap<HTMLVideoElement, Object>} Stores event listeners for cleanup */
  static #videoListeners = new WeakMap();

  /**
   * Sets the currently playing video.
   * @param {HTMLVideoElement} video - The video element to set as currently playing
   * @param {boolean} [firstLoad=false] - If true, won't override an existing video
   */
  static setCurrentlyPlayingVideo(video, firstLoad = false) {
    if (firstLoad && this.currentlyPlayingVideo) return;
    this.currentlyPlayingVideo = video;
    video.focus();
  }

  static #SEEKBAR_HTML = `
    <input type="range" class="reelsleek-seekbar" min="0" max="100" aria-label="Seek">
  `;

  static #FULLSCREEN_HTML = `
  <button class="reelsleek-fullscreen-button" aria-label="Toggle fullscreen" title="Toggle fullscreen (F)">
    <svg class="reelsleek-expand-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor">
      <path d="M280-280h120q17 0 28.5 11.5T440-240q0 17-11.5 28.5T400-200H240q-17 0-28.5-11.5T200-240v-160q0-17 11.5-28.5T240-440q17 0 28.5 11.5T280-400v120Zm400-400H560q-17 0-28.5-11.5T520-720q0-17 11.5-28.5T560-760h160q17 0 28.5 11.5T760-720v160q0 17-11.5 28.5T720-520q-17 0-28.5-11.5T680-560v-120Z"/>
    </svg>
    <svg class="reelsleek-collapse-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor">
      <path d="M360-360H240q-17 0-28.5-11.5T200-400q0-17 11.5-28.5T240-440h160q17 0 28.5 11.5T440-400v160q0 17-11.5 28.5T400-200q-17 0-28.5-11.5T360-240v-120Zm240-240h120q17 0 28.5 11.5T760-560q0 17-11.5 28.5T720-520H560q-17 0-28.5-11.5T520-560v-160q0-17 11.5-28.5T560-760q17 0 28.5 11.5T600-720v120Z"/>
    </svg>
  </button>
`;

  static setFullscreen(on) {
    this.fullscreenOn = on;
    if(!on && document.fullscreenElement) document.exitFullscreen();
  }

  /**
   * Toggles fullscreen mode for the video's container.
   * @param {HTMLVideoElement} video - The video element to toggle fullscreen for
   * @private
   */
  static #toggleFullscreen(video) {
    if (!video) return;
    this.setFullscreen(!this.fullscreenOn);
    if (this.fullscreenOn) {
      const fullscreenTarget = video.parentElement.parentElement;
      // const fullscreenTarger = document.querySelector('main');
      fullscreenTarget.requestFullscreen().catch((err) => {
        console.error(`Fullscreen error: ${err.message}`);
      });
    }
  }

  /**
   * Loads saved visibility state from browser storage.
   * @private
   * @returns {Promise<void>}
   */
  static async #loadStates() {
    const result = await browser.storage.local.get([
      this.#StorageKeys.visibilityKey,
    ]);

    this.alwaysVisible = result[this.#StorageKeys.visibilityKey] ?? this.alwaysVisible
  }

  /**
   * Saves current visibility state to browser storage.
   * @private
   */
  static #saveStates() {
    browser.storage.local.set({
      [this.#StorageKeys.visibilityKey]: this.alwaysVisible,
    });
  }

  /**
   * Attaches keyboard event listeners for video control shortcuts.
   * Supports: Arrow keys (seek), Space/P (play/pause), F (fullscreen)
   * @private
   */
  static #attachKeybinds() {
    document.body.addEventListener("keydown", (e) => {
      if(isInput()) return;;

      switch (e.code) {
        case "ArrowRight":
          //forward 5 seconds
          this.currentlyPlayingVideo.currentTime += 5;
          stopEvent(e);
          break;

        case "ArrowLeft":
          //rewind 5 seconds
          this.currentlyPlayingVideo.currentTime -= 5;
          stopEvent(e);
          break;

        case "Space":
        case "KeyP":
          this.currentlyPlayingVideo.paused ? this.currentlyPlayingVideo.play() : this.currentlyPlayingVideo.pause();
          try {
            this.currentlyPlayingVideo.parentElement
              ?.querySelector('[role="button"][aria-disabled="false"]')
              ?.click();
          } catch { }
          stopEvent(e);
          break;

        case "KeyF":
          this.#toggleFullscreen(this.currentlyPlayingVideo);
          break;
      }
    });
  }

  /**
   * Initializes the VideoControl class by loading saved states and attaching keyboard shortcuts.
   * Should be called once on page load.
   * @returns {Promise<void>}
   */
  static async setup() {
    await this.#loadStates();
    this.#attachKeybinds();
    document.body.classList.toggle("reelsleek-seekbar-always-visible", this.alwaysVisible);
  }

  /**
   * Sets the seekbar visibility and persists the preference.
   * @param {boolean} visibility - Whether the seekbar should always be visible
   */
  static setVisibility(visibility) {
    this.alwaysVisible = visibility;
    document.body.classList.toggle("reelsleek-seekbar-always-visible", this.alwaysVisible);
    this.#saveStates();
  }

  /**
   * Attaches video controls (seekbar and fullscreen button) to a video element.
   * Skips if already attached. Sets up event listeners for seeking and fullscreen.
   * @param {HTMLVideoElement} video - The video element to attach controls to
   */
  static attach(video) {
    if (video.dataset.reelsleekVideoControlAttached) return;
    video.dataset.reelsleekVideoControlAttached = "true";

    const seekbarContainer = document.createElement("div");
    seekbarContainer.className = "reelsleek-video-control";
    appendParsedHTML(seekbarContainer, this.#SEEKBAR_HTML);
    video.parentElement.append(seekbarContainer);

    let isSeeking = false;

    const seekbar = seekbarContainer.querySelector("input");
    seekbar.addEventListener("mousedown", () => { isSeeking = true; });
    seekbar.addEventListener("touchstart", () => { isSeeking = true; });
    seekbar.addEventListener("mouseup", () => { isSeeking = false; });
    seekbar.addEventListener("touchend", () => { isSeeking = false; });

    seekbar.addEventListener("input", (e) => {
      e.stopPropagation();
      if (!isFinite(video.duration)) return;
      video.currentTime = video.duration * (seekbar.value / 100);
    });

    seekbar.addEventListener("click", (e) => e.stopPropagation());

    // Store event listeners for cleanup
    const timeupdateListener = () => {
      if (isSeeking || !isFinite(video.duration)) return;
      seekbar.value = `${(video.currentTime / video.duration) * 100}`;
    };

    const playListener = () => {
      seekbarContainer.dataset.showPaused = "false";
      this.setCurrentlyPlayingVideo(video);
    };

    const pauseListener = () => {
      seekbarContainer.dataset.showPaused = "true";
    };

    video.addEventListener("timeupdate", timeupdateListener);
    video.addEventListener("play", playListener);
    video.addEventListener("pause", pauseListener);

    if (ToolbarMode.isCustom()) {
      const toolbarContainer = video.parentElement.querySelector('.reelsleek-toolbar-container');
      if (toolbarContainer) {
        appendParsedHTML(toolbarContainer, this.#FULLSCREEN_HTML);
        toolbarContainer.querySelector('.reelsleek-fullscreen-button').addEventListener('click', (e) => {
          stopEvent(e);
          this.#toggleFullscreen(video);
        });
      }
    } else {
      const fullscreenContainer = document.createElement("div");
      fullscreenContainer.className = "reelsleek-fullscreen-container";
      appendParsedHTML(fullscreenContainer, this.#FULLSCREEN_HTML);
      fullscreenContainer.querySelector("button").addEventListener("click", (e) => {
        e.stopPropagation();
        this.#toggleFullscreen(video);
      });
      video.parentElement.prepend(fullscreenContainer);
    }

    const presentationEl = video.parentElement.querySelector('[role="presentation"]');
    const dblclickListener = () => this.#toggleFullscreen(video);
    presentationEl?.addEventListener("dblclick", dblclickListener);

    // Store all listeners in WeakMap for cleanup
    this.#videoListeners.set(video, {
      timeupdate: timeupdateListener,
      play: playListener,
      pause: pauseListener,
      presentationEl: presentationEl,
      dblclick: dblclickListener
    });
  }

  /**
   * Detaches video controls from a video element.
   * @param {HTMLVideoElement} video - The video element to detach controls from
   */
  static detach(video) {
    if (!video.dataset.reelsleekVideoControlAttached) return;

    // Remove event listeners from video
    const listeners = this.#videoListeners.get(video);
    if (listeners) {
      video.removeEventListener("timeupdate", listeners.timeupdate);
      video.removeEventListener("play", listeners.play);
      video.removeEventListener("pause", listeners.pause);

      // Remove dblclick from presentationEl if it exists
      if (listeners.presentationEl && listeners.dblclick) {
        listeners.presentationEl.removeEventListener("dblclick", listeners.dblclick);
      }

      this.#videoListeners.delete(video);
    }

    // Remove seekbar container
    video.parentElement.querySelector('.reelsleek-video-control')?.remove();

    // Remove fullscreen button (custom toolbar) or standalone container (native mode)
    video.parentElement.querySelector('.reelsleek-fullscreen-button')?.remove();
    video.parentElement.querySelector('.reelsleek-fullscreen-container')?.remove();

    // Clear marker
    delete video.dataset.reelsleekVideoControlAttached;
  }

  /**
   * Resets video controls for a video by detaching and reattaching.
   * @param {HTMLVideoElement} video - The video element to reset controls for
   */
  static reset(video) {
    this.detach(video);
    this.attach(video);
  }

  /**
   * Resets video controls for all video elements on the page.
   */
  static resetAll() {
    const videos = getCleanVideos();
    videos.forEach(video => {
      this.reset(video);
    });
  }
}