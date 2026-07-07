/**
 * Runs in the page's MAIN world (not the extension's isolated world).
 *
 * Two complementary techniques are used to recover a downloadable video for
 * a specific <video> element:
 *
 * 1. MediaSource/SourceBuffer capture (primary). Instagram reels/posts are
 *    played back through a `blob:` URL backed by MediaSource. We patch
 *    `URL.createObjectURL`, `MediaSource.prototype.addSourceBuffer`, and
 *    `SourceBuffer.prototype.appendBuffer` to record the raw bytes fed into
 *    each *specific* blob URL's MediaSource as they're appended.
 *
 *    This is keyed by the exact blob URL, which is unique per <video>
 *    element/instance — so it can never be confused with a different,
 *    already-preloaded, adjacent reel. (A page-wide "last URL seen" cache is
 *    NOT reliable once several reels have preloaded ahead of the one
 *    currently in view — that was the cause of a "downloads the wrong
 *    video" bug.)
 *
 * 2. JSON response sniffing (fallback). Some pages (e.g. permalink posts)
 *    expose a direct CDN `.mp4` URL via GraphQL/API JSON responses. We
 *    collect those too, keyed by the post's shortcode/id, for use only when
 *    capture #1 comes up empty (e.g. the video had already fully buffered
 *    before this script attached).
 */
