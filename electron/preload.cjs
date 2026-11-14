const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("helm", {
  cleanHomeOnLaunch: true,
  getDesktopInfo: () => ipcRenderer.invoke("helm:desktop-info"),
  getUpdateState: () => ipcRenderer.invoke("helm:update-state"),
  onUpdateState: (cb) => {
    const listener = (_event, state) => cb(state);
    ipcRenderer.on("helm:update-state", listener);
    return () => ipcRenderer.removeListener("helm:update-state", listener);
  },
  homeReady: () => ipcRenderer.send("helm:home-ready"),
  openWindow: (url) => ipcRenderer.send("helm:open-window", url),
  onBlocked: (cb) => {
    const listener = (_e, n) => cb(n);
    ipcRenderer.on("helm:blocked", listener);
    return () => ipcRenderer.removeListener("helm:blocked", listener);
  },
  setShield: (on) => ipcRenderer.send("helm:shield", on),
});
