const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("overlayApp", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (partial) => ipcRenderer.invoke("settings:update", partial),
  resetSettings: () => ipcRenderer.invoke("settings:reset"),
  toggleOverlay: () => ipcRenderer.invoke("window:toggle-overlay"),
  togglePrompter: () => ipcRenderer.invoke("window:toggle-prompter"),
  resetPositions: () => ipcRenderer.invoke("window:reset-positions"),
  prompterCommand: (command) => ipcRenderer.invoke("prompter:command", command),
  getCameraAccessStatus: () => ipcRenderer.invoke("camera:get-access-status"),
  requestCameraAccess: () => ipcRenderer.invoke("camera:request-access"),
  openCameraPrivacy: () => ipcRenderer.invoke("camera:open-privacy"),
  onSettingsChanged: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on("settings:changed", listener);
    return () => ipcRenderer.removeListener("settings:changed", listener);
  },
  onPrompterCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("prompter:command", listener);
    return () => ipcRenderer.removeListener("prompter:command", listener);
  }
});
