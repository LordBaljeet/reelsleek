if (typeof globalThis.browser === "undefined") {
  globalThis.browser = chrome;
}

const IG_ORIGIN = "*://*.instagram.com/*";

async function hasPermission() {
  return browser.permissions.contains({ origins: [IG_ORIGIN] });
}

// On install or update: open the popup-like permission page if not already granted
browser.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== "install" && reason !== "update") return;
  const granted = await hasPermission();
  if (!granted) {
    // Open a dedicated permission-request tab
    browser.tabs.create({
      url: browser.runtime.getURL("permission/index.html"),
    });
  }
});

async function downloadMedia(url, filename) {
  try {
    await browser.downloads.download({ url, filename, saveAs: false });
    return { ok: true };
  } catch (err) {
    console.error("[background] Failed to download media:", err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// Listen for messages from the popup, permission page, or content scripts
browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "checkPermission") {
    return hasPermission();
  }
  if (msg.type === "downloadMedia") {
    return downloadMedia(msg.url, msg.filename);
  }
});
