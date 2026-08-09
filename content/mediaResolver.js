/**
 * MEDIA RESOLUTION — Optimized for speed with priority on cache.
 *
 * Resolution order for a given <video>:
 *   1. Passive JSON cache — filled by networkInterceptor.js sniffing the
 *      page's own network responses as they fly by (fast path, no extra
 *      network calls).
 *   2. Active fetch — the post's embed page, then (if that fails) a
 *      streaming fetch of the full permalink page, scanning for an
 *      embedded .mp4 URL.
 *   3. GraphQL — a direct query against Instagram's API, trying each known
 *      doc_id in turn (Instagram rotates these periodically, so a single
 *      hardcoded id is not reliable on its own).
 *
 * There used to be a 4th, last-resort step that captured raw bytes out of
 * the MediaSource/SourceBuffer the page uses for blob: playback. It's been
 * removed — in practice steps 1-3 have resolved every video in testing, and
 * the capture path kept every scrolled-past reel's full byte buffer alive
 * in memory for the rest of the page's life. `resolve()` now always
 * returns either a CDN URL string or `null`.
 */
class MediaResolver {
  static #JsonSource = "reelsleek-network";
  static #maxEntries = 50;

  // CDN URLs returned by Instagram are signed with time-limited query
  // params. A cache entry that outlives that signature would be served as
  // a "hit" but fail to actually download, so cache entries expire instead
  // of only being evicted by count.
  static #CACHE_TTL_MS = 5 * 60 * 1000;

  static #DEBUG = true;

  /** @type {Map<string, {url: string, expiresAt: number}>} */
  static #jsonCache = new Map();
  /** @type {string[]} */
  static #jsonOrder = [];

  /** @type {Map<string, Promise>} */
  static #activeResolutions = new Map();

  // Pre-warm cache: track which videos we're already resolving
  static #pendingResolutions = new WeakMap();

