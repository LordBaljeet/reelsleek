/**
 * UI MODULE: Seekbar
 */
class SeekbarModule {
  constructor(video, templateElement) {
    this.video = video;
    this.isSeeking = false;

    this.container = document.createElement("div");
    this.container.className = "reelsleek-video-control";

    if (templateElement) {
      const clone = document.importNode(templateElement.content, true);
      this.container.appendChild(clone);
    }
    this.video.parentElement.append(this.container);

    this.seekbar = this.container.querySelector("input");
    this.fillEl = this.container.querySelector(".reelsleek-seekbar-fill");
    this.tooltipEl = this.container.querySelector(".reelsleek-seekbar-tooltip");

    this.#initListeners();
  }

  #initListeners() {
    this.container.addEventListener("mousemove", (e) => this.#handleTooltipMove(e));
    this.seekbar.addEventListener("mousedown", () => { this.isSeeking = true; this.fillEl.style.transition = 'none'; });
    this.seekbar.addEventListener("touchstart", () => { this.isSeeking = true; this.fillEl.style.transition = 'none'; });

    this.seekbar.addEventListener("mouseup", () => {
      this.isSeeking = false;
      if (!this.video.paused) this.syncPlay();
    });
    this.seekbar.addEventListener("touchend", () => {
      this.isSeeking = false;
      if (!this.video.paused) this.syncPlay();
    });

    this.seekbar.addEventListener("input", (e) => this.#handleInputChange(e));
    this.seekbar.addEventListener("click", (e) => e.stopPropagation());
  }

  #handleTooltipMove(e) {
    if (!isFinite(this.video.duration)) return;

    const rect = this.container.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
    const targetTime = percentage * this.video.duration;

    this.tooltipEl.textContent = this.#formatTime(targetTime);

    const tooltipWidth = this.tooltipEl.offsetWidth;
    const halfTooltipWidth = tooltipWidth / 2;
    const clampedX = Math.max(halfTooltipWidth, Math.min(rect.width - halfTooltipWidth, offsetX));

    this.tooltipEl.style.left = `${clampedX}px`;
  }

  #handleInputChange(e) {
    e.stopPropagation();
    if (!isFinite(this.video.duration)) return;

    const progress = this.seekbar.value / 100;
    this.video.currentTime = this.video.duration * progress;

    this.fillEl.style.transition = 'none';
    this.fillEl.style.transform = `scaleX(${progress})`;
  }

  #formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const paddedSeconds = s.toString().padStart(2, "0");
    if (h > 0) {
      const paddedMinutes = m.toString().padStart(2, "0");
      return `${h}:${paddedMinutes}:${paddedSeconds}`;
    }
    return `${m}:${paddedSeconds}`;
  }

  syncPlay() {
    if (!isFinite(this.video.duration) || this.isSeeking || this.video.paused) return;

    const currentProgress = this.video.currentTime / this.video.duration;
    const remainingTime = (this.video.duration - this.video.currentTime) / (this.video.playbackRate || 1);

    this.fillEl.style.transition = 'none';
    this.fillEl.style.transform = `scaleX(${currentProgress})`;
    this.fillEl.offsetHeight;

    this.fillEl.style.transition = `transform ${remainingTime}s linear, height 0.1s`;
    this.fillEl.style.transform = 'scaleX(1)';
  }

  syncPause() {
    if (!isFinite(this.video.duration)) return;

    const currentProgress = this.video.currentTime / this.video.duration;
    this.fillEl.style.transition = 'none';
    this.fillEl.style.transform = `scaleX(${currentProgress})`;
    this.seekbar.value = `${currentProgress * 100}`;
  }

  setUiPaused(isPaused) {
    this.container.dataset.showPaused = isPaused ? "true" : "false";
  }

  destroy() {
    this.container.remove();
  }
}

/**
 * UI MODULE: Fullscreen
 */
class FullscreenModule {
  constructor(video, templateElement, toggleFullscreenCallback) {
    this.video = video;
    this.toggleFullscreen = toggleFullscreenCallback;
    this.container = null;

    this.#buildUI(templateElement);
  }

  #buildUI(templateElement) {
    if (!templateElement) return;

