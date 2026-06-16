(async () => {
  await ToolbarMode.setup();
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
    if (video.src && (!video.src.startsWith("blob") || video.src.includes("giphy.com"))) return;
    if(video.closest('[role="none')) return; // Skip gifs in embedded chats
    VideoControl.setCurrentlyPlayingVideo(video, true);
    AudioControl.attach(video);
    attachToolbar(video);
    VideoControl.attach(video);
    TheaterMode.attach(video);
    AutoScroll.attach(video);
    //removing reels redirect from home page.
    const closestLink = video.closest('a');
    if(closestLink && closestLink.href.includes("reels/")) {
      closestLink.href = "javascript:void(0);"
      closestLink.draggable = false;
    }
  }

  observer.observe(document.body, { childList: true, subtree: true });
})();