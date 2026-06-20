/**
 * Manages automatic scrolling to the next reel when the current video ends.
 * Provides a toggle button on the Instagram UI to enable/disable autoscroll.
 */
class Rotate {

    static #ToolbarIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256"><path fill="currentColor" d="m205.66 221.66l-24 24a8 8 0 0 1-11.32-11.32L180.69 224H80a24 24 0 0 1-24-24v-96a8 8 0 0 1 16 0v96a8 8 0 0 0 8 8h100.69l-10.35-10.34a8 8 0 0 1 11.32-11.32l24 24a8 8 0 0 1 0 11.32M80 72a8 8 0 0 0 5.66-13.66L75.31 48H176a8 8 0 0 1 8 8v96a8 8 0 0 0 16 0V56a24 24 0 0 0-24-24H75.31l10.35-10.34a8 8 0 1 0-11.32-11.32l-24 24a8 8 0 0 0 0 11.32l24 24A8 8 0 0 0 80 72"/></svg>
    `
    static #RotateRightIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path stroke-dasharray="14" stroke-dashoffset="14" d="M12 6c3.31 0 6 2.69 6 6v2.5"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.2s" values="14;0"/></path><path stroke-dasharray="6" stroke-dashoffset="6" d="M18 15l3 -3M18 15l-3 -3"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.2s" dur="0.2s" values="6;0"/></path></g></svg>
    `
    static #RotateLeftIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path stroke-dasharray="14" stroke-dashoffset="14" d="M12 6c-3.31 0-6 2.69-6 6v2.5"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.2s" values="14;0"/></path><path stroke-dasharray="6" stroke-dashoffset="6" d="M6 15l-3 -3M6 15l3 -3"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.2s" dur="0.2s" values="6;0"/></path></g></svg>
    `

    static #eventsPublisher = new EventPublisher();

    static #Event = {
        "ROTATE": "rotate",
    }

    static #ToolbarDepth = 12;

    /**
     * 
     * @param {Number} rotations the number of 90 degree clockwise rotations to apply to the video. Can be negative for counterclockwise rotation.
     * @returns 
     */
    static #rotate(rotations = 1) {
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
        if(originalOrientChanged) {
            video.style.width = containerParent.style.height;
            video.style.height = containerParent.style.width;
        } else {
            video.parentElement.style.width = '';
            video.style.width = "100%";
            video.style.height = "100%";
        }
        
        video.style.transformOrigin = 'center center';
        video.style.transform = `rotate(${newRotation * 90}deg)`;
        video.style.transform = `rotate(${newRotation * 90}deg)`;

        video.dataset.reelsleekRotation = newRotation;
        console.debug('[Rotate] Video rotated to', newRotation * 90, 'degrees', video);
        
        this.#eventsPublisher.publish(this.#Event.ROTATE, { video: video, rotation: newRotation });
    }

    /**
     * Attaches keyboard event listeners for video control shortcuts.
     * Supports: Arrow keys (seek), Space/P (play/pause), F (fullscreen)
     * @private
     */
    static #attachKeybinds() {
        document.body.addEventListener("keydown", (e) => {
            if (isInput()) return;
            if(e.metaKey || e.ctrlKey || e.altKey) return;

            switch (e.code) {
                case "KeyK":
                    stopEvent(e);
                    if (!window.location.href.includes("/reels")) return;
                    this.#rotate(-1);
                    break;
                case "KeyJ":
                    stopEvent(e);
                    if (!window.location.href.includes("/reels")) return;
                    this.#rotate(1);
                    break;
                case "KeyH":
                    stopEvent(e);
                    if (!window.location.href.includes("/reels")) return;
                    const video = VideoControl.currentlyPlayingVideo;
                    if (!video) return;
                    const currentRotation = parseInt(video.dataset.reelsleekRotation || "0", 10);
                    this.#rotate(-currentRotation);
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
    }

    /**
     * Attaches autoscroll toggle button to the Instagram toolbar and listens for video end events.
     * Skips if already attached or if the toolbar cannot be found.
     * @param {HTMLVideoElement} video - The video element to attach autoscroll to
     */
    static attach(video) {
        if (video.dataset.reelsleekRotateAttached) return;
        if (!window.location.href.includes('/reels/')) return;

        const container = document.createElement('div');
        container.className = 'reelsleek-rotate-container';
        
        const toolbarButton = document.createElement("button");
        toolbarButton.className = "reelsleek-rotate";
        toolbarButton.setAttribute("aria-pressed", String(this.enabled));
        toolbarButton.setAttribute("aria-label", "Reset Rotation");
        toolbarButton.title = "Reset Rotation (H)";
        appendParsedHTML(toolbarButton, this.#ToolbarIcon);
        
        const flyoutContainer = document.createElement('div');
        flyoutContainer.className = 'reelsleek-rotate-flyout';

        const rotateLeftButton = document.createElement("button");
        rotateLeftButton.className = "reelsleek-rotate reelsleek-rotate-left";
        rotateLeftButton.setAttribute("aria-label", "Rotate left");
        rotateLeftButton.title = "Rotate left (J)";
        appendParsedHTML(rotateLeftButton, this.#RotateLeftIcon);
        
        const rotateRightButton = document.createElement("button");
        rotateRightButton.className = "reelsleek-rotate reelsleek-rotate-right";
        rotateRightButton.setAttribute("aria-label", "Rotate right");
        rotateRightButton.title = "Rotate right (K)";
        appendParsedHTML(rotateRightButton, this.#RotateRightIcon);
        
        // Assemble structural items into nested tree hierarchy
        flyoutContainer.appendChild(rotateLeftButton);
        flyoutContainer.appendChild(rotateRightButton);
        container.appendChild(toolbarButton);
        container.appendChild(flyoutContainer);
        
        rotateLeftButton.addEventListener("click", (e) => {
            e.stopPropagation();
            this.#rotate(-1);
        });

        rotateRightButton.addEventListener("click", (e) => {
            e.stopPropagation();
            this.#rotate(1);
        });

        toolbarButton.addEventListener("click", (e) => {
            e.stopPropagation();
            const rotation = parseInt(video.dataset.reelsleekRotation || "0", 10);
            console.debug('[Rotate] Resetting rotation from', rotation * 90, 'degrees to 0 degrees', -rotation);
            this.#rotate(-rotation);
        });

        const rotateSub = new EventSubscriber(toolbarButton);
        rotateSub.subscribe(this.#Event.ROTATE, (args) => {
            const isConcernedVideo = args.video.src === video.src;
            if (!isConcernedVideo) return;
            console.debug('[Rotate] Rotate event is for the concerned video, updating toolbar button state');
            toolbarButton.setAttribute("aria-pressed", args.rotation !== 0);
            console.debug('[Rotate] Updated toolbar button state to', args.rotation !== 0 ? 'pressed' : 'not pressed', 'for rotation', args.rotation * 90, 'degrees', toolbarButton);
        });
        this.#eventsPublisher.addSubscriber(rotateSub);

        if (ToolbarMode.isCustom()) {
            const toolbarContainer = video.parentElement.querySelector('.reelsleek-toolbar-container');
            if (!toolbarContainer) return;
            if (toolbarContainer.querySelector('.reelsleek-rotate')) return;
            toolbarContainer.appendChild(container);
        } else {
            const parent = getNthParent(video, this.#ToolbarDepth);
            if (!parent) return;
            const toolbar = parent.nextElementSibling;
            if (!toolbar) return;
            if (toolbar.querySelector('.reelsleek-rotate')) return;
            const children = [...toolbar.children];
            toolbar.insertBefore(container, children[children.length - 2]);
        }

        video.dataset.reelsleekRotateAttached = "true";
    }

    /**
     * Detaches autoscroll button from the toolbar.
     * @param {HTMLVideoElement} video - The video element whose toolbar contains the button
     */
    static detach(video) {
        if (!video.dataset.reelsleekRotateAttached) return;

        // Find button in custom toolbar or native Instagram toolbar
        const button = video.parentElement.querySelector('.reelsleek-rotate-container')
            ?? getNthParent(video, this.#ToolbarDepth)?.nextElementSibling?.querySelector('.reelsleek-rotate-container');
        button?.remove();

        delete video.dataset.reelsleekRotateAttached;
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