// Only packaged, supported installs with builder-generated feed metadata can update.
function startUpdater({ app, updater, hasFeed, notify, setIntervalFn = setInterval, clearIntervalFn = clearInterval }) {
  let state = { status: "disabled", version: null, percent: null };
  let busy = false;
  const listeners = [];
  const emit = (next) => { state = { ...state, ...next }; notify(state); };
  const on = (name, handler) => { updater.on(name, handler); listeners.push([name, handler]); };
  if (!app.isPackaged || !hasFeed || !["darwin", "win32"].includes(process.platform)) {
    return { getState: () => state, dispose: () => {} };
  }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  state.status = "checking";
  on("checking-for-update", () => emit({ status: "checking", percent: null }));
  on("update-available", (info) => emit({ status: "downloading", version: info.version, percent: 0 }));
  on("download-progress", (progress) => emit({ status: "downloading", percent: Math.round(progress.percent) }));
  on("update-not-available", () => emit({ status: "current", version: app.getVersion(), percent: null }));
  on("update-downloaded", (info) => emit({ status: "ready", version: info.version, percent: 100 }));
  on("error", (error) => {
    console.error("Helm desktop update failed:", error.message);
    emit({ status: "error", percent: null });
  });
  const check = async () => {
    if (busy || state.status === "ready" || state.status === "downloading") return;
    busy = true;
    try { await updater.checkForUpdates(); }
    catch (error) { console.error("Helm desktop update check failed:", error.message); emit({ status: "error" }); }
    finally { busy = false; }
  };
  void check();
  const timer = setIntervalFn(() => { void check(); }, 4 * 60 * 60 * 1000);
  return { getState: () => state, dispose: () => { clearIntervalFn(timer); listeners.forEach(([name, handler]) => updater.removeListener(name, handler)); } };
}
module.exports = { startUpdater };