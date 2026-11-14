// Native shell for the published SSR app, not a file:// Vite bundle.
const { app, BrowserWindow, session, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { startUpdater } = require("./updater.cjs");
const { watchStartup } = require("./startup.cjs");
const { GUEST_PARTITION, SHELL_PARTITION, PROMPT_PERMISSIONS, websiteUrl, trustedSender, permissionOrigin, guestPreferences, stripFrameBlocking } = require("./security.cjs");

const { startupUrl } = require("./address.cjs");
const START_URL = startupUrl(process.env.HELM_URL, process.argv.includes("--helm-dev"), app.isPackaged);
const BLOCKLIST = [
  "doubleclick.net", "googlesyndication.com", "google-analytics.com", "googletagmanager.com",
  "adservice.google.com", "facebook.net", "connect.facebook.net", "scorecardresearch.com",
  "adnxs.com", "taboola.com", "outbrain.com", "criteo.com", "hotjar.com", "amazon-adsystem.com",
  "ads-twitter.com", "quantserve.com", "moatads.com", "pubmatic.com", "rubiconproject.com",
];
let shieldOn = true;
let win;
let desktopUpdater;
const externalWindows = new Set();
app.setName("Helm");

function blocked(url) {
  try {
    const h = new URL(url).hostname;
    return BLOCKLIST.some((d) => h === d || h.endsWith("." + d));
  } catch { return false; }
}

function installShield(ses) {
  ses.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, cb) => {
    if (shieldOn && blocked(details.url)) {
      if (win && !win.isDestroyed()) win.webContents.send("helm:blocked", 1);
      return cb({ cancel: true });
    }
    cb({});
  });
  // Strip third-party tracking headers and send Do-Not-Track / GPC.
  ses.webRequest.onBeforeSendHeaders((d, cb) => {
    const h = d.requestHeaders;
    if (shieldOn) { h["DNT"] = "1"; h["Sec-GPC"] = "1"; }
    cb({ requestHeaders: h });
  });
  // Frame proxy for documents inside webviews/frames; HTTPS, certificates and cookies stay native.
  ses.webRequest.onHeadersReceived((d, cb) => {
    if (d.resourceType !== "mainFrame" && d.resourceType !== "subFrame") return cb({});
    cb({ responseHeaders: stripFrameBlocking(d.responseHeaders) });
  });
}

function installPermissions(ses) {
  // Grants are origin + requesting webContents scoped, and disappear on relaunch.
  const grants = new Map();
  const key = (contents, origin, permission) => `${contents.id}:${origin}:${permission}`;
  ses.setPermissionCheckHandler((contents, permission, origin) => {
    if (!contents) return false;
    const secureOrigin = permissionOrigin(origin);
    if (!secureOrigin) return false;
    return permission === "fullscreen" || grants.get(key(contents, secureOrigin, permission)) === true;
  });
  ses.setPermissionRequestHandler(async (contents, permission, callback, details) => {
    const origin = permissionOrigin(details.requestingUrl || contents.getURL());
    if (!origin) return callback(false);
    if (permission === "fullscreen") return callback(true);
    if (!PROMPT_PERMISSIONS.has(permission)) return callback(false);
    const grantKey = key(contents, origin, permission);
    if (grants.has(grantKey)) return callback(grants.get(grantKey));
    const labels = { media: "kamera/mikrofon", geolocation: "plats", notifications: "aviseringar", "clipboard-read": "urklipp" };
    try {
      const parent = contents.getOwnerBrowserWindow() || win;
      if (!parent || parent.isDestroyed()) return callback(false);
      const result = await dialog.showMessageBox(parent, {
        type: "question", title: "Webbplatsbehörighet", message: `${origin} begär åtkomst till ${labels[permission]}.`,
        buttons: ["Neka", "Tillåt"], defaultId: 0, cancelId: 0, noLink: true,
      });
      const allowed = result.response === 1 && !contents.isDestroyed() && permissionOrigin(contents.getURL()) === origin;
      grants.set(grantKey, allowed);
      callback(allowed);
    } catch { callback(false); }
  });
}

function openWebsite(raw) {
  const url = websiteUrl(raw);
  if (!url) return;
  const external = new BrowserWindow({
    width: 1200, height: 800, title: "Helm", autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, partition: GUEST_PARTITION },
  });
  externalWindows.add(external);
  external.on("closed", () => externalWindows.delete(external));
  external.webContents.setWindowOpenHandler(({ url: popup }) => {
    // Preserve opener-based login flows only inside the unprivileged guest session.
    if (!websiteUrl(popup)) return { action: "deny" };
    return { action: "allow", overrideBrowserWindowOptions: {
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, partition: GUEST_PARTITION },
    } };
  });
  external.webContents.on("will-navigate", (event, next) => { if (!websiteUrl(next)) event.preventDefault(); });
  external.loadURL(url).catch(() => { /* Chromium displays its native network error with reload. */ });
}

