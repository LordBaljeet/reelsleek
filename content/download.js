/**
 * UI MODULE: DownloadModule
 * Renders a download button for a single video and resolves/downloads its
 * real CDN source URL on click (see content/mediaResolver.js for how the
 * video's `blob:` playback element is mapped back to a shortcode and
 * resolved to a direct CDN URL).
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
    if (ToolbarMode.isCustom()) {
      const toolbarContainer = this.video.parentElement.querySelector(
        ".reelsleek-toolbar-container",
      );
      if (!toolbarContainer) {
        console.warn(
          "[Download] no .reelsleek-toolbar-container found for video — button not injected",
        );
        return;
      }
      if (toolbarContainer.querySelector(".reelsleek-download")) return;
      toolbarContainer.appendChild(fragment);
    } else {
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
 * MAIN CONTROLLER / ORCHESTRATOR
 * Wires the download button into every video element.
 */
class Download {
  /** @type {HTMLTemplateElement|null} */
  static #template = null;

  /** @type {WeakMap<HTMLVideoElement, DownloadModule>} */
  static #videoInstances = new WeakMap();

  /** @type {IntersectionObserver|null} */
  static #viewportObserver = null;

  // Tracks videos currently waiting on #loadExternalTemplates() to finish,
  // so a second attach() call for the same video (e.g. re-triggered by a
  // fast infinite-scroll re-render) doesn't queue a duplicate template
  // callback and end up constructing two DownloadModule instances for one
  // <video>.
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

  static #setupViewportObserver() {
    if (typeof IntersectionObserver === "undefined") return;

    Download.#viewportObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const video = entry.target;
            // Pre-warm the resolution when video enters viewport
            MediaResolver.prewarm(video);
          }
        }
      },
      {
        rootMargin: "200px 0px", // Start pre-warming slightly before video is visible
        threshold: 0.01,
      },
    );
  }

  static async setup() {
    await Download.#loadExternalTemplates();
    Download.#setupViewportObserver();
  }

  /**
   * Builds a filename for the given video's download, using the same
   * shortcode resolution `MediaResolver` uses to find the video itself (DOM
   * first, then page URL), so home-feed downloads get a meaningful name
   * instead of always falling back to a generic timestamp.
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
    if (Download.#attaching.has(video)) return; // already waiting on the template load below

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

    // Start observing for pre-warming
    Download.#viewportObserver?.observe(video);

    MediaResolver.prewarm(video);
  }

  static detach(video) {
    Download.#attaching.delete(video);

    if (!video.dataset.reelsleekDownloadAttached) return;
    Download.#viewportObserver?.unobserve(video);
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
