/**
 * Manages automatic scrolling to the next reel when the current video ends.
 * Provides a toggle button on the Instagram UI to enable/disable autoscroll.
 */
class TheaterMode {
    /** @type {boolean} Whether theater mode is enabled */
    static enabled = false;

    static #eventsPublisher = new EventPublisher();

    static #Event = {
        "THEATER_TOGGLE": "theater-toggle",
    }

    static #HTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 8c0-2.828 0-4.243.879-5.121C7.757 2 9.172 2 12 2s4.243 0 5.121.879C18 3.757 18 5.172 18 8v8c0 2.828 0 4.243-.879 5.121C16.243 22 14.828 22 12 22s-4.243 0-5.121-.879C6 20.243 6 18.828 6 16z"/><path stroke-linecap="round" d="M21 4.5v15M3 4.5v15" opacity="0.5"/></g></svg>
    `

    /**
     * Sets the autoscroll state and persists the preference.
     * @param {boolean} enabled - Whether autoscroll should be enabled
     */
    static setTheaterModeEnabled(enabled) {
        this.enabled = enabled;
        document.body.classList.toggle('theater-mode-active', enabled);
        this.#eventsPublisher.publish(this.#Event.THEATER_TOGGLE);
    }

    /**
     * Toggles the autoscroll state.
     * @private
     */
    static toggleTheaterMode() {
        if(!VideoControl.fullscreenOn)this.setTheaterModeEnabled(!this.enabled);
        VideoControl.setFullscreen(false);
        if (this.enabled) {
            const fullscreenTarget = document.body;
            fullscreenTarget.requestFullscreen().catch((err) => {
                console.error(`Fullscreen error: ${err.message}`);
            });
        } else if(document.fullscreenElement) {
            document.exitFullscreen();
        }
    }

    /**
     * Attaches keyboard event listeners for video control shortcuts.
     * Supports: Arrow keys (seek), Space/P (play/pause), F (fullscreen)
     * @private
     */
    static #attachKeybinds() {
        document.body.addEventListener("keydown", (e) => {
            if(isInput()) return;;

            switch (e.code) {
                case "KeyT":
                    stopEvent(e);
                    if(!window.location.href.includes("/reels")) return;
                    this.toggleTheaterMode();
                    break;
            }
        });
    }

    /**
     * Initializes the VideoControl class by loading saved states and attaching keyboard shortcuts.
     * Should be called once on page load.
     * @returns {Promise<void>}
     */
    static async setup() {
        this.#attachKeybinds();
        document.body.addEventListener('fullscreenchange', (e) => {
            if (e.target == document.body && !document.fullscreenElement) {
                this.setTheaterModeEnabled(false);
            }
        })
    }

    /**
     * Attaches autoscroll toggle button to the Instagram toolbar and listens for video end events.
     * Skips if already attached or if the toolbar cannot be found.
     * @param {HTMLVideoElement} video - The video element to attach autoscroll to
     */
    static attach(video) {
        if (video.dataset.reelsleekTheaterModeAttached) return;
        if (!window.location.href.includes('/reels/')) return;

        const button = document.createElement("button");
        button.className = "reelsleek-theater-mode";
        button.setAttribute("aria-pressed", String(this.enabled));
        button.setAttribute("aria-label", "Toggle theater mode");
        button.title = "Toggle theater mode (T)";
        appendParsedHTML(button, this.#HTML);

        button.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleTheaterMode();
        });

        const buttonSubscriber = new EventSubscriber(button);
        buttonSubscriber.subscribe(this.#Event.THEATER_TOGGLE, () => {
            button.setAttribute("aria-pressed", String(this.enabled));
        });
        this.#eventsPublisher.addSubscriber(buttonSubscriber);

        if (ToolbarMode.isCustom()) {
            const toolbarContainer = video.parentElement.querySelector('.reelsleek-toolbar-container');
            if (!toolbarContainer) return;
            toolbarContainer.appendChild(button);
        } else {
            const parent = getNthParent(video, 7);
            if (!parent) return;
            const toolbar = parent.nextElementSibling;
            if (!toolbar) return;
            const children = [...toolbar.children];
            toolbar.insertBefore(button, children[children.length - 2]);
        }

        video.dataset.reelsleekTheaterModeAttached = "true";
    }

    /**
     * Detaches autoscroll button from the toolbar.
     * @param {HTMLVideoElement} video - The video element whose toolbar contains the button
     */
    static detach(video) {
        if (!video.dataset.reelsleekTheaterModeAttached) return;

        // Find button in custom toolbar or native Instagram toolbar
        const button = video.parentElement.querySelector('.reelsleek-theater-mode')
            ?? getNthParent(video, 7)?.nextElementSibling?.querySelector('.reelsleek-theater-mode');
        button?.remove();

        delete video.dataset.reelsleekTheaterModeAttached;
    }

    /**
     * Resets autoscroll button for a video by detaching and reattaching.
     * @param {HTMLVideoElement} video - The video element to reset autoscroll for
     */
    static reset(video) {
        this.detach(video);
        this.attach(video);
    }

    /**
     * Resets autoscroll buttons for all video elements on the page.
     */
    static resetAll() {
        const videos = getCleanVideos();
        videos.forEach(video => {
            this.reset(video);
        });
    }
}
