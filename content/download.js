/**
 * UI MODULE: DownloadModule
 * Renders a download button for a single video and resolves/downloads its
 * CDN source URL on click.
 */
class DownloadModule {
  constructor(video, templateElement) {
    this.video = video;
    this.button = null;

    if (!templateElement) return;

    const clone = document.importNode(templateElement.content, true);
    Keybinds.applyTitles(clone);
    this.button = clone.querySelector(".reelsleek-download");
    if (!this.button) return;

    this.button.addEventListener("click", this.#handleClick);
    this.#injectUI(clone);
  }

  #injectUI(fragment) {
    const toolbarContainer = this.video.parentElement.querySelector(
      ".reelsleek-toolbar-container",
    );
    if (toolbarContainer) {
      if (toolbarContainer.querySelector(".reelsleek-download")) return;
      toolbarContainer.appendChild(fragment);
      return;
    }

    const parent = this.video.closest('[style*="--x-width"]');
    if (!parent) {
      console.warn(
        "[Download] no [style*='--x-width'] ancestor found — Instagram's DOM may have changed, button not injected",
      );
      return;
    }
    const toolbar = parent.nextElementSibling;
    if (!toolbar) {
      console.warn(
        "[Download] expected toolbar sibling not found — button not injected",
      );
      return;
    }
    if (toolbar.querySelector(".reelsleek-download")) return;
    const children = [...toolbar.children];
    toolbar.insertBefore(fragment, children[children.length - 2]);
  }

  #handleClick = async (e) => {
    e.stopPropagation();
    if (["loading", "ready"].includes(this.button.dataset.state)) return;

    this.#setState("loading");
    try {
      const url = await MediaResolver.resolve(this.video);
      if (!url) throw new Error("No downloadable video found");

      const filename = Download.buildFilename(this.video);

      // Play the "filling up" ready animation, then kick off the actual
      // download once the button reaches full opacity.
      await this.#playReadyAnimation();

      const response = await browser.runtime.sendMessage({
        type: "downloadMedia",
        url,
        filename,
      });
      if (!response?.ok) throw new Error(response?.error ?? "Download failed");

      this.#setState("done");
    } catch (err) {
      console.error("[Download] Failed to download video:", err);
      this.#setState("error");
    } finally {
      setTimeout(() => this.#setState(""), 1500);
    }
  };

  /**
   * Plays the top-to-bottom fill animation and resolves once the button
   * has reached full opacity, right before the download is triggered.
   * @returns {Promise<void>}
   */
  #playReadyAnimation() {
    return new Promise((resolve) => {
      this.#setState("ready");
      setTimeout(resolve, Download.READY_ANIMATION_MS);
    });
  }

  #setState(state) {
    if (this.button) this.button.dataset.state = state;
  }

  destroy() {
    this.button?.removeEventListener("click", this.#handleClick);
    this.button?.remove();
  }
}

/**
 * MAIN CONTROLLER
 * Attaches a download button to each video element.
 */
class Download {
  /** Duration (ms) of the top-to-bottom "ready" fill animation, kept in
   * sync with the CSS transition on .reelsleek-download[data-state="ready"]. */
  static READY_ANIMATION_MS = 420;

  /** @type {HTMLTemplateElement|null} */
  static #template = null;

  /** @type {WeakMap<HTMLVideoElement, DownloadModule>} */
  static #videoInstances = new WeakMap();

  /** @type {WeakSet<HTMLVideoElement>} */
  static #attaching = new WeakSet();

  /** @type {boolean} Whether the download feature is present/usable at all */
  static featureEnabled = true;

  /** @type {boolean} Whether downloads are organized into a "reelsleek" subfolder */
  static saveToFolder = true;

  static #StorageKey = "reelsleek-download-feature-enabled";
  static #SaveToFolderStorageKey = "reelsleek-download-save-to-folder";

  /**
   * Enables or disables the download feature itself (present/usable).
   * Persists the choice and applies it immediately across the page.
   * @param {boolean} enabled
   */
  static setFeatureEnabled(enabled) {
    Download.featureEnabled = enabled;
    browser.storage.local.set({ [Download.#StorageKey]: enabled });

    if (enabled) {
      FeatureOrder.reattachAll();
    } else {
      getCleanVideos().forEach((video) => Download.detach(video));
    }
  }

  /**
   * Toggles whether downloaded videos are placed in a "reelsleek" subfolder
   * inside the browser's default downloads location, vs. straight into it.
   * @param {boolean} enabled
   */
  static setSaveToFolder(enabled) {
    Download.saveToFolder = enabled;
    browser.storage.local.set({
      [Download.#SaveToFolderStorageKey]: enabled,
    });
  }

  static #attachKeybinds() {
    registerKeybind("download", "KeyD", "Download video", "Actions", () => {
      if (!Download.featureEnabled) return;
      if (PageHandler.isStorie()) return;
      Download.triggerDownload(VideoControl.currentlyPlayingVideo);
    });
  }

  /**
   * Triggers the download for a given video, as if its button was clicked.
   * @param {HTMLVideoElement|null} video
   */
  static triggerDownload(video) {
    if (!video) return;
    const instance = Download.#videoInstances.get(video);
    instance?.button?.click();
  }

  static async #loadExternalTemplates() {
    try {
      const fileUrl = browser.runtime.getURL("content/controls.html");
      const response = await fetch(fileUrl);
      const text = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      Download.#template = doc.getElementById("reelsleek-download-template");
    } catch (err) {
      console.error(
        "[Download] Error parsing download template asset file:",
        err,
      );
    }
  }

  static async setup() {
    const result = await browser.storage.local.get([
      Download.#StorageKey,
      Download.#SaveToFolderStorageKey,
    ]);
    Download.featureEnabled = result[Download.#StorageKey] ?? Download.featureEnabled;
    Download.saveToFolder = result[Download.#SaveToFolderStorageKey] ?? Download.saveToFolder;

    await Download.#loadExternalTemplates();
    Download.#attachKeybinds();
  }

  /**
   * @param {HTMLVideoElement} video
   * @returns {string}
   */
  static buildFilename(video) {
    const shortcode =
      MediaResolver.getShortcode(video) ?? `video-${Date.now()}`;
    return Download.saveToFolder
      ? `reelsleek/${shortcode}.mp4`
      : `${shortcode}.mp4`;
  }

  static attach(video) {
    if (!Download.featureEnabled) return;
    if (video.dataset.reelsleekDownloadAttached) return;
    if (Download.#attaching.has(video)) return;

    if (!Download.#template) {
      Download.#attaching.add(video);
      Download.#loadExternalTemplates().then(() => {
        Download.#attaching.delete(video);
        if (Download.#template && !video.dataset.reelsleekDownloadAttached) {
          Download.attach(video);
        }
      });
      return;
    }

    const moduleInstance = new DownloadModule(video, Download.#template);
    Download.#videoInstances.set(video, moduleInstance);
    video.dataset.reelsleekDownloadAttached = "true";
  }

  static detach(video) {
    Download.#attaching.delete(video);
    if (!video.dataset.reelsleekDownloadAttached) return;

    const instance = Download.#videoInstances.get(video);
    if (instance) {
      instance.destroy();
      Download.#videoInstances.delete(video);
    }
    delete video.dataset.reelsleekDownloadAttached;
  }

  static reset(video) {
    Download.detach(video);
    Download.attach(video);
  }

  static resetAll() {
    getCleanVideos().forEach((video) => Download.reset(video));
  }
}
