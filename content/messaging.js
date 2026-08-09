browser.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case "ping":
      return Promise.resolve({
        ok: true,
        volume: AudioControl.volume,
        muted: AudioControl.muted,
        orient: AudioControl.orientation,
        audioControlAlwaysVisible: AudioControl.alwaysVisible,
        videoControlAlwaysVisible: VideoControl.alwaysVisible,
        toolbarMode: ToolbarMode.mode,
        controlRadiusMode: ControlRadius.mode,
        ambientModeEnabled: AmbientMode.enabled,
        doubleClickFullscreenEnabled: VideoControl.doubleClickFullscreenEnabled,
        autoscrollEnabled: AutoScroll.autoscrollEnabled,
        theaterModeFeatureEnabled: TheaterMode.featureEnabled,
        autoscrollFeatureEnabled: AutoScroll.featureEnabled,
        downloadFeatureEnabled: Download.featureEnabled,
        rotateFeatureEnabled: Rotate.featureEnabled,
        featureOrder: FeatureOrder.order,
      });

    case "setOrientation":
      AudioControl.setOrientation(msg.value);
      return Promise.resolve({ ok: true });

    case "setVolumeAlwaysVisible":
      AudioControl.setVisibility(msg.value);
      return Promise.resolve({ ok: true });

    case "setSeekbarAlwaysVisible":
      VideoControl.setVisibility(msg.value);
      return Promise.resolve({ ok: true });

    case "setAutoscroll":
      AutoScroll.setAutoscrollEnabled(msg.value);
      return Promise.resolve({ ok: true });

    case "setDoubleClickFullscreen":
      VideoControl.setDoubleClickFullscreenEnabled(msg.value);
      return Promise.resolve({ ok: true });

    case "setAmbientMode":
      AmbientMode.setEnabled(msg.value);
      return Promise.resolve({ ok: true });

    case "setTheaterMode":
      TheaterMode.toggleTheaterMode();
      return Promise.resolve({ ok: true });

    case "setControlRadius":
      ControlRadius.setMode(msg.value);
      return Promise.resolve({ ok: true });

    case "setTheaterModeFeatureEnabled":
      TheaterMode.setFeatureEnabled(msg.value);
      return Promise.resolve({ ok: true });

    case "setAutoscrollFeatureEnabled":
      AutoScroll.setFeatureEnabled(msg.value);
      return Promise.resolve({ ok: true });

    case "setDownloadFeatureEnabled":
      Download.setFeatureEnabled(msg.value);
      return Promise.resolve({ ok: true });

    case "setRotateFeatureEnabled":
      Rotate.setFeatureEnabled(msg.value);
      return Promise.resolve({ ok: true });

    case "setFeatureOrder":
      FeatureOrder.setOrder(msg.order);
      FeatureOrder.reattachAll();
      return Promise.resolve({ ok: true });

    case "getKeybinds":
      return Promise.resolve({ ok: true, keybinds: Keybinds.list() });

    case "setKeybind":
      return Promise.resolve(Keybinds.setKey(msg.id, msg.key));

    case "resetKeybind":
      return Promise.resolve(Keybinds.resetKey(msg.id));

    case "resetAllKeybinds":
      return Promise.resolve(Keybinds.resetAll());

    case "setToolbarMode": {
      ToolbarMode.setMode(msg.value);
      const videos = getCleanVideos();
      videos.forEach((v) => {
        VideoControl.detach(v);
        Download.detach(v);
        TheaterMode.detach(v);
        Rotate.detach(v);
        AutoScroll.detach(v);
        v.parentElement.querySelector(".reelsleek-toolbar")?.remove();
        attachToolbar(v);
        VideoControl.attach(v);
        FeatureOrder.attachAll(v);
      });
      return Promise.resolve({ ok: true });
    }

    case "resetAll": {
      const videos = getCleanVideos();
      videos.forEach((v) => {
        AudioControl.detach(v);
        VideoControl.detach(v);
        Download.detach(v);
        TheaterMode.detach(v);
        Rotate.detach(v);
        AutoScroll.detach(v);
      });
      videos.forEach((v) => {
        AudioControl.attach(v);
        VideoControl.attach(v);
        FeatureOrder.attachAll(v);
      });
      return Promise.resolve({ ok: true });
    }
  }
});
