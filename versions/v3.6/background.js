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
    browser.tabs.create({ url: browser.runtime.getURL("permission/index.html") });
  }
});

// Listen for messages from the popup or permission page
browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "checkPermission") {
    return hasPermission();
  }
});