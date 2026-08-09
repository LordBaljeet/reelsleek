/**
 * UI & LIFECYCLE MODULE: AudioControlModule
 * Encapsulates the tracking states and interactive elements of a single video player control layout.
 */
class AudioControlModule {
  constructor(video, templateElement, initialMuted, initialVolume, initialOrientation, eventsPublisher, eventsConfig, actionsConfig) {
    this.video = video;
    this.eventsPublisher = eventsPublisher;
    this.Events = eventsConfig;
    this.Actions = actionsConfig;

    // 1. Initialize container element and structural shadow node
    this.container = document.createElement("div");
    this.container.className = "reelsleek-audio-control";
    this.container.dataset.orientation = initialOrientation;

    if (!templateElement) return;
    const clone = document.importNode(templateElement.content, true);
    Keybinds.applyTitles(clone);
    this.container.appendChild(clone);

    // 2. Query structural interactions and layout parameters
    this.slider = this.container.querySelector("input");
    this.button = this.container.querySelector("button");

    this.slider.value = initialMuted ? 0 : initialVolume * 100;
    this.slider.setAttribute("orient", initialOrientation);
    this.button.classList.toggle("muted", initialMuted);
    this.#updateSliderFill();

    // 3. Inject control interface module directly into the view layout
    this.video.parentElement.prepend(this.container);

    // 4. Bind listeners and operational state synchronization hooks
    this.#initListeners();
    this.#initSubscribers();
  }

  #updateSliderFill() {
    this.slider.style.setProperty('--slider-fill', this.slider.value + '%');
  }

  #initListeners() {
    this.slider.addEventListener("input", (e) => {
      e.stopPropagation();
      this.#updateSliderFill();
      this.Actions.setVolume(this.slider.value / 100);
    });

    this.slider.addEventListener("click", (e) => e.stopPropagation());

    this.button.addEventListener("click", (e) => {
      e.stopPropagation();
      this.Actions.toggleMute();
    });

    // Encapsulated video event sync cycles
    this.playListener = () => {
      this.video.volume = AudioControl.volume;
      this.video.muted = AudioControl.muted;
    };

    this.volumeChangeListener = () => {
      if (this.video.volume !== AudioControl.volume) {
        this.video.volume = AudioControl.volume;
      }
      if (this.video.muted !== AudioControl.muted) {
        this.video.muted = AudioControl.muted;
      }
    };

    this.video.addEventListener('play', this.playListener);
    this.video.addEventListener('volumechange', this.volumeChangeListener);
  }

  #initSubscribers() {
    this.containerSubscriber = new EventSubscriber(this.container);
    this.containerSubscriber.subscribe(this.Events.ORIENT_CHANGE, () => {
      this.container.dataset.orientation = AudioControl.orientation;
    });

    this.sliderSubscriber = new EventSubscriber(this.slider);
    this.sliderSubscriber.subscribe(this.Events.VOLUME_CHANGE, () => {
      this.slider.value = AudioControl.volume * 100;
      this.#updateSliderFill();
    });
    this.sliderSubscriber.subscribe(this.Events.MUTE_CHANGE, () => {
      this.slider.value = AudioControl.muted ? 0 : AudioControl.volume * 100;
      this.#updateSliderFill();
    });
    this.sliderSubscriber.subscribe(this.Events.ORIENT_CHANGE, () => {
      this.slider.setAttribute("orient", AudioControl.orientation);
    });

    this.buttonSubscriber = new EventSubscriber(this.button);
    this.buttonSubscriber.subscribe(this.Events.MUTE_CHANGE, () => {
      this.button.classList.toggle("muted", AudioControl.muted);
    });

    this.eventsPublisher.addSubscriber(this.containerSubscriber);
    this.eventsPublisher.addSubscriber(this.sliderSubscriber);
    this.eventsPublisher.addSubscriber(this.buttonSubscriber);
  }

  destroy() {
    // Clean up bound media loops
    if (this.playListener) this.video.removeEventListener('play', this.playListener);
    if (this.volumeChangeListener) this.video.removeEventListener('volumechange', this.volumeChangeListener);

    // Wipe layout node from structural layout tree
    this.container?.remove();
  }
}