(() => {
  if (window.__reelsleekMainWorldInstalled) return;
  window.__reelsleekMainWorldInstalled = true;

  const JSON_MESSAGE_SOURCE = "reelsleek-network";
  const CAPTURE_REQUEST_SOURCE = "reelsleek-request-capture";
  const CAPTURE_RESPONSE_SOURCE = "reelsleek-capture-response";

  // ── 1. MediaSource / SourceBuffer capture, keyed by exact blob URL ──

  /** @type {WeakMap<MediaSource, string>} */
  const mediaSourceToBlobUrl = new WeakMap();
  /** @type {WeakMap<SourceBuffer, {mimeType: string, chunks: Uint8Array[], bytes: number}>} */
  const sourceBufferRecords = new WeakMap();
  /** @type {WeakMap<SourceBuffer, MediaSource>} */
  const sourceBufferToMediaSource = new WeakMap();
  /** @type {Map<string, Set<SourceBuffer>>} */
  const blobUrlToSourceBuffers = new Map();

  const originalCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (obj) {
    const url = originalCreateObjectURL(obj);
    if (typeof MediaSource !== "undefined" && obj instanceof MediaSource) {
      mediaSourceToBlobUrl.set(obj, url);
    }
    return url;
  };

  function linkSourceBufferToBlobUrl(sourceBuffer, mediaSource) {
    const blobUrl = mediaSourceToBlobUrl.get(mediaSource);
    if (!blobUrl) return;
    if (!blobUrlToSourceBuffers.has(blobUrl))
      blobUrlToSourceBuffers.set(blobUrl, new Set());
    blobUrlToSourceBuffers.get(blobUrl).add(sourceBuffer);
  }

  if (typeof MediaSource !== "undefined") {
    const originalAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
    MediaSource.prototype.addSourceBuffer = function (mimeType) {
      const sourceBuffer = originalAddSourceBuffer.call(this, mimeType);
      sourceBufferToMediaSource.set(sourceBuffer, this);
      sourceBufferRecords.set(sourceBuffer, { mimeType, chunks: [], bytes: 0 });
      linkSourceBufferToBlobUrl(sourceBuffer, this);
      return sourceBuffer;
    };

    const originalAppendBuffer = SourceBuffer.prototype.appendBuffer;
    SourceBuffer.prototype.appendBuffer = function (chunk) {
      try {
        const mediaSource = sourceBufferToMediaSource.get(this);
        const record = sourceBufferRecords.get(this);
        // `createObjectURL` can be called after `addSourceBuffer` in some
        // player implementations, so (re)link lazily here too.
        if (mediaSource) linkSourceBufferToBlobUrl(this, mediaSource);

        if (record) {
          const bytes =
            chunk instanceof ArrayBuffer
              ? new Uint8Array(chunk.slice(0))
              : new Uint8Array(
                  chunk.buffer.slice(
                    chunk.byteOffset,
                    chunk.byteOffset + chunk.byteLength,
                  ),
                );
          record.chunks.push(bytes);
          record.bytes += bytes.byteLength;
        }
      } catch {
        // Never let capture errors break actual playback.
      }
      return originalAppendBuffer.call(this, chunk);
    };
  }

  /**
   * Merges the captured bytes for a blob URL into a single downloadable
   * buffer. When a video and audio track were recorded as separate
   * SourceBuffers, the video-typed (or largest) one is used — mixing raw
   * bytes from two different tracks into one file would produce an invalid
   * container.
   */
  function buildRecordingFor(blobUrl) {
    const buffers = blobUrlToSourceBuffers.get(blobUrl);
    if (!buffers || !buffers.size) return null;

    let best = null;
    for (const sourceBuffer of buffers) {
      const record = sourceBufferRecords.get(sourceBuffer);
      if (!record || !record.chunks.length) continue;
      if (!best) {
        best = record;
        continue;
      }
      const bestIsVideo = best.mimeType.includes("video");
      const currentIsVideo = record.mimeType.includes("video");
      if (currentIsVideo && !bestIsVideo) best = record;
      else if (currentIsVideo === bestIsVideo && record.bytes > best.bytes)
        best = record;
    }
    if (!best) return null;

    const merged = new Uint8Array(best.bytes);
    let offset = 0;
    for (const chunk of best.chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      buffer: merged.buffer,
      mimeType: best.mimeType.split(";")[0] || "video/mp4",
    };
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== CAPTURE_REQUEST_SOURCE) return;

    const { requestId, blobUrl } = event.data;
    const recording = buildRecordingFor(blobUrl);

    if (!recording) {
      window.postMessage(
        { source: CAPTURE_RESPONSE_SOURCE, requestId, ok: false },
        "*",
      );
      return;
    }

    // Transfer (zero-copy) the ArrayBuffer across to the isolated content
    // script's postMessage listener.
    window.postMessage(
      {
        source: CAPTURE_RESPONSE_SOURCE,
        requestId,
        ok: true,
        buffer: recording.buffer,
        mimeType: recording.mimeType,
      },
      "*",
      [recording.buffer],
    );
  });

  // ── 2. JSON response sniffing (fallback for permalink pages) ──

  function extractVideoUrls(json) {
    const found = [];
    const seen = new Set();

    function walk(node, depth) {
      if (!node || typeof node !== "object" || depth > 14) return;
      if (seen.has(node)) return;
      seen.add(node);

      // Prefer the shortcode ("code") as the id when present, since that's
      // what the current page URL (and thus our cache lookup key) uses.
      if (typeof node.video_url === "string") {
        found.push({
          id: node.code ?? node.id ?? node.pk ?? null,
          url: node.video_url,
        });
      }
      if (
        Array.isArray(node.video_versions) &&
        typeof node.video_versions[0]?.url === "string"
      ) {
        found.push({
          id: node.code ?? node.id ?? node.pk ?? null,
          url: node.video_versions[0].url,
        });
      }

      for (const key in node) {
        const value = node[key];
        if (value && typeof value === "object") walk(value, depth + 1);
      }
    }

    walk(json, 0);
    return found;
  }

  function publishJson(urls) {
    if (!urls || !urls.length) return;
    window.postMessage({ source: JSON_MESSAGE_SOURCE, urls }, "*");
  }

  function isJsonResponse(response) {
    const type = response.headers?.get?.("content-type") || "";
    return type.includes("json");
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      if (isJsonResponse(response)) {
        response
          .clone()
          .json()
          .then((json) => publishJson(extractVideoUrls(json)))
          .catch(() => {});
      }
    } catch {
      // Ignore — never let interception break the page's own network calls.
    }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...args) {
    this.addEventListener("load", () => {
      try {
        const type = this.getResponseHeader?.("content-type") || "";
        if (!type.includes("json")) return;
        publishJson(extractVideoUrls(JSON.parse(this.responseText)));
      } catch {
        // Ignore non-JSON bodies or parse failures.
      }
    });
    return originalOpen.apply(this, args);
  };
})();
