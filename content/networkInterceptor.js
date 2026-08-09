/**
 * Runs in the page's MAIN world (not the extension's isolated world).
 *
 * JSON response sniffing: some pages (e.g. permalink posts, and most of the
 * home feed) expose a direct CDN `.mp4` URL via GraphQL/API JSON responses.
 * We patch `fetch` and `XMLHttpRequest` to observe the page's own network
 * traffic and collect those URLs, keyed by the post's shortcode/id, for
 * `MediaResolver`'s passive cache.
 *
 * NOTE: This file previously also patched `URL.createObjectURL`,
 * `MediaSource.prototype.addSourceBuffer`, and
 * `SourceBuffer.prototype.appendBuffer` to capture raw playback bytes as a
 * last-resort fallback for videos where no JSON URL could be found. In
 * practice the JSON-sniffing + active-fetch path in MediaResolver has
 * covered every case in testing, and the byte-capture path meant every
 * scrolled-past reel kept its full appended chunks (often several MB each)
 * alive in memory for the rest of the page's lifetime. It's been removed.
 */
(() => {
  if (window.__reelsleekMainWorldInstalled) return;
  window.__reelsleekMainWorldInstalled = true;

  const JSON_MESSAGE_SOURCE = "reelsleek-network";

  function extractVideoUrls(json) {
    const found = [];
    const seen = new Set();

    function walk(node, depth) {
      if (!node || typeof node !== "object" || depth > 14) return;
      if (seen.has(node)) return;
      seen.add(node);

      // Favor video_url and video_versions
      if (typeof node.video_url === "string" && node.video_url) {
        let id = node.code ?? node.id ?? node.pk ?? null;
        // If we don't have an id yet, try to find one in the parent chain
        // This is important for nested structures
        found.push({ id, url: node.video_url });
      }

      if (Array.isArray(node.video_versions) && node.video_versions.length) {
        const best = node.video_versions[0];
        if (best?.url) {
          let id = node.code ?? node.id ?? node.pk ?? null;
          found.push({ id, url: best.url });
        }
      }

      // Special handling for carousel items
      if (Array.isArray(node.edge_sidecar_to_children?.edges)) {
        for (const edge of node.edge_sidecar_to_children.edges) {
          const child = edge?.node;
          if (child?.video_url) {
            let id = child.code ?? child.id ?? node.code ?? node.id ?? null;
            found.push({ id, url: child.video_url });
          }
          if (child?.video_versions?.length) {
            let id = child.code ?? child.id ?? node.code ?? node.id ?? null;
            found.push({ id, url: child.video_versions[0].url });
          }
        }
      }

      for (const key in node) {
        const value = node[key];
        if (value && typeof value === "object") {
          // Skip large arrays that are unlikely to contain video URLs
          if (Array.isArray(value) && value.length > 100) {
            // Only check the first few items of large arrays
            for (let i = 0; i < Math.min(value.length, 20); i++) {
              if (value[i] && typeof value[i] === "object") {
                walk(value[i], depth + 1);
              }
            }
            continue;
          }
          walk(value, depth + 1);
        }
      }
    }

    walk(json, 0);

    // Deduplicate by URL (keep first occurrence)
    const seenUrls = new Set();
    const unique = [];
    for (const entry of found) {
      if (!seenUrls.has(entry.url)) {
        seenUrls.add(entry.url);
        unique.push(entry);
      }
    }

    return unique;
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
