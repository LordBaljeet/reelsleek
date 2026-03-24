/**
 * Messaging utility for communicating with content scripts.
 * Provides a clean API for tab messaging and permission checks.
 */
class Messenger {
  /**
   * Gets the currently active Instagram tab.
   * @returns {Promise<browser.tabs.Tab|null>} The active tab or null
   */
  static async getActiveTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  }

  /**
   * Checks if a tab is an Instagram page.
   * @param {browser.tabs.Tab} tab - The tab to check
   * @returns {boolean} Whether the tab is Instagram
   */
  static isInstagramTab(tab) {
    return /^https:\/\/(www\.)?instagram\.com/.test(tab.url);
  }

  /**
   * Sends a message to the active tab's content script.
   * @param {string} type - The message type
   * @param {Object} [data={}] - Additional message data
   * @returns {Promise<any>} The response from the content script
   */
  static async sendToActiveTab(type, data = {}) {
    const tab = await this.getActiveTab();
    if (!tab) return null;

    try {
      return await browser.tabs.sendMessage(tab.id, { type, ...data });
    } catch {
      return null;
    }
  }

  /**
   * Checks if the extension has permission to access Instagram.
   * @returns {Promise<boolean>} Whether permission is granted
   */
  static async checkPermission() {
    return await browser.runtime.sendMessage({ type: "checkPermission" });
  }

  /**
   * Requests permission to access Instagram.
   * @returns {Promise<boolean>} Whether permission was granted
   */
  static async requestPermission() {
    return await browser.permissions.request({
      origins: ["*://*.instagram.com/*"],
    });
  }

  /**
   * Reloads the active tab.
   * @returns {Promise<void>}
   */
  static async reloadActiveTab() {
    const tab = await this.getActiveTab();
    if (tab) {
      await browser.tabs.reload(tab.id);
    }
  }

  /**
   * Sends a reset message to the active tab's content script.
   * @returns {Promise<any>} The response from the content script
   */
  static async resetAllControls() {
    return await this.sendToActiveTab("resetAll");
  }
}

/**
 * Controls the popup UI state and interactions.
 * Manages all UI elements and their event handlers.
 */
class PopupController {
  /** @type {PopupController|null} Singleton instance */
  static instance = null;

  /**
   * Creates or returns the singleton PopupController instance.
   * @returns {PopupController} The controller instance
   */
  static getInstance() {
    if (!this.instance) {
      this.instance = new PopupController();
    }
    return this.instance;
  }

  constructor() {
    // Status elements
    this.statusPill = document.getElementById("statusPill");
    this.statusDot = document.getElementById("statusDot");
    this.statusText = document.getElementById("statusText");

    // Permission elements
    this.permBanner = document.getElementById("permBanner");
    this.permBtn = document.getElementById("permBtn");

    // Content container
    this.container = document.getElementById("container");

    // Control elements
    this.orientToggle = document.getElementById("orientToggle");
    this.volumeVisToggle = document.getElementById("volumeVisToggle");
    this.seekbarVisToggle = document.getElementById("seekbarVisToggle");
    this.autoscrollToggle = document.getElementById("autoscrollToggle");
    this.reloadBtn = document.getElementById("reloadBtn");

    // Info elements
    this.volumeState = document.getElementById("volume-state");
    this.muteState = document.getElementById("mute-state");

    // Toast
    this.toast = document.getElementById("toast");
    this.toastTimer = null;

    // Current state
    this.activeState = "inactive";

    this.#attachEventListeners();
  }

  /**
   * Attaches all event listeners to UI elements.
   * @private
   */
  #attachEventListeners() {
    // Permission button
    this.permBtn.addEventListener("click", () => this.#handlePermissionRequest());

    // Orientation toggle
    this.orientToggle.querySelectorAll(".orient-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.#handleOrientationChange(btn.dataset.orient));
    });

    // Visibility toggles
    this.#setupVisToggle(this.volumeVisToggle, "setVolumeAlwaysVisible");
    this.#setupVisToggle(this.seekbarVisToggle, "setSeekbarAlwaysVisible");

