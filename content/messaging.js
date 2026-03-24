

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
      });

    case "setOrientation":
      AudioControl.setOrientation(msg.value);
      return Promise.resolve({ ok: true });

    case "setVolumeAlwaysVisible":
      AudioControl.setVisibility(msg.value);
      return Promise.resolve({ ok: true });

    case "setSeekbarAlwaysVisible":
      VideoControl.setVisibility(msg.value)
      return Promise.resolve({ ok: true });

    case "setAutoscroll":
      AutoScroll.setAutoscrollEnabled(msg.value);
      return Promise.resolve({ ok: true });

    case "setTheaterMode":
      TheaterMode.toggleTheaterMode();
      return Promise.resolve({ ok: true });

    case "setToolbarMode": {
      ToolbarMode.setMode(msg.value);
      const videos = getCleanVideos();
      videos.forEach(v => {
        AutoScroll.detach(v);
        TheaterMode.detach(v);
        VideoControl.detach(v);
        v.parentElement.querySelector('.reelsleek-toolbar')?.remove();
        attachToolbar(v);
        VideoControl.attach(v);
        TheaterMode.attach(v);
        AutoScroll.attach(v);
      });
      return Promise.resolve({ ok: true });
    }

    case "resetAll": {
      const videos = getCleanVideos();
      videos.forEach(v => {
        AudioControl.detach(v);
        VideoControl.detach(v);
        TheaterMode.detach(v);
        AutoScroll.detach(v);
      });
      videos.forEach(v => {
        AudioControl.attach(v);
        VideoControl.attach(v);
        TheaterMode.attach(v);
        AutoScroll.attach(v);
      });
      return Promise.resolve({ ok: true });
    }
  }
});