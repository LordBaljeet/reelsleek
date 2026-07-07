/**
 * UI MODULE: DownloadModule
 * Renders a download button for a single video and resolves/downloads its
 * real CDN source URL on click (see content/mediaResolver.js for how the
 * `blob:` playback URL is turned into something downloadable).
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
      if (
        !toolbarContainer ||
        toolbarContainer.querySelector(".reelsleek-download")
      )
        return;
      toolbarContainer.appendChild(fragment);
    } else {
      const parent = this.video.closest('[style*="--x-width"]');
      if (!parent) return;
      const toolbar = parent.nextElementSibling;
      if (!toolbar || toolbar.querySelector(".reelsleek-download")) return;
      const children = [...toolbar.children];
      toolbar.insertBefore(fragment, children[children.length - 2]);
    }
  }

  #handleClick = async (e) => {
    e.stopPropagation();
    if (this.button.dataset.state === "loading") return;

    this.#setState("loading");
    try {
      const result = await MediaResolver.resolve(this.video);
      if (!result) throw new Error("No downloadable video found");

      const filename = Download.buildFilename();

      if (result.type === "blob") {
        Download.saveBlob(result.blob, filename);
      } else {
        const response = await browser.runtime.sendMessage({
          type: "downloadMedia",
          url: result.url,
          filename,
        });
        if (!response?.ok)
          throw new Error(response?.error ?? "Download failed");
      }

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
   * Builds a filename for the currently-targeted download.
   * @returns {string}
   */
  static buildFilename() {
    const shortcode = PageHandler.getShortcode() ?? `video-${Date.now()}`;
    return `reelsleek/${shortcode}.mp4`;
  }

  /**
   * Saves a Blob directly via a temporary `<a download>` link. Used for the
   * captured-bytes path, which never leaves the page's own context (no
   * `downloads` permission/background round-trip required).
   * @param {Blob} blob
   * @param {string} filename - May include a folder segment; only the base
   *   name is used, since `<a download>` does not support subfolders.
   */
  static saveBlob(blob, filename) {
    const baseName = filename.split("/").pop() || "video.mp4";
    const objectUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = baseName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  }

  static attach(video) {
    if (video.dataset.reelsleekDownloadAttached) return;

    if (!Download.#template) {
      Download.#loadExternalTemplates().then(() => {
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