    // Autoscroll toggle
    this.autoscrollToggle.querySelectorAll(".vis-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.#handleAutoscrollChange(btn.dataset.autoscroll === "true"));
    });

    // Reload button
    this.reloadBtn.addEventListener("click", () => this.#handleReload());
  }

  /**
   * Sets up a visibility toggle with its event listeners.
   * @param {HTMLElement} toggleEl - The toggle element
   * @param {string} messageType - The message type to send
   * @private
   */
  #setupVisToggle(toggleEl, messageType) {
    toggleEl.querySelectorAll(".vis-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const alwaysVisible = btn.dataset.vis === "always";
        this.#applyVisToggle(toggleEl, alwaysVisible);
        await Messenger.sendToActiveTab(messageType, { value: alwaysVisible });
        this.showToast("saved", "ok");
      });
    });
  }

  /**
   * Initializes the popup by checking permissions and status.
   * @returns {Promise<void>}
   */
  async initialize() {
    const permitted = await Messenger.checkPermission();
    this.permBanner.hidden = permitted;

    if (!permitted) {
      this.setStatus("inactive");
      return;
    }

    const tab = await Messenger.getActiveTab();
    if (!tab || !Messenger.isInstagramTab(tab)) {
      this.setStatus("inactive");
      return;
    }

    const response = await Messenger.sendToActiveTab("ping");
    this.setStatus(response ? "active" : "error");

    if (response) {
      this.#updateUIFromResponse(response);
    }
  }

  /**
   * Updates the UI with data from the content script.
   * @param {Object} response - The response from the content script
   * @param {number} response.volume - Current volume level
   * @param {boolean} response.muted - Whether audio is muted
   * @param {string} response.orient - Slider orientation
   * @param {boolean} response.audioControlAlwaysVisible - Volume slider visibility
   * @param {boolean} response.videoControlAlwaysVisible - Seekbar visibility
   * @param {boolean} response.autoscrollEnabled - Autoscroll state
   * @private
   */
  #updateUIFromResponse(response) {
    // Update volume info
    this.volumeState.textContent = `${Math.round(response.volume * 100)}%`;
    this.muteState.textContent = String(response.muted);

    // Update orientation
    this.orientToggle.className = "orient-toggle " + response.orient;

    // Update visibility toggles
    this.#applyVisToggle(this.volumeVisToggle, response.audioControlAlwaysVisible);
    this.#applyVisToggle(this.seekbarVisToggle, response.videoControlAlwaysVisible);

    // Update autoscroll
    this.#applyAutoscrollToggle(response.autoscrollEnabled);
  }

  /**
   * Sets the status indicator state.
   * @param {"active"|"error"|"inactive"} state - The status state
   */
  setStatus(state) {
    this.statusPill.className = "status-pill " + state;
    this.statusDot.className = "dot" + (state === "active" ? " pulse" : "");
    this.activeState = state;
    this.statusText.textContent = state;

    if (state === "active") {
      this.container.classList.add("active");
    }
  }

  /**
   * Shows a toast notification.
   * @param {string} msg - The message to display
   * @param {"ok"|"err"|""} [type=""] - The toast type for styling
   */
  showToast(msg, type = "") {
    this.toast.textContent = msg;
    this.toast.className = "toast " + type;

    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast.textContent = "";
      this.toast.className = "toast";
    }, 1500);
  }

  /**
   * Applies the active state to a visibility toggle.
   * @param {HTMLElement} toggleEl - The toggle element
   * @param {boolean} alwaysVisible - Whether the control should always be visible
   * @private
   */
  #applyVisToggle(toggleEl, alwaysVisible) {
    toggleEl.querySelectorAll(".vis-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.vis === (alwaysVisible ? "always" : "hover"));
    });
  }

  /**
   * Applies the active state to the autoscroll toggle.
   * @param {boolean} enabled - Whether autoscroll is enabled
   * @private
   */
  #applyAutoscrollToggle(enabled) {
    this.autoscrollToggle.querySelectorAll(".vis-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.autoscroll === String(enabled));
    });
  }

  /**
   * Handles permission request button click.
   * @private
   * @returns {Promise<void>}
   */
  async #handlePermissionRequest() {
    this.permBtn.disabled = true;
    this.permBtn.textContent = "Waiting…";

    const granted = await Messenger.requestPermission();

    if (granted) {
      this.permBanner.hidden = true;
      await this.initialize();
    } else {
      this.permBtn.disabled = false;
      this.permBtn.textContent = "Grant access";
      this.showToast("Permission denied", "err");
    }
  }

  /**
   * Handles orientation toggle change.
   * @param {string} orientation - The new orientation ("horizontal" or "vertical")
   * @private
   * @returns {Promise<void>}
   */
  async #handleOrientationChange(orientation) {
    this.orientToggle.className = "orient-toggle " + orientation;
    await Messenger.sendToActiveTab("setOrientation", { value: orientation });
    this.showToast("saved", "ok");
  }

  /**
   * Handles autoscroll toggle change.
   * @param {boolean} enabled - Whether autoscroll should be enabled
   * @private
   * @returns {Promise<void>}
   */
  async #handleAutoscrollChange(enabled) {
    this.#applyAutoscrollToggle(enabled);
    await Messenger.sendToActiveTab("setAutoscroll", { value: enabled });
    this.showToast("saved", "ok");
  }

  /**
   * Handles reload button click.
   * @private
   * @returns {Promise<void>}
   */
  async #handleReload() {
    this.reloadBtn.classList.add("spinning");
    this.reloadBtn.disabled = true;

    const response = await Messenger.resetAllControls();

    if (response?.ok) {
      this.showToast("Controls reset", "ok");
    } else {
      this.showToast("Reset failed", "err");
    }

    // Re-enable button after short delay
    setTimeout(() => {
      this.reloadBtn.classList.remove("spinning");
      this.reloadBtn.disabled = false;
    }, 1000);
  }
}

// Initialize the popup when the DOM is ready
(async () => {
  const controller = PopupController.getInstance();
  await controller.initialize();
})();
