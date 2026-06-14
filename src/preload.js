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
  getRecordingSources: () => ipcRenderer.invoke("recording:get-sources"),
  getScreenAccessStatus: () => ipcRenderer.invoke("recording:get-screen-access-status"),
  openScreenPrivacy: () => ipcRenderer.invoke("recording:open-screen-privacy"),
  selectRecordingRegion: (displayId) => ipcRenderer.invoke("recording:select-region", displayId),
  finishRegionSelection: (region) => ipcRenderer.invoke("region:finish", region),
  cancelRegionSelection: () => ipcRenderer.invoke("region:cancel"),
  saveRecording: (payload) => ipcRenderer.invoke("recording:save", payload),
  showRecordingFile: (filePath) => ipcRenderer.invoke("recording:show-file", filePath),
  getUpdateStatus: (options) => ipcRenderer.invoke("update:get-status", options),
  runUpdate: () => ipcRenderer.invoke("update:run"),
  restartApp: () => ipcRenderer.invoke("app:restart"),
  onRegionInit: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("region:init", listener);
    return () => ipcRenderer.removeListener("region:init", listener);
  },
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