function createShell() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    title: "Helm", autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true,
      webSecurity: true, partition: SHELL_PARTITION,
    },
  });
  const shell = win;
  shell.on("closed", () => { if (win === shell) win = undefined; });
  shell.webContents.setWindowOpenHandler(({ url }) => { openWebsite(url); return { action: "deny" }; });
  shell.webContents.on("will-navigate", (event, url) => {
    if (!websiteUrl(url) || new URL(url).origin !== new URL(START_URL).origin) { event.preventDefault(); openWebsite(url); }
  });
  shell.webContents.on("will-attach-webview", (event, preferences, params) => {
    if (!websiteUrl(params.src) || params.partition !== GUEST_PARTITION) return event.preventDefault();
    guestPreferences(preferences);
  });
  const startup = watchStartup({
    load: () => shell.loadURL(START_URL),
    recover: async (reason) => {
      if (shell.isDestroyed()) return;
      const messages = {
        network: "Helm kunde inte ansluta. Kontrollera internetanslutningen.",
        timeout: "Helms startsida kunde inte öppnas. Försök igen eller öppna Helm i din vanliga webbläsare.",
        crash: "Helm stängdes oväntat. Försök öppna startsidan igen.",
      };
      const result = await dialog.showMessageBox(shell, {
        type: "error", title: "Helm", message: messages[reason] || messages.timeout,
        detail: "Dina sparade arbetsytor och flikar raderas inte.",
        buttons: ["Försök igen", "Öppna i webbläsare", "Stäng"], defaultId: 0, cancelId: 2,
      });
      if (shell.isDestroyed()) return;
      if (result.response === 0) startup.start();
      else {
        if (result.response === 1) {
          const { shell: systemShell } = require("electron");
          try { await systemShell.openExternal(START_URL); }
          catch {
            await dialog.showMessageBox(shell, { type: "error", title: "Helm", message: "Webbläsaren kunde inte öppnas. Försök starta Helm igen.", buttons: ["OK"] });
          }
        }
        shell.close();
      }
    },
  });
  const ready = (event) => { if (trustedSender(event, shell, START_URL)) startup.ready(); };
  ipcMain.on("helm:home-ready", ready);
  shell.on("closed", () => { startup.dispose(); ipcMain.removeListener("helm:home-ready", ready); });
  shell.webContents.on("render-process-gone", () => { void startup.fail("crash"); });
  shell.webContents.on("unresponsive", () => { void startup.fail("timeout"); });
  startup.start();
}

app.on("web-contents-created", (_event, contents) => {
  if (contents.getType() !== "webview") return;
  // Popups stay in isolated native windows; never execute guest URLs in the shell.
  contents.setWindowOpenHandler(({ url }) => { openWebsite(url); return { action: "deny" }; });
  contents.on("will-navigate", (event, url) => { if (!websiteUrl(url)) event.preventDefault(); });
});

app.whenReady().then(() => {
  const guest = session.fromPartition(GUEST_PARTITION);
  guest.setUserAgent(guest.getUserAgent().replace(/\sElectron\/\S+/g, "").replace(/\sHelm\/\S+/g, ""));
  installShield(guest);
  installPermissions(guest);
  // The published application cannot request guest website/device permissions.
  const shell = session.fromPartition(SHELL_PARTITION);
  shell.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  shell.setPermissionCheckHandler(() => false);
  ipcMain.handle("helm:desktop-info", (event) => {
    if (!trustedSender(event, win, START_URL)) return null;
    return { version: app.getVersion(), platform: process.platform, arch: process.arch };
  });
  ipcMain.handle("helm:update-state", (event) => trustedSender(event, win, START_URL) ? desktopUpdater?.getState() ?? null : null);
  shell.on("will-download", (_event, item, contents) => {
    if (!win || win.isDestroyed() || contents !== win.webContents) {
      item.cancel();
      return;
    }
    const parent = win;
    // Chromium's save dialog owns the destination; do not execute or replace the app automatically.
    item.setSaveDialogOptions({ title: "Spara Helm-uppdateringen", buttonLabel: "Spara", defaultPath: item.getFilename() });
    item.once("done", (_done, state) => {
      if (parent.isDestroyed() || state === "cancelled") return;
      void dialog.showMessageBox(parent, {
        type: state === "completed" ? "info" : "error", title: "Helm",
        message: state === "completed" ? "Nedladdningen är klar. Helm är inte uppdaterat ännu." : "Nedladdningen misslyckades. Försök igen.",
        detail: state === "completed" ? `${item.getSavePath()}\nAvsluta Helm, packa upp filen och ersätt den gamla appen. Starta sedan den nya appen. Radera inte Helms användardata.` : "Den installerade appen har inte ändrats.",
        buttons: ["OK"],
      }).catch(() => {});
    });
  });
  ipcMain.on("helm:shield", (event, on) => {
    if (trustedSender(event, win, START_URL) && typeof on === "boolean") shieldOn = on;
  });
  ipcMain.on("helm:open-window", (event, raw) => {
    if (trustedSender(event, win, START_URL) && typeof raw === "string") openWebsite(raw);
  });
  createShell();
  if (app.isPackaged && fs.existsSync(path.join(process.resourcesPath, "app-update.yml"))) {
    desktopUpdater = startUpdater({ app, updater: require("electron-updater").autoUpdater, hasFeed: true,
      notify: (state) => { if (win && !win.isDestroyed()) win.webContents.send("helm:update-state", state); },
    });
  }
  app.on("activate", () => { if (!win || win.isDestroyed()) createShell(); else win.focus(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("will-quit", () => desktopUpdater?.dispose());
