/**
 * MEDIA RESOLUTION
 *
 * Resolves a downloadable source for a specific <video> element. See
 * content/networkInterceptor.js (MAIN world) for how the raw bytes / URLs
 * are actually captured.
 */
class MediaResolver {
  static #JsonSource = "reelsleek-network";
  static #CaptureRequestSource = "reelsleek-request-capture";
  static #CaptureResponseSource = "reelsleek-capture-response";
  static #maxEntries = 50;

  /** @type {Map<string, string>} shortcode/id -> CDN url (JSON fallback only) */
  static #jsonCache = new Map();
  /** @type {string[]} insertion order, for simple LRU eviction */
  static #jsonOrder = [];

  /** @type {Map<number, {resolve: Function}>} */
  static #pendingCaptureRequests = new Map();
  static #nextRequestId = 1;

  static setup() {
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;

      if (event.data?.source === MediaResolver.#JsonSource) {
        for (const entry of event.data.urls ?? []) {
          if (!entry?.url || entry.id == null) continue;
          MediaResolver.#rememberJson(String(entry.id), entry.url);
        }
        return;
      }

      if (event.data?.source === MediaResolver.#CaptureResponseSource) {
        const pending = MediaResolver.#pendingCaptureRequests.get(
          event.data.requestId,
        );
        if (!pending) return;
        MediaResolver.#pendingCaptureRequests.delete(event.data.requestId);

        if (event.data.ok) {
          const blob = new Blob([event.data.buffer], {
            type: event.data.mimeType,
          });
          pending.resolve({ type: "blob", blob });
        } else {
          pending.resolve(null);
        }
      }
    });
  }

  static #rememberJson(id, url) {
    if (!MediaResolver.#jsonCache.has(id)) {
      MediaResolver.#jsonOrder.push(id);
      if (MediaResolver.#jsonOrder.length > MediaResolver.#maxEntries) {
        MediaResolver.#jsonCache.delete(MediaResolver.#jsonOrder.shift());
      }
    }
    MediaResolver.#jsonCache.set(id, url);
  }

  static #getOgVideoUrl() {
    const meta = document.querySelector(
      'meta[property="og:video:secure_url"], meta[property="og:video"]',
    );
    return meta?.content || null;
  }

  /**
   * Asks the MAIN-world capture script for the raw bytes it recorded for
   * this *exact* blob URL. Resolves to null if nothing was captured (or
   * after a short timeout) — it deliberately never falls back to "the last
   * URL seen anywhere on the page", since that would risk downloading a
   * different (e.g. preloaded) video than the one the user clicked on.
   * @param {string} blobUrl
   * @param {number} timeoutMs
   * @returns {Promise<{type: "blob", blob: Blob}|null>}
   */
  static #requestCapture(blobUrl, timeoutMs = 2000) {
    if (!blobUrl || !blobUrl.startsWith("blob:")) return Promise.resolve(null);

    return new Promise((resolve) => {
      const requestId = MediaResolver.#nextRequestId++;
      const timer = setTimeout(() => {
        MediaResolver.#pendingCaptureRequests.delete(requestId);
        resolve(null);
      }, timeoutMs);

      MediaResolver.#pendingCaptureRequests.set(requestId, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
      });

      window.postMessage(
        { source: MediaResolver.#CaptureRequestSource, requestId, blobUrl },
        "*",
      );
    });
  }

  /**
   * Waits briefly for the network sniffer to populate the JSON cache for a
   * given shortcode, in case the relevant response hasn't arrived yet.
   * @param {string} shortcode
   * @param {number} timeoutMs
   * @returns {Promise<string|null>}
   */
  static #waitForJsonCache(shortcode, timeoutMs) {
    if (!shortcode) return Promise.resolve(null);
    if (MediaResolver.#jsonCache.has(shortcode)) {
      return Promise.resolve(MediaResolver.#jsonCache.get(shortcode));
    }

    return new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (MediaResolver.#jsonCache.has(shortcode)) {
          clearInterval(interval);
          resolve(MediaResolver.#jsonCache.get(shortcode));
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          resolve(null);
        }
      }, 100);
    });
  }

  /**
   * Resolves a downloadable source for the given <video>.
   *
   * Resolution order:
   *   1. CDN URL cached from JSON responses, keyed by the current post's
   *      shortcode (permalink pages only). This is a *complete, pre-muxed*
   *      progressive MP4 (the same file IG uses for embeds/sharing), so it
   *      includes audio — unlike the raw MediaSource capture below, which
   *      only ever contains one adaptive-stream track (usually video-only,
   *      since IG serves audio on a separate SourceBuffer).
   *   2. `og:video` meta tag (permalink pages) — also a complete, muxed file.
   *   3. Raw bytes captured directly from this video's own blob URL. An
   *      exact match tied to the specific element clicked (immune to
   *      cross-contamination with other preloaded/adjacent videos), used as
   *      a last resort — e.g. on the home feed, where there is no reliable
   *      per-item shortcode to look up. May be missing audio.
   *
   * Intentionally has no page-wide "last URL seen" fallback.
   * @param {HTMLVideoElement} video
   * @returns {Promise<{type: "blob", blob: Blob}|{type: "url", url: string}|null>}
   */
  static async resolve(video) {
    const shortcode = PageHandler.getShortcode();
    if (shortcode) {
      const jsonUrl = await MediaResolver.#waitForJsonCache(shortcode, 1200);
      if (jsonUrl) return { type: "url", url: jsonUrl };
    }

    const ogVideoUrl = MediaResolver.#getOgVideoUrl();
    if (ogVideoUrl) return { type: "url", url: ogVideoUrl };

    const blobUrl = video.currentSrc || video.src;
    const captured = await MediaResolver.#requestCapture(blobUrl);
    if (captured) return captured;

    return null;
  }
}