    const toolbarContainer = this.video.parentElement.querySelector('.reelsleek-toolbar-container');
    if (toolbarContainer) {
      const clone = document.importNode(templateElement.content, true);
      toolbarContainer.appendChild(clone);
      this.button = toolbarContainer.querySelector('.reelsleek-fullscreen-button');
      this.button.addEventListener('click', this.#handleButtonClick);
    } else {
      this.container = document.createElement("div");
      this.container.className = "reelsleek-fullscreen-container";

      const clone = document.importNode(templateElement.content, true);
      this.container.appendChild(clone);

      this.button = this.container.querySelector("button");
      this.button.addEventListener("click", this.#handleButtonClick);

      if (!PageHandler.isStorie()) {
        this.video.parentElement.prepend(this.container);
      }
    }
  }

  #handleButtonClick = (e) => {
    ToolbarMode.isCustom() ? stopEvent(e) : e.stopPropagation();
    this.toggleFullscreen(this.video);
  };

  destroy() {
    this.container?.remove();
  }
}

/**
 * UI MODULE: PlayOverlay
 */
class PlayOverlayModule {
  constructor(video, templateElement, togglePlayCallback, toggleFullscreenCallback) {
    this.video = video;
    this.togglePlay = togglePlayCallback;
    this.toggleFullscreen = toggleFullscreenCallback;

    this.container = document.createElement("div");
    this.container.className = 'reelsleek-play-container';

    if (templateElement) {
      const clone = document.importNode(templateElement.content, true);
      this.container.appendChild(clone);
    }

    this.container.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      this.toggleFullscreen(this.video);
    });

    this.container.addEventListener("click", (e) => {
      e.stopPropagation();
      this.togglePlay(this.video);
    });

    this.video.parentElement.prepend(this.container);
  }

  setUiPaused(isPaused) {
    this.container.dataset.showPaused = isPaused ? "true" : "false";
  }

  destroy() {
    this.container.remove();
  }
}

/**
 * MAIN CONTROLLER / ORCHESTRATOR
 */
class VideoControl {
  static currentlyPlayingVideo = null;
  static alwaysVisible = true;
  static fullscreenOn = false;

