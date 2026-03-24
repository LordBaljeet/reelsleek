(async () => {
  await AudioControl.setup();
  await VideoControl.setup();
  await TheaterMode.setup();
  await AutoScroll.setup();
  getCleanVideos().forEach(video => handleVideo(video));

  // Watch for dynamically added videos (Instagram is a SPA)
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        // The added node itself might be a video
        if (node instanceof HTMLVideoElement) {
          handleVideo(node);
        }

        // Or a video might be nested inside the added subtree
        node.querySelectorAll?.("video").forEach(handleVideo);
      }
    }
  });

  function handleVideo(video) {
    if (video.src && !video.src.startsWith("blob")) return;
    VideoControl.setCurrentlyPlayingVideo(video, true);
    AudioControl.attach(video);
    VideoControl.attach(video);
    TheaterMode.attach(video);
    AutoScroll.attach(video);
  }

  observer.observe(document.body, { childList: true, subtree: true });
})();