/**
 * MAIN CONTROLLER / ORCHESTRATOR
 * Manages extension persistence boundaries, state transitions, and platform button alignment tracking.
 */
class AudioControl {
  static muted = false;
  static volume = 0.1;
  static orientation = "horizontal";
  static alwaysVisible = true;

  static #saveTimer = null;
  static #nativeSynced = false;
  static #eventsPublisher = new EventPublisher();
  static #template = null;

  static #videoInstances = new WeakMap();

  static #Event = {
    "VOLUME_CHANGE": "volume-change",
    "MUTE_CHANGE": "mute-change",
    "ORIENT_CHANGE": "orient-change",
    "VISIBILITY_CHANGE": "visibility-change",
  };

  static #StorageKeys = {
    "volumeKey": "reelsleek-audiocontrol-volume",
    "orientKey": "reelsleek-audiocontrol-orientation",
    "visibilityKey": "reelsleek-audiocontrol-visibility",
  };

  static #findNativeMuteButton(video) {
    if (!VideoControl.currentlyPlayingVideo && !video) return null;
    const targetVideo = video || VideoControl.currentlyPlayingVideo;
    const targetDiv = getNthParent(targetVideo, 8);
    const svg = targetDiv.querySelector(
      'div[role="group"] div > div[role="button"] > svg, div[role="group"] div.html-div > button > div > svg',
    );
    if (!svg) return null;
    return svg.closest('button, [role="button"]');
  }

  static #clickNativeMuteButton() {
    const button = AudioControl.#findNativeMuteButton();
    if (!button) return;
    button.click();
  }

  static #syncNativeMuteOnFirstLoad() {
    if (AudioControl.#nativeSynced) return;
    AudioControl.#clickNativeMuteButton();

    const video = [...document.querySelectorAll("video")].find(
      (v) => !v.src || v.src.startsWith("blob"),
    );
    if (video && video.muted !== AudioControl.muted) {
      AudioControl.#clickNativeMuteButton();
    }

    AudioControl.#nativeSynced = true;
  }

  static setMuted(muted) {
    AudioControl.muted = muted;
    AudioControl.#clickNativeMuteButton();
    AudioControl.#eventsPublisher.publish(AudioControl.#Event.MUTE_CHANGE);
    
    if (VideoControl.currentlyPlayingVideo) {
      VideoControl.currentlyPlayingVideo.volume = AudioControl.volume;
      VideoControl.currentlyPlayingVideo.muted = AudioControl.muted;
    }
  }

  static toggleMute() {
    AudioControl.setMuted(!AudioControl.muted);
    if (!AudioControl.muted && AudioControl.volume === 0) {
      AudioControl.setVolume(0.1);
    }
  }

  static setVolume(volume) {
    AudioControl.volume = volume;
    if (AudioControl.volume > 0 && AudioControl.muted) {
      AudioControl.toggleMute();
    } else if (AudioControl.volume === 0 && !AudioControl.muted) {
      AudioControl.toggleMute();
    }
    
    AudioControl.#eventsPublisher.publish(AudioControl.#Event.VOLUME_CHANGE);
    AudioControl.#saveStates();

    if (VideoControl.currentlyPlayingVideo) {
      VideoControl.currentlyPlayingVideo.volume = AudioControl.volume;
      VideoControl.currentlyPlayingVideo.muted = AudioControl.muted;
    }
  }

  static setOrientation(orientation) {
    AudioControl.orientation = orientation;
    AudioControl.#eventsPublisher.publish(AudioControl.#Event.ORIENT_CHANGE);
    AudioControl.#saveStates();
  }

  static setVisibility(visibility) {
    AudioControl.alwaysVisible = visibility;
    AudioControl.#eventsPublisher.publish(AudioControl.#Event.VISIBILITY_CHANGE);
    document.body.classList.toggle("reelsleek-volume-always-visible", visibility);
    AudioControl.#saveStates();
  }

  static #saveStates() {
    clearTimeout(AudioControl.#saveTimer);
    AudioControl.#saveTimer = setTimeout(() => {
      browser.storage.local.set({
        [AudioControl.#StorageKeys.orientKey]: AudioControl.orientation,
        [AudioControl.#StorageKeys.visibilityKey]: AudioControl.alwaysVisible,
        [AudioControl.#StorageKeys.volumeKey]: AudioControl.volume > 0 ? AudioControl.volume : 0.1
      });
    }, 300);
  }

  static async #loadStates() {
    const result = await browser.storage.local.get([
      AudioControl.#StorageKeys.volumeKey,
      AudioControl.#StorageKeys.orientKey,
      AudioControl.#StorageKeys.visibilityKey,
    ]);

    AudioControl.volume = result[AudioControl.#StorageKeys.volumeKey] ?? AudioControl.volume;
    AudioControl.orientation = result[AudioControl.#StorageKeys.orientKey] ?? AudioControl.orientation;
    AudioControl.alwaysVisible = result[AudioControl.#StorageKeys.visibilityKey] ?? AudioControl.alwaysVisible;
  }

  static #attachKeybinds() {
    registerKeybind("toggleMute", "KeyM", "Toggle mute", "Audio", () => AudioControl.toggleMute());
    registerKeybind("volumeDown", "Minus", "Volume down", "Audio", () => AudioControl.setVolume(Math.max(AudioControl.volume - 0.1, 0)));
    registerKeybind("volumeUp", "Equal", "Volume up", "Audio", () => AudioControl.setVolume(Math.min(AudioControl.volume + 0.1, 1)));
  }

  static async #loadExternalTemplates() {
    try {
      const fileUrl = browser.runtime.getURL("content/controls.html");
      const response = await fetch(fileUrl);
      const text = await response.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      AudioControl.#template = doc.getElementById("reelsleek-audio-template");
    } catch (err) {
      console.error("[AudioControl] Error parsing audio template asset file:", err);
    }
  }

  static async setup() {
    await AudioControl.#loadExternalTemplates();
    await AudioControl.#loadStates();
    AudioControl.#attachKeybinds();
    document.body.classList.toggle("reelsleek-volume-always-visible", AudioControl.alwaysVisible);
  }

  static attach(video) {
    if (PageHandler.isStorie()) return;
    AudioControl.#syncNativeMuteOnFirstLoad();

    if (video.dataset.reelsleekAudioControlAttached) return;
    video.volume = AudioControl.volume;
    video.muted = AudioControl.muted;

    if (!AudioControl.#template) {
      AudioControl.#loadExternalTemplates().then(() => {
        if (AudioControl.#template && !video.dataset.reelsleekAudioControlAttached) {
          AudioControl.attach(video);
        }
      });
      return;
    }

    const moduleInstance = new AudioControlModule(
      video,
      AudioControl.#template,
      AudioControl.muted,
      AudioControl.volume,
      AudioControl.orientation,
      AudioControl.#eventsPublisher,
      AudioControl.#Event,
      {
        setVolume: AudioControl.setVolume,
        toggleMute: AudioControl.toggleMute
      }
    );

    AudioControl.#videoInstances.set(video, moduleInstance);
    video.dataset.reelsleekAudioControlAttached = "true";
  }

  static detach(video) {
    if (!video.dataset.reelsleekAudioControlAttached) return;

    const instance = AudioControl.#videoInstances.get(video);
    if (instance) {
      instance.destroy();
      AudioControl.#videoInstances.delete(video);
    }

    delete video.dataset.reelsleekAudioControlAttached;
  }

  static reset(video) {
    AudioControl.detach(video);
    AudioControl.attach(video);
  }

  static resetAll() {
    getCleanVideos().forEach(v => AudioControl.reset(v));
  }
}