/**
 * UI MODULE: AmbientModeModule
 * Renders a blurred, ambient backdrop behind a video so that switching the
 * video's object-fit from "cover" to "contain" doesn't leave empty bars on
 * the sides. The backdrop is a small offscreen canvas onto which we
 * periodically draw the current video frame (heavily downscaled), then let
 * a CSS filter blur it on the GPU. This keeps the feed's container size and
 * layout completely untouched.
 */
class AmbientModeModule {
  /** @type {number} Internal sampling resolution (kept tiny; it gets blurred anyway) */
  static #SAMPLE_SIZE = 64;

  /** @type {number} Minimum time between frame samples, in ms (~4fps is plenty once blurred) */
  static #UPDATE_INTERVAL_MS = 0;

  constructor(video) {
    this.video = video;
    this.container = video.parentElement;
    this.destroyed = false;
    this.isIntersecting = true;
    this.lastUpdate = 0;
    this.rafHandle = null;

    if (!this.container) return;

    // 1. Prepare the tiny offscreen canvas used purely as a pixel source
    this.canvas = document.createElement("canvas");
    this.canvas.className = "reelsleek-ambient-bg";
    this.canvas.width = AmbientModeModule.#SAMPLE_SIZE;
    this.canvas.height = AmbientModeModule.#SAMPLE_SIZE;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: false });

    // 2. Make sure the container can host an absolutely positioned backdrop
    //    without disturbing Instagram's own layout.
    const computed = getComputedStyle(this.container);
    if (computed.position === "static") {
      this.container.style.position = "relative";
      this.container.dataset.reelsleekAmbientForcedPosition = "true";
    }
    if (computed.overflow !== "hidden") {
      this.container.style.overflow = "hidden";
      this.container.dataset.reelsleekAmbientForcedOverflow = "true";
    }

    // 3. Swap the video to "contain" so the full frame is always visible,
    //    and drop the backdrop canvas behind it.
    video.classList.add("reelsleek-ambient-fg");
    this.container.prepend(this.canvas);

    // 4. Only sample frames while the video is actually visible on screen.
    this.observer = new IntersectionObserver(
      (entries) => {
        this.isIntersecting = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.1 },
    );
    this.observer.observe(video);

    this.#scheduleNextFrame();
  }

  #scheduleNextFrame() {
    if (this.destroyed) return;

    if (typeof this.video.requestVideoFrameCallback === "function") {
      this.video.requestVideoFrameCallback((now) => this.#onFrame(now));
    } else {
      this.rafHandle = requestAnimationFrame((now) => this.#onFrame(now));
    }
  }

  #onFrame(now) {
    if (this.destroyed) return;

    const shouldSample =
      this.isIntersecting &&
      !this.video.paused &&
      this.video.readyState >= 2 &&
      now - this.lastUpdate >= AmbientModeModule.#UPDATE_INTERVAL_MS;

    if (shouldSample) {
      this.lastUpdate = now;
      try {
        this.ctx.drawImage(
          this.video,
          0,
          0,
          AmbientModeModule.#SAMPLE_SIZE,
          AmbientModeModule.#SAMPLE_SIZE,
        );
      } catch (err) {
        // Frame not ready / transient decode error, safe to ignore.
      }
    }

    this.#scheduleNextFrame();
  }

  destroy() {
    this.destroyed = true;
    if (this.rafHandle) cancelAnimationFrame(this.rafHandle);
    this.observer?.disconnect();
    this.canvas?.remove();

    this.video.classList.remove("reelsleek-ambient-fg");

    if (this.container?.dataset.reelsleekAmbientForcedPosition) {
      this.container.style.position = "";
      delete this.container.dataset.reelsleekAmbientForcedPosition;
    }
    if (this.container?.dataset.reelsleekAmbientForcedOverflow) {
      this.container.style.overflow = "";
      delete this.container.dataset.reelsleekAmbientForcedOverflow;
    }
  }
}

/**
 * MAIN CONTROLLER / ORCHESTRATOR
 * Attaches/detaches ambient backdrops on home feed videos only, for now.
 */
class AmbientMode {
  /** @type {boolean} Whether ambient mode is active */
  static enabled = true;

  /** @type {string} Storage key used to persist the enabled toggle */
  static #StorageKey = "reelsleek-ambient-mode";

  /** @type {WeakMap<HTMLVideoElement, AmbientModeModule>} */
  static #videoInstances = new WeakMap();

  /**
   * Restricts ambient mode to the home feed for now.
   * @returns {boolean}
   */
  static #isEligiblePage() {
    return window.location.pathname === "/" && PageHandler.isFeed();
  }

  static async setup() {
    const result = await browser.storage.local.get([this.#StorageKey]);
    this.enabled = result[this.#StorageKey] ?? true;
  }

  /**
   * Enables or disables ambient mode, persists the choice, and applies it
   * immediately to every eligible video on the page.
   * @param {boolean} enabled
   */
  static setEnabled(enabled) {
    AmbientMode.enabled = enabled;
    browser.storage.local.set({ [AmbientMode.#StorageKey]: enabled });

    if (enabled) {
      AmbientMode.resetAll();
    } else {
      getCleanVideos().forEach((video) => AmbientMode.detach(video));
    }
  }

  /**
   * Attaches the ambient backdrop to a feed video.
   * @param {HTMLVideoElement} video
   */
  static attach(video) {
    if (!AmbientMode.enabled) return;
    if (video.dataset.reelsleekAmbientAttached) return;
    if (!AmbientMode.#isEligiblePage()) return;
    if (!video.parentElement) return;

    const moduleInstance = new AmbientModeModule(video);
    AmbientMode.#videoInstances.set(video, moduleInstance);
    video.dataset.reelsleekAmbientAttached = "true";
  }

  /**
   * Detaches and cleans up the ambient backdrop from a video.
   * @param {HTMLVideoElement} video
   */
  static detach(video) {
    if (!video.dataset.reelsleekAmbientAttached) return;

    const instance = AmbientMode.#videoInstances.get(video);
    if (instance) {
      instance.destroy();
      AmbientMode.#videoInstances.delete(video);
    }

    delete video.dataset.reelsleekAmbientAttached;
  }

  static reset(video) {
    AmbientMode.detach(video);
    AmbientMode.attach(video);
  }

  static resetAll() {
    getCleanVideos().forEach((video) => AmbientMode.reset(video));
  }
}
