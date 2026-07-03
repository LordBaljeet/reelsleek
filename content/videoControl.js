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
    if (this.currentlyPlayingVideo != video) {
      this.currentlyPlayingVideo?.pause();
    }
    this.currentlyPlayingVideo = video;
  }

  static #SEEKBAR_HTML = `
    <div class="reelsleek-seekbar-track"></div>
    <div class="reelsleek-seekbar-fill"></div>
    <input type="range" class="reelsleek-seekbar" min="0" max="100" step="any" aria-label="Seek">
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

  static #PLAY_HTML = `
    <button class="reelsleek-play-button" aria-label="Toggle play/pause" title="Toggle play/pause (P)">
      <svg class="reelsleek-play-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>
      </svg>
    </button>
  `;

  static setFullscreen(on) {
    this.fullscreenOn = on;
    if (!on && document.fullscreenElement) document.exitFullscreen();
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
      fullscreenTarget.requestFullscreen().catch((err) => {
        console.error(`Fullscreen error: ${err.message}`);
      });
      if (video != this.currentlyPlayingVideo) {
        video.play()
      }
      this.setCurrentlyPlayingVideo(video);
    }
  }

  static #togglePlay(video) {
    video.paused ? video.play() : video.pause();
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
    addKeybind("ArrowRight", () => {
      if (PageHandler.isStorie()) return;
      this.currentlyPlayingVideo.currentTime += 5;
    });
    addKeybind("ArrowLeft", () => {
      if (PageHandler.isStorie()) return;
      this.currentlyPlayingVideo.currentTime -= 5;
    });
    addKeybind("KeyP", () => {
      this.#togglePlay(this.currentlyPlayingVideo);
    });
    addKeybind("Space", (e) => {
      this.#togglePlay(this.currentlyPlayingVideo);
      stopEvent(e)
    });
    addKeybind("KeyF", () => {
      this.#toggleFullscreen(this.currentlyPlayingVideo);
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
    const fillEl = seekbarContainer.querySelector(".reelsleek-seekbar-fill");

    // ── CSS Compositor Sync Logic ──
    const syncPlay = () => {
      if (!isFinite(video.duration) || isSeeking || video.paused) return;

      const currentProgress = video.currentTime / video.duration;
      const remainingTime = (video.duration - video.currentTime) / (video.playbackRate || 1);

      // Instantly position the bar at the exact current frame
      fillEl.style.transition = 'none';
      fillEl.style.transform = `scaleX(${currentProgress})`;
      fillEl.offsetHeight; // Force reflow

      // Hand off the linear progress to the GPU
      fillEl.style.transition = `transform ${remainingTime}s linear, height 0.1s`;
      fillEl.style.transform = 'scaleX(1)';
    };

    const syncPause = () => {
      if (!isFinite(video.duration)) return;

      const currentProgress = video.currentTime / video.duration;

      // Kill the transition immediately and lock the bar position
      fillEl.style.transition = 'none';
      fillEl.style.transform = `scaleX(${currentProgress})`;
      seekbar.value = `${currentProgress * 100}`;
    };

    // Range Input Interaction Event Listeners
    seekbar.addEventListener("mousedown", () => { isSeeking = true; fillEl.style.transition = 'none'; });
    seekbar.addEventListener("touchstart", () => { isSeeking = true; fillEl.style.transition = 'none'; });

    seekbar.addEventListener("mouseup", () => {
      isSeeking = false;
      if (!video.paused) syncPlay();
    });
    seekbar.addEventListener("touchend", () => {
      isSeeking = false;
      if (!video.paused) syncPlay();
    });

    seekbar.addEventListener("input", (e) => {
      e.stopPropagation();
      if (!isFinite(video.duration)) return;

      const progress = seekbar.value / 100;
      video.currentTime = video.duration * progress;

      fillEl.style.transition = 'none';
      fillEl.style.transform = `scaleX(${progress})`;
    });

    seekbar.addEventListener("click", (e) => e.stopPropagation());

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
      if (!PageHandler.isStorie()) {
        video.parentElement.prepend(fullscreenContainer);
      }
    }

    const playContainer = document.createElement("div");
    playContainer.className = 'reelsleek-play-container';
    appendParsedHTML(playContainer, this.#PLAY_HTML);

    playContainer.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      this.#toggleFullscreen(video);
    });
    playContainer.addEventListener("click", (e) => {
      e.stopPropagation();
      video.paused ? video.play() : video.pause();
    });

    video.parentElement.prepend(playContainer);

    // ── Engine Core Event Attachments ──
    const playListener = () => {
      seekbarContainer.dataset.showPaused = "false";
      playContainer.dataset.showPaused = "false";
      let targetVideo = video;
      if (this.fullscreenOn && video != this.currentlyPlayingVideo) {
        video.pause();
        targetVideo = this.currentlyPlayingVideo;
      }
      this.setCurrentlyPlayingVideo(targetVideo);

      syncPlay();
    };

    const pauseListener = () => {
      seekbarContainer.dataset.showPaused = "true";
      playContainer.dataset.showPaused = "true";

      syncPause();
    };

    const seekedListener = () => {
      if (!isSeeking) {
        if (!video.paused) syncPlay();
        else syncPause();
      }
    };

    const ratechangeListener = () => {
      if (!video.paused) syncPlay();
    };

    // Catch buffer starvation stall
    const waitingListener = () => {
      syncPause();
    };

    // Catch recovery transition kickoff
    const playingListener = () => {
      syncPlay();
    };

    video.addEventListener("play", playListener);
    video.addEventListener("pause", pauseListener);
    video.addEventListener("seeked", seekedListener);
    video.addEventListener("ratechange", ratechangeListener);
    video.addEventListener("waiting", waitingListener);
    video.addEventListener("playing", playingListener);

    this.#videoListeners.set(video, {
      play: playListener,
      pause: pauseListener,
      seeked: seekedListener,
      ratechange: ratechangeListener,
      waiting: waitingListener,
      playing: playingListener
    });

    if (!PageHandler.isStorie()) return;
    const storieParent = getNthParent(video, 14);
    const replyContainer = storieParent?.nextSibling?.firstChild;
    if (!replyContainer) return;
    replyContainer.style.background = "none";
    replyContainer.style.paddingBottom = "25px";
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