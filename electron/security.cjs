const GUEST_PARTITION = "persist:helm";
const SHELL_PARTITION = "persist:helm-shell";
const PROMPT_PERMISSIONS = new Set(["media", "geolocation", "notifications", "clipboard-read"]);

function websiteUrl(raw) {
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function trustedSender(event, win, startUrl) {
  return !!win && !win.isDestroyed() && event.sender === win.webContents &&
    event.senderFrame === win.webContents.mainFrame &&
    new URL(event.senderFrame.url).origin === new URL(startUrl).origin;
}

function permissionOrigin(raw) {
  const url = websiteUrl(raw);
  return url && new URL(url).protocol === "https:" ? new URL(url).origin : null;
}

function guestPreferences(preferences) {
  delete preferences.preload;
  delete preferences.preloadURL;
  Object.assign(preferences, {
    nodeIntegration: false, nodeIntegrationInSubFrames: false,
    nodeIntegrationInWorker: false, contextIsolation: true, sandbox: true,
    webSecurity: true, allowRunningInsecureContent: false, webviewTag: false,
    partition: GUEST_PARTITION,
  });
}

// Native frame proxy: remove embedding denials so frame-blocked sites render inside Helm.
// Only frame-embedding directives are removed; every other security header is preserved.
function stripFrameBlocking(headers) {
  const out = {};
  for (const [name, value] of Object.entries(headers || {})) {
    const lower = name.toLowerCase();
    if (lower === "x-frame-options") continue;
    if (lower === "content-security-policy") {
      const kept = [].concat(value).map((v) => String(v).split(";").map((d) => d.trim())
        .filter((d) => d && !/^frame-ancestors(\s|$)/i.test(d)).join("; ")).filter(Boolean);
      if (kept.length) out[name] = kept;
      continue;
    }
    out[name] = value;
  }
  return out;
}

module.exports = { stripFrameBlocking, GUEST_PARTITION, SHELL_PARTITION, PROMPT_PERMISSIONS, websiteUrl, trustedSender, permissionOrigin, guestPreferences };