  static #StorageKeys = {
    "visibilityKey": "reelsleek-videocontrol-visibility",
  };

  // Static dictionary cache holding our file-extracted HTML templates
  static #templates = {
    seekbar: null,
    fullscreen: null,
    playOverlay: null
  };

  static #videoInstances = new WeakMap();

  static setCurrentlyPlayingVideo(video, firstLoad = false) {
    if (firstLoad && this.currentlyPlayingVideo) return;
    if (this.currentlyPlayingVideo != video) {
      this.currentlyPlayingVideo?.pause();
    }
    this.currentlyPlayingVideo = video;
  }

  static setFullscreen(on) {
    this.fullscreenOn = on;
    if (!on && document.fullscreenElement) document.exitFullscreen();
  }

  static toggleFullscreen(video) {
    if (!video) return;
    VideoControl.setFullscreen(!VideoControl.fullscreenOn);
    if (VideoControl.fullscreenOn) {
      const fullscreenTarget = video.parentElement.parentElement;
      fullscreenTarget.requestFullscreen().catch((err) => {
        console.error(`[VideoControl] Fullscreen error: ${err.message}`);
      });
      if (video != VideoControl.currentlyPlayingVideo) {
        video.play();
      }
      VideoControl.setCurrentlyPlayingVideo(video);
    }
  }

  static togglePlay(video) {
    video.paused ? video.play() : video.pause();
  }

  static async #loadStates() {
    const result = await browser.storage.local.get([this.#StorageKeys.visibilityKey]);
    this.alwaysVisible = result[this.#StorageKeys.visibilityKey] ?? this.alwaysVisible;
  }

  // Asynchronously requests the bundled asset template package file
  static async #loadExternalTemplates() {
    try {
      const fileUrl = browser.runtime.getURL("content/controls.html");
      const response = await fetch(fileUrl);
      const text = await response.text();

      // Setup an offscreen temporary parser node
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");

      // Extract template components out into memory variables
      this.#templates.seekbar = doc.getElementById("reelsleek-seekbar-template");
      this.#templates.fullscreen = doc.getElementById("reelsleek-fullscreen-template");
      this.#templates.playOverlay = doc.getElementById("reelsleek-play-template");
    } catch (err) {
      console.error("[VideoControl] Error loading controls.html template asset file:", err);
    }
  }

  static #saveStates() {
    browser.storage.local.set({ [this.#StorageKeys.visibilityKey]: this.alwaysVisible });
  }

  static #attachKeybinds() {
    addKeybind("ArrowRight", () => {
      if (PageHandler.isStorie()) return;
      this.currentlyPlayingVideo.currentTime += 5;
    });
    addKeybind("ArrowLeft", () => {
      if (PageHandler.isStorie()) return;
      this.currentlyPlayingVideo.currentTime -= 5;
    });
    addKeybind("KeyP", () => this.togglePlay(this.currentlyPlayingVideo));
    addKeybind("Space", (e) => {
      this.togglePlay(this.currentlyPlayingVideo);
      stopEvent(e);
    });
    addKeybind("KeyF", () => this.toggleFullscreen(this.currentlyPlayingVideo));
  }

  static async setup() {
    await this.#loadStates();
    await this.#loadExternalTemplates(); // Load and unpack the external file
    this.#attachKeybinds();
    document.body.classList.toggle("reelsleek-seekbar-always-visible", this.alwaysVisible);
  }

  static setVisibility(visibility) {
    this.alwaysVisible = visibility;
    document.body.classList.toggle("reelsleek-seekbar-always-visible", this.alwaysVisible);
    this.#saveStates();
  }

  static attach(video) {
    if (video.dataset.reelsleekVideoControlAttached) return;
    video.dataset.reelsleekVideoControlAttached = "true";

    // Pass the pre-parsed templates down to each initialization module cleanly
    const seekbar = new SeekbarModule(video, this.#templates.seekbar);
    const fullscreen = new FullscreenModule(video, this.#templates.fullscreen, VideoControl.toggleFullscreen);
    const playOverlay = new PlayOverlayModule(video, this.#templates.playOverlay, VideoControl.togglePlay, VideoControl.toggleFullscreen);

    const playListener = () => {
      seekbar.setUiPaused(false);
      playOverlay.setUiPaused(false);

      let targetVideo = video;
      if (this.fullscreenOn && video != this.currentlyPlayingVideo) {
        video.pause();
        targetVideo = this.currentlyPlayingVideo;
      }
      this.setCurrentlyPlayingVideo(targetVideo);
      seekbar.syncPlay();
    };

    const pauseListener = () => {
      seekbar.setUiPaused(true);
      playOverlay.setUiPaused(true);
      seekbar.syncPause();
    };

    const seekedListener = () => {
      if (!seekbar.isSeeking) {
        video.paused ? seekbar.syncPause() : seekbar.syncPlay();
      }
    };

    const ratechangeListener = () => {
      if (!video.paused) seekbar.syncPlay();
    };

    video.addEventListener("play", playListener);
    video.addEventListener("pause", pauseListener);
    video.addEventListener("seeked", seekedListener);
    video.addEventListener("ratechange", ratechangeListener);
    video.addEventListener("waiting", pauseListener);
    video.addEventListener("playing", playListener);

    this.#videoInstances.set(video, {
      modules: { seekbar, fullscreen, playOverlay },
      listeners: {
        play: playListener,
        pause: pauseListener,
        seeked: seekedListener,
        ratechange: ratechangeListener
      }
    });

    if (!PageHandler.isStorie()) return;
    const storieParent = getNthParent(video, 14);
    const replyContainer = storieParent?.nextSibling?.firstChild;
    if (!replyContainer) return;
    replyContainer.style.background = "none";
    replyContainer.style.paddingBottom = "25px";
  }

  static detach(video) {
    if (!video.dataset.reelsleekVideoControlAttached) return;

    const data = this.#videoInstances.get(video);
    if (data) {
      video.removeEventListener("play", data.listeners.play);
      video.removeEventListener("pause", data.listeners.pause);
      video.removeEventListener("seeked", data.listeners.seeked);
      video.removeEventListener("ratechange", data.listeners.ratechange);
      video.removeEventListener("waiting", data.listeners.pause);
      video.removeEventListener("playing", data.listeners.play);

      data.modules.seekbar.destroy();
      data.modules.fullscreen.destroy();
      data.modules.playOverlay.destroy();

      this.#videoInstances.delete(video);
    }

    delete video.dataset.reelsleekVideoControlAttached;
  }

  static reset(video) {
    this.detach(video);
    this.attach(video);
  }

  static resetAll() {
    getCleanVideos().forEach(video => this.reset(video));
  }
}
