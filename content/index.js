const handleHomePageVideo = (video) => {
  //if we are not on the home page, return
  if (window.location.pathname != "/") return;

  //fix clicking on video on home page redirecting to reels page.
  const closestLink = video.closest("a");
  if (!closestLink || !closestLink.href.includes("reels/")) return;

  // Stash the original permalink before clearing it below, so MediaResolver
  // can still recover this post's shortcode later (e.g. for the download
  // feature) even after the href has been neutralized.
  closestLink.dataset.reelsleekOriginalHref = closestLink.href;
  closestLink.href = "javascript:void(0);";
  closestLink.draggable = false;

  //fix move author name and profile picture to the top of the video on home page.
  const authorContainer = closestLink.previousElementSibling;
  if (!authorContainer) return;
  authorContainer.classList.add("reelsleek-homepage-author-container");
  authorContainer.parentElement.style.background = "none";
  AmbientMode.attach(video);
};

(async () => {
  await ToolbarMode.setup();
  await AudioControl.setup();
  await VideoControl.setup();
  await AutoScroll.setup();
  await TheaterMode.setup();
  await Rotate.setup();
  await AmbientMode.setup();
  await Download.setup();
  MediaResolver.setup();
  getCleanVideos().forEach((video) => handleVideo(video));

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
    if (
      video.src &&
      (!video.src.startsWith("blob") || video.src.includes("giphy.com"))
    )
      return;
    if (video.closest('[role="none')) return; // Skip gifs in embedded chats
    attachToolbar(video);
    VideoControl.setCurrentlyPlayingVideo(video, true);
    AudioControl.attach(video);
    VideoControl.attach(video);
    Download.attach(video);
    TheaterMode.attach(video);
    Rotate.attach(video);
    AutoScroll.attach(video);
    AmbientMode.attach(video);

    handleHomePageVideo(video);
  }

  observer.observe(document.body, { childList: true, subtree: true });
})();
