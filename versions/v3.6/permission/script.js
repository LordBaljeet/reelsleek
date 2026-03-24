const grantBtn = document.getElementById("grantBtn");
const hint = document.getElementById("hint");

grantBtn.addEventListener("click", async () => {
  grantBtn.disabled = true;
  grantBtn.textContent = "Waiting for your response…";

  // Must be called directly from the click handler — not via a background message
  const granted = await browser.permissions.request({
    origins: ["*://*.instagram.com/*"],
  });

  if (granted) {
    grantBtn.textContent = "✓ Access granted!";
    grantBtn.classList.add("granted");
    hint.textContent = "You're all set. You can close this tab.";
    hint.classList.add("ok");
    // Close this tab after a short delay
    setTimeout(() => window.close(), 1800);
  } else {
    grantBtn.disabled = false;
    grantBtn.textContent = "Allow access to Instagram";
    hint.textContent = "Permission was denied. ReelSleek won't work without it.";
    hint.classList.add("err");
  }
});