  // Instagram rotates the doc_id used for the shortcode_media GraphQL
  // query from time to time. Try each of these in order rather than
  // hardcoding a single one, so an old id going stale doesn't take the
  // whole GraphQL fallback down with it.
  static #GRAPHQL_DOC_IDS = [
    "27128499623469141",
    "10015901848480474",
    "8845758582119845",
  ];

  static #log(...args) {
    if (MediaResolver.#DEBUG) console.log("[MediaResolver]", ...args);
  }

  static #warn(...args) {
    console.warn("[MediaResolver]", ...args);
  }

  static setup() {
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      if (event.data?.source !== MediaResolver.#JsonSource) return;

      for (const entry of event.data.urls ?? []) {
        if (!entry?.url || entry.id == null) continue;
        MediaResolver.#rememberJson(String(entry.id), entry.url);
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
    MediaResolver.#jsonCache.set(id, {
      url,
      expiresAt: Date.now() + MediaResolver.#CACHE_TTL_MS,
    });
  }

  /**
   * Returns a still-valid cached URL for the given id, or null if there's
   * no entry or it has expired (expired entries are dropped immediately so
   * they don't linger and count against #maxEntries).
   */
  static #getCached(id) {
    if (!id) return null;
    const entry = MediaResolver.#jsonCache.get(id);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      MediaResolver.#jsonCache.delete(id);
      return null;
    }
    return entry.url;
  }

  static #getOgVideoUrl(doc = document) {
    const meta = doc.querySelector(
      'meta[property="og:video:secure_url"], meta[property="og:video"]',
    );
    return meta?.content || meta?.getAttribute("content") || null;
  }

  static #SHORTCODE_LINK_SELECTOR =
    'a[href*="/reel/"], a[href*="/reels/"], a[href*="/p/"], a[href*="/tv/"], a[data-reelsleek-original-href]';

  static #extractShortcodeFromHref(href) {
    if (!href) return null;
    const match = String(href).match(/\/(?:reel|reels|p|tv)\/([^/?#&]+)/);
    return match ? match[1] : null;
  }

  static #getShortcodeForVideo(video) {
    let link = video.closest(MediaResolver.#SHORTCODE_LINK_SELECTOR);
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
      const candidates = [
        ...container.querySelectorAll(MediaResolver.#SHORTCODE_LINK_SELECTOR),
      ];
      for (const a of candidates) {
        const sc = MediaResolver.#extractShortcodeFromHref(
          a.dataset.reelsleekOriginalHref || a.getAttribute("href"),
        );
        if (sc) return sc;
      }
    }

    let el = video.parentElement;
    for (let i = 0; i < 8 && el; i++) {
      link = el.querySelector?.(MediaResolver.#SHORTCODE_LINK_SELECTOR);
      if (link) {
        const sc = MediaResolver.#extractShortcodeFromHref(
          link.dataset.reelsleekOriginalHref || link.getAttribute("href"),
        );
        if (sc) return sc;
      }
      el = el.parentElement;
    }

    return null;
  }

  static getShortcode(video) {
    return (
      MediaResolver.#getShortcodeForVideo(video) ?? PageHandler.getShortcode()
    );
  }

  static #waitForJsonCache(shortcode, timeoutMs) {
    if (!shortcode) return Promise.resolve(null);
    const cached = MediaResolver.#getCached(shortcode);
    if (cached) return Promise.resolve(cached);

    return new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        const url = MediaResolver.#getCached(shortcode);
        if (url) {
          clearInterval(interval);
          resolve(url);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          resolve(null);
        }
      }, 60);
    });
  }

  static #extractVideoUrlFromGraphql(json) {
    if (!json || typeof json !== "object") return null;

    const bestFromVersions = (versions) => {
      if (!Array.isArray(versions) || !versions.length) return null;
      const sorted = [...versions].sort(
        (a, b) =>
          (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0),
      );
      return sorted[0]?.url || null;
    };

    // Check for media object first (most common)
    const media =
      json?.data?.xdt_shortcode_media || json?.data?.shortcode_media;
    if (media) {
      if (typeof media.video_url === "string" && media.video_url) {
        return media.video_url;
      }
      const fromVersions = bestFromVersions(media.video_versions);
      if (fromVersions) return fromVersions;

      const edges = media.edge_sidecar_to_children?.edges;
      if (Array.isArray(edges)) {
        for (const edge of edges) {
          const node = edge?.node;
          if (!node) continue;
          if (typeof node.video_url === "string" && node.video_url) {
            return node.video_url;
          }
          const v = bestFromVersions(node.video_versions);
          if (v) return v;
        }
      }
    }

    // Polaris shape
    const items = json?.data?.xdt_api__v1__media__shortcode__web_info?.items;
    const item = Array.isArray(items) ? items[0] : null;
    if (item) {
      const fromVersions = bestFromVersions(item.video_versions);
      if (fromVersions) return fromVersions;
      if (typeof item.video_url === "string" && item.video_url) {
        return item.video_url;
      }

      if (Array.isArray(item.carousel_media)) {
        for (const slide of item.carousel_media) {
          const v = bestFromVersions(slide.video_versions);
          if (v) return v;
          if (typeof slide.video_url === "string" && slide.video_url) {
            return slide.video_url;
          }
        }
      }
    }

    // Recursive walk as last resort
    const seen = new Set();
    const walk = (node, depth) => {
      if (!node || typeof node !== "object" || depth > 12 || seen.has(node))
        return null;
      seen.add(node);

      if (
        (typeof node.video_url === "string" &&
          node.video_url.includes("cdninstagram")) ||
        (typeof node.video_url === "string" && node.video_url.includes("fbcdn"))
      ) {
        return node.video_url;
      }
      if (Array.isArray(node.video_versions)) {
        const v = bestFromVersions(node.video_versions);
        if (v) return v;
      }

      for (const key of Object.keys(node)) {
        const found = walk(node[key], depth + 1);
        if (found) return found;
      }
      return null;
    };

    return walk(json, 0);
  }

  static #cleanUrl(raw) {
    return raw
      .replace(/\\\//g, "/")
      .replace(/\\u0026/g, "&")
      .replace(/&amp;/g, "&");
  }

  static #collectMp4Candidates(text) {
    const candidates = [];

    const urlRegex =
      /"url"\s*:\s*"(https:\\\/\\\/[^"]+?\.mp4[^"]*|https:\/\/[^"]+?\.mp4[^"]*)"/gi;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      candidates.push(MediaResolver.#cleanUrl(match[1]));
    }

    const broadRegex =
      /https:\\?\/\\?\/[^"'\s<>]+?(?:cdninstagram|fbcdn)\.net\/[^"'\s<>]+?\.mp4[^"'\s<>]*/gi;
    const broadMatches = text.match(broadRegex);
    if (broadMatches?.length) {
      candidates.push(...broadMatches.map(MediaResolver.#cleanUrl));
    }

    const vvIdx = text.indexOf("video_versions");
    if (vvIdx !== -1) {
      const slice = text.slice(vvIdx, vvIdx + 2500);
      const m = slice.match(/https:\\?\/\\?\/[^"'\s]+?\.mp4[^"'\s]*/i);
      if (m) candidates.push(MediaResolver.#cleanUrl(m[0]));
    }

    return candidates.sort((a, b) => b.length - a.length);
  }

  static #findShortcodeAnchors(text, shortcode) {
    if (!shortcode) return [];
    const escaped = shortcode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const anchorRegex = new RegExp(
      `"(?:code|shortcode)"\\s*:\\s*"${escaped}"`,
      "g",
    );
    const offsets = [];
    let match;
    while ((match = anchorRegex.exec(text)) !== null) {
      offsets.push(match.index);
    }
    return offsets;
  }

  static #extractMp4FromHtml(html, shortcode = null) {
    const anchors = MediaResolver.#findShortcodeAnchors(html, shortcode);

    if (anchors.length) {
      const WINDOW = 6000;
      for (const offset of anchors) {
        const start = Math.max(0, offset - WINDOW);
        const end = Math.min(html.length, offset + WINDOW);
        const windowCandidates = MediaResolver.#collectMp4Candidates(
          html.slice(start, end),
        );
        if (windowCandidates.length) return windowCandidates[0];
      }
      return null;
    }

    return null;
  }

  static #extractMp4FromHtmlUnanchored(html) {
    const candidates = MediaResolver.#collectMp4Candidates(html);
    return candidates.length ? candidates[0] : null;
  }

  /**
   * Use a HEAD request first to check if the embed page exists, then fetch
   * only if needed. This saves bandwidth on cache hits.
   */
  static async #fetchFromEmbedPage(shortcode) {
    if (!shortcode) return null;
    try {
      const headController = new AbortController();
      const headTimeout = setTimeout(() => headController.abort(), 2000);
      const headResponse = await fetch(
        `https://www.instagram.com/reel/${shortcode}/embed/captioned/`,
        {
          method: "HEAD",
          credentials: "include",
          signal: headController.signal,
        },
      );
      clearTimeout(headTimeout);

      if (!headResponse.ok) return null;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);

      const response = await fetch(
        `https://www.instagram.com/reel/${shortcode}/embed/captioned/`,
        {
          credentials: "include",
          headers: { Accept: "text/html,application/xhtml+xml" },
          signal: controller.signal,
        },
      );
      clearTimeout(timeout);

      if (!response.ok) return null;

      const html = await response.text();
      let url = MediaResolver.#extractMp4FromHtml(html, shortcode);
      if (!url) {
        url = MediaResolver.#extractMp4FromHtmlUnanchored(html);
      }
      if (url) {
        MediaResolver.#rememberJson(shortcode, url);
        return url;
      }
      return null;
    } catch (err) {
      if (err.name !== "AbortError") {
        MediaResolver.#warn("embed-fetch exception", err);
      }
      return null;
    }
  }

  static async #fetchFromFullPageStreaming(shortcode) {
    if (!shortcode) return null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(
        `https://www.instagram.com/reel/${shortcode}/`,
        {
          credentials: "include",
          headers: { Accept: "text/html,application/xhtml+xml" },
          signal: controller.signal,
        },
      );

      if (!response.ok || !response.body) {
        clearTimeout(timeout);
        return null;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const url = MediaResolver.#extractMp4FromHtml(buffer, shortcode);
        if (url) {
          clearTimeout(timeout);
          reader.cancel().catch(() => {});
          MediaResolver.#rememberJson(shortcode, url);
          return url;
        }

        if (buffer.length > 15_000_000) {
          clearTimeout(timeout);
          reader.cancel().catch(() => {});
          return null;
        }
      }

      clearTimeout(timeout);

      // Last-ditch, low-confidence guess: no shortcode anchor was found in
      // the HTML, so this just grabs the longest .mp4-looking URL on the
      // page. It's flagged loudly because — unlike the anchored path above
      // — there's no guarantee it belongs to the requested post.
      const fallback = MediaResolver.#extractMp4FromHtmlUnanchored(buffer);
      if (fallback) {
        MediaResolver.#warn(
          "no shortcode anchor found — using unanchored (low-confidence) guess for",
          shortcode,
          fallback.slice(0, 100),
        );
        MediaResolver.#rememberJson(shortcode, fallback);
        return fallback;
      }

      return null;
    } catch (err) {
      if (err.name !== "AbortError") {
        MediaResolver.#warn("streaming og-fetch exception", err);
      }
      return null;
    }
  }

  static async #fetchOgVideoForShortcode(shortcode) {
    if (!shortcode) return null;
    const embedUrl = await MediaResolver.#fetchFromEmbedPage(shortcode);
    if (embedUrl) return embedUrl;
    return MediaResolver.#fetchFromFullPageStreaming(shortcode);
  }

  /**
   * Tries each known doc_id in turn and stops at the first one that
   * resolves a URL. Instagram rotates these periodically — relying on a
   * single hardcoded id meant this fallback silently stopped working
   * whenever Instagram rotated it.
   */
  static async #fetchGraphqlVideoUrl(shortcode) {
    if (!shortcode) return null;

    const csrfMatch = document.cookie.match(/csrftoken=([^;]+)/);
    const csrf = csrfMatch ? csrfMatch[1] : "";

    for (const docId of MediaResolver.#GRAPHQL_DOC_IDS) {
      try {
        const body = new URLSearchParams({
          variables: JSON.stringify({ shortcode }),
          doc_id: docId,
          server_timestamps: "true",
        });

        const response = await fetch("https://www.instagram.com/api/graphql", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-IG-App-ID": "936619743392459",
            "X-CSRFToken": csrf,
            "X-Requested-With": "XMLHttpRequest",
          },
          body,
        });

        const text = await response.text();
        if (!text.trimStart().startsWith("{")) continue;

        const json = JSON.parse(text);
        const url = MediaResolver.#extractVideoUrlFromGraphql(json);
        if (url) {
          MediaResolver.#rememberJson(shortcode, url);
          MediaResolver.#log(`✓ graphql succeeded with doc_id ${docId}`);
          return url;
        }
      } catch (err) {
        MediaResolver.#warn(`GraphQL exception with doc_id ${docId}`, err);
        // Try the next doc_id.
      }
    }

    return null;
  }

  /**
   * Pre-warm: start resolving a video's URL proactively. Returns a promise
   * that resolves when the URL is available, but callers don't need to
   * await it — it's meant to be fired off ahead of time (e.g. on viewport
   * entry) so the click handler usually finds an already-resolved result.
   */
  static prewarm(video) {
    if (!video) return Promise.resolve(null);

    const shortcode = MediaResolver.getShortcode(video);
    if (!shortcode) return Promise.resolve(null);

    const cached = MediaResolver.#getCached(shortcode);
    if (cached) {
      MediaResolver.#log("prewarm: already cached", shortcode);
      return Promise.resolve(cached);
    }

    if (MediaResolver.#activeResolutions.has(shortcode)) {
      MediaResolver.#log("prewarm: resolution already in progress", shortcode);
      return MediaResolver.#activeResolutions.get(shortcode);
    }

    if (MediaResolver.#pendingResolutions.has(video)) {
      return MediaResolver.#pendingResolutions.get(video);
    }

    const promise = MediaResolver.resolve(video)
      .catch(() => null)
      .finally(() => {
        MediaResolver.#pendingResolutions.delete(video);
      });

    MediaResolver.#pendingResolutions.set(video, promise);
    return promise;
  }

  /**
   * Primary resolve method. Shares in-progress resolutions (keyed by
   * shortcode, and separately by video element) to avoid duplicate network
   * requests when multiple callers ask for the same video.
   * @param {HTMLVideoElement} video
   * @returns {Promise<string|null>} the resolved CDN URL, or null.
   */
  static async resolve(video) {
    const shortcode = MediaResolver.getShortcode(video);
    MediaResolver.#log("resolving shortcode =", shortcode);

    if (shortcode && MediaResolver.#activeResolutions.has(shortcode)) {
      MediaResolver.#log("⏳ reusing in-progress resolution for", shortcode);
      return MediaResolver.#activeResolutions.get(shortcode);
    }

    if (MediaResolver.#pendingResolutions.has(video)) {
      MediaResolver.#log("⏳ video already being resolved");
      return MediaResolver.#pendingResolutions.get(video);
    }

    const resolvePromise = MediaResolver.#doResolve(video);

    if (shortcode) {
      MediaResolver.#activeResolutions.set(shortcode, resolvePromise);
    }
    MediaResolver.#pendingResolutions.set(video, resolvePromise);
    resolvePromise.finally(() => {
      if (shortcode) MediaResolver.#activeResolutions.delete(shortcode);
      MediaResolver.#pendingResolutions.delete(video);
    });

    return resolvePromise;
  }

  /**
   * The actual resolution work - separated so we can manage the promise
   * lifecycle properly. Returns a CDN URL string, or null if every
   * strategy came up empty.
   */
  static async #doResolve(video) {
    const shortcode = MediaResolver.getShortcode(video);
    MediaResolver.#log("doResolve shortcode =", shortcode);

    if (!shortcode) {
      MediaResolver.#warn("no shortcode found for video — cannot resolve");
      return null;
    }

    // STEP 1: passive cache (fast path), filled by networkInterceptor.js
    // sniffing the page's own JSON responses.
    const cachedUrl = MediaResolver.#getCached(shortcode);
    if (cachedUrl) {
      MediaResolver.#log("⚡ cache hit (fast path)");
      return cachedUrl;
    }

    const jsonUrl = await MediaResolver.#waitForJsonCache(shortcode, 400);
    if (jsonUrl) {
      MediaResolver.#log("⚡ cache filled while waiting");
      return jsonUrl;
    }
    MediaResolver.#log("cache miss, starting active fetch");

    // STEP 2: active fetch (embed page, then full-page streaming).
    const fetchedUrl = await MediaResolver.#fetchOgVideoForShortcode(shortcode);
    if (fetchedUrl) {
      MediaResolver.#log("✓ active fetch succeeded");
      return fetchedUrl;
    }

    // STEP 3: GraphQL fallback.
    const graphqlUrl = await MediaResolver.#fetchGraphqlVideoUrl(shortcode);
    if (graphqlUrl) {
      MediaResolver.#log("✓ graphql fallback succeeded");
      return graphqlUrl;
    }

    MediaResolver.#warn("✗ no source found for", shortcode);
    return null;
  }
}
