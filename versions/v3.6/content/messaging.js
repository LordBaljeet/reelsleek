

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
        autoscrollEnabled: AutoScroll.autoscrollEnabled,
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

    case "resetAll":
      AudioControl.resetAll();
      VideoControl.resetAll();
      AutoScroll.resetAll();
      TheaterMode.resetAll();
      return Promise.resolve({ ok: true });
  }
});