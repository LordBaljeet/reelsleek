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
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
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

    // Tabs
    this.tabButtons = document.querySelectorAll(".tab-btn");
    this.tabPanels = document.querySelectorAll(".tab-panel");

    // Control elements
    this.orientToggle = document.getElementById("orientToggle");
    this.volumeVisToggle = document.getElementById("volumeVisToggle");
    this.seekbarVisToggle = document.getElementById("seekbarVisToggle");
    this.ambientModeToggle = document.getElementById("ambientModeToggle");
    this.toolbarModeToggle = document.getElementById("toolbarModeToggle");
    this.controlRadiusToggle = document.getElementById("controlRadiusToggle");
    this.reloadBtn = document.getElementById("reloadBtn");

    // Controls tab (behavior toggles)
    this.dblClickFsToggle = document.getElementById("dblClickFsToggle");
    this.downloadFolderToggle = document.getElementById("downloadFolderToggle");
    this.theaterFeatureToggle = document.getElementById("theaterFeatureToggle");
    this.autoscrollFeatureToggle = document.getElementById("autoscrollFeatureToggle");
    this.downloadFeatureToggle = document.getElementById("downloadFeatureToggle");
    this.rotateFeatureToggle = document.getElementById("rotateFeatureToggle");
    this.featureList = document.getElementById("featureList");
    this.featureRows = Array.from(
      this.featureList.querySelectorAll(".feature-row"),
    );
    this.draggedFeatureRow = null;

    // Keybinds tab
    this.keybindGroups = document.getElementById("keybindGroups");
    this.resetKeybindsBtn = document.getElementById("resetKeybindsBtn");
    this.captureState = null;

    // Info elements
    this.volumeState = document.getElementById("volume-state");
    this.muteState = document.getElementById("mute-state");

    // Toast
    this.toast = document.getElementById("toast");
    this.toastTimer = null;

    // Current state
    this.activeState = "inactive";

    this.#attachEventListeners();
    this.#setupFeatureReordering();
  }

  /**
   * Attaches all event listeners to UI elements.
   * @private
   */
  #attachEventListeners() {
    // Permission button
    this.permBtn.addEventListener("click", () =>
      this.#handlePermissionRequest(),
    );

    // Tabs
    this.tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => this.#switchTab(btn.dataset.tab));
    });

    // Orientation toggle
    this.orientToggle.querySelectorAll(".orient-btn").forEach((btn) => {
      btn.addEventListener("click", () =>
        this.#handleOrientationChange(btn.dataset.orient),
      );
    });

    // Visibility toggles
    this.#setupVisToggle(this.volumeVisToggle, "setVolumeAlwaysVisible");
    this.#setupVisToggle(this.seekbarVisToggle, "setSeekbarAlwaysVisible");

    // Ambient mode toggle
    this.#setupVisToggle(this.ambientModeToggle, "setAmbientMode", "on", "off");

    // Toolbar mode toggle
    this.toolbarModeToggle.querySelectorAll(".orient-btn").forEach((btn) => {
      btn.addEventListener("click", () =>
        this.#handleToolbarModeChange(btn.dataset.toolbarMode),
      );
    });

    // Control radius toggle
    this.controlRadiusToggle.querySelectorAll(".orient-btn").forEach((btn) => {
      btn.addEventListener("click", () =>
        this.#handleControlRadiusChange(btn.dataset.radius),
      );
    });

    // Reload button
    this.reloadBtn.addEventListener("click", () => this.#handleReload());

    // Controls tab switches
    this.#setupSwitch(this.dblClickFsToggle, "setDoubleClickFullscreen");
    this.#setupSwitch(this.downloadFolderToggle, "setDownloadSaveToFolder");
    this.#setupSwitch(this.theaterFeatureToggle, "setTheaterModeFeatureEnabled");
    this.#setupSwitch(this.autoscrollFeatureToggle, "setAutoscrollFeatureEnabled");
    this.#setupSwitch(this.downloadFeatureToggle, "setDownloadFeatureEnabled");
    this.#setupSwitch(this.rotateFeatureToggle, "setRotateFeatureEnabled");

    // Keybinds tab
    this.resetKeybindsBtn.addEventListener("click", () =>
      this.#handleResetAllKeybinds(),
    );
  }

  /**
   * Switches the visible tab panel.
   * @param {string} tabName - "appearance" | "controls" | "keybinds"
   * @private
   */
  #switchTab(tabName) {
    this.#cancelCapture();
    this.tabButtons.forEach((btn) =>
      btn.classList.toggle("active", btn.dataset.tab === tabName),
    );
    this.tabPanels.forEach((panel) =>
      panel.classList.toggle("active", panel.dataset.panel === tabName),
    );
  }

  /**
   * Wires a boolean toggle switch to a content-script message.
   * @param {HTMLInputElement} input - The checkbox input
   * @param {string} messageType - The message type to send with { value }
   * @private
   */
  #setupSwitch(input, messageType) {
    input.addEventListener("change", async () => {
      await Messenger.sendToActiveTab(messageType, { value: input.checked });
      this.showToast("saved", "ok");
    });
  }

  /**
   * Wires up drag-and-drop reordering for the Features list. Dragging is
   * only armed from the grip handle so clicking the switch or label never
   * accidentally starts a drag.
   * @private
   */
  #setupFeatureReordering() {
    this.featureRows.forEach((row) => {
      const handle = row.querySelector(".drag-handle");
      if (!handle) return;

      const disarm = () => row.removeAttribute("draggable");
      handle.addEventListener("mousedown", () =>
        row.setAttribute("draggable", "true"),
      );
      row.addEventListener("mouseup", disarm);

      row.addEventListener("dragstart", (e) => {
        this.draggedFeatureRow = row;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", row.dataset.feature);
        requestAnimationFrame(() => row.classList.add("dragging"));
      });

      row.addEventListener("dragover", (e) => {
        if (!this.draggedFeatureRow || this.draggedFeatureRow === row) return;
        e.preventDefault();
        const rect = row.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        this.#clearFeatureDragIndicators();
        row.classList.add(before ? "drag-over-top" : "drag-over-bottom");
      });

      row.addEventListener("drop", (e) => {
        if (!this.draggedFeatureRow || this.draggedFeatureRow === row) return;
        e.preventDefault();
        const before = row.classList.contains("drag-over-top");
        this.#clearFeatureDragIndicators();
        this.featureList.insertBefore(
          this.draggedFeatureRow,
          before ? row : row.nextSibling,
        );
      });

      row.addEventListener("dragend", () => {
        disarm();
        row.classList.remove("dragging");
        this.#clearFeatureDragIndicators();
        this.draggedFeatureRow = null;
        this.#persistFeatureOrder();
      });
    });
  }

  /** @private */
  #clearFeatureDragIndicators() {
    this.featureRows.forEach((row) =>
      row.classList.remove("drag-over-top", "drag-over-bottom"),
    );
  }

  /**
   * Sends the current DOM order of the feature list to the content script,
   * which persists it and live-reapplies it on any open Instagram tabs.
   * @private
   * @returns {Promise<void>}
   */
  async #persistFeatureOrder() {
    const order = Array.from(this.featureList.children).map(
      (row) => row.dataset.feature,
    );
    await Messenger.sendToActiveTab("setFeatureOrder", { order });
    this.showToast("saved", "ok");
  }

  /**
   * Reorders the feature rows in the DOM to match a saved order (from the
   * ping response). Rows not present in the order (e.g. a feature added in
   * a later version) simply stay wherever they already are.
   * @param {string[]} [order]
   * @private
   */
  #applyFeatureOrder(order) {
    if (!Array.isArray(order) || !order.length) return;

    const rowsByFeature = new Map(
      this.featureRows.map((row) => [row.dataset.feature, row]),
    );
    order.forEach((feature) => {
      const row = rowsByFeature.get(feature);
      if (row) this.featureList.appendChild(row);
    });
    this.featureRows = Array.from(
      this.featureList.querySelectorAll(".feature-row"),
    );
  }

  /**
   * Sets up a visibility toggle with its event listeners.
   * @param {HTMLElement} toggleEl - The toggle element
   * @param {string} messageType - The message type to send
   * @param {string} [activeValue="always"] - The data-vis value considered "on"
   * @param {string} [inactiveValue="hover"] - The data-vis value considered "off"
   * @private
   */
  #setupVisToggle(
    toggleEl,
    messageType,
    activeValue = "always",
    inactiveValue = "hover",
  ) {
    toggleEl.querySelectorAll(".vis-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const isActive = btn.dataset.vis === activeValue;
        this.#applyVisToggle(toggleEl, isActive, activeValue, inactiveValue);
        await Messenger.sendToActiveTab(messageType, { value: isActive });
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
      this.#loadKeybinds();
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
    this.#applyVisToggle(
      this.volumeVisToggle,
      response.audioControlAlwaysVisible,
    );
    this.#applyVisToggle(
      this.seekbarVisToggle,
      response.videoControlAlwaysVisible,
    );

    // Update ambient mode toggle
    this.#applyVisToggle(
      this.ambientModeToggle,
      response.ambientModeEnabled,
      "on",
      "off",
    );

    // Update toolbar mode
    this.#applyToolbarModeToggle(response.toolbarMode ?? "custom");

    // Update control radius
    this.#applyControlRadiusToggle(response.controlRadiusMode ?? "sm");

    // Update behavior switches
    this.dblClickFsToggle.checked = response.doubleClickFullscreenEnabled ?? true;
    this.downloadFolderToggle.checked = response.downloadSaveToFolder ?? true;
    this.theaterFeatureToggle.checked = response.theaterModeFeatureEnabled ?? true;
    this.autoscrollFeatureToggle.checked = response.autoscrollFeatureEnabled ?? true;
    this.downloadFeatureToggle.checked = response.downloadFeatureEnabled ?? true;
    this.rotateFeatureToggle.checked = response.rotateFeatureEnabled ?? true;

    // Update feature order
    this.#applyFeatureOrder(response.featureOrder);
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
   * @param {boolean} isActive - Whether the "active" option should be selected
   * @param {string} [activeValue="always"] - The data-vis value considered "on"
   * @param {string} [inactiveValue="hover"] - The data-vis value considered "off"
   * @private
   */
  #applyVisToggle(
    toggleEl,
    isActive,
    activeValue = "always",
    inactiveValue = "hover",
  ) {
    toggleEl.querySelectorAll(".vis-btn").forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.dataset.vis === (isActive ? activeValue : inactiveValue),
      );
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
   * Applies the active state to the toolbar mode toggle.
   * @param {string} mode - "custom" or "native"
   * @private
   */
  #applyToolbarModeToggle(mode) {
    this.toolbarModeToggle.className = "orient-toggle " + mode;
  }

  /**
   * Handles toolbar mode toggle change.
   * @param {string} mode - "custom" or "native"
   * @private
   * @returns {Promise<void>}
   */
  async #handleToolbarModeChange(mode) {
    this.#applyToolbarModeToggle(mode);
    await Messenger.sendToActiveTab("setToolbarMode", { value: mode });
    this.showToast("saved", "ok");
  }

  /**
   * Applies the active state to the control radius toggle.
   * @param {string} mode - "sm" or "round"
   * @private
   */
  #applyControlRadiusToggle(mode) {
    this.controlRadiusToggle.className = "orient-toggle " + mode;
  }

  /**
   * Handles control radius toggle change.
   * @param {string} mode - "sm" or "round"
   * @private
   * @returns {Promise<void>}
   */
  async #handleControlRadiusChange(mode) {
    this.#applyControlRadiusToggle(mode);
    await Messenger.sendToActiveTab("setControlRadius", { value: mode });
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

  /**
   * Fetches the current keybinds from the content script and renders them.
   * @private
   * @returns {Promise<void>}
   */
  async #loadKeybinds() {
    const response = await Messenger.sendToActiveTab("getKeybinds");
    if (!response?.ok) {
      this.keybindGroups.innerHTML =
        '<p class="hint-text">Open an Instagram tab to manage keybinds.</p>';
      return;
    }
    this.#renderKeybinds(response.keybinds);
  }

  /**
   * Renders the keybinds list, grouped by category.
   * @param {Array<{id:string,label:string,category:string,key:string,isCustom:boolean}>} keybinds
   * @private
   */
  #renderKeybinds(keybinds) {
    this.keybindGroups.innerHTML = "";

    const groups = new Map();
    keybinds.forEach((kb) => {
      if (!groups.has(kb.category)) groups.set(kb.category, []);
      groups.get(kb.category).push(kb);
    });

    groups.forEach((items, category) => {
      const heading = document.createElement("p");
      heading.className = "keybind-category";
      heading.textContent = category;
      this.keybindGroups.appendChild(heading);

      items.forEach((kb) => {
        this.keybindGroups.appendChild(this.#buildKeybindRow(kb));
      });
    });
  }

  /**
   * Builds a single keybind row with a key-capture button and reset control.
   * @param {{id:string,label:string,key:string,isCustom:boolean}} kb
   * @returns {HTMLElement}
   * @private
   */
  #buildKeybindRow(kb) {
    const row = document.createElement("div");
    row.className = "keybind-row";
    row.dataset.id = kb.id;

    const label = document.createElement("span");
    label.className = "keybind-label";
    label.textContent = kb.label;

    const controls = document.createElement("div");
    controls.className = "keybind-controls";

    const captureBtn = document.createElement("button");
    captureBtn.type = "button";
    captureBtn.className = "key-capture" + (kb.isCustom ? " custom" : "");
    captureBtn.textContent = formatKeybindLabel(kb.key);
    captureBtn.addEventListener("click", () =>
      this.#beginCapture(kb.id, captureBtn),
    );

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "key-reset";
    resetBtn.title = "Reset to default";
    resetBtn.hidden = !kb.isCustom;
    resetBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>';
    resetBtn.addEventListener("click", async () => {
      await Messenger.sendToActiveTab("resetKeybind", { id: kb.id });
      this.showToast("reset", "ok");
      this.#loadKeybinds();
    });

    controls.appendChild(captureBtn);
    controls.appendChild(resetBtn);
    row.appendChild(label);
    row.appendChild(controls);
    return row;
  }

  /**
   * Puts a key-capture button into "listening" mode and records the next
   * valid keypress as the new shortcut for `id`.
   * @param {string} id - The keybind id being reassigned
   * @param {HTMLButtonElement} btn - The capture button that was clicked
   * @private
   */
  #beginCapture(id, btn) {
    this.#cancelCapture();

    const originalText = btn.textContent;
    btn.textContent = "Press a key…";
    btn.classList.add("listening");

    const handleKeydown = async (e) => {
      if (e.code === "Escape" || KEYBIND_RESERVED_CODES.has(e.code)) {
        e.preventDefault();
        this.#cancelCapture();
        return;
      }
      // Ignore bare modifier presses and combos; wait for a plain key.
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

      e.preventDefault();
      e.stopPropagation();
      this.#cancelCapture();

      const response = await Messenger.sendToActiveTab("setKeybind", {
        id,
        key: e.code,
      });
      if (response?.ok) {
        this.showToast(
          response.clearedLabel
            ? `saved (cleared from ${response.clearedLabel})`
            : "saved",
          "ok",
        );
      } else {
        this.showToast(response?.error ?? "failed to save", "err");
      }
      this.#loadKeybinds();
    };

    const handleBlur = () => this.#cancelCapture();

    this.captureState = { btn, originalText, handleKeydown, handleBlur };
    window.addEventListener("keydown", handleKeydown, true);
    window.addEventListener("blur", handleBlur);
  }

  /**
   * Cancels any in-progress key capture and restores the button's label.
   * @private
   */
  #cancelCapture() {
    if (!this.captureState) return;
    const { btn, originalText, handleKeydown, handleBlur } =
      this.captureState;
    window.removeEventListener("keydown", handleKeydown, true);
    window.removeEventListener("blur", handleBlur);
    btn.textContent = originalText;
    btn.classList.remove("listening");
    this.captureState = null;
  }

  /**
   * Handles the "Reset all keybinds" button click.
   * @private
   * @returns {Promise<void>}
   */
  async #handleResetAllKeybinds() {
    this.resetKeybindsBtn.disabled = true;
    const response = await Messenger.sendToActiveTab("resetAllKeybinds");
    this.resetKeybindsBtn.disabled = false;

    if (response?.ok) {
      this.showToast("all keybinds reset", "ok");
      this.#loadKeybinds();
    } else {
      this.showToast("reset failed", "err");
    }
  }
}

// Initialize the popup when the DOM is ready
(async () => {
  const controller = PopupController.getInstance();
  await controller.initialize();
})();
