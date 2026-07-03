/**
 * UI MODULE: RotateModule
 * Handles component tree setup, localized lookups, and scoped layout bindings.
 */
class RotateModule {
  constructor(video, templateElement, rotateCallback, eventsPublisher, rotateEvent) {
    this.video = video;
    this.container = null;

    if (!templateElement) return;

    // 1. Unpack structure fragments out of the asset instance
    const clone = document.importNode(templateElement.content, true);
    this.container = clone.querySelector(".reelsleek-rotate-container");
    if (!this.container) return;

    const templateStyle = clone.querySelector("style");
    if (templateStyle) {
      this.container.appendChild(templateStyle);
    }
    
    const mainButton = this.container.querySelector(".reelsleek-rotate-main");
    const leftButton = this.container.querySelector(".reelsleek-rotate-left");
    const rightButton = this.container.querySelector(".reelsleek-rotate-right");

    // 2. Map localized interaction loops
    leftButton?.addEventListener("click", (e) => {
      e.stopPropagation();
      rotateCallback(-1);
    });

    rightButton?.addEventListener("click", (e) => {
      e.stopPropagation();
      rotateCallback(1);
    });

    mainButton?.addEventListener("click", (e) => {
      e.stopPropagation();
      const currentRotation = parseInt(this.video.dataset.reelsleekRotation || "0", 10);
      rotateCallback(-currentRotation);
    });

    // 3. Register state adjustments specifically against the main button instance
    if (mainButton) {
      this.rotateSubscriber = new EventSubscriber(mainButton);
      this.rotateSubscriber.subscribe(rotateEvent, (args) => {
        if (args.video.src !== this.video.src) return;
        mainButton.setAttribute("aria-pressed", String(args.rotation !== 0));
      });
      eventsPublisher.addSubscriber(this.rotateSubscriber);
    }

    // 4. Inject compiled module elements into active layouts
    this.#injectUI(this.container);
  }

  #injectUI(element) {
    if (ToolbarMode.isCustom()) {
      const toolbarContainer = this.video.parentElement.querySelector('.reelsleek-toolbar-container');
      if (!toolbarContainer || toolbarContainer.querySelector('.reelsleek-rotate-container')) return;
      toolbarContainer.appendChild(element);
    } else {
      const parent = this.video.closest('[style*="--x-width"]');
      if (!parent) return;
      const toolbar = parent.nextElementSibling;
      if (!toolbar || toolbar.querySelector('.reelsleek-rotate-container')) return;
      const children = [...toolbar.children];
      toolbar.insertBefore(element, children[children.length - 2]);
    }
  }

  destroy() {
    this.container?.remove();
  }
}

/**
 * MAIN CONTROLLER / ORCHESTRATOR
 * Orchestrates viewport computations, document keybind handlers, and active structural memory states.
 */
class Rotate {
  static #eventsPublisher = new EventPublisher();

  static #Event = {
    "ROTATE": "rotate",
  };

  /** @type {HTMLTemplateElement|null} Stores parsed component element asset */
  static #template = null;

  /** @type {WeakMap<HTMLVideoElement, RotateModule>} Track map allocations */
  static #videoInstances = new WeakMap();

  /**
   * Applies geometric alterations onto video element frames.
   * Explicitly safe from execution tracking context context mutations.
   * @param {Number} rotations - Count of 90-degree adjustments to introduce
   */
  static rotateVideo(rotations = 1) {
    const video = VideoControl.currentlyPlayingVideo;
    if (!video) return;

    const orientChanged = rotations % 2 !== 0;
    const currentRotation = parseInt(video.dataset.reelsleekRotation || "0", 10);
    const newRotation = ((currentRotation + rotations) % 4 + 4) % 4;

    const container = getNthParent(video, 10);
    container.style.height = '100%';

    const containerParent = container.parentElement.parentElement;
    const wrapper = container.closest('div[tabindex="-1"] > div');
    wrapper.style.height = '100%';
    wrapper.style.alignItems = 'center';

    const parent = video.parentElement;
    parent.style.display = 'flex';
    parent.style.justifyContent = 'center';
    parent.style.alignItems = 'center';

    if (orientChanged) {
      const parentDimensions = containerParent.getBoundingClientRect();
      containerParent.style.height = `${parentDimensions.width}px`;
      containerParent.style.width = `${parentDimensions.height}px`;
      video.parentElement.style.width = containerParent.style.width;
    }

    const originalOrientChanged = newRotation % 2 != 0;
    if (originalOrientChanged) {
      video.style.width = containerParent.style.height;
      video.style.height = containerParent.style.width;
    } else {
      video.parentElement.style.width = '';
      video.style.width = "100%";
      video.style.height = "100%";
    }

    video.style.transformOrigin = 'center center';
    video.style.transform = `rotate(${newRotation * 90}deg)`;

    video.dataset.reelsleekRotation = newRotation;
    Rotate.#eventsPublisher.publish(Rotate.#Event.ROTATE, { video: video, rotation: newRotation });
  }

  /**
   * Binds layout access keystroke listening listeners.
   * @private
   */
  static #attachKeybinds() {
    addKeybind("KeyJ", () => {
      if (!PageHandler.isReel()) return;
      Rotate.rotateVideo(-1);
    });
    addKeybind("KeyK", () => {
      if (!PageHandler.isReel()) return;
      Rotate.rotateVideo(1);
    });
    addKeybind("KeyH", () => {
      if (!PageHandler.isReel()) return;
      const video = VideoControl.currentlyPlayingVideo;
      if (!video) return;
      const currentRotation = parseInt(video.dataset.reelsleekRotation || "0", 10);
      Rotate.rotateVideo(-currentRotation);
    });
  }

  /**
   * Resolves component resources out of asset directories asynchronously.
   */
  static async #loadExternalTemplates() {
    try {
      const fileUrl = browser.runtime.getURL("content/controls.html");
      const response = await fetch(fileUrl);
      const text = await response.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      Rotate.#template = doc.getElementById("reelsleek-rotate-template");
    } catch (err) {
      console.error("[Rotate] Error parsing structural component template asset file:", err);
    }
  }

  /**
   * Provisions extension components on application boot.
   * @returns {Promise<void>}
   */
  static async setup() {
    await Rotate.#loadExternalTemplates();
    Rotate.#attachKeybinds();
  }

  /**
   * Hooks localized modules onto specified targets.
   * @param {HTMLVideoElement} video - Active streaming context target
   */
  static attach(video) {
    if (video.dataset.reelsleekRotateAttached) return;
    if (!window.location.href.includes('/reels/')) return;

    const moduleInstance = new RotateModule(
      video,
      Rotate.#template,
      Rotate.rotateVideo,
      Rotate.#eventsPublisher,
      Rotate.#Event.ROTATE
    );

    Rotate.#videoInstances.set(video, moduleInstance);
    video.dataset.reelsleekRotateAttached = "true";
  }

  /**
   * De-allocates and clears explicit node linkages cleanly from memory.
   * @param {HTMLVideoElement} video - Source node to wipe
   */
  static detach(video) {
    if (!video.dataset.reelsleekRotateAttached) return;

    const instance = Rotate.#videoInstances.get(video);
    if (instance) {
      instance.destroy();
      Rotate.#videoInstances.delete(video);
    }

    delete video.dataset.reelsleekRotateAttached;
  }

  /**
   * Coordinates structural item rebuild updates.
   */
  static reset(video) {
    Rotate.detach(video);
    Rotate.attach(video);
  }

  /**
   * Refreshes active pipelines site-wide.
   */
  static resetAll() {
    getCleanVideos().forEach(video => Rotate.reset(video));
  }
}