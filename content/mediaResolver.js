/**
 * MEDIA RESOLUTION
 *
 * Resolves an Instagram <video> element to a direct CDN .mp4 URL on demand
 * (click). No passive cache, no pre-warming — keeps memory flat.
 *
 * Strategy:
 *   1. Extract shortcode from the video’s surrounding DOM (or page URL).
 *   2. Convert shortcode → numeric media id.
 *   3. GET /api/v1/media/{id}/info/ and pick the best video_versions entry.
 *
 * Returns a CDN URL string, or null on failure.
 */
class MediaResolver {
  static #DEBUG = true;

  /** @type {Map<string, Promise<string|null>>} */
  static #inFlight = new Map();

  static #SHORTCODE_ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  static #SHORTCODE_LINK_SELECTOR =
    'a[href*="/reel/"], a[href*="/reels/"], a[href*="/p/"], a[href*="/tv/"], a[data-reelsleek-original-href]';

  static #log(...args) {
    if (MediaResolver.#DEBUG) console.log("[MediaResolver]", ...args);
  }

  static #warn(...args) {
    console.warn("[MediaResolver]", ...args);
  }

  // Kept as a no-op so existing callers (e.g. content bootstrap) don’t break.
  static setup() {}

  // ─── shortcode ─────────────────────────────────────────────────────────

  static #extractShortcodeFromHref(href) {
    if (!href) return null;
    const match = String(href).match(/\/(?:reel|reels|p|tv)\/([^/?#&]+)/);
    return match ? match[1] : null;
  }

  /**
   * @param {HTMLVideoElement} video
   * @returns {string|null}
   */
  static #getShortcodeForVideo(video) {
    const link = video.closest(MediaResolver.#SHORTCODE_LINK_SELECTOR);
    if (link) {
      const sc = MediaResolver.#extractShortcodeFromHref(
        link.dataset.reelsleekOriginalHref || link.getAttribute("href"),
      );
      if (sc) return sc;
    }

    const container = video.closest(
      'article, [role="article"], [role="presentation"], div[class*="x1lliihq"], div[class*="x1n2onr6"]',
    );
    if (container) {
      for (const a of container.querySelectorAll(
        MediaResolver.#SHORTCODE_LINK_SELECTOR,
      )) {
        const sc = MediaResolver.#extractShortcodeFromHref(
          a.dataset.reelsleekOriginalHref || a.getAttribute("href"),
        );
        if (sc) return sc;
      }
    }

    let el = video.parentElement;
    for (let i = 0; i < 8 && el; i++) {
      const near = el.querySelector?.(MediaResolver.#SHORTCODE_LINK_SELECTOR);
      if (near) {
        const sc = MediaResolver.#extractShortcodeFromHref(
          near.dataset.reelsleekOriginalHref || near.getAttribute("href"),
        );
        if (sc) return sc;
      }
      el = el.parentElement;
    }

    return null;
  }

  /**
   * @param {HTMLVideoElement} video
   * @returns {string|null}
   */
  static getShortcode(video) {
    return (
      MediaResolver.#getShortcodeForVideo(video) ?? PageHandler.getShortcode()
    );
  }

  // ─── media-info helpers ────────────────────────────────────────────────

  /**
   * @param {string} shortcode
   * @returns {string|null}
   */
  static #shortcodeToMediaId(shortcode) {
    if (!shortcode) return null;
    try {
      let id = 0n;
      for (const char of shortcode) {
        const idx = MediaResolver.#SHORTCODE_ALPHABET.indexOf(char);
        if (idx === -1) return null;
        id = id * 64n + BigInt(idx);
      }
      return id.toString(10);
    } catch {
      return null;
    }
  }

  static #getWwwClaim() {
    return (
      sessionStorage.getItem("www-claim-v2") ||
      document.cookie.match(/ig_www_claim=([^;]+)/)?.[1] ||
      "0"
    );
  }

  /**
   * @param {Array<{url?: string, width?: number, height?: number}>|null|undefined} versions
   * @returns {string|null}
   */
  static #bestVideoUrl(versions) {
    if (!Array.isArray(versions) || !versions.length) return null;
    const best = [...versions].sort(
      (a, b) =>
        (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0),
    )[0];
    return best?.url || null;
  }

  /**
   * @param {string} shortcode
   * @returns {Promise<string|null>}
   */
  static async #fetchFromMediaInfoApi(shortcode) {
    const mediaId = MediaResolver.#shortcodeToMediaId(shortcode);
    if (!mediaId) {
      MediaResolver.#warn("bad shortcode → id", shortcode);
      return null;
    }

    const csrf = document.cookie.match(/csrftoken=([^;]+)/)?.[1] || "";
    const headers = {
      Accept: "*/*",
      "X-CSRFToken": csrf,
      "X-IG-App-ID": "936619743392459",
      "X-IG-WWW-Claim": MediaResolver.#getWwwClaim(),
      "X-Requested-With": "XMLHttpRequest",
      Referer: location.href,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      try {
        const w = Math.round(screen.width * (devicePixelRatio || 1));
        const h = Math.round(screen.height * (devicePixelRatio || 1));
        document.cookie = `wd=${w}x${h}; path=/; SameSite=None; Secure`;
        document.cookie = `dpr=${devicePixelRatio || 2}; path=/; SameSite=None; Secure`;
      } catch {
        /* ignore */
      }

      const response = await fetch(
        `https://www.instagram.com/api/v1/media/${mediaId}/info/`,
        {
          method: "GET",
          credentials: "include",
          headers,
          signal: controller.signal,
        },
      );
      clearTimeout(timeout);

      if (!response.ok) {
        MediaResolver.#warn(
          `HTTP ${response.status} for ${shortcode} (id=${mediaId})`,
        );
        return null;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("json")) {
        const text = await response.text();
        MediaResolver.#warn("non-JSON body", text.slice(0, 120));
        return null;
      }

      const json = await response.json();
      const item = json?.items?.[0];
      if (!item) {
        MediaResolver.#warn("empty items", shortcode);
        return null;
      }

      const fromVersions = MediaResolver.#bestVideoUrl(item.video_versions);
      if (fromVersions) {
        MediaResolver.#log("✓ media-info", shortcode);
        return fromVersions;
      }

      if (typeof item.video_url === "string" && item.video_url) {
        MediaResolver.#log("✓ media-info (video_url)", shortcode);
        return item.video_url;
      }

      if (Array.isArray(item.carousel_media)) {
        for (const slide of item.carousel_media) {
          const url =
            MediaResolver.#bestVideoUrl(slide.video_versions) ||
            (typeof slide.video_url === "string" ? slide.video_url : null);
          if (url) {
            MediaResolver.#log("✓ media-info (carousel)", shortcode);
            return url;
          }
        }
      }

      MediaResolver.#warn("no video in payload", shortcode);
      return null;
    } catch (err) {
      clearTimeout(timeout);
      if (err.name !== "AbortError") {
        MediaResolver.#warn("exception", err);
      }
      return null;
    }
  }

  // ─── public API ────────────────────────────────────────────────────────

  /**
   * Resolve a video to a CDN URL. Deduplicates concurrent calls for the
   * same shortcode (e.g. double-click).
   * @param {HTMLVideoElement} video
   * @returns {Promise<string|null>}
   */
  static async resolve(video) {
    const shortcode = MediaResolver.getShortcode(video);
    MediaResolver.#log("resolve", shortcode);

    if (!shortcode) {
      MediaResolver.#warn("no shortcode — cannot resolve");
      return null;
    }

    if (MediaResolver.#inFlight.has(shortcode)) {
      MediaResolver.#log("reusing in-flight request", shortcode);
      return MediaResolver.#inFlight.get(shortcode);
    }

    const promise = MediaResolver.#fetchFromMediaInfoApi(shortcode).finally(
      () => MediaResolver.#inFlight.delete(shortcode),
    );
    MediaResolver.#inFlight.set(shortcode, promise);
    return promise;
  }
}
