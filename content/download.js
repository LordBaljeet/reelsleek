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
    if (this.button.dataset.state === "loading") return;

    this.#setState("loading");
    try {
      const url = await MediaResolver.resolve(this.video);
      if (!url) throw new Error("No downloadable video found");

      const filename = Download.buildFilename(this.video);
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
  /** @type {HTMLTemplateElement|null} */
  static #template = null;

  /** @type {WeakMap<HTMLVideoElement, DownloadModule>} */
  static #videoInstances = new WeakMap();

  /** @type {WeakSet<HTMLVideoElement>} */
  static #attaching = new WeakSet();

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
    await Download.#loadExternalTemplates();
  }

  /**
   * @param {HTMLVideoElement} video
   * @returns {string}
   */
  static buildFilename(video) {
    const shortcode =
      MediaResolver.getShortcode(video) ?? `video-${Date.now()}`;
    return `reelsleek/${shortcode}.mp4`;
  }

  static attach(video) {